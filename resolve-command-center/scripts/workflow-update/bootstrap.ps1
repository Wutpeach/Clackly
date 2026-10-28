[CmdletBinding()]
param(
    [string]$Archive = '',
    [ValidateSet('Install','Recover','Inspect','RestorePrevious')][string]$Operation = 'Install',
    [ValidatePattern('^[a-f0-9]{32}$')][string]$TransactionId = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'ExecutorSupport.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'LocalNative.psm1') -Force -DisableNameChecking

# Explicit local bootstrap. Updates never execute scripts selected by a payload.
# No elevation and no arbitrary target/native/host flags.
$scan=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins'
$transactions=$scan+'.Clackly Updates'
$target=Join-Path $scan 'com.wutpeach.clackly'
$hostPair=Get-ResolveHostPair
if ($Operation -eq 'Install') {
    $archivePath=Assert-NormalPath $Archive
    $request=Get-OfficialArchiveRequest $archivePath
    if ((Read-Host 'Install Clackly from this verified local package? Type INSTALL to continue') -cne 'INSTALL') { return }
    $id=[Guid]::NewGuid().ToString('N')
    $context=@{Id=$id;ScanRoot=$scan;TransactionRoot=$transactions;Target=$target;Version=$request.version;
        Digest=$request.digest;Size=$request.size;PackageRoot=(Join-Path $transactions ($id+'.payload'));InitialInstall=$true;
        ResolveExecutable=$hostPair.ResolveExecutable;WorkflowExecutable=$hostPair.WorkflowExecutable}
    Write-Host 'Exit Resolve yourself to continue. Before replacement starts, Ctrl+C stops this console installer. Once replacement starts, wait; use the recorded transaction for recovery after interruption.'
    if (!(Wait-UpdateHostExit $context { $false })) { return }
    Assert-NormalPath $scan -AllowMissing | Out-Null
    [IO.Directory]::CreateDirectory($scan) | Out-Null
    Assert-NormalPath $transactions -AllowMissing | Out-Null
    [IO.Directory]::CreateDirectory($transactions) | Out-Null
    Write-ExecutorJson (Join-Path $transactions ($id+'.bootstrap')) @{id=$id;version=$context.Version;digest=$context.Digest;size=$context.Size}
    Expand-UpdateArchive $archivePath $context.PackageRoot $request.digest $request.size
    $manifest=Assert-UpdatePackage $context.PackageRoot $request.version
    Assert-PublishedUpdatePackage $manifest
    Write-Host ('Recovery transaction: '+$id)
    $result=Invoke-UpdateTransaction $context
} else {
    if (!$TransactionId -or $Archive) { throw 'target-unverified' }
    $pointer=Read-UpdateJson (Join-Path $transactions ($TransactionId+'.bootstrap')) 65536
    if ($pointer.id -cne $TransactionId -or $pointer.version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
        $pointer.digest -cnotmatch '^[a-f0-9]{64}$' -or $pointer.size -le 0) { throw 'recovery-required' }
    $context=@{Id=$TransactionId;ScanRoot=$scan;TransactionRoot=$transactions;Target=$target;Version=$pointer.version;
        Digest=$pointer.digest;Size=$pointer.size;PackageRoot='';InitialInstall=$true;
        ResolveExecutable=$hostPair.ResolveExecutable;WorkflowExecutable=$hostPair.WorkflowExecutable}
    $result=if ($Operation -eq 'Inspect') {Get-UpdateTransactionState $context}
        elseif ($Operation -eq 'RestorePrevious') {Restore-PreviousUpdate $context}
        else {Invoke-UpdateRecovery $context}
}
$result | ConvertTo-Json -Compress
if ($result.status -eq 'failed') { exit 1 }
