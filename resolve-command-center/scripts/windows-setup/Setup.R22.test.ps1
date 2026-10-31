[CmdletBinding()]
param([switch]$QualificationOnly,[switch]$SyntheticOnly,[switch]$OfficialOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$build=Join-Path $repo 'resolve-command-center/build/windows-setup-r22';$closure=Join-Path $build 'fixture'
Import-Module (Join-Path $closure 'SetupPipeline.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $closure 'SetupBackend.psm1') -DisableNameChecking
Import-Module (Join-Path $closure 'SetupQualification.psm1') -DisableNameChecking
Import-Module (Join-Path $closure 'WorkflowTransaction.psm1') -DisableNameChecking
Import-Module (Join-Path $closure 'Fixture.psm1') -DisableNameChecking
$suite=Join-Path (Join-Path ([IO.Path]::GetTempPath()) 'Clackly-R22-Fixtures') ([Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($suite) | Out-Null
$results=[Collections.Generic.List[object]]::new();$failure=$null
function Assert($Value,[string]$Why) {if (!$Value) {throw ('ASSERT '+$Why)}}
function Record([string]$Case,$Evidence=$null) {$results.Add(@{case=$Case;pass=$true;evidence=$Evidence});Write-Output ('PASS '+$Case)}
function New-Case([string]$Name,[string]$Scenario='upgrade') {
    $root=Join-Path $suite $Name;[IO.Directory]::CreateDirectory($root) | Out-Null
    Write-FixtureText (Join-Path $root '.clackly-r22-fixture') 'INERT R22 ONLY';Write-FixtureText (Join-Path $root 'scenario.txt') $Scenario
    $session=@{Id=[Guid]::NewGuid().ToString('N');Root=(Join-Path $root 'session');Sequence=0};[IO.Directory]::CreateDirectory($session.Root) | Out-Null
    $adapter=New-SetupFixtureAdapter $root $session
    return @{Root=$root;Session=$session;Adapter=$adapter;OldHash=(Get-SetupArtifact $adapter.Locations.Target).hash;DataHash=(Get-TreeHash $adapter.Locations.DataRoots[0])}
}
function Use-SyntheticSource($f) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $payload=Join-Path $f.Root 'payload';$archive=Join-Path $f.Root 'synthetic-data.zip'
    $zip=[IO.Compression.ZipFile]::Open($archive,'Create')
    try {foreach ($file in @(Get-TreeFiles $payload)) {[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $payload $file.path),('plugin/'+$file.path),'Optimal') | Out-Null}} finally {$zip.Dispose()}
    $pin=@{version='0.1.3';releaseId=123;assetId=456;size=(Get-Item -LiteralPath $archive).Length;digest=(Get-UpdateHash $archive);commit=('a'*40)}
    $official=@{id=123;draft=$false;prerelease=$false;tag_name='v0.1.3';assets=@(@{id=456;name='Clackly-Workflow-0.1.3-win-x64.zip';state='uploaded';size=$pin.size;digest=('sha256:'+$pin.digest);content_type='application/zip';browser_download_url='https://github.com/Wutpeach/Clackly/releases/download/v0.1.3/Clackly-Workflow-0.1.3-win-x64.zip'})}
    $f.Adapter.SyntheticArchive=$archive;$f.Adapter.SyntheticPin=$pin;$f.Adapter.Fetch={$official}.GetNewClosure()
    if (Test-Path -LiteralPath $f.Adapter.Locations.Pointers[0]) {
        # Construct a complete *synthetic* orphan before taking its proof.
        $pointer=Read-UpdateJson $f.Adapter.Locations.Pointers[0];$pointer.digest=$pin.digest;$pointer.size=$pin.size
        $requestRoot=Join-Path $f.Adapter.Locations.Inbox $pointer.id
        $request=Read-UpdateJson (Join-Path $requestRoot 'request.json');$request.digest=$pin.digest;$request.size=$pin.size;$request.releaseId=$pin.releaseId;$request.assetId=$pin.assetId
        Write-FixtureJson $f.Adapter.Locations.Pointers[0] $pointer;Write-FixtureJson (Join-Path $requestRoot 'request.json') $request
        $output=[IO.File]::Open((Join-Path $requestRoot 'candidate.zip'),'Open','ReadWrite','None')
        try {Assert-SetupLockFile $output;$bytes=[IO.File]::ReadAllBytes($archive);$output.SetLength(0);$output.Write($bytes,0,$bytes.Length);$output.Flush($true)} finally {$output.Dispose()}
        $f.Adapter.Proof.fingerprint=(Get-SetupLegacyQualification $f.Adapter.Locations).fingerprint
        $baseline=Read-UpdateJson (Join-Path $f.Session.Root 'fixture-baseline.json');$baseline.legacyFingerprint=$f.Adapter.Proof.fingerprint
        Write-FixtureJson (Join-Path $f.Session.Root 'fixture-baseline.json') $baseline
    }
}
try {
    foreach ($case in @('clean','no-proof','orphan-positive','orphan-absence-only','tree-drift','config-drift','snapshot-drift','dpapi-unproven','process-unknown','process-running','process-coverage','other-global','other-stage','legacy-backup','historical-backup','scan-remnant','pointer-next','request-tamper','candidate-tamper','engine-lock','hardlink-lock')) {
        $scenario=if ($case -cin @('orphan-positive','orphan-absence-only','request-tamper','candidate-tamper')) {'orphan'} else {'upgrade'}
        $f=New-Case ('qualification-'+$case) $scenario;$a=$f.Adapter;$proof=$a.Proof;$held=$null
        try {
            switch -CaseSensitive ($case) {
                'no-proof' {$proof=$null}
                'orphan-absence-only' {$proof=$null}
                'tree-drift' {Write-FixtureText (Join-Path $a.Locations.Target 'old.txt') 'DRIFT'}
                'config-drift' {Write-FixtureText (Join-Path $a.Locations.DataRoots[0] 'preferences.json') 'DRIFT'}
                'snapshot-drift' {Write-FixtureText (Join-Path $proof.snapshots[0].path 'preferences.json') 'DRIFT'}
                'dpapi-unproven' {$proof.snapshots[0].dpapiSameUser=$false}
                'process-unknown' {$proof.processes[0].created=$null}
                'process-running' {$proof.processes[0].state='running'}
                'process-coverage' {$proof.processComplete=$false}
                'other-global' {Write-FixtureJson (Join-Path $a.Locations.Transactions (('2'*32)+'.json')) @{state='verified'}}
                'other-stage' {Write-FixtureText (Join-Path $a.Locations.Transactions 'foreign.stage/sentinel') 'PRESERVE'}
                'legacy-backup' {Write-FixtureText (Join-Path $a.Locations.LegacyTransactions 'old.backup/sentinel') 'PRESERVE'}
                'historical-backup' {Write-FixtureText (Join-Path $a.Locations.HistoricalBackups 'old.backup/sentinel') 'PRESERVE'}
                'scan-remnant' {Write-FixtureText (Join-Path $a.Locations.Scan ('.com.wutpeach.clackly.backup.'+('2'*32)+'/sentinel')) 'PRESERVE'}
                'pointer-next' {Write-FixtureText ($a.Locations.Pointers[0]+'.next') '{}'}
                'request-tamper' {Write-FixtureText (Join-Path $a.Locations.Inbox (('1'*32)+'/request.json')) '{}'}
                'candidate-tamper' {Write-FixtureText (Join-Path $a.Locations.Inbox (('1'*32)+'/candidate.zip')) 'TAMPER'}
                'engine-lock' {$held=[IO.File]::Open((Join-Path $a.Locations.Transactions 'install.lock'),'OpenOrCreate','ReadWrite','None')}
                'hardlink-lock' {Write-FixtureText (Join-Path $a.Locations.Transactions 'install.lock') '';New-Item -ItemType HardLink -Path (Join-Path $f.Root 'lock-alias') -Target (Join-Path $a.Locations.Transactions 'install.lock') | Out-Null}
            }
            $q=Get-SetupLegacyQualification $a.Locations $proof
            Assert ($q.eligible -eq ($case -cin @('clean','orphan-positive'))) ($case+' eligibility '+($q.blockers -join ','))
            Assert (!$q.productionRetryAuthorized) 'qualification never grants production retry'
            if ($case -ceq 'orphan-positive') {Assert ($q.bindings.Count -eq 1) 'orphan complete exact binding'}
            Record ('strict-readonly-'+$case) @{blockers=$q.blockers;fingerprint=$q.fingerprint;productionRetryAuthorized=$q.productionRetryAuthorized}
        } finally {if ($held) {$held.Dispose()}}
    }
    if (!$QualificationOnly) {
        $runs=@(@{scenario='fresh';official=$true},@{scenario='orphan';official=$true})
        $runs+=@(@('fresh','upgrade','orphan','native-failure','permission','uac-denied','uac-cancelled','host-unknown','before-backup','after-backup','rollback','cancel-before','cancel-after') | ForEach-Object {@{scenario=$_;official=$false}})
        if ($SyntheticOnly) {$runs=@($runs | Where-Object {!$_.official})}
        if ($OfficialOnly) {$runs=@($runs | Where-Object {$_.official})}
        foreach ($run in $runs) {
            $scenario=$run.scenario
            $f=New-Case ('shared-'+$(if ($run.official) {'original-'} else {'synthetic-'})+$scenario) $scenario
            if (!$run.official) {Use-SyntheticSource $f}
            Write-FixtureText (Join-Path $f.Session.Root 'continue.request') 'inert consent'
            if ($scenario -ceq 'cancel-before') {Write-FixtureText (Join-Path $f.Session.Root 'cancel.request') 'early cancel'}
            $r=Invoke-SetupOperation 'Install' $f.Session $f.Adapter
            $expected=if ($scenario -cin @('fresh','upgrade','orphan','cancel-after')) {'installed'} elseif ($scenario -cin @('after-backup','rollback')) {'rolled-back'} elseif ($scenario -cin @('cancel-before','uac-cancelled')) {'cancelled'} else {'failed'}
            Assert ($r.status -ceq $expected) ($scenario+' actual '+$r.status+'/'+$r.reason)
            Assert ((Get-TreeHash $f.Adapter.Locations.DataRoots[0]) -ceq $f.DataHash) 'all synthetic settings/DPAPI preserved'
            if ($scenario -cin @('fresh','upgrade','orphan','cancel-after')) {
                $context=Read-UpdateJson (Join-Path $f.Session.Root 'context.json');$paths=Get-TransactionPaths $context
                $actual=Get-UpdateTransactionState $context;Assert ($actual.status -ceq 'installed') 'engine independent tree/journal'
                if ($f.OldHash -cne 'absent') {Assert ((Get-TreeHash $paths.Backup) -ceq $f.OldHash) 'entire previous tree backup'}
                else {Assert (!(Test-Path -LiteralPath $paths.Backup)) 'fresh has no fabricated old backup'}
                if ($scenario -ceq 'orphan') {
                    $q=Read-UpdateJson (Join-Path $f.Session.Root 'qualification.json');$reconciled=Read-UpdateJson (Join-Path $f.Session.Root 'reconciliation.json')
                    Assert ($q.fingerprint -ceq $reconciled.fingerprint) 'atomic reconciliation observation bound'
                    foreach ($artifact in @($q.artifacts | Where-Object {$_.path.StartsWith($f.Adapter.Locations.Inbox+'\') -or $_.path -ceq $f.Adapter.Locations.Pointers[0]})) {Assert ((Get-SetupArtifact $artifact.path).hash -ceq $artifact.hash) 'all original orphan bytes retained'}
                }
            } else {Assert ((Get-SetupArtifact $f.Adapter.Locations.Target).hash -ceq $f.OldHash) 'old full tree restored/unchanged'}
            Record ('shared-'+$(if ($run.official) {'original-'} else {'synthetic-'})+'production-pipeline-inert-'+$scenario) @{status=$r.status;reason=$r.reason;oldHash=$f.OldHash;root=$f.Root;actualOfficialZip=$run.official;syntheticHostNativeProtection=$true}
        }
        if (!$OfficialOnly) {
            $ps=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
            $child=Start-Process $ps -ArgumentList '-NoProfile -NonInteractive -Command exit 0' -WindowStyle Hidden -PassThru;$null=$child.Handle
            $exited=@{pid=$child.Id;created=$child.StartTime.ToUniversalTime().ToString('o')};Assert ($child.WaitForExit(5000) -and $child.ExitCode -eq 0) 'real inert exited process identity'
            foreach ($case in @('safe','safe-empty','safe-orphan','nested-empty-request','sibling-inbox','legacy-transactions','historical-backup','scan-remnant','other-journal','own-stage','own-failed','pointer-next','config-drift','target-drift','backup-drift')) {
                $f=New-Case ('inspect-namespace-'+$case) $(if ($case -cin @('safe-orphan','nested-empty-request')) {'orphan'} else {'upgrade'});Use-SyntheticSource $f
                if ($case -ceq 'safe-empty') {foreach ($path in @($f.Adapter.Locations.Inbox,$f.Adapter.Locations.LegacyTransactions,$f.Adapter.Locations.HistoricalBackups)) {[IO.Directory]::CreateDirectory($path) | Out-Null};$f.Adapter.Proof.fingerprint=(Get-SetupLegacyQualification $f.Adapter.Locations).fingerprint}
                Write-FixtureText (Join-Path $f.Session.Root 'continue.request') 'inert consent'
                $r=Invoke-SetupOperation 'Install' $f.Session $f.Adapter;Assert ($r.status -ceq 'installed') 'prepare independent synthetic inspector'
                $r.workerPid=$exited.pid;$r.workerCreated=$exited.created;Write-FixtureJson (Join-Path $f.Session.Root 'result.json') $r
                $context=Read-UpdateJson (Join-Path $f.Session.Root 'context.json');$locations=$f.Adapter.Locations
                switch -CaseSensitive ($case) {
                    'nested-empty-request' {[IO.Directory]::CreateDirectory((Join-Path $locations.Inbox (('1'*32)+'/unexpected-empty-directory'))) | Out-Null}
                    'sibling-inbox' {Write-FixtureText (Join-Path $locations.Inbox (('2'*32)+'/request.json')) '{}'}
                    'legacy-transactions' {Write-FixtureText (Join-Path $locations.LegacyTransactions 'foreign.backup/sentinel') 'PRESERVE'}
                    'historical-backup' {Write-FixtureText (Join-Path $locations.HistoricalBackups 'foreign.backup/sentinel') 'PRESERVE'}
                    'scan-remnant' {Write-FixtureText (Join-Path $locations.Scan ('.com.wutpeach.clackly.backup.'+('2'*32)+'/sentinel')) 'PRESERVE'}
                    'other-journal' {Write-FixtureText (Join-Path $locations.Transactions (('2'*32)+'.json')) '{}'}
                    'own-stage' {Write-FixtureText (Join-Path (Get-TransactionPaths $context).Stage 'unknown-sentinel') 'PRESERVE'}
                    'own-failed' {Write-FixtureText (Join-Path (Get-TransactionPaths $context).Failed 'unknown-sentinel') 'PRESERVE'}
                    'pointer-next' {Write-FixtureText ($locations.Pointers[0]+'.next') '{}'}
                    'config-drift' {Write-FixtureText (Join-Path $locations.DataRoots[0] 'preferences.json') 'DRIFT'}
                    'target-drift' {Write-FixtureText (Join-Path $locations.Target 'workflow-plugin/main.js') 'DRIFT'}
                    'backup-drift' {Write-FixtureText (Join-Path (Get-TransactionPaths $context).Backup 'old.txt') 'DRIFT'}
                }
                $refused=$false;$reason=$null
                try {$actual=Get-SetupReconciledOutcome $context $f.Session.Root} catch {$refused=$true;$reason=$_.Exception.Message}
                if ($case -cin @('safe','safe-empty','safe-orphan')) {Assert (!$refused -and $actual.status -ceq 'installed') ('safe independent inspector '+$reason)}
                else {Assert $refused ('inspect accepted '+$case)}
                Record ('independent-journal-inspect-'+$case) @{refused=$refused;reason=$reason;root=$f.Root;syntheticData=$true}
            }
        }
    }
} catch {$failure=$_}
$report=@{round='R22';fixture=$true;observedUtc=[DateTime]::UtcNow.ToString('o');suiteRoot=$suite;count=$results.Count;results=@($results);success=($null -eq $failure);failure=$(if ($failure) {$failure.Exception.Message} else {$null})}
$path=Join-Path $build ('test-report-R22-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'.json');Write-FixtureJson $path $report
if ($failure) {throw $failure}
Write-Output ('TOTAL '+$results.Count+' PASS; '+$path)
