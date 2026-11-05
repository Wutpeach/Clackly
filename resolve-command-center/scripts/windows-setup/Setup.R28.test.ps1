[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BuildDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$build=[IO.Path]::GetFullPath($BuildDirectory)
$root=Join-Path ([IO.Path]::GetTempPath()) ('Clackly-R24-Fixtures/'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
[IO.File]::WriteAllText((Join-Path $root '.clackly-r24-fixture'),'INERT R24 ONLY')
$rows=[Collections.Generic.List[object]]::new()
function Assert($value,$message){if (!$value){throw $message}}
function Record($name){$rows.Add(@{case=$name;pass=$true});Write-Output ('PASS '+$name)}
$b=Get-Content (Join-Path $build 'build-report.json') -Raw | ConvertFrom-Json
$trial=@($b | Where-Object variant -CEQ 'trial')[0]
Assert ((Get-FileHash -LiteralPath $trial.exe).Hash.ToLowerInvariant() -ceq $trial.sha256) 'trial artifact drift'
$a=[Reflection.Assembly]::LoadFile($trial.exe);$t=$a.GetType('TrialBoundary')
$flags=[Reflection.BindingFlags]'NonPublic,Static'
function Call([string]$name,[object[]]$values){
    for($i=0;$i -lt $values.Length;$i++){if($null -ne $values[$i]){$values[$i]=$values[$i].PSObject.BaseObject}}
    try{return $t.GetMethod($name,$flags).Invoke($null,$values)}catch{
        $cause=$_.Exception;while($cause.InnerException){$cause=$cause.InnerException};throw $cause.Message
    }
}
function Reject([scriptblock]$action,[string]$reason){$refused=$false;try{& $action | Out-Null}catch{Assert ($_.Exception.Message -ceq $reason) ('expected '+$reason+' got '+$_.Exception.Message);$refused=$true};Assert $refused ('unexpected acceptance '+$reason)}
function Acl([string]$owner='S-1-5-32-544'){
    $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner([Security.Principal.SecurityIdentifier]::new($owner))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]::ReadAndExecute,'Allow'));return $acl
}
$failure=$null
try {
    $fixed=$t.GetProperty('ApprovedPath').GetValue($null,$null)
    Assert ($fixed -ceq (Join-Path (Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'Clackly Setup R28') 'Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.exe')) 'managed and native fixed installation paths differ'
    Call CheckPath @($fixed,$fixed);Record 'fixed-protected-launch-identity-policy-SIMULATED'
    foreach($path in @($trial.exe,(Join-Path $root 'renamed.exe'),($fixed+'.other'))){Reject {Call CheckPath @($path,$fixed)} 'trial-protected-location-required';Record ('unapproved-path-refused-'+$rows.Count)}
    Reject {Call OpenLaunch (,([string[]]@()))} 'trial-protected-location-required';Record 'final-trial-repository-startup-refused-before-UAC-or-session'
    $sid='S-1-5-21-100-200-300-1001';$hash='a'*64
    Reject {Call CheckHandoff @($false,[string[]]@(),$sid,$hash)} 'trial-native-launcher-required';Record 'core-cannot-elevate-directly-SIMULATED'
    Call CheckHandoff @($true,[string[]]@('--handoff',$sid,$hash),$sid,$hash);Record 'same-user-token-hash-handoff-policy-SIMULATED'
    Reject {Call CheckHandoff @($false,[string[]]@('--handoff',$sid,$hash),$sid,$hash)} 'trial-native-launcher-required';Record 'handoff-arguments-cannot-create-admin-token-SIMULATED'
    foreach($argsCase in @(@(),@('--enable-production'),@('--handoff',$sid,('b'*64)),@('--handoff','S-1-5-21-OTHER',$hash),@('--handoff',$sid,$hash,'extra'))){Reject {Call CheckHandoff @($true,[string[]]$argsCase,$sid,$hash)} 'trial-elevated-handoff-refused';Record ('elevated-recheck-refused-'+$rows.Count)}
    $acl=Acl;Call CheckAcl @($acl,$true);Record 'protected-owner-readonly-users-ACL-policy-SIMULATED'
    Call CheckDefaultOwner @('S-1-5-32-544');Reject {Call CheckDefaultOwner @($sid)} 'trial-token-default-owner-refused';Record 'split-token-user-owned-new-files-refused-SIMULATED-no-token-change'
    Reject {Call CheckAcl @((Acl 'S-1-5-32-545'),$true)} 'trial-untrusted-owner';Record 'user-owned-executor-refused-ACL-SIMULATED'
    foreach($right in @('Write','Delete','DeleteSubdirectoriesAndFiles','ChangePermissions','TakeOwnership')){
        $acl=Acl;$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]$right,'Allow'))
        Reject {Call CheckAcl @($acl,$true)} 'trial-unprotected-path';Record ('unsafe-leaf-'+$right+'-refused-ACL-SIMULATED')
        if($right -cne 'Write'){Reject {Call CheckAcl @($acl,$false)} 'trial-unprotected-path';Record ('replaceable-ancestor-'+$right+'-refused-ACL-SIMULATED')}
    }
    $acl=Acl;$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]::CreateDirectories,'Allow'))
    Call CheckAcl @($acl,$false);Reject {Call CheckAcl @($acl,$true)} 'trial-unprotected-path';Record 'ancestor-create-unrelated-directory-does-not-authorize-replacement-SIMULATED'
    # Actual final-byte hash and filesystem sharing tests, entirely inert.
    $copy=Join-Path $root 'resource.bin';[IO.File]::WriteAllText($copy,'fixed approved resource')
    $digest=(Get-FileHash -LiteralPath $copy).Hash.ToLowerInvariant();$size=(Get-Item $copy).Length
    Call VerifyResource @($copy,$digest,[long]$size);Record 'actual-resource-exact-bytes-accepted'
    [IO.File]::WriteAllText($copy,'replaced resource');Reject {Call VerifyResource @($copy,$digest,[long]$size)} 'resource-hash-mismatch';Record 'actual-replaced-resource-refused'
    $stream=[IO.File]::Open($copy,'Open','Read','Read')
    try{$refused=$false;try{$writer=[IO.File]::Open($copy,'Open','Write','ReadWrite');$writer.Dispose()}catch [IO.IOException]{$refused=$true};Assert $refused 'resource writable while held';Record 'actual-file-sharing-blocks-resource-write'}finally{$stream.Dispose()}
    $dir=Join-Path $root 'held-parent';[IO.Directory]::CreateDirectory($dir)|Out-Null
    $hold=$a.GetType('SetupForm').GetMethod('HoldDirectory',$flags).Invoke($null,@([string]$dir))
    try{$refused=$false;try{[IO.Directory]::Move($dir,($dir+'-replaced'))}catch [IO.IOException]{$refused=$true};Assert $refused 'ancestor replaceable while held';Record 'actual-directory-handle-blocks-ancestor-rename'}finally{$hold.Dispose()}
    foreach($variant in @('candidate','fixture')){
        $item=@($b|Where-Object variant -CEQ $variant)[0];$other=[Reflection.Assembly]::LoadFile($item.exe)
        $refused=$false;try{$other.GetType('TrialBoundary').GetMethod('OpenWorker').Invoke($null,@([string]$root))|Out-Null}catch{$refused=$_.Exception.ToString().Contains('local-candidate-gate')}
        Assert $refused 'nontrial worker authority';Record ($variant+'-compiled-worker-authority-remains-disabled')
        $refused=$false;try{$other.GetType('TrialBoundary').GetMethod('OpenInstallationNamespace').Invoke($null,@())|Out-Null}catch{$refused=$_.Exception.ToString().Contains('local-candidate-gate')}
        Assert $refused 'nontrial installation namespace authority';Record ($variant+'-compiled-installation-namespace-authority-remains-disabled')
    }
    # Exercise the real fresh access callback, not the inert Access replacement.
    Import-Module (Join-Path $build 'candidate/SetupPipeline.psm1') -Force -DisableNameChecking
    Import-Module (Join-Path $build 'candidate/WorkflowTransaction.psm1') -DisableNameChecking
    $adapter=& (Get-Module SetupPipeline) {New-SetupProductionAdapter}
    $scan=Join-Path $root 'scan';[IO.Directory]::CreateDirectory($scan)|Out-Null
    & $adapter.Access (Join-Path $scan 'absent-target') $scan
    Assert (!(Test-Path (Join-Path $scan 'absent-target'))) 'precheck created target';Record 'actual-fresh-access-precheck-absent-target-no-writes'
    $target=Join-Path $scan 'existing-target';[IO.Directory]::CreateDirectory($target)|Out-Null;& $adapter.Access $target $scan;Record 'actual-upgrade-access-precheck-existing-target'
}catch{$failure=$_.ToString();Write-Output $failure}
$report=@{round='R28';success=($null -eq $failure);count=$rows.Count;results=@($rows.ToArray());failure=$failure;root=$root;realUac=$false;realElevation=$false;realProtectedProvisioning=$false;trialSha256=$trial.sha256;runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant();buildReportSha256=(Get-FileHash (Join-Path $build 'build-report.json')).Hash.ToLowerInvariant()}
$file=Join-Path $build ('test-report-R28-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'.json')
[IO.File]::WriteAllText($file,($report|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
if($failure){throw $failure}
Write-Output ('R28 '+$rows.Count+' PASS; real UAC/elevation/protected provisioning NOT RUN')
