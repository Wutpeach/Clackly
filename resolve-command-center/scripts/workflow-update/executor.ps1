param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$RequestId,
    [ValidateSet('Install','Recover','Restore','Inspect')][string]$Operation = 'Install',
    [string]$CandidateKey = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$result = @{id=$RequestId;status='failed';reason='target-unverified'}
$requestValidated = $false; $inspectionValidated = $false
try {
    Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -Force -DisableNameChecking
    Import-Module (Join-Path $PSScriptRoot 'ExecutorSupport.psm1') -Force -DisableNameChecking
    $locations = Get-ExecutorLocations $RequestId
    Assert-InstalledExecutor $PSScriptRoot $locations $Operation $RequestId
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    $elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($elevated) { Assert-ProtectedExecutor $PSScriptRoot }
    $requestRoot = Assert-NormalPath $locations.Request
    $request = Read-UpdateJson (Join-Path $requestRoot 'request.json') 65536
    if ($request.schemaVersion -ne 1 -or $request.id -cne $RequestId -or
        $request.version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
        $request.digest -cnotmatch '^[a-f0-9]{64}$' -or $request.size -le 0 -or $request.size -gt 1073741824 -or
        $request.releaseId -le 0 -or $request.assetId -le 0) { throw 'invalid-package' }
    $requestValidated = $true
    if ($Operation -eq 'Install' -and $CandidateKey -cne (Get-UpdateRequestKey $request)) { throw 'invalid-package' }
    # Main-supplied host image is read-only process observation, never code to run.
    $workflow = Assert-NormalPath $request.workflowExecutable
    if ((Split-Path -Leaf $workflow) -ine 'electron.exe' -or (Split-Path -Leaf (Split-Path -Parent $workflow)) -ine 'Electron') { throw 'process-unknown' }
    $resolve = Join-Path (Split-Path -Parent (Split-Path -Parent $workflow)) 'Resolve.exe'
    Assert-NormalPath $resolve | Out-Null
    $workRoot = Join-Path $locations.Transactions ($RequestId + '.executor')
    $context = @{Id=$RequestId;ScanRoot=$locations.Scan;TransactionRoot=$locations.Transactions;Target=$locations.Target;
        Version=$request.version;Digest=$request.digest;Size=$request.size;PackageRoot=(Join-Path $workRoot 'payload');
        ResolveExecutable=$resolve;WorkflowExecutable=$workflow}
    $journal = Join-Path $locations.Transactions ($RequestId + '.json')
    $cancelled = { Test-Path -LiteralPath (Join-Path $requestRoot 'cancel.request') }
    if ($Operation -eq 'Inspect') {
        $launcher = Read-UpdateJson (Join-Path $requestRoot 'launcher.json') 65536
        if ($launcher.id -cne $RequestId -or $launcher.pid -le 0) { throw 'recovery-required' }
        $running = Get-Process -Id $launcher.pid -ErrorAction SilentlyContinue
        if ($running -and $running.StartTime.ToUniversalTime().ToString('o') -ceq $launcher.created) { throw 'recovery-required' }
        # Result strings never establish installed/rollback success. Reconcile
        # actual journal and all old/new bytes under the transaction lock.
        if (Test-Path -LiteralPath $journal) { $result = Get-UpdateTransactionState $context }
        else {
            $result = Read-UpdateJson (Join-Path $requestRoot 'result.json') 65536
            if ($result.id -cne $RequestId -or $result.status -cnotin @('cancelled','failed')) { throw 'recovery-required' }
            if ((Get-TreeHash $locations.Target) -cne $result.oldHash) { throw 'recovery-required' }
            foreach ($suffix in @('.stage','.backup','.failed','.json.next')) {
                if (Test-Path -LiteralPath (Join-Path $locations.Transactions ($RequestId + $suffix))) { throw 'recovery-required' }
            }
        }
        $inspectionValidated = $true
    } elseif ($Operation -eq 'Recover') {
        $result = Invoke-UpdateRecovery $context
    } elseif ($Operation -eq 'Restore') {
        $result = Restore-PreviousUpdate $context
    } else {
        # Re-resolve official metadata in THIS process, including after UAC.
        Assert-OfficialRelease $request
        $oldHash = Get-TreeHash $locations.Target
        if (!(Wait-UpdateHostExit $context $cancelled)) { $result = @{status='cancelled';reason=$null;oldHash=$oldHash} }
        else {
            Assert-UpdateWriteAccess $locations.Target $locations.Scan
            Assert-NormalPath $locations.Transactions -AllowMissing | Out-Null
            [IO.Directory]::CreateDirectory($locations.Transactions) | Out-Null
            if ($elevated) { Assert-ProtectedExecutor $locations.Transactions -DirectoryOnly }
            Assert-NormalPath $workRoot -AllowMissing | Out-Null
            if (Test-Path -LiteralPath $workRoot) { throw 'recovery-required' }
            [IO.Directory]::CreateDirectory($workRoot) | Out-Null
            $archive = Join-Path $workRoot 'candidate.zip'
            # Copy inert bytes before hashing/extracting. A swap during UAC
            # fails the freshly fetched official digest/full archive checks.
            Assert-NormalPath (Join-Path $requestRoot 'candidate.zip') | Out-Null
            [IO.File]::Copy((Join-Path $requestRoot 'candidate.zip'),$archive,$false)
            Expand-UpdateArchive $archive $context.PackageRoot $request.digest $request.size
            $manifest = Assert-UpdatePackage $context.PackageRoot $request.version
            Assert-PublishedUpdatePackage $manifest
            $result = Invoke-UpdateTransaction $context -Cancelled $cancelled -Checkpoint {param($point)
                if ($point -ceq 'backup-intent') {
                    Write-ExecutorJson (Join-Path $requestRoot 'installing.json') @{id=$RequestId;status='installing'}
                }
            }
            if (!(Test-Path -LiteralPath $journal)) { $result.oldHash = $oldHash }
        }
    }
} catch {
    $reason = Get-UpdateFailureReason $_
    if ($reason -cnotin @('publisher-unverified','host-unqualified','target-unverified','permission-denied','permission-cancelled',
        'process-unknown','host-running','concurrent-install','recovery-required','native-missing','native-invalid','native-incompatible','invalid-package')) { $reason = 'install-failed' }
    $result = @{status='failed';reason=$reason}
    if ($requestValidated) { try { $result.oldHash = Get-TreeHash $locations.Target } catch {} }
}
$result.id = $RequestId
if ($requestValidated -and $Operation -ne 'Inspect') {
    $name = if ($Operation -in @('Recover','Restore')) { 'recovery-result.json' } else { 'result.json' }
    Write-ExecutorJson (Join-Path $requestRoot $name) $result
}
$result | ConvertTo-Json -Compress
if ($result.status -eq 'failed' -and !$inspectionValidated) { exit 1 }
