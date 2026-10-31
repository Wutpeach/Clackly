[CmdletBinding()]
param([string]$WorkerRoot='', [switch]$HoldAfterResult,[switch]$InspectorOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$build=Join-Path $repo 'resolve-command-center/build/windows-setup-r23';$closure=Join-Path $build 'fixture'
foreach ($module in @('SetupPipeline','SetupBackend','SetupQualification','WorkflowTransaction','Fixture')) {Import-Module (Join-Path $closure ($module+'.psm1')) -DisableNameChecking}
function Assert($Value,[string]$Why) {if (!$Value) {throw ('ASSERT '+$Why)}}
function Use-SyntheticSource($f,[switch]$Existing) {
    $archive=Join-Path $f.Root 'synthetic-data.zip'
    if (!$Existing) {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip=[IO.Compression.ZipFile]::Open($archive,'Create')
        try {foreach ($file in @(Get-TreeFiles (Join-Path $f.Root 'payload'))) {[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $f.Root ('payload/'+$file.path)),('plugin/'+$file.path),'Optimal') | Out-Null}} finally {$zip.Dispose()}
    }
    $pin=@{version='0.1.3';releaseId=123;assetId=456;size=(Get-Item -LiteralPath $archive).Length;digest=(Get-UpdateHash $archive);commit=('a'*40)}
    $official=@{id=123;draft=$false;prerelease=$false;tag_name='v0.1.3';assets=@(@{id=456;name='Clackly-Workflow-0.1.3-win-x64.zip';state='uploaded';size=$pin.size;digest=('sha256:'+$pin.digest);content_type='application/zip';browser_download_url='https://github.com/Wutpeach/Clackly/releases/download/v0.1.3/Clackly-Workflow-0.1.3-win-x64.zip'})}
    $f.Adapter.SyntheticArchive=$archive;$f.Adapter.SyntheticPin=$pin;$f.Adapter.Fetch={$official}.GetNewClosure()
}
if ($WorkerRoot) {
    $WorkerRoot=Assert-NormalPath $WorkerRoot
    $allowed=Join-Path ([IO.Path]::GetTempPath()) 'Clackly-R23-Fixtures'
    if (!$WorkerRoot.StartsWith($allowed+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'fixture-root-refused'}
    $session=Read-UpdateJson (Join-Path $WorkerRoot 'test-session.json')
    $adapter=New-SetupFixtureAdapter $WorkerRoot $session -Inspect
    $f=@{Root=$WorkerRoot;Session=$session;Adapter=$adapter};Use-SyntheticSource $f -Existing
    $receipt=Invoke-SetupOperation Install $session $adapter
    [Console]::Out.WriteLine(('@@R23_RESULT@@'+(ConvertTo-Json -InputObject $receipt -Depth 12 -Compress)));[Console]::Out.Flush()
    if ($HoldAfterResult) {Start-Sleep -Seconds 12};exit 0
}
$suite=Join-Path (Join-Path ([IO.Path]::GetTempPath()) 'Clackly-R23-Fixtures') ([Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($suite) | Out-Null
$results=[Collections.Generic.List[object]]::new();$failure=$null;$children=[Collections.Generic.List[object]]::new()
function Record([string]$Case,$Evidence=$null) {$results.Add(@{case=$Case;pass=$true;evidence=$Evidence});Write-Output ('PASS '+$Case)}
function New-Case([string]$Name,[string]$Scenario='upgrade') {
    $root=Join-Path $suite $Name;[IO.Directory]::CreateDirectory($root) | Out-Null
    Write-FixtureText (Join-Path $root '.clackly-r23-fixture') 'INERT R23 ONLY';Write-FixtureText (Join-Path $root 'scenario.txt') $Scenario
    $session=@{Id=[Guid]::NewGuid().ToString('N');Root=(Join-Path $root 'session');Sequence=0};[IO.Directory]::CreateDirectory($session.Root) | Out-Null
    $adapter=New-SetupFixtureAdapter $root $session
    $f=@{Root=$root;Session=$session;Adapter=$adapter;OldHash=(Get-SetupArtifact $adapter.Locations.Target).hash;DataHash=(Get-TreeHash $adapter.Locations.DataRoots[0])}
    Use-SyntheticSource $f;Write-FixtureText (Join-Path $session.Root 'continue.request') 'inert consent';Write-FixtureJson (Join-Path $root 'test-session.json') $session;return $f
}
function Reject([scriptblock]$Action,[string]$Reason='recovery-required') {
    $refused=$false;try {& $Action | Out-Null} catch {$refused=$true;Assert ($_.Exception.Message -ceq $Reason) ('expected '+$Reason+' actual '+$_.Exception.Message)};Assert $refused ('accepted '+$Reason)
}
function Assert-Preserved($f) {Assert ((Get-SetupArtifact $f.Adapter.Locations.Target).hash -ceq $f.OldHash) 'entire old tree preserved';Assert ((Get-TreeHash $f.Adapter.Locations.DataRoots[0]) -ceq $f.DataHash) 'excluded data full bytes preserved'}
function Start-TestWorker($f,[switch]$Hold) {
    $ps=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    $args='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -WorkerRoot "'+$f.Root+'"';if ($Hold) {$args+=' -HoldAfterResult'}
    $out=Join-Path $f.Root 'worker.stdout';$err=Join-Path $f.Root 'worker.stderr'
    $p=Start-Process $ps -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru;$null=$p.Handle;$children.Add($p)
    return @{Process=$p;Pid=$p.Id;Created=$p.StartTime.ToUniversalTime().ToString('o');Out=$out;Err=$err}
}
function Get-TestWorkerReceipt($w,[switch]$BeforeExit) {
    if (!$BeforeExit) {Assert ($w.Process.WaitForExit(60000) -and $w.Process.ExitCode -eq 0) ('worker exit; retained stderr '+$w.Err)}
    $deadline=[DateTime]::UtcNow.AddSeconds(45);$line=$null
    while (!$line -and [DateTime]::UtcNow -lt $deadline) {
        $stream=[IO.File]::Open($w.Out,'Open','Read','ReadWrite');$reader=[IO.StreamReader]::new($stream)
        try {$content=$reader.ReadToEnd()} finally {$reader.Dispose()}
        $line=@($content -split '\r?\n' | Where-Object {$_.StartsWith('@@R23_RESULT@@')}) | Select-Object -Last 1;if (!$line) {Start-Sleep -Milliseconds 100}
    }
    Assert ($null -ne $line) ('worker terminal missing; retained stderr '+$w.Err)
    $r=$line.Substring(14) | ConvertFrom-Json
    Assert ($r.workerPid -eq $w.Pid -and $r.workerCreated -ceq $w.Created) 'terminal bound to actual worker PID/start'
    $witness=@{};foreach ($key in @('baseline','context','result','journal')) {$witness[$key]=$r.inspectionWitness.$key};$r.inspectionWitness=$witness;return $r
}
function Invoke-TestInspect($f,$Witness) {
    $path=Join-Path $f.Session.Root 'inspect.json'
    if (Test-Path -LiteralPath $path) {Move-Item -LiteralPath $path -Destination (Join-Path $f.Session.Root ('inspect-observation-'+[Guid]::NewGuid().ToString('N')+'.json'))}
    return Invoke-SetupOperation Inspect $f.Session $f.Adapter $Witness
}
try {
    if (!$InspectorOnly) {
    Reject {Assert-SetupExecutionScope (Get-SetupProductionLocations)} 'local-candidate-gate';Record 'ordinary-production-immutable-gate-before-real-provider'
    $f=New-Case 'metadata-exclusive-lock';$path=Join-Path $f.Adapter.Locations.Transactions 'install.lock';$held=[IO.File]::Open($path,'OpenOrCreate','ReadWrite','None')
    try {Assert-SetupLockFile $held;$identity=Get-SetupPathIdentity $path;Assert ($identity -cmatch '^\d+:\d+:\d+$') 'locked file identity';Record 'metadata-identity-readable-under-actual-exclusive-engine-lock' $identity} finally {$held.Dispose()}
    foreach ($case in @('pointer','pointer-next','request','legacy-backup','historical-backup','scan-remnant','scan-remnant-uppercase','other-journal','other-stage','other-failed','other-json-next','own-looking-history')) {
        $f=New-Case ('reject-'+$case);$a=$f.Adapter
        $path=switch ($case) {
            'pointer' {$a.Locations.Pointers[0]};'pointer-next' {$a.Locations.Pointers[0]+'.next'};'request' {Join-Path $a.Locations.Inbox 'unknown/request.json'}
            'legacy-backup' {Join-Path $a.Locations.LegacyTransactions 'foreign.backup/sentinel'};'historical-backup' {Join-Path $a.Locations.HistoricalBackups 'foreign.backup/sentinel'}
            'scan-remnant' {Join-Path $a.Locations.Scan '.com.wutpeach.clackly.backup.foreign/sentinel'};'other-journal' {Join-Path $a.Locations.Transactions (('2'*32)+'.json')}
            'scan-remnant-uppercase' {Join-Path $a.Locations.Scan '.COM.WUTPEACH.CLACKLY.backup.foreign/sentinel'}
            'other-stage' {Join-Path $a.Locations.Transactions 'foreign.stage/sentinel'};'other-failed' {Join-Path $a.Locations.Transactions 'foreign.failed/sentinel'}
            'other-json-next' {Join-Path $a.Locations.Transactions 'foreign.json.next'};'own-looking-history' {Join-Path $a.Locations.Transactions ($f.Session.Id+'.json')}
        }
        Write-FixtureText $path '{"state":"verified","preserve":true}';$hash=Get-UpdateHash $path;$r=Invoke-SetupOperation Install $f.Session $a
        Assert ($r.status -ceq 'failed' -and $r.reason -ceq 'recovery-required') ($case+' '+$r.status+'/'+$r.reason)
        Assert-Preserved $f;Assert ((Get-UpdateHash $path) -ceq $hash) 'conflicting bytes retained';Record ('clean-route-refuses-'+$case) @{root=$f.Root;reason=$r.reason}
    }
    foreach ($case in @('adapter-lock','engine-lock','hardlink-lock')) {
        $f=New-Case $case;$a=$f.Adapter;$held=$null
        try {
            if ($case -ceq 'adapter-lock') {$held=[IO.File]::Open((Join-Path $a.Locations.Scan '.clackly-setup.lock'),'OpenOrCreate','ReadWrite','None')}
            elseif ($case -ceq 'engine-lock') {$held=[IO.File]::Open((Join-Path $a.Locations.Transactions 'install.lock'),'OpenOrCreate','ReadWrite','None')}
            else {Write-FixtureText (Join-Path $a.Locations.Transactions 'install.lock') '';New-Item -ItemType HardLink -Path (Join-Path $f.Root 'lock-alias') -Target (Join-Path $a.Locations.Transactions 'install.lock') | Out-Null}
            $r=Invoke-SetupOperation Install $f.Session $a;$expected=if ($case -ceq 'hardlink-lock') {'recovery-required'} else {'concurrent-install'}
            Assert ($r.status -ceq 'failed' -and $r.reason -ceq $expected) ($case+' '+$r.reason);Assert-Preserved $f;Record ('actual-'+$case+'-refused') @{root=$f.Root;reason=$r.reason}
        } finally {if ($held) {$held.Dispose()}}
    }
    foreach ($scenario in @('fresh','upgrade','native-failure','permission','uac-denied','uac-cancelled','host-unknown','before-backup','after-backup','rollback','cancel-before','cancel-after')) {
        $f=New-Case ('common-'+$scenario) $scenario;if ($scenario -ceq 'cancel-before') {Write-FixtureText (Join-Path $f.Session.Root 'cancel.request') 'early cancel'}
        $r=Invoke-SetupOperation Install $f.Session $f.Adapter
        $expected=if ($scenario -cin @('fresh','upgrade','cancel-after')) {'installed'} elseif ($scenario -cin @('after-backup','rollback')) {'rolled-back'} elseif ($scenario -cin @('cancel-before','uac-cancelled')) {'cancelled'} else {'failed'}
        Assert ($r.status -ceq $expected) ($scenario+' '+$r.status+'/'+$r.reason)
        if ($expected -ceq 'installed') {
            $context=Read-UpdateJson (Join-Path $f.Session.Root 'context.json');$actual=Get-UpdateTransactionState $context;Assert ($actual.status -ceq 'installed') 'existing engine full journal/tree validation';$backup=(Get-TransactionPaths $context).Backup
            if ($f.OldHash -ceq 'absent') {Assert (!(Test-Path -LiteralPath $backup)) 'fresh no fabricated backup'} else {Assert ((Get-TreeHash $backup) -ceq $f.OldHash) 'complete old backup'}
        } else {Assert-Preserved $f};Record ('common-synthetic-'+$scenario) @{root=$f.Root;status=$r.status;reason=$r.reason}
    }
    foreach ($case in @('history-gap','data-empty-directory-gap','old-empty-directory-gap','own-next-after-stage','own-backup-after-stage')) {
        $f=New-Case ('final-check-'+$case);$a=$f.Adapter;$l=$a.Locations;$s=$f.Session
        if ($case -ceq 'history-gap') {$a.Access={param($t,$scan) Write-FixtureText (Join-Path $l.Transactions (('2'*32)+'.json')) '{"state":"verified"}'}.GetNewClosure()}
        if ($case -ceq 'data-empty-directory-gap') {$a.Access={param($t,$scan) [IO.Directory]::CreateDirectory((Join-Path $l.DataRoots[0] 'foreign-empty')) | Out-Null}.GetNewClosure()}
        if ($case -ceq 'old-empty-directory-gap') {$a.Access={param($t,$scan) [IO.Directory]::CreateDirectory((Join-Path $l.Target 'foreign-empty')) | Out-Null}.GetNewClosure()}
        if ($case -ceq 'own-next-after-stage') {$a.Checkpoint={param($point) if ($point -ceq 'after-stage') {Write-FixtureText (Join-Path $l.Transactions ($s.Id+'.json.next')) '{}'}}.GetNewClosure()}
        if ($case -ceq 'own-backup-after-stage') {$a.Checkpoint={param($point) if ($point -ceq 'after-stage') {Write-FixtureText (Join-Path $l.Transactions ($s.Id+'.backup/sentinel')) 'PRESERVE'}}.GetNewClosure()}
        $r=Invoke-SetupOperation Install $s $a;Assert ($r.status -ceq 'failed' -and $r.reason -ceq 'recovery-required') ($case+' '+$r.status+'/'+$r.reason)
        Assert ((Get-SetupArtifact $l.Target).hash -ceq $f.OldHash) 'old bytes not replaced after drift';Record ('engine-locked-final-qualification-'+$case) @{root=$f.Root;status=$r.status;reason=$r.reason}
    }
    }
    $f=New-Case 'exited-worker-inspector';[IO.Directory]::CreateDirectory((Join-Path $f.Adapter.Locations.Target 'old-empty')) | Out-Null;$oldNamespaceHash=Get-SetupEvidenceHash @(Get-SetupFullNamespace $f.Adapter.Locations.Target)
    $worker=Start-TestWorker $f;$r=Get-TestWorkerReceipt $worker;Assert ($r.status -ceq 'installed') ('real worker '+$r.reason);$witness=$r.inspectionWitness
    $context=Read-UpdateJson (Join-Path $f.Session.Root 'context.json');$paths=Get-TransactionPaths $context;$baseline=Read-UpdateJson (Join-Path $f.Session.Root 'baseline.json')
    Assert ($baseline.oldNamespaceHash -ceq $oldNamespaceHash) 'baseline binds actual empty directory'
    $inspect=Invoke-TestInspect $f $witness;Assert ($inspect.status -ceq 'installed') ('exited worker inspector '+$inspect.reason)
    Record 'actual-worker-natural-exit-witness-bound-inspector-installed' @{root=$f.Root;workerPid=$worker.Pid;workerCreated=$worker.Created;witness=$witness;oldHash=$f.OldHash;newHash=(Get-TreeHash $context.Target)}
    foreach ($case in @('missing-witness','bad-witness','baseline-bytes','context-bytes','result-bytes','journal-bytes','target-bytes','target-empty-directory','backup-bytes','backup-empty-directory','data-bytes','data-empty-directory','pointer-next','foreign-history','own-stage','own-failed','own-next')) {
        $path=$null;$bytes=$null;$directory=$false;$given=$witness
        switch ($case) {
            'missing-witness' {$given=$null};'bad-witness' {$given=@{};foreach ($key in $witness.Keys) {$given[$key]=$witness[$key]};$given.result='a'*64}
            'baseline-bytes' {$path=Join-Path $f.Session.Root 'baseline.json'};'context-bytes' {$path=Join-Path $f.Session.Root 'context.json'};'result-bytes' {$path=Join-Path $f.Session.Root 'result.json'};'journal-bytes' {$path=$paths.Journal}
            'target-bytes' {$path=Join-Path $context.Target 'workflow-plugin/main.js'};'target-empty-directory' {$path=Join-Path $context.Target 'foreign-empty';$directory=$true}
            'backup-bytes' {$path=Join-Path $paths.Backup 'old.txt'};'backup-empty-directory' {$path=Join-Path $paths.Backup 'foreign-empty';$directory=$true}
            'data-bytes' {$path=Join-Path $f.Adapter.Locations.DataRoots[0] 'preferences.json'};'data-empty-directory' {$path=Join-Path $f.Adapter.Locations.DataRoots[0] 'foreign-empty';$directory=$true}
            'pointer-next' {$path=$f.Adapter.Locations.Pointers[0]+'.next'};'foreign-history' {$path=Join-Path $context.TransactionRoot (('2'*32)+'.json')};'own-stage' {$path=$paths.Stage;$directory=$true};'own-failed' {$path=$paths.Failed;$directory=$true};'own-next' {$path=$paths.Journal+'.next'}
        }
        try {
            if ($path) {if (Test-Path -LiteralPath $path) {$bytes=[IO.File]::ReadAllBytes($path)};if ($directory) {[IO.Directory]::CreateDirectory($path) | Out-Null} else {Write-FixtureText $path 'DRIFT'}}
            $inspect=Invoke-TestInspect $f $given
            Assert ($inspect.status -ceq 'failed' -and $inspect.reason -ceq 'recovery-required') ('inspector accepted '+$case+' '+$inspect.status+'/'+$inspect.reason);Record ('actual-exited-worker-inspector-refuses-'+$case) @{root=$f.Root;reason=$inspect.reason}
        } finally {if ($path) {if ($null -ne $bytes) {[IO.File]::WriteAllBytes($path,$bytes)} else {Remove-Item -LiteralPath $path -Force}}}
    }
    $inspect=Invoke-TestInspect $f $witness;Assert ($inspect.status -ceq 'installed') 'restored exact trees/witness';Record 'actual-exited-worker-restored-witness-full-trees-installed'
    $f=New-Case 'actual-live-worker';$worker=Start-TestWorker $f -Hold;$r=Get-TestWorkerReceipt $worker -BeforeExit;Assert (!$worker.Process.HasExited -and $r.status -ceq 'installed') 'actual worker alive after terminal'
    $inspect=Invoke-TestInspect $f $r.inspectionWitness;Assert ($inspect.status -ceq 'failed' -and $inspect.reason -ceq 'recovery-required') 'actual live worker refused'
    Assert ($worker.Process.WaitForExit(20000) -and $worker.Process.ExitCode -eq 0) 'held worker naturally exits';$inspect=Invoke-TestInspect $f $r.inspectionWitness;Assert ($inspect.status -ceq 'installed') 'actual worker inspected only after exit'
    Record 'actual-live-worker-refused-until-natural-exit' @{root=$f.Root;pid=$worker.Pid;created=$worker.Created}
} catch {$failure=$_}
foreach ($child in $children) {if (!$child.HasExited) {$null=$child.WaitForExit(60000)}}
$report=@{round='R23';syntheticData=$true;buildReportSha256=(Get-UpdateHash (Join-Path $build 'build-report.json'));runnerSha256=(Get-UpdateHash $PSCommandPath);observedUtc=[DateTime]::UtcNow.ToString('o');suiteRoot=$suite;count=$results.Count;results=@($results);success=($null -eq $failure);failure=$(if ($failure) {$failure.Exception.Message} else {$null})}
$path=Join-Path $build ('test-report-R23-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'.json');Write-FixtureJson $path $report
if ($failure) {throw $failure};Write-Output ('TOTAL '+$results.Count+' PASS; '+$path)
