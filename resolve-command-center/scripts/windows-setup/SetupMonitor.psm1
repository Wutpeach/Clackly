Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
# Test observer only. It never establishes installed, writes a cancellation,
# changes an existing deadline, terminates a process or retries a transaction.
function New-SetupMonitor([string]$Session,[string]$Evidence,[double]$TotalSeconds=1800,$Budgets=$null) {
    if (!$Budgets) {$Budgets=@{verifying=600;'source-checked'=300;preparing=300;waiting=120;staging=600;prepared=300;installing=300;checking=300;'transaction-checked'=300;inspecting=600;'inspect-transaction'=600;starting=30}}
    return @{Session=$Session;Evidence=$Evidence;Started=[DateTime]::UtcNow;Phase='starting';PhaseStarted=[DateTime]::UtcNow;TotalSeconds=$TotalSeconds;Budgets=$Budgets;Seen=@{};Processes=@{};Timeline=[Collections.Generic.List[object]]::new();Samples=[Collections.Generic.List[object]]::new();LastSample=[DateTime]::MinValue;Journal='';Outcome='observing';Classification='no-process-checkpoint';TimedOut=$false}
}
function Read-SetupMonitorJson([string]$Path) {
    if (!(Test-Path -LiteralPath $Path) -or (Get-Item -LiteralPath $Path).Length -gt 65536) {return $null}
    try {return ([IO.File]::ReadAllText($Path) | ConvertFrom-Json)} catch {return $null}
}
function Save-SetupMonitor($Monitor) {
    $data=@{schemaVersion=1;observerOnly=$true;session=$Monitor.Session;startedUtc=$Monitor.Started.ToString('o');observedUtc=[DateTime]::UtcNow.ToString('o');elapsedSeconds=([DateTime]::UtcNow-$Monitor.Started).TotalSeconds;phase=$Monitor.Phase;phaseSeconds=([DateTime]::UtcNow-$Monitor.PhaseStarted).TotalSeconds;totalBudgetSeconds=$Monitor.TotalSeconds;phaseBudgets=$Monitor.Budgets;outcome=$Monitor.Outcome;classification=$Monitor.Classification;timedOut=$Monitor.TimedOut;timeline=@($Monitor.Timeline);samples=@($Monitor.Samples);processes=$Monitor.Processes}
    [IO.File]::WriteAllText($Monitor.Evidence,($data | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
}
function Update-SetupMonitor($Monitor) {
    $now=[DateTime]::UtcNow;$changed=$false;$cpuChanged=$false;$activeInspector=$false;$workerExited=$false
    $supervisor=Read-SetupMonitorJson (Join-Path $Monitor.Session 'supervisor.json')
    if ($supervisor -and !$Monitor.Seen.ContainsKey('supervisor')) {$Monitor.Seen.supervisor=$true;$Monitor.Started=[DateTime]::Parse($supervisor.created).ToUniversalTime()}
    foreach ($kind in @('worker','inspector')) {
        $record=Read-SetupMonitorJson (Join-Path $Monitor.Session ($kind+'-process.json'))
        if (!$record) {continue}
        $actual=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
        $state='exited';$cpu=$null
        if ($actual) {
            try {
                if ($actual.StartTime.ToUniversalTime().ToString('o') -cne $record.created -or $actual.MainModule.FileName -cne $record.image) {$state='identity-mismatch'}
                else {$state='running';$cpu=$actual.TotalProcessorTime.TotalSeconds}
            } catch {$state='identity-unreadable'}
        }
        $previous=if ($Monitor.Processes.ContainsKey($kind)) {$Monitor.Processes[$kind]} else {$null}
        if ($previous -and $null -ne $cpu -and $null -ne $previous.cpuSeconds -and $cpu -gt $previous.cpuSeconds) {$cpuChanged=$true}
        $Monitor.Processes[$kind]=@{pid=$record.pid;created=$record.created;image=$record.image;state=$state;cpuSeconds=$cpu;observedUtc=$now.ToString('o')}
        if ($kind -ceq 'worker') {$workerExited=$state -ceq 'exited'}
        if ($kind -ceq 'inspector' -and $state -ceq 'running') {$activeInspector=$true}
    }
    foreach ($file in @(Get-ChildItem -LiteralPath $Monitor.Session -Filter '*event-*.json' -File | Sort-Object LastWriteTimeUtc,Name)) {
        if ($Monitor.Seen.ContainsKey($file.Name)) {continue}
        $event=Read-SetupMonitorJson $file.FullName
        if (!$event -or !$supervisor -or $event.id -cne $supervisor.id) {continue}
        $kind=if ($file.Name.StartsWith('inspect-')) {'inspector'} else {'worker'}
        if (!$Monitor.Processes.ContainsKey($kind)) {continue}
        $process=$Monitor.Processes[$kind]
        if ($process.state -cnotin @('running','exited')) {continue}
        if ($event.pid -ne $process.pid -or $event.created -cne $process.created -or !$Monitor.Budgets.ContainsKey($event.event)) {continue}
        $Monitor.Seen[$file.Name]=$true;$changed=$true
        $observed=[DateTime]::Parse($event.observedUtc).ToUniversalTime()
        $Monitor.Phase=$event.event;$Monitor.PhaseStarted=$observed
        $Monitor.Timeline.Add(@{kind='bound-phase-event';phase=$event.event;file=$file.FullName;observedUtc=$observed.ToString('o');elapsedSeconds=($observed-$Monitor.Started).TotalSeconds;pid=$event.pid;created=$event.created})
    }
    $context=Read-SetupMonitorJson (Join-Path $Monitor.Session 'context.json')
    if ($context) {
        $journalPath=Join-Path $context.TransactionRoot ($context.Id+'.json')
        if (Test-Path -LiteralPath $journalPath) {
            $journal=Read-SetupMonitorJson $journalPath
            if ($journal -and $journal.id -ceq $context.Id) {
                $signature=($journal.state+'|'+(Get-Item -LiteralPath $journalPath).LastWriteTimeUtc.Ticks)
                if ($signature -cne $Monitor.Journal) {$Monitor.Journal=$signature;$changed=$true;$Monitor.Timeline.Add(@{kind='journal-observation';state=$journal.state;observedUtc=$now.ToString('o');elapsedSeconds=($now-$Monitor.Started).TotalSeconds})}
            }
        }
    }
    $Monitor.Classification=if ($workerExited -and $activeInspector) {'worker-exited-inspector-active'} elseif ($changed) {'checkpoint-changed'} elseif ($cpuChanged) {'cpu-active-no-new-checkpoint'} elseif (@($Monitor.Processes.Values | Where-Object {$_.state -ceq 'running'}).Count) {'alive-no-new-checkpoint'} else {'process-exited-or-identity-unknown'}
    if (($now-$Monitor.LastSample).TotalSeconds -ge 5 -or $changed) {$Monitor.LastSample=$now;$Monitor.Samples.Add(@{observedUtc=$now.ToString('o');elapsedSeconds=($now-$Monitor.Started).TotalSeconds;phase=$Monitor.Phase;classification=$Monitor.Classification;worker=$(if ($Monitor.Processes.ContainsKey('worker')) {$Monitor.Processes.worker.Clone()} else {$null});inspector=$(if ($Monitor.Processes.ContainsKey('inspector')) {$Monitor.Processes.inspector.Clone()} else {$null})})}
    $phaseLimit=$Monitor.Budgets[$Monitor.Phase]
    if (($now-$Monitor.Started).TotalSeconds -gt $Monitor.TotalSeconds -or ($now-$Monitor.PhaseStarted).TotalSeconds -gt $phaseLimit) {
        $Monitor.TimedOut=$true;$Monitor.Outcome=if (($now-$Monitor.Started).TotalSeconds -gt $Monitor.TotalSeconds) {'total-timeout'} else {'phase-timeout'}
    }
}
function Wait-SetupCheckpoint($Monitor,[string]$Path) {
    while ($true) {
        Update-SetupMonitor $Monitor
        if ($Monitor.TimedOut) {Save-SetupMonitor $Monitor;throw ('bounded-'+$Monitor.Outcome+' '+$Monitor.Phase+'; preserved '+$Monitor.Evidence)}
        if (Test-Path -LiteralPath $Path) {$Monitor.Outcome='checkpoint-observed';Save-SetupMonitor $Monitor;return}
        Start-Sleep -Milliseconds 250
    }
}
Export-ModuleMember -Function New-SetupMonitor,Wait-SetupCheckpoint,Save-SetupMonitor,Update-SetupMonitor
