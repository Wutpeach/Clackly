Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Private, bounded context only. Callers must explicitly extract it from the
# exception chain into their own protected evidence; this module never logs it.
function ConvertTo-NativeDiagnosticText($Value,[int]$Limit) {
    if ($null -eq $Value) { return $null }
    $text=[string]$Value
    if ($text.Length -gt $Limit) { return $text.Substring(0,$Limit) }
    return $text
}

function Add-NativeFailureContext([Management.Automation.ErrorRecord]$Record,[string]$Checkpoint) {
    try {
        $exception=$Record.Exception
        $cursor=$exception
        for ($depth=0; $cursor -and $depth -lt 32; $depth++) {
            if ($cursor.Data.Contains('Clackly.LocalNative.FirstFailure')) { return }
            $cursor=$cursor.InnerException
        }
        # Do not shadow a possible earlier context beyond the traversal bound.
        if ($cursor) { return }
        $causes=@(); $cursor=$exception
        for ($depth=0; $cursor -and $depth -lt 8; $depth++) {
            $nativeCode=$null
            if ($cursor -is [ComponentModel.Win32Exception]) { $nativeCode=$cursor.NativeErrorCode }
            $causes+=@{
                type=ConvertTo-NativeDiagnosticText $cursor.GetType().FullName 256
                message=ConvertTo-NativeDiagnosticText $cursor.Message 2048
                hResult=$cursor.HResult; nativeErrorCode=$nativeCode
            }
            $cursor=$cursor.InnerException
        }
        $invocation=$Record.InvocationInfo
        $invocationContext=$null
        if ($invocation) {
            $commandName=$null
            if ($invocation.MyCommand) { $commandName=$invocation.MyCommand.Name }
            $invocationContext=@{
                invocationName=ConvertTo-NativeDiagnosticText $invocation.InvocationName 256
                commandName=ConvertTo-NativeDiagnosticText $commandName 256
                scriptName=ConvertTo-NativeDiagnosticText $invocation.ScriptName 1024
                line=ConvertTo-NativeDiagnosticText $invocation.Line 1024
                positionMessage=ConvertTo-NativeDiagnosticText $invocation.PositionMessage 2048
                scriptLineNumber=$invocation.ScriptLineNumber; offsetInLine=$invocation.OffsetInLine
            }
        }
        $exception.Data['Clackly.LocalNative.FirstFailure']=@{
            schemaVersion=1; checkpoint=ConvertTo-NativeDiagnosticText $Checkpoint 96
            exceptionType=$causes[0].type; message=$causes[0].message
            fullyQualifiedErrorId=ConvertTo-NativeDiagnosticText $Record.FullyQualifiedErrorId 512
            hResult=$exception.HResult; nativeErrorCode=$causes[0].nativeErrorCode
            invocation=$invocationContext
            scriptStackTrace=ConvertTo-NativeDiagnosticText $Record.ScriptStackTrace 2048
            exceptions=$causes
        }
    } catch {
        # Evidence failure must never replace the rejection being diagnosed.
    }
}

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
    $checkpoint='read-lock.path'
    try {
        Assert-NormalPath $Path | Out-Null
        $checkpoint='read-lock.initialize-identity'
        Initialize-NativeFileIdentity
        $checkpoint='read-lock.open'
        $stream = [IO.File]::Open($Path,'Open','Read','Read')
        $checkpoint='read-lock.identity'
        try { [Clackly.NativeIdentity]::Read($stream) | Out-Null; return $stream }
        catch { Add-NativeFailureContext $_ $checkpoint; $stream.Dispose(); throw }
    } catch {
        Add-NativeFailureContext $_ $checkpoint
        throw [InvalidOperationException]::new('native-invalid',$_.Exception)
    }
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
    $checkpoint='compatibility.host-pair'
    try {
        $pair=Get-ResolveHostPair $WorkflowExecutable
        $hostRoot=Split-Path -Parent $pair.ResolveExecutable
        $electronRoot=Split-Path -Parent $pair.WorkflowExecutable
        # Vendor signatures alone cannot prevent dependency sideloading from a
        # writable host installation. Inspect current ACLs without modifying any.
        $checkpoint='compatibility.resolve-directory-protection'
        Assert-ProtectedHostPath $hostRoot
        $checkpoint='compatibility.electron-directory-protection'
        Assert-ProtectedHostPath $electronRoot
        $checkpoint='compatibility.electron-tree-protection'
        foreach ($item in @(Get-ChildItem -LiteralPath $electronRoot -Recurse -Force)) {Assert-ProtectedHostPath $item.FullName}
        $cursor=$electronRoot
        $checkpoint='compatibility.host-ancestor-protection'
        while ($cursor) {Assert-ProtectedHostPath $cursor -Ancestor; $cursor=Split-Path -Parent $cursor}
        $checkpoint='compatibility.resolve-read-lock'
        $resolveLock=Open-NativeReadLock $pair.ResolveExecutable
        $checkpoint='compatibility.electron-read-lock'
        $electronLock=Open-NativeReadLock $pair.WorkflowExecutable
        $checkpoint='compatibility.resolve-pe'
        Assert-NativePe $resolveLock
        $checkpoint='compatibility.electron-pe'
        Assert-NativePe $electronLock
        $checkpoint='compatibility.resolve-signature'
        Assert-BlackmagicSignature $pair.ResolveExecutable -ResolveHost
        $checkpoint='compatibility.electron-signature'
        Assert-BlackmagicSignature $pair.WorkflowExecutable
        $checkpoint='compatibility.electron-hash'
        $hostHash=Get-NativeStreamHash $electronLock
        # The controlled script lives beside this transaction, outside plugin
        # scanning, never in a downloaded payload or an ambient user profile.
        $stageRoot=Split-Path -Parent (Split-Path -Parent $NativePath)
        $probe=Join-Path (Split-Path -Parent $stageRoot) ((Split-Path -Leaf $stageRoot)+'.native-probe')
        $checkpoint='compatibility.probe-path'
        Assert-NormalPath $probe -AllowMissing | Out-Null
        if (Test-Path -LiteralPath $probe) {throw 'native-incompatible'}
        $checkpoint='compatibility.probe-directories'
        [IO.Directory]::CreateDirectory($probe) | Out-Null
        foreach ($name in @('profile','session','crashes','logs')) {[IO.Directory]::CreateDirectory((Join-Path $probe $name)) | Out-Null}
        $package=Join-Path $probe 'package.json'; $script=Join-Path $probe 'main.js'
        $checkpoint='compatibility.probe-package-write'
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
        $checkpoint='compatibility.probe-script-write'
        [IO.File]::WriteAllText($script,$scriptText)
        $checkpoint='compatibility.probe-package-read-lock'
        $packageLock=Open-NativeReadLock $package
        $checkpoint='compatibility.probe-script-read-lock'
        $scriptLock=Open-NativeReadLock $script
        $checkpoint='compatibility.probe-script-content'
        $reader=[IO.StreamReader]::new($scriptLock,[Text.Encoding]::UTF8,$true,4096,$true)
        try {if ($reader.ReadToEnd() -cne $scriptText) {throw 'native-incompatible'}} finally {$reader.Dispose();$scriptLock.Position=0}
        $checkpoint='compatibility.probe-package-content'
        $reader=[IO.StreamReader]::new($packageLock,[Text.Encoding]::UTF8,$true,4096,$true)
        try {if ($reader.ReadToEnd() -cne '{"name":"clackly-native-probe","version":"1.0.0","main":"main.js"}') {throw 'native-incompatible'}} finally {$reader.Dispose();$packageLock.Position=0}
        $checkpoint='compatibility.probe-start-info'
        $start=[Diagnostics.ProcessStartInfo]::new()
        $start.FileName=$pair.WorkflowExecutable
        $start.Arguments='--user-data-dir="'+(Join-Path $probe 'profile')+'" --crash-dumps-dir="'+(Join-Path $probe 'crashes')+'" --disable-crash-reporter "'+$probe+'"'
        $start.UseShellExecute=$false; $start.CreateNoWindow=$true; $start.WindowStyle='Hidden'
        $start.WorkingDirectory=$electronRoot
        $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true; $start.RedirectStandardInput=$true
        foreach ($key in @('ELECTRON_RUN_AS_NODE','NODE_OPTIONS','NODE_PATH','ELECTRON_ENABLE_LOGGING','ELECTRON_LOG_FILE','ELECTRON_EXTRA_LAUNCH_ARGS','ELECTRON_OVERRIDE_DIST_PATH')) {$start.EnvironmentVariables.Remove($key)}
        $start.EnvironmentVariables['CLACKLY_NATIVE_PROBE_FILE']=$NativePath
        $start.EnvironmentVariables['TEMP']=$probe; $start.EnvironmentVariables['TMP']=$probe
        $checkpoint='compatibility.probe-run'
        if ([Clackly.NativeIdentity]::RunProbe($start) -ne 0) {throw 'native-incompatible'}
        $resultPath=Join-Path $probe 'result.json'
        $checkpoint='compatibility.probe-result-path'
        Assert-NormalPath $resultPath | Out-Null
        $checkpoint='compatibility.probe-result-size'
        if ((Get-Item -LiteralPath $resultPath).Length -gt 65536) {throw 'native-incompatible'}
        $checkpoint='compatibility.probe-result-read'
        $record=[IO.File]::ReadAllText($resultPath) | ConvertFrom-Json
        $checkpoint='compatibility.probe-result-identity'
        if ($record.execPath -ine $pair.WorkflowExecutable -or $record.electron -notmatch '^\d+\.\d+\.\d+' -or
            $record.node -notmatch '^\d+\.\d+\.\d+' -or $record.napi -notmatch '^[1-9][0-9]*$' -or (Get-NativeStreamHash $electronLock) -cne $hostHash) {throw 'native-incompatible'}
    } catch {
        Add-NativeFailureContext $_ $checkpoint
        throw [InvalidOperationException]::new('native-incompatible',$_.Exception)
    }
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
    $checkpoint='copy.source'
    try {
        $sourcePath=& $Source
        $checkpoint='copy.source-present'
        if (![IO.File]::Exists($sourcePath)) {
            try { Assert-NormalPath $sourcePath -AllowMissing | Out-Null } catch {
                Add-NativeFailureContext $_ 'copy.missing-source-path'
                throw [InvalidOperationException]::new('native-invalid',$_.Exception)
            }
            throw 'native-missing'
        }
        $checkpoint='copy.destination'
        $destination=Join-Path $StageRoot 'workflow-plugin\WorkflowIntegration.node'
    } catch { Add-NativeFailureContext $_ $checkpoint; throw }
    $input=$null; $output=$null; $staged=$null
    $checkpoint='copy.source-read-lock'
    try {
        $input=Open-NativeReadLock $sourcePath
        $checkpoint='copy.source-identity'
        $identity=[Clackly.NativeIdentity]::Read($input)
        $checkpoint='copy.source-hash'
        $hash=Get-NativeStreamHash $input
        $checkpoint='copy.source-pe'
        Assert-NativePe $input -Dll
        $checkpoint='copy.destination-path'
        Assert-NormalPath $destination -AllowMissing | Out-Null
        $checkpoint='copy.destination-create'
        $output=[IO.File]::Open($destination,'CreateNew','Write','None')
        $checkpoint='copy.bytes'
        $input.CopyTo($output)
        $checkpoint='copy.flush'
        $output.Flush($true)
        $checkpoint='copy.close-output'
        $output.Dispose(); $output=$null
        $checkpoint='copy.read-only'
        [IO.File]::SetAttributes($destination,[IO.FileAttributes]::ReadOnly)
        $checkpoint='copy.staged-read-lock'
        $staged=Open-NativeReadLock $destination
        $checkpoint='copy.staged-identity'
        $stageIdentity=[Clackly.NativeIdentity]::Read($staged)
        $checkpoint='copy.staged-pe'
        Assert-NativePe $staged -Dll
        $checkpoint='copy.content-identity'
        if ((Get-NativeStreamHash $staged) -cne $hash -or [Clackly.NativeIdentity]::Read($input) -cne $identity -or (Get-NativeStreamHash $input) -cne $hash) { throw 'native-invalid' }
        $checkpoint='copy.signature'
        $null=& $Signature $destination
        $checkpoint='copy.compatibility'
        $null=& $Compatibility $destination $WorkflowExecutable
        $checkpoint='copy.final-source-path'
        Assert-NormalPath $sourcePath | Out-Null
        $checkpoint='copy.final-destination-path'
        Assert-NormalPath $destination | Out-Null
        $checkpoint='copy.final-source-read-lock'
        $freshSource=Open-NativeReadLock $sourcePath; $freshStage=$null
        try {
            $checkpoint='copy.final-staged-read-lock'
            $freshStage=Open-NativeReadLock $destination
            $checkpoint='copy.final-identity'
            if ([Clackly.NativeIdentity]::Read($freshSource) -cne $identity -or [Clackly.NativeIdentity]::Read($freshStage) -cne $stageIdentity -or
                [Clackly.NativeIdentity]::Read($staged) -cne $stageIdentity -or (Get-NativeStreamHash $staged) -cne $hash) { throw 'native-invalid' }
        } finally { $freshSource.Dispose(); if ($freshStage) {$freshStage.Dispose()} }
        return @{path='workflow-plugin/WorkflowIntegration.node';size=$staged.Length;sha256=$hash}
    } catch {
        Add-NativeFailureContext $_ $checkpoint
        if ($_.Exception.Message -cin @('native-missing','native-invalid','native-incompatible')) { throw }
        throw [InvalidOperationException]::new('native-invalid',$_.Exception)
    }
    finally { if ($input) {$input.Dispose()}; if ($output) {$output.Dispose()}; if ($staged) {$staged.Dispose()} }
}

Export-ModuleMember -Function Get-LocalResolveNativePath, Copy-LocalResolveNative, Get-ResolveHostPair, Assert-ResolveNativeCompatibility
