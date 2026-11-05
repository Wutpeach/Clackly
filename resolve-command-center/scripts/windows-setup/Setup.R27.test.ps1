[CmdletBinding()]
param([string]$BuildDirectory='', [string]$CaseFile='', [ValidateSet('Install','Inspect')][string]$Operation='Install')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if (!$BuildDirectory) {$BuildDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../build/windows-setup-r27'))}
$closure=Join-Path $BuildDirectory 'fixture'
foreach ($module in @('SetupPipeline','SetupBackend','SetupQualification','WorkflowTransaction','ExecutorSupport','Fixture','SetupTrust')) {Import-Module (Join-Path $closure ($module+'.psm1')) -DisableNameChecking}
function Assert($v,[string]$why) {if (!$v) {throw ('ASSERT '+$why)}}
function Adapter($case) {
    $a=New-SetupFixtureAdapter $case.root $case.session -Inspect
    $a.SyntheticArchive=$case.archive;$a.SyntheticPin=@{};foreach ($p in $case.pin.PSObject.Properties) {$a.SyntheticPin[$p.Name]=$p.Value}
    $official=$case.official;$a.Fetch={$official}.GetNewClosure();return $a
}
if ($CaseFile) {
    $case=Read-UpdateJson $CaseFile;$a=Adapter $case;$witness=$null
    if ($Operation -ceq 'Inspect') {$witness=@{};$saved=Read-UpdateJson (Join-Path $case.session.Root 'worker-terminal.json');foreach ($key in @('baseline','context','result','journal')) {$witness[$key]=$saved.inspectionWitness.$key}}
    $r=Invoke-SetupOperation $Operation $case.session $a $witness
    Write-FixtureJson (Join-Path $case.session.Root ($Operation+'-terminal.json')) $r
    if ($Operation -ceq 'Install') {Write-FixtureJson (Join-Path $case.session.Root 'worker-terminal.json') $r}
    exit 0
}
$rows=[Collections.Generic.List[object]]::new()
function Record([string]$name,$detail) {$rows.Add(@{name=$name;detail=$detail});Write-Output ('PASS '+$name)}
$root=Join-Path ([IO.Path]::GetTempPath()) ('Clackly-R24-Fixtures/r27-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
Write-FixtureText (Join-Path $root '.clackly-r24-fixture') 'INERT R24 ONLY';Write-FixtureText (Join-Path $root 'scenario.txt') 'fresh'
$init=@{Id=[Guid]::NewGuid().ToString('N');Root=(Join-Path $root 'init');Sequence=0}
[IO.Directory]::CreateDirectory($init.Root) | Out-Null
$adapter=New-SetupFixtureAdapter $root $init;$locations=$adapter.Locations
Write-FixtureText (Join-Path $root 'AppData/secret.dpapi') 'INERT NEVER DECRYPT'
[IO.Directory]::CreateDirectory((Join-Path $root 'AppData/empty-retained')) | Out-Null
$dataHash=Get-TreeHash $locations.DataRoots[0];$dataNamespace=Get-SetupEvidenceHash @(Get-SetupFullNamespace $locations.DataRoots[0])
function Source([string]$version) {
    $payload=Join-Path $root 'payload'
    Write-FixtureJson (Join-Path $payload 'package.json') @{name='clackly';version=$version}
    Write-FixtureText (Join-Path $payload 'manifest.xml') ('<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>'+$version+'</Version><FilePath>workflow-plugin/main.js</FilePath></Plugin></BlackmagicDesign>')
    $m=Read-UpdateJson (Join-Path $payload 'clackly-release.json');$m.package.version=$version;$m.source.tag='v'+$version
    $m.files=@(Get-TreeFiles $payload | Where-Object {$_.path -cne 'clackly-release.json'})
    Write-FixtureJson (Join-Path $payload 'clackly-release.json') $m
    $zipPath=Join-Path $root ($version+'-FICTIONAL-OFFLINE.zip')
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::Open($zipPath,'Create')
    try {foreach ($file in @(Get-TreeFiles $payload)) {[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $payload $file.path),('plugin/'+$file.path),'Optimal') | Out-Null}} finally {$zip.Dispose()}
    $pin=@{version=$version;releaseId=123;assetId=456;size=(Get-Item -LiteralPath $zipPath).Length;digest=(Get-UpdateHash $zipPath);commit=('a'*40)}
    return @{archive=$zipPath;pin=$pin;official=@{id=123;tag_name=('v'+$version);draft=$false;prerelease=$false;assets=@(@{id=456;name=('Clackly-Workflow-'+$version+'-win-x64.zip');state='uploaded';size=$pin.size;digest=('sha256:'+$pin.digest);content_type='application/zip';browser_download_url=('https://github.com/Wutpeach/Clackly/releases/download/v'+$version+'/Clackly-Workflow-'+$version+'-win-x64.zip')})}}
}
function New-Case($source,[string]$scenario='upgrade') {
    Write-FixtureText (Join-Path $root 'scenario.txt') $scenario
    $s=@{Id=[Guid]::NewGuid().ToString('N');Root=(Join-Path $root ('sessions/'+[Guid]::NewGuid().ToString('N')));Sequence=0}
    [IO.Directory]::CreateDirectory($s.Root) | Out-Null;Write-FixtureText (Join-Path $s.Root 'continue.request') 'INERT consent'
    $c=@{root=$root;session=$s;archive=$source.archive;pin=$source.pin;official=$source.official}
    $file=Join-Path $s.Root 'case.json';Write-FixtureJson $file $c;return $file
}
function Run([string]$file,[string]$op) {
    $c=Read-UpdateJson $file;$ps=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    $args='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -BuildDirectory "'+$BuildDirectory+'" -CaseFile "'+$file+'" -Operation '+$op
    $out=Join-Path $c.session.Root ($op+'.stdout');$err=Join-Path $c.session.Root ($op+'.stderr')
    $p=Start-Process $ps -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru;$null=$p.Handle
    $created=$p.StartTime.ToUniversalTime().ToString('o')
    Assert ($p.WaitForExit(60000) -and $p.ExitCode -eq 0) ('child '+$op+' see '+$err)
    $r=Read-UpdateJson (Join-Path $c.session.Root ($op+'-terminal.json'))
    Assert ($r.workerPid -eq $p.Id -and [datetime]$r.workerCreated -eq [datetime]$created) ('actual child identity '+$r.workerPid+'/'+$p.Id+' '+$r.workerCreated+'/'+$created)
    return $r
}
function Preserved {
    Assert ((Get-TreeHash $locations.DataRoots[0]) -ceq $dataHash -and (Get-SetupEvidenceHash @(Get-SetupFullNamespace $locations.DataRoots[0])) -ceq $dataNamespace) 'data bytes and namespace retained'
}
try {
    $backups=@();$sources=@{}
    foreach ($version in @('0.1.3','0.1.4','0.1.5')) {
        $source=Source $version;$sources[$version]=$source
        $old=Get-SetupNormalObservation $locations;$file=New-Case $source
        $worker=Run $file Install;Assert ($worker.status -ceq 'installed') ('sequence worker '+$version+' '+($worker | ConvertTo-Json -Depth 6 -Compress))
        $c=Read-UpdateJson $file;$context=Read-UpdateJson (Join-Path $c.session.Root 'context.json');$paths=Get-TransactionPaths $context
        Assert (!(Test-Path -LiteralPath (Join-Path $paths.Root ($context.Id+'.completed')))) 'worker cannot declare completed history'
        $inspector=Run $file Inspect;Assert ($inspector.status -ceq 'installed') ('independent inspector '+($inspector | ConvertTo-Json -Depth 6 -Compress))
        Assert ((Get-SetupCurrentVersion $locations.Target) -ceq $version) 'installed version'
        $observation=Get-SetupNormalObservation $locations
        if ($old.oldHash -cne 'absent') {$backups+=@{path=$paths.Backup;hash=$old.oldHash;namespace=$old.oldNamespaceHash}}
        foreach ($b in $backups) {Assert ((Get-SetupArtifact $b.path).hash -ceq $b.hash -and (Get-SetupEvidenceHash @(Get-SetupFullNamespace $b.path)) -ceq $b.namespace) 'every prior complete backup remains'}
        Preserved
        Record ('fresh-then-consecutive-'+$version) @{case=$file;worker=$worker;inspector=$inspector;target=$observation;backups=$backups}
    }
    $next=Source '0.1.6';$before=Get-SetupNormalObservation $locations
    $journal=@(Get-ChildItem -LiteralPath $locations.Transactions -Filter '*.json' | Sort-Object Name)[0].FullName
    $completion=$journal.Replace('.json','.completed')
    foreach ($kind in @('journal','previous','completion','missing-completion','backup-bytes','backup-empty','unknown-stage','pending-completion','old-request','pointer','legacy-backup','wrong-separator')) {
        $path=switch ($kind) {
            'journal' {$journal};'previous' {$journal+'.previous'};'completion' {$completion};'missing-completion' {$completion}
            'backup-bytes' {Join-Path $backups[0].path 'workflow-plugin/main.js'};'backup-empty' {Join-Path $backups[0].path 'tampered-empty'}
            'unknown-stage' {Join-Path $locations.Transactions (('f'*32)+'.stage')};'pending-completion' {Join-Path $locations.Transactions (('f'*32)+'.completed.next')}
            'old-request' {Join-Path $locations.Inbox 'unknown/request.json'};'pointer' {$locations.Pointers[0]};'legacy-backup' {Join-Path $locations.HistoricalBackups 'unknown'}
            'wrong-separator' {$journal.Replace('.json','Xjson')}
        }
        $bytes=$null;$directory=$kind -cin @('backup-empty','unknown-stage','legacy-backup')
        if (Test-Path -LiteralPath $path) {$bytes=[IO.File]::ReadAllBytes($path)}
        try {
            if ($kind -ceq 'missing-completion') {Remove-Item -LiteralPath $path} elseif ($directory) {[IO.Directory]::CreateDirectory($path) | Out-Null} else {Write-FixtureText $path 'TAMPER'}
            $file=New-Case $next;$r=Run $file Install
            Assert ($r.status -ceq 'failed' -and $r.reason -ceq 'recovery-required') ('tamper '+$kind+' '+$r.reason)
            Assert ((Get-SetupArtifact $locations.Target).hash -ceq $before.oldHash) 'refusal before target mutation';Preserved
            Record ('reject-'+$kind) @{case=$file;result=$r}
        } finally {
            if ($null -ne $bytes) {[IO.File]::WriteAllBytes($path,$bytes)} elseif (Test-Path -LiteralPath $path) {Remove-Item -LiteralPath $path -Force}
            if ($kind -ceq 'old-request') {Remove-Item -LiteralPath (Split-Path -Parent $path) -Force}
        }
    }
    foreach ($kind in @('namespace-claim','terminal-state','live-owner','invalid-owner-time','version-chain')) {
        $saved=@{};foreach ($path in @($journal,($journal+'.previous'),$completion)) {$saved[$path]=[IO.File]::ReadAllBytes($path)}
        try {
            $r=Read-UpdateJson $journal;$p=Read-UpdateJson ($journal+'.previous');$c=Read-UpdateJson $completion
            if ($kind -ceq 'namespace-claim') {$c.newNamespaceHash='0'*64}
            if ($kind -ceq 'terminal-state') {$r.state='staging'}
            if ($kind -ceq 'live-owner') {$r.ownerPid=$PID;$r.ownerCreated=[Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().ToString('o');$p.ownerPid=$r.ownerPid;$p.ownerCreated=$r.ownerCreated}
            if ($kind -ceq 'invalid-owner-time') {$r.ownerCreated='NOT A PROCESS START';$p.ownerCreated=$r.ownerCreated}
            if ($kind -ceq 'version-chain') {$r.version='9.9.9';$p.version=$r.version}
            Write-FixtureJson $journal $r;Write-FixtureJson ($journal+'.previous') $p
            $c.journalHash=Get-UpdateHash $journal;$c.previousHash=Get-UpdateHash ($journal+'.previous');Write-FixtureJson $completion $c
            $file=New-Case $next;$result=Run $file Install
            Assert ($result.status -ceq 'failed' -and $result.reason -ceq 'recovery-required') ('self-consistent claims cannot authorize '+$kind)
            Assert ((Get-SetupArtifact $locations.Target).hash -ceq $before.oldHash) 'semantic refusal retains target';Preserved
            Record ('reject-rehashed-'+$kind) @{case=$file;result=$result}
        } finally {foreach ($path in $saved.Keys) {[IO.File]::WriteAllBytes($path,$saved[$path])}}
    }
    foreach ($lock in @((Join-Path $locations.Scan '.clackly-setup.lock'),(Join-Path $locations.Transactions 'install.lock'))) {
        $held=[IO.File]::Open($lock,'Open','ReadWrite','None')
        try {$file=New-Case $next;$r=Run $file Install;Assert ($r.reason -ceq 'concurrent-install') ('lock '+$r.reason);Record 'actual-exclusive-lock-with-completed-history' @{case=$file;result=$r}} finally {$held.Dispose()}
    }
    foreach ($scenario in @('permission','uac-denied','uac-cancelled','cancel-before','rollback')) {
        $file=New-Case $next $scenario;$c=Read-UpdateJson $file
        if ($scenario -ceq 'cancel-before') {Write-FixtureText (Join-Path $c.session.Root 'cancel.request') 'INERT cancel'}
        $worker=Run $file Install;$inspector=Run $file Inspect
        $expected=if ($scenario -cin @('uac-cancelled','cancel-before')) {'cancelled'} elseif ($scenario -ceq 'rollback') {'rolled-back'} else {'failed'}
        Assert ($worker.status -ceq $expected -and $inspector.status -ceq $expected) ('failure '+$scenario+' '+($inspector | ConvertTo-Json -Depth 6 -Compress))
        Assert ((Get-SetupArtifact $locations.Target).hash -ceq $before.oldHash -and (Get-SetupEvidenceHash @(Get-SetupFullNamespace $locations.Target)) -ceq $before.oldNamespaceHash) 'full old target restored/retained'
        foreach ($b in $backups) {Assert ((Get-SetupArtifact $b.path).hash -ceq $b.hash -and (Get-SetupEvidenceHash @(Get-SetupFullNamespace $b.path)) -ceq $b.namespace) 'all older backups retained after failure'}
        Preserved;Record ('history-plus-'+$scenario) @{case=$file;worker=$worker;inspector=$inspector;uac='injected only, no elevation'}
    }
    $exe=Join-Path $BuildDirectory 'Clackly-Setup-0.1.3-win-x64-LOCAL-CANDIDATE.exe';$hash=Get-UpdateHash $exe
    foreach ($kind in @('path','identity','unsigned','wrong-signer')) {
        $approved=if ($kind -ceq 'path') {$exe+'.changed'} else {$exe};$sha=if ($kind -ceq 'identity') {'0'*64} else {$hash}
        $signer=if ($kind -ceq 'wrong-signer') {'0'*40} else {''}
        $r=Get-SetupElevationReadiness $exe $approved $sha $signer
        $reason=switch ($kind) {'path' {'target-unverified'};'identity' {'build-identity-mismatch'};default {'publisher-unverified'}}
        Assert (!$r.canElevate -and !$r.productionMutationEnabled -and $r.reason -ceq $reason) ('trust '+$kind+' '+$r.reason);Record ('trust-preflight-'+$kind) $r
    }
    $refused=$false;try {Assert-ProtectedExecutor (Join-Path $root 'payload') -DirectoryOnly} catch {$refused=$true};Assert $refused 'user writable cache not protected';Record 'actual-user-writable-cache-refused' @{path=$root}
    $refused=$false;try {Assert-SetupExecutionScope (Get-SetupProductionLocations)} catch {$refused=$_.Exception.Message -ceq 'local-candidate-gate'};Assert $refused 'production hard gate';Record 'ordinary-production-still-hard-locked' $null
    Write-FixtureJson (Join-Path $BuildDirectory 'test-report-r27.json') @{passed=$rows.Count;root=$root;buildReportSha256=(Get-UpdateHash (Join-Path $BuildDirectory 'build-report.json'));runnerSha256=(Get-UpdateHash $PSCommandPath);source='FICTIONAL OFFLINE TEST DATA; no versions published';rows=@($rows)}
    Write-Output ('R27 passed '+$rows.Count)
} catch {Write-FixtureJson (Join-Path $BuildDirectory ('test-report-r27-failed-'+[Guid]::NewGuid().ToString('N')+'.json')) @{passed=$rows.Count;root=$root;error=($_ | Out-String);rows=@($rows)};throw}
