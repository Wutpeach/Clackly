Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -DisableNameChecking

# Internal read-only evidence, never cleanup permission. Production has no proof
# input. Fixture snapshots/proof are constructed only under its marked root.
function Assert-SetupLockFile([IO.FileStream]$Lock) {
    if (!('Clackly.SetupLockIdentity' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace Clackly { public static class SetupLockIdentity {
 [StructLayout(LayoutKind.Sequential)] struct Info {
  public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
  public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
 }
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h, out Info i);
 public static bool IsRegular(FileStream stream) {
  Info i; return GetFileInformationByHandle(stream.SafeFileHandle,out i) && i.Links==1 && (i.Attributes & 0x410)==0;
 }
}}
'@
    }
    if (![Clackly.SetupLockIdentity]::IsRegular($Lock)) {throw 'recovery-required'}
}
function Get-SetupCurrentVersion([string]$Target) {
    Assert-NormalPath $Target -AllowMissing | Out-Null
    if (!(Test-Path -LiteralPath $Target)) {return '未安装'}
    $pkg=Read-UpdateJson (Join-Path $Target 'package.json') 65536
    $xmlPath=Assert-NormalPath (Join-Path $Target 'manifest.xml')
    if ((Get-Item -LiteralPath $xmlPath).Length -gt 65536) {throw 'target-unverified'}
    [xml]$xml=[IO.File]::ReadAllText($xmlPath)
    if ($pkg.name -cne 'clackly' -or $pkg.version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
        $xml.BlackmagicDesign.Plugin.Id -cne 'com.wutpeach.clackly' -or
        $xml.BlackmagicDesign.Plugin.Version -cne $pkg.version -or
        $xml.BlackmagicDesign.Plugin.FilePath -cne 'workflow-plugin/main.js') {throw 'target-unverified'}
    return $pkg.version
}
function Get-SetupEvidenceHash($Value) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try {return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Value -Depth 20 -Compress))))).Replace('-','').ToLowerInvariant()} finally {$sha.Dispose()}
}
function Get-SetupArtifact([string]$Path) {
    Assert-NormalPath $Path -AllowMissing | Out-Null
    if (!(Test-Path -LiteralPath $Path)) {return @{path=$Path;kind='absent';hash='absent';files=@()}}
    $item=Get-Item -LiteralPath $Path -Force
    [object[]]$files=if ($item.PSIsContainer) {@(Get-TreeFiles $Path)} else {@(@{path='';size=$item.Length;sha256=(Get-UpdateHash $Path)})}
    foreach ($file in $files) {
        $name=if ($item.PSIsContainer) {Join-Path $Path $file.path} else {$Path}
        $held=[IO.File]::Open($name,'Open','Read','Read');try {Assert-SetupLockFile $held} finally {$held.Dispose()}
    }
    return @{path=$Path;kind=$(if ($item.PSIsContainer) {'directory'} else {'file'});hash=$(if ($item.PSIsContainer) {Get-TreeHash $Path} else {$files[0].sha256});files=$files}
}
function Get-SetupNamespace([string]$Path) {
    Assert-NormalPath $Path -AllowMissing | Out-Null
    $present=Test-Path -LiteralPath $Path;$entries=@()
    if ($present) {
        if (!(Get-Item -LiteralPath $Path).PSIsContainer) {throw 'target-unverified'}
        foreach ($entry in @(Get-ChildItem -LiteralPath $Path -Force | Sort-Object Name)) {Assert-NormalPath $entry.FullName | Out-Null;$entries+=($(if ($entry.PSIsContainer) {'directory:'} else {'file:'})+$entry.Name)}
    }
    return @{present=$present;entries=$entries}
}
function Get-SetupLegacyQualification($Locations,$Proof=$null,[switch]$LocksHeld,[string]$OwnId='') {
    $blockers=[Collections.Generic.List[string]]::new();$artifacts=@();$global=@();$locks=@();$bindings=@()
    $target=Get-SetupArtifact $Locations.Target;$artifacts+=$target
    Get-SetupCurrentVersion $Locations.Target | Out-Null
    $roots=@($Locations.Inbox,$Locations.Transactions)
    if ($Locations.ContainsKey('LegacyTransactions')) {$roots+=$Locations.LegacyTransactions}
    if ($Locations.ContainsKey('HistoricalBackups')) {$roots+=$Locations.HistoricalBackups}
    $namespaces=@($roots | Where-Object {$_ -cne $Locations.Transactions} | ForEach-Object {$space=Get-SetupNamespace $_;@{path=$_;present=$space.present;entries=$space.entries}})
    foreach ($root in $roots) {
        Assert-NormalPath $root -AllowMissing | Out-Null
        if (!(Test-Path -LiteralPath $root)) {continue}
        foreach ($entry in @(Get-ChildItem -LiteralPath $root -Force | Sort-Object Name)) {
            if ($root -ceq $Locations.Transactions -and $entry.Name -ceq 'install.lock' -and !$entry.PSIsContainer) {$locks+=$entry.FullName;continue}
            if ($OwnId -cmatch '^[a-f0-9]{32}$' -and $root -ceq $Locations.Transactions -and $entry.Name -cin @(($OwnId+'.json'),($OwnId+'.json.previous'),($OwnId+'.stage'),($OwnId+'.backup'),($OwnId+'.failed'))) {continue}
            $a=Get-SetupArtifact $entry.FullName;$artifacts+=$a
            if ($root -cne $Locations.Inbox) {$global+=$a}
        }
    }
    $adapter=Join-Path $Locations.Scan '.clackly-setup.lock'
    if (Test-Path -LiteralPath $adapter) {$locks+=$adapter}
    foreach ($lock in $locks) {
        Assert-NormalPath $lock | Out-Null
        if (!$LocksHeld) {try {$h=[IO.File]::Open($lock,'Open','ReadWrite','None');try {Assert-SetupLockFile $h} finally {$h.Dispose()}} catch {$blockers.Add('global-lock-unavailable')}}
    }
    if ($global.Count) {$blockers.Add('unknown-global-artifact')}
    if (Test-Path -LiteralPath $Locations.Scan) {foreach ($entry in @(Get-ChildItem -LiteralPath $Locations.Scan -Force)) {if ($entry.Name -cmatch '^\.?com\.wutpeach\.clackly[.]') {$artifacts+=Get-SetupArtifact $entry.FullName;$blockers.Add('legacy-scan-artifact')}}}
    foreach ($pointer in @($Locations.Pointers)) {foreach ($name in @($pointer,($pointer+'.next'))) {
        $a=Get-SetupArtifact $name;$artifacts+=$a
        if ($a.kind -ceq 'absent') {continue}
        try {
            if ($name -cne $pointer) {throw 'pending-pointer'}
            $p=Read-UpdateJson $name 65536
            if ($p.schemaVersion -ne 1 -or $p.id -cnotmatch '^[a-f0-9]{32}$' -or $p.digest -cnotmatch '^[a-f0-9]{64}$' -or $p.size -le 0) {throw 'invalid-pointer'}
            $requestRoot=Join-Path $Locations.Inbox $p.id
            $request=Read-UpdateJson (Join-Path $requestRoot 'request.json') 65536
            foreach ($key in @('schemaVersion','id','version','digest','size')) {if ([string]$p.$key -cne [string]$request.$key) {throw 'request-mismatch'}}
            $candidate=Join-Path $requestRoot 'candidate.zip'
            if ((Get-Item -LiteralPath $candidate).Length -ne $p.size -or (Get-UpdateHash $candidate) -cne $p.digest) {throw 'candidate-mismatch'}
            if ($request.releaseId -le 0 -or $request.assetId -le 0 -or !$request.workflowExecutable) {throw 'request-identity'}
            if (@(Get-ChildItem -LiteralPath $requestRoot -Force).Count -ne 2) {throw 'unresolved-request-artifact'}
            $bindings+=@{pointer=$name;requestRoot=$requestRoot;id=$p.id;digest=$p.digest;size=$p.size;version=$p.version;releaseId=$request.releaseId;assetId=$request.assetId;workflowExecutable=$request.workflowExecutable}
        } catch {$blockers.Add('legacy-request-unverified')}
    }}
    foreach ($a in @($artifacts | Where-Object {$_.path.StartsWith($Locations.Inbox+'\',[StringComparison]::OrdinalIgnoreCase)})) {if (@($bindings | Where-Object {$_.requestRoot -ceq $a.path}).Count -ne 1) {$blockers.Add('unbound-request')}}
    # Request shape is stricter than a file-only tree hash: an empty new child
    # directory may be evidence of a second launcher and must survive Inspect.
    foreach ($binding in $bindings) {$space=Get-SetupNamespace $binding.requestRoot;$namespaces+=@{path=$binding.requestRoot;present=$space.present;entries=$space.entries}}
    $data=@();if ($Locations.ContainsKey('DataRoots')) {foreach ($root in @($Locations.DataRoots)) {$a=Get-SetupArtifact $root;$data+=$a;$artifacts+=$a}}
    $fingerprint=Get-SetupEvidenceHash (@($artifacts | ForEach-Object {$_.path+'|'+$_.kind+'|'+$_.hash})+@($namespaces | ForEach-Object {$_.path+'|'+$_.present+'|'+($_.entries -join '|')}))
    if (!$Proof) {$blockers.Add('process-coverage-unproven');$blockers.Add('installed-tree-reference-unproven');$blockers.Add('configuration-dpapi-protection-unproven')}
    else {
        if (!$Proof.processComplete -or !$Proof.exclusiveReview -or $Proof.targetHash -cne $target.hash) {$blockers.Add('exclusive-tree-proof-invalid')}
        foreach ($record in @($Proof.processes)) {if (!$record.pid -or !$record.created -or !$record.image -or $record.state -cne 'exited') {$blockers.Add('process-identity-unproven')}}
        if ($Proof.fingerprint -cne $fingerprint) {$blockers.Add('observation-drift')}
        if (@($Proof.snapshots).Count -ne $data.Count) {$blockers.Add('configuration-dpapi-protection-unproven')}
        foreach ($a in $data) {
            $snapshot=@($Proof.snapshots | Where-Object {$_.source -ceq $a.path})
            if ($snapshot.Count -ne 1 -or !$snapshot[0].dpapiSameUser -or !$snapshot[0].protected -or $snapshot[0].path.StartsWith($a.path,[StringComparison]::OrdinalIgnoreCase)) {$blockers.Add('configuration-dpapi-protection-unproven');continue}
            if ((Get-SetupArtifact $snapshot[0].path).hash -cne $a.hash) {$blockers.Add('configuration-snapshot-drift')}
        }
    }
    return @{eligible=($blockers.Count -eq 0);status=$(if ($blockers.Count) {'blocked'} else {'qualified-for-inert-reconciliation'});blockers=@($blockers);fingerprint=$fingerprint;targetHash=$target.hash;artifacts=$artifacts;bindings=$bindings;namespaces=$namespaces;observedUtc=[DateTime]::UtcNow.ToString('o');productionRetryAuthorized=$false}
}
Export-ModuleMember -Function Get-SetupLegacyQualification,Get-SetupArtifact,Get-SetupEvidenceHash,Assert-SetupLockFile,Get-SetupCurrentVersion,Get-SetupNamespace

# R23 normal installation never accepts the historical fixture Proof schema.
function Get-SetupPathIdentity([string]$Path) {
    Assert-NormalPath $Path | Out-Null
    if (!('Clackly.SetupPathIdentityR23' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace Clackly { public static class SetupPathIdentityR23 {
 [StructLayout(LayoutKind.Sequential)] struct Info { public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Created,Accessed,Written; public uint Volume,SizeHigh,SizeLow,Links,High,Low; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string p,uint a,uint s,IntPtr q,uint c,uint f,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
 public static string Read(string p) { using(var h=CreateFile(p,0,7,IntPtr.Zero,3,0x200000,IntPtr.Zero)) { Info i; if(h.IsInvalid||!GetFileInformationByHandle(h,out i)||i.Links!=1||(i.Attributes&0x410)!=0) throw new InvalidOperationException("recovery-required"); return i.Volume+":"+i.High+":"+i.Low; } }
}}
'@
    }
    try {return [Clackly.SetupPathIdentityR23]::Read($Path)} catch {throw 'recovery-required'}
}
function Get-SetupFullNamespace([string]$Root) {
    Assert-NormalPath $Root -AllowMissing | Out-Null
    if (!(Test-Path -LiteralPath $Root)) {return @('absent')}
    return @(Get-TreeNamespace $Root | Sort-Object -CaseSensitive)
}
function Get-SetupNormalObservation($Locations,[string]$OwnId='') {
    foreach ($root in @($Locations.Scan,$Locations.Target,$Locations.Transactions,$Locations.Inbox,$Locations.LegacyTransactions,$Locations.HistoricalBackups)+@($Locations.Pointers)+@($Locations.DataRoots)) {Assert-NormalPath $root -AllowMissing | Out-Null}
    foreach ($data in @($Locations.DataRoots)) {foreach ($write in @($Locations.Scan,$Locations.Transactions)) {
        if ($write -ieq $data -or $write.StartsWith($data+'\',[StringComparison]::OrdinalIgnoreCase) -or $data.StartsWith($write+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'target-unverified'}
    }}
    foreach ($pointer in @($Locations.Pointers)) {if ((Test-Path -LiteralPath $pointer) -or (Test-Path -LiteralPath ($pointer+'.next'))) {throw 'recovery-required'}}
    $spaces=@();foreach ($root in @($Locations.Inbox,$Locations.LegacyTransactions,$Locations.HistoricalBackups)) {
        $space=Get-SetupNamespace $root;if (@($space.entries).Count) {throw 'recovery-required'}
        $spaces+=@{path=$root;present=$space.present;entries=$space.entries}
    }
    if (Test-Path -LiteralPath $Locations.Scan) {foreach ($entry in @(Get-ChildItem -LiteralPath $Locations.Scan -Force)) {if ($entry.Name -imatch '^\.?com\.wutpeach\.clackly[.]') {throw 'recovery-required'}}}
    $lockIdentity='absent'
    if (Test-Path -LiteralPath $Locations.Transactions) {foreach ($entry in @(Get-ChildItem -LiteralPath $Locations.Transactions -Force)) {
        if ($entry.Name -ceq 'install.lock' -and !$entry.PSIsContainer) {$lockIdentity=Get-SetupPathIdentity $entry.FullName;continue}
        if ($OwnId -cmatch '^[a-f0-9]{32}$' -and $entry.Name -cin @(($OwnId+'.json'),($OwnId+'.json.previous'),($OwnId+'.stage'),($OwnId+'.backup'),($OwnId+'.failed'))) {Assert-NormalPath $entry.FullName | Out-Null;continue}
        throw 'recovery-required'
    }}
    $data=@();foreach ($root in @($Locations.DataRoots)) {$artifact=Get-SetupArtifact $root;if ($artifact.kind -cnotin @('absent','directory')) {throw 'target-unverified'};$data+=@{path=$root;kind=$artifact.kind;hash=$artifact.hash;namespaceHash=(Get-SetupEvidenceHash @(Get-SetupFullNamespace $root))}}
    $retained=@($spaces | ForEach-Object {$_.path+'|'+$_.present+'|'+($_.entries -join '|')})+@($data | ForEach-Object {$_.path+'|'+$_.kind+'|'+$_.hash+'|'+$_.namespaceHash})
    return @{oldHash=(Get-SetupTreeHashForObservation $Locations.Target);oldNamespaceHash=(Get-SetupEvidenceHash @(Get-SetupFullNamespace $Locations.Target));current=(Get-SetupCurrentVersion $Locations.Target);retainedHash=(Get-SetupEvidenceHash $retained);namespaces=$spaces;data=$data;lockIdentity=$lockIdentity}
}
function Get-SetupTreeHashForObservation([string]$Path) {if (!(Test-Path -LiteralPath $Path)) {return 'absent'};return (Get-SetupArtifact $Path).hash}
function Assert-SetupNormalUnchanged($Locations,$Baseline,[string]$OwnId='',[switch]$AfterTransaction) {
    $actual=Get-SetupNormalObservation $Locations $OwnId
    if ($actual.retainedHash -cne $Baseline.retainedHash -or $actual.lockIdentity -cne $Baseline.lockIdentity -or (!$AfterTransaction -and ($actual.oldHash -cne $Baseline.oldHash -or $actual.oldNamespaceHash -cne $Baseline.oldNamespaceHash))) {throw 'recovery-required'}
    return $actual
}
Export-ModuleMember -Function Get-SetupPathIdentity,Get-SetupFullNamespace,Get-SetupNormalObservation,Assert-SetupNormalUnchanged
