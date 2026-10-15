param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$RequestId)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'ExecutorSupport.psm1') -Force -DisableNameChecking
$locations = Get-ExecutorLocations $RequestId
Assert-InstalledExecutor $PSScriptRoot $locations
$executor = Join-Path $PSScriptRoot 'executor.ps1'
$powerShell = Join-Path $PSHOME 'powershell.exe'
$request = Read-UpdateJson (Join-Path $locations.Request 'request.json') 65536
$key = Get-UpdateRequestKey $request
$arguments = '-NoProfile -NonInteractive -File "' + $executor + '" -RequestId ' + $RequestId + ' -CandidateKey ' + $key
$resultPath = Join-Path $locations.Request 'result.json'
Write-ExecutorJson (Join-Path $locations.Request 'launcher.json') @{id=$RequestId;pid=$PID;created=(Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o')}
try {
    # Detached by main before Settings completes; no shutdown IPC is needed.
    $child = Start-Process -FilePath $powerShell -ArgumentList $arguments -WindowStyle Hidden -PassThru
    $handle = $child.Handle; $child.WaitForExit()
    if (Test-Path -LiteralPath $resultPath) {
        $result = Read-UpdateJson $resultPath 65536
        if ($result.id -ceq $RequestId -and $result.status -ceq 'failed' -and $result.reason -ceq 'permission-denied') {
            # Only actual access denial reaches UAC; never elevate cache code.
            Assert-ProtectedExecutor $PSScriptRoot
            if (!(Test-Path -LiteralPath (Join-Path $locations.Request 'cancel.request'))) {
                [IO.File]::Move($resultPath,(Join-Path $locations.Request 'ordinary-denied.json'))
                try {
                    $child = Start-Process -FilePath $powerShell -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru
                    $handle = $child.Handle; $child.WaitForExit()
                    if (!(Test-Path -LiteralPath $resultPath)) {
                        $result.reason='permission-denied'; Write-ExecutorJson $resultPath $result
                    }
                } catch {
                    $outcome = Get-UpdatePermissionOutcome $_ $result.oldHash
                    $result.status=$outcome.status; $result.reason=$outcome.reason
                    Write-ExecutorJson $resultPath $result
                }
            }
        }
    }
} finally {
    # Parent also observes actual launcher exit; this marker alone is not ack.
    Write-ExecutorJson (Join-Path $locations.Request 'stopped.json') @{id=$RequestId;status='stopped'}
}
