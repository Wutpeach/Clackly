[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BuildDirectory)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$build=[IO.Path]::GetFullPath($BuildDirectory);$identity=Get-Content (Join-Path $build 'build-report.json') -Raw|ConvertFrom-Json
$trial=@($identity|Where-Object variant -CEQ 'trial')[0];$rows=@();$failure=$null;$namespaceLease=$null;$fixtureRoot=$null
function Assert($ok,$why){if(!$ok){throw $why}}
function Pass($name){$script:rows+=@{case=$name;pass=$true};Write-Output ('PASS '+$name)}
try{
    foreach($item in $identity){Assert ((Get-FileHash -LiteralPath $item.exe).Hash.ToLowerInvariant() -ceq $item.sha256) 'artifact drift';foreach($src in $item.identity.sources){Assert ((Get-FileHash -LiteralPath $src.path).Hash.ToLowerInvariant() -ceq $src.sha256) ('source drift '+$src.path)}}
    Pass 'all-final-artifacts-and-sources-match-build'
    $a=[Reflection.Assembly]::LoadFile($trial.exe)
    Assert ($null -eq $a.EntryPoint -and [IO.Path]::GetExtension($trial.exe) -ceq '.dll') 'controlled assembly independently executable'
    Pass 'controlled-managed-code-is-DLL-without-entrypoint'
    $flags=[Reflection.BindingFlags]'NonPublic,Static';$t=$a.GetType('TrialBoundary')
    $expected=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'Clackly Setup R29/Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.dll'
    Assert ($t.GetProperty('ApprovedPath').GetValue($null,$null) -ieq $expected) 'fixed DLL path drift';Pass 'fixed-R29-DLL-path'
    $method=$t.GetMethod('CheckHandoff',$flags)
    $actual=[Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    [string]$launcher=Join-Path ([IO.Path]::GetDirectoryName($expected)) 'Clackly-Setup-0.1.3-win-x64-CONTROLLED-LAUNCHER.exe'
    $rejected=$false;try{$method.Invoke($null,@($true,[string[]]@(),$actual,$launcher))}catch{$rejected=$_.Exception.ToString().Contains('trial-native-host-required')}
    Assert $rejected 'foreign actual process accepted';Pass 'actual-PowerShell-host-refused-regardless-of-admin-token'
    $rejected=$false;try{$method.Invoke($null,@($true,[string[]]@('--handoff','SID','SHA'),$launcher,$launcher))}catch{$rejected=$_.Exception.ToString().Contains('trial-native-host-required')}
    Assert $rejected 'self-reported old handoff accepted';Pass 'old-self-reported-SID-SHA-refused'
    $rejected=$false;try{$a.GetType('TrialEntry').GetMethod('Run').Invoke($null,@(''))}catch{$rejected=$_.Exception.ToString().Contains('trial-protected-location-required')}
    Assert $rejected 'direct managed startup accepted';Pass 'direct-DLL-entry-refused-before-UI-or-session'
    foreach($variant in @('candidate','fixture')){
        $item=@($identity|Where-Object variant -CEQ $variant)[0];$other=[Reflection.Assembly]::LoadFile($item.exe)
        $rejected=$false;try{$other.GetType('TrialEntry').GetMethod('Run').Invoke($null,@(''))}catch{$rejected=$_.Exception.ToString().Contains('local-candidate-gate')}
        Assert $rejected 'nontrial authority';Pass ($variant+'-trial-entry-compiled-disabled')
        $rejected=$false;try{$other.GetType('TrialBoundary').GetMethod('OpenInstallationNamespace').Invoke($null,@())}catch{$rejected=$_.Exception.ToString().Contains('local-candidate-gate')}
        Assert $rejected 'nontrial namespace authority';Pass ($variant+'-production-namespace-compiled-disabled')
    }
    $fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('Clackly-R29-Namespace-'+[Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($fixtureRoot)|Out-Null
    $backend=(Join-Path $build 'candidate/SetupBackend.psm1').Replace("'","''")
    $nativeModule=(Join-Path $build 'candidate/LocalNative.psm1').Replace("'","''")
    $probe='$ErrorActionPreference='+"'Stop'; Import-Module '$backend' -Force -DisableNameChecking; Import-Module '$nativeModule' -DisableNameChecking; "
    $probe+='$locations=Get-SetupProductionLocations; $locations["NativeSource"]=Get-LocalResolveNativePath; $locations | ConvertTo-Json -Depth 4 -Compress'
    $ps=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    $info=[Diagnostics.ProcessStartInfo]::new($ps,('-NoProfile -NonInteractive -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($probe))))
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $a.GetType('SetupForm').GetMethod('ConfigureChildEnvironment',$flags).Invoke($null,@($info,[string]$fixtureRoot))|Out-Null
    $child=[Diagnostics.Process]::Start($info);$output=$child.StandardOutput.ReadToEnd();$errors=$child.StandardError.ReadToEnd();$child.WaitForExit()
    Assert ($child.ExitCode -eq 0) ('clean worker cannot resolve production locations: '+$errors)
    $locations=$output|ConvertFrom-Json
    $expectedScan=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design/DaVinci Resolve/Support/Workflow Integration Plugins'))
    Assert ($locations.Scan -ieq $expectedScan -and $locations.Target -ieq (Join-Path $expectedScan 'com.wutpeach.clackly')) 'clean worker resolved incorrect production location'
    $expectedNative=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design/DaVinci Resolve/Support/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node'))
    Assert ($locations.NativeSource -ieq $expectedNative) 'clean worker resolved incorrect official Native source'
    Pass 'actual-clean-PowerShell-worker-resolves-canonical-production-locations-readonly'
    [string]$scan=[IO.Path]::GetFullPath((Join-Path $fixtureRoot 'Support/Plugins'));[string]$target=Join-Path $scan 'com.wutpeach.clackly';$neighbor=Join-Path $scan 'other-plugin'
    [IO.Directory]::CreateDirectory($target)|Out-Null;[IO.Directory]::CreateDirectory($neighbor)|Out-Null
    $broad=[Security.AccessControl.DirectorySecurity]::new();$broad.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;OICI;FA;;;WD)(A;OICI;FA;;;SY)')
    Set-Acl -LiteralPath $fixtureRoot -AclObject $broad
    [IO.File]::WriteAllText((Join-Path $neighbor 'existing.txt'),'preserve')
    $shared=@($fixtureRoot,(Split-Path $scan),$scan,$target,$neighbor,(Join-Path $neighbor 'existing.txt'))
    $before=@($shared|ForEach-Object{(Get-Acl -LiteralPath $_).Sddl})
    $open=$t.GetMethod('OpenNamespace',$flags)
    $namespaceLease=$open.Invoke($null,@($scan))
    Assert ($null -ne $namespaceLease) 'permissive shared directory rejected'
    foreach($i in 0..($shared.Count-1)){Assert ((Get-Acl -LiteralPath $shared[$i]).Sddl -ceq $before[$i]) 'shared or neighbor ACL changed'}
    Pass 'Everyone-full-control-shared-tree-accepted-with-all-existing-ACLs-unchanged'
    Import-Module (Join-Path $build 'candidate/WorkflowTransaction.psm1') -Force -DisableNameChecking
    Import-Module (Join-Path $build 'candidate/ExecutorSupport.psm1') -Force -DisableNameChecking
    Assert-UpdateWriteAccess $scan $scan
    Assert-UpdateWriteAccess $target $scan
    Pass 'fresh-access-probe-works-with-held-scan-existing-target-still-checks-DELETE'
    $transactions=$scan+'.Clackly Updates';[Security.AccessControl.DirectorySecurity]$private=Get-Acl -LiteralPath $transactions
    $t.GetMethod('CheckAcl',$flags).Invoke($null,@($private,$true))|Out-Null
    Assert $private.AreAccessRulesProtected 'new transaction root inherited writable ACL'
    Pass 'only-new-Clackly-transaction-directory-has-private-ACL'
    $moved=$scan+'-moved';$renameBlocked=$false
    try{[IO.Directory]::Move($scan,$moved)}catch [IO.IOException]{$renameBlocked=$true}
    Assert $renameBlocked 'held shared directory replaceable'
    Pass 'actual-held-shared-directory-cannot-be-renamed-during-install'
    [IO.Directory]::Move($target,$target+'.backup');[IO.Directory]::Move($target+'.backup',$target)
    [IO.File]::WriteAllText((Join-Path $neighbor 'still-writable.txt'),'inert')
    Assert ([IO.File]::ReadAllText((Join-Path $neighbor 'existing.txt')) -ceq 'preserve') 'neighbor data changed'
    Pass 'target-remains-movable-and-other-plugin-remains-writable'
    $namespaceLease.Dispose();$namespaceLease=$null
    Set-Acl -LiteralPath $transactions -AclObject $broad;$existingAcl=(Get-Acl -LiteralPath $transactions).Sddl
    $rejected=$false;try{$namespaceLease=$open.Invoke($null,@($scan))}catch{$rejected=$_.Exception.ToString().Contains('trial-unprotected-path')}
    Assert $rejected 'writable transaction root accepted'
    Assert ((Get-Acl -LiteralPath $transactions).Sddl -ceq $existingAcl) 'existing working directory ACL silently repaired'
    Pass 'existing-writable-Clackly-working-directory-refused-without-permission-repair'
    [string]$junction=Join-Path $fixtureRoot 'junction-scan'
    New-Item -ItemType Junction -Path $junction -Target $neighbor|Out-Null
    $rejected=$false;try{$namespaceLease=$open.Invoke($null,@($junction))}catch{$rejected=$_.Exception.ToString().Contains('reparse') -or $_.Exception.ToString().Contains('target-unverified')}
    Assert $rejected 'junction accepted as install root';Assert (!(Test-Path -LiteralPath ($junction+'.Clackly Updates'))) 'reparse refusal created work directory'
    Pass 'junction-shared-root-refused-before-working-directory-creation'
    $realScan=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design/DaVinci Resolve/Support/Workflow Integration Plugins'))
    if(Test-Path -LiteralPath $realScan){
        $realPaths=@($realScan,(Split-Path $realScan),(Split-Path (Split-Path $realScan)));$realBefore=@($realPaths|ForEach-Object{(Get-Acl -LiteralPath $_).Sddl})
        $lease=[Activator]::CreateInstance($t)
        try{$t.GetMethod('HoldSharedDirectory',[Reflection.BindingFlags]'NonPublic,Instance').Invoke($lease,@([string]$realScan))|Out-Null}finally{$lease.Dispose()}
        foreach($i in 0..($realPaths.Count-1)){Assert ((Get-Acl -LiteralPath $realPaths[$i]).Sddl -ceq $realBefore[$i]) 'real shared ACL changed'}
        Pass 'current-computer-shared-path-hold-accepted-readonly-no-ACL-change'
    }
}catch{$failure=$_.Exception.ToString()}finally{if($namespaceLease){$namespaceLease.Dispose()}}
$report=@{round='R29';success=($null -eq $failure);count=$rows.Count;results=$rows;failure=$failure;namespaceFixture=$fixtureRoot;realUac=$false;realInstallation=$false;realSharedAclChanges=$false;buildReportSha256=(Get-FileHash (Join-Path $build 'build-report.json')).Hash.ToLowerInvariant();runnerSha256=(Get-FileHash $PSCommandPath).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $build ('test-report-R29-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'.json')),($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
if($failure){throw $failure};Write-Output ('TOTAL '+$rows.Count+' PASS')
