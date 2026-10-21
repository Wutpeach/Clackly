Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Direct isolated module tests may inject observations. No production CLI exposes
# these seams or a source path. Location alone never confers publisher trust.
function Get-LocalResolveNativePath {
    $programData = $env:PROGRAMDATA
    if (!$programData) { throw 'native-missing' }
    return Join-Path $programData 'Blackmagic Design\DaVinci Resolve\Support\Developer\Workflow Integrations\Examples\SamplePlugin\WorkflowIntegration.node'
}

function Initialize-NativeFileIdentity {
    if ('Clackly.NativeIdentity' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace Clackly {
 public static class NativeIdentity {
  [StructLayout(LayoutKind.Sequential)] struct Info {
   public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
   public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h, out Info i);
  [StructLayout(LayoutKind.Sequential)] struct Limits {
   public long ProcessTime, JobTime; public uint Flags; public UIntPtr Min, Max; public uint Processes; public UIntPtr Affinity; public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct Counters {public ulong A,B,C,D,E,F;}
  [StructLayout(LayoutKind.Sequential)] struct Extended {public Limits Basic; public Counters IO; public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
   public uint Size; public string Reserved,Desktop,Title; public uint X,Y,Width,Height,XChars,YChars,Fill,Flags;
   public ushort Show,ReservedBytes; public IntPtr ReservedPtr,Input,Output,Error;
  }
  [StructLayout(LayoutKind.Sequential)] struct Child {public IntPtr Process,Thread; public uint Pid,Tid;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref Extended value,uint size);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,System.Text.StringBuilder command,IntPtr ps,IntPtr ts,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out Child child);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static uint RunProbe(System.Diagnostics.ProcessStartInfo start) {
   IntPtr job=IntPtr.Zero,env=IntPtr.Zero; Child child=new Child(); bool assigned=false;
   try {
    job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero) throw new IOException("native-incompatible");
    var limits=new Extended(); limits.Basic.Flags=0x2000;
    if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits))) throw new IOException("native-incompatible");
    var entries=new System.Collections.Generic.List<string>();
    foreach(string key in start.EnvironmentVariables.Keys) entries.Add(key+"="+start.EnvironmentVariables[key]);
    entries.Sort(StringComparer.OrdinalIgnoreCase); env=Marshal.StringToHGlobalUni(String.Join("\0",entries)+"\0\0");
    var startup=new Startup(); startup.Size=(uint)Marshal.SizeOf(startup); startup.Flags=1; startup.Show=0;
    var command=new System.Text.StringBuilder("\""+start.FileName+"\" "+start.Arguments);
    if(!CreateProcess(start.FileName,command,IntPtr.Zero,IntPtr.Zero,false,0x08000404,env,start.WorkingDirectory,ref startup,out child)) throw new IOException("native-incompatible");
    // Assign while suspended: Chromium descendants can never escape this job.
    if(!AssignProcessToJobObject(job,child.Process)) throw new IOException("native-incompatible"); assigned=true;
    if(ResumeThread(child.Thread)==0xffffffff || WaitForSingleObject(child.Process,15000)!=0) throw new IOException("native-incompatible");
    uint code; if(!GetExitCodeProcess(child.Process,out code)) throw new IOException("native-incompatible"); return code;
   } finally {
    if(child.Process!=IntPtr.Zero && !assigned) TerminateProcess(child.Process,42);
    if(job!=IntPtr.Zero) CloseHandle(job); // kill-on-close includes all descendants
    if(child.Process!=IntPtr.Zero) {WaitForSingleObject(child.Process,5000);CloseHandle(child.Process);}
    if(child.Thread!=IntPtr.Zero) CloseHandle(child.Thread); if(env!=IntPtr.Zero) Marshal.FreeHGlobal(env);
   }
  }
  public static string Read(FileStream stream) {
   Info i; if (!GetFileInformationByHandle(stream.SafeFileHandle, out i) || i.Links != 1 || (i.Attributes & 0x410) != 0)
    throw new IOException("native-invalid");
   return i.Volume+":"+i.IndexHigh+":"+i.IndexLow+":"+i.SizeHigh+":"+i.SizeLow;
  }
 }
}
'@
}

function Open-NativeReadLock([string]$Path) {
    try {
        Assert-NormalPath $Path | Out-Null
        Initialize-NativeFileIdentity
        $stream = [IO.File]::Open($Path,'Open','Read','Read')
        try { [Clackly.NativeIdentity]::Read($stream) | Out-Null; return $stream }
        catch { $stream.Dispose(); throw }
    } catch { throw 'native-invalid' }
}

function Assert-NativePe($Stream, [switch]$Dll) {
    $reader = [IO.BinaryReader]::new($Stream,[Text.Encoding]::UTF8,$true)
    try {
        $Stream.Position=0
        if ($Stream.Length -lt 128 -or $reader.ReadUInt16() -ne 23117) { throw 'native-invalid' }
        $Stream.Position=60; $offset=$reader.ReadUInt32()
        if ($offset -lt 64 -or $offset -gt $Stream.Length-26) { throw 'native-invalid' }
        $Stream.Position=$offset
        if ($reader.ReadUInt32() -ne 17744 -or $reader.ReadUInt16() -ne 34404) { throw 'native-invalid' }
        $Stream.Position=$offset+22; $flags=$reader.ReadUInt16()
        if (($flags -band 2) -eq 0 -or ($Dll -and ($flags -band 8192) -eq 0)) { throw 'native-invalid' }
        if ($reader.ReadUInt16() -ne 523) { throw 'native-invalid' }
    } finally { $reader.Dispose(); $Stream.Position=0 }
}

function Get-NativeStreamHash($Stream) {
    $hash=[Security.Cryptography.SHA256]::Create()
    try { $Stream.Position=0; return ([BitConverter]::ToString($hash.ComputeHash($Stream))).Replace('-','').ToLowerInvariant() }
    finally { $hash.Dispose(); $Stream.Position=0 }
}

function Assert-BlackmagicSignature([string]$Path,[switch]$ResolveHost) {
    $signature=Microsoft.PowerShell.Security\Get-AuthenticodeSignature -LiteralPath $Path -ErrorAction Stop
    if ($signature.Status -ne 'Valid' -or !$signature.SignerCertificate -or
        $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -cnotin $(if ($ResolveHost) {@('Blackmagic Design Pty Ltd','Blackmagic Design Pty Ltd.')} else {@('Blackmagic Design Pty Ltd')})) { throw 'native-invalid' }
}

function Get-ResolveHostPair([string]$WorkflowExecutable) {
    if (!$WorkflowExecutable) {
        # Registered locations and fixed Program Files candidates, never drive scanning.
        $roots=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        foreach ($key in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
            foreach ($entry in @(Get-ItemProperty $key -ErrorAction SilentlyContinue)) {
                if ($entry.PSObject.Properties['DisplayName'] -and $entry.DisplayName -cmatch '^DaVinci Resolve( Studio)?$' -and $entry.PSObject.Properties['InstallLocation'] -and $entry.InstallLocation) { [void]$roots.Add($entry.InstallLocation.TrimEnd('\')) }
            }
        }
        foreach ($key in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Resolve.exe','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\Resolve.exe')) {
            $entry=Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
            if ($entry -and $entry.PSObject.Properties['(default)']) { [void]$roots.Add((Split-Path -Parent $entry.'(default)')) }
        }
        if ($env:ProgramFiles) { [void]$roots.Add((Join-Path $env:ProgramFiles 'Blackmagic Design\DaVinci Resolve')) }
        $pairs=@($roots | Where-Object { [IO.File]::Exists((Join-Path $_ 'Resolve.exe')) -and [IO.File]::Exists((Join-Path $_ 'Electron\electron.exe')) })
        if ($pairs.Count -ne 1) { throw 'native-incompatible' }
        $WorkflowExecutable=Join-Path $pairs[0] 'Electron\electron.exe'
    }
    if ((Split-Path -Leaf $WorkflowExecutable) -ine 'electron.exe' -or (Split-Path -Leaf (Split-Path -Parent $WorkflowExecutable)) -ine 'Electron') { throw 'native-incompatible' }
    $resolve=Join-Path (Split-Path -Parent (Split-Path -Parent $WorkflowExecutable)) 'Resolve.exe'
    return @{ResolveExecutable=$resolve;WorkflowExecutable=$WorkflowExecutable}
}

function Assert-ProtectedHostPath([string]$Path,[switch]$Ancestor) {
    Assert-NormalPath $Path | Out-Null
    $trusted=@('S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
    $rights=[Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
        [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
    if (!$Ancestor) {$rights=$rights -bor [Security.AccessControl.FileSystemRights]::Write -bor 1073741824}
    $rights=$rights -bor 268435456
    $acl=Microsoft.PowerShell.Security\Get-Acl -LiteralPath $Path -ErrorAction Stop
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cnotin $trusted) {throw 'native-incompatible'}
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if (($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0 -and
            $rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band $rights) -ne 0 -and $rule.IdentityReference.Value -cnotin $trusted) {throw 'native-incompatible'}
    }
}

function Assert-ResolveNativeCompatibility([string]$NativePath,[string]$WorkflowExecutable) {
    $resolveLock=$null; $electronLock=$null; $scriptLock=$null; $packageLock=$null
    try {
        $pair=Get-ResolveHostPair $WorkflowExecutable
        $hostRoot=Split-Path -Parent $pair.ResolveExecutable
        $electronRoot=Split-Path -Parent $pair.WorkflowExecutable
        # Vendor signatures alone cannot prevent dependency sideloading from a
        # writable host installation. Inspect current ACLs without modifying any.
        Assert-ProtectedHostPath $hostRoot
        Assert-ProtectedHostPath $electronRoot
        foreach ($item in @(Get-ChildItem -LiteralPath $electronRoot -Recurse -Force)) {Assert-ProtectedHostPath $item.FullName}
        $cursor=$electronRoot
        while ($cursor) {Assert-ProtectedHostPath $cursor -Ancestor; $cursor=Split-Path -Parent $cursor}
        $resolveLock=Open-NativeReadLock $pair.ResolveExecutable
        $electronLock=Open-NativeReadLock $pair.WorkflowExecutable
        Assert-NativePe $resolveLock; Assert-NativePe $electronLock
        Assert-BlackmagicSignature $pair.ResolveExecutable -ResolveHost; Assert-BlackmagicSignature $pair.WorkflowExecutable
        $hostHash=Get-NativeStreamHash $electronLock
        # The controlled script lives beside this transaction, outside plugin
        # scanning, never in a downloaded payload or an ambient user profile.
        $stageRoot=Split-Path -Parent (Split-Path -Parent $NativePath)
        $probe=Join-Path (Split-Path -Parent $stageRoot) ((Split-Path -Leaf $stageRoot)+'.native-probe')
        Assert-NormalPath $probe -AllowMissing | Out-Null
        if (Test-Path -LiteralPath $probe) {throw 'native-incompatible'}
        [IO.Directory]::CreateDirectory($probe) | Out-Null
        foreach ($name in @('profile','session','crashes','logs')) {[IO.Directory]::CreateDirectory((Join-Path $probe $name)) | Out-Null}
        $package=Join-Path $probe 'package.json'; $script=Join-Path $probe 'main.js'
        [IO.File]::WriteAllText($package,'{"name":"clackly-native-probe","version":"1.0.0","main":"main.js"}')
        $scriptText=@'
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.setPath('userData', path.join(__dirname, 'profile'));
app.setPath('sessionData', path.join(__dirname, 'session'));
app.setAppLogsPath(path.join(__dirname, 'logs'));
let code = 42;
try {
  const addon = require(process.env.CLACKLY_NATIVE_PROBE_FILE);
  if (typeof addon.Initialize === 'function' && typeof addon.GetResolve === 'function' && process.versions.electron && process.versions.napi) {
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ execPath: process.execPath, electron: process.versions.electron, node: process.versions.node, napi: process.versions.napi }), { flag: 'wx' });
    code = 0;
  }
} catch (_) { /* No paths or vendor exception text enters the public outcome. */ }
app.whenReady().then(() => app.exit(code), () => app.exit(42));
'@
        [IO.File]::WriteAllText($script,$scriptText)
        $packageLock=Open-NativeReadLock $package; $scriptLock=Open-NativeReadLock $script
        $reader=[IO.StreamReader]::new($scriptLock,[Text.Encoding]::UTF8,$true,4096,$true)
        try {if ($reader.ReadToEnd() -cne $scriptText) {throw 'native-incompatible'}} finally {$reader.Dispose();$scriptLock.Position=0}
        $reader=[IO.StreamReader]::new($packageLock,[Text.Encoding]::UTF8,$true,4096,$true)
        try {if ($reader.ReadToEnd() -cne '{"name":"clackly-native-probe","version":"1.0.0","main":"main.js"}') {throw 'native-incompatible'}} finally {$reader.Dispose();$packageLock.Position=0}
        $start=[Diagnostics.ProcessStartInfo]::new()
        $start.FileName=$pair.WorkflowExecutable
        $start.Arguments='--user-data-dir="'+(Join-Path $probe 'profile')+'" --crash-dumps-dir="'+(Join-Path $probe 'crashes')+'" --disable-crash-reporter "'+$probe+'"'
        $start.UseShellExecute=$false; $start.CreateNoWindow=$true; $start.WindowStyle='Hidden'
        $start.WorkingDirectory=$electronRoot
        $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true; $start.RedirectStandardInput=$true
        foreach ($key in @('ELECTRON_RUN_AS_NODE','NODE_OPTIONS','NODE_PATH','ELECTRON_ENABLE_LOGGING','ELECTRON_LOG_FILE','ELECTRON_EXTRA_LAUNCH_ARGS','ELECTRON_OVERRIDE_DIST_PATH')) {$start.EnvironmentVariables.Remove($key)}
        $start.EnvironmentVariables['CLACKLY_NATIVE_PROBE_FILE']=$NativePath
        $start.EnvironmentVariables['TEMP']=$probe; $start.EnvironmentVariables['TMP']=$probe
        if ([Clackly.NativeIdentity]::RunProbe($start) -ne 0) {throw 'native-incompatible'}
        $resultPath=Join-Path $probe 'result.json'
        Assert-NormalPath $resultPath | Out-Null
        if ((Get-Item -LiteralPath $resultPath).Length -gt 65536) {throw 'native-incompatible'}
        $record=[IO.File]::ReadAllText($resultPath) | ConvertFrom-Json
        if ($record.execPath -ine $pair.WorkflowExecutable -or $record.electron -notmatch '^\d+\.\d+\.\d+' -or
            $record.node -notmatch '^\d+\.\d+\.\d+' -or $record.napi -notmatch '^[1-9][0-9]*$' -or (Get-NativeStreamHash $electronLock) -cne $hostHash) {throw 'native-incompatible'}
    } catch {throw [InvalidOperationException]::new('native-incompatible',$_.Exception)}
    finally {
        foreach ($handle in @($scriptLock,$packageLock,$electronLock,$resolveLock)) {if ($handle) {$handle.Dispose()}}
        # Retain the bounded transaction-owned probe evidence; never delete an
        # unknown tree or touch real Resolve/Clackly user profile directories.
    }
}

function Copy-LocalResolveNative([string]$StageRoot,[string]$WorkflowExecutable,
    [scriptblock]$Source = { Get-LocalResolveNativePath },
    [scriptblock]$Signature = {param($p) Assert-BlackmagicSignature $p},
    [scriptblock]$Compatibility = {param($p,$w) Assert-ResolveNativeCompatibility $p $w}) {
    $sourcePath=& $Source
    if (![IO.File]::Exists($sourcePath)) {
        try { Assert-NormalPath $sourcePath -AllowMissing | Out-Null } catch { throw 'native-invalid' }
        throw 'native-missing'
    }
    $destination=Join-Path $StageRoot 'workflow-plugin\WorkflowIntegration.node'
    $input=$null; $output=$null; $staged=$null
    try {
        $input=Open-NativeReadLock $sourcePath
        $identity=[Clackly.NativeIdentity]::Read($input); $hash=Get-NativeStreamHash $input
        Assert-NativePe $input -Dll
        Assert-NormalPath $destination -AllowMissing | Out-Null
        $output=[IO.File]::Open($destination,'CreateNew','Write','None')
        $input.CopyTo($output); $output.Flush($true); $output.Dispose(); $output=$null
        [IO.File]::SetAttributes($destination,[IO.FileAttributes]::ReadOnly)
        $staged=Open-NativeReadLock $destination
        $stageIdentity=[Clackly.NativeIdentity]::Read($staged)
        Assert-NativePe $staged -Dll
        if ((Get-NativeStreamHash $staged) -cne $hash -or [Clackly.NativeIdentity]::Read($input) -cne $identity -or (Get-NativeStreamHash $input) -cne $hash) { throw 'native-invalid' }
        $null=& $Signature $destination
        $null=& $Compatibility $destination $WorkflowExecutable
        Assert-NormalPath $sourcePath | Out-Null; Assert-NormalPath $destination | Out-Null
        $freshSource=Open-NativeReadLock $sourcePath; $freshStage=$null
        try {
            $freshStage=Open-NativeReadLock $destination
            if ([Clackly.NativeIdentity]::Read($freshSource) -cne $identity -or [Clackly.NativeIdentity]::Read($freshStage) -cne $stageIdentity -or
                [Clackly.NativeIdentity]::Read($staged) -cne $stageIdentity -or (Get-NativeStreamHash $staged) -cne $hash) { throw 'native-invalid' }
        } finally { $freshSource.Dispose(); if ($freshStage) {$freshStage.Dispose()} }
        return @{path='workflow-plugin/WorkflowIntegration.node';size=$staged.Length;sha256=$hash}
    } catch {
        if ($_.Exception.Message -cin @('native-missing','native-invalid','native-incompatible')) { throw }
        throw 'native-invalid'
    } finally { if ($input) {$input.Dispose()}; if ($output) {$output.Dispose()}; if ($staged) {$staged.Dispose()} }
}

Export-ModuleMember -Function Get-LocalResolveNativePath, Copy-LocalResolveNative, Get-ResolveHostPair, Assert-ResolveNativeCompatibility
