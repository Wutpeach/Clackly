Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'LocalNative.psm1') -Force -DisableNameChecking
$evidence=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../build/test-evidence/native-provider'))
$root=Join-Path $evidence ([Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
[IO.File]::WriteAllText((Join-Path $root '.test-owner'),'INERT FIXTURE ONLY; NEVER QUALIFIED FOR PRODUCTION')
function Check($Value,[string]$Message) {if (!$Value) {throw $Message}}
function New-Case([string]$Name) {
    $case=Join-Path $root $Name
    $source=Join-Path $case 'ProgramData/Blackmagic Design/DaVinci Resolve/Support/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node'
    [IO.Directory]::CreateDirectory((Split-Path -Parent $source)) | Out-Null
    $stage=Join-Path $case 'stage'
    [IO.Directory]::CreateDirectory((Join-Path $stage 'workflow-plugin')) | Out-Null
    $bytes=[byte[]]::new(128); $bytes[0]=77; $bytes[1]=90; $bytes[60]=64
    $bytes[64]=80; $bytes[65]=69; $bytes[68]=100; $bytes[69]=134; $bytes[86]=2; $bytes[87]=32; $bytes[88]=11; $bytes[89]=2
    [IO.File]::WriteAllBytes($source,$bytes)
    return @{Root=$case;Source=$source;Stage=$stage}
}
function Refuses($Fixture,[string]$Reason,[scriptblock]$Signature={},[scriptblock]$Compatibility={}) {
    $accepted=$false
    try { Copy-LocalResolveNative $Fixture.Stage 'D:\Resolve\Electron\electron.exe' -Source {$Fixture.Source} -Signature $Signature -Compatibility $Compatibility | Out-Null; $accepted=$true }
    catch {Check ($_.Exception.Message -ceq $Reason) ('wrong reason: '+$_.Exception.Message)}
    Check (!$accepted) ('accepted '+$Reason)
}
foreach ($drive in @('D','E')) {
    $f=New-Case ('host-'+$drive)
    $workflow=$drive+':\Installed Resolve\Electron\electron.exe'
    $script:observed=''
    $oldProgramData=$env:PROGRAMDATA
    try {
    $env:PROGRAMDATA=Join-Path $f.Root 'ProgramData'
    $native=Copy-LocalResolveNative $f.Stage $workflow -Signature {
        param($file)
        $writable=$false
        try {[IO.File]::WriteAllText($file,'CHANGED');$writable=$true} catch {}
        Check (!$writable) 'signature race could write staged bytes'
    } -Compatibility {param($file,$hostImage) $script:observed=$hostImage}
    } finally {$env:PROGRAMDATA=$oldProgramData}
    $file=Join-Path $f.Stage $native.path
    Check ([IO.Path]::GetPathRoot($f.Source) -ieq [IO.Path]::GetPathRoot($PSScriptRoot)) 'environment fixture not on current source volume'
    Check ($script:observed -ceq $workflow -and $native.sha256 -ceq (Get-UpdateHash $f.Source) -and $native.size -eq 128) 'independent ProgramData/host path or actual byte identity'
    Check (((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReadOnly) -ne 0) 'staged native not read-only'
    Write-Output ('PASS independent-programdata-'+$drive+'-host-with-explicit-test-observations')
}
$f=New-Case 'missing'; [IO.File]::Delete($f.Source); Refuses $f 'native-missing'; Write-Output 'PASS missing-source'
$f=New-Case 'corrupt'; [IO.File]::WriteAllText($f.Source,'NOT PE'); Refuses $f 'native-invalid'; Write-Output 'PASS corrupt-source'
$f=New-Case 'x86'; $bytes=[IO.File]::ReadAllBytes($f.Source); $bytes[68]=76; $bytes[69]=1; [IO.File]::WriteAllBytes($f.Source,$bytes); Refuses $f 'native-invalid'; Write-Output 'PASS x86-refused'
$f=New-Case 'not-dll'; $bytes=[IO.File]::ReadAllBytes($f.Source); $bytes[87]=0; [IO.File]::WriteAllBytes($f.Source,$bytes); Refuses $f 'native-invalid'; Write-Output 'PASS non-dll-refused'
$f=New-Case 'signature'; Refuses $f 'native-invalid' -Signature {throw 'native-invalid'}; Write-Output 'PASS invalid-signature'
$f=New-Case 'compatibility'; Refuses $f 'native-incompatible' -Compatibility {throw 'native-incompatible'}; Write-Output 'PASS incompatible-or-unprovable-host'
$f=New-Case 'hardlink'; New-Item -ItemType HardLink -Path (Join-Path $f.Root 'other.node') -Target $f.Source | Out-Null; Refuses $f 'native-invalid'; Write-Output 'PASS hardlinked-source'
$f=New-Case 'reparse'; $original=Split-Path -Parent $f.Source; $moved=$original+'.retained'; [IO.Directory]::Move($original,$moved); New-Item -ItemType Junction -Path $original -Target $moved | Out-Null; Refuses $f 'native-invalid'; Write-Output 'PASS reparse-source'
$f=New-Case 'production-inert'; $accepted=$false
try {Copy-LocalResolveNative $f.Stage 'D:\Resolve\Electron\electron.exe' -Source {$f.Source} | Out-Null; $accepted=$true}
catch {Check ($_.Exception.Message -ceq 'native-invalid') 'inert production rejection reason'}
Check (!$accepted) 'inert fixture gained production trust'
Write-Output 'PASS inert-fixture-never-production-qualified'
Write-Output ('EVIDENCE '+$root)
