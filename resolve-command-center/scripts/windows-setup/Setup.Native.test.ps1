[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BuildDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$build=[IO.Path]::GetFullPath($BuildDirectory)
$identity=Get-Content (Join-Path $build 'build-report.json') -Raw|ConvertFrom-Json
$test=@($identity|Where-Object variant -CEQ 'native-fixture')[0]
$core=@($identity|Where-Object variant -CEQ 'trial')[0]
$launcher=@($identity|Where-Object variant -CEQ 'launcher')[0]
foreach($artifact in @($test,$core,$launcher)){if((Get-FileHash -LiteralPath $artifact.exe).Hash.ToLowerInvariant() -cne $artifact.sha256){throw 'native-artifact-drift'}}
if($launcher.identity.coreSha256 -cne $core.sha256 -or $test.identity.coreSha256 -cne $core.sha256){throw 'native-core-pin-drift'}
$root=Join-Path ([IO.Path]::GetTempPath()) ('Clackly-R24-Fixtures/'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
[IO.File]::WriteAllText((Join-Path $root '.clackly-r24-fixture'),'INERT R24 ONLY')
$info=[Diagnostics.ProcessStartInfo]::new($test.exe,'"'+$root+'"');$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$child=[Diagnostics.Process]::Start($info);$stdout=$child.StandardOutput.ReadToEnd();$stderr=$child.StandardError.ReadToEnd()
if(!$child.WaitForExit(30000)){throw 'native-inert-timeout-preserve-process'}
$passed=@($stdout -split "`r?`n"|Where-Object{$_ -like 'PASS *'})
$report=@{round='R29-Native';success=($child.ExitCode -eq 0);count=$passed.Count;exitCode=$child.ExitCode;root=$root;stdout=$stdout;stderr=$stderr;coreSha256=$core.sha256;launcherSha256=$launcher.sha256;testSha256=$test.sha256;realUac=$false;realElevation=$false;realProtectedProvisioning=$false;runnerSha256=(Get-FileHash $PSCommandPath).Hash.ToLowerInvariant();buildReportSha256=(Get-FileHash (Join-Path $build 'build-report.json')).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $build ('test-report-Native-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'.json')),($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Write-Output $stdout
if(!$report.success){throw 'native-inert-failed'}
