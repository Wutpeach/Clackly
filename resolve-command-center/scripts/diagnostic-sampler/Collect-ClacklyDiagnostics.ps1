[CmdletBinding()]
param(
  [switch]$SelfTest,
  [switch]$Elevated,
  [switch]$EnableDumps,
  [switch]$SkipDumpPrompt,
  [string]$OutputRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:SamplerVersion = "1"
$script:MaxLogBytes = 5MB
$script:ObservedResolveImages = @{}
$script:ResolveImageLimitExceeded = $false
$script:WerSubKey = "SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\python.exe"

function New-Result {
  param([string]$Name, [string]$Status, [string]$Detail = "", $Data = $null)
  return [pscustomobject][ordered]@{ name = $Name; status = $Status; detail = $Detail; data = $Data }
}

function Get-CanonicalPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [System.IO.Path]::GetFullPath($Path)
}

function Redact-DiagnosticText {
  param($Value)
  if ($null -eq $Value) { return $null }
  $text = [string]$Value
  foreach ($pair in @(
    @($env:USERPROFILE, "<USERPROFILE>"),
    @($env:USERNAME, "<USER>"),
    @($env:COMPUTERNAME, "<COMPUTER>")
  )) {
    if (![string]::IsNullOrWhiteSpace([string]$pair[0])) {
      $text = [regex]::Replace($text, [regex]::Escape([string]$pair[0]), [string]$pair[1], [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
  }
  return $text
}

function Write-Utf8File {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Text)
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

function Write-JsonFile {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)]$Value)
  Write-Utf8File -Path $Path -Text ($Value | ConvertTo-Json -Depth 12)
}

function Invoke-EvidenceItem {
  param([Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action)
  try {
    $data = & $Action
    return New-Result -Name $Name -Status "ok" -Data $data
  } catch [System.UnauthorizedAccessException] {
    return New-Result -Name $Name -Status "denied" -Detail (Redact-DiagnosticText $_.Exception.Message)
  } catch {
    return New-Result -Name $Name -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message)
  }
}

function Test-DiagnosticAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-EnvironmentOverrides {
  $records = New-Object System.Collections.Generic.List[object]
  foreach ($target in @([EnvironmentVariableTarget]::Process, [EnvironmentVariableTarget]::User, [EnvironmentVariableTarget]::Machine)) {
    try {
      $value = [Environment]::GetEnvironmentVariable("CLACKLY_PYTHON_EXECUTABLE", $target)
      $records.Add([pscustomobject][ordered]@{
        scope = [string]$target.ToString().ToLowerInvariant()
        status = if ([string]::IsNullOrWhiteSpace($value)) { "missing" } else { "ok" }
        value = if ([string]::IsNullOrWhiteSpace($value)) { $null } else { Redact-DiagnosticText $value }
      })
    } catch [System.UnauthorizedAccessException] {
      $records.Add([pscustomobject]@{ scope = [string]$target.ToString().ToLowerInvariant(); status = "denied"; value = $null })
    } catch {
      $records.Add([pscustomobject]@{ scope = [string]$target.ToString().ToLowerInvariant(); status = "error"; value = $null })
    }
  }
  return $records.ToArray()
}

function Get-FileEvidence {
  param([Parameter(Mandatory = $true)][string]$Path, [string]$Label = $Path)
  try {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.PSIsContainer) { return [pscustomobject]@{ label = $Label; path = Redact-DiagnosticText $item.FullName; status = "error"; detail = "Expected a file." } }
    return [pscustomobject][ordered]@{
      label = $Label; path = Redact-DiagnosticText $item.FullName; status = "ok"; size = [int64]$item.Length
      modifiedAt = $item.LastWriteTimeUtc.ToString("o"); fileVersion = [string]$item.VersionInfo.FileVersion; productVersion = [string]$item.VersionInfo.ProductVersion
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName -ErrorAction Stop).Hash
    }
  } catch [System.Management.Automation.ItemNotFoundException] {
    return [pscustomobject]@{ label = $Label; path = Redact-DiagnosticText $Path; status = "missing" }
  } catch [System.UnauthorizedAccessException] {
    return [pscustomobject]@{ label = $Label; path = Redact-DiagnosticText $Path; status = "denied" }
  } catch {
    return [pscustomobject]@{ label = $Label; path = Redact-DiagnosticText $Path; status = "error"; detail = Redact-DiagnosticText $_.Exception.Message }
  }
}

function Get-PluginEvidence {
  $programData = [Environment]::GetFolderPath("CommonApplicationData")
  $pluginRoot = Join-Path $programData "Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly"
  $utility = Join-Path $env:APPDATA "Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\Clackly.py"
  $files = New-Object System.Collections.Generic.List[object]
  foreach ($relative in @(
    "package.json", "manifest.xml", "workflow-plugin\main.js", "workflow-plugin\WorkflowIntegration.node",
    "script-runtime\runtime\probe.js", "script-runtime\runtime\resolver.js", "script-runtime\runtime\launcher.js", "script-runtime\runtime\bootstrap.py",
    "resources\runtimes\manifest.json"
  )) { $files.Add((Get-FileEvidence -Path (Join-Path $pluginRoot $relative) -Label ("plugin/" + $relative.Replace("\", "/")))) }
  $manifestPath = Join-Path $pluginRoot "resources\runtimes\manifest.json"
  $packagePath = Join-Path $pluginRoot "package.json"
  try {
    if (!(Test-Path -LiteralPath $packagePath -PathType Leaf)) { $packageVersion = New-Result -Name "plugin-version" -Status "missing" }
    else {
      $version = [string]((Get-Content -Encoding UTF8 -LiteralPath $packagePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop).version)
      if ([string]::IsNullOrWhiteSpace($version)) { throw "Package version is missing." }
      $packageVersion = New-Result -Name "plugin-version" -Status "ok" -Data $version
    }
  } catch { $packageVersion = New-Result -Name "plugin-version" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message) }
  try {
    $runtimeManifest = Get-Content -Encoding UTF8 -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    foreach ($profile in @($runtimeManifest.profiles)) {
      if (![string]::IsNullOrWhiteSpace([string]$profile.executable)) {
        $pythonPath = Join-Path $pluginRoot ("resources\runtimes\" + ([string]$profile.executable).Replace("/", "\"))
        $files.Add((Get-FileEvidence -Path $pythonPath -Label "runtime/python.exe"))
        $runtimeVersion = [Version]$profile.runtimeVersion
        $abiDll = 'python' + $runtimeVersion.Major + $runtimeVersion.Minor + '.dll'
        $files.Add((Get-FileEvidence -Path (Join-Path (Split-Path -Parent $pythonPath) $abiDll) -Label ('runtime/' + $abiDll)))
      }
    }
  } catch { $files.Add([pscustomobject]@{ label = "runtime/profile"; status = "skipped"; detail = "Runtime manifest unavailable or invalid." }) }
  return [pscustomobject][ordered]@{
    workflowPluginRoot = Redact-DiagnosticText $pluginRoot
    workflowPluginPresent = (Test-Path -LiteralPath $pluginRoot -PathType Container)
    packageVersion = $packageVersion
    utilityScript = Get-FileEvidence -Path $utility -Label "resolve-utility/Clackly.py"
    files = $files.ToArray()
  }
}

function Get-RecordProperty {
  param($Object, [string]$Name)
  if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) { return $Object.$Name }
  return $null
}

function Read-BoundedDiagnosticRecord {
  param([string]$Path)
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $bytes = New-Object byte[] 65537
    $count = 0
    while ($count -lt $bytes.Length) {
      $read = $stream.Read($bytes, $count, $bytes.Length - $count)
      if ($read -eq 0) { break }
      $count += $read
    }
    if ($count -gt 65536) { throw 'Diagnostic record exceeds 64 KiB.' }
    $document = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $count).TrimStart([char]0xfeff) | ConvertFrom-Json -ErrorAction Stop
    if ((Get-RecordProperty $document 'schemaVersion') -ne 1) { throw 'Unsupported diagnostic record schema.' }
    return $document
  } finally { $stream.Dispose() }
}

function Get-DiagnosticPathValue {
  param($Value)
  if ($Value -is [string] -and $Value.Length -le 2048 -and $Value -match '^[A-Za-z]:[\\/]' -and $Value -notmatch '[\r\n\x00]') {
    # A readable JSON record may still contain an invalid Windows path. Treat
    # that field as unavailable so unrelated evidence and recovery continue.
    try { return Get-CanonicalPath $Value } catch { return $null }
  }
  return $null
}

function Get-DiagnosticRecordProjection {
  param($Document)
  $projection = [ordered]@{ schemaVersion = 1 }
  foreach ($name in @('source', 'status', 'code', 'stage')) {
    $value = Get-RecordProperty $Document $name
    if ($value -is [string] -and $value -cmatch '^[A-Za-z0-9_-]{1,80}$') { $projection[$name] = Redact-DiagnosticText $value }
  }
  foreach ($name in @('time', 'discoveredAt')) {
    $value = Get-RecordProperty $Document $name
    $parsed = [datetimeoffset]::MinValue
    if ($value -is [string] -and $value.Length -le 40 -and [datetimeoffset]::TryParse($value, [ref]$parsed)) { $projection[$name] = $parsed.ToUniversalTime().ToString('o') }
  }
  foreach ($name in @('resolveExecutable', 'resolveRoot', 'modulePath', 'libraryPath', 'scriptingRoot', 'resolvePythonExecutable')) {
    $value = Get-DiagnosticPathValue (Get-RecordProperty $Document $name)
    if ($null -ne $value) { $projection[$name] = Redact-DiagnosticText $value }
  }
  $files = Get-RecordProperty $Document 'files'
  if ($null -ne $files) {
    $metadata = [ordered]@{}
    foreach ($name in @('resolveExecutable', 'modulePath', 'libraryPath', 'resolvePythonExecutable')) {
      $file = Get-RecordProperty $files $name
      if ($null -eq $file) { continue }
      $entry = [ordered]@{}
      $path = Get-DiagnosticPathValue (Get-RecordProperty $file 'path')
      if ($null -ne $path) { $entry.path = Redact-DiagnosticText $path }
      foreach ($field in @('size', 'mtimeMs')) {
        $value = Get-RecordProperty $file $field
        if (($value -is [int] -or $value -is [long] -or $value -is [double] -or $value -is [decimal]) -and $value -ge 0 -and $value -le 9007199254740991) { $entry[$field] = $value }
      }
      $metadata[$name] = $entry
    }
    $projection.files = $metadata
  }
  return [pscustomobject]$projection
}

function Save-DiagnosticRecordEvidence {
  param([string]$Path, [string]$Name, [string]$OutputDirectory)
  try {
    $document = Read-BoundedDiagnosticRecord $Path
    $projection = Get-DiagnosticRecordProjection $document
    Write-JsonFile -Path (Join-Path $OutputDirectory ($Name + '.json')) -Value $projection
    return New-Result -Name $Name -Status 'ok' -Data $projection
  } catch [System.IO.FileNotFoundException] { return New-Result -Name $Name -Status 'missing'
  } catch [System.IO.DirectoryNotFoundException] { return New-Result -Name $Name -Status 'missing'
  } catch [System.UnauthorizedAccessException] { return New-Result -Name $Name -Status 'denied'
  } catch { return New-Result -Name $Name -Status 'error' -Detail 'Record unavailable, invalid, or larger than 64 KiB; raw content was not collected.' }
}

function Get-ObservedResolveEvidence {
  param([hashtable]$Images = $script:ObservedResolveImages, [string]$RecordPath = (Join-Path $env:APPDATA 'Clackly\resolve-installation.json'))
  $roots = @{}
  $unresolved = 0
  foreach ($image in $Images.Values) {
    $path = Get-DiagnosticPathValue $image
    if ($null -eq $path -or (Split-Path -Leaf $path) -ine 'Resolve.exe') { $unresolved++; continue }
    $roots[(Split-Path -Parent $path)] = $path
  }
  $record = $null
  try { $record = Read-BoundedDiagnosticRecord $RecordPath } catch {}
  $installations = New-Object System.Collections.Generic.List[object]
  foreach ($root in @($roots.Keys | Sort-Object | Select-Object -First 8)) {
    $executable = $roots[$root]
    $module = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules\DaVinciResolveScript.py'
    $library = Join-Path $root 'fusionscript.dll'
    $recordExecutable = Get-DiagnosticPathValue (Get-RecordProperty $record 'resolveExecutable')
    $recordLibrary = Get-DiagnosticPathValue (Get-RecordProperty $record 'libraryPath')
    $recordModule = Get-DiagnosticPathValue (Get-RecordProperty $record 'modulePath')
    $recordMatches = $recordExecutable -ieq $executable -and $recordLibrary -ieq $library
    if ($recordMatches -and $null -ne $recordModule -and (Split-Path -Leaf $recordModule) -ieq 'DaVinciResolveScript.py') { $module = $recordModule }
    $installations.Add([pscustomobject][ordered]@{
      resolveExecutable = Redact-DiagnosticText $executable; resolveRoot = Redact-DiagnosticText $root
      recordMatchesObservation = [bool]$recordMatches
      files = @((Get-FileEvidence -Path $executable -Label 'observed-resolve/Resolve.exe'),
                (Get-FileEvidence -Path $library -Label 'observed-resolve/fusionscript.dll'),
                (Get-FileEvidence -Path $module -Label 'resolve-module/DaVinciResolveScript.py'))
    })
  }
  $status = if ($roots.Count -gt 1) { 'ambiguous' } elseif ($script:ResolveImageLimitExceeded -or $unresolved -gt 0 -or $roots.Count -eq 0) { 'unresolved' } else { 'ok' }
  return New-Result -Name 'observed-resolve-installation' -Status $status -Detail $(if ($status -eq 'ambiguous') { 'Multiple Resolve roots were observed; no installation was selected.' } elseif ($status -eq 'unresolved') { 'Resolve image identity was absent, unreadable, invalid, or exceeded the observation limit. Default-location absence is not evidence that Resolve is missing.' } else { 'Installations are observed process identities, not proof of Runtime readiness.' }) -Data ([ordered]@{ observedRootCount = $roots.Count; unresolvedImageCount = $unresolved; truncated = ($script:ResolveImageLimitExceeded -or $roots.Count -gt 8); installations = $installations.ToArray() })
}

function Copy-RedactedTextFile {
  param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][string]$Destination, [int64]$MaximumBytes = 0)
  $stream = [System.IO.File]::Open($Source, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $length = $stream.Length
    $offset = if ($MaximumBytes -gt 0 -and $length -gt $MaximumBytes) { $length - $MaximumBytes } else { 0 }
    $limit = if ($MaximumBytes -gt 0) { $MaximumBytes } else { $length }
    $count = [int]([Math]::Min($length - $offset, $limit))
    $bytes = New-Object byte[] $count
    $stream.Seek($offset, [System.IO.SeekOrigin]::Begin) | Out-Null
    $read = 0
    while ($read -lt $count) { $read += $stream.Read($bytes, $read, $count - $read) }
    Write-Utf8File -Path $Destination -Text (Redact-DiagnosticText ([System.Text.Encoding]::UTF8.GetString($bytes)))
    return [pscustomobject]@{ source = Redact-DiagnosticText $Source; output = Split-Path -Leaf $Destination; bytes = $count; truncated = ($offset -gt 0) }
  } finally { $stream.Dispose() }
}

function Write-RecoveryJournal {
  param([Parameter(Mandatory = $true)][string]$Path, $State = $null, $WerSnapshot = $null)
  Write-JsonFile -Path $Path -Value ([ordered]@{ kind = "clackly-diagnostic-sampler"; version = $script:SamplerVersion; state = $State; werSnapshot = $WerSnapshot })
}

function Get-ProbeCacheSummary {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Name)
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return New-Result -Name $Name -Status "missing" }
  try {
    $document = Get-Content -Encoding UTF8 -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    return New-Result -Name $Name -Status "ok" -Data ([ordered]@{ schemaVersion = $document.schemaVersion; resultStatus = [string]$document.result.probeStatus })
  } catch { return New-Result -Name $Name -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message) }
}

function Backup-ProbeCache {
  param([Parameter(Mandatory = $true)][string]$CachePath,
        [Parameter(Mandatory = $true)][string]$EvidenceDirectory,
        [Parameter(Mandatory = $true)][string]$RecoveryPath,
        [Parameter(Mandatory = $true)][string]$SamplerId)
  $cachePath = Get-CanonicalPath $CachePath
  $werSnapshot = $null
  if (Test-Path -LiteralPath $RecoveryPath -PathType Leaf) {
    $werSnapshot = (Get-Content -Encoding UTF8 -LiteralPath $RecoveryPath -Raw | ConvertFrom-Json -ErrorAction Stop).werSnapshot
  }
  $state = [ordered]@{ cachePath = $cachePath; hadOriginal = $false; quarantinePath = $null; samplerId = $SamplerId }
  if (Test-Path -LiteralPath $cachePath -PathType Leaf) {
    Copy-RedactedTextFile -Source $cachePath -Destination (Join-Path $EvidenceDirectory "runtime-probe-before.json") | Out-Null
    $state.hadOriginal = $true
    $state.quarantinePath = $cachePath + ".clackly-diagnostic-quarantine." + $SamplerId
    if (Test-Path -LiteralPath $state.quarantinePath) { throw "Sampler quarantine path already exists; the cache was not changed." }
    Write-RecoveryJournal -Path $RecoveryPath -State $state -WerSnapshot $werSnapshot
    try { Move-Item -LiteralPath $cachePath -Destination $state.quarantinePath -ErrorAction Stop } catch {
      try { Write-RecoveryJournal -Path $RecoveryPath -State $null -WerSnapshot $werSnapshot } catch {}
      throw
    }
  } else { Write-RecoveryJournal -Path $RecoveryPath -State $state -WerSnapshot $werSnapshot }
  return [pscustomobject]$state
}

function Restore-ProbeCache {
  param([Parameter(Mandatory = $true)]$State, [switch]$RemoveCurrentCache)
  $cachePath = [string]$State.cachePath
  $quarantinePath = [string]$State.quarantinePath
  if ([bool]$State.hadOriginal) {
    if (Test-Path -LiteralPath $quarantinePath -PathType Leaf) {
      if ((Test-Path -LiteralPath $cachePath -PathType Leaf) -and $RemoveCurrentCache) { Remove-Item -LiteralPath $cachePath -Force -ErrorAction Stop }
      if (!(Test-Path -LiteralPath $cachePath)) {
        Move-Item -LiteralPath $quarantinePath -Destination $cachePath -ErrorAction Stop
        return New-Result -Name "probe-cache-restore" -Status "ok" -Detail "Original cache restored."
      }
    }
    return New-Result -Name "probe-cache-restore" -Status "error" -Detail "Cache ownership conflict; neither cache file was overwritten." -Data @{ active = Redact-DiagnosticText $cachePath; quarantine = Redact-DiagnosticText $quarantinePath }
  }
  if (Test-Path -LiteralPath $cachePath -PathType Leaf) {
    if (!$RemoveCurrentCache) {
      return New-Result -Name "probe-cache-restore" -Status "error" -Detail "A cache appeared after an interrupted absent-cache session; ownership is unknown, so it was preserved."
    }
    Remove-Item -LiteralPath $cachePath -Force -ErrorAction Stop
  }
  return New-Result -Name "probe-cache-restore" -Status "ok" -Detail "Restored the original absent-cache state."
}

function Recover-PendingState {
  param([Parameter(Mandatory = $true)][string]$RecoveryPath)
  if (!(Test-Path -LiteralPath $RecoveryPath -PathType Leaf)) { return New-Result -Name "previous-recovery" -Status "missing" }
  try {
    $journal = Get-Content -Encoding UTF8 -LiteralPath $RecoveryPath -Raw | ConvertFrom-Json -ErrorAction Stop
    if ($journal.kind -ne "clackly-diagnostic-sampler") { throw "Recovery journal does not belong to this sampler." }
    $cacheResult = New-Result -Name "probe-cache-restore" -Status "missing"
    if ($null -ne $journal.state) {
      try {
        $cacheResult = Restore-ProbeCache -State $journal.state
        if ($cacheResult.status -eq "ok") {
          $journal.state = $null
          Write-RecoveryJournal -Path $RecoveryPath -State $journal.state -WerSnapshot $journal.werSnapshot
        }
      } catch { $cacheResult = New-Result -Name "probe-cache-restore" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message) }
    }
    $werResult = New-Result -Name "wer-restore" -Status "missing"
    if ($null -ne $journal.werSnapshot) {
      try {
        Restore-RegistrySnapshot -Snapshot $journal.werSnapshot
        $journal.werSnapshot = $null
        Write-RecoveryJournal -Path $RecoveryPath -State $journal.state -WerSnapshot $journal.werSnapshot
        $werResult = New-Result -Name "wer-restore" -Status "ok"
      } catch { $werResult = New-Result -Name "wer-restore" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message) }
    }
    if ($cacheResult.status -in @("ok", "missing") -and $werResult.status -in @("ok", "missing")) { Remove-Item -LiteralPath $RecoveryPath -Force -ErrorAction Stop }
    return New-Result -Name "previous-recovery" -Status $(if ($cacheResult.status -in @("ok", "missing") -and $werResult.status -in @("ok", "missing")) { "ok" } else { "error" }) -Data @($cacheResult, $werResult)
  } catch { return New-Result -Name "previous-recovery" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message) }
}

function Get-RegistryBase {
  param([Microsoft.Win32.RegistryHive]$Hive)
  return [Microsoft.Win32.RegistryKey]::OpenBaseKey($Hive, [Microsoft.Win32.RegistryView]::Default)
}

function Get-RegistrySnapshot {
  param([Parameter(Mandatory = $true)][string]$SubKey, [Microsoft.Win32.RegistryHive]$Hive = [Microsoft.Win32.RegistryHive]::LocalMachine)
  $base = Get-RegistryBase $Hive
  try {
    $key = $base.OpenSubKey($SubKey, $false)
    $snapshot = [ordered]@{ hive = [string]$Hive; subKey = $SubKey; keyExisted = ($null -ne $key); values = @{} }
    if ($null -ne $key) {
      try {
        foreach ($name in @("DumpFolder", "DumpCount", "DumpType")) {
          $exists = @($key.GetValueNames()) -contains $name
          $snapshot.values[$name] = [ordered]@{ exists = $exists; value = if ($exists) { $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } else { $null }; kind = if ($exists) { [string]$key.GetValueKind($name) } else { $null } }
        }
      } finally { $key.Dispose() }
    }
    return [pscustomobject]$snapshot
  } finally { $base.Dispose() }
}

function Set-WerDumpConfiguration {
  param([Parameter(Mandatory = $true)][string]$SubKey, [Parameter(Mandatory = $true)][string]$DumpFolder, [Microsoft.Win32.RegistryHive]$Hive = [Microsoft.Win32.RegistryHive]::LocalMachine)
  $base = Get-RegistryBase $Hive
  try {
    $key = $base.CreateSubKey($SubKey)
    try {
      $key.SetValue("DumpFolder", $DumpFolder, [Microsoft.Win32.RegistryValueKind]::ExpandString)
      $key.SetValue("DumpCount", 3, [Microsoft.Win32.RegistryValueKind]::DWord)
      $key.SetValue("DumpType", 1, [Microsoft.Win32.RegistryValueKind]::DWord)
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

function Restore-RegistrySnapshot {
  param([Parameter(Mandatory = $true)]$Snapshot)
  $hive = [Microsoft.Win32.RegistryHive]::$([string]$Snapshot.hive)
  $base = Get-RegistryBase $hive
  try {
    if (![bool]$Snapshot.keyExisted) {
      try { $base.DeleteSubKeyTree([string]$Snapshot.subKey, $false) } catch [ArgumentException] {}
      return
    }
    $key = $base.CreateSubKey([string]$Snapshot.subKey)
    try {
      foreach ($name in @("DumpFolder", "DumpCount", "DumpType")) {
        $entry = $Snapshot.values.$name
        if ([bool]$entry.exists) {
          $key.SetValue($name, $entry.value, [Microsoft.Win32.RegistryValueKind]::$([string]$entry.kind))
        } else { $key.DeleteValue($name, $false) }
      }
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

function Enable-WerDumpCapture {
  param([Parameter(Mandatory = $true)][string]$SubKey,
        [Parameter(Mandatory = $true)][string]$DumpDirectory,
        [Parameter(Mandatory = $true)][string]$RecoveryPath,
        [Microsoft.Win32.RegistryHive]$Hive = [Microsoft.Win32.RegistryHive]::LocalMachine)
  $snapshot = $null
  try {
    $snapshot = Get-RegistrySnapshot -SubKey $SubKey -Hive $Hive
    New-Item -ItemType Directory -Path $DumpDirectory -Force | Out-Null
    Write-RecoveryJournal -Path $RecoveryPath -WerSnapshot $snapshot
    Set-WerDumpConfiguration -SubKey $SubKey -DumpFolder $DumpDirectory -Hive $Hive
    $result = New-Result -Name "wer-dump" -Status "ok" -Detail "Temporary python.exe mini dump configuration is active."
  } catch {
    $detail = (Redact-DiagnosticText $_.Exception.Message) + " Ordinary sampling continues."
    if ($null -ne $snapshot) {
      try {
        Restore-RegistrySnapshot -Snapshot $snapshot
        if (Test-Path -LiteralPath $RecoveryPath -PathType Leaf) { Remove-Item -LiteralPath $RecoveryPath -Force -ErrorAction Stop }
        $snapshot = $null
        $detail += " Registry snapshot was restored."
      } catch { $detail += " Immediate registry restore failed; the recovery journal was retained." }
    }
    $result = New-Result -Name "wer-dump" -Status "error" -Detail $detail
  }
  return [pscustomobject]@{ snapshot = $snapshot; result = $result }
}

function Test-RelevantProcess {
  param($Process)
  $name = [string]$Process.Name
  $commandLine = [string]$Process.CommandLine
  return $name -match "^(Resolve|DaVinciResolve|python|AfterFX)(\.exe)?$" -or $name -match "clackly" -or (($name -match "^(electron|workflow)(\.exe)?$") -and $commandLine -match "(?i)clackly|workflow")
}

function Get-DiagnosticProcesses {
  return @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { Test-RelevantProcess $_ })
}

function Add-ProcessObservations {
  param([Parameter(Mandatory = $true)][hashtable]$Records, [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Processes, [datetime]$ObservedAt = [datetime]::UtcNow)
  foreach ($process in $Processes) {
    $created = if ($null -eq $process.CreationDate) { "" } else { [string]($process.CreationDate) }
    $pidText = [string]($process.ProcessId)
    $key = $pidText + [char]124 + $created
    if ([string]$process.Name -match '^(Resolve|DaVinciResolve)(\.exe)?$') {
      # Raw paths stay in bounded private memory only; manifest processes remain redacted.
      if ($script:ObservedResolveImages.ContainsKey($key) -or $script:ObservedResolveImages.Count -lt 32) {
        $imagePath = Get-DiagnosticPathValue $process.ExecutablePath
        if ($null -ne $imagePath -or !$script:ObservedResolveImages.ContainsKey($key)) { $script:ObservedResolveImages[$key] = $imagePath }
      } else { $script:ResolveImageLimitExceeded = $true }
    }
    if (!$Records.ContainsKey($key)) {
      $Records[$key] = [pscustomobject][ordered]@{
        pid = [int]$process.ProcessId; parentPid = [int]$process.ParentProcessId; name = Redact-DiagnosticText $process.Name
        executablePath = Redact-DiagnosticText $process.ExecutablePath; commandLine = Redact-DiagnosticText $process.CommandLine
        creationTime = $created; firstObservedAt = $ObservedAt.ToString("o"); lastObservedAt = $ObservedAt.ToString("o"); disappearedAt = $null
      }
    } else { $Records[$key].lastObservedAt = $ObservedAt.ToString("o") }
  }
}

function Watch-DiagnosticProcesses {
  param([Parameter(Mandatory = $true)]$Results)
  $records = @{}
  $processReadFailed = $false
  Write-Host "现在启动 Resolve，并执行一次 Clackly AE 导出。完成后回到此窗口按 Enter。"
  while ($true) {
    try { Add-ProcessObservations -Records $records -Processes @(Get-DiagnosticProcesses) } catch {
      if (!$processReadFailed) { $Results.Add((New-Result -Name "process-observation" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message))); $processReadFailed = $true }
    }
    Start-Sleep -Milliseconds 750
    if ([Console]::KeyAvailable) {
      $key = [Console]::ReadKey($true)
      if ($key.Key -eq [ConsoleKey]::Enter) { break }
    }
  }
  $current = @{}
  try {
    foreach ($process in @(Get-DiagnosticProcesses)) {
      $created = if ($null -eq $process.CreationDate) { "" } else { [string]($process.CreationDate) }
      $pidText = [string]($process.ProcessId)
      $key = $pidText + [char]124 + $created
      $current[$key] = $true
    }
  } catch {
    if (!$processReadFailed) { $Results.Add((New-Result -Name "process-observation" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message))); $processReadFailed = $true }
  }
  foreach ($key in @($records.Keys)) { if (!$current.ContainsKey($key)) { $records[$key].disappearedAt = ([datetime]::UtcNow).ToString("o") } }
  return @($records.Values | Sort-Object creationTime, pid)
}

function Copy-ClacklyLogs {
  param([Parameter(Mandatory = $true)][string]$OutputDirectory)
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
  $result = New-Object System.Collections.Generic.List[object]
  foreach ($name in @("clackly.log", "bridge.log")) {
    $source = Join-Path (Join-Path $env:APPDATA "Clackly") $name
    try {
      if (!(Test-Path -LiteralPath $source -PathType Leaf)) { $result.Add((New-Result -Name ("log/" + $name) -Status "missing")); continue }
      $data = Copy-RedactedTextFile -Source $source -Destination (Join-Path $OutputDirectory $name) -MaximumBytes $script:MaxLogBytes
      $result.Add((New-Result -Name ("log/" + $name) -Status "ok" -Data $data))
    } catch [System.UnauthorizedAccessException] { $result.Add((New-Result -Name ("log/" + $name) -Status "denied"))
    } catch { $result.Add((New-Result -Name ("log/" + $name) -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message))) }
  }
  return $result.ToArray()
}

function Get-WindowEvents {
  param([datetime]$StartTime, [datetime]$EndTime)
  $records = New-Object System.Collections.Generic.List[object]
  foreach ($eventId in @(1000, 1001)) {
    try {
      $provider = if ($eventId -eq 1000) { "Application Error" } else { "Windows Error Reporting" }
      $events = Get-WinEvent -FilterHashtable @{ LogName = "Application"; ProviderName = $provider; Id = $eventId; StartTime = $StartTime } -ErrorAction Stop | Where-Object { $_.TimeCreated -le $EndTime }
      foreach ($event in @($events)) {
        $data = [ordered]@{}
        try {
          $xml = [xml]$event.ToXml()
          foreach ($field in @($xml.Event.EventData.Data)) { if ($null -ne $field) { $data[[string]$field.Name] = Redact-DiagnosticText $field."#text" } }
        } catch {}
        $message = $null; try { $message = Redact-DiagnosticText $event.Message } catch {}
        $records.Add([pscustomobject][ordered]@{ id = $event.Id; provider = $event.ProviderName; timeCreated = $event.TimeCreated.ToUniversalTime().ToString("o"); message = $message; data = $data })
      }
    } catch [System.UnauthorizedAccessException] { $records.Add((New-Result -Name ("event/" + $eventId) -Status "denied"))
    } catch { $records.Add((New-Result -Name ("event/" + $eventId) -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message))) }
  }
  return $records.ToArray()
}

function New-DiagnosticZip {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)][string]$Destination, [switch]$DumpOnly)
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $root = (Get-CanonicalPath $Root).TrimEnd('\', '/')
  if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force -ErrorAction Stop }
  $archive = [System.IO.Compression.ZipFile]::Open($Destination, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in @(Get-ChildItem -LiteralPath $root -File -Recurse -Force | Sort-Object FullName)) {
      $relative = $file.FullName.Substring($root.Length).TrimStart([char[]]@(92, 47)).Replace('\', '/')
      $isSensitive = $relative.StartsWith("dumps-sensitive/", [System.StringComparison]::OrdinalIgnoreCase)
      if (($DumpOnly -and !$isSensitive) -or (!$DumpOnly -and ($isSensitive -or $file.Extension -ieq ".dmp"))) { continue }
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $archive.Dispose() }
}

function Confirm-NoResidualProcesses {
  while ($true) {
    try { $processes = @(Get-DiagnosticProcesses) } catch { Write-Host ("无法读取进程列表：" + $_.Exception.Message); return $false }
    if ($processes.Count -eq 0) { return $true }
    Write-Host "发现以下 Resolve/Clackly/Python/AfterFX 残留进程。工具不会结束它们："
    $processes | Select-Object ProcessId, ParentProcessId, Name | Format-Table | Out-Host
    $answer = Read-Host "请退出这些进程后按 Enter 重试；输入 Q 取消采样"
    if ($answer -match "^[Qq]$") { return $false }
  }
}

function Invoke-DiagnosticSampler {
  param([switch]$SkipDumpPrompt, [string]$DumpUnavailableReason)
  if (!(Test-NoWindowsHost)) { Write-Host "此采样器只能在 Windows 上运行。"; return [pscustomobject]@{ ExitCode = 2; RequiresElevation = $false } }
  if ($PSVersionTable.PSVersion -lt [Version]"5.1") { Write-Host "需要 Windows PowerShell 5.1。"; return [pscustomobject]@{ ExitCode = 2; RequiresElevation = $false } }
  if (!(Confirm-NoResidualProcesses)) { return [pscustomobject]@{ ExitCode = 2; RequiresElevation = $false } }
  if (!$SkipDumpPrompt -and !$Elevated -and !$EnableDumps) {
    $answer = Read-Host "是否启用可选 mini dump？它可能包含进程内存且需要管理员权限。输入 Y 继续，否则直接 Enter"
    if ($answer -match "^[Yy]$") { return [pscustomobject]@{ ExitCode = 0; RequiresElevation = $true } }
  }

  $samplerId = [Guid]::NewGuid().ToString("N").Substring(0, 12)
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
  $base = if ([string]::IsNullOrWhiteSpace($OutputRoot)) { Join-Path $env:LOCALAPPDATA "ClacklyDiagnostics" } else { Get-CanonicalPath $OutputRoot }
  $session = Join-Path $base ("Clackly-Diagnostics-" + $stamp + "-" + $samplerId)
  New-Item -ItemType Directory -Path $session -Force -ErrorAction Stop | Out-Null
  $results = New-Object System.Collections.Generic.List[object]
  $started = [datetime]::UtcNow
  $cachePath = Join-Path (Join-Path $env:APPDATA "Clackly") "runtime-probe.json"
  $recoveryPath = Join-Path $base "recovery.json"
  $cacheState = $null
  $werSnapshot = $null
  $cacheRestoreOk = $true
  $werRestoreOk = $true
  $previousRecoveryOk = $false
  $dumpDirectory = Join-Path $session "dumps-sensitive"
  $manifest = [ordered]@{
    samplerVersion = $script:SamplerVersion; samplerId = $samplerId; startedAt = $started.ToString("o"); endedAt = $null
    privacy = @("No automatic upload.", "Ordinary ZIP excludes dumps.", "Common user paths, usernames, and machine names are redacted.")
    system = $null; environmentOverrides = $null; installation = $null; resolveInstallation = $null; results = $results; processes = @(); events = @(); logs = @(); recovery = $null
  }
  try {
    $manifest.recovery = Recover-PendingState -RecoveryPath $recoveryPath
    if ($manifest.recovery.status -eq "error") { throw "Previous sampler recovery needs manual attention; no new sampling state was changed." }
    $previousRecoveryOk = $true
    $systemEvidence = Invoke-EvidenceItem -Name "system" -Action {
      $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
      [pscustomobject]@{ caption = $os.Caption; version = $os.Version; architecture = $os.OSArchitecture; powerShell = $PSVersionTable.PSVersion.ToString(); currentUser = "<USER>"; computer = "<COMPUTER>" }
    }
    $results.Add($systemEvidence); $manifest.system = $systemEvidence.data
    $overrideEvidence = Invoke-EvidenceItem -Name "python-overrides" -Action { Get-EnvironmentOverrides }; $results.Add($overrideEvidence); $manifest.environmentOverrides = $overrideEvidence.data
    $installationEvidence = Invoke-EvidenceItem -Name "installation" -Action { Get-PluginEvidence }; $results.Add($installationEvidence); $manifest.installation = $installationEvidence.data
    if (![string]::IsNullOrWhiteSpace($DumpUnavailableReason)) {
      $results.Add((New-Result -Name "wer-dump" -Status "skipped" -Detail (Redact-DiagnosticText $DumpUnavailableReason)))
    } elseif ($EnableDumps) {
      if (!(Test-DiagnosticAdministrator)) { $results.Add((New-Result -Name "wer-dump" -Status "skipped" -Detail "Elevation was not granted; ordinary sampling continues.")) }
      else {
        $werSetup = Enable-WerDumpCapture -SubKey $script:WerSubKey -DumpDirectory $dumpDirectory -RecoveryPath $recoveryPath
        $werSnapshot = $werSetup.snapshot
        $results.Add($werSetup.result)
      }
    } else { $results.Add((New-Result -Name "wer-dump" -Status "skipped" -Detail "Disabled by default.")) }
    try {
      $cacheState = Backup-ProbeCache -CachePath $cachePath -EvidenceDirectory $session -RecoveryPath $recoveryPath -SamplerId $samplerId
      $results.Add((New-Result -Name "probe-cache-backup" -Status "ok" -Data @{ hadOriginal = $cacheState.hadOriginal }))
      $results.Add((Get-ProbeCacheSummary -Path (Join-Path $session "runtime-probe-before.json") -Name "probe-cache-before"))
    } catch { $results.Add((New-Result -Name "probe-cache-backup" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message))) }
    $script:ObservedResolveImages = @{}; $script:ResolveImageLimitExceeded = $false
    $manifest.processes = @(Watch-DiagnosticProcesses -Results $results)
    $observedResolve = Get-ObservedResolveEvidence
    $results.Add($observedResolve); $manifest.resolveInstallation = $observedResolve.data
    foreach ($name in @('resolve-installation', 'runtime-diagnostic')) {
      $results.Add((Save-DiagnosticRecordEvidence -Path (Join-Path (Join-Path $env:APPDATA 'Clackly') ($name + '.json')) -Name $name -OutputDirectory $session))
    }
    if (@($manifest.processes).Count -eq 0 -and !($results | Where-Object { $_.name -eq "process-observation" })) { $results.Add((New-Result -Name "process-observation" -Status "missing" -Detail "No relevant process was observed during the reproduction window.")) }
    if (!($manifest.processes | Where-Object { $_.name -match '^python(\.exe)?$' })) { $results.Add((New-Result -Name "python-observation" -Status "missing" -Detail "No Python process was observed during the reproduction window; short-lived processes may be missed by polling.")) }
    $manifest.logs = @(Copy-ClacklyLogs -OutputDirectory (Join-Path $session "logs"))
    $manifest.events = @(Get-WindowEvents -StartTime $started -EndTime ([datetime]::UtcNow))
  } catch { $results.Add((New-Result -Name "sampling" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message)))
  } finally {
    if ($null -ne $cacheState) {
      $cacheEvidenceSaved = $true
      try {
        if (Test-Path -LiteralPath $cachePath -PathType Leaf) {
          Copy-RedactedTextFile -Source $cachePath -Destination (Join-Path $session "runtime-probe-after.json") | Out-Null
        }
        $results.Add((Get-ProbeCacheSummary -Path (Join-Path $session "runtime-probe-after.json") -Name "probe-cache-after"))
      } catch { $cacheEvidenceSaved = $false; $results.Add((New-Result -Name "probe-cache-after" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message))) }
      try {
        $restore = Restore-ProbeCache -State $cacheState -RemoveCurrentCache:$cacheEvidenceSaved
        $results.Add($restore)
        $cacheRestoreOk = $restore.status -eq "ok"
        if ($cacheRestoreOk) {
          $cacheState = $null
          Write-RecoveryJournal -Path $recoveryPath -State $cacheState -WerSnapshot $werSnapshot
        }
      } catch { $cacheRestoreOk = $false; $results.Add((New-Result -Name "probe-cache-restore" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message))) }
    }
    if ($null -ne $werSnapshot) {
      try {
        Restore-RegistrySnapshot -Snapshot $werSnapshot
        $werSnapshot = $null
        Write-RecoveryJournal -Path $recoveryPath -State $cacheState -WerSnapshot $werSnapshot
        $results.Add((New-Result -Name "wer-restore" -Status "ok"))
      } catch { $werRestoreOk = $false; $results.Add((New-Result -Name "wer-restore" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message))) }
    }
    if ($previousRecoveryOk -and $cacheRestoreOk -and $werRestoreOk -and (Test-Path -LiteralPath $recoveryPath)) {
      try { Remove-Item -LiteralPath $recoveryPath -Force -ErrorAction Stop }
      catch { $cacheRestoreOk = $false; $results.Add((New-Result -Name "recovery-journal-cleanup" -Status "error" -Detail (Redact-DiagnosticText $_.Exception.Message))) }
    }
  }
  $exitCode = 0
  if (!$previousRecoveryOk -or !$cacheRestoreOk -or !$werRestoreOk) {
    $exitCode = 1
    Write-Host ("恢复未完成，请保留原始采样目录和 recovery.json，联系支持人员：" + $session)
  }
  $manifest.endedAt = ([datetime]::UtcNow).ToString("o")
  $collectionItems = @($results.ToArray()) + @($manifest.logs) + @($manifest.events) + @($manifest.environmentOverrides)
  if ($null -ne $manifest.installation) { $collectionItems += @($manifest.installation.files) + @($manifest.installation.packageVersion) + @($manifest.installation.utilityScript) }
  if ($null -ne $manifest.resolveInstallation) { foreach ($root in $manifest.resolveInstallation.installations) { $collectionItems += @($root.files) } }
  $issues = @($collectionItems | Where-Object { $null -ne $_ -and $_.PSObject.Properties['status'] -and $_.status -ne "ok" })
  if ($issues.Count -gt 0) {
    Write-Host "采集失败、缺失或跳过项（详细信息见 manifest.json）："
    foreach ($item in $issues) {
      $label = if ($item.PSObject.Properties['name']) { $item.name } elseif ($item.PSObject.Properties['label']) { $item.label } else { $item.scope }
      $detail = if ($item.PSObject.Properties['detail']) { $item.detail } else { "" }
      Write-Host ("  [" + $item.status + "] " + $label + " " + $detail)
    }
  }
  Write-JsonFile -Path (Join-Path $session "manifest.json") -Value $manifest
  $normalZip = Join-Path $base ("Clackly-Diagnostics-" + $stamp + "-" + $samplerId + ".zip")
  try { New-DiagnosticZip -Root $session -Destination $normalZip; Write-Host ("普通诊断 ZIP：" + $normalZip) } catch { Write-Host ("普通 ZIP 生成失败，原始目录保留在：" + $session); return [pscustomobject]@{ ExitCode = 1; RequiresElevation = $false } }
  if ((Test-Path -LiteralPath $dumpDirectory -PathType Container) -and @(Get-ChildItem -LiteralPath $dumpDirectory -Filter "*.dmp" -File -Recurse).Count -gt 0) {
    $dumpZip = Join-Path $base ("Clackly-Diagnostics-DUMPS-SENSITIVE-" + $stamp + "-" + $samplerId + ".zip")
    try {
      Write-Utf8File -Path (Join-Path $dumpDirectory "DUMP-PRIVACY.txt") -Text "敏感文件：此 ZIP 包含 python.exe 的 mini dump，可能含进程内存、路径或其他私密内容。请单独复核后再发送。"
      New-DiagnosticZip -Root $session -Destination $dumpZip -DumpOnly; Write-Host ("敏感 dump ZIP：" + $dumpZip)
    } catch { $exitCode = 1; Write-Host ("敏感 dump ZIP 生成失败；dump 保留在：" + $dumpDirectory) }
  }
  Write-Host "采样器不会自动上传文件。请在发送前复核 ZIP 内容。"
  return [pscustomobject]@{ ExitCode = $exitCode; RequiresElevation = $false }
}

function Test-NoWindowsHost { return $env:OS -eq "Windows_NT" }

function Invoke-DiagnosticSelfTest {
  $root = Join-Path ([System.IO.Path]::GetTempPath()) ("clackly-diagnostic-selftest-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $root | Out-Null
  try {
    $redactionCaseInsensitive = (Redact-DiagnosticText $env:USERPROFILE.ToUpperInvariant()) -eq "<USERPROFILE>"
    $cache = Join-Path $root "runtime-probe.json"; Write-Utf8File -Path $cache -Text '{"schemaVersion":1,"result":{"ok":true,"probeStatus":"passed","effectiveStatus":"ready"}}'
    $recovery = Join-Path $root "recovery.json"; $evidence = Join-Path $root "evidence"; New-Item -ItemType Directory -Path $evidence | Out-Null
    $state = Backup-ProbeCache -CachePath $cache -EvidenceDirectory $evidence -RecoveryPath $recovery -SamplerId "selftest"
    $cacheParsed = (Get-ProbeCacheSummary -Path (Join-Path $evidence "runtime-probe-before.json") -Name "probe-cache-before").status -eq "ok"
    Write-Utf8File -Path $cache -Text '{"new":true}'; $restore = Restore-ProbeCache -State $state -RemoveCurrentCache
    $cacheRestored = ($restore.status -eq "ok") -and ((Get-Content -Encoding UTF8 -LiteralPath $cache -Raw) -match 'schemaVersion')
    $state2 = Backup-ProbeCache -CachePath $cache -EvidenceDirectory $evidence -RecoveryPath $recovery -SamplerId "collision"
    Write-Utf8File -Path $cache -Text '{"foreign":true}'; $collision = Restore-ProbeCache -State $state2
    $collisionPreserved = $collision.status -eq "error" -and (Get-Content -Encoding UTF8 -LiteralPath $cache -Raw) -match 'foreign' -and (Test-Path -LiteralPath $state2.quarantinePath)
    $testSubKey = "Software\ClacklyDiagnosticSamplerSelfTest\" + [Guid]::NewGuid().ToString("N")
    $base = Get-RegistryBase ([Microsoft.Win32.RegistryHive]::CurrentUser); $key = $base.CreateSubKey($testSubKey); $key.SetValue("DumpType", 2, [Microsoft.Win32.RegistryValueKind]::DWord); $key.Dispose(); $base.Dispose()
    $snapshot = Get-RegistrySnapshot -SubKey $testSubKey -Hive ([Microsoft.Win32.RegistryHive]::CurrentUser)
    $registryJournal = Join-Path $root "registry-recovery.json"; Write-RecoveryJournal -Path $registryJournal -WerSnapshot $snapshot
    Set-WerDumpConfiguration -SubKey $testSubKey -DumpFolder $root -Hive ([Microsoft.Win32.RegistryHive]::CurrentUser)
    $base = Get-RegistryBase ([Microsoft.Win32.RegistryHive]::CurrentUser); $key = $base.OpenSubKey($testSubKey, $false); $registryConfigured = ($key.GetValue("DumpFolder") -eq $root -and $key.GetValue("DumpCount") -eq 3 -and $key.GetValue("DumpType") -eq 1); $key.Dispose(); $base.Dispose()
    $recoveryResult = Recover-PendingState -RecoveryPath $registryJournal
    $base = Get-RegistryBase ([Microsoft.Win32.RegistryHive]::CurrentUser); $key = $base.OpenSubKey($testSubKey, $false); $registryRestored = ($recoveryResult.status -eq "ok" -and $key.GetValue("DumpType") -eq 2 -and @($key.GetValueNames()).Count -eq 1 -and !(Test-Path -LiteralPath $registryJournal)); $key.Dispose(); $base.DeleteSubKeyTree($testSubKey, $false); $base.Dispose()
    $failedWerSetup = Enable-WerDumpCapture -SubKey ($testSubKey + "-failure") -DumpDirectory $root -RecoveryPath $root -Hive ([Microsoft.Win32.RegistryHive]::CurrentUser)
    $werFailureContinues = $failedWerSetup.result.status -eq "error"
    $samplerExcluded = !(Test-RelevantProcess ([pscustomobject]@{ Name = "powershell.exe"; CommandLine = "powershell.exe -File C:\Clackly\Collect-ClacklyDiagnostics.ps1" })) -and (Test-RelevantProcess ([pscustomobject]@{ Name = "python.exe"; CommandLine = "python.exe" }))
    $records = @{}; $now = [datetime]::UtcNow
    Add-ProcessObservations -Records $records -Processes @([pscustomobject]@{ ProcessId = 1; ParentProcessId = 0; Name = "python.exe"; ExecutablePath = "C:\python.exe"; CommandLine = "python"; CreationDate = "a" }, [pscustomobject]@{ ProcessId = 1; ParentProcessId = 0; Name = "python.exe"; ExecutablePath = "C:\python.exe"; CommandLine = "python"; CreationDate = "a" }, [pscustomobject]@{ ProcessId = 1; ParentProcessId = 0; Name = "python.exe"; ExecutablePath = "C:\python.exe"; CommandLine = "python"; CreationDate = "b" }) -ObservedAt $now
    $dedupe = $records.Count -eq 2
    $results = New-Object System.Collections.Generic.List[object]; $results.Add((Invoke-EvidenceItem -Name "ok" -Action { "yes" })); $results.Add((Invoke-EvidenceItem -Name "fail" -Action { throw "expected" }))
    $continued = ($results.Count -eq 2) -and ($results[1].status -eq "error")
    $sample = Join-Path $root "sample"; $dump = Join-Path $sample "dumps-sensitive"; New-Item -ItemType Directory -Path $dump -Force | Out-Null; Write-Utf8File -Path (Join-Path $sample "manifest.json") -Text '{}'; Write-Utf8File -Path (Join-Path $sample "stray.dmp") -Text 'dump'; Write-Utf8File -Path (Join-Path $dump "a.dmp") -Text 'dump'
    $normalZip = Join-Path $root "normal.zip"; $dumpZip = Join-Path $root "dump.zip"; New-DiagnosticZip -Root $sample -Destination $normalZip; New-DiagnosticZip -Root $sample -Destination $dumpZip -DumpOnly
    Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $normal = [System.IO.Compression.ZipFile]::OpenRead($normalZip); $normalEntries = @($normal.Entries | ForEach-Object { $_.FullName }); $normal.Dispose(); $dumps = [System.IO.Compression.ZipFile]::OpenRead($dumpZip); $dumpEntries = @($dumps.Entries | ForEach-Object { $_.FullName }); $dumps.Dispose()
    [pscustomobject]@{ redactionCaseInsensitive = $redactionCaseInsensitive; cacheParsed = $cacheParsed; cacheRestored = $cacheRestored; collisionPreserved = $collisionPreserved; registryConfigured = $registryConfigured; registryRestored = $registryRestored; werFailureContinues = $werFailureContinues; samplerExcluded = $samplerExcluded; processDeduplicated = $dedupe; failureContinues = $continued; normalExcludesDump = !($normalEntries -match '\.dmp$'); dumpSeparate = [bool]($dumpEntries -match 'a\.dmp$') }
  } finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
}

if ($SelfTest) {
  try { Invoke-DiagnosticSelfTest | ConvertTo-Json -Compress; exit 0 } catch { Write-Error $_; exit 1 }
}

function Invoke-DiagnosticEntry {
  param([Parameter(Mandatory = $true)][string]$SamplerPath)
  $run = Invoke-DiagnosticSampler -SkipDumpPrompt:$SkipDumpPrompt
  if ($run.RequiresElevation) {
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $SamplerPath + '" -Elevated -EnableDumps'
    if (![string]::IsNullOrWhiteSpace($OutputRoot)) {
      $forwardOutput = Get-CanonicalPath $OutputRoot
      if ($forwardOutput.EndsWith([string][char]92)) { $forwardOutput += '.' }
      $arguments += ' -OutputRoot "' + $forwardOutput + '"'
    }
    try {
      $child = Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") -Verb RunAs -Wait -PassThru -ArgumentList $arguments
      return [int]$child.ExitCode
    } catch {
      $reason = "UAC authorization was declined or elevation could not start: " + $_.Exception.Message + " Ordinary sampling continues."
      Write-Host "管理员授权被拒绝或无法启动；继续普通采样，并将原因记录到诊断包。"
      $run = Invoke-DiagnosticSampler -SkipDumpPrompt -DumpUnavailableReason $reason
    }
  }
  return [int]$run.ExitCode
}
exit (Invoke-DiagnosticEntry -SamplerPath $PSCommandPath)
