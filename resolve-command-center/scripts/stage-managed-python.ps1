param(
  [string]$LockPath = (Join-Path $PSScriptRoot "..\resources\runtimes\python-win32-x64.lock.json"),
  [string]$CacheDirectory = (Join-Path $PSScriptRoot "..\build\runtime-cache"),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\build\runtime-staging\runtimes")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$BuildRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot "build"))
$LockPath = [IO.Path]::GetFullPath($LockPath)
$CacheDirectory = [IO.Path]::GetFullPath($CacheDirectory)
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (!$OutputDirectory.StartsWith($BuildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Runtime staging output must stay under '$BuildRoot'."
}

function Assert-SafeOutputPath {
  $Current = $OutputDirectory
  while ($Current.StartsWith($BuildRoot, [StringComparison]::OrdinalIgnoreCase)) {
    if ((Test-Path -LiteralPath $Current) -and
        ((Get-Item -LiteralPath $Current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "Runtime staging output must not traverse a link: '$Current'."
    }
    if ($Current -eq $BuildRoot) { return }
    $Current = Split-Path $Current -Parent
  }
  throw "Runtime staging output must stay under '$BuildRoot'."
}

Assert-SafeOutputPath

function Require-String($Value, [string]$Name) {
  if ($Value -isnot [string] -or [String]::IsNullOrWhiteSpace($Value) -or $Value -ne $Value.Trim()) {
    throw "Runtime lock requires a non-empty $Name."
  }
}

function Get-Sha256([string]$Path) {
  $Stream = [IO.File]::OpenRead($Path)
  try {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($Hasher.ComputeHash($Stream)) -replace '-', '').ToLowerInvariant() }
    finally { $Hasher.Dispose() }
  } finally {
    $Stream.Dispose()
  }
}

try {
  $Lock = Get-Content -Raw -LiteralPath $LockPath | ConvertFrom-Json
} catch {
  throw "Runtime lock is missing or malformed: $($_.Exception.Message)"
}
foreach ($Name in @("schemaVersion", "profileId", "version", "platform", "architecture", "releaseStatus", "asset", "sigstore", "spdx", "license")) {
  if (!$Lock.PSObject.Properties[$Name]) { throw "Runtime lock has unsupported identity metadata." }
}
if ($Lock.schemaVersion -ne 1 -or $Lock.platform -ne "win32" -or $Lock.architecture -ne "x64" -or
    $Lock.version -notmatch '^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$' -or
    $Lock.releaseStatus -notin @("candidate", "current", "legacy-pinned")) {
  throw "Runtime lock has unsupported identity metadata."
}
Require-String $Lock.profileId "profileId"
foreach ($Name in @("asset", "sigstore", "spdx", "license")) {
  $Record = $Lock.$Name
  foreach ($Field in @("fileName", "url", "sha256")) {
    if (!$Record.PSObject.Properties[$Field]) { throw "Runtime lock $Name is incomplete." }
  }
  Require-String $Record.fileName "$Name.fileName"
  Require-String $Record.url "$Name.url"
  Require-String $Record.sha256 "$Name.sha256"
  if ($Record.url -notmatch '^https://' -or $Record.sha256 -notmatch '^[0-9a-f]{64}$') {
    throw "Runtime lock $Name must use HTTPS and a lowercase SHA-256."
  }
  if ([IO.Path]::GetFileName($Record.fileName) -ne $Record.fileName) {
    throw "Runtime lock $Name.fileName must be one file name."
  }
}

New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
function Get-LockedFile($Record) {
  $Target = Join-Path $CacheDirectory $Record.fileName
  if (!(Test-Path -LiteralPath $Target -PathType Leaf)) {
    Invoke-WebRequest -Uri $Record.url -OutFile $Target -UseBasicParsing
  }
  $Actual = Get-Sha256 $Target
  if ($Actual -ne $Record.sha256) {
    throw "SHA-256 mismatch for '$($Record.fileName)': expected $($Record.sha256), received $Actual."
  }
  return $Target
}

$AssetPath = Get-LockedFile $Lock.asset
$SigstorePath = Get-LockedFile $Lock.sigstore
$SpdxPath = Get-LockedFile $Lock.spdx
$LicensePath = Get-LockedFile $Lock.license

$TemporaryRoot = Join-Path $BuildRoot ("runtime-stage-" + [Guid]::NewGuid().ToString("N"))
$ExtractRoot = Join-Path $TemporaryRoot "extract"
$RuntimeRoot = Join-Path $TemporaryRoot "runtimes"
$ProfileRoot = Join-Path $RuntimeRoot "python\cpython-$($Lock.version)\win32-x64"
try {
  New-Item -ItemType Directory -Path $ExtractRoot, $ProfileRoot -Force | Out-Null
  Expand-Archive -LiteralPath $AssetPath -DestinationPath $ExtractRoot
  foreach ($Required in @("python.exe", "python313.dll", "python313.zip")) {
    if (!(Test-Path -LiteralPath (Join-Path $ExtractRoot $Required) -PathType Leaf)) {
      throw "Managed Runtime payload is incomplete: missing $Required."
    }
  }
  Copy-Item -Path (Join-Path $ExtractRoot "*") -Destination $ProfileRoot -Recurse -Force
  [IO.File]::WriteAllText(
    (Join-Path $ProfileRoot "python313._pth"),
    "python313.zip`n.`nclackly`n",
    [Text.UTF8Encoding]::new($false)
  )

  $ClacklyRoot = Join-Path $ProfileRoot "clackly"
  New-Item -ItemType Directory -Path $ClacklyRoot -Force | Out-Null
  $ApplicationSourceFiles = @(
    [pscustomobject]@{ SourcePath = (Join-Path $ProjectRoot "script-runtime\runtime\bootstrap.py"); StagedPath = "clackly/bootstrap.py" },
    [pscustomobject]@{ SourcePath = (Join-Path $ProjectRoot "script-runtime\runtime\persistent_bootstrap.py"); StagedPath = "clackly/persistent_bootstrap.py" },
    [pscustomobject]@{ SourcePath = (Join-Path $ProjectRoot "script-runtime\python_runner.py"); StagedPath = "clackly/python_runner.py" }
  )
  foreach ($Directory in @("resolve", "scripts", "resolve2ae_core")) {
    $ApplicationSourceFiles += Get-ChildItem -LiteralPath (Join-Path $ProjectRoot $Directory) -File -Filter "*.py" |
      Where-Object { $_.Name -notlike "test_*" } |
      Sort-Object Name |
      ForEach-Object {
        [pscustomobject]@{
          SourcePath = $_.FullName
          StagedPath = "clackly/$Directory/$($_.Name)"
        }
      }
  }
  foreach ($SourceFile in $ApplicationSourceFiles) {
    $StagedPath = Join-Path $ProfileRoot ($SourceFile.StagedPath.Replace("/", [IO.Path]::DirectorySeparatorChar))
    New-Item -ItemType Directory -Path (Split-Path $StagedPath -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $SourceFile.SourcePath -Destination $StagedPath
  }

  Copy-Item -LiteralPath $LicensePath -Destination (Join-Path $ProfileRoot "LICENSE.txt")
  Copy-Item -LiteralPath $SigstorePath -Destination (Join-Path $ProfileRoot "python-embed.sigstore")
  Copy-Item -LiteralPath $SpdxPath -Destination (Join-Path $ProfileRoot "python-embed.spdx.json")
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "resources\runtimes\THIRD_PARTY_NOTICES.md") -Destination $ProfileRoot

  $ApplicationSbom = Join-Path $ProfileRoot "application.spdx.json"
  $Sbom = & npm.cmd sbom --package-lock-only --omit=dev --sbom-format=spdx --sbom-type=application 2>&1
  if ($LASTEXITCODE -ne 0) { throw "npm application SBOM generation failed: $($Sbom -join ' ')" }
  [IO.File]::WriteAllText($ApplicationSbom, ($Sbom -join [Environment]::NewLine), [Text.UTF8Encoding]::new($false))

  $LockHash = Get-Sha256 $LockPath
  $ApplicationSources = @(
    foreach ($SourceFile in $ApplicationSourceFiles) {
      $StagedPath = Join-Path $ProfileRoot ($SourceFile.StagedPath.Replace("/", [IO.Path]::DirectorySeparatorChar))
      $SourceHash = Get-Sha256 $SourceFile.SourcePath
      if ($SourceHash -ne (Get-Sha256 $StagedPath)) {
        throw "Managed application source staging hash mismatch: $($SourceFile.StagedPath)."
      }
      [pscustomobject][ordered]@{ path = $SourceFile.StagedPath; sha256 = $SourceHash }
    }
  )
  $ApplicationSources = @($ApplicationSources | Sort-Object path)
  $Metadata = [ordered]@{
    schemaVersion = 1
    profileId = $Lock.profileId
    implementation = "cpython"
    runtimeVersion = $Lock.version
    platform = $Lock.platform
    architecture = $Lock.architecture
    releaseStatus = $Lock.releaseStatus
    source = [ordered]@{ url = $Lock.asset.url; sha256 = $Lock.asset.sha256 }
    paths = [ordered]@{ executable = "python.exe"; bootstrap = "clackly/bootstrap.py"; scriptRoot = "clackly" }
    build = [ordered]@{
      lockSha256 = $LockHash
      script = "scripts/stage-managed-python.ps1"
      applicationSources = $ApplicationSources
    }
  }
  [IO.File]::WriteAllText(
    (Join-Path $ProfileRoot "runtime.json"),
    (($Metadata | ConvertTo-Json -Depth 6) + "`n"),
    [Text.UTF8Encoding]::new($false)
  )
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "resources\runtimes\manifest.json") -Destination $RuntimeRoot
  Copy-Item -LiteralPath $LockPath -Destination $RuntimeRoot

  if (Test-Path -LiteralPath $OutputDirectory) {
    Assert-SafeOutputPath
    Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
  }
  New-Item -ItemType Directory -Path (Split-Path $OutputDirectory -Parent) -Force | Out-Null
  Move-Item -LiteralPath $RuntimeRoot -Destination $OutputDirectory
  Write-Host "Staged CPython $($Lock.version) at $OutputDirectory"
} finally {
  if (Test-Path -LiteralPath $TemporaryRoot) {
    Remove-Item -LiteralPath $TemporaryRoot -Recurse -Force
  }
}
