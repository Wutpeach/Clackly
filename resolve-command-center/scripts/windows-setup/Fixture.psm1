Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'SetupQualification.psm1') -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'SetupBackend.psm1') -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'ExecutorSupport.psm1') -DisableNameChecking
function Write-FixtureText([string]$Path,[string]$Text) {
    Assert-NormalPath $Path -AllowMissing | Out-Null;[IO.Directory]::CreateDirectory((Split-Path -Parent $Path)) | Out-Null;Assert-NormalPath $Path -AllowMissing | Out-Null
    $file=[IO.File]::Open($Path,'OpenOrCreate','ReadWrite','None')
    try {Assert-SetupLockFile $file;$bytes=[Text.Encoding]::UTF8.GetBytes($Text);$file.SetLength(0);$file.Write($bytes,0,$bytes.Length);$file.Flush($true)} finally {$file.Dispose()}
}
function Write-FixtureJson([string]$Path,$Value) {Write-FixtureText $Path ($Value | ConvertTo-Json -Depth 14)}
function New-SetupFixture([string]$Root,[string]$Id) {
    $Root=Assert-NormalPath $Root
    Assert-NormalPath (Join-Path $Root '.clackly-r24-fixture') | Out-Null
    $allowed=Join-Path ([IO.Path]::GetTempPath()) 'Clackly-R24-Fixtures'
    if (!$Root.StartsWith($allowed+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.File]::ReadAllText((Join-Path $Root '.clackly-r24-fixture')) -cne 'INERT R24 ONLY') {throw 'fixture-root-refused'}
    $scan=Join-Path $Root 'scan';$target=Join-Path $scan 'com.wutpeach.clackly';$payload=Join-Path $Root 'payload'
    foreach ($dir in @($scan,$target,$payload,($scan+'.Clackly Updates'))) {Assert-NormalPath $dir -AllowMissing | Out-Null;[IO.Directory]::CreateDirectory($dir) | Out-Null;Assert-NormalPath $dir | Out-Null}
    Write-FixtureText (Join-Path $target 'old.txt') 'FULL OLD TREE - DO NOT EXECUTE'
    Write-FixtureText (Join-Path $target 'workflow-plugin/WorkflowIntegration.node') 'INERT OLD NATIVE - NEVER LOAD'
    Write-FixtureJson (Join-Path $target 'package.json') @{name='clackly';version='0.1.2'}
    Write-FixtureText (Join-Path $target 'manifest.xml') '<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>0.1.2</Version><FilePath>workflow-plugin/main.js</FilePath></Plugin></BlackmagicDesign>'
    Write-FixtureText (Join-Path $Root 'AppData/preferences.json') '{"retained":true}'
    Write-FixtureText (Join-Path $scan 'neighbor/sentinel') 'RETAIN NEIGHBOR'
    Write-FixtureJson (Join-Path $payload 'package.json') @{name='clackly';version='0.1.3'}
    Write-FixtureText (Join-Path $payload 'manifest.xml') '<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>0.1.3</Version><FilePath>workflow-plugin/main.js</FilePath></Plugin></BlackmagicDesign>'
    Write-FixtureText (Join-Path $payload 'workflow-plugin/main.js') 'const PLUGIN_ID = "com.wutpeach.clackly"; // INERT NEVER EXECUTE'
    Write-FixtureText (Join-Path $payload 'dist/renderer/index.html') '<p>INERT FIXTURE</p>'
    foreach ($name in @('python.exe','python314.dll','python314.zip','python314._pth','LICENSE.txt','THIRD_PARTY_NOTICES.md','python-embed.sigstore','python-embed.spdx.json','application.spdx.json','clackly/bootstrap.py','clackly/persistent_bootstrap.py','clackly/python_runner.py')) {Write-FixtureText (Join-Path $payload ('resources/runtimes/inert/'+$name)) 'INERT RUNTIME NEVER EXECUTE'}
    $prefix='resources/runtimes/inert/'
    Write-FixtureJson (Join-Path $payload ($prefix+'python.lock.json')) @{profileId='inert';version='3.14.4';asset=@{sha256=('c'*64)}}
    $lockHash=Get-UpdateHash (Join-Path $payload ($prefix+'python.lock.json'))
    Write-FixtureJson (Join-Path $payload ($prefix+'runtime.json')) @{runtimeVersion='3.14.4';source=@{sha256=('c'*64)};build=@{lockSha256=$lockHash;applicationSources=@(@{path='clackly/bootstrap.py';sha256=(Get-UpdateHash (Join-Path $payload ($prefix+'clackly/bootstrap.py')) )})}}
    Write-FixtureJson (Join-Path $payload 'resources/runtimes/manifest.json') @{schemaVersion=1;profiles=@(@{id='inert';runtimeVersion='3.14.4';platform='win32';architecture='x64';executable='inert/python.exe'})}
    foreach ($name in @('electron/main/update/UpdateService.js','scripts/workflow-update/WorkflowTransaction.psm1','scripts/workflow-update/executor.ps1','scripts/workflow-update/launch.ps1','scripts/workflow-update/recover.ps1')) {Write-FixtureText (Join-Path $payload $name) '// INERT NEVER EXECUTE'}
    Write-FixtureJson (Join-Path $payload 'clackly-release.json') @{schemaVersion=2;package=@{id='com.wutpeach.clackly';name='clackly';version='0.1.3';platform='win32';arch='x64';entrypoint='workflow-plugin/main.js'};source=@{repository='Wutpeach/Clackly';tag='v0.1.3';commit=('a'*40);dirty=$false;workflowPath='.github/workflows/workflow-release.yml'};build=@{publishable=$true};runtime=@{manifestPath='resources/runtimes/manifest.json';manifestSha256=(Get-UpdateHash (Join-Path $payload 'resources/runtimes/manifest.json'));profiles=@(@{id='inert';version='3.14.4';lockPath=($prefix+'python.lock.json');lockSha256=$lockHash})};native=@{path='workflow-plugin/WorkflowIntegration.node';provisioning='local-resolve';source='programdata-sampleplugin';platform='win32';arch='x64'};files=@(Get-TreeFiles $payload)}
    $context=@{Id=$Id;ScanRoot=$scan;TransactionRoot=($scan+'.Clackly Updates');Target=$target;PackageRoot=$payload;Version='0.1.3';Digest=('b'*64);Size=12345;InitialInstall=$true;ResolveExecutable=(Join-Path $Root 'INERT-Resolve.exe');WorkflowExecutable=(Join-Path $Root 'INERT-electron.exe')}
    $locations=@{Scan=$scan;Target=$target;Transactions=$context.TransactionRoot;LegacyTransactions=($scan+'.Clackly Transactions');HistoricalBackups=(Join-Path $Root 'Support/Clackly Install Backups');Inbox=(Join-Path $Root 'inbox');Pointers=@((Join-Path $Root 'cache/installation.json'));DataRoots=@((Join-Path $Root 'AppData'))}
    return @{Context=$context;Locations=$locations;OldHash=(Get-TreeHash $target);OldFiles=@(Get-TreeFiles $target)}
}
function Copy-InertSetupNative([string]$Root,[string]$Workflow) {
    $path=Join-Path $Root 'workflow-plugin/WorkflowIntegration.node';Write-FixtureText $path 'INERT NATIVE NEVER LOAD'
    return @{path='workflow-plugin/WorkflowIntegration.node';size=(Get-Item -LiteralPath $path).Length;sha256=(Get-UpdateHash $path)}
}
function New-SetupFixtureAdapter([string]$Root,$Session,[switch]$Inspect) {
    $allowed=Join-Path ([IO.Path]::GetTempPath()) 'Clackly-R24-Fixtures'
    $Root=Assert-NormalPath $Root
    if (!$Root.StartsWith($allowed+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.File]::ReadAllText((Join-Path $Root '.clackly-r24-fixture')) -cne 'INERT R24 ONLY') {throw 'fixture-root-refused'}
    $scan=Join-Path $Root 'scan';$target=Join-Path $scan 'com.wutpeach.clackly'
    $locations=@{Scan=$scan;Target=$target;Transactions=($scan+'.Clackly Updates');LegacyTransactions=($scan+'.Clackly Transactions');HistoricalBackups=(Join-Path $Root 'Support/Clackly Install Backups');Inbox=(Join-Path $Root 'inbox');Pointers=@((Join-Path $Root 'cache/installation.json'));DataRoots=@((Join-Path $Root 'AppData'))}
    $scenario=[IO.File]::ReadAllText((Join-Path $Root 'scenario.txt')).Trim()
        if (!$Inspect) {
        $f=New-SetupFixture $Root $Session.Id
        if ($scenario -ceq 'fresh') {
            $verified=Assert-NormalPath $target
            if ($verified -cne (Join-Path $Root 'scan/com.wutpeach.clackly').Replace('/','\')) {throw 'fixture-root-refused'}
            Remove-Item -LiteralPath $verified -Recurse -Force
        }
        # Synthetic settings and DPAPI-labelled bytes are never decrypted/loaded.
        Write-FixtureText (Join-Path $Root 'AppData/secret.dpapi') 'INERT DPAPI BYTES - NEVER DECRYPT'
        if ($scenario -cin @('orphan','orphan-drift')) {
            $oldId='1'*32;$pin=Get-SetupPin
            $pointer=@{schemaVersion=1;id=$oldId;version=$pin.version;digest=$pin.digest;size=$pin.size}
            $request=@{};foreach ($key in $pointer.Keys) {$request[$key]=$pointer[$key]}
            $request.releaseId=$pin.releaseId;$request.assetId=$pin.assetId;$request.workflowExecutable=Join-Path $Root 'INERT-electron.exe'
            $requestRoot=Join-Path $locations.Inbox $oldId
            Write-FixtureJson $locations.Pointers[0] $pointer;Write-FixtureJson (Join-Path $requestRoot 'request.json') $request
            [IO.File]::Copy((Join-Path $PSScriptRoot 'Workflow.zip'),(Join-Path $requestRoot 'candidate.zip'),$false)
        }
        Write-FixtureJson (Join-Path $Session.Root 'fixture-baseline.json') @{oldHash=(Get-SetupArtifact $target).hash;fixture=$true}
        if ($scenario -ceq 'orphan-drift') {Write-FixtureText (Join-Path $Root 'AppData/preferences.json') 'DRIFT'}
    }
    $metadata=Read-UpdateJson (Join-Path $PSScriptRoot 'OfficialMetadata.json')
    $official=@{id=$metadata.releaseId;tag_name=$metadata.tag;draft=$metadata.draft;prerelease=$metadata.prerelease;assets=$metadata.assets}
    $observe={param($c)
        if ($scenario -ceq 'host-unknown') {return 'process-unknown'}
        if (Test-Path -LiteralPath (Join-Path $Root 'host.json')) {
            $record=Read-UpdateJson (Join-Path $Root 'host.json') 65536;$process=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
            if ($process) {
                $actualImage=$process.MainModule.FileName
                if ($process.StartTime.ToUniversalTime().ToString('o') -cne $record.created -or $actualImage -cne $record.image) {return 'process-unknown'}
                return 'host-running'
            }
        }
        return 'closed'
    }.GetNewClosure()
    $provision={param($stage,$workflow) if ($scenario -ceq 'native-failure') {throw 'native-invalid'};Copy-InertSetupNative $stage $workflow}.GetNewClosure()
    $checkpoint={param($point)
        if ($point -ceq 'backup-intent') {Start-Sleep -Milliseconds 800}
        if ($scenario -ceq 'rollback' -and $point -ceq 'after-activation') {throw 'inert-rollback'}
        if ($scenario -ceq 'before-backup' -and $point -ceq 'after-stage') {throw 'inert-before-backup'}
        if ($scenario -ceq 'after-backup' -and $point -ceq 'after-backup') {throw 'inert-after-backup'}
        if ($scenario -ceq 'cancel-after' -and $point -ceq 'backup-intent') {Write-FixtureText (Join-Path $Session.Root 'cancel.request') 'late inert cancel'}
    }.GetNewClosure()
    $supportModule=Get-Module ExecutorSupport
    $access={param($t,$s)
        if ($scenario -cin @('permission','uac-denied')) {throw [UnauthorizedAccessException]::new('INERT permission denial')}
        if ($scenario -ceq 'uac-cancelled') {throw [ComponentModel.Win32Exception]::new(1223)}
        & $supportModule {param($targetPath,$scanPath) Assert-UpdateWriteAccess $targetPath $scanPath} $t $s
    }.GetNewClosure()
    return @{Pair={@{ResolveExecutable=(Join-Path $Root 'INERT-Resolve.exe');WorkflowExecutable=(Join-Path $Root 'INERT-electron.exe')}}.GetNewClosure();Kind='inert';Root=$Root;Locations=$locations;Observe=$observe;Provision=$provision;Checkpoint=$checkpoint;Access=$access;Fetch={$official}.GetNewClosure()}
}
Export-ModuleMember -Function Write-FixtureText,Write-FixtureJson,New-SetupFixture,Copy-InertSetupNative,New-SetupFixtureAdapter
