[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$output=Join-Path $repo 'resolve-command-center/build/windows-setup-r24'
[IO.Directory]::CreateDirectory($output) | Out-Null
if (Test-Path -LiteralPath (Join-Path $output 'build-report.json')) {
    $retained=Join-Path $output ('attempts/'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'-'+[Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($retained) | Out-Null
    foreach ($name in @('build-report.json','Clackly-Setup-0.1.3-win-x64-LOCAL-CANDIDATE.exe','Clackly-Setup-0.1.3-win-x64-INERT-FIXTURE.exe','candidate','fixture')) {
        $path=Join-Path $output $name;if (Test-Path -LiteralPath $path) {Copy-Item -LiteralPath $path -Destination $retained -Recurse}
    }
}
$archive=Join-Path $repo '.trellis/tasks/10-30-tra-25-r19-official-release/public-download/Clackly-Workflow-0.1.3-win-x64.zip'
if ((Get-Item -LiteralPath $archive).Length -ne 32601075 -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne '425ea8981965c998530e0aa3f8416032c17172c136e6f92f14f577f26621a640') {throw 'official-original-archive-mismatch'}
$csc=Join-Path ([Environment]::GetFolderPath('Windows')) 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=@('Setup.cs','setup.manifest','Build.ps1','SetupBackend.psm1','SetupEntry.ps1','Fixture.psm1','FixtureEntry.ps1','Setup.test.ps1','README.md','SetupPipeline.psm1','SetupQualification.psm1','Setup.R24.test.ps1','SetupMonitor.psm1','Setup.Monitor.test.ps1')
$sourceMap=@($sources | ForEach-Object { $file=Join-Path $PSScriptRoot $_;if (!(Test-Path -LiteralPath $file)) {throw 'setup-source-missing'};@{path=$file.Substring($repo.Length+1).Replace('\','/');size=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()} })
$builds=@()
foreach ($variant in @('candidate','fixture')) {
    $closure=Join-Path $output $variant
    [IO.Directory]::CreateDirectory($closure) | Out-Null
    $inputs=@{
        'SetupBackend.psm1'=(Join-Path $PSScriptRoot 'SetupBackend.psm1')
        'SetupPipeline.psm1'=(Join-Path $PSScriptRoot 'SetupPipeline.psm1')
        'SetupQualification.psm1'=(Join-Path $PSScriptRoot 'SetupQualification.psm1')
        'SetupEntry.ps1'=(Join-Path $PSScriptRoot 'SetupEntry.ps1')
        'WorkflowTransaction.psm1'=(Join-Path $PSScriptRoot '../workflow-update/WorkflowTransaction.psm1')
        'ExecutorSupport.psm1'=(Join-Path $PSScriptRoot '../workflow-update/ExecutorSupport.psm1')
        'LocalNative.psm1'=(Join-Path $PSScriptRoot '../workflow-update/LocalNative.psm1')
        'Workflow.zip'=$archive
    }
    if ($variant -ceq 'fixture') {$inputs['SetupEntry.ps1']=Join-Path $PSScriptRoot 'FixtureEntry.ps1';$inputs['Fixture.psm1']=Join-Path $PSScriptRoot 'Fixture.psm1';$inputs['OfficialMetadata.json']=Join-Path $repo '.trellis/tasks/10-30-tra-25-r22-setup-production-path/r24/official-source-readback.json'}
    $records=@();$args=@('/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll',('/win32manifest:'+(Join-Path $PSScriptRoot 'setup.manifest')))
    if ($variant -ceq 'fixture') {$args+='/define:FIXTURE'}
    foreach ($name in @($inputs.Keys | Sort-Object)) {
        $source=[IO.Path]::GetFullPath($inputs[$name]);$dest=Join-Path $closure $name
        [IO.File]::Copy($source,$dest,$true)
        $row=@{resource=$name;size=(Get-Item -LiteralPath $source).Length;sha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant();source=$source.Substring($repo.Length+1).Replace('\','/')}
        $records+=$row;$args+=('/resource:'+$dest+','+$name)
    }
    $mapping=Join-Path $closure 'map.tsv'
    [IO.File]::WriteAllLines($mapping,[string[]]@($records | ForEach-Object {$_.sha256+'|'+$_.size+'|'+$_.resource}),[Text.UTF8Encoding]::new($false))
    $identity=@{schemaVersion=1;variant=$variant;productionMutationEnabled=$false;unsigned=$true;asInvoker=$true;framework='.NET Framework 4.x x64';compiler=$csc;resources=$records;sources=$sourceMap;sourceHead=(& git -C $repo rev-parse HEAD);official=@{releaseId=428867234;assetId=691653752;version='0.1.3';commit='a2315fb20225beb919f1c6c4d1a80d04dc7e9cd9';size=32601075;sha256='425ea8981965c998530e0aa3f8416032c17172c136e6f92f14f577f26621a640'}}
    $identityFile=Join-Path $closure 'build-identity.json'
    [IO.File]::WriteAllText($identityFile,($identity | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
    $name=if ($variant -ceq 'fixture') {'Clackly-Setup-0.1.3-win-x64-INERT-FIXTURE.exe'} else {'Clackly-Setup-0.1.3-win-x64-LOCAL-CANDIDATE.exe'}
    $exe=Join-Path $output $name
    $args+=('/resource:'+$mapping+',ResourceMap');$args+=('/resource:'+$identityFile+',BuildIdentity');$args+=('/out:'+$exe);$args+=(Join-Path $PSScriptRoot 'Setup.cs')
    & $csc @args
    if ($LASTEXITCODE -ne 0) {throw 'csc-build-failed'}
    $builds+=@{variant=$variant;exe=$exe;size=(Get-Item -LiteralPath $exe).Length;sha256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant();identity=$identity}
}
[IO.File]::WriteAllText((Join-Path $output 'build-report.json'),($builds | ConvertTo-Json -Depth 14),[Text.UTF8Encoding]::new($false))
$builds | ForEach-Object {Write-Output ($_.variant+' '+$_.size+' '+$_.sha256)}
