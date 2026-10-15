param([string]$SamplerPath, [string]$FixtureRoot, [string]$Scenario)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility') -Force
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($SamplerPath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Sampler parse failed.' }
foreach ($statement in $ast.EndBlock.Statements) {
  if ($statement -is [System.Management.Automation.Language.FunctionDefinitionAst] -or
      $statement -is [System.Management.Automation.Language.AssignmentStatementAst]) {
    Invoke-Expression $statement.Extent.Text
  }
}
# All writable paths are test-only. No production HKLM APIs or UAC are called.
$env:APPDATA = Join-Path $FixtureRoot 'appdata'
$env:LOCALAPPDATA = Join-Path $FixtureRoot 'localappdata'
$OutputRoot = Join-Path $FixtureRoot 'output with spaces'
$Elevated = $false; $EnableDumps = $Scenario -eq 'partial-recovery'; $SkipDumpPrompt = $true
$cacheDirectory = Join-Path $env:APPDATA 'Clackly'
$cachePath = Join-Path $cacheDirectory 'runtime-probe.json'
$recoveryPath = Join-Path $OutputRoot 'recovery.json'
New-Item -ItemType Directory -Path $cacheDirectory, $OutputRoot -Force | Out-Null
$original = '{"schemaVersion":1,"result":{"status":"passed"},"fixture":"original"}'
$fresh = '{"schemaVersion":1,"result":{"status":"passed"},"fixture":"new"}'
if ($Scenario -ne 'absent-prior-conflict') { Write-Utf8File -Path $cachePath -Text $original }
function Confirm-NoResidualProcesses { return $true }
function Get-PluginEvidence { throw 'Simulated installation access failure' }
function Get-WindowEvents { return @() }
function Test-DiagnosticAdministrator { return $true }
function Get-EnvironmentOverrides { return @() }
function Restore-RegistrySnapshot { throw 'Simulated WER restore denied' }
function Enable-WerDumpCapture {
  param($SubKey, $DumpDirectory, $RecoveryPath)
  # Stub the registry boundary; the real journal and partial recovery are exercised.
  $snapshot = [pscustomobject]@{ fixture = 'simulated WER snapshot' }
  Write-RecoveryJournal -Path $RecoveryPath -WerSnapshot $snapshot
  return [pscustomobject]@{ snapshot = $snapshot; result = New-Result -Name 'wer-dump' -Status 'ok' }
}
function Watch-DiagnosticProcesses {
  param($Results)
  if ($Scenario -eq 'absent-prior-conflict') { throw 'Observation must not start after failed previous recovery' }
  Write-Utf8File -Path $cachePath -Text $fresh
  return @()
}
if ($Scenario -eq 'absent-prior-conflict') {
  Backup-ProbeCache -CachePath $cachePath -EvidenceDirectory $OutputRoot -RecoveryPath $recoveryPath -SamplerId 'prior' | Out-Null
  Write-Utf8File -Path $cachePath -Text '{"fixture":"foreign cache after interruption"}'
}
if ($Scenario -eq 'pending-partial-recovery') {
  $state = Backup-ProbeCache -CachePath $cachePath -EvidenceDirectory $OutputRoot -RecoveryPath $recoveryPath -SamplerId 'prior'
  Write-RecoveryJournal -Path $recoveryPath -State $state -WerSnapshot ([pscustomobject]@{ fixture = 'simulated WER snapshot' })
}
if ($Scenario -eq 'post-copy-failure') {
  $originalCopy = ${function:Copy-RedactedTextFile}
  function Copy-RedactedTextFile {
    param($Source, $Destination, $MaximumBytes = 0)
    if ((Split-Path -Leaf $Destination) -eq 'runtime-probe-after.json') { throw 'Simulated post-cache copy denial' }
    & $originalCopy -Source $Source -Destination $Destination -MaximumBytes $MaximumBytes
  }
}
$launch = $null
if ($Scenario -in @('uac-rejected', 'uac-forward')) {
  $SkipDumpPrompt = $false
  function Read-Host { return 'Y' }
  function Start-Process {
    param($FilePath, $Verb, [switch]$Wait, [switch]$PassThru, $ArgumentList)
    $script:launch = @{ file = $FilePath; verb = $Verb; arguments = $ArgumentList; wait = [bool]$Wait; passThru = [bool]$PassThru }
    if ($Scenario -eq 'uac-rejected') { throw 'SIMULATED_UAC_DECLINED_1223' }
    return [pscustomobject]@{ ExitCode = 7 }
  }
  $exitCode = Invoke-DiagnosticEntry -SamplerPath $SamplerPath
} else { $exitCode = (Invoke-DiagnosticSampler -SkipDumpPrompt).ExitCode }
$manifest = $null
$sessions = @(Get-ChildItem -LiteralPath $OutputRoot -Directory)
if ($sessions.Count) { $manifest = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $sessions[0].FullName 'manifest.json') -Raw | ConvertFrom-Json }
$journalBeforeRetry = $null; $retry = $null
if ($Scenario -in @('partial-recovery', 'pending-partial-recovery')) {
  $journalBeforeRetry = Get-Content -Encoding UTF8 -LiteralPath $recoveryPath -Raw | ConvertFrom-Json
  function Restore-RegistrySnapshot { param($Snapshot) } # registry boundary becomes available
  $retry = Recover-PendingState -RecoveryPath $recoveryPath
}
[pscustomobject]@{
  exitCode = $exitCode; manifest = $manifest; launch = $launch
  cacheText = [System.IO.File]::ReadAllText($cachePath)
  quarantineCount = @([System.IO.Directory]::GetFiles($cacheDirectory, '*quarantine*')).Count
  recoveryExists = Test-Path -LiteralPath $recoveryPath
  journalBeforeRetry = $journalBeforeRetry; retry = $retry
} | ConvertTo-Json -Depth 15 -Compress
