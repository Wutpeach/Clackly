// R29: fixed native-hosted DLL, manually provisioned for this local trial.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;

public sealed class TrialBoundary : IDisposable {
    readonly List<IDisposable> held=new List<IDisposable>();
    public static string ApprovedPath {get {return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Clackly Setup R29", "Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.dll");}}
    internal static string LauncherPath {get {return Path.Combine(Path.GetDirectoryName(ApprovedPath),"Clackly-Setup-0.1.3-win-x64-CONTROLLED-LAUNCHER.exe");}}
    internal static string UserSid {get {return WindowsIdentity.GetCurrent().User.Value;}}
    internal static bool Elevated {get {return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);}}
    internal static string Digest(string path) {using(var f=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
    internal static void CheckHandoff(bool elevated,string[] args,string actualImage,string expectedImage) {
        if(!elevated)throw new Exception("trial-native-launcher-required");
        // The DLL is hosted inside the verified native image after CLR inputs
        // are cleared. Caller-provided SID/hash/parent arguments grant nothing.
        if(args.Length!=0||!String.Equals(actualImage,expectedImage,StringComparison.OrdinalIgnoreCase))throw new Exception("trial-native-host-required");
    }
    internal static void CheckPath(string actual,string expected) {
        if(!String.Equals(actual,expected,StringComparison.OrdinalIgnoreCase))throw new Exception("trial-protected-location-required");
    }
    internal static bool TrustedSid(string sid) {return sid=="S-1-5-18"||sid=="S-1-5-32-544"||sid=="S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";}
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr data,int length,out int needed);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
    internal static void CheckDefaultOwner(string sid){if(!TrustedSid(sid))throw new Exception("trial-token-default-owner-refused");}
    internal static void RequireTrustedDefaultOwner(){
        // New child files must not become owned by the split-token user SID:
        // an owner can rewrite a DACL even under a private parent directory.
        // Read-only qualification: do not change tokens, ACLs or system policy.
        IntPtr token;if(!OpenProcessToken(Process.GetCurrentProcess().Handle,8,out token))throw new Exception("trial-token-unverified");
        try {int needed;GetTokenInformation(token,4,IntPtr.Zero,0,out needed);if(needed<=0||needed>65536)throw new Exception("trial-token-unverified");
            IntPtr data=Marshal.AllocHGlobal(needed);
            try{if(!GetTokenInformation(token,4,data,needed,out needed))throw new Exception("trial-token-unverified");CheckDefaultOwner(new SecurityIdentifier(Marshal.ReadIntPtr(data)).Value);}finally{Marshal.FreeHGlobal(data);}
        }finally{CloseHandle(token);}
    }
    internal static void CheckAcl(FileSystemSecurity acl,bool leaf) {
        if(!TrustedSid(acl.GetOwner(typeof(SecurityIdentifier)).Value))throw new Exception("trial-untrusted-owner");
        FileSystemRights unsafeRights=FileSystemRights.Delete|FileSystemRights.DeleteSubdirectoriesAndFiles|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership;
        if(leaf)unsafeRights|=FileSystemRights.Write;
        foreach(FileSystemAccessRule r in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))) {
            if((r.PropagationFlags&PropagationFlags.InheritOnly)!=0)continue;
            if(r.AccessControlType==AccessControlType.Allow&&!TrustedSid(r.IdentityReference.Value)&&(r.FileSystemRights&unsafeRights)!=0)throw new Exception("trial-unprotected-path");
        }
    }
    internal void Protect(string path,bool directory) {
        SetupForm.Canonical(path);
        held.Add(directory?(IDisposable)SetupForm.HoldDirectory(path):new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read));
        CheckAcl(directory?(FileSystemSecurity)Directory.GetAccessControl(path):File.GetAccessControl(path),true);
        string parent=Path.GetDirectoryName(path);
        while(!String.IsNullOrEmpty(parent)) {
            held.Add(SetupForm.HoldDirectory(parent));CheckAcl(Directory.GetAccessControl(parent),false);
            string next=Path.GetDirectoryName(parent);if(next==parent)break;parent=next;
        }
        SetupForm.Canonical(path);
    }
    internal static TrialBoundary OpenLaunch(string[] args) {
        var lease=new TrialBoundary();
        try {
            string exe=Assembly.GetExecutingAssembly().Location;CheckPath(exe,ApprovedPath);lease.Protect(exe,false);
            // The launch directory must also deny untrusted file creation.
            lease.Protect(Path.GetDirectoryName(exe),true);
            CheckHandoff(Elevated,args,Process.GetCurrentProcess().MainModule.FileName,LauncherPath);
            lease.Protect(LauncherPath,false);RequireTrustedDefaultOwner();return lease;
        } catch {lease.Dispose();throw;}
    }
    internal static void VerifyResource(string path,string hash,long size){if(new FileInfo(path).Length!=size||Digest(path)!=hash)throw new Exception("resource-hash-mismatch");}
    internal static string CreateSession(string id) {
        if(!Elevated||!Regex.IsMatch(id,"^[a-f0-9]{32}$"))throw new Exception("trial-elevation-required");
        string root=Path.Combine(Path.GetDirectoryName(ApprovedPath),"Clackly-Setup-"+id);
        if(Directory.Exists(root)||File.Exists(root))throw new Exception("workspace-exists");
        Directory.CreateDirectory(root,PrivateDirectoryAcl());return root;
    }
    static DirectorySecurity PrivateDirectoryAcl() {
        var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);
        acl.SetOwner(new SecurityIdentifier("S-1-5-32-544"));
        foreach(string sid in new[]{"S-1-5-18","S-1-5-32-544"})acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
        return acl;
    }
    public static IDisposable OpenWorker(string code) {
#if CONTROLLED_TRIAL && !FIXTURE
        if(!Elevated)throw new Exception("trial-elevation-required");
        RequireTrustedDefaultOwner();
        CheckPath(typeof(TrialBoundary).Assembly.Location,ApprovedPath);
        string session=Path.GetDirectoryName(code);
        if(Path.GetDirectoryName(session)!=Path.GetDirectoryName(ApprovedPath)||!Regex.IsMatch(Path.GetFileName(session),"^Clackly-Setup-[a-f0-9]{32}$")||Path.GetFileName(code)!="code")throw new Exception("trial-worker-location-refused");
        var lease=new TrialBoundary();
        try {lease.Protect(ApprovedPath,false);lease.Protect(Path.GetDirectoryName(ApprovedPath),true);lease.Protect(session,true);lease.Protect(code,true);
            using(var r=new StreamReader(typeof(TrialBoundary).Assembly.GetManifestResourceStream("ResourceMap"),Encoding.UTF8)) {
                string line;while((line=r.ReadLine())!=null){string[] item=line.Split('|');if(item.Length!=3||!Regex.IsMatch(item[2],"^[A-Za-z0-9._-]+$"))throw new Exception("invalid-resource-map");
                    string file=Path.Combine(code,item[2]);lease.Protect(file,false);
                    VerifyResource(file,item[0],Int64.Parse(item[1]));}
            }return lease;
        }catch{lease.Dispose();throw;}
#else
        throw new Exception("local-candidate-gate");
#endif
    }
    public static IDisposable OpenInstallationNamespace(){
#if CONTROLLED_TRIAL && !FIXTURE
        if(!Elevated)throw new Exception("trial-elevation-required");RequireTrustedDefaultOwner();
        string scan=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),@"Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins");
        return OpenNamespace(scan);
#else
        throw new Exception("local-candidate-gate");
#endif
    }
#if CONTROLLED_TRIAL && !FIXTURE
    internal void HoldSharedDirectory(string path) {
        // Hold real directories against replacement without policing vendor ACLs.
        SetupForm.Canonical(path);
        while(!String.IsNullOrEmpty(path)) {
            held.Add(SetupForm.HoldDirectory(path));
            string parent=Path.GetDirectoryName(path);if(parent==path)break;path=parent;
        }
    }
    internal static TrialBoundary OpenNamespace(string scan) {
        var lease=new TrialBoundary();
        try{
            string transactions=scan+".Clackly Updates";
            foreach(string path in new[]{scan,transactions}){
                string existing=path;while(!Directory.Exists(existing)){if(File.Exists(existing))throw new Exception("target-unverified");existing=Path.GetDirectoryName(existing);if(String.IsNullOrEmpty(existing))throw new Exception("target-unverified");}
                lease.HoldSharedDirectory(existing);
            }
            // Only Clackly's own working directory needs a private DACL.
            // Never change an existing directory's permissions to force entry.
            Directory.CreateDirectory(transactions,PrivateDirectoryAcl());
            lease.HoldSharedDirectory(transactions);
            CheckAcl(Directory.GetAccessControl(transactions),true);
            string target=Path.Combine(scan,"com.wutpeach.clackly");
            if(Directory.Exists(target)){using(var targetCheck=new TrialBoundary())targetCheck.HoldSharedDirectory(target);}
            else if(File.Exists(target))throw new Exception("target-unverified");
            return lease;
        }catch{lease.Dispose();throw;}
    }
#endif
    public void Dispose(){for(int i=held.Count-1;i>=0;i--)held[i].Dispose();held.Clear();}
}
