[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'SetupMonitor.psm1') -Force
$root=Join-Path ([IO.Path]::GetTempPath()) ('Clackly-R24-Monitor-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$ps=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
$script=Join-Path $root 'natural-child.ps1'
[IO.File]::WriteAllText($script,'Start-Sleep -Seconds 3; exit 0')
$child=Start-Process $ps -ArgumentList ('-NoProfile -NonInteractive -File "'+$script+'"') -WindowStyle Hidden -PassThru
$null=$child.Handle;$created=$child.StartTime.ToUniversalTime().ToString('o')
[IO.File]::WriteAllText((Join-Path $root 'worker-process.json'),(@{pid=$child.Id;created=$created;image=$ps} | ConvertTo-Json))
$evidence=Join-Path $root 'timeout.json';$monitor=New-SetupMonitor $root $evidence -TotalSeconds 0.5 -Budgets @{starting=5}
$rejected=$false
try {Wait-SetupCheckpoint $monitor (Join-Path $root 'never-created.json')} catch {if ($_.Exception.Message -notlike 'bounded-total-timeout*') {throw};$rejected=$true}
if (!$rejected -or $child.HasExited) {throw 'timeout must preserve live child'}
$saved=[IO.File]::ReadAllText($evidence) | ConvertFrom-Json
if (!$saved.timedOut -or $saved.processes.worker.pid -ne $child.Id -or $saved.processes.worker.created -cne $created -or $saved.processes.worker.state -cne 'running') {throw 'timeout exact identity absent'}
if (!$child.WaitForExit(5000) -or $child.ExitCode -ne 0) {throw 'child did not naturally exit'}
$id=[Guid]::NewGuid().ToString('N')
[IO.File]::WriteAllText((Join-Path $root 'supervisor.json'),(@{id=$id;created=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json))
$inspector=Start-Process $ps -ArgumentList ('-NoProfile -NonInteractive -File "'+$script+'"') -WindowStyle Hidden -PassThru
$null=$inspector.Handle;$inspectorCreated=$inspector.StartTime.ToUniversalTime().ToString('o')
[IO.File]::WriteAllText((Join-Path $root 'inspector-process.json'),(@{pid=$inspector.Id;created=$inspectorCreated;image=$ps} | ConvertTo-Json))
[IO.File]::WriteAllText((Join-Path $root 'inspect-event-0001.json'),(@{id=$id;pid=$inspector.Id;created=$inspectorCreated;observedUtc=[DateTime]::UtcNow.ToString('o');event='inspecting'} | ConvertTo-Json))
[IO.File]::WriteAllText((Join-Path $root 'inspect-event-0002.json'),(@{id=$id;pid=$inspector.Id;created='forged';observedUtc=[DateTime]::UtcNow.ToString('o');event='installing'} | ConvertTo-Json))
$inspection=New-SetupMonitor $root (Join-Path $root 'inspection-observation.json')
Update-SetupMonitor $inspection;Save-SetupMonitor $inspection
if ($inspection.Phase -cne 'inspecting' -or $inspection.Classification -cne 'worker-exited-inspector-active' -or $inspection.Timeline.Count -ne 1) {throw 'independent Inspector phase or false identity handling'}
if (!$inspector.WaitForExit(15000) -or $inspector.ExitCode -ne 0) {throw 'Inspector control did not naturally exit'}
$mismatch=Join-Path $root 'identity-mismatch';[IO.Directory]::CreateDirectory($mismatch) | Out-Null
$wrongCreated=[DateTime]::UtcNow.AddDays(-1).ToString('o')
[IO.File]::WriteAllText((Join-Path $mismatch 'supervisor.json'),(@{id=$id;created=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json))
[IO.File]::WriteAllText((Join-Path $mismatch 'worker-process.json'),(@{pid=$PID;created=$wrongCreated;image=$ps} | ConvertTo-Json))
[IO.File]::WriteAllText((Join-Path $mismatch 'event-0001.json'),(@{id=$id;pid=$PID;created=$wrongCreated;observedUtc=[DateTime]::UtcNow.ToString('o');event='installing'} | ConvertTo-Json))
$identity=New-SetupMonitor $mismatch (Join-Path $mismatch 'observation.json')
Update-SetupMonitor $identity;Save-SetupMonitor $identity
if ($identity.Phase -cne 'starting' -or $identity.Timeline.Count -ne 0 -or $identity.Processes.worker.state -cne 'identity-mismatch') {throw 'unknown actual identity advanced checkpoint'}
[IO.File]::WriteAllText((Join-Path $root 'ready.json'),'ready')
$ready=New-SetupMonitor $root (Join-Path $root 'ready-observation.json')
Wait-SetupCheckpoint $ready (Join-Path $root 'ready.json')
Write-Output ('PASS bounded-timeout-preserves-live-child-and-identity; natural-exit; independent-Inspector-active; forged-event-refused; ready-checkpoint; '+$evidence)
