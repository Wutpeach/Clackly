param(
    [Parameter(Mandatory)]
    [string]$OriginalBackupPath,

    [string]$PluginRoot = "$env:PROGRAMDATA\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins",

    [string]$BackupRoot = "$env:PROGRAMDATA\Clackly-Trellis-Hold\08-04-fix-resolve-startup-freeze"
)

$ErrorActionPreference = "Stop"
$pluginId = "com.wutpeach.clackly"
$pluginPath = Join-Path $PluginRoot $pluginId
$canonicalManifest = Join-Path $pluginPath "manifest.xml"
$originalPath = (Resolve-Path -LiteralPath $OriginalBackupPath).Path
$originalParent = Split-Path -Parent $originalPath
$savedInventoryPath = Join-Path $originalParent "inventory.csv"
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$currentBackupParent = Join-Path $BackupRoot "$runStamp-before-original-restore"
$currentBackupPath = Join-Path $currentBackupParent $pluginId
$currentMoved = $false
$originalMoved = $false

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
                throw "Reparse points are not allowed in the restore path: $current"
            }
        }
    }
}

function Get-Inventory([string]$Root) {
    return @(
        Get-ChildItem -LiteralPath $Root -File -Recurse | ForEach-Object {
            [pscustomobject]@{
                RelativePath = $_.FullName.Substring($Root.Length).TrimStart("\").Replace("\", "/")
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

if (-not (Test-Path -LiteralPath $pluginPath -PathType Container)) {
    throw "Current installed plugin was not found: $pluginPath"
}
if (-not (Test-Path -LiteralPath $savedInventoryPath -PathType Leaf)) {
    throw "Original backup inventory was not found: $savedInventoryPath"
}

Assert-NoReparseAncestor $PluginRoot
Assert-NoReparseAncestor $pluginPath
Assert-NoReparseAncestor $originalPath
Assert-CanonicalManifestOnly

$normalizedScanRoot = Get-NormalizedPath $PluginRoot
$normalizedOriginal = Get-NormalizedPath $originalPath
if ($normalizedOriginal -ieq $normalizedScanRoot -or $normalizedOriginal.StartsWith(
    "$normalizedScanRoot$([IO.Path]::DirectorySeparatorChar)",
    [StringComparison]::OrdinalIgnoreCase
)) {
    throw "Original backup unexpectedly resolves inside the scan root: $originalPath"
}
if ([IO.Path]::GetPathRoot($normalizedOriginal) -ine [IO.Path]::GetPathRoot((Get-NormalizedPath $pluginPath))) {
    throw "Original backup is not on the same volume as the installed plugin: $originalPath"
}

$savedOriginalInventory = @(Import-Csv -LiteralPath $savedInventoryPath)
$verifiedOriginalInventory = @(Get-Inventory $originalPath)
Assert-InventoryEqual $savedOriginalInventory $verifiedOriginalInventory "Original backup preflight"
$currentInventory = @(Get-Inventory $pluginPath)

New-Item -ItemType Directory -Path $currentBackupParent | Out-Null
Assert-NoReparseAncestor $currentBackupParent
try {
    Move-Item -LiteralPath $pluginPath -Destination $currentBackupPath
    $currentMoved = $true
    Assert-InventoryEqual $currentInventory @(Get-Inventory $currentBackupPath) "Current candidate backup"

    Move-Item -LiteralPath $originalPath -Destination $pluginPath
    $originalMoved = $true
    Assert-InventoryEqual $savedOriginalInventory @(Get-Inventory $pluginPath) "Restored original"
    Assert-CanonicalManifestOnly

    [ordered]@{
        restoredAt = (Get-Date).ToString("o")
        pluginPath = Get-NormalizedPath $pluginPath
        restoredFileCount = $savedOriginalInventory.Count
        mainJsSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $pluginPath "workflow-plugin\main.js")).Hash
        displacedCandidateBackup = Get-NormalizedPath $currentBackupPath
    } | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot "restore-$runStamp-original.json")

    Write-Host "Restored and verified the original plugin at $pluginPath"
    Write-Host "Retained the displaced candidate outside the scan root at $currentBackupPath"
} catch {
    $restoreError = $_
    if ($originalMoved -and (Test-Path -LiteralPath $pluginPath) -and -not (Test-Path -LiteralPath $originalPath)) {
        Move-Item -LiteralPath $pluginPath -Destination $originalPath
    }
    if ($currentMoved -and (Test-Path -LiteralPath $currentBackupPath) -and -not (Test-Path -LiteralPath $pluginPath)) {
        Move-Item -LiteralPath $currentBackupPath -Destination $pluginPath
    }
    throw $restoreError
}
