param(
    [Parameter(Mandatory)]
    [string]$ArtifactRoot,

    [Parameter(Mandatory)]
    [ValidatePattern("^[A-Za-z0-9-]+$")]
    [string]$RunLabel,

    [string]$PluginRoot = "$env:PROGRAMDATA\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins",

    [string]$BackupRoot = "$env:PROGRAMDATA\Clackly-Trellis-Hold\08-04-fix-resolve-startup-freeze"
)

$ErrorActionPreference = "Stop"
$pluginId = "com.wutpeach.clackly"
$pluginPath = Join-Path $PluginRoot $pluginId
$canonicalManifest = Join-Path $pluginPath "manifest.xml"
$artifactPath = (Resolve-Path -LiteralPath $ArtifactRoot).Path
$appRoot = Join-Path $artifactPath "resources\app"
$runtimeRoot = Join-Path $artifactPath "resources\runtimes"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$installerScript = Join-Path $repoRoot "resolve-command-center\scripts\install-workflow-plugin.ps1"
$verifyScript = Join-Path $repoRoot "resolve-command-center\scripts\verify-package.js"
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupParent = Join-Path $BackupRoot "$runStamp-before-$RunLabel"
$backupPath = Join-Path $backupParent $pluginId
$backupMoved = $false

function Get-NormalizedPath([string]$Path) {
    return [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar)
}

function Assert-NoReparseAncestor([string]$Path) {
    $fullPath = Get-NormalizedPath $Path
    $pathRoot = [IO.Path]::GetPathRoot($fullPath)
    $current = $pathRoot
    foreach ($segment in $fullPath.Substring($pathRoot.Length).Split(
        [IO.Path]::DirectorySeparatorChar,
        [StringSplitOptions]::RemoveEmptyEntries
    )) {
        $current = Join-Path $current $segment
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -Force -LiteralPath $current
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Reparse points are not allowed in the install/backup path: $current"
            }
        }
    }
}

function Assert-NoResolveProcesses {
    $processes = @(
        Get-CimInstance Win32_Process | Where-Object {
            $_.Name -eq "Resolve.exe" -or
            ($_.Name -eq "electron.exe" -and $_.CommandLine -match "DaVinci Resolve\\Electron|Clackly|resolve-command-center|com\.wutpeach") -or
            (($_.Name -match "^(node|npm|python|pythonw|fuscript)\.exe$") -and $_.CommandLine -match "Clackly|resolve-command-center|com\.wutpeach")
        }
    )
    if ($processes.Count) {
        $summary = $processes | ForEach-Object { "$($_.Name) PID=$($_.ProcessId)" }
        throw "Resolve/Clackly processes are still running: $($summary -join ', ')"
    }
}

function Assert-CanonicalManifestOnly {
    $canonical = Get-NormalizedPath $canonicalManifest
    $matches = @(
        Get-ChildItem -LiteralPath $PluginRoot -Filter manifest.xml -File -Recurse |
            Where-Object {
                Select-String -LiteralPath $_.FullName -Pattern '<Id>\s*com\.wutpeach\.clackly\s*</Id>' -Quiet
            } |
            ForEach-Object { Get-NormalizedPath $_.FullName }
    )
    if ($matches.Count -ne 1 -or $matches[0] -ine $canonical) {
        throw "Expected exactly one Clackly manifest at $canonical; found: $($matches -join ', ')"
    }
}

function Get-Inventory([string]$Root, [string]$Prefix = "") {
    return @(
        Get-ChildItem -LiteralPath $Root -File -Recurse | ForEach-Object {
            $relative = $_.FullName.Substring($Root.Length).TrimStart("\").Replace("\", "/")
            [pscustomobject]@{
                RelativePath = "$Prefix$relative"
                Length = $_.Length
                Sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
            }
        }
    )
}

function Assert-InventoryEqual([object[]]$Expected, [object[]]$Actual, [string]$Context) {
    $expectedSorted = @($Expected | Sort-Object RelativePath)
    $actualSorted = @($Actual | Sort-Object RelativePath)
    if ($expectedSorted.Count -ne $actualSorted.Count) {
        throw "$Context file count differs: expected $($expectedSorted.Count), actual $($actualSorted.Count)"
    }
    for ($index = 0; $index -lt $expectedSorted.Count; $index++) {
        $expectedFile = $expectedSorted[$index]
        $actualFile = $actualSorted[$index]
        if (
            $expectedFile.RelativePath -cne $actualFile.RelativePath -or
            [long]$expectedFile.Length -ne [long]$actualFile.Length -or
            $expectedFile.Sha256 -cne $actualFile.Sha256
        ) {
            throw "$Context differs at expected '$($expectedFile.RelativePath)' / actual '$($actualFile.RelativePath)'"
        }
    }
}

function Restore-Backup {
    if (-not $backupMoved) {
        return
    }

    if (Test-Path -LiteralPath $pluginPath) {
        $candidatePath = Get-NormalizedPath $pluginPath
        if ($candidatePath -ine (Get-NormalizedPath (Join-Path $PluginRoot $pluginId))) {
            throw "Refusing to remove unexpected partial candidate path: $candidatePath"
        }
        Assert-NoReparseAncestor $pluginPath
        Remove-Item -LiteralPath $pluginPath -Recurse -Force
    }

    Move-Item -LiteralPath $backupPath -Destination $pluginPath
    $restoredInventory = @(Get-Inventory $pluginPath)
    Assert-InventoryEqual $installedBefore $restoredInventory "Restored original"
    Assert-CanonicalManifestOnly
}

Assert-NoResolveProcesses
Assert-NoReparseAncestor $PluginRoot
Assert-NoReparseAncestor $pluginPath
Assert-NoReparseAncestor $artifactPath

if (-not (Test-Path -LiteralPath $pluginPath -PathType Container)) {
    throw "Installed plugin directory was not found: $pluginPath"
}
if (-not (Test-Path -LiteralPath $appRoot -PathType Container)) {
    throw "Artifact app directory was not found: $appRoot"
}
if (-not (Test-Path -LiteralPath $runtimeRoot -PathType Container)) {
    throw "Artifact runtime directory was not found: $runtimeRoot"
}

Assert-CanonicalManifestOnly

& node $verifyScript $artifactPath
if ($LASTEXITCODE -ne 0) {
    throw "package:verify failed for $artifactPath"
}

$expectedInventory = @(
    @(Get-Inventory $appRoot)
    @(Get-Inventory $runtimeRoot "resources/runtimes/")
)
$installedBefore = @(Get-Inventory $pluginPath)

New-Item -ItemType Directory -Path $backupParent | Out-Null
Assert-NoReparseAncestor $backupParent
$normalizedScanRoot = Get-NormalizedPath $PluginRoot
$normalizedBackup = Get-NormalizedPath $backupPath
if ($normalizedBackup -ieq $normalizedScanRoot -or $normalizedBackup.StartsWith(
    "$normalizedScanRoot$([IO.Path]::DirectorySeparatorChar)",
    [StringComparison]::OrdinalIgnoreCase
)) {
    throw "Backup must remain outside the Workflow Integration Plugins scan root: $backupPath"
}
if ([IO.Path]::GetPathRoot($normalizedBackup) -ine [IO.Path]::GetPathRoot((Get-NormalizedPath $pluginPath))) {
    throw "Backup must be on the same volume as the installed plugin: $backupPath"
}
if (Test-Path -LiteralPath $backupPath) {
    throw "Backup destination already exists: $backupPath"
}

try {
    Move-Item -LiteralPath $pluginPath -Destination $backupPath
    $backupMoved = $true
    $backupInventory = @(Get-Inventory $backupPath)
    Assert-InventoryEqual $installedBefore $backupInventory "Atomic backup"
    $backupInventory | Sort-Object RelativePath |
        Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $backupParent "inventory.csv")

    & $installerScript -Mode Copy -PluginRoot $PluginRoot -PackageRoot $artifactPath
    $installedCandidate = @(Get-Inventory $pluginPath)
    Assert-InventoryEqual $expectedInventory $installedCandidate "Installed candidate"
    Assert-CanonicalManifestOnly

    $installedCandidate | Sort-Object RelativePath |
        Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $backupParent "installed-$RunLabel-inventory.csv")
    [ordered]@{
        runLabel = $RunLabel
        installedAt = (Get-Date).ToString("o")
        artifactRoot = $artifactPath
        pluginPath = Get-NormalizedPath $pluginPath
        backupPath = Get-NormalizedPath $backupPath
        installedFileCount = $installedCandidate.Count
        mainJsSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $pluginPath "workflow-plugin\main.js")).Hash
    } | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot "install-$runStamp-$RunLabel.json")

    Write-Host "Installed and verified $RunLabel at $pluginPath"
    Write-Host "Retained verified backup outside the scan root at $backupPath"
} catch {
    $installError = $_
    try {
        Restore-Backup
    } catch {
        throw "Candidate install failed: $($installError.Exception.Message). Automatic restore also failed: $($_.Exception.Message)"
    }
    throw $installError
}
