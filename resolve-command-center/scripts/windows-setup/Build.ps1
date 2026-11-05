[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Archive,
    [Parameter(Mandatory=$true)][string]$FixtureMetadata
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$output=Join-Path $repo 'resolve-command-center/build/windows-setup-r29'
[IO.Directory]::CreateDirectory($output) | Out-Null
if (Test-Path -LiteralPath (Join-Path $output 'build-report.json')) {
    $retained=Join-Path $output ('attempts/'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'-'+[Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($retained) | Out-Null
    foreach ($name in @('build-report.json','Clackly-Setup-0.1.3-win-x64-LOCAL-CANDIDATE.exe','Clackly-Setup-0.1.3-win-x64-INERT-FIXTURE.exe','Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.exe','Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.dll','Clackly-Setup-0.1.3-win-x64-CONTROLLED-LAUNCHER.exe','Clackly-Setup-0.1.3-win-x64-NATIVE-INERT-TEST.exe','candidate','fixture','trial','launcher','native-fixture')) {
        $path=Join-Path $output $name;if (Test-Path -LiteralPath $path) {Copy-Item -LiteralPath $path -Destination $retained -Recurse}
    }
}
$archive=[IO.Path]::GetFullPath($Archive)
$fixtureMetadata=[IO.Path]::GetFullPath($FixtureMetadata)
if ((Get-Item -LiteralPath $archive).Length -ne 32601075 -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne '425ea8981965c998530e0aa3f8416032c17172c136e6f92f14f577f26621a640') {throw 'official-original-archive-mismatch'}
$csc=Join-Path ([Environment]::GetFolderPath('Windows')) 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=@('Setup.cs','SetupLaunch.cs','Setup.R28.test.ps1','setup.manifest','Build.ps1','SetupBackend.psm1','SetupEntry.ps1','Fixture.psm1','FixtureEntry.ps1','Setup.test.ps1','README.md','SetupPipeline.psm1','SetupQualification.psm1','Setup.R24.test.ps1','Setup.R26.test.ps1','Setup.R27.test.ps1','SetupTrust.psm1','SetupMonitor.psm1','Setup.Monitor.test.ps1')
$sources+=@('BuildLauncher.ps1','SetupLauncher.cpp','SetupHandoff.h','Setup.Native.test.ps1','Setup.R29.test.ps1')
$sourceMap=@($sources | ForEach-Object { $file=Join-Path $PSScriptRoot $_;if (!(Test-Path -LiteralPath $file)) {throw 'setup-source-missing'};@{path=$file.Substring($repo.Length+1).Replace('\','/');size=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()} })
$builds=@()
foreach ($variant in @('candidate','fixture','trial')) {
    $closure=Join-Path $output $variant
    [IO.Directory]::CreateDirectory($closure) | Out-Null
    $inputs=@{
        'SetupBackend.psm1'=(Join-Path $PSScriptRoot 'SetupBackend.psm1')
        'SetupPipeline.psm1'=(Join-Path $PSScriptRoot 'SetupPipeline.psm1')
        'SetupQualification.psm1'=(Join-Path $PSScriptRoot 'SetupQualification.psm1')
        'SetupTrust.psm1'=(Join-Path $PSScriptRoot 'SetupTrust.psm1')
        'SetupEntry.ps1'=(Join-Path $PSScriptRoot 'SetupEntry.ps1')
        'WorkflowTransaction.psm1'=(Join-Path $PSScriptRoot '../workflow-update/WorkflowTransaction.psm1')
        'ExecutorSupport.psm1'=(Join-Path $PSScriptRoot '../workflow-update/ExecutorSupport.psm1')
        'LocalNative.psm1'=(Join-Path $PSScriptRoot '../workflow-update/LocalNative.psm1')
        'Workflow.zip'=$archive
    }
    if ($variant -ceq 'fixture') {$inputs['SetupEntry.ps1']=Join-Path $PSScriptRoot 'FixtureEntry.ps1';$inputs['Fixture.psm1']=Join-Path $PSScriptRoot 'Fixture.psm1';$inputs['OfficialMetadata.json']=$fixtureMetadata}
    $records=@();$args=@('/nologo','/platform:x64','/optimize+','/codepage:65001','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll')
    if($variant -ceq 'trial'){$args+='/target:library'}else{$args+='/target:winexe';$args+=('/win32manifest:'+(Join-Path $PSScriptRoot 'setup.manifest'))}
    if ($variant -ceq 'fixture') {$args+='/define:FIXTURE'}
    if ($variant -ceq 'trial') {$args+='/define:CONTROLLED_TRIAL'}
    foreach ($name in @($inputs.Keys | Sort-Object)) {
        $source=[IO.Path]::GetFullPath($inputs[$name]);$dest=Join-Path $closure $name
        [IO.File]::Copy($source,$dest,$true)
        $transform='none'
        if ($variant -ceq 'trial' -and $name -ceq 'SetupBackend.psm1') {
            $text=[IO.File]::ReadAllText($dest);$gate='$script:ProductionMutationEnabled=$false'
            if (($text.Split([string[]]@($gate),[StringSplitOptions]::None)).Count -ne 2) {throw 'trial-gate-source-mismatch'}
            [IO.File]::WriteAllText($dest,$text.Replace($gate,'$script:ProductionMutationEnabled=$true'),[Text.UTF8Encoding]::new($true));$transform='compile-time-controlled-trial-gate'
        }
        $row=@{resource=$name;size=(Get-Item -LiteralPath $dest).Length;sha256=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant();transform=$transform;sourceSha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant();source=$(if ($source.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)) {$source.Substring($repo.Length+1).Replace('\','/')} else {[IO.Path]::GetFileName($source)})}
        $records+=$row;$args+=('/resource:'+$dest+','+$name)
    }
    $mapping=Join-Path $closure 'map.tsv'
    [IO.File]::WriteAllLines($mapping,[string[]]@($records | ForEach-Object {$_.sha256+'|'+$_.size+'|'+$_.resource}),[Text.UTF8Encoding]::new($false))
    $identity=@{schemaVersion=1;variant=$variant;productionMutationEnabled=$false;unsigned=$true;asInvoker=$true;framework='.NET Framework 4.x x64';compiler=$csc;resources=$records;sources=$sourceMap;sourceHead=(& git -C $repo rev-parse HEAD);official=@{releaseId=428867234;assetId=691653752;version='0.1.3';commit='a2315fb20225beb919f1c6c4d1a80d04dc7e9cd9';size=32601075;sha256='425ea8981965c998530e0aa3f8416032c17172c136e6f92f14f577f26621a640'}}
    $identityFile=Join-Path $closure 'build-identity.json'
    $identity.productionMutationEnabled=($variant -ceq 'trial');$identity['trialRequiresProtectedLocationAndToken']=($variant -ceq 'trial')
    $identity.asInvoker=($variant -cne 'trial');$identity['artifactKind']=$(if($variant -ceq 'trial'){'native-hosted-managed-library'}else{'managed-executable'})
    $name=if ($variant -ceq 'fixture') {'Clackly-Setup-0.1.3-win-x64-INERT-FIXTURE.exe'} elseif ($variant -ceq 'trial') {'Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.dll'} else {'Clackly-Setup-0.1.3-win-x64-LOCAL-CANDIDATE.exe'}
    $exe=Join-Path $output $name
    [IO.File]::WriteAllText($identityFile,($identity | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
    $args+=('/resource:'+$mapping+',ResourceMap');$args+=('/resource:'+$identityFile+',BuildIdentity');$args+=('/out:'+$exe);$args+=(Join-Path $PSScriptRoot 'Setup.cs');$args+=(Join-Path $PSScriptRoot 'SetupLaunch.cs')
    & $csc @args
    if ($LASTEXITCODE -ne 0) {throw 'csc-build-failed'}
    $builds+=@{variant=$variant;exe=$exe;size=(Get-Item -LiteralPath $exe).Length;sha256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant();identity=$identity}
}
. (Join-Path $PSScriptRoot 'BuildLauncher.ps1')
$core=@($builds | Where-Object variant -CEQ 'trial')[0]
$builds+=@(Build-SetupLauncher $repo $output $core $sourceMap)
[IO.File]::WriteAllText((Join-Path $output 'build-report.json'),($builds | ConvertTo-Json -Depth 14),[Text.UTF8Encoding]::new($false))
$builds | ForEach-Object {Write-Output ($_.variant+' '+$_.size+' '+$_.sha256)}
