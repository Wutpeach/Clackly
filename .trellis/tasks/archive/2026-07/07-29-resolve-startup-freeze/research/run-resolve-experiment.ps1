param(
    [Parameter(Mandatory)]
    [ValidateSet("baseline", "workflow-only", "utility-only", "overlap")]
    [string]$Mode,

    [string]$ProjectLabel = "safe test project",

    [ValidateRange(30, 180)]
    [int]$DurationSeconds = 75,

    [ValidateRange(30, 600)]
    [int]$ProjectOpenTimeoutSeconds = 180,

    [ValidateRange(60, 1800)]
    [int]$ExitTimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"

$resolveExe = "C:\Program Files\Blackmagic Design\DaVinci Resolve\Resolve.exe"
$resolveLog = Join-Path $env:APPDATA "Blackmagic Design\DaVinci Resolve\Support\logs\davinci_resolve.log"
$workflowPath = "C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly"
$utilityPath = Join-Path $env:APPDATA "Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\Clackly.py"
$workflowHold = "C:\ProgramData\Clackly-Trellis-Hold\07-29-resolve-startup-freeze\com.wutpeach.clackly"
$utilityHold = Join-Path $env:APPDATA "Clackly-Trellis-Hold\07-29-resolve-startup-freeze\Clackly.py"
$researchDir = $PSScriptRoot
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $researchDir "$runStamp-$Mode"
$gpuProcess = $null

function Assert-ResolveClosed {
    if (Get-Process -Name Resolve -ErrorAction SilentlyContinue) {
        throw "Resolve is running. Close it normally before moving either entrypoint."
    }
}

function Assert-Link([string]$Path, [string]$LinkType, [string]$Target) {
    $item = Get-Item -Force -LiteralPath $Path
    if ($item.LinkType -ne $LinkType -or $item.Target -notcontains $Target) {
        throw "Unexpected entrypoint at $Path (LinkType=$($item.LinkType), Target=$($item.Target -join ','))"
    }
}

function Move-ToHold([string]$Source, [string]$Destination) {
    if (Test-Path -LiteralPath $Destination) {
        throw "Holding path already exists: $Destination"
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Move-Item -LiteralPath $Source -Destination $Destination
}

function Restore-FromHold([string]$Source, [string]$Destination) {
    if (Test-Path -LiteralPath $Source) {
        if (Test-Path -LiteralPath $Destination) {
            throw "Cannot restore because the original path already exists: $Destination"
        }
        Move-Item -LiteralPath $Source -Destination $Destination
    }
}

Assert-ResolveClosed
Assert-Link $workflowPath "Junction" "D:\Clackly\resolve-command-center"
Assert-Link $utilityPath "SymbolicLink" "D:\Clackly\resolve-command-center\resolve\Clackly.py"

New-Item -ItemType Directory -Path $runDir | Out-Null
$start = Get-Date
$logLengthBefore = (Get-Item -LiteralPath $resolveLog).Length

@{
    mode = $Mode
    start = $start.ToString("o")
    durationSeconds = $DurationSeconds
    projectLabel = $ProjectLabel
    workflowPath = $workflowPath
    workflowHold = $workflowHold
    utilityPath = $utilityPath
    utilityHold = $utilityHold
    logLengthBefore = $logLengthBefore
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDir "run.json")

try {
    switch ($Mode) {
        "baseline" {
            Move-ToHold $workflowPath $workflowHold
            Move-ToHold $utilityPath $utilityHold
        }
        "workflow-only" { Move-ToHold $utilityPath $utilityHold }
        "utility-only" { Move-ToHold $workflowPath $workflowHold }
    }

    $resolve = Start-Process -FilePath $resolveExe -PassThru
    $projectDeadline = (Get-Date).AddSeconds($ProjectOpenTimeoutSeconds)
    $projectPointerLine = $null
    while (-not $projectPointerLine -and (Get-Date) -lt $projectDeadline) {
        $projectPointerLine = Get-Content -LiteralPath $resolveLog -Tail 250 |
            Where-Object { $_ -match 'Current project pointer changed to \(.+\)' -and $_ -notmatch 'Current project pointer changed to \(Untitled Project\) from DB' } |
            Where-Object {
                if ($_ -match '\| (?<LogTime>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \|') {
                    [datetime]::ParseExact($Matches.LogTime, 'yyyy-MM-dd HH:mm:ss,fff', [Globalization.CultureInfo]::InvariantCulture) -ge $start
                }
            } |
            Select-Object -Last 1
        if (-not $projectPointerLine) {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $projectPointerLine) {
        throw "The expected current-project pointer was not observed. Leave Resolve open and coordinate a normal close."
    }

    $sampleStart = Get-Date
    $deadline = $sampleStart.AddSeconds($DurationSeconds)
    $samples = [System.Collections.Generic.List[object]]::new()
    $nvidiaSmi = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
    if ($nvidiaSmi) {
        $gpuProcess = Start-Process -FilePath $nvidiaSmi.Source `
            -ArgumentList @("pmon", "-s", "um", "-d", "1", "-c", "$DurationSeconds") `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $runDir "nvidia-pmon.log") `
            -RedirectStandardError (Join-Path $runDir "nvidia-pmon-error.log") `
            -PassThru
    } else {
        "nvidia-smi.exe was not available" | Set-Content -LiteralPath (Join-Path $runDir "nvidia-pmon-error.log")
    }

    while ((Get-Date) -lt $deadline) {
        $now = Get-Date
        $processes = Get-CimInstance Win32_Process | Where-Object {
            $_.Name -eq 'Resolve.exe' -or
            ($_.Name -eq 'electron.exe' -and $_.CommandLine -match 'DaVinci Resolve\\Electron|Clackly|resolve-command-center|com\.wutpeach') -or
            (($_.Name -match '^(node|npm|python|pythonw|fuscript)\.exe$') -and $_.CommandLine -match 'Clackly|resolve-command-center|com\.wutpeach')
        }

        foreach ($process in $processes) {
            $responding = $null
            try {
                $responding = (Get-Process -Id $process.ProcessId -ErrorAction Stop).Responding
            } catch {}

            $samples.Add([pscustomobject]@{
                Timestamp = $now.ToString("o")
                ProcessId = $process.ProcessId
                ParentProcessId = $process.ParentProcessId
                Name = $process.Name
                Responding = $responding
                CpuSeconds = [math]::Round(($process.KernelModeTime + $process.UserModeTime) / 10000000, 3)
                WorkingSetMB = [math]::Round($process.WorkingSetSize / 1MB, 1)
                CreationDate = $process.CreationDate
                CommandLine = $process.CommandLine
            })
        }

        Start-Sleep -Milliseconds 500
    }

    $samples | Export-Csv -NoTypeInformation -LiteralPath (Join-Path $runDir "process-samples.csv")

    if ($gpuProcess -and -not $gpuProcess.WaitForExit(15000)) {
        "nvidia-smi did not finish within 15 seconds after process sampling" |
            Add-Content -LiteralPath (Join-Path $runDir "nvidia-pmon-error.log")
        Stop-Process -Id $gpuProcess.Id -ErrorAction SilentlyContinue
    }

    @{ sampleStart = $sampleStart.ToString("o"); projectPointerLine = $projectPointerLine } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDir "project-open.json")

    Write-Host "Sampling complete. Close Resolve normally when the main session asks you to."
    $closeDeadline = (Get-Date).AddSeconds($ExitTimeoutSeconds)
    while ((Get-Process -Name Resolve -ErrorAction SilentlyContinue) -and (Get-Date) -lt $closeDeadline) {
        Start-Sleep -Milliseconds 500
    }
    if (Get-Process -Name Resolve -ErrorAction SilentlyContinue) {
        throw "Resolve is still open. Close it normally; do not force-kill it."
    }

    $logLengthAfter = (Get-Item -LiteralPath $resolveLog).Length
    Get-Content -LiteralPath $resolveLog -Tail 1200 | Set-Content -LiteralPath (Join-Path $runDir "davinci-resolve-tail.log")
    @{ end = (Get-Date).ToString("o"); logLengthAfter = $logLengthAfter } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDir "result.json")
}
finally {
    if ($gpuProcess -and -not $gpuProcess.HasExited) {
        Stop-Process -Id $gpuProcess.Id -ErrorAction SilentlyContinue
    }

    if (-not (Get-Process -Name Resolve -ErrorAction SilentlyContinue)) {
        Restore-FromHold $workflowHold $workflowPath
        Restore-FromHold $utilityHold $utilityPath
        Assert-Link $workflowPath "Junction" "D:\Clackly\resolve-command-center"
        Assert-Link $utilityPath "SymbolicLink" "D:\Clackly\resolve-command-center\resolve\Clackly.py"
    } else {
        Write-Error "Resolve is still running, so entrypoints were not moved. Use the recovery commands in experiment-safety.md after Resolve closes."
    }
}
