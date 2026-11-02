[CmdletBinding()]
param([ValidateSet('Prepare','Verify','Host')][string]$Mode,
    [Parameter(Mandatory=$true)][string]$ExpectedVersion,
    [Parameter(Mandatory=$true)][string]$Work,
    [Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
# A launcher can inherit PowerShell 7 module paths; use this Windows PowerShell module.
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force
$target=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design/DaVinci Resolve/Support/Workflow Integration Plugins/com.wutpeach.clackly'
function Assert-HostClosed {
    foreach($process in @(Get-CimInstance Win32_Process -Filter "Name='Resolve.exe' OR Name='electron.exe'")){
        if($process.Name -ieq 'Resolve.exe' -or !$process.ExecutablePath -or
            (Test-Path -LiteralPath (Join-Path (Split-Path (Split-Path $process.ExecutablePath)) 'Resolve.exe'))){
            throw 'Please save your work and close DaVinci Resolve and its Workflow plugins, then retry.'
        }
    }
}
function Assert-NoLinks([string]$Path){
    $current=[IO.Path]::GetFullPath($Path)
    while($current){
        if((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw ('Linked installation path is not supported: '+$current)}
        $current=Split-Path -Parent $current
    }
}
function Assert-Native([string]$Path){
    if(!(Test-Path -LiteralPath $Path -PathType Leaf)){throw 'Official SamplePlugin WorkflowIntegration.node is missing. Repair the Resolve installation first.'}
    Assert-NoLinks $Path
    # Cache-only Windows trust: signature checking must also work offline.
    if(!('ClacklyInnoTrust' -as [type])){
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ClacklyInnoTrust {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct FileInfo {
  public uint Size; public string Path; public IntPtr Handle, Subject;
 }
 [StructLayout(LayoutKind.Sequential)] struct Data {
  public uint Size; public IntPtr Policy, Sip; public uint UI, Revocation, Choice;
  public IntPtr File; public uint Action; public IntPtr State, Url; public uint Flags, Context;
 }
 [DllImport("wintrust.dll", ExactSpelling=true, PreserveSig=true)]
 static extern int WinVerifyTrust(IntPtr hwnd, ref Guid action, ref Data data);
 public static bool Verify(string path) {
  var f=new FileInfo {Size=(uint)Marshal.SizeOf(typeof(FileInfo)),Path=path};
  IntPtr p=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(FileInfo)));
  Marshal.StructureToPtr(f,p,false);
  var d=new Data {Size=(uint)Marshal.SizeOf(typeof(Data)),UI=2,Choice=1,File=p,Action=1,Flags=0x1000};
  var id=new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
  try {return WinVerifyTrust(new IntPtr(-1),ref id,ref d)==0;}
  finally {d.Action=2;WinVerifyTrust(new IntPtr(-1),ref id,ref d);Marshal.DestroyStructure(p,typeof(FileInfo));Marshal.FreeHGlobal(p);}
 }
}
'@
    }
    if(![ClacklyInnoTrust]::Verify($Path)){throw 'Official Native signature could not be verified using the local Windows certificate cache.'}
    $certificate=[Security.Cryptography.X509Certificates.X509Certificate2]::new([Security.Cryptography.X509Certificates.X509Certificate]::CreateFromSignedFile($Path))
    try{if($certificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -cnotin @('Blackmagic Design Pty Ltd','Blackmagic Design Pty Ltd.')){throw 'Native publisher is not Blackmagic Design.'}}finally{$certificate.Dispose()}
    $stream=[IO.File]::OpenRead($Path);$reader=[IO.BinaryReader]::new($stream)
    try{
        if($reader.ReadUInt16() -ne 23117){throw 'Native is not a Windows DLL.'}
        $stream.Position=60;$offset=$reader.ReadUInt32();$stream.Position=$offset
        if($reader.ReadUInt32() -ne 17744 -or $reader.ReadUInt16() -ne 34404){throw 'Native is not x64.'}
        $stream.Position=$offset+22
        if(($reader.ReadUInt16() -band 8192) -eq 0 -or $reader.ReadUInt16() -ne 523){throw 'Native is not an x64 DLL.'}
    }finally{$reader.Dispose()}
}
try{
    Assert-HostClosed
    Assert-NoLinks $target
    if($Mode -eq 'Prepare'){
        if(Test-Path -LiteralPath $target){
            $package=Get-Content -LiteralPath (Join-Path $target 'package.json') -Raw|ConvertFrom-Json
            $manifest=Get-Content -LiteralPath (Join-Path $target 'manifest.xml') -Raw
            if($package.name -cne 'clackly' -or $manifest -notmatch 'com[.]wutpeach[.]clackly'){throw 'The existing target is not a recognized Clackly installation.'}
            if([version]$package.version -gt [version]$ExpectedVersion){throw 'A newer Clackly is installed. Downgrade is not supported.'}
            foreach($entry in Get-ChildItem -LiteralPath $target -Recurse -Force){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'The existing plugin contains a linked path.'}}
        }
        $source=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design/DaVinci Resolve/Support/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node'
        Assert-Native $source
        [IO.Directory]::CreateDirectory($Work)|Out-Null
        $native=Join-Path $Work 'WorkflowIntegration.node'
        Copy-Item -LiteralPath $source -Destination $native -Force
        Assert-Native $native
        $hash=(Get-FileHash -LiteralPath $native).Hash
        if($hash -cne (Get-FileHash -LiteralPath $source).Hash){throw 'Native changed during copy.'}
        @{source=$source;sha256=$hash}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Work 'native.json') -Encoding UTF8
    }elseif($Mode -eq 'Verify'){
        $manifest=Get-Content -LiteralPath (Join-Path $target 'clackly-release.json') -Raw|ConvertFrom-Json
        if($manifest.package.version -cne $ExpectedVersion){throw 'Installed release version mismatch.'}
        foreach($file in $manifest.files){
            if($file.path -match '(^|/)[.][.](/|$)|^[\/]|:'){throw 'Invalid release inventory path.'}
            $path=Join-Path $target $file.path
            if((Get-Item -LiteralPath $path).Length -ne $file.size -or (Get-FileHash -LiteralPath $path).Hash -ine $file.sha256){throw ('Installed file verification failed: '+$file.path)}
        }
        $expected=Get-Content -LiteralPath (Join-Path $Work 'native.json') -Raw|ConvertFrom-Json
        $native=Join-Path $target 'workflow-plugin/WorkflowIntegration.node'
        if((Get-FileHash -LiteralPath $native).Hash -cne $expected.sha256){throw 'Installed Native mismatch.'}
        Assert-Native $native
    }
    [IO.File]::WriteAllText($Report,'PASS '+$Mode,[Text.UTF8Encoding]::new($false))
    exit 0
}catch{
    [IO.File]::WriteAllText($Report,$_.Exception.Message,[Text.UTF8Encoding]::new($false))
    exit 1
}
