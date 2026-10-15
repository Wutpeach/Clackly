Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -Force -DisableNameChecking
$caseRoot=Join-Path (Join-Path ([IO.Path]::GetTempPath()) 'Clackly-TRA25-R3-Path-Fixtures') ([Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($caseRoot) | Out-Null
[IO.File]::WriteAllText((Join-Path $caseRoot '.clackly-test-owner'),'TRA-25 R3 FICTITIOUS PATH/PERFORMANCE FIXTURE')
$results=[Collections.Generic.List[object]]::new()
function Assert-True($Value,[string]$Message) {if (!$Value) {throw $Message}}
function Record([string]$Name) {$results.Add(@{case=$Name;pass=$true}); Write-Output ('PASS '+$Name)}
function Refuses([string]$Path,[switch]$AllowMissing) {
    $accepted=$false
    try {Assert-NormalPath $Path -AllowMissing:$AllowMissing | Out-Null; $accepted=$true} catch {}
    Assert-True (!$accepted) ('accepted unsafe path: '+$Path)
}
$guards=Join-Path $caseRoot 'guards'
[IO.Directory]::CreateDirectory($guards) | Out-Null
$file=Join-Path $guards 'Long Named Artifact.txt'
[IO.File]::WriteAllText($file,'INERT')
Assert-True ((Assert-NormalPath $file) -ceq $file) 'valid existing file refused'
Assert-True ((Assert-NormalPath $file.ToUpperInvariant()) -ieq $file) 'valid Windows case variant refused'
$hidden=Join-Path $guards 'hidden.dat'
[IO.File]::WriteAllText($hidden,'HIDDEN')
[IO.File]::SetAttributes($hidden,[IO.FileAttributes]::Hidden)
Assert-NormalPath $hidden | Out-Null
Record 'existing-case-variant-and-hidden-entry-accepted'
Refuses 'relative.txt'
Refuses ('\\localhost\c$\Clackly-TRA25-R3-DO-NOT-ACCESS')
Refuses ($file+':stream')
Refuses ([IO.Path]::Combine($guards,'nested\..\Long Named Artifact.txt'))
Refuses (Join-Path $guards '*') -AllowMissing
Refuses (Join-Path $guards '?') -AllowMissing
Refuses ($file+'.')
Refuses ($file+' ')
Record 'relative-unc-ads-noncanonical-wildcard-and-trailing-alias-refused'
$missing=Join-Path $guards 'not-created\child.dat'
Assert-True ((Assert-NormalPath $missing -AllowMissing) -ceq $missing) 'safe missing ancestry refused'
Refuses $missing
$leaf=Join-Path $guards 'not-created.dat'
Assert-True ((Assert-NormalPath $leaf -AllowMissing) -ceq $leaf) 'safe missing leaf refused'
Refuses $leaf
Record 'missing-leaf-and-ancestor-only-accepted-with-allowmissing'
$destination=Join-Path $guards 'destination'
[IO.Directory]::CreateDirectory($destination) | Out-Null
$link=Join-Path $guards 'junction'
New-Item -ItemType Junction -Path $link -Target $destination | Out-Null
Refuses $link -AllowMissing
Refuses (Join-Path $link 'child.dat') -AllowMissing
[IO.Directory]::Move($destination,($destination+'.moved'))
Refuses $link -AllowMissing
Record 'existing-and-dangling-reparse-entry-and-ancestry-refused'
$changing=Join-Path $guards 'changing'
[IO.Directory]::CreateDirectory($changing) | Out-Null
Assert-NormalPath $changing | Out-Null
[IO.Directory]::Move($changing,($changing+'.retained'))
New-Item -ItemType Junction -Path $changing -Target ($destination+'.moved') | Out-Null
Refuses $changing -AllowMissing
Record 'fresh-check-detects-postcheck-reparse-swap-without-path-cache'
Add-Type -TypeDefinition @'
using System.Text;
using System.Runtime.InteropServices;
namespace ClacklyPathTest {public static class ShortName {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 public static extern uint GetShortPathName(string path,StringBuilder output,uint size);
}}
'@
$shortBuffer=[Text.StringBuilder]::new(4096)
$length=[ClacklyPathTest.ShortName]::GetShortPathName($file,$shortBuffer,4096)
$shortAliasTested=$false
if ($length -gt 0 -and $shortBuffer.ToString() -ine $file) {
    Refuses $shortBuffer.ToString() -AllowMissing
    $shortAliasTested=$true
    Record 'actual-8dot3-alias-refused-by-real-name-comparison'
} else {Write-Output 'SKIP actual-8dot3-alias: filesystem did not provide a distinct short name'}

$payload=Join-Path $caseRoot 'payload'
[IO.Directory]::CreateDirectory($payload) | Out-Null
$expected=[Collections.Generic.List[object]]::new()
$sha=[Security.Cryptography.SHA256]::Create()
try {
    for ($index=767; $index -ge 0; $index--) {
        $name='payload-{0:D4}.dat' -f $index
        $bytes=[Text.Encoding]::UTF8.GetBytes(('FICTITIOUS FILE '+$index+' ')*32)
        [IO.File]::WriteAllBytes((Join-Path $payload $name),$bytes)
        $digest=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()
        $expected.Add(@{path=$name;size=$bytes.Length;sha256=$digest})
    }
    $names=[string[]]@($expected | ForEach-Object {$_.path}); [Array]::Sort($names,[StringComparer]::Ordinal)
    $reference=[Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
    foreach ($entry in $expected) {$reference.Add($entry.path,$entry)}
    $lines=@(foreach ($name in $names) {'{0}:{1}:{2}' -f $name,$reference[$name].size,$reference[$name].sha256})
    $expectedText=$lines -join [string][char]10
    $expectedHash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($expectedText)))).Replace('-','').ToLowerInvariant()
} finally {$sha.Dispose()}
$clock=[Diagnostics.Stopwatch]::StartNew()
$actual=Get-TreeHash $payload
$clock.Stop(); $elapsed=$clock.ElapsedMilliseconds
Assert-True ($actual -ceq $expectedHash) 'full inventory ordering/hash changed'
Assert-True ($elapsed -lt 30000) ('768-file path/hash fixture exceeded 30s bound: '+$elapsed+'ms')
Record '768-file-full-tree-ordinal-hash-identical-and-under-30seconds'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$evidence=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../build/test-evidence/path-performance'))
[IO.Directory]::CreateDirectory($evidence) | Out-Null
$output=Join-Path $evidence ((Split-Path -Leaf $caseRoot)+'.json')
[IO.File]::WriteAllText($output,(@{schemaVersion=1;fixtureRoot=$caseRoot;fileCount=768;elapsedMs=$elapsed;treeHash=$actual;shortAliasTested=$shortAliasTested;
    cases=@($results.ToArray());productionQualified=$false} | ConvertTo-Json -Depth 8))
Write-Output ('PERFORMANCE '+$elapsed+'ms for 768 files')
Write-Output ('EVIDENCE '+$output)
