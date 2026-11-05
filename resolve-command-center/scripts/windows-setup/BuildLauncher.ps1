function Build-SetupLauncher($Repo,$Output,$Core,$SourceMap) {
    $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    if (!(Test-Path -LiteralPath $vswhere)) {throw 'native-build-tools-unavailable'}
    $vs=@(& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
    if ($vs.Count -ne 1) {throw 'native-build-tools-unavailable'}
    $vcvars=Join-Path $vs[0] 'VC/Auxiliary/Build/vcvars64.bat'
    $source=Join-Path $PSScriptRoot 'SetupLauncher.cpp'
    $rows=@()
    foreach ($variant in @('launcher','native-fixture')) {
        $closure=Join-Path $Output $variant;[IO.Directory]::CreateDirectory($closure)|Out-Null
        $header=Join-Path $closure 'trial-pin.h'
        $fixture=Join-Path $Output 'Clackly-Setup-0.1.3-win-x64-INERT-FIXTURE.exe'
        $lines=@(('#define TRIAL_CORE_SHA256 L"'+$Core.sha256+'"'),('#define TRIAL_CORE_BUILD_PATH L"'+$Core.exe.Replace('\','\\')+'"'),('#define TRIAL_FIXTURE_BUILD_PATH L"'+$fixture.Replace('\','\\')+'"'))
        [IO.File]::WriteAllLines($header,$lines,[Text.UTF8Encoding]::new($false))
        $name=if($variant -ceq 'launcher'){'Clackly-Setup-0.1.3-win-x64-CONTROLLED-LAUNCHER.exe'}else{'Clackly-Setup-0.1.3-win-x64-NATIVE-INERT-TEST.exe'}
        $exe=Join-Path $Output $name;$obj=Join-Path $closure 'launcher.obj'
        $define=if($variant -ceq 'native-fixture'){'/DINERT_TEST /link /SUBSYSTEM:CONSOLE'}else{'/link /SUBSYSTEM:WINDOWS'}
        $command='cl.exe /nologo /std:c++17 /EHsc /MT /W4 /WX /wd4505 /utf-8 /O2 /GS /guard:cf /DUNICODE /D_UNICODE /I"'+$closure+'" /Fo:"'+$obj+'" /Fe:"'+$exe+'" "'+$source+'" '+$define+' /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA /GUARD:CF /MANIFEST:EMBED /MANIFESTINPUT:"'+(Join-Path $PSScriptRoot 'setup.manifest')+'"'
        $script=Join-Path $closure 'compile.cmd'
        [IO.File]::WriteAllLines($script,@('@echo off',('set "PATH='+(Split-Path -Parent $vswhere)+';%PATH%"'),('call "'+$vcvars+'" >nul'),'if errorlevel 1 exit /b 1',$command,'exit /b %errorlevel%'),[Text.UTF8Encoding]::new($false))
        & $env:ComSpec /d /c $script *> (Join-Path $closure 'compile.log')
        if($LASTEXITCODE -ne 0){throw ('native-build-failed: '+$variant+'; see '+(Join-Path $closure 'compile.log'))}
        $identity=@{schemaVersion=1;variant=$variant;native=$true;productionMutationEnabled=$false;canRequestElevation=($variant -ceq 'launcher');unsigned=$true;asInvoker=$true;coreSha256=$Core.sha256;headerSha256=(Get-FileHash $header).Hash.ToLowerInvariant();sources=$SourceMap;resources=@();compiler='MSVC x64 /MT'}
        $rows+=@{variant=$variant;exe=$exe;size=(Get-Item $exe).Length;sha256=(Get-FileHash $exe).Hash.ToLowerInvariant();identity=$identity}
    }
    return $rows
}
