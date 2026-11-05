[CmdletBinding()]
param([ValidateSet('All','Backend','Gui','Candidate')][string]$Mode='All',[ValidateSet('fresh','survival','native-failure','rollback','cancel')][string[]]$GuiScenarios=@('fresh','survival','native-failure','rollback','cancel'),[string]$BuildDirectory='')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$build=Join-Path $repo 'resolve-command-center/build/windows-setup-r24'
if ($BuildDirectory) {$build=[IO.Path]::GetFullPath($BuildDirectory)}
$closure=Join-Path $build 'fixture'
Import-Module (Join-Path $closure 'SetupBackend.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $closure 'WorkflowTransaction.psm1') -DisableNameChecking
Import-Module (Join-Path $closure 'ExecutorSupport.psm1') -DisableNameChecking
Import-Module (Join-Path $closure 'Fixture.psm1') -Force -DisableNameChecking
$suiteRoot=Join-Path (Join-Path ([IO.Path]::GetTempPath()) 'Clackly-R24-Fixtures') ([Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($suiteRoot) | Out-Null
$results=[Collections.Generic.List[object]]::new()
Import-Module (Join-Path $PSScriptRoot 'SetupMonitor.psm1') -Force
$script:ActiveMonitor=$null
function Assert($Value,[string]$Why) {if (!$Value) {throw ('ASSERT '+$Why)}}
function Record([string]$Name,$Evidence=$null) {$results.Add(@{case=$Name;pass=$true;evidence=$Evidence});Write-Output ('PASS '+$Name)}
function New-Case([string]$Name) {
    $root=Join-Path $suiteRoot $Name;[IO.Directory]::CreateDirectory($root) | Out-Null
    Write-FixtureText (Join-Path $root '.clackly-r24-fixture') 'INERT R24 ONLY'
    $id=[Guid]::NewGuid().ToString('N');$f=New-SetupFixture $root $id
    $sessionRoot=Join-Path $root 'session';[IO.Directory]::CreateDirectory($sessionRoot) | Out-Null
    $f.Root=$root;$f.Session=@{Id=$id;Root=$sessionRoot;Sequence=0};return $f
}
function Reject([scriptblock]$Action,[string]$Reason) {
    $accepted=$false;try {& $Action | Out-Null;$accepted=$true} catch {Assert ($_.Exception.Message -ceq $Reason) ('reason '+$Reason+' actual '+$_.Exception.Message)}
    Assert (!$accepted) ('accepted '+$Reason)
}
function Assert-Old($f) {Assert ((Get-TreeHash $f.Context.Target) -ceq $f.OldHash) 'old complete tree';Assert ([IO.File]::ReadAllText((Join-Path $f.Root 'AppData/preferences.json')) -ceq '{"retained":true}') 'preferences';Assert ([IO.File]::ReadAllText((Join-Path $f.Context.ScanRoot 'neighbor/sentinel')) -ceq 'RETAIN NEIGHBOR') 'neighbor'}
function Start-Consent($f) {Write-FixtureText (Join-Path $f.Session.Root 'continue.request') 'fixture consent'}
function Prepare-CancelledInspection($f,$ExitedWorker) {
    Write-FixtureText (Join-Path $f.Session.Root 'cancel.request') 'cancel before transaction'
    $receipt=Invoke-SetupTransaction $f.Context $f.Session $f.Locations -Observe {'closed'} -Provision {param($r,$w) Copy-InertSetupNative $r $w}
    $receipt.id=$f.Context.Id;$receipt.workerPid=$ExitedWorker.pid;$receipt.workerCreated=$ExitedWorker.created
    Write-FixtureJson (Join-Path $f.Session.Root 'result.json') $receipt
}
function Save-Archive($f,[string]$Name='fixture.zip') {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipPath=Join-Path $f.Root $Name
    $zip=[IO.Compression.ZipFile]::Open($zipPath,'Create')
    try {foreach ($row in @(Get-TreeFiles $f.Context.PackageRoot)) {[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $f.Context.PackageRoot $row.path),('plugin/'+$row.path),'Optimal') | Out-Null}}
    finally {$zip.Dispose()}
    return $zipPath
}
function Get-FixtureOfficial([string]$Archive) {
    $size=(Get-Item -LiteralPath $Archive).Length;$digest=Get-UpdateHash $Archive
    return @{id=123;draft=$false;prerelease=$false;tag_name='v0.1.3';assets=@(@{id=456;name='Clackly-Workflow-0.1.3-win-x64.zip';state='uploaded';size=$size;digest=('sha256:'+$digest);content_type='application/zip';browser_download_url='https://github.com/Wutpeach/Clackly/releases/download/v0.1.3/Clackly-Workflow-0.1.3-win-x64.zip'})}
}
$failure=$null
try {
if ($Mode -cin @('All','Backend')) {
    $readback=Read-UpdateJson (Join-Path $closure 'OfficialMetadata.json')
    $official=@{id=$readback.releaseId;tag_name=$readback.tag;draft=$readback.draft;prerelease=$readback.prerelease;assets=$readback.assets}
    $archive=Join-Path $build 'candidate/Workflow.zip'
    $real=Assert-SetupArchive $archive (Join-Path $suiteRoot 'original-official-payload') -Fetch {$official}
    Assert ($real.assetId -eq 691653752 -and $real.releaseId -eq 428867234) 'original official identity'
    Record 'original-official-zip-full-strict-qualification-retained-authenticated-metadata' @{transportEvidence=$readback.observedUtc;request=$real}
    $f=New-Case 'hash-tamper';$zip=Save-Archive $f;$meta=Get-FixtureOfficial $zip
    $pin=@{version='0.1.3';releaseId=123;assetId=456;size=(Get-Item -LiteralPath $zip).Length;digest=(Get-UpdateHash $zip);commit=('a'*40)}
    $stream=[IO.File]::Open($zip,'Open','ReadWrite','None');try {$stream.Position=10;$b=$stream.ReadByte();$stream.Position=10;$stream.WriteByte($b -bxor 1)} finally {$stream.Dispose()}
    Reject {Assert-SetupArchive $zip (Join-Path $f.Root 'expanded') $pin -Fetch {$meta}} 'publisher-unverified';Assert-Old $f;Record 'tampered-zip-hash-refused'
    foreach ($variant in @('source','version','origin','pollution','runtime','unpublishable')) {
        $f=New-Case $variant
        if ($variant -ceq 'pollution') {Write-FixtureText (Join-Path $f.Context.PackageRoot 'unlisted.txt') 'UNLISTED'}
        if ($variant -ceq 'runtime') {Write-FixtureText (Join-Path $f.Context.PackageRoot 'resources/runtimes/inert/python.exe') 'CHANGED'}
        if ($variant -ceq 'unpublishable') {$m=Read-UpdateJson (Join-Path $f.Context.PackageRoot 'clackly-release.json');$m.build.publishable=$false;Write-FixtureJson (Join-Path $f.Context.PackageRoot 'clackly-release.json') $m}
        $zip=Save-Archive $f;$meta=Get-FixtureOfficial $zip
        $pin=@{version='0.1.3';releaseId=123;assetId=456;size=(Get-Item -LiteralPath $zip).Length;digest=(Get-UpdateHash $zip);commit=('a'*40)}
        $reason='invalid-package'
        if ($variant -ceq 'source') {$pin.commit='d'*40;$reason='publisher-unverified'}
        if ($variant -ceq 'version') {$pin.version='0.1.4';$reason='publisher-unverified'}
        if ($variant -ceq 'origin') {$meta.assets[0].browser_download_url='https://example.invalid/asset.zip';$reason='publisher-unverified'}
        Reject {Assert-SetupArchive $zip (Join-Path $f.Root 'expanded') $pin -Fetch {$meta}} $reason
        Assert-Old $f;Record ($variant+'-refused')
    }
    foreach ($conflict in @('pointer','request','pending','unknown-transaction','completed-unreconciled')) {
        $f=New-Case ('legacy-'+$conflict)
        if ($conflict -ceq 'pointer') {Write-FixtureText $f.Locations.Pointers[0] '{}'}
        elseif ($conflict -ceq 'request') {Write-FixtureText (Join-Path $f.Locations.Inbox 'orphan/request.json') '{}'}
        elseif ($conflict -ceq 'completed-unreconciled') {Write-FixtureText (Join-Path $f.Locations.Transactions 'old.json') '{"state":"verified"}'}
        else {Write-FixtureText (Join-Path $f.Locations.Transactions ($conflict+'.json.next')) 'UNKNOWN'}
        Reject {Invoke-SetupTransaction $f.Context $f.Session $f.Locations -Observe {'closed'} -Provision {param($r,$w) Copy-InertSetupNative $r $w}} 'recovery-required'
        Assert-Old $f;Record ('legacy-'+$conflict+'-preserved-and-refused')
    }
    $f=New-Case 'target';$f.Context.Target=Join-Path $f.Context.ScanRoot 'neighbor'
    Reject {Invoke-SetupTransaction $f.Context $f.Session $f.Locations -Observe {'closed'} -Provision {param($r,$w) Copy-InertSetupNative $r $w}} 'target-unverified';Record 'arbitrary-target-refused'
    $f=New-Case 'concurrency';$held=[IO.File]::Open((Join-Path $f.Context.ScanRoot '.clackly-setup.lock'),'OpenOrCreate','ReadWrite','None')
    try {Reject {Invoke-SetupTransaction $f.Context $f.Session $f.Locations -Observe {'closed'} -Provision {param($r,$w) Copy-InertSetupNative $r $w}} 'concurrent-install'} finally {$held.Dispose()}
    Assert-Old $f;Record 'real-exclusive-adapter-lock-refused'
    foreach ($scenario in @('native-failure','permission','rollback','cancel-before','cancel-after','host-unknown')) {
        $f=New-Case $scenario;Start-Consent $f
        if ($scenario -ceq 'cancel-before') {Write-FixtureText (Join-Path $f.Session.Root 'cancel.request') 'cancel'}
        $provision={param($root,$workflow) if ($scenario -ceq 'native-failure') {throw 'native-invalid'};Copy-InertSetupNative $root $workflow}
        $checkpoint={param($p)
            if ($scenario -ceq 'permission' -and $p -ceq 'after-stage') {throw [UnauthorizedAccessException]::new('fixture permission')}
            if ($scenario -ceq 'rollback' -and $p -ceq 'after-activation') {throw 'fixture failure'}
            if ($scenario -ceq 'cancel-after' -and $p -ceq 'backup-intent') {Write-FixtureText (Join-Path $f.Session.Root 'cancel.request') 'late cancel'}
        }
        if ($scenario -ceq 'host-unknown') {Reject {Invoke-SetupTransaction $f.Context $f.Session $f.Locations -Observe {'process-unknown'} -Provision $provision} 'process-unknown'}
        else {
            $outcome=Invoke-SetupTransaction $f.Context $f.Session $f.Locations -Observe {'closed'} -Provision $provision -Checkpoint $checkpoint
            $expected=if ($scenario -ceq 'rollback') {'rolled-back'} elseif ($scenario -ceq 'cancel-before') {'cancelled'} elseif ($scenario -ceq 'cancel-after') {'installed'} else {'failed'}
            Assert ($outcome.status -ceq $expected) ($scenario+' status '+$outcome.status)
            if ($scenario -ceq 'cancel-after') {Assert ((Get-TreeHash (Get-TransactionPaths $f.Context).Backup) -ceq $f.OldHash) 'late cancel backup'} else {Assert-Old $f}
        }
        Record ('same-backend-inert-'+$scenario)
    }
    # Direct inspector tests use a real exited inert child identity; GUI cases
    # separately prove the actual supervised worker and inspector lifetimes.
    $ps=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    $child=Start-Process $ps -ArgumentList '-NoProfile -NonInteractive -Command exit 0' -WindowStyle Hidden -PassThru;$null=$child.Handle
    $exitedWorker=@{pid=$child.Id;created=$child.StartTime.ToUniversalTime().ToString('o')}
    Assert ($child.WaitForExit(5000) -and $child.ExitCode -eq 0) 'inert inspection child exited'
    foreach ($inspection in @('safe','unknown-pending','unknown-directory','adapter-lock','engine-lock','missing-engine-lock','hardlinked-engine-lock','live-worker','forged-installed','changed-old-tree')) {
        $f=New-Case ('inspect-'+$inspection);Prepare-CancelledInspection $f $exitedWorker
        $before=@(Get-ChildItem -LiteralPath $f.Locations.Transactions -Force).Count
        $held=$null;$reason='recovery-required'
        try {
            if ($inspection -ceq 'unknown-pending') {Write-FixtureText (Join-Path $f.Locations.Transactions 'UNKNOWN.json.next') 'PRESERVE UNKNOWN'}
            if ($inspection -ceq 'unknown-directory') {Write-FixtureText (Join-Path $f.Locations.Transactions 'foreign/sentinel') 'PRESERVE UNKNOWN'}
            if ($inspection -ceq 'adapter-lock') {$held=[IO.File]::Open((Join-Path $f.Context.ScanRoot '.clackly-setup.lock'),'Open','ReadWrite','None');$reason='concurrent-install'}
            if ($inspection -ceq 'engine-lock') {$held=[IO.File]::Open((Join-Path $f.Locations.Transactions 'install.lock'),'OpenOrCreate','ReadWrite','None');$reason='concurrent-install'}
            if ($inspection -ceq 'missing-engine-lock') {Remove-Item -LiteralPath (Join-Path $f.Locations.Transactions 'install.lock')}
            if ($inspection -ceq 'hardlinked-engine-lock') {New-Item -ItemType HardLink -Path (Join-Path $f.Root 'lock-alias') -Target (Join-Path $f.Locations.Transactions 'install.lock') | Out-Null}
            if ($inspection -cin @('live-worker','forged-installed')) {
                $receipt=Read-UpdateJson (Join-Path $f.Session.Root 'result.json')
                if ($inspection -ceq 'live-worker') {$receipt.workerPid=$PID;$receipt.workerCreated=[Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().ToString('o')}
                else {$receipt.status='installed'}
                Write-FixtureJson (Join-Path $f.Session.Root 'result.json') $receipt
            }
            if ($inspection -ceq 'changed-old-tree') {Write-FixtureText (Join-Path $f.Context.Target 'old.txt') 'CHANGED; PRESERVE FOR REVIEW'}
            if ($inspection -ceq 'safe') {
                $actual=Get-SetupReconciledOutcome $f.Context $f.Session.Root $f.Locations (Get-SetupInspectionWitness $f.Context $f.Session.Root)
                Assert ($actual.status -ceq 'cancelled') 'safe no-journal cancellation'
                Assert (@(Get-ChildItem -LiteralPath $f.Locations.Transactions -Force).Count -eq $before) 'inspect created no transaction artifacts'
            } else {Reject {Get-SetupReconciledOutcome $f.Context $f.Session.Root $f.Locations (Get-SetupInspectionWitness $f.Context $f.Session.Root)} $reason}
        } finally {if ($held) {$held.Dispose()}}
        if ($inspection -ceq 'changed-old-tree') {Assert ([IO.File]::ReadAllText((Join-Path $f.Context.Target 'old.txt')) -ceq 'CHANGED; PRESERVE FOR REVIEW') 'tampered tree retained'}
        else {Assert-Old $f}
        if ($inspection -ceq 'unknown-pending') {Assert ([IO.File]::ReadAllText((Join-Path $f.Locations.Transactions 'UNKNOWN.json.next')) -ceq 'PRESERVE UNKNOWN') 'unknown pending retained'}
        if ($inspection -ceq 'unknown-directory') {Assert ([IO.File]::ReadAllText((Join-Path $f.Locations.Transactions 'foreign/sentinel')) -ceq 'PRESERVE UNKNOWN') 'unknown directory retained'}
        Record ('independent-no-journal-inspect-'+$inspection)
    }
}
function Wait-File([string]$Path,[int]$Seconds=30) {
    if ($script:ActiveMonitor) {Wait-SetupCheckpoint $script:ActiveMonitor $Path;return}
    $deadline=[DateTime]::UtcNow.AddSeconds($Seconds)
    while (!(Test-Path -LiteralPath $Path)) {if ([DateTime]::UtcNow -gt $deadline) {throw ('timeout '+$Path)};Start-Sleep -Milliseconds 100}
}
if ($Mode -cin @('All','Candidate')) {
    Add-Type -AssemblyName UIAutomationClient;Add-Type -AssemblyName UIAutomationTypes
    Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class R24CandidateUi{[DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);public static void Click(IntPtr h){SendMessage(h,0xF5,IntPtr.Zero,IntPtr.Zero);}}'
    $exe=Join-Path $build 'Clackly-Setup-0.1.3-win-x64-LOCAL-CANDIDATE.exe'
    $candidate=Start-Process -FilePath $exe -PassThru;$null=$candidate.Handle
    $candidateCreated=$candidate.StartTime.ToUniversalTime().ToString('o');$deadline=[DateTime]::UtcNow.AddSeconds(30)
    do {$candidate.Refresh();if ([DateTime]::UtcNow -gt $deadline) {throw 'candidate-window-timeout'};Start-Sleep -Milliseconds 100} while ($candidate.MainWindowHandle -eq [IntPtr]::Zero)
    $window=[Windows.Automation.AutomationElement]::FromHandle($candidate.MainWindowHandle)
    $buttons=$window.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
    $verify=@($buttons | Where-Object {$_.Current.Name -like '验证来源*'})[0]
    [R24CandidateUi]::Click([IntPtr]$verify.Current.NativeWindowHandle)
    $evidence=@($buttons | Where-Object {$_.Current.ClassName -match 'EDIT'})[0]
    $deadline=[DateTime]::UtcNow.AddSeconds(30);$session=''
    do {$session=$evidence.Current.Name;if ([DateTime]::UtcNow -gt $deadline) {throw 'candidate-session-timeout'};Start-Sleep -Milliseconds 100} while (!$session)
    $script:ActiveMonitor=New-SetupMonitor $session (Join-Path $suiteRoot 'candidate-monitor.json')
    Wait-File (Join-Path $session 'supervisor-terminal.json')
    $terminal=Read-UpdateJson (Join-Path $session 'supervisor-terminal.json');$receipt=Read-UpdateJson (Join-Path $session 'result.json')
    Assert ($terminal.status -ceq 'source-verified' -and $terminal.reason -ceq 'local-candidate-gate' -and $terminal.inspectorExitCode -eq 0) ('candidate terminal '+$terminal.status+'/'+$terminal.reason)
    Assert (!(Test-Path -LiteralPath (Join-Path $session 'context.json')) -and !(Test-Path -LiteralPath (Join-Path $session 'baseline.json')) ) 'candidate gated before Host context and transaction preparation'
    Assert ($receipt.sourceEvidence -ceq 'original-official-zip') 'candidate exact original source'
    $buttons=$window.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
    $close=@($buttons | Where-Object {$_.Current.Name -like '关闭*'})[0];[R24CandidateUi]::Click([IntPtr]$close.Current.NativeWindowHandle)
    Assert ($candidate.WaitForExit(10000) -and $candidate.ExitCode -eq 0) 'candidate natural GUI close'
    Record 'actual-native-candidate-original-source-verified-real-install-hard-locked' @{exe=$exe;exeSha256=(Get-UpdateHash $exe);session=$session;pid=$candidate.Id;created=$candidateCreated;terminal=$terminal;receipt=$receipt}
}
if ($Mode -cin @('All','Gui')) {
    $exe=Join-Path $build 'Clackly-Setup-0.1.3-win-x64-INERT-FIXTURE.exe'
    $ps=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    foreach ($scenario in $GuiScenarios) {
        $script:ActiveMonitor=$null
        $case=Join-Path $suiteRoot ('gui-'+$scenario);[IO.Directory]::CreateDirectory($case) | Out-Null
        Write-FixtureText (Join-Path $case '.clackly-r24-fixture') 'INERT R24 ONLY';Write-FixtureText (Join-Path $case 'scenario.txt') $scenario
        if ($scenario -ceq 'cancel') {Write-FixtureText (Join-Path $case 'manual-consent') 'manual'}
        if ($scenario -cin @('fresh','survival')) {
            $hostScript=Join-Path $case 'inert-host.ps1'
            Write-FixtureText $hostScript ('while (!(Test-Path -LiteralPath '''+(Join-Path $case 'release-host')+''')) {Start-Sleep -Milliseconds 100}')
            $fakeHost=Start-Process $ps -ArgumentList ('-NoProfile -NonInteractive -File "'+$hostScript+'"') -WindowStyle Hidden -PassThru;$null=$fakeHost.Handle
            Write-FixtureJson (Join-Path $case 'host.json') @{pid=$fakeHost.Id;created=$fakeHost.StartTime.ToUniversalTime().ToString('o');image=$ps}
        }
        $starter=Join-Path $case 'starter.ps1'
        $starterCode=@'
param($Exe,$Root)
$ErrorActionPreference='Stop'
$process=Start-Process -FilePath $Exe -ArgumentList ('--fixture "'+$Root+'"') -PassThru
$created=$process.StartTime.ToUniversalTime().ToString('o')
[IO.File]::WriteAllText((Join-Path $Root 'starter.json'),(@{pid=$PID;created=[Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().ToString('o');supervisorPid=$process.Id;supervisorCreated=$created} | ConvertTo-Json))
$deadline=[DateTime]::UtcNow.AddSeconds(30)
do {Start-Sleep -Milliseconds 100;if ([DateTime]::UtcNow -gt $deadline) {exit 2}} while (!(Test-Path -LiteralPath (Join-Path $Root 'session.txt')))
$session=[IO.File]::ReadAllText((Join-Path $Root 'session.txt'))
do {Start-Sleep -Milliseconds 100;if ([DateTime]::UtcNow -gt $deadline) {exit 3}} while (!(Test-Path -LiteralPath (Join-Path $session 'event-0001.json')))
exit 0
'@
        Write-FixtureText $starter $starterCode
        $launcher=Start-Process $ps -ArgumentList ('-NoProfile -NonInteractive -File "'+$starter+'" -Exe "'+$exe+'" -Root "'+$case+'"') -WindowStyle Hidden -PassThru;$null=$launcher.Handle
        Assert ($launcher.WaitForExit(35000) -and $launcher.ExitCode -eq 0) 'actual starter exit'
        Wait-File (Join-Path $case 'session.txt');$session=[IO.File]::ReadAllText((Join-Path $case 'session.txt')).Trim([char]0xfeff)
        $starterReceipt=Read-UpdateJson (Join-Path $case 'starter.json');$workerReceipt=Read-UpdateJson (Join-Path $session 'worker-process.json')
        $script:ActiveMonitor=New-SetupMonitor $session (Join-Path $case 'monitor.json')
        if ($scenario -cin @('fresh','survival')) {
            # R24 source qualification uses the real 5,000+ file official ZIP.
            # Wait for the actual shared pipeline to reach host waiting, rather
            # than releasing the host during archive hashing.
            Wait-File (Join-Path $case 'ui-waiting.json')
            $supervisor=Get-Process -Id $starterReceipt.supervisorPid;$realWorker=Get-Process -Id $workerReceipt.pid
            Assert ($supervisor.StartTime.ToUniversalTime().ToString('o') -ceq $starterReceipt.supervisorCreated) 'supervisor survived starter'
            Assert ($realWorker.StartTime.ToUniversalTime().ToString('o') -ceq $workerReceipt.created) 'worker survived starter'
            Assert (!(Test-Path -LiteralPath (Join-Path $session 'supervisor-terminal.json'))) 'survival was refusal before ACK'
            Write-FixtureText (Join-Path $case 'release-host') 'natural fake host exit'
            Assert ($fakeHost.WaitForExit(5000) -and $fakeHost.ExitCode -eq 0) 'fake host natural exit'
        }
        if ($scenario -ceq 'cancel') {Wait-File (Join-Path $case 'ui-waiting.json');Write-FixtureText (Join-Path $session 'cancel.request') 'explicit fixture cancellation'}
        Wait-File (Join-Path $session 'supervisor-terminal.json')
        $terminal=Read-UpdateJson (Join-Path $session 'supervisor-terminal.json');$context=Read-UpdateJson (Join-Path $session 'context.json');$baseline=Read-UpdateJson (Join-Path $session 'fixture-baseline.json')
        $expected=if ($scenario -cin @('survival','fresh')) {'installed'} elseif ($scenario -ceq 'rollback') {'rolled-back'} elseif ($scenario -ceq 'cancel') {'cancelled'} else {'failed'}
        Assert ($terminal.status -ceq $expected) ('GUI '+$scenario+' terminal actual '+$terminal.status+' '+$terminal.reason)
        Assert ($terminal.inspectorExitCode -eq 0) 'independent inspector exited successfully'
        $oldPath=if ($scenario -cin @('survival','fresh')) {(Get-TransactionPaths $context).Backup} else {$context.Target}
        Assert ((Get-SetupTreeHash $oldPath) -ceq $baseline.oldHash) 'GUI complete old tree retained'
        $supervised=Get-Process -Id $starterReceipt.supervisorPid -ErrorAction SilentlyContinue
        if ($supervised -and $supervised.StartTime.ToUniversalTime().ToString('o') -ceq $starterReceipt.supervisorCreated) {Assert ($supervised.WaitForExit(10000)) 'supervisor natural exit'}
        Wait-File (Join-Path $case 'fixture-terminal.png')
        $proof=@{fixture=$true;scenario=$scenario;root=$case;session=$session;starter=$starterReceipt;starterExit=$launcher.ExitCode;worker=$workerReceipt;workerExit=(Read-UpdateJson (Join-Path $session 'worker-exit.json'));terminal=$terminal;monitor=(Join-Path $case 'monitor.json');elapsedSeconds=([DateTime]::UtcNow-$script:ActiveMonitor.Started).TotalSeconds;oldFullTreeHash=$baseline.oldHash;retainedOldFullTreeHash=(Get-SetupTreeHash $oldPath);fakeHostNaturalExit=($scenario -cin @('fresh','survival'));fakeHost=$(if ($scenario -cin @('fresh','survival')) {Read-UpdateJson (Join-Path $case 'host.json')} else {$null})}
        Write-FixtureJson (Join-Path $case 'lifecycle-evidence.json') $proof
        Record ('actual-native-gui-'+$scenario) $proof
    }
}
} catch {$failure=$_}
$report=@{round='R24';fixture=$true;buildReportSha256=(Get-UpdateHash (Join-Path $build 'build-report.json'));runnerSha256=(Get-UpdateHash $PSCommandPath);observedUtc=[DateTime]::UtcNow.ToString('o');suiteRoot=$suiteRoot;count=$results.Count;results=@($results);success=($null -eq $failure);failure=$(if ($failure) {$failure.Exception.Message} else {$null})}
$reportFile=Join-Path $build ('test-report-'+$Mode+'-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'.json')
Write-FixtureJson $reportFile $report
if ($failure) {throw $failure}
Write-Output ('TOTAL '+$results.Count+' PASS; '+$reportFile)
