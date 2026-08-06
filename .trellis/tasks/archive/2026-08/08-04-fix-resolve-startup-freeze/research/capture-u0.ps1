param(
    [ValidateRange(5, 300)]
    [int]$DurationSeconds = 90,

    [ValidateRange(50, 1000)]
    [int]$RespondingIntervalMs = 100,

    [ValidateRange(500, 10000)]
    [int]$CimIntervalMs = 2000,

    [ValidateRange(10, 900)]
    [int]$WaitForResolveSeconds = 300,

    [ValidatePattern("^[A-Za-z0-9-]+$")]
    [string]$RunLabel = "U0",

    [int]$TargetProcessId,

    [string]$HandshakeRoot,

    [string]$ReadyToken,

    [ValidateSet("", "Absent", "Present")]
    [string]$ExpectedProfileState = "",

    [string]$ExpectedProfileIdentity,

    [switch]$AllowMissingPlugin,

    [switch]$HandshakeSelfTest
)

$ErrorActionPreference = "Stop"

if (-not ("ClacklyHandshakeNative" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class ClacklyHandshakeNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct BY_HANDLE_FILE_INFORMATION {
        public uint FileAttributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint GetFileAttributes(string path);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern SafeFileHandle CreateFile(
        string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetFileInformationByHandle(
        SafeFileHandle handle, out BY_HANDLE_FILE_INFORMATION information
    );
}
"@
}

$scanRoot = "C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"
$pluginPath = Join-Path $scanRoot "com.wutpeach.clackly"
$canonicalManifest = Join-Path $pluginPath "manifest.xml"
$profilePath = Join-Path $env:APPDATA "Clackly Workflow Plugin"
$resolveLog = Join-Path $env:APPDATA "Blackmagic Design\DaVinci Resolve\Support\logs\davinci_resolve.log"
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $PSScriptRoot "$runStamp-$RunLabel"

function Get-NormalizedPath([string]$Path) {
    return [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar)
}

function Get-CadenceSummary([object[]]$Samples, [string]$TimestampProperty, [int]$RequestedMs) {
    $timestamps = @($Samples | ForEach-Object { [datetime]$_.($TimestampProperty) })
    $intervals = @(
        for ($index = 1; $index -lt $timestamps.Count; $index++) {
            ($timestamps[$index] - $timestamps[$index - 1]).TotalMilliseconds
        }
    )

    if ($intervals.Count -eq 0) {
        return [ordered]@{
            requestedMs = $RequestedMs
            sampleCount = $timestamps.Count
            intervalCount = 0
            minMs = $null
            medianMs = $null
            maxMs = $null
        }
    }

    $sorted = @($intervals | Sort-Object)
    $middle = [int][math]::Floor($sorted.Count / 2)
    $median = if ($sorted.Count % 2) {
        $sorted[$middle]
    } else {
        ($sorted[$middle - 1] + $sorted[$middle]) / 2
    }

    return [ordered]@{
        requestedMs = $RequestedMs
        sampleCount = $timestamps.Count
        intervalCount = $intervals.Count
        minMs = [math]::Round(($sorted | Measure-Object -Minimum).Minimum, 3)
        medianMs = [math]::Round($median, 3)
        maxMs = [math]::Round(($sorted | Measure-Object -Maximum).Maximum, 3)
    }
}

function Read-LogDelta([string]$Path, [long]$Offset) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
        if ($Offset -gt $stream.Length) {
            $Offset = 0
        }
        [void]$stream.Seek($Offset, [IO.SeekOrigin]::Begin)
        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true)
        try {
            return $reader.ReadToEnd()
        } finally {
            $reader.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

function Write-AtomicJsonAbsent([string]$Path, [object]$Value, [switch]$InjectPostMoveFailure) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $parent = Split-Path -Parent $fullPath
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        New-Item -ItemType Directory -Path $parent | Out-Null
    }
    if (Test-Path -LiteralPath $fullPath) {
        throw "Atomic JSON destination already exists: $fullPath"
    }

    $temporary = "$fullPath.tmp-$PID-$([guid]::NewGuid().ToString('N'))"
    $payload = ($Value | ConvertTo-Json -Depth 8) + [Environment]::NewLine
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($payload)
    try {
        $stream = [IO.FileStream]::new(
            $temporary,
            [IO.FileMode]::CreateNew,
            [IO.FileAccess]::Write,
            [IO.FileShare]::None,
            4096,
            [IO.FileOptions]::WriteThrough
        )
        try {
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush($true)
        } finally {
            $stream.Dispose()
        }
        [IO.File]::Move($temporary, $fullPath)
        if ($InjectPostMoveFailure) {
            throw "Injected post-move failure."
        }
        $readBack = [IO.File]::ReadAllText($fullPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($null -eq $readBack) {
            throw "Atomic JSON read-back failed: $fullPath"
        }
    } finally {
        if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

function Get-TopLevelEntry([string]$Path) {
    $attributes = [ClacklyHandshakeNative]::GetFileAttributes([IO.Path]::GetFullPath($Path))
    if ($attributes -eq [uint32]::MaxValue) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($errorCode -in @(2, 3)) {
            return [pscustomobject]@{ Exists = $false; Attributes = [uint32]0 }
        }
        throw "Top-level filesystem inspection failed with Win32 error $errorCode."
    }
    return [pscustomobject]@{ Exists = $true; Attributes = $attributes }
}

function Get-DirectoryIdentity([string]$Path) {
    $flags = [uint32](0x02000000 -bor 0x00200000)
    $share = [uint32](1 -bor 2 -bor 4)
    $handle = [ClacklyHandshakeNative]::CreateFile(
        [IO.Path]::GetFullPath($Path), 0, $share, [IntPtr]::Zero, 3, $flags, [IntPtr]::Zero
    )
    try {
        if ($handle.IsInvalid) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "Directory identity open failed with Win32 error $errorCode."
        }
        $information = New-Object ClacklyHandshakeNative+BY_HANDLE_FILE_INFORMATION
        if (-not [ClacklyHandshakeNative]::GetFileInformationByHandle($handle, [ref]$information)) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "Directory identity read failed with Win32 error $errorCode."
        }
        $fileIndex = ([uint64]$information.FileIndexHigh * [uint64]4294967296) + [uint64]$information.FileIndexLow
        return "$([uint64]$information.VolumeSerialNumber):$fileIndex"
    } finally {
        $handle.Dispose()
    }
}

function Assert-ExpectedProfileState(
    [string]$ProfilePath,
    [string]$ExpectedState,
    [string]$ExpectedIdentity
) {
    $entry = Get-TopLevelEntry $ProfilePath
    if ($ExpectedState -eq "Absent" -and $entry.Exists) {
        throw "Expected canonical profile to be absent before the cold run."
    }
    if ($ExpectedState -eq "Present") {
        if (-not $entry.Exists) {
            throw "Expected canonical profile to be present before the warm run."
        }
        $isDirectory = [bool]($entry.Attributes -band [IO.FileAttributes]::Directory)
        $isReparse = [bool]($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)
        if (-not $isDirectory -or $isReparse) {
            throw "Warm canonical profile must be one real directory, not a file or reparse point."
        }
        $actualIdentity = Get-DirectoryIdentity $ProfilePath
        if ($actualIdentity -cne $ExpectedIdentity) {
            throw "Warm canonical profile directory identity does not match committed C1 identity."
        }
    }
}

function Assert-HandshakeParameters(
    [string]$Root,
    [string]$Token,
    [string]$ExpectedState,
    [string]$ExpectedIdentity,
    [int]$SelectedProcessId,
    [int]$SelectedDurationSeconds,
    [int]$SelectedRespondingIntervalMs,
    [int]$SelectedCimIntervalMs
) {
    $enabled = [bool]($Root -or $Token -or $ExpectedState -or $ExpectedIdentity)
    if (-not $enabled) {
        return $false
    }
    if (-not $Root -or -not $Token -or -not $ExpectedState) {
        throw "HandshakeRoot, ReadyToken, and ExpectedProfileState are all required in readiness mode."
    }
    if ($Token -notmatch '^[A-Za-z0-9-]{16,64}$') {
        throw "ReadyToken must contain 16-64 letters, digits, or hyphens."
    }
    if ($SelectedProcessId) {
        throw "TargetProcessId is prohibited in readiness mode."
    }
    if ($SelectedDurationSeconds -ne 300 -or $SelectedRespondingIntervalMs -ne 100 -or $SelectedCimIntervalMs -ne 2000) {
        throw "Readiness mode requires DurationSeconds=300, RespondingIntervalMs=100, and CimIntervalMs=2000."
    }
    if ($ExpectedState -eq "Present" -and $ExpectedIdentity -notmatch '^\d+:\d+$') {
        throw "ExpectedProfileIdentity volume:file is required for the warm run."
    }
    if ($ExpectedState -eq "Absent" -and $ExpectedIdentity) {
        throw "ExpectedProfileIdentity must be empty for a cold run."
    }
    return $true
}

function Assert-ResolveAbsent([object[]]$Processes) {
    if ($Processes.Count) {
        throw "Resolve is already running; authoritative readiness was not published."
    }
}

function Assert-TaskLocalHandshakeRoot([string]$Root) {
    if (-not [IO.Path]::IsPathRooted($Root)) {
        throw "HandshakeRoot must be an absolute path under task research."
    }
    $researchRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
    $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    if (-not $fullRoot.StartsWith("$researchRoot\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "HandshakeRoot must remain under task research: $researchRoot"
    }
    $pathRoot = [IO.Path]::GetPathRoot($fullRoot)
    $current = $pathRoot
    foreach ($segment in $fullRoot.Substring($pathRoot.Length).Split(
        [IO.Path]::DirectorySeparatorChar,
        [StringSplitOptions]::RemoveEmptyEntries
    )) {
        $current = Join-Path $current $segment
        $entry = Get-TopLevelEntry $current
        if ($entry.Exists -and ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "HandshakeRoot may not traverse a reparse point."
        }
    }
}

function Assert-DedicatedSamplerProcess {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$PID"
    if (-not $current -or $current.CommandLine -notmatch '(?i)(?:^|\s)-(?:File|f)\s+(?:"[^"]*capture-u0\.ps1"|[^\s"]*capture-u0\.ps1)(?:\s|$)') {
        throw "Readiness mode requires a dedicated powershell.exe -File capture-u0.ps1 process."
    }
}

function Consume-ReadyAndPublish(
    [string]$ReadyPath,
    [string]$RevokedPath,
    [string]$FinalPath,
    [object]$Record
) {
    if (-not (Test-Path -LiteralPath $ReadyPath -PathType Leaf)) {
        throw "Authoritative readiness is missing and cannot be consumed."
    }
    foreach ($destination in @($RevokedPath, $FinalPath)) {
        if (Test-Path -LiteralPath $destination) {
            throw "Handshake transition destination already exists: $destination"
        }
    }
    [IO.File]::Move([IO.Path]::GetFullPath($ReadyPath), [IO.Path]::GetFullPath($RevokedPath))
    Write-AtomicJsonAbsent $FinalPath $Record
}

function Invoke-HandshakeSelfTest {
    $fixture = Join-Path ([IO.Path]::GetTempPath()) "clackly-handshake-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $fixture | Out-Null
    try {
        $token = "fixture-token-123456"
        $ready = Join-Path $fixture "run.ready.json"
        $revoked = Join-Path $fixture "run.revoked.json"
        $started = Join-Path $fixture "run.started.json"
        $failed = Join-Path $fixture "run.failed.json"
        $complete = Join-Path $fixture "run.json"

        $present = Join-Path $fixture "profile"
        New-Item -ItemType Directory -Path $present | Out-Null
        $presentIdentity = Get-DirectoryIdentity $present
        $pythonIdentity = & python -c "import os,sys; s=os.stat(sys.argv[1], follow_symlinks=False); print(f'{s.st_dev}:{s.st_ino}')" $present
        if ($LASTEXITCODE -ne 0 -or $pythonIdentity.Trim() -cne $presentIdentity) {
            throw "PowerShell/Python directory identity representations differ."
        }
        Assert-ExpectedProfileState $present "Present" $presentIdentity
        Assert-ExpectedProfileState (Join-Path $fixture "missing") "Absent" ""
        $fileProfile = Join-Path $fixture "profile-file"
        [IO.File]::WriteAllText($fileProfile, "fixture")
        $junctionTarget = Join-Path $fixture "junction-target"
        New-Item -ItemType Directory -Path $junctionTarget | Out-Null
        $junctionProfile = Join-Path $fixture "profile-junction"
        New-Item -ItemType Junction -Path $junctionProfile -Target $junctionTarget | Out-Null
        Assert-DedicatedSamplerProcess
        Assert-TaskLocalHandshakeRoot (Join-Path $PSScriptRoot "handshake-self-test-unused")
        foreach ($mismatch in @(
            { Assert-ExpectedProfileState $present "Absent" "" },
            { Assert-ExpectedProfileState (Join-Path $fixture "missing") "Present" $presentIdentity },
            { Assert-ExpectedProfileState $fileProfile "Absent" "" },
            { Assert-ExpectedProfileState $junctionProfile "Present" $presentIdentity },
            { Assert-HandshakeParameters $fixture $token "Absent" "" 42 300 100 2000 },
            { Assert-HandshakeParameters $fixture $token "Absent" "" 0 90 100 2000 },
            { Assert-HandshakeParameters $fixture $token "Absent" "" 0 300 200 2000 },
            { Assert-HandshakeParameters $fixture $token "Absent" "" 0 300 100 1000 },
            { Assert-ResolveAbsent @([pscustomobject]@{ Id = 42 }) },
            { Assert-TaskLocalHandshakeRoot $fixture }
        )) {
            $rejected = $false
            try { & $mismatch } catch { $rejected = $true }
            if (-not $rejected) { throw "Handshake rejection fixture unexpectedly passed." }
        }

        $readyRecord = [ordered]@{ schema = 1; status = "ready"; run = "TEST"; token = $token; samplerPid = $PID }
        Write-AtomicJsonAbsent $ready $readyRecord
        $staleRejected = $false
        try { Write-AtomicJsonAbsent $ready $readyRecord } catch { $staleRejected = $true }
        if (-not $staleRejected) { throw "Stale readiness destination was overwritten." }

        $faultReady = Join-Path $fixture "fault.ready.json"
        $faultRevoked = Join-Path $fixture "fault.revoked.json"
        $faultFailed = Join-Path $fixture "fault.failed.json"
        try {
            Write-AtomicJsonAbsent $faultReady $readyRecord -InjectPostMoveFailure
        } catch {
            if (Test-Path -LiteralPath $faultReady -PathType Leaf) {
                Consume-ReadyAndPublish $faultReady $faultRevoked $faultFailed ([ordered]@{
                    schema = 1; status = "failed"; run = "TEST"; token = $token; reason = "injected"
                })
            }
        }
        if (Test-Path -LiteralPath $faultReady -PathType Leaf) {
            throw "Injected post-publication failure left authoritative readiness."
        }

        $startedRecord = [ordered]@{
            schema = 1; status = "started"; run = "TEST"; token = $token
            samplerPid = $PID; targetProcessId = 99; targetStartTime = "2026-08-05T00:00:00.0000000+08:00"
        }
        Consume-ReadyAndPublish $ready $revoked $started $startedRecord
        if ((Test-Path -LiteralPath $ready) -or -not (Test-Path -LiteralPath $started)) {
            throw "Started transition left authoritative readiness behind."
        }
        $startedRoundTrip = Get-Content -Raw -LiteralPath $started | ConvertFrom-Json
        if ($startedRoundTrip.token -cne $token -or $startedRoundTrip.targetProcessId -ne 99) {
            throw "Started record identity did not round-trip."
        }

        Remove-Item -LiteralPath $revoked -Force
        Remove-Item -LiteralPath $started -Force
        Write-AtomicJsonAbsent $ready $readyRecord
        $failureRecord = [ordered]@{ schema = 1; status = "failed"; run = "TEST"; token = $token; reason = "timeout" }
        Consume-ReadyAndPublish $ready $revoked $failed $failureRecord
        if ((Test-Path -LiteralPath $ready) -or -not (Test-Path -LiteralPath $failed)) {
            throw "Failure transition left authoritative readiness behind."
        }

        $completionRecord = [ordered]@{
            schema = 2; status = "complete"; run = "TEST"; readinessToken = $token
            samplerPid = $PID; targetProcessId = 99; targetStartTime = "2026-08-05T00:00:00.0000000+08:00"
        }
        Write-AtomicJsonAbsent $complete $completionRecord
        $completionRoundTrip = Get-Content -Raw -LiteralPath $complete | ConvertFrom-Json
        if (
            $completionRoundTrip.status -cne "complete" -or
            $completionRoundTrip.readinessToken -cne $token -or
            $completionRoundTrip.targetProcessId -ne 99
        ) {
            throw "Completion identity did not round-trip."
        }

        [ordered]@{
            passed = @(
                "profile-state-mismatch-rejected",
                "file-and-reparse-profile-rejected",
                "python-powershell-identity-match",
                "already-running-resolve-rejected",
                "target-process-id-rejected",
                "strict-timing-rejected",
                "task-local-root-enforced",
                "dedicated-host-enforced",
                "stale-ready-not-overwritten",
                "post-publication-failure-revoked",
                "ready-consumed-to-started",
                "timeout-consumed-to-failed",
                "completion-identity-roundtrip"
            )
            count = 13
        } | ConvertTo-Json -Depth 3
    } finally {
        $resolvedFixture = [IO.Path]::GetFullPath($fixture)
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if ($resolvedFixture.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
        }
    }
}

if ($HandshakeSelfTest) {
    Invoke-HandshakeSelfTest
    return
}

$handshakeMode = Assert-HandshakeParameters $HandshakeRoot $ReadyToken $ExpectedProfileState $ExpectedProfileIdentity $TargetProcessId $DurationSeconds $RespondingIntervalMs $CimIntervalMs

$readyPath = $null
$startedPath = $null
$failedPath = $null
$revokedPath = $null
$completionPath = Join-Path $runDir "run.json"
if ($handshakeMode) {
    Assert-DedicatedSamplerProcess
    Assert-TaskLocalHandshakeRoot $HandshakeRoot
    $handshakeRootPath = [IO.Path]::GetFullPath($HandshakeRoot)
    if (-not (Test-Path -LiteralPath $handshakeRootPath -PathType Container)) {
        New-Item -ItemType Directory -Path $handshakeRootPath | Out-Null
    }
    $handshakeBase = "$RunLabel-$ReadyToken"
    $readyPath = Join-Path $handshakeRootPath "$handshakeBase.ready.json"
    $startedPath = Join-Path $handshakeRootPath "$handshakeBase.started.json"
    $failedPath = Join-Path $handshakeRootPath "$handshakeBase.failed.json"
    $revokedPath = Join-Path $handshakeRootPath "$handshakeBase.revoked.json"
    foreach ($destination in @($readyPath, $startedPath, $failedPath, $revokedPath, $completionPath)) {
        if (Test-Path -LiteralPath $destination) {
            throw "Handshake destination already exists before readiness: $destination"
        }
    }
}

New-Item -ItemType Directory -Path $runDir | Out-Null

$pluginItem = Get-Item -Force -LiteralPath $pluginPath -ErrorAction SilentlyContinue
$pluginIsReparsePoint = $pluginItem -and [bool]($pluginItem.Attributes -band [IO.FileAttributes]::ReparsePoint)
$canonicalManifestPath = Get-NormalizedPath $canonicalManifest
$clacklyManifests = @(
    Get-ChildItem -LiteralPath $scanRoot -Filter manifest.xml -File -Recurse |
        Where-Object {
            Select-String -LiteralPath $_.FullName -Pattern '<Id>\s*com\.wutpeach\.clackly\s*</Id>' -Quiet
        } |
        ForEach-Object { Get-NormalizedPath $_.FullName }
)

$preflight = [ordered]@{
    capturedAt = (Get-Date).ToString("o")
    scanRoot = Get-NormalizedPath $scanRoot
    pluginPath = Get-NormalizedPath $pluginPath
    pluginAttributes = if ($pluginItem) { $pluginItem.Attributes.ToString() } else { $null }
    pluginIsReparsePoint = $pluginIsReparsePoint
    pluginLinkType = if ($pluginItem) { $pluginItem.LinkType } else { $null }
    pluginTarget = if ($pluginItem) { @($pluginItem.Target) } else { @() }
    clacklyManifests = $clacklyManifests
    canonicalManifest = $canonicalManifestPath
}
$preflight | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $runDir "preflight.json")

if ($pluginIsReparsePoint) {
    throw "U0 requires the current packaged directory, but the installed plugin is a reparse point: $pluginPath"
}
if ($AllowMissingPlugin) {
    if ($pluginItem -or $clacklyManifests.Count -ne 0) {
        throw "No-plugin baseline requires an absent canonical plugin and zero Clackly manifests."
    }
} elseif (-not $pluginItem -or $clacklyManifests.Count -ne 1 -or $clacklyManifests[0] -ine $canonicalManifestPath) {
    throw "Expected exactly one Clackly manifest at $canonicalManifest; found: $($clacklyManifests -join ', ')"
}

$inventoryPath = Join-Path $runDir "plugin-inventory.csv"
if ($pluginItem) {
    Get-ChildItem -LiteralPath $pluginPath -File -Recurse | ForEach-Object {
        [pscustomobject]@{
            RelativePath = $_.FullName.Substring($pluginPath.Length).TrimStart('\')
            Length = $_.Length
            LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString("o")
            Sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
        }
    } | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath $inventoryPath
} else {
    '"RelativePath","Length","LastWriteTimeUtc","Sha256"' | Set-Content -Encoding UTF8 -LiteralPath $inventoryPath
}

$logOffset = if (Test-Path -LiteralPath $resolveLog) {
    (Get-Item -LiteralPath $resolveLog).Length
} else {
    0
}

if ($TargetProcessId) {
    $target = Get-Process -Id $TargetProcessId
} else {
    $existingResolve = @(Get-Process -Name Resolve -ErrorAction SilentlyContinue)
    if ($handshakeMode) {
        Assert-ResolveAbsent $existingResolve
        Assert-ExpectedProfileState $profilePath $ExpectedProfileState $ExpectedProfileIdentity
        $samplerProcess = Get-Process -Id $PID
        $readyAt = Get-Date
        $waitDeadline = $readyAt.AddSeconds($WaitForResolveSeconds)
        $readyRecord = [ordered]@{
            schema = 1
            status = "ready"
            run = $RunLabel
            token = $ReadyToken
            expectedProfileState = $ExpectedProfileState
            expectedProfileIdentity = if ($ExpectedProfileState -eq "Present") { $ExpectedProfileIdentity } else { $null }
            runDirectory = [IO.Path]::GetFullPath($runDir)
            samplerPid = $PID
            samplerStartTime = $samplerProcess.StartTime.ToString("o")
            readyAt = $readyAt.ToString("o")
            waitDeadline = $waitDeadline.ToString("o")
            durationSeconds = $DurationSeconds
            respondingIntervalMs = $RespondingIntervalMs
            cimIntervalMs = $CimIntervalMs
        }
        try {
            Write-AtomicJsonAbsent $readyPath $readyRecord
            Assert-ResolveAbsent @(Get-Process -Name Resolve -ErrorAction SilentlyContinue)
            Write-Host "$RunLabel sampler published authoritative readiness: $readyPath"
            do {
                $target = Get-Process -Name Resolve -ErrorAction SilentlyContinue | Select-Object -First 1
                if (-not $target) {
                    Start-Sleep -Milliseconds 100
                }
            } while (-not $target -and (Get-Date) -lt $waitDeadline)

            if (-not $target) {
                throw "Resolve did not start within $WaitForResolveSeconds seconds."
            }
            $acquiredAt = Get-Date
            if ($acquiredAt -gt $waitDeadline -or $target.StartTime -lt $readyAt) {
                throw "Resolve acquisition fell outside the authoritative readiness window."
            }

            $startedRecord = [ordered]@{
                schema = 1
                status = "started"
                run = $RunLabel
                token = $ReadyToken
                expectedProfileState = $ExpectedProfileState
                expectedProfileIdentity = if ($ExpectedProfileState -eq "Present") { $ExpectedProfileIdentity } else { $null }
                runDirectory = [IO.Path]::GetFullPath($runDir)
                samplerPid = $PID
                samplerStartTime = $samplerProcess.StartTime.ToString("o")
                readyAt = $readyAt.ToString("o")
                waitDeadline = $waitDeadline.ToString("o")
                targetProcessId = $target.Id
                targetStartTime = $target.StartTime.ToString("o")
                startedAt = $acquiredAt.ToString("o")
                durationSeconds = $DurationSeconds
                respondingIntervalMs = $RespondingIntervalMs
                cimIntervalMs = $CimIntervalMs
            }
            Consume-ReadyAndPublish $readyPath $revokedPath $startedPath $startedRecord
        } catch {
            $waitError = $_
            if (Test-Path -LiteralPath $readyPath -PathType Leaf) {
                $failureRecord = [ordered]@{
                    schema = 1
                    status = "failed"
                    run = $RunLabel
                    token = $ReadyToken
                    samplerPid = $PID
                    samplerStartTime = $samplerProcess.StartTime.ToString("o")
                    failedAt = (Get-Date).ToString("o")
                    reason = $waitError.Exception.Message
                }
                Consume-ReadyAndPublish $readyPath $revokedPath $failedPath $failureRecord
            }
            throw $waitError
        }
    } else {
        if ($existingResolve.Count) {
            throw "Resolve is already running. Close it normally, then start this sampler before reopening Resolve."
        }

        Write-Host "$RunLabel sampler is ready. Start Resolve and open the fixed test project normally."
        $waitDeadline = (Get-Date).AddSeconds($WaitForResolveSeconds)
        do {
            $target = Get-Process -Name Resolve -ErrorAction SilentlyContinue | Select-Object -First 1
            if (-not $target) {
                Start-Sleep -Milliseconds 100
            }
        } while (-not $target -and (Get-Date) -lt $waitDeadline)

        if (-not $target) {
            throw "Resolve did not start within $WaitForResolveSeconds seconds."
        }
    }
}

$sampleStart = Get-Date
$sampleDeadline = $sampleStart.AddSeconds($DurationSeconds)
$targetId = $target.Id
$boundTargetStartTime = $target.StartTime
$runtimeIdentityMismatch = $false
$targetExitedBeforeCompletion = $false
$cimJob = Start-Job -ScriptBlock {
    param($DeadlineIso, $IntervalMs, $ObservedProcessId)

    $deadline = [datetime]::Parse($DeadlineIso, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
    $records = [Collections.Generic.List[object]]::new()
    while ((Get-Date) -lt $deadline) {
        $queryStarted = Get-Date
        $processes = Get-CimInstance Win32_Process | Where-Object {
            $_.ProcessId -eq $ObservedProcessId -or
            $_.Name -eq 'Resolve.exe' -or
            ($_.Name -eq 'electron.exe' -and $_.CommandLine -match 'DaVinci Resolve\\Electron|Clackly|resolve-command-center|com\.wutpeach') -or
            (($_.Name -match '^(node|npm|python|pythonw|fuscript)\.exe$') -and $_.CommandLine -match 'Clackly|resolve-command-center|com\.wutpeach')
        }

        foreach ($process in $processes) {
            $records.Add([pscustomobject]@{
                Timestamp = $queryStarted.ToString("o")
                QueryDurationMs = [math]::Round(((Get-Date) - $queryStarted).TotalMilliseconds, 3)
                ProcessId = $process.ProcessId
                ParentProcessId = $process.ParentProcessId
                Name = $process.Name
                CreationDate = $process.CreationDate
                CpuSeconds = [math]::Round(($process.KernelModeTime + $process.UserModeTime) / 10000000, 3)
                WorkingSetMB = [math]::Round($process.WorkingSetSize / 1MB, 1)
                CommandLine = $process.CommandLine
            })
        }

        $sleepMs = $IntervalMs - [int]((Get-Date) - $queryStarted).TotalMilliseconds
        if ($sleepMs -gt 0) {
            Start-Sleep -Milliseconds $sleepMs
        }
    }
    return $records
} -ArgumentList $sampleDeadline.ToString("o"), $CimIntervalMs, $targetId

$respondingSamples = [Collections.Generic.List[object]]::new()
$clock = [Diagnostics.Stopwatch]::StartNew()
$nextSampleMs = 0.0
while ((Get-Date) -lt $sampleDeadline) {
    $timestamp = Get-Date
    try {
        $process = Get-Process -Id $targetId -ErrorAction Stop
        $identityMatches = -not $handshakeMode -or (
            $process.ProcessName -eq "Resolve" -and
            $process.StartTime -eq $boundTargetStartTime
        )
        if ($identityMatches) {
            $respondingSamples.Add([pscustomobject]@{
                Timestamp = $timestamp.ToString("o")
                ProcessId = $targetId
                Responding = $process.Responding
                CpuSeconds = [math]::Round($process.CPU, 3)
                WorkingSetMB = [math]::Round($process.WorkingSet64 / 1MB, 1)
                Exited = $false
                IdentityMismatch = $false
            })
        } else {
            $runtimeIdentityMismatch = $true
            $respondingSamples.Add([pscustomobject]@{
                Timestamp = $timestamp.ToString("o")
                ProcessId = $targetId
                Responding = $null
                CpuSeconds = $null
                WorkingSetMB = $null
                Exited = $false
                IdentityMismatch = $true
            })
        }
    } catch {
        if ($handshakeMode) {
            $targetExitedBeforeCompletion = $true
        }
        $respondingSamples.Add([pscustomobject]@{
            Timestamp = $timestamp.ToString("o")
            ProcessId = $targetId
            Responding = $null
            CpuSeconds = $null
            WorkingSetMB = $null
            Exited = $true
            IdentityMismatch = $false
        })
    }

    $nextSampleMs += $RespondingIntervalMs
    $sleepMs = [int][math]::Floor($nextSampleMs - $clock.Elapsed.TotalMilliseconds)
    if ($sleepMs -gt 0) {
        Start-Sleep -Milliseconds $sleepMs
    }
}

$respondingSamples | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $runDir "resolve-responding.csv")
$cimSamples = @(Receive-Job -Job $cimJob -Wait)
Remove-Job -Job $cimJob -Force
$cimSamples | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $runDir "process-metadata.csv")

$cimCadenceSamples = @(
    $cimSamples |
        Group-Object Timestamp |
        ForEach-Object { $_.Group | Select-Object -First 1 }
)
$cadence = [ordered]@{
    responding = Get-CadenceSummary $respondingSamples "Timestamp" $RespondingIntervalMs
    cim = Get-CadenceSummary $cimCadenceSamples "Timestamp" $CimIntervalMs
}
$cadence | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $runDir "cadence.json")

if (Test-Path -LiteralPath $resolveLog) {
    Read-LogDelta $resolveLog $logOffset | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $runDir "davinci-resolve-delta.log")
}

$traceFiles = @(
    Get-ChildItem -LiteralPath $env:TEMP -Filter "clackly-startup-v1-*.jsonl" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $sampleStart.AddSeconds(-1) }
)
foreach ($traceFile in $traceFiles) {
    Copy-Item -LiteralPath $traceFile.FullName -Destination $runDir
}

if ($handshakeMode -and ($runtimeIdentityMismatch -or $targetExitedBeforeCompletion)) {
    throw "Bound Resolve process identity changed or exited before sampling completion; run.json was not published."
}
if ($handshakeMode) {
    try {
        $finalTarget = Get-Process -Id $targetId -ErrorAction Stop
        if ($finalTarget.ProcessName -ne "Resolve" -or $finalTarget.StartTime -ne $boundTargetStartTime) {
            throw "identity mismatch"
        }
    } catch {
        throw "Bound Resolve process identity was not live immediately before completion publication."
    }
}

$result = [ordered]@{
    schema = 2
    status = "complete"
    run = $RunLabel
    readinessToken = if ($handshakeMode) { $ReadyToken } else { $null }
    samplerPid = $PID
    samplerStartTime = (Get-Process -Id $PID).StartTime.ToString("o")
    startedAt = $sampleStart.ToString("o")
    endedAt = (Get-Date).ToString("o")
    durationSeconds = $DurationSeconds
    targetProcessId = $targetId
    targetProcessName = $target.ProcessName
    targetStartTime = $target.StartTime.ToString("o")
    readinessPublishedAt = if ($handshakeMode) { $readyAt.ToString("o") } else { $null }
    readinessWaitDeadline = if ($handshakeMode) { $waitDeadline.ToString("o") } else { $null }
    expectedProfileState = if ($handshakeMode) { $ExpectedProfileState } else { $null }
    expectedProfileIdentity = if ($handshakeMode -and $ExpectedProfileState -eq "Present") { $ExpectedProfileIdentity } else { $null }
    respondingIntervalMs = $RespondingIntervalMs
    cimIntervalMs = $CimIntervalMs
    resolveLog = $resolveLog
    resolveLogOffset = $logOffset
    traceFiles = @($traceFiles.Name)
    outputDirectory = $runDir
}
Write-AtomicJsonAbsent $completionPath $result

Write-Host "$RunLabel sampling complete: $runDir"
Write-Host "Report whether the entire Resolve GUI stopped responding during Clackly startup; timeline-only stutter does not count."
