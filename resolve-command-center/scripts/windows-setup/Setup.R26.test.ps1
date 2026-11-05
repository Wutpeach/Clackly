[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$build=Join-Path $repo 'resolve-command-center/build/windows-setup-r26'
$closure=Join-Path $build 'fixture'
foreach ($module in @('SetupPipeline','SetupBackend','WorkflowTransaction','ExecutorSupport','Fixture')) {Import-Module (Join-Path $closure ($module+'.psm1')) -DisableNameChecking}
$root=Join-Path (Join-Path ([IO.Path]::GetTempPath()) 'Clackly-R24-Fixtures') ([Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
Write-FixtureText (Join-Path $root '.clackly-r24-fixture') 'INERT R24 ONLY'
Write-FixtureText (Join-Path $root 'scenario.txt') 'upgrade'
$session=@{Id=[Guid]::NewGuid().ToString('N');Root=(Join-Path $root 'session');Sequence=0}
[IO.Directory]::CreateDirectory($session.Root) | Out-Null
$adapter=New-SetupFixtureAdapter $root $session
$old=Get-TreeHash $adapter.Locations.Target
$data=Get-TreeHash $adapter.Locations.DataRoots[0]
$metadata=Read-UpdateJson (Join-Path $closure 'OfficialMetadata.json')
$official=@{id=$metadata.releaseId;tag_name=$metadata.tag;draft=$metadata.draft;prerelease=$metadata.prerelease;assets=$metadata.assets}
$calls=[Collections.Generic.List[string]]::new()
$fetch={param($url) $calls.Add($url);return $official}.GetNewClosure()
$results=@()
function Assert($Value,[string]$Why) {if (!$Value) {throw ('ASSERT '+$Why)}}
$archive=Join-Path $closure 'Workflow.zip'
$verified=Assert-SetupArchive $archive (Join-Path $root 'verified') -Fetch $fetch
Assert ($calls.Count -eq 1 -and $calls[0] -ceq 'https://api.github.com/repos/Wutpeach/Clackly/releases/428867234') 'one fixed official Release GET, no tag lookup'
Assert ($verified.digest -ceq (Get-SetupPin).digest) 'original pinned archive verified'
$results+='single-fixed-release-full-official-archive'
foreach ($bad in @('release','asset','digest')) {
    $copy=$official | ConvertTo-Json -Depth 10 | ConvertFrom-Json
    if ($bad -ceq 'release') {$copy.id=1} elseif ($bad -ceq 'asset') {$copy.assets[0].id=1} else {$copy.assets[0].digest='sha256:'+('0'*64)}
    $badFetch={param($url) return $copy}.GetNewClosure();$refused=$false
    try {Assert-SetupArchive $archive (Join-Path $root ('bad-'+$bad)) -Fetch $badFetch | Out-Null} catch {$refused=$_.Exception.Message -ceq 'publisher-unverified'}
    Assert ($refused -and !(Test-Path -LiteralPath (Join-Path $root ('bad-'+$bad)))) ('mismatched '+$bad+' refused before extraction')
    $results+=('refuses-'+$bad)
}
$adapter.Fetch={param($url) throw [Net.WebException]::new('INERT transport failed',[IO.IOException]::new('INERT inner cause'))}
$r=Invoke-SetupOperation Verify $session $adapter
Assert ($r.status -ceq 'failed' -and ($r.diagnostic | Where-Object {$_.type -ceq 'System.Net.WebException'}) -and ($r.diagnostic | Where-Object {$_.message -ceq 'INERT inner cause'})) 'bounded original error chain retained in failed receipt'
Assert (!(Test-Path -LiteralPath (Join-Path $session.Root 'context.json')) -and !(Test-Path -LiteralPath (Join-Path $session.Root 'baseline.json'))) 'failed Verify cannot prepare an installation'
Assert ((Get-TreeHash $adapter.Locations.Target) -ceq $old -and (Get-TreeHash $adapter.Locations.DataRoots[0]) -ceq $data) 'old tree and excluded data unchanged'
$results+='transport-failure-diagnostic-and-no-mutation'
Write-FixtureJson (Join-Path $build ('test-report-R26-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'.json')) @{success=$true;count=$results.Count;cases=$results;root=$root;buildReportSha256=(Get-UpdateHash (Join-Path $build 'build-report.json'));runnerSha256=(Get-UpdateHash $PSCommandPath)}
Write-Output ('TOTAL '+$results.Count+' PASS')
