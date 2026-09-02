Set-StrictMode -Version Latest

$script:ClacklyPluginId = "com.wutpeach.clackly"
$script:ClacklyNativeSize = 379904L
$script:ClacklyNativeSha256 = "C442DFD013DA2244F53BA8B36B9439CCCC197DF90B999D0074031C6D921B7B05"
$script:ClacklyExit = @{
  Success = 0
  InvalidPackage = 10
  UnsupportedHost = 11
  ResolveRunning = 12
  Elevation = 13
  UnsafeTarget = 14
  Staging = 15
  Activation = 16
  Rollback = 17
  Cleanup = 18
}

function New-ClacklyResult {
  param([int]$Code, [string]$Message, [string[]]$RetainedPaths = @())
  $normalizedPaths = @($RetainedPaths | Where-Object { ![string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
  return [pscustomobject]@{
    Success = ($Code -eq $script:ClacklyExit.Success)
    Code = $Code
    Message = $Message
    RetainedPath = if ($normalizedPaths.Count -gt 0) { $normalizedPaths[0] } else { "" }
    RetainedPaths = @($normalizedPaths)
  }
}

function Throw-ClacklyError {
  param([int]$Code, [string]$Message)
  $exception = New-Object System.InvalidOperationException $Message
  $exception.Data["ClacklyExitCode"] = $Code
  throw $exception
}

function Get-ClacklyErrorCode {
  param($ErrorRecord, [int]$DefaultCode)
  if ($null -ne $ErrorRecord.Exception -and $ErrorRecord.Exception.Data.Contains("ClacklyExitCode")) {
    return [int]$ErrorRecord.Exception.Data["ClacklyExitCode"]
  }
  return $DefaultCode
}

function Get-ClacklyProductionPluginRoot {
  if ([string]::IsNullOrWhiteSpace($env:PROGRAMDATA)) {
    Throw-ClacklyError $script:ClacklyExit.UnsupportedHost "PROGRAMDATA is unavailable; Clackly Beta supports Windows Resolve installations only."
  }
  return Join-Path $env:PROGRAMDATA "Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"
}

function Get-ClacklyCanonicalPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [System.IO.Path]::GetFullPath($Path)
}

function Get-ClacklyWindowsPowerShellExecutable {
  $executable = Join-Path $PSHOME "powershell.exe"
  # $PSHOME is the already-running Windows PowerShell host location, not package or
  # user input. Windows system aliases may appear as reparse points to generic checks.
  if (![System.IO.File]::Exists($executable)) {
    Throw-ClacklyError $script:ClacklyExit.Elevation "Windows PowerShell executable is unavailable under PSHOME."
  }
  return $executable
}

function New-ClacklyElevationArgumentList {
  param([Parameter(Mandatory = $true)][string]$ScriptPath)
  $canonicalPath = Get-ClacklyCanonicalPath $ScriptPath
  Get-ClacklySafeItem -Path $canonicalPath -File -ErrorCode $script:ClacklyExit.Elevation | Out-Null
  # Start-Process accepts a native command-line string. Windows parses the double-quoted
  # -File value as one argv token; PowerShell single quotes are not native argv quoting.
  return '-NoProfile -ExecutionPolicy Bypass -File "' + $canonicalPath + '" -Elevated'
}

function Get-ClacklySha256 {
  param([Parameter(Mandatory = $true)][string]$Path)
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "")
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Test-ClacklyContainedPath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Candidate,
    [switch]$AllowRoot
  )
  $rootPath = (Get-ClacklyCanonicalPath $Root).TrimEnd('\', '/')
  $candidatePath = Get-ClacklyCanonicalPath $Candidate
  if ($AllowRoot -and [string]::Equals($rootPath, $candidatePath.TrimEnd('\', '/'), [System.StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  return $candidatePath.StartsWith($rootPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-ClacklySafeRelativePath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  if ([string]::IsNullOrWhiteSpace($RelativePath) -or $RelativePath.StartsWith('/') -or $RelativePath.Contains('\') -or $RelativePath.Contains(':')) {
    Throw-ClacklyError $script:ClacklyExit.InvalidPackage "Unsafe package inventory path: $RelativePath"
  }
  foreach ($segment in $RelativePath.Split('/')) {
    if ([string]::IsNullOrWhiteSpace($segment) -or $segment -eq '.' -or $segment -eq '..' -or $segment.IndexOfAny([char[]]'<>"|?*') -ge 0) {
      Throw-ClacklyError $script:ClacklyExit.InvalidPackage "Unsafe package inventory path: $RelativePath"
    }
  }
  return $RelativePath
}

function Get-ClacklySafeItem {
  param([Parameter(Mandatory = $true)][string]$Path, [switch]$Directory, [switch]$File, [int]$ErrorCode = $script:ClacklyExit.InvalidPackage)
  try {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  } catch [System.Management.Automation.ItemNotFoundException] {
    Throw-ClacklyError $ErrorCode "Required path is missing: $Path"
  } catch {
    Throw-ClacklyError $ErrorCode "Required path could not be inspected safely: $Path"
  }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $null -ne $item.LinkType) {
    Throw-ClacklyError $ErrorCode "Reparse point or link is not allowed: $Path"
  }
  if ($Directory -and !$item.PSIsContainer) {
    Throw-ClacklyError $ErrorCode "Expected a directory: $Path"
  }
  if ($File -and $item.PSIsContainer) {
    Throw-ClacklyError $ErrorCode "Expected a file: $Path"
  }
  return $item
}

function Get-ClacklyExistingItemOrNull {
  param([Parameter(Mandatory = $true)][string]$Path, [int]$ErrorCode = $script:ClacklyExit.UnsafeTarget)
  try {
    return Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  } catch [System.Management.Automation.ItemNotFoundException] {
    # Test-Path follows a broken link and reports it as missing. Inspect the parent directory
    # directly so an existing dangling reparse entry is rejected instead of treated as absent.
    $parentPath = Split-Path -Parent $Path
    $leaf = Split-Path -Leaf $Path
    try {
      $parent = Get-Item -LiteralPath $parentPath -Force -ErrorAction Stop
    } catch [System.Management.Automation.ItemNotFoundException] {
      return $null
    } catch {
      Throw-ClacklyError $ErrorCode "Existing Clackly target parent could not be inspected safely."
    }
    if (!$parent.PSIsContainer -or ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $null -ne $parent.LinkType) {
      Throw-ClacklyError $ErrorCode "Existing Clackly target parent is not a normal directory."
    }
    try {
      foreach ($child in @(Get-ChildItem -LiteralPath $parent.FullName -Force -ErrorAction Stop)) {
        if ([string]::Equals($child.Name, $leaf, [System.StringComparison]::OrdinalIgnoreCase)) {
          return $child
        }
      }
      return $null
    } catch {
      Throw-ClacklyError $ErrorCode "Existing Clackly target could not be inspected safely."
    }
  } catch {
    Throw-ClacklyError $ErrorCode "Existing Clackly target could not be inspected safely."
  }
}

function Assert-ClacklyNormalAncestorChain {
  param([Parameter(Mandatory = $true)][string]$Path, [int]$ErrorCode = $script:ClacklyExit.InvalidPackage)
  $canonicalPath = Get-ClacklyCanonicalPath $Path
  $volumeRoot = [System.IO.Path]::GetPathRoot($canonicalPath)
  if ([string]::IsNullOrWhiteSpace($volumeRoot)) {
    Throw-ClacklyError $ErrorCode "Path does not have a normal Windows volume root: $Path"
  }
  $relative = $canonicalPath.Substring($volumeRoot.Length).Trim('\', '/')
  $current = $volumeRoot
  $segments = @()
  if (![string]::IsNullOrWhiteSpace($relative)) {
    $segments = @($relative.Replace('/', '\').Split([char]'\') | Where-Object { ![string]::IsNullOrWhiteSpace($_) })
  }
  foreach ($segment in @("__volume_root__") + $segments) {
    if ($segment -ne "__volume_root__") { $current = Join-Path $current $segment }
    $item = Get-ClacklyExistingItemOrNull -Path $current -ErrorCode $ErrorCode
    if ($null -eq $item) { return }
    if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $null -ne $item.LinkType) {
      Throw-ClacklyError $ErrorCode "Path has a non-normal ancestor and will not be used: $current"
    }
  }
}

function Assert-ClacklyNormalTree {
  param([Parameter(Mandatory = $true)][string]$Root, [int]$ErrorCode = $script:ClacklyExit.InvalidPackage)
  try {
    $rootItem = Get-ClacklySafeItem -Path $Root -Directory -ErrorCode $ErrorCode
    $pending = New-Object System.Collections.Stack
    $pending.Push($rootItem.FullName)
    while ($pending.Count -gt 0) {
      $current = $pending.Pop()
      foreach ($child in @(Get-ChildItem -LiteralPath $current -Force -ErrorAction Stop)) {
        if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $null -ne $child.LinkType) {
          Throw-ClacklyError $ErrorCode "Reparse point or link is not allowed: $($child.FullName)"
        }
        if ($child.PSIsContainer) {
          $pending.Push($child.FullName)
        }
      }
    }
  } catch {
    if ($_.Exception.Data.Contains("ClacklyExitCode")) { throw }
    Throw-ClacklyError $ErrorCode "Directory tree could not be inspected safely: $Root"
  }
}

function Get-ClacklyTreeInventory {
  param([Parameter(Mandatory = $true)][string]$Root, [string]$ExcludeRelativePath = "")
  Assert-ClacklyNormalTree -Root $Root
  $rootPath = Get-ClacklyCanonicalPath $Root
  $files = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  foreach ($file in @(Get-ChildItem -LiteralPath $rootPath -File -Force -Recurse -ErrorAction Stop | Sort-Object FullName)) {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $null -ne $file.LinkType) {
      Throw-ClacklyError $script:ClacklyExit.InvalidPackage "Reparse point or link is not allowed: $($file.FullName)"
    }
    $relative = $file.FullName.Substring($rootPath.TrimEnd('\', '/').Length).TrimStart('\', '/').Replace('\', '/')
    Assert-ClacklySafeRelativePath $relative | Out-Null
    if ($relative -eq $ExcludeRelativePath) { continue }
    $key = $relative.ToUpperInvariant()
    if ($seen.ContainsKey($key)) {
      Throw-ClacklyError $script:ClacklyExit.InvalidPackage "Case-colliding package inventory path: $relative"
    }
    $seen[$key] = $true
    $hash = Get-ClacklySha256 -Path $file.FullName
    $files.Add([pscustomobject]@{ RelativePath = $relative; Sha256 = $hash; Length = [int64]$file.Length })
  }
  return @($files | Sort-Object RelativePath)
}

function Read-ClacklyHashManifest {
  param([Parameter(Mandatory = $true)][string]$PackageRoot)
  $path = Join-Path $PackageRoot "SHA256SUMS.txt"
  Get-ClacklySafeItem -Path $path -File | Out-Null
  $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $result = @{}
  foreach ($line in @($text -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch '^([A-Fa-f0-9]{64})  (.+)$') {
      Throw-ClacklyError $script:ClacklyExit.InvalidPackage "Malformed SHA256SUMS entry."
    }
    $relative = Assert-ClacklySafeRelativePath $Matches[2]
    $key = $relative.ToUpperInvariant()
    if ($result.ContainsKey($key)) {
      Throw-ClacklyError $script:ClacklyExit.InvalidPackage "Duplicate or case-colliding SHA256SUMS entry: $relative"
    }
    $result[$key] = [pscustomobject]@{ RelativePath = $relative; Sha256 = $Matches[1].ToUpperInvariant() }
  }
  if ($result.Count -eq 0) {
    Throw-ClacklyError $script:ClacklyExit.InvalidPackage "SHA256SUMS.txt is empty."
  }
  return $result
}

function Test-ClacklyHashInventory {
  param([Parameter(Mandatory = $true)][string]$PackageRoot)
  $expected = Read-ClacklyHashManifest -PackageRoot $PackageRoot
  $actual = Get-ClacklyTreeInventory -Root $PackageRoot -ExcludeRelativePath "SHA256SUMS.txt"
  if ($expected.Count -ne $actual.Count) {
    Throw-ClacklyError $script:ClacklyExit.InvalidPackage "SHA256SUMS inventory does not match the package file inventory."
  }
  foreach ($entry in $actual) {
    $key = $entry.RelativePath.ToUpperInvariant()
    if (!$expected.ContainsKey($key) -or $expected[$key].RelativePath -cne $entry.RelativePath -or $expected[$key].Sha256 -cne $entry.Sha256) {
      Throw-ClacklyError $script:ClacklyExit.InvalidPackage "SHA256SUMS verification failed: $($entry.RelativePath)"
    }
  }
  return $actual
}

function Get-ClacklyPluginMetadata {
  param([Parameter(Mandatory = $true)][string]$AppRoot, [int]$ErrorCode = $script:ClacklyExit.InvalidPackage)
  try {
    Get-ClacklySafeItem -Path (Join-Path $AppRoot "manifest.xml") -File -ErrorCode $ErrorCode | Out-Null
    Get-ClacklySafeItem -Path (Join-Path $AppRoot "package.json") -File -ErrorCode $ErrorCode | Out-Null
    $xml = [xml][System.IO.File]::ReadAllText((Join-Path $AppRoot "manifest.xml"), [System.Text.Encoding]::UTF8)
    $package = [System.IO.File]::ReadAllText((Join-Path $AppRoot "package.json"), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $id = [string]$xml.BlackmagicDesign.Plugin.Id
    $manifestVersion = [string]$xml.BlackmagicDesign.Plugin.Version
    $packageVersion = [string]$package.version
    if ($id -ne $script:ClacklyPluginId -or $manifestVersion -ne $packageVersion -or $manifestVersion -notmatch '^\d+\.\d+\.\d+$') {
      Throw-ClacklyError $ErrorCode "Workflow plugin identity or version is invalid."
    }
    return [pscustomobject]@{ Id = $id; Version = $manifestVersion; VersionObject = [Version]$manifestVersion }
  } catch {
    if ($_.Exception.Data.Contains("ClacklyExitCode")) { throw }
    Throw-ClacklyError $ErrorCode "Workflow plugin metadata could not be read."
  }
}

function Assert-ClacklyNativeModule {
  param([Parameter(Mandatory = $true)][string]$AppRoot, [int]$ErrorCode = $script:ClacklyExit.InvalidPackage)
  $nodePath = Join-Path $AppRoot "workflow-plugin\WorkflowIntegration.node"
  try {
    $node = Get-ClacklySafeItem -Path $nodePath -File -ErrorCode $ErrorCode
    $hash = Get-ClacklySha256 -Path $node.FullName
    if ($node.Length -ne $script:ClacklyNativeSize -or $hash -cne $script:ClacklyNativeSha256) {
      Throw-ClacklyError $ErrorCode "WorkflowIntegration.node does not match the qualified internal Beta identity."
    }
  } catch {
    if ($_.Exception.Data.Contains("ClacklyExitCode")) { throw }
    Throw-ClacklyError $ErrorCode "WorkflowIntegration.node could not be verified."
  }
}

function Get-ClacklyExpectedInstalledInventory {
  param([Parameter(Mandatory = $true)]$Package)
  $expected = @{}
  foreach ($entry in (Get-ClacklyTreeInventory -Root $Package.AppRoot)) {
    if ($entry.RelativePath -ieq "resources/runtimes" -or $entry.RelativePath.StartsWith("resources/runtimes/", [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-ClacklyError $script:ClacklyExit.InvalidPackage "The packaged app must not contain an embedded runtime tree."
    }
    $expected[$entry.RelativePath.ToUpperInvariant()] = $entry
  }
  foreach ($entry in (Get-ClacklyTreeInventory -Root $Package.RuntimeRoot)) {
    $relative = "resources/runtimes/" + $entry.RelativePath
    $key = $relative.ToUpperInvariant()
    if ($expected.ContainsKey($key)) {
      Throw-ClacklyError $script:ClacklyExit.InvalidPackage "Installed tree inventory has a duplicate path: $relative"
    }
    $expected[$key] = [pscustomobject]@{ RelativePath = $relative; Sha256 = $entry.Sha256; Length = $entry.Length }
  }
  return $expected
}

function Test-ClacklyPackage {
  param([Parameter(Mandatory = $true)][string]$PackageRoot)
  $root = Get-ClacklyCanonicalPath $PackageRoot
  Assert-ClacklyNormalAncestorChain -Path $root -ErrorCode $script:ClacklyExit.InvalidPackage
  Get-ClacklySafeItem -Path $root -Directory | Out-Null
  Test-ClacklyHashInventory -PackageRoot $root | Out-Null
  $installBat = [string]::Concat([char]0x5B89, [char]0x88C5, " Clackly.bat")
  $uninstallBat = [string]::Concat([char]0x5378, [char]0x8F7D, " Clackly.bat")
  foreach ($relative in @($installBat, $uninstallBat, "README.txt", "tools/Install-Clackly.ps1", "tools/Uninstall-Clackly.ps1", "tools/ClacklyInstaller.psm1")) {
    Get-ClacklySafeItem -Path (Join-Path $root $relative.Replace('/', '\')) -File | Out-Null
  }
  $appRoot = Join-Path $root "payload\win-unpacked\resources\app"
  $runtimeRoot = Join-Path $root "payload\win-unpacked\resources\runtimes"
  Get-ClacklySafeItem -Path $appRoot -Directory | Out-Null
  Get-ClacklySafeItem -Path $runtimeRoot -Directory | Out-Null
  Get-ClacklySafeItem -Path (Join-Path $appRoot "workflow-plugin\main.js") -File | Out-Null
  Get-ClacklySafeItem -Path (Join-Path $runtimeRoot "manifest.json") -File | Out-Null
  $metadata = Get-ClacklyPluginMetadata -AppRoot $appRoot
  Assert-ClacklyNativeModule -AppRoot $appRoot
  $package = [pscustomobject]@{ Root = $root; AppRoot = $appRoot; RuntimeRoot = $runtimeRoot; Id = $metadata.Id; Version = $metadata.Version; VersionObject = $metadata.VersionObject }
  $package | Add-Member -NotePropertyName ExpectedInstalledInventory -NotePropertyValue (Get-ClacklyExpectedInstalledInventory -Package $package)
  return $package
}

function Assert-ClacklyInstalledTree {
  param([Parameter(Mandatory = $true)][string]$Target, [Parameter(Mandatory = $true)]$Package)
  Get-ClacklySafeItem -Path $Target -Directory -ErrorCode $script:ClacklyExit.Activation | Out-Null
  $metadata = Get-ClacklyPluginMetadata -AppRoot $Target -ErrorCode $script:ClacklyExit.Activation
  if ($metadata.Id -ne $Package.Id -or $metadata.Version -ne $Package.Version) {
    Throw-ClacklyError $script:ClacklyExit.Activation "Installed plugin identity does not match the verified package."
  }
  Assert-ClacklyNativeModule -AppRoot $Target -ErrorCode $script:ClacklyExit.Activation
  Get-ClacklySafeItem -Path (Join-Path $Target "resources\runtimes\manifest.json") -File -ErrorCode $script:ClacklyExit.Activation | Out-Null
  $actual = Get-ClacklyTreeInventory -Root $Target
  if ($actual.Count -ne $Package.ExpectedInstalledInventory.Count) {
    Throw-ClacklyError $script:ClacklyExit.Activation "Installed plugin inventory does not match the verified package."
  }
  foreach ($entry in $actual) {
    $key = $entry.RelativePath.ToUpperInvariant()
    if (!$Package.ExpectedInstalledInventory.ContainsKey($key) -or $Package.ExpectedInstalledInventory[$key].RelativePath -cne $entry.RelativePath -or $Package.ExpectedInstalledInventory[$key].Sha256 -cne $entry.Sha256) {
      Throw-ClacklyError $script:ClacklyExit.Activation "Installed plugin verification failed: $($entry.RelativePath)"
    }
  }
}

function Get-ClacklyRecognizedTarget {
  param([Parameter(Mandatory = $true)][string]$Target)
  $item = Get-ClacklyExistingItemOrNull -Path $Target -ErrorCode $script:ClacklyExit.UnsafeTarget
  if ($null -eq $item) { return $null }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $null -ne $item.LinkType -or !$item.PSIsContainer) {
    Throw-ClacklyError $script:ClacklyExit.UnsafeTarget "Existing Clackly target is not a normal directory and will not be replaced."
  }
  Assert-ClacklyNormalTree -Root $item.FullName -ErrorCode $script:ClacklyExit.UnsafeTarget
  $metadata = Get-ClacklyPluginMetadata -AppRoot $item.FullName -ErrorCode $script:ClacklyExit.UnsafeTarget
  Assert-ClacklyNativeModule -AppRoot $item.FullName -ErrorCode $script:ClacklyExit.UnsafeTarget
  Get-ClacklySafeItem -Path (Join-Path $item.FullName "resources\runtimes\manifest.json") -File -ErrorCode $script:ClacklyExit.UnsafeTarget | Out-Null
  return $metadata
}

function Get-ClacklyResolveState {
  try {
    $processes = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='Resolve.exe'" -ErrorAction Stop)
    if ($processes.Count -gt 0) { return "running" }
    return "closed"
  } catch {
    return "indeterminate"
  }
}

function Assert-ClacklyResolveClosed {
  param([string]$ProcessState = "")
  $state = $ProcessState
  if ([string]::IsNullOrWhiteSpace($state)) { $state = Get-ClacklyResolveState }
  if ($state -ne "closed") {
    Throw-ClacklyError $script:ClacklyExit.ResolveRunning "DaVinci Resolve must be closed before changing Clackly."
  }
}

function New-ClacklySiblingPath {
  param([Parameter(Mandatory = $true)][string]$Parent, [Parameter(Mandatory = $true)][string]$Kind)
  Assert-ClacklyNormalAncestorChain -Path $Parent -ErrorCode $script:ClacklyExit.UnsafeTarget
  $candidate = Join-Path $Parent ("." + $script:ClacklyPluginId + "." + $Kind + "." + [guid]::NewGuid().ToString("N"))
  if (!(Test-ClacklyContainedPath -Root $Parent -Candidate $candidate) -or (Test-Path -LiteralPath $candidate)) {
    Throw-ClacklyError $script:ClacklyExit.Staging "Could not allocate a contained transaction directory."
  }
  return $candidate
}

function Copy-ClacklyDirectoryContents {
  param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][string]$Destination)
  Assert-ClacklyNormalAncestorChain -Path $Source
  Assert-ClacklyNormalAncestorChain -Path $Destination -ErrorCode $script:ClacklyExit.Staging
  Assert-ClacklyNormalTree -Root $Source
  New-Item -ItemType Directory -Path $Destination -ErrorAction Stop | Out-Null
  Assert-ClacklyNormalAncestorChain -Path $Destination -ErrorCode $script:ClacklyExit.Staging
  foreach ($child in @(Get-ChildItem -LiteralPath $Source -Force -ErrorAction Stop)) {
    Copy-Item -LiteralPath $child.FullName -Destination $Destination -Recurse -Force -ErrorAction Stop
  }
}

function Remove-ClacklyOwnedTree {
  param([string]$Path, [string]$Parent)
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  if (!(Test-ClacklyContainedPath -Root $Parent -Candidate $Path) -or !(Split-Path -Leaf $Path).StartsWith("." + $script:ClacklyPluginId + ".", [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-ClacklyError $script:ClacklyExit.Cleanup "Refusing to remove a path outside Clackly transaction ownership."
  }
  Assert-ClacklyNormalAncestorChain -Path $Parent -ErrorCode $script:ClacklyExit.Cleanup
  Assert-ClacklyNormalAncestorChain -Path $Path -ErrorCode $script:ClacklyExit.Cleanup
  $item = Get-ClacklyExistingItemOrNull -Path $Path -ErrorCode $script:ClacklyExit.Cleanup
  if ($null -eq $item) { return }
  Assert-ClacklyNormalTree -Root $Path
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
}

function Invoke-ClacklyFailurePoint {
  param($FailureInjector, [string]$Name)
  if ($null -ne $FailureInjector) { & $FailureInjector $Name }
}

function Get-ClacklySurvivingOwnedPaths {
  param([Parameter(Mandatory = $true)][string]$Parent, [string[]]$Candidates = @())
  $survivors = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in @($Candidates | Where-Object { ![string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)) {
    if (!(Test-ClacklyContainedPath -Root $Parent -Candidate $candidate) -or !(Split-Path -Leaf $candidate).StartsWith("." + $script:ClacklyPluginId + ".", [System.StringComparison]::OrdinalIgnoreCase)) {
      continue
    }
    try {
      $item = Get-ClacklyExistingItemOrNull -Path $candidate -ErrorCode $script:ClacklyExit.Cleanup
      if ($null -ne $item) { $survivors.Add((Get-ClacklyCanonicalPath $candidate)) }
    } catch {
      # A retained, task-owned path that became uninspectable must still be reported.
      $survivors.Add((Get-ClacklyCanonicalPath $candidate))
    }
  }
  return @($survivors | Select-Object -Unique)
}

function Invoke-ClacklyInstallTransaction {
  param(
    [Parameter(Mandatory = $true)]$Package,
    [Parameter(Mandatory = $true)][string]$PluginRoot,
    [string]$ProcessState = "closed",
    [scriptblock]$FailureInjector = $null
  )
  try {
    Assert-ClacklyResolveClosed -ProcessState $ProcessState
    $parent = Get-ClacklyCanonicalPath $PluginRoot
    Assert-ClacklyNormalAncestorChain -Path $parent -ErrorCode $script:ClacklyExit.UnsafeTarget
    $parentItem = Get-ClacklyExistingItemOrNull -Path $parent -ErrorCode $script:ClacklyExit.UnsafeTarget
    if ($null -eq $parentItem) { New-Item -ItemType Directory -Path $parent -Force -ErrorAction Stop | Out-Null }
    Assert-ClacklyNormalAncestorChain -Path $parent -ErrorCode $script:ClacklyExit.UnsafeTarget
    Get-ClacklySafeItem -Path $parent -Directory -ErrorCode $script:ClacklyExit.UnsafeTarget | Out-Null
    $target = Join-Path $parent $script:ClacklyPluginId
    if (!(Test-ClacklyContainedPath -Root $parent -Candidate $target)) {
      Throw-ClacklyError $script:ClacklyExit.UnsafeTarget "The production plugin target is not contained by its fixed parent."
    }
    $existing = Get-ClacklyRecognizedTarget -Target $target
    if ($null -ne $existing -and $existing.VersionObject -gt $Package.VersionObject) {
      Throw-ClacklyError $script:ClacklyExit.UnsafeTarget "Refusing to downgrade a newer installed Clackly Beta."
    }
  } catch {
    return New-ClacklyResult (Get-ClacklyErrorCode $_ $script:ClacklyExit.Staging) $_.Exception.Message
  }

  $stage = $null
  $backup = $null
  $failed = $null
  $committed = $false
  $hadExisting = ($null -ne $existing)
  try {
    $stage = New-ClacklySiblingPath -Parent $parent -Kind "stage"
    Invoke-ClacklyFailurePoint $FailureInjector "before-stage-copy"
    Copy-ClacklyDirectoryContents -Source $Package.AppRoot -Destination $stage
    $stageResources = Join-Path $stage "resources"
    Assert-ClacklyNormalAncestorChain -Path $stageResources -ErrorCode $script:ClacklyExit.Staging
    if (!(Test-Path -LiteralPath $stageResources)) { New-Item -ItemType Directory -Path $stageResources -Force -ErrorAction Stop | Out-Null }
    Assert-ClacklyNormalAncestorChain -Path $stageResources -ErrorCode $script:ClacklyExit.Staging
    Copy-ClacklyDirectoryContents -Source $Package.RuntimeRoot -Destination (Join-Path $stageResources "runtimes")
    Assert-ClacklyInstalledTree -Target $stage -Package $Package
    Invoke-ClacklyFailurePoint $FailureInjector "before-backup"
    if ($null -ne $existing) {
      $backup = New-ClacklySiblingPath -Parent $parent -Kind "backup"
      Assert-ClacklyNormalAncestorChain -Path $target -ErrorCode $script:ClacklyExit.UnsafeTarget
      Assert-ClacklyNormalAncestorChain -Path $backup -ErrorCode $script:ClacklyExit.UnsafeTarget
      Move-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
    }
    Invoke-ClacklyFailurePoint $FailureInjector "after-backup"
    Assert-ClacklyNormalAncestorChain -Path $stage -ErrorCode $script:ClacklyExit.Staging
    Assert-ClacklyNormalAncestorChain -Path $target -ErrorCode $script:ClacklyExit.UnsafeTarget
    Move-Item -LiteralPath $stage -Destination $target -ErrorAction Stop
    $stage = $null
    Invoke-ClacklyFailurePoint $FailureInjector "after-activation"
    Assert-ClacklyInstalledTree -Target $target -Package $Package
    Invoke-ClacklyFailurePoint $FailureInjector "after-verify"
    $committed = $true
  } catch {
    $failure = $_
    try {
      $targetItem = Get-ClacklyExistingItemOrNull -Path $target -ErrorCode $script:ClacklyExit.Rollback
      if ($null -eq $stage -and $null -ne $targetItem) {
        Get-ClacklySafeItem -Path $target -Directory -ErrorCode $script:ClacklyExit.Rollback | Out-Null
        $failed = New-ClacklySiblingPath -Parent $parent -Kind "failed"
        Assert-ClacklyNormalAncestorChain -Path $target -ErrorCode $script:ClacklyExit.Rollback
        Assert-ClacklyNormalAncestorChain -Path $failed -ErrorCode $script:ClacklyExit.Rollback
        Move-Item -LiteralPath $target -Destination $failed -ErrorAction Stop
      }
      if ($null -ne $backup) {
        $backupItem = Get-ClacklyExistingItemOrNull -Path $backup -ErrorCode $script:ClacklyExit.Rollback
        if ($null -eq $backupItem) {
          Throw-ClacklyError $script:ClacklyExit.Rollback "Expected Clackly backup is missing; restoration cannot be verified."
        }
        Get-ClacklySafeItem -Path $backup -Directory -ErrorCode $script:ClacklyExit.Rollback | Out-Null
        Invoke-ClacklyFailurePoint $FailureInjector "before-restore"
        Assert-ClacklyNormalAncestorChain -Path $backup -ErrorCode $script:ClacklyExit.Rollback
        Assert-ClacklyNormalAncestorChain -Path $target -ErrorCode $script:ClacklyExit.Rollback
        Move-Item -LiteralPath $backup -Destination $target -ErrorAction Stop
        Get-ClacklyRecognizedTarget -Target $target | Out-Null
        $backup = $null
      }
      if ($null -ne $failed) { Invoke-ClacklyFailurePoint $FailureInjector "before-failed-cleanup"; Remove-ClacklyOwnedTree -Path $failed -Parent $parent; $failed = $null }
      if ($null -ne $stage) { Remove-ClacklyOwnedTree -Path $stage -Parent $parent; $stage = $null }
      if ($hadExisting) {
        return New-ClacklyResult $script:ClacklyExit.Activation ("Installation failed and the previous installation was restored: " + $failure.Exception.Message)
      }
      return New-ClacklyResult $script:ClacklyExit.Activation ("Installation failed; no previous Clackly installation was present: " + $failure.Exception.Message)
    } catch {
      $survivors = Get-ClacklySurvivingOwnedPaths -Parent $parent -Candidates @($stage, $backup, $failed)
      return New-ClacklyResult $script:ClacklyExit.Rollback ("Installation failed and rollback could not be completed: " + $_.Exception.Message) -RetainedPaths $survivors
    }
  }

  try {
    Invoke-ClacklyFailurePoint $FailureInjector "cleanup"
    if ($null -ne $backup) { Remove-ClacklyOwnedTree -Path $backup -Parent $parent; $backup = $null }
    if ($null -ne $stage) { Remove-ClacklyOwnedTree -Path $stage -Parent $parent; $stage = $null }
    return New-ClacklyResult $script:ClacklyExit.Success "Clackly was installed successfully. Start Resolve, then choose Workspace > Workflow Integrations > Clackly."
  } catch {
    $survivors = Get-ClacklySurvivingOwnedPaths -Parent $parent -Candidates @($stage, $backup, $failed)
    return New-ClacklyResult $script:ClacklyExit.Cleanup ("Clackly was installed and verified, but transaction cleanup needs attention: " + $_.Exception.Message) -RetainedPaths $survivors
  }
}

function Invoke-ClacklyUninstallTransaction {
  param(
    [Parameter(Mandatory = $true)][string]$PluginRoot,
    [string]$ProcessState = "closed",
    [scriptblock]$FailureInjector = $null
  )
  try {
    Assert-ClacklyResolveClosed -ProcessState $ProcessState
    $parent = Get-ClacklyCanonicalPath $PluginRoot
    Assert-ClacklyNormalAncestorChain -Path $parent -ErrorCode $script:ClacklyExit.UnsafeTarget
    $parentItem = Get-ClacklyExistingItemOrNull -Path $parent -ErrorCode $script:ClacklyExit.UnsafeTarget
    if ($null -eq $parentItem) {
      return New-ClacklyResult $script:ClacklyExit.Success "Clackly is not installed. Settings were preserved."
    }
    Get-ClacklySafeItem -Path $parent -Directory -ErrorCode $script:ClacklyExit.UnsafeTarget | Out-Null
    $target = Join-Path $parent $script:ClacklyPluginId
    if (!(Test-ClacklyContainedPath -Root $parent -Candidate $target)) {
      Throw-ClacklyError $script:ClacklyExit.UnsafeTarget "The production plugin target is not contained by its fixed parent."
    }
    $existing = Get-ClacklyRecognizedTarget -Target $target
    if ($null -eq $existing) {
      return New-ClacklyResult $script:ClacklyExit.Success "Clackly is not installed. Settings were preserved."
    }
  } catch {
    return New-ClacklyResult (Get-ClacklyErrorCode $_ $script:ClacklyExit.UnsafeTarget) $_.Exception.Message
  }

  $tombstone = $null
  try {
    $tombstone = New-ClacklySiblingPath -Parent $parent -Kind "uninstall"
    Assert-ClacklyNormalAncestorChain -Path $target -ErrorCode $script:ClacklyExit.UnsafeTarget
    Assert-ClacklyNormalAncestorChain -Path $tombstone -ErrorCode $script:ClacklyExit.UnsafeTarget
    Move-Item -LiteralPath $target -Destination $tombstone -ErrorAction Stop
    Invoke-ClacklyFailurePoint $FailureInjector "after-uninstall-rename"
    Remove-ClacklyOwnedTree -Path $tombstone -Parent $parent
    return New-ClacklyResult $script:ClacklyExit.Success "Clackly was uninstalled. Your settings were preserved."
  } catch {
    $survivors = Get-ClacklySurvivingOwnedPaths -Parent $parent -Candidates @($tombstone)
    return New-ClacklyResult $script:ClacklyExit.Cleanup ("Uninstall could not finish; retained task-owned paths are listed in RetainedPaths.") -RetainedPaths $survivors
  }
}

Export-ModuleMember -Function @(
  "Get-ClacklyProductionPluginRoot", "Get-ClacklyWindowsPowerShellExecutable", "New-ClacklyElevationArgumentList", "Test-ClacklyContainedPath", "Assert-ClacklySafeRelativePath", "Assert-ClacklyNormalAncestorChain",
  "Get-ClacklyTreeInventory", "Read-ClacklyHashManifest", "Test-ClacklyHashInventory", "Test-ClacklyPackage",
  "Get-ClacklyExpectedInstalledInventory", "Assert-ClacklyInstalledTree", "Get-ClacklyRecognizedTarget",
  "Get-ClacklyResolveState", "Get-ClacklySurvivingOwnedPaths", "Invoke-ClacklyInstallTransaction", "Invoke-ClacklyUninstallTransaction"
)
