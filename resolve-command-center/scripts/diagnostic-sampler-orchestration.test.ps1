param([Parameter(Mandatory = $true)][string]$SamplerPath,
      [Parameter(Mandatory = $true)][string]$FixtureRoot,
      [Parameter(Mandatory = $true)][string]$Scenario)

# Test-only harness: interactive/process/host boundaries are simulated. Cache,
# registry snapshots (HKCU only), JSON, and ZIP operations use real PS 5.1 APIs.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'This regression requires Windows PowerShell 5.1.' }
# The Node test runner may inherit PowerShell 7's module path. Load the Windows
# built-in utility module explicitly to match the extracted CMD/PS 5.1 host.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility') -Force
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($SamplerPath, [ref]$tokens, [ref]$parseErrors)
if (@($parseErrors).Count -gt 0) { throw 'Sampler parse failed.' }
# Load definitions and constants, never the product entrypoint or self-test.
foreach ($statement in $ast.EndBlock.Statements) {
  if ($statement -is [System.Management.Automation.Language.FunctionDefinitionAst] -or
      $statement -is [System.Management.Automation.Language.AssignmentStatementAst]) {
    if ($statement.Extent.Text.StartsWith('$run =')) { continue }
    Invoke-Expression $statement.Extent.Text
  }
}
$env:APPDATA = Join-Path $FixtureRoot 'simulated appdata'
$env:LOCALAPPDATA = Join-Path $FixtureRoot 'simulated localappdata'
if ($Scenario -eq 'profiles') {
  # Redirect only fixed Windows folder boundaries to fixtures; exercise the real
  # manifest iteration, version-derived ABI name, file reads and SHA-256 hashing.
  $plugin = Join-Path $FixtureRoot 'Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly'
  $runtimeRoot = Join-Path $plugin 'resources\runtimes'
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  $resolverDirectory = Join-Path $plugin 'script-runtime\runtime'
  New-Item -ItemType Directory -Path $resolverDirectory -Force | Out-Null
  Write-Utf8File -Path (Join-Path $resolverDirectory 'resolver.js') -Text 'SIMULATION resolver'
  $appRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $SamplerPath))
  $runtimeManifest = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $appRoot 'resources\runtimes\manifest.json') -Raw | ConvertFrom-Json
  Write-JsonFile -Path (Join-Path $runtimeRoot 'manifest.json') -Value $runtimeManifest
  foreach ($profile in $runtimeManifest.profiles) {
    $executable = Join-Path $runtimeRoot $profile.executable
    $directory = Split-Path -Parent $executable
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Write-Utf8File -Path $executable -Text ('SIMULATION exe ' + $profile.runtimeVersion)
    $version = [Version]$profile.runtimeVersion
    Write-Utf8File -Path (Join-Path $directory ('python' + $version.Major + $version.Minor + '.dll')) -Text ('SIMULATION dll ' + $profile.runtimeVersion)
  }
  $body = ${function:Get-PluginEvidence}.ToString().Replace('[Environment]::GetFolderPath("CommonApplicationData")', '$FixtureRoot').Replace('[Environment]::GetFolderPath("ProgramFiles")', '$FixtureRoot')
  & ([scriptblock]::Create($body)) | ConvertTo-Json -Depth 10 -Compress
  exit 0
}
$OutputRoot = Join-Path $FixtureRoot 'output'
$Elevated = $false; $EnableDumps = $Scenario -in @('dump', 'empty-dump', 'dump-zip-failure', 'wer-failure')
$cacheDirectory = Join-Path $env:APPDATA 'Clackly'
$cachePath = Join-Path $cacheDirectory 'runtime-probe.json'
$recoveryPath = Join-Path $OutputRoot 'recovery.json'
New-Item -ItemType Directory -Path $cacheDirectory, $OutputRoot -Force | Out-Null
$originalCache = '{"schemaVersion":1,"result":{"ok":true,"probeStatus":"passed","effectiveStatus":"ready"},"fixture":"original simulation"}'
if ($Scenario -ne 'absent-cache') { Write-Utf8File -Path $cachePath -Text $originalCache }
Write-Utf8File -Path (Join-Path $cacheDirectory 'clackly.log') -Text ($env:USERPROFILE + ' simulated log')

function Confirm-NoResidualProcesses { return $true }
function Get-PluginEvidence { throw 'Simulated installation read failure: other evidence must continue.' }
function Get-WindowEvents { return @((New-Result -Name 'simulated-event-boundary' -Status 'skipped')) }
function Test-DiagnosticAdministrator { return $true } # simulation, not real elevation
$originalEnableWer = ${function:Enable-WerDumpCapture}
$testSubKey = 'Software\ClacklyDiagnosticSamplerOrchestrationTest\' + [Guid]::NewGuid().ToString('N')
function Enable-WerDumpCapture {
  param($SubKey, $DumpDirectory, $RecoveryPath)
  if ($SubKey -ne $script:WerSubKey) { throw 'Unexpected production WER boundary.' }
  if ($Scenario -eq 'wer-failure') { return [pscustomobject]@{ snapshot = $null; result = New-Result -Name 'wer-dump' -Status 'error' -Detail 'Simulated HKLM setup denial.' } }
  return & $originalEnableWer -SubKey $testSubKey -DumpDirectory $DumpDirectory -RecoveryPath $RecoveryPath -Hive ([Microsoft.Win32.RegistryHive]::CurrentUser)
}
if ($EnableDumps -and $Scenario -ne 'wer-failure') {
  $base = Get-RegistryBase ([Microsoft.Win32.RegistryHive]::CurrentUser)
  try { $key = $base.CreateSubKey($testSubKey); try { $key.SetValue('DumpType', 2, [Microsoft.Win32.RegistryValueKind]::DWord) } finally { $key.Dispose() } } finally { $base.Dispose() }
}
function Watch-DiagnosticProcesses {
  param($Results)
  if ($Scenario -eq 'previous-recovery-failure') { throw 'Watcher must not run after failed recovery.' }
  if (Test-Path -LiteralPath $cachePath) { throw 'Cache must be isolated before the observation window.' }
  if (!(Test-Path -LiteralPath $recoveryPath)) { throw 'Recovery journal must precede observation.' }
  Write-Utf8File -Path $cachePath -Text '{"schemaVersion":1,"result":{"ok":true,"probeStatus":"passed","effectiveStatus":"ready"},"fixture":"new simulation"}'
  $records = @{}
  if ($Scenario -eq 'absent-cache') {
    Add-ProcessObservations -Records $records -Processes @()
  } else {
    # Synthetic Resolve observation intentionally has no Python.
    Add-ProcessObservations -Records $records -Processes @([pscustomobject]@{ ProcessId = 12; ParentProcessId = 1; Name = 'Resolve.exe'; ExecutablePath = 'C:\simulated\Resolve.exe'; CommandLine = 'simulated Resolve'; CreationDate = 'simulation' })
  }
  if ($Scenario -like 'host-*') {
    $script:ObservedResolveImages = @{}
    $records = @{}
    $resolveRoot = Join-Path $FixtureRoot ('DaVinci ' + [char]0x4e2d + [char]0x6587 + ' 21')
    $moduleRoot = Join-Path $FixtureRoot 'Scripting Modules'
    New-Item -ItemType Directory -Path $resolveRoot, $moduleRoot -Force | Out-Null
    $resolve = Join-Path $resolveRoot 'Resolve.exe'
    $library = Join-Path $resolveRoot 'fusionscript.dll'
    $module = Join-Path $moduleRoot 'DaVinciResolveScript.py'
    Write-Utf8File -Path $resolve -Text 'SIMULATION Resolve executable'
    if ($Scenario -ne 'host-missing-library') { Write-Utf8File -Path $library -Text 'SIMULATION current host library' }
    Write-Utf8File -Path $module -Text 'SIMULATION scripting wrapper'
    $record = [ordered]@{ schemaVersion = 1; source = 'workflow'; resolveExecutable = $resolve; resolveRoot = $resolveRoot; modulePath = $module; libraryPath = $library; scriptingRoot = $moduleRoot; resolvePythonExecutable = $null; discoveredAt = '2026-10-08T08:00:00.000Z'; files = @{ modulePath = @{ path = $module; size = 28; mtimeMs = 1780000000000; secret = 'PRIVATE_METADATA' } }; config = 'PRIVATE_CONFIG'; jsx = 'PRIVATE_JSX'; message = 'PRIVATE_MESSAGE' }
    $diagnostic = [ordered]@{ schemaVersion = 1; status = 'failed'; code = 'RESOLVE_LIBRARY_NOT_FOUND'; stage = 'installation-discovery'; source = 'workflow'; resolveExecutable = $resolve; resolveRoot = $resolveRoot; modulePath = $module; libraryPath = $library; time = '2026-10-08T08:01:00.000Z'; config = 'PRIVATE_CONFIG'; message = 'PRIVATE_MESSAGE'; jsx = 'PRIVATE_JSX'; media = 'PRIVATE_MEDIA' }
    $installationPath = Join-Path $cacheDirectory 'resolve-installation.json'
    Write-JsonFile -Path $installationPath -Value $record
    Write-JsonFile -Path (Join-Path $cacheDirectory 'runtime-diagnostic.json') -Value $diagnostic
    $image = if ($Scenario -eq 'host-unreadable-image') { $null } else { $resolve }
    Add-ProcessObservations -Records $records -Processes @([pscustomobject]@{ ProcessId = 12; ParentProcessId = 1; Name = 'Resolve.exe'; ExecutablePath = $image; CommandLine = 'simulated Resolve'; CreationDate = 'simulation' })
    if ($Scenario -eq 'host-custom') {
      # Losing image access in a later poll must not erase an actual prior observation.
      Add-ProcessObservations -Records $records -Processes @([pscustomobject]@{ ProcessId = 12; ParentProcessId = 1; Name = 'Resolve.exe'; ExecutablePath = $null; CommandLine = 'simulated Resolve'; CreationDate = 'simulation' })
    }
    if ($Scenario -eq 'host-ambiguous') {
      $otherRoot = Join-Path $FixtureRoot 'another installed Resolve'
      New-Item -ItemType Directory -Path $otherRoot -Force | Out-Null
      Write-Utf8File -Path (Join-Path $otherRoot 'Resolve.exe') -Text 'SIMULATION another executable'
      Add-ProcessObservations -Records $records -Processes @([pscustomobject]@{ ProcessId = 13; ParentProcessId = 1; Name = 'Resolve.exe'; ExecutablePath = (Join-Path $otherRoot 'Resolve.exe'); CommandLine = 'simulated Resolve'; CreationDate = 'simulation' })
    }
    if ($Scenario -eq 'host-stale-record') {
      $record.resolveExecutable = 'C:\old installed Resolve\Resolve.exe'
      $record.resolveRoot = 'C:\old installed Resolve'
      $record.libraryPath = 'C:\old installed Resolve\fusionscript.dll'
      Write-JsonFile -Path $installationPath -Value $record
    }
    if ($Scenario -eq 'host-invalid-record') { Write-Utf8File -Path $installationPath -Text '{PRIVATE_JSON_INVALID' }
    if ($Scenario -eq 'host-invalid-path') {
      $record.resolveExecutable = 'D:\invalid|installation\Resolve.exe'
      Write-JsonFile -Path $installationPath -Value $record
    }
    if ($Scenario -eq 'host-oversized-record') { Write-Utf8File -Path $installationPath -Text ('PRIVATE_OVERSIZED' * 5000) }
    if ($Scenario -eq 'host-redacted') { $env:USERPROFILE = (Get-Item -LiteralPath $FixtureRoot).FullName }
    if ($Scenario -eq 'host-denied-library') {
      $script:OriginalFileHash = ${function:Get-FileHash}
      function script:Get-FileHash {
        param($Algorithm, $LiteralPath)
        if ((Split-Path -Leaf $LiteralPath) -eq 'fusionscript.dll') { throw (New-Object System.UnauthorizedAccessException('Simulated library read denial.')) }
        Microsoft.PowerShell.Utility\Get-FileHash -Algorithm $Algorithm -LiteralPath $LiteralPath
      }
    }
    if ($Scenario -eq 'host-denied-record') {
      $script:OriginalRecordReader = ${function:Read-BoundedDiagnosticRecord}
      function script:Read-BoundedDiagnosticRecord {
        param($Path)
        if ((Split-Path -Leaf $Path) -eq 'resolve-installation.json') { throw (New-Object System.UnauthorizedAccessException('Simulated record read denial.')) }
        & $script:OriginalRecordReader -Path $Path
      }
    }
  }
  if ($Scenario -in @('dump', 'dump-zip-failure')) {
    $session = @(Get-ChildItem -LiteralPath $OutputRoot -Directory)[0].FullName
    # Synthetic bytes only: not a real crash dump or evidence of WER capture.
    Write-Utf8File -Path (Join-Path $session 'dumps-sensitive\simulated-python.dmp') -Text 'SIMULATION: not a real mini dump'
  }
  return @($records.Values)
}
if ($Scenario -eq 'previous-recovery-failure') {
  $state = Backup-ProbeCache -CachePath $cachePath -EvidenceDirectory $OutputRoot -RecoveryPath $recoveryPath -SamplerId 'simulation-conflict'
  Write-Utf8File -Path $cachePath -Text '{"fixture":"foreign simulation"}'
}
if ($Scenario -eq 'restore-failure') { function Restore-ProbeCache { param($State, [switch]$RemoveCurrentCache); throw 'Simulated cache restore denial.' } }
$originalZip = ${function:New-DiagnosticZip}
if ($Scenario -in @('normal-zip-failure', 'dump-zip-failure')) {
  function New-DiagnosticZip {
    param($Root, $Destination, [switch]$DumpOnly)
    if (($Scenario -eq 'normal-zip-failure' -and !$DumpOnly) -or ($Scenario -eq 'dump-zip-failure' -and $DumpOnly)) { throw 'Simulated ZIP write denial.' }
    & $originalZip -Root $Root -Destination $Destination -DumpOnly:$DumpOnly
  }
}
try {
  $run = Invoke-DiagnosticSampler -SkipDumpPrompt
  $session = @(Get-ChildItem -LiteralPath $OutputRoot -Directory)[0].FullName
  $manifest = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $session 'manifest.json') -Raw | ConvertFrom-Json
  $ordinary = @(Get-ChildItem -LiteralPath $OutputRoot -Filter '*.zip' -File | Where-Object { $_.Name -notmatch 'DUMPS-SENSITIVE' })
  $sensitive = @(Get-ChildItem -LiteralPath $OutputRoot -Filter '*DUMPS-SENSITIVE*.zip' -File)
  function Read-ZipEntries($Path) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try { return @($zip.Entries | ForEach-Object { $_.FullName }) } finally { $zip.Dispose() }
  }
  $normalEntries = if ($ordinary.Count) { @(Read-ZipEntries $ordinary[0].FullName) } else { @() }
  $dumpEntries = if ($sensitive.Count) { @(Read-ZipEntries $sensitive[0].FullName) } else { @() }
  $registryRestored = $true
  if ($EnableDumps -and $Scenario -ne 'wer-failure') {
    $base = Get-RegistryBase ([Microsoft.Win32.RegistryHive]::CurrentUser)
    try { $key = $base.OpenSubKey($testSubKey); try { $registryRestored = $key.GetValue('DumpType') -eq 2 -and @($key.GetValueNames()).Count -eq 1 } finally { $key.Dispose() } } finally { $base.Dispose() }
  }
  [pscustomobject]@{
    scenario = $Scenario; powerShell = $PSVersionTable.PSVersion.ToString(); exitCode = $run.ExitCode
    requiresElevation = $run.RequiresElevation; manifest = $manifest
    ordinaryCount = $ordinary.Count; sensitiveCount = $sensitive.Count
    normalEntries = @($normalEntries); dumpEntries = @($dumpEntries)
    cacheExists = Test-Path -LiteralPath $cachePath
    cacheText = if (Test-Path -LiteralPath $cachePath) { [System.IO.File]::ReadAllText($cachePath) } else { $null }
    recoveryExists = Test-Path -LiteralPath $recoveryPath
    quarantineCount = @([System.IO.Directory]::GetFiles($cacheDirectory, '*quarantine*')).Count
    registryRestored = $registryRestored
    recordEvidence = @(Get-ChildItem -LiteralPath $session -Filter '*.json' -File | Where-Object { $_.Name -in @('resolve-installation.json', 'runtime-diagnostic.json') } | ForEach-Object { [System.IO.File]::ReadAllText($_.FullName) })
    sourceInstallation = if (Test-Path -LiteralPath (Join-Path $cacheDirectory 'resolve-installation.json')) { [System.IO.File]::ReadAllText((Join-Path $cacheDirectory 'resolve-installation.json')) } else { $null }
  } | ConvertTo-Json -Depth 15 -Compress
} finally {
  # Only the GUID-named HKCU simulation key is removed. Node owns temp-file cleanup.
  $base = Get-RegistryBase ([Microsoft.Win32.RegistryHive]::CurrentUser)
  try { $base.DeleteSubKeyTree($testSubKey, $false) } finally { $base.Dispose() }
}
