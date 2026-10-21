param([ValidateSet('Suite','Focused','Crash','Recover','Hold')][string]$Mode='Suite', [string]$Root, [string]$Point)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'ExecutorSupport.psm1') -Force -DisableNameChecking
function Invoke-UpdateTransaction($Context,[scriptblock]$Observe={ 'closed' },[scriptblock]$Checkpoint={},[scriptblock]$Cancelled={$false}) {
    WorkflowTransaction\Invoke-UpdateTransaction $Context -Observe $Observe -Checkpoint $Checkpoint -Cancelled $Cancelled -Provision {
        param($root,$workflow)
        $file=Join-Path $root 'workflow-plugin/WorkflowIntegration.node'
        [IO.File]::WriteAllText($file,'INERT TEST NATIVE - NEVER LOAD')
        return @{path='workflow-plugin/WorkflowIntegration.node';size=(Get-Item -LiteralPath $file).Length;sha256=(Get-UpdateHash $file)}
    }
}
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$publishedEvidence = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../build/test-evidence/installer'))
# Generated transaction fixtures must not be live-indexed while atomic rename
# tests run. Keep marked fictitious trees in a task-specific Temp root and copy
# the result record to the persistent task evidence only after completion.
$evidence = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) 'Clackly-TRA25-R3-Installer-Fixtures'))
if (!$Root) { $Root = Join-Path $evidence ([Guid]::NewGuid().ToString('N')) }
$Root = [IO.Path]::GetFullPath($Root)
if (!$Root.StartsWith($evidence + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Test root outside marked task evidence' }
Assert-NormalPath $Root -AllowMissing | Out-Null
function Assert-True($Value,[string]$Message) { if (!$Value) { throw $Message } }
function Write-Json($File,$Value) { [IO.File]::WriteAllText($File,($Value | ConvertTo-Json -Depth 12)) }
function Write-Text($File,[string]$Value) { [IO.Directory]::CreateDirectory((Split-Path -Parent $File)) | Out-Null; [IO.File]::WriteAllText($File,$Value) }
function New-Fixture([string]$Name) {
    $base = Join-Path $Root $Name
    $scan = Join-Path $base 'scan'
    $transactions = $scan + '.Clackly Updates'
    $target = Join-Path $scan 'com.wutpeach.clackly'
    $source = Join-Path $base 'source'
    foreach ($dir in @($scan,$transactions,$target,$source)) { [IO.Directory]::CreateDirectory($dir) | Out-Null }
    Write-Text (Join-Path $target 'old.txt') 'OLD COMPLETE TREE'
    Write-Text (Join-Path $target 'workflow-plugin/WorkflowIntegration.node') 'LEGACY NATIVE-INCLUSIVE OLD INSTALL'
    Write-Text (Join-Path $target 'package.json') '{"name":"clackly","version":"0.1.0"}'
    Write-Text (Join-Path $target 'manifest.xml') '<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>0.1.0</Version><FilePath>workflow-plugin/main.js</FilePath></Plugin></BlackmagicDesign>'
    Write-Text (Join-Path $scan 'sibling/sentinel.txt') 'SIBLING'
    Write-Text (Join-Path $base 'AppData/Clackly/preferences.json') '{"keep":true}'
    Write-Text (Join-Path $source 'package.json') '{"name":"clackly","version":"0.2.0"}'
    Write-Text (Join-Path $source 'manifest.xml') '<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>0.2.0</Version><FilePath>workflow-plugin/main.js</FilePath></Plugin></BlackmagicDesign>'
    Write-Text (Join-Path $source 'workflow-plugin/main.js') 'const PLUGIN_ID = "com.wutpeach.clackly"; // INERT TEST PACKAGE - NEVER EXECUTE'
    Write-Text (Join-Path $source 'dist/renderer/index.html') '<p>Fixture</p>'
    foreach ($file in @('python.exe','python314.dll','python314.zip','python314._pth','LICENSE.txt','THIRD_PARTY_NOTICES.md','python-embed.sigstore','python-embed.spdx.json','application.spdx.json','clackly/bootstrap.py','clackly/persistent_bootstrap.py','clackly/python_runner.py')) {
        Write-Text (Join-Path $source ('resources/runtimes/fixture/'+$file)) 'INERT TEST RUNTIME - NEVER EXECUTE'
    }
    Write-Json (Join-Path $source 'resources/runtimes/fixture/python.lock.json') @{profileId='fixture';version='3.14.4';asset=@{sha256=('c'*64)}}
    $lockHash=Get-UpdateHash (Join-Path $source 'resources/runtimes/fixture/python.lock.json')
    Write-Json (Join-Path $source 'resources/runtimes/fixture/runtime.json') @{runtimeVersion='3.14.4';source=@{sha256=('c'*64)};build=@{lockSha256=$lockHash;applicationSources=@(@{path='clackly/bootstrap.py';sha256=(Get-UpdateHash (Join-Path $source 'resources/runtimes/fixture/clackly/bootstrap.py'))})}}
    Write-Json (Join-Path $source 'resources/runtimes/manifest.json') @{schemaVersion=1;profiles=@(@{id='fixture';runtimeVersion='3.14.4';platform='win32';architecture='x64';executable='fixture/python.exe'})}
    foreach ($file in @('electron/main/update/UpdateService.js','scripts/workflow-update/WorkflowTransaction.psm1','scripts/workflow-update/executor.ps1','scripts/workflow-update/launch.ps1','scripts/workflow-update/recover.ps1')) {Write-Text (Join-Path $source $file) '// INERT FIXTURE - NEVER EXECUTE'}
    $manifest = @{schemaVersion=2;package=@{id='com.wutpeach.clackly';name='clackly';version='0.2.0';platform='win32';arch='x64';entrypoint='workflow-plugin/main.js'};
        source=@{repository='Wutpeach/Clackly';tag='v0.2.0';commit=('a'*40);dirty=$true;workflowPath='.github/workflows/workflow-release.yml'};build=@{publishable=$false};
        runtime=@{manifestPath='resources/runtimes/manifest.json';manifestSha256=(Get-UpdateHash (Join-Path $source 'resources/runtimes/manifest.json'));
            profiles=@(@{id='fixture';version='3.14.4';lockPath='resources/runtimes/fixture/python.lock.json';lockSha256=$lockHash})};
        native=@{path='workflow-plugin/WorkflowIntegration.node';provisioning='local-resolve';source='programdata-sampleplugin';platform='win32';arch='x64'};
        files=@(Get-TreeFiles $source)}
    Write-Json (Join-Path $source 'clackly-release.json') $manifest
    $context = @{Id=[Guid]::NewGuid().ToString('N');ScanRoot=$scan;TransactionRoot=$transactions;Target=$target;PackageRoot=$source;Version='0.2.0';
        Digest=('b'*64);Size=12345;
        ResolveExecutable=(Join-Path $base 'Resolve.exe');WorkflowExecutable=(Join-Path $base 'Electron/electron.exe')}
    Write-Json (Join-Path $base 'context.json') $context
    $nativePath=Join-Path $source 'workflow-plugin/WorkflowIntegration.node'
    [IO.File]::WriteAllText($nativePath,'INERT TEST NATIVE - NEVER LOAD')
    $newHash=Get-TreeHash $source
    [IO.File]::Delete($nativePath)
    return @{Base=$base;Context=$context;Old=(Get-TreeHash $target);New=$newHash}
}
function Read-FixtureContext([string]$Base) {
    Assert-True ([IO.File]::ReadAllText((Join-Path $Root '.clackly-test-owner')) -ceq 'TRA-25 R2 OWNED SYNTHETIC TARGETS') 'missing test marker'
    return Read-UpdateJson (Join-Path $Base 'context.json') 65536
}
function Assert-Sentinels($Fixture) {
    Assert-True ([IO.File]::ReadAllText((Join-Path $Fixture.Base 'AppData/Clackly/preferences.json')) -ceq '{"keep":true}') 'AppData changed'
    Assert-True ([IO.File]::ReadAllText((Join-Path $Fixture.Context.ScanRoot 'sibling/sentinel.txt')) -ceq 'SIBLING') 'sibling changed'
}
function Run-Child([string]$ChildMode,[string]$Base,[string]$CrashPoint='') {
    $arguments = '-NoProfile -NonInteractive -File "' + $PSCommandPath + '" -Mode ' + $ChildMode + ' -Root "' + $Root + '" -Point "' + $Base + '|' + $CrashPoint + '"'
    $child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru
    # Cache handle before exit so ExitCode remains available in PS5.1.
    $handle = $child.Handle
    Assert-True ($child.WaitForExit(30000)) 'fixture child timed out'
    return $child.ExitCode
}
if ($Mode -in @('Crash','Recover','Hold')) {
    $parts = $Point.Split('|'); $base = $parts[0]
    Assert-True ($base.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) 'child base escaped marker root'
    $context = Read-FixtureContext $base
    if ($Mode -eq 'Crash') {
        $crashPoint=$parts[1]
        $result = Invoke-UpdateTransaction $context -Observe { 'closed' } -Checkpoint { param($p) if ($p -ceq $crashPoint) { [Environment]::Exit(91) } }
        Write-Json (Join-Path $base 'unexpected.json') $result; exit 2
    }
    if ($Mode -eq 'Recover') {
        try { $result=Invoke-UpdateRecovery $context -Observe { 'closed' }; Write-Json (Join-Path $base 'recovered.json') $result; exit 0 }
        catch { Write-Text (Join-Path $base 'refused.txt') $_.Exception.Message; exit 1 }
    }
    if ($Mode -eq 'Hold') {
        $lockPath=Join-Path $context.TransactionRoot 'install.lock'
        $lock=[IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None')
        try {
            Write-Text (Join-Path $base 'lock-ready') 'ready'
            $deadline=[DateTime]::UtcNow.AddSeconds(15)
            while (!(Test-Path -LiteralPath (Join-Path $base 'release-lock'))) {
                if ([DateTime]::UtcNow -gt $deadline) { exit 3 }; Start-Sleep -Milliseconds 50
            }
        } finally { $lock.Dispose() }
        exit 0
    }
}
[IO.Directory]::CreateDirectory($Root) | Out-Null
Write-Text (Join-Path $Root '.clackly-test-owner') 'TRA-25 R2 OWNED SYNTHETIC TARGETS'
$results = [Collections.Generic.List[object]]::new()
function Record([string]$Name) { $results.Add(@{case=$Name;pass=$true}); Write-Output ('PASS ' + $Name) }

if ($Mode -eq 'Suite') {
$f=New-Fixture 'success'
$result=Invoke-UpdateTransaction $f.Context -Observe {'closed'}
Assert-True ($result.status -ceq 'installed') 'success status'
Assert-True ((Get-TreeHash $f.Context.Target) -ceq $f.New) 'success full tree'
$paths=Get-TransactionPaths $f.Context
Assert-True ((Get-TreeHash $paths.Backup) -ceq $f.Old) 'old backup not retained'
Assert-Sentinels $f; Record 'success-retains-complete-backup'

foreach ($point in @('before-stage','after-stage','after-backup','after-activation','after-verification')) {
    $f=New-Fixture ('exception-' + $point)
    $result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Checkpoint {param($p) if ($p -ceq $point) { throw 'fixture-failure' }}
    Assert-True ($result.status -cin @('failed','rolled-back')) ('exception status '+$point)
    Assert-True ((Get-TreeHash $f.Context.Target) -ceq $f.Old) ('exception old tree '+$point)
    Assert-Sentinels $f; Record ('exception-' + $point)
}
foreach ($point in @('before-stage','after-stage','after-backup','after-activation','after-verification')) {
    $f=New-Fixture ('crash-' + $point)
    Assert-True ((Run-Child 'Crash' $f.Base $point) -eq 91) ('not abrupt '+$point)
    Assert-True ((Run-Child 'Recover' $f.Base) -eq 0) ('independent recovery '+$point)
    $expected=if ($point -cin @('after-activation','after-verification')) {$f.New} else {$f.Old}
    Assert-True ((Get-TreeHash $f.Context.Target) -ceq $expected) ('recovery full tree '+$point)
    Assert-Sentinels $f; Record ('abrupt-independent-recovery-' + $point)
}
foreach ($state in @('host-running','process-unknown','anything-else')) {
    $f=New-Fixture ('guard-' + $state)
    try { Invoke-UpdateTransaction $f.Context -Observe {$state} | Out-Null; throw 'guard unexpectedly accepted' }
    catch { Assert-True ($_.Exception.Message -cin @('host-running','process-unknown')) 'guard error not bounded' }
    Assert-True ((Get-TreeHash $f.Context.Target) -ceq $f.Old) 'guard mutated target'; Record ('guard-'+$state)
}
$f=New-Fixture 'race'
$script:observations=0
$result=Invoke-UpdateTransaction $f.Context -Observe { $script:observations++; if ($script:observations -eq 1) {'closed'} else {'host-running'} }
Assert-True ($result.reason -ceq 'host-running' -and (Get-TreeHash $f.Context.Target) -ceq $f.Old) 'reopen race switched target'
Record 'reopen-before-backup-refused'

$f=New-Fixture 'rollback-unknown'
$script:observations=0
$result=Invoke-UpdateTransaction $f.Context -Observe { $script:observations++; if ($script:observations -le 2) {'closed'} else {'process-unknown'} }
$paths=Get-TransactionPaths $f.Context
Assert-True ($result.reason -ceq 'recovery-required' -and !(Test-Path -LiteralPath $paths.Target) -and (Get-TreeHash $paths.Backup) -ceq $f.Old) 'rollback ignored unknown'
Assert-True ((Run-Child 'Recover' $f.Base) -eq 0) 'later independent rollback failed'
Assert-True ((Get-TreeHash $paths.Target) -ceq $f.Old) 'later rollback tree mismatch'
Record 'unknown-blocks-activation-and-rollback'

foreach ($point in @('initial','after-stage')) {
    $f=New-Fixture ('cancel-'+$point); $script:cancel=$point -ceq 'initial'
    $result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Cancelled {$script:cancel} -Checkpoint {param($p) if ($p -ceq 'after-stage') {$script:cancel=$true}}
    Assert-True ($result.status -ceq 'cancelled' -and (Get-TreeHash $f.Context.Target) -ceq $f.Old) 'cancel changed target'
    Record ('cancel-'+$point)
}
$f=New-Fixture 'permission-denied'
$result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Checkpoint {param($p) if ($p -ceq 'after-stage') {throw [UnauthorizedAccessException]::new('permission-denied')}}
Assert-True ($result.reason -ceq 'permission-denied' -and (Get-TreeHash $f.Context.Target) -ceq $f.Old) 'permission denial changed target'
Record 'injected-ordinary-permission-denial'

$f=New-Fixture 'journal-path-tamper'
Assert-True ((Run-Child 'Crash' $f.Base 'after-backup') -eq 91) 'tamper crash setup'
$paths=Get-TransactionPaths $f.Context; $journal=Read-UpdateJson $paths.Journal
$journal.backup=Join-Path $f.Base 'unrelated'; Write-Json $paths.Journal $journal
Assert-True ((Run-Child 'Recover' $f.Base) -eq 1) 'tampered journal recovered'
Assert-True (!(Test-Path -LiteralPath $paths.Target) -and (Get-TreeHash $paths.Backup) -ceq $f.Old) 'tampered journal mutated scene'
Record 'journal-path-tamper-refused'

$f=New-Fixture 'active-bytes-tamper'
Assert-True ((Run-Child 'Crash' $f.Base 'after-activation') -eq 91) 'active tamper crash setup'
Write-Text (Join-Path $f.Context.Target 'changed.txt') 'UNKNOWN BYTES'
$unknown=Get-TreeHash $f.Context.Target
Assert-True ((Run-Child 'Recover' $f.Base) -eq 1) 'unknown bytes recovered'
Assert-True ((Get-TreeHash $f.Context.Target) -ceq $unknown) 'unknown scene modified'
Record 'unknown-active-bytes-preserved'

$f=New-Fixture 'changed-context'
$context=$f.Context
$result=Invoke-UpdateTransaction $context -Observe {'closed'} -Checkpoint {param($p) if ($p -ceq 'after-stage') {$context.Target=Join-Path $context.ScanRoot 'sibling'}}
Assert-True ($result.status -ceq 'failed' -and (Get-TreeHash (Join-Path $context.ScanRoot 'com.wutpeach.clackly')) -ceq $f.Old) 'context path change switched target'
Record 'changed-target-refused'

$f=New-Fixture 'concurrent-lock'
$arguments='-NoProfile -NonInteractive -File "'+$PSCommandPath+'" -Mode Hold -Root "'+$Root+'" -Point "'+$f.Base+'|"'
$holder=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru
$handle=$holder.Handle; $deadline=[DateTime]::UtcNow.AddSeconds(10)
while (!(Test-Path -LiteralPath (Join-Path $f.Base 'lock-ready'))) { if ([DateTime]::UtcNow -gt $deadline) {throw 'lock holder timeout'}; Start-Sleep -Milliseconds 50 }
try {
    try { Invoke-UpdateTransaction $f.Context -Observe {'closed'} | Out-Null; throw 'parallel transaction accepted' }
    catch { Assert-True ($_.Exception.Message -ceq 'concurrent-install') 'not exclusive lock' }
} finally { Write-Text (Join-Path $f.Base 'release-lock') 'release'; Assert-True ($holder.WaitForExit(20000)) 'holder not released' }
Assert-True ((Get-TreeHash $f.Context.Target) -ceq $f.Old) 'parallel install changed tree'
Record 'actual-cross-process-exclusive-lock'

$f=New-Fixture 'reparse'
$junction=Join-Path $f.Context.TransactionRoot 'junction'
New-Item -ItemType Junction -Path $junction -Target $f.Context.Target | Out-Null
try { Get-TreeHash $f.Context.TransactionRoot | Out-Null; throw 'junction accepted' }
catch { Assert-True ($_.Exception.Message -ceq 'target-unverified') 'junction not refused' }
Record 'actual-directory-junction-refused'

$f=New-Fixture 'archive'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath=Join-Path $f.Base 'package.zip'; $zip=[IO.Compression.ZipFile]::Open($zipPath,'Create')
try {
    foreach ($entry in @(Get-TreeFiles $f.Context.PackageRoot)) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $f.Context.PackageRoot $entry.path),('plugin/'+$entry.path)) | Out-Null
    }
} finally {$zip.Dispose()}
$destination=Join-Path $f.Base 'expanded'
Expand-UpdateArchive $zipPath $destination (Get-UpdateHash $zipPath) (Get-Item -LiteralPath $zipPath).Length
Assert-UpdatePackage $destination '0.2.0' | Out-Null
Assert-True ((Get-TreeHash $destination) -ceq (Get-TreeHash $f.Context.PackageRoot)) 'archive roundtrip incomplete'
Record 'actual-zip-whole-inventory-roundtrip'

foreach ($badName in @('plugin/../escape','plugin/CON','plugin/file.','plugin/a\b','other/file')) {
    $bad=Join-Path $f.Base ([Guid]::NewGuid().ToString('N')+'.zip'); $zip=[IO.Compression.ZipFile]::Open($bad,'Create')
    try { $zip.CreateEntry($badName) | Out-Null } finally {$zip.Dispose()}
    $dest=Join-Path $f.Base ([Guid]::NewGuid().ToString('N'))
    try { Expand-UpdateArchive $bad $dest (Get-UpdateHash $bad) (Get-Item -LiteralPath $bad).Length; throw 'unsafe zip accepted' }
    catch {Assert-True ($_.Exception.Message -ceq 'invalid-package') ('wrong unsafe zip error '+$badName)}
    Assert-True (!(Test-Path -LiteralPath $dest)) 'unsafe archive created destination'
}
Record 'unsafe-zip-paths-refused-before-extraction'

# Restart inspection runs against durable engine artifacts and real full trees.
# It never invokes recovery or trusts a standalone result.json claim.
foreach ($outcome in @('installed','rolled-back','failed','cancelled')) {
    $f=New-Fixture ('inspect-'+$outcome)
    switch ($outcome) {
        'installed' { $result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} }
        'rolled-back' { $result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Checkpoint {param($p) if ($p -ceq 'after-activation') {throw 'injected-failure'}} }
        'failed' { $result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Checkpoint {param($p) if ($p -ceq 'after-stage') {throw [UnauthorizedAccessException]::new('permission-denied')}} }
        'cancelled' {
            $script:cancel=$false
            $result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Cancelled {$script:cancel} -Checkpoint {param($p) if ($p -ceq 'after-stage') {$script:cancel=$true}}
        }
    }
    $before=Get-TreeHash $f.Base
    $restored=Get-UpdateTransactionState $f.Context
    Assert-True ($restored.status -ceq $outcome -and $restored.reason -ceq $result.reason) ('restart outcome '+$outcome)
    Assert-True ((Get-TreeHash $f.Base) -ceq $before) ('inspection changed files '+$outcome)
    Assert-Sentinels $f; Record ('restart-inspects-'+$outcome+'-without-mutation')
}
foreach ($tamper in @('active','backup','digest','size','version')) {
    $f=New-Fixture ('inspect-tamper-'+$tamper)
    Invoke-UpdateTransaction $f.Context -Observe {'closed'} | Out-Null
    $paths=Get-TransactionPaths $f.Context
    switch ($tamper) {
        'active' { Write-Text (Join-Path $paths.Target 'tampered.txt') 'UNKNOWN ACTIVE' }
        'backup' { Write-Text (Join-Path $paths.Backup 'tampered.txt') 'UNKNOWN BACKUP' }
        'digest' { $f.Context.Digest='c'*64 }
        'size' { $f.Context.Size++ }
        'version' { $f.Context.Version='0.3.0' }
    }
    Write-Json (Join-Path $f.Base 'result.json') @{status='installed';reason=$null}
    $before=Get-TreeHash $f.Base
    try { Get-UpdateTransactionState $f.Context | Out-Null; throw 'inspection accepted changed evidence' }
    catch { Assert-True ($_.Exception.Message -ceq 'recovery-required') ('unexpected inspection failure '+$tamper) }
    Assert-True ((Get-TreeHash $f.Base) -ceq $before) 'refused inspection changed evidence'
    Record ('restart-refuses-'+$tamper+'-tamper')
}
$f=New-Fixture 'inspect-pending'
Assert-True ((Run-Child 'Crash' $f.Base 'after-activation') -eq 91) 'pending setup did not interrupt'
$paths=Get-TransactionPaths $f.Context
Write-Json (Join-Path $f.Base 'result.json') @{status='installed';reason=$null}
try { Get-UpdateTransactionState $f.Context | Out-Null; throw 'pending transaction reported installed' }
catch { Assert-True ($_.Exception.Message -ceq 'recovery-required') 'pending inspection not bounded' }
Assert-True ((Get-TreeHash $paths.Target) -ceq $f.New -and (Get-TreeHash $paths.Backup) -ceq $f.Old) 'pending inspection changed scene'
Record 'restart-refuses-incomplete-journal-despite-active-new-tree'
foreach ($oldVersion in @('0.2.0','0.3.0')) {
    $f=New-Fixture ('stale-candidate-'+$oldVersion)
    Write-Json (Join-Path $f.Context.Target 'package.json') @{name='clackly';version=$oldVersion}
    Write-Text (Join-Path $f.Context.Target 'manifest.xml') ('<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>'+ $oldVersion +'</Version><FilePath>workflow-plugin/main.js</FilePath></Plugin></BlackmagicDesign>')
    $before=Get-TreeHash $f.Context.Target
    try { Invoke-UpdateTransaction $f.Context -Observe {'closed'} | Out-Null; throw 'stale candidate accepted' }
    catch { Assert-True ($_.Exception.Message -ceq 'invalid-package') 'stale candidate not bounded' }
    Assert-True ((Get-TreeHash $f.Context.Target) -ceq $before) 'stale candidate changed target'
    Record ('refuses-installed-version-'+$oldVersion)
}
$f=New-Fixture 'foreign-installed-identity'
Write-Json (Join-Path $f.Context.Target 'package.json') @{name='foreign-plugin';version='0.1.0'}
$before=Get-TreeHash $f.Context.Target
try { Invoke-UpdateTransaction $f.Context -Observe {'closed'} | Out-Null; throw 'foreign identity accepted' }
catch { Assert-True ($_.Exception.Message -ceq 'invalid-package') 'foreign identity not bounded' }
Assert-True ((Get-TreeHash $f.Context.Target) -ceq $before) 'foreign identity target changed'
Record 'refuses-foreign-installed-identity'
}

# R3 focused observable regressions. All targets and host states are fictitious;
# this suite never invokes the production launcher, UAC or installed directories.
foreach ($point in @('success','after-stage','after-activation')) {
    $f=New-Fixture ('initial-'+$point)
    [IO.Directory]::Move($f.Context.Target,(Join-Path $f.Base 'preexisting-fixture-retained'))
    $f.Context.InitialInstall=$true
    $result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Checkpoint {param($p) if ($p -ceq $point) {throw 'initial-test-failure'}}
    $paths=Get-TransactionPaths $f.Context
    if ($point -ceq 'success') {
        Assert-True ($result.status -ceq 'installed' -and (Get-TreeHash $paths.Target) -ceq $f.New -and !(Test-Path -LiteralPath $paths.Backup)) 'initial success tree'
        Assert-True ((Get-UpdateTransactionState $f.Context).status -ceq 'installed') 'initial restart inspection'
    } else {
        Assert-True ($result.status -ceq 'failed' -and !(Test-Path -LiteralPath $paths.Target)) 'initial failure must restore absence'
        Assert-True ((Get-UpdateTransactionState $f.Context).status -ceq 'failed') 'initial failure inspection'
    }
    Assert-Sentinels $f; Record ('native-free-initial-'+$point)
}
foreach ($reason in @('native-missing','native-invalid','native-incompatible')) {
    $f=New-Fixture ('provider-'+$reason)
    $result=WorkflowTransaction\Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Provision {throw $reason}
    $paths=Get-TransactionPaths $f.Context
    Assert-True ($result.reason -ceq $reason -and (Get-TreeHash $paths.Target) -ceq $f.Old -and !(Test-Path -LiteralPath $paths.Backup)) 'native rejection moved prior tree'
    Assert-Sentinels $f; Record ($reason+'-before-backup')
}
# Production package gates run over inert data only; no fixture JS executes.
foreach ($kind in @('native-other-path','runtime-provenance','runtime-source','main-identity')) {
    $f=New-Fixture ('strict-'+$kind); $source=$f.Context.PackageRoot
    switch ($kind) {
        'native-other-path' {Write-Text (Join-Path $source 'other/workflowintegration.NODE') 'FORBIDDEN'}
        'runtime-provenance' {$file=Join-Path $source 'resources/runtimes/fixture/runtime.json';$metadata=Read-UpdateJson $file;$metadata.source.sha256='d'*64;Write-Json $file $metadata}
        'runtime-source' {Write-Text (Join-Path $source 'resources/runtimes/fixture/clackly/bootstrap.py') 'SOURCE TAMPER'}
        'main-identity' {Write-Text (Join-Path $source 'workflow-plugin/main.js') 'const PLUGIN_ID = "foreign";'}
    }
    $manifest=Read-UpdateJson (Join-Path $source 'clackly-release.json')
    $manifest.files=@(Get-TreeFiles $source | Where-Object {$_.path -cne 'clackly-release.json'})
    Write-Json (Join-Path $source 'clackly-release.json') $manifest
    $accepted=$false
    try {Assert-UpdatePackage $source '0.2.0' | Out-Null;$accepted=$true} catch {}
    Assert-True (!$accepted) ('strict gate accepted '+$kind); Record ('strict-package-'+$kind)
}
$f=New-Fixture 'first-archive'
$source=$f.Context.PackageRoot; $zipPath=Join-Path $f.Base 'first.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::Open($zipPath,'Create')
try {foreach($entry in @(Get-TreeFiles $source)) {[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $source $entry.path),('plugin/'+$entry.path)) | Out-Null}} finally {$zip.Dispose()}
$digest=Get-UpdateHash $zipPath; $size=(Get-Item -LiteralPath $zipPath).Length
$official=@{id=123;draft=$false;prerelease=$false;tag_name='v0.2.0';assets=@(@{name='Clackly-Workflow-0.2.0-win-x64.zip';id=456;state='uploaded';size=$size;digest=('sha256:'+$digest);content_type='application/zip';browser_download_url='https://github.com/Wutpeach/Clackly/releases/download/v0.2.0/Clackly-Workflow-0.2.0-win-x64.zip'})}
$request=Get-OfficialArchiveRequest $zipPath -Fetch {$official}
Assert-True ($request.digest -ceq $digest -and $request.releaseId -eq 123) 'first archive identity'
$official.assets[0].digest='sha256:'+('0'*64)
$accepted=$false;try {Get-OfficialArchiveRequest $zipPath -Fetch {$official} | Out-Null;$accepted=$true} catch {Assert-True ($_.Exception.Message -ceq 'publisher-unverified') 'first archive wrong digest reason'}
Assert-True (!$accepted) 'first archive accepted nonofficial bytes';Record 'first-archive-official-metadata-byte-binding'
$malformed=Join-Path $f.Base 'misreported-manifest-length.zip';$zipBytes=[IO.File]::ReadAllBytes($zipPath);$changed=$false
for($offset=0;$offset -lt $zipBytes.Length-46;$offset++) {
    if ([BitConverter]::ToUInt32($zipBytes,$offset) -ne 33639248) {continue}
    $length=[BitConverter]::ToUInt16($zipBytes,$offset+28)
    if ($offset+46+$length -gt $zipBytes.Length) {continue}
    if ([Text.Encoding]::UTF8.GetString($zipBytes,$offset+46,$length) -ceq 'plugin/clackly-release.json') {
        [Array]::Copy([BitConverter]::GetBytes([uint32]1),0,$zipBytes,$offset+24,4);$changed=$true;break
    }
}
Assert-True $changed 'malformed fixture did not locate manifest directory record'
[IO.File]::WriteAllBytes($malformed,$zipBytes)
$accepted=$false
try {Get-OfficialArchiveRequest $malformed -Fetch {throw 'network must not run for malformed data'} | Out-Null;$accepted=$true}
catch {Assert-True ($_.Exception.Message -ceq 'invalid-package') 'misreported manifest actual-read bound'}
Assert-True (!$accepted) 'oversized actual manifest accepted';Record 'first-archive-misreported-manifest-stream-length'
foreach($kind in @('directory-without-slash','file-with-slash','native-anywhere')) {
    $bad=Join-Path $f.Base ($kind+'.zip');$zip=[IO.Compression.ZipFile]::Open($bad,'Create')
    try {
        if ($kind -ceq 'directory-without-slash') {$e=$zip.CreateEntry('plugin/bad');$e.ExternalAttributes=1073741824}
        elseif ($kind -ceq 'file-with-slash') {$e=$zip.CreateEntry('plugin/bad/');$e.ExternalAttributes=-2147483648}
        else {$zip.CreateEntry('plugin/other/workflowintegration.NODE') | Out-Null}
    } finally {$zip.Dispose()}
    $destination=Join-Path $f.Base ('expanded-'+$kind);$accepted=$false
    try {Expand-UpdateArchive $bad $destination (Get-UpdateHash $bad) (Get-Item -LiteralPath $bad).Length;$accepted=$true} catch {}
    Assert-True (!$accepted -and !(Test-Path -LiteralPath $destination)) ('unsafe type/native extracted '+$kind);Record ('strict-archive-'+$kind)
}
$f=New-Fixture 'initial-recovery-rollback-intent'
[IO.Directory]::Move($f.Context.Target,(Join-Path $f.Base 'old-fixture-retained'))
$f.Context.InitialInstall=$true
Invoke-UpdateTransaction $f.Context -Observe {'closed'} | Out-Null
$paths=Get-TransactionPaths $f.Context;$record=Read-UpdateJson $paths.Journal
$record.state='rollback-intent';Write-Json $paths.Journal $record
$result=Invoke-UpdateRecovery $f.Context -Observe {'closed'}
Assert-True ($result.status -ceq 'rolled-back' -and !(Test-Path -LiteralPath $paths.Target) -and (Get-TreeHash $paths.Failed) -ceq $f.New) 'initial rollback durable recovery'
Record 'initial-durable-rollback-intent-preserves-absence'
$f=New-Fixture 'wait-cancel-ack'
$marker=Join-Path $f.Base 'cancel.request'
$closed=Wait-UpdateHostExit $f.Context -Cancelled {Test-Path -LiteralPath $marker} -Observe {param($c) Write-Text $marker 'intent'; 'host-running'}
Assert-True (!$closed -and (Get-TreeHash $f.Context.Target) -ceq $f.Old) 'wait cancel did not stop before transaction'
Assert-True (!(Test-Path -LiteralPath (Get-TransactionPaths $f.Context).Journal)) 'wait cancellation created journal'
Record 'waiting-cancellation-stops-before-any-switch'
foreach ($point in @('backup-intent','after-backup')) {
    $f=New-Fixture ('late-cancel-' + $point); $script:lateCancel=$false
    $result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Cancelled {$script:lateCancel} -Checkpoint {param($p) if ($p -ceq $point) {$script:lateCancel=$true}}
    $paths=Get-TransactionPaths $f.Context
    Assert-True ($result.status -ceq 'installed' -and (Get-TreeHash $f.Context.Target) -ceq $f.New -and
        (Get-TreeHash $paths.Backup) -ceq $f.Old) 'late cancellation caused rollback'
    Record ('cancellation-after-' + $point + '-cannot-rollback')
}
$f=New-Fixture 'manual-restore-previous'
$result=Invoke-UpdateTransaction $f.Context -Observe {'closed'}
$result=Restore-PreviousUpdate $f.Context -Observe {'closed'}
$paths=Get-TransactionPaths $f.Context
Assert-True ($result.status -ceq 'rolled-back' -and (Get-TreeHash $f.Context.Target) -ceq $f.Old -and
    (Get-TreeHash $paths.Failed) -ceq $f.New) 'manual previous-version restore lost full tree'
Assert-Sentinels $f
Record 'explicit-manual-restore-retains-complete-new-and-old-trees'
$f=New-Fixture 'ordinary-failure-rollback'
$result=Invoke-UpdateTransaction $f.Context -Observe {'closed'} -Checkpoint {param($p) if ($p -ceq 'after-backup') {throw 'ordinary fixture failure'}}
Assert-True ($result.status -ceq 'rolled-back' -and (Get-TreeHash $f.Context.Target) -ceq $f.Old) 'ordinary failure did not restore exact old tree'
Record 'ordinary-failure-restores-entire-old-tree'
$f=New-Fixture 'current-token-access'
Assert-UpdateWriteAccess $f.Context.Target $f.Context.ScanRoot
Assert-True ((Get-TreeHash $f.Context.Target) -ceq $f.Old) 'permission probe mutated target'
Record 'actual-current-token-delete-and-create-rights-without-mutation'

$request=@{version='0.2.0';releaseId=12;assetId=25;size=12345;digest=('b'*64)}
$script:official=@{id=12;draft=$false;prerelease=$false;tag_name='v0.2.0';assets=@(@{id=25;name='Clackly-Workflow-0.2.0-win-x64.zip';
    size=12345;digest=('sha256:' + ('b'*64));state='uploaded';content_type='application/zip';
    browser_download_url='https://github.com/Wutpeach/Clackly/releases/download/v0.2.0/Clackly-Workflow-0.2.0-win-x64.zip'})}
$fetch={param($url) Assert-True ($url -ceq 'https://api.github.com/repos/Wutpeach/Clackly/releases/12') 'metadata escaped fixed official source'; $script:official}
Assert-OfficialRelease $request -Fetch $fetch
$script:official.assets[0].digest='sha256:' + ('c'*64)
try {Assert-OfficialRelease $request -Fetch $fetch; throw 'changed post-consent metadata accepted'}
catch {Assert-True ($_.Exception.Message -ceq 'publisher-unverified') 'post-consent metadata not independently refused'}
Record 'fresh-official-metadata-revalidation-refuses-changed-digest'

$f=New-Fixture 'uac-byte-swap'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath=Join-Path $f.Base 'candidate.zip'; $zip=[IO.Compression.ZipFile]::Open($zipPath,'Create')
try { foreach ($entry in @(Get-TreeFiles $f.Context.PackageRoot)) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $f.Context.PackageRoot $entry.path),('plugin/' + $entry.path)) | Out-Null } } finally {$zip.Dispose()}
$size=(Get-Item -LiteralPath $zipPath).Length; $digest=Get-UpdateHash $zipPath
$stream=[IO.File]::Open($zipPath,'Append','Write'); try {$stream.WriteByte(0)} finally {$stream.Dispose()}
try {Expand-UpdateArchive $zipPath (Join-Path $f.Base 'protected-copy') $digest $size; throw 'swapped archive accepted'}
catch {Assert-True ($_.Exception.Message -ceq 'invalid-package') 'post-consent bytes not independently refused'}
Assert-True ((Get-TreeHash $f.Context.Target) -ceq $f.Old) 'swapped archive changed old installation'
Record 'post-consent-archive-byte-swap-refused'

$denied=[UnauthorizedAccessException]::new('localized access denial')
$wrapped=[Management.Automation.ErrorRecord]::new([Reflection.TargetInvocationException]::new($denied),'fixture',[Management.Automation.ErrorCategory]::PermissionDenied,$null)
Assert-True ((Get-UpdateFailureReason $wrapped) -ceq 'permission-denied') 'wrapped genuine access denial lost'
Record 'genuine-wrapped-access-denial-remains-bounded'
$cancelFailure=[Management.Automation.ErrorRecord]::new([ComponentModel.Win32Exception]::new(1223),'fixture',[Management.Automation.ErrorCategory]::OperationStopped,$null)
$outcome=Get-UpdatePermissionOutcome $cancelFailure ('a'*64)
Assert-True ($outcome.status -ceq 'cancelled' -and $outcome.reason -ceq 'permission-cancelled' -and $outcome.oldHash -ceq ('a'*64)) 'UAC cancellation cannot prepare a retry'
$outcome=Get-UpdatePermissionOutcome $wrapped ('a'*64)
Assert-True ($outcome.status -ceq 'failed' -and $outcome.reason -ceq 'permission-denied') 'access denied was presented as consent cancellation'
Record 'native-consent-cancel-is-cancelled-and-denial-remains-failed'
$published=@{schemaVersion=2;build=@{publishable=$true};source=@{dirty=$false};native=@{qualification='release-qualified'}}
Assert-PublishedUpdatePackage $published
$published.build.publishable=$false
try {Assert-PublishedUpdatePackage $published; throw 'local-development payload accepted by production'}
catch {Assert-True ($_.Exception.Message -ceq 'invalid-package') 'local-development payload not bounded'}
Record 'production-refuses-local-development-metadata-engine-fixtures-remain-usable'
$keyRequest=@{version='0.2.0';releaseId=12;assetId=25;size=12345;digest=('b'*64);workflowExecutable='C:\Fixed Resolve\Electron\electron.exe'}
$before=Get-UpdateRequestKey $keyRequest
$keyRequest.workflowExecutable='C:\Other Resolve\Electron\electron.exe'
Assert-True ((Get-UpdateRequestKey $keyRequest) -cne $before) 'host observation path swap was not bound across consent'
Record 'consent-request-key-binds-host-path-without-executable-path-argument'
$f=New-Fixture 'terminal-with-incomplete-journal'
$result=Invoke-UpdateTransaction $f.Context -Observe {'closed'}
$paths=Get-TransactionPaths $f.Context
Write-Text ($paths.Journal + '.next') 'INTERRUPTED WRITE - PRESERVE'
try {Get-UpdateTransactionState $f.Context; throw 'terminal with incomplete journal reported success'}
catch {Assert-True ($_.Exception.Message -ceq 'recovery-required') 'terminal incomplete journal did not fail closed'}
$f.Context.Id=[Guid]::NewGuid().ToString('N')
try {Invoke-UpdateTransaction $f.Context -Observe {'closed'}; throw 'new install ignored incomplete journal'}
catch {Assert-True ($_.Exception.Message -ceq 'recovery-required') 'fresh install incomplete journal did not fail closed'}
Assert-True ((Get-TreeHash $paths.Backup) -ceq $f.Old -and [IO.File]::ReadAllText($paths.Journal + '.next') -ceq 'INTERRUPTED WRITE - PRESERVE') 'incomplete journal or old backup discarded'
Record 'terminal-plus-incomplete-journal-stops-inspection-and-new-install-preserves-backup'
Write-Json (Join-Path $Root 'results.json') @{schemaVersion=1;kind='actual-isolated-engine-fixtures';cases=@($results.ToArray());productionQualified=$false}
$publishedRoot=Join-Path $publishedEvidence (Split-Path -Leaf $Root)
[IO.Directory]::CreateDirectory($publishedRoot) | Out-Null
Write-Json (Join-Path $publishedRoot 'results.json') @{schemaVersion=1;kind='actual-isolated-engine-fixtures';cases=@($results.ToArray());productionQualified=$false;fixtureRoot=$Root}
Write-Output ('EVIDENCE ' + $Root)
Write-Output ('PUBLISHED EVIDENCE ' + $publishedRoot)
