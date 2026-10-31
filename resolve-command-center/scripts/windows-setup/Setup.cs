// Operate: native system controls, keyboard access and plain truthful states.
// Source / consent / irreversible move / independently reconciled outcome.
// This local candidate has production mutation compiled disabled. The separate
// fixture build visibly identifies inert roots and never selects live paths.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

internal static class Program {
    [STAThread] static int Main(string[] args) {
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        try {
#if FIXTURE
            if (args.Length!=2 || args[0]!="--fixture") throw new Exception("fixture-root-required");
            string fixture=Path.GetFullPath(args[1]);
            SetupForm.ValidateFixture(fixture);
            SetupForm form=new SetupForm(fixture);
#else
            if(args.Length!=0) throw new Exception("此本地候选不接受命令行覆盖参数。");
            SetupForm form=new SetupForm(null);
#endif
            Application.Run(form);return form.OutcomeCode;
        } catch(Exception e) {MessageBox.Show(e.Message,"Clackly Setup — 本地候选",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
    }
}

internal sealed class SetupForm:Form {
    readonly string id=Guid.NewGuid().ToString("N");
    readonly string fixture;string root;
    readonly List<IDisposable> locks=new List<IDisposable>();
    readonly JavaScriptSerializer json=new JavaScriptSerializer();
    readonly Label version=new Label(),stage=new Label(),description=new Label();
    readonly TextBox evidence=new TextBox();readonly Button action=new Button(),cancel=new Button();
    readonly CheckBox consent=new CheckBox();
    Process worker,inspector;string workerCreated,inspectorCreated;int workerExit=-999;
    bool active,irreversible,terminal;int sequence,inspectorSequence;string pendingStatus,pendingReason;
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
    readonly Label elapsed=new Label();DateTime phaseStarted;
    DateTime started;Dictionary<string,object> workerWitness;bool workerTerminalSeen,inspectorTerminalSeen;
    readonly object outputSync=new object();readonly Queue<string> workerLines=new Queue<string>(),inspectorLines=new Queue<string>();
    public int OutcomeCode=1;
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern uint GetFinalPathNameByHandle(SafeFileHandle file,StringBuilder path,uint count,uint flags);
    internal SetupForm(string fixtureRoot) {
        fixture=fixtureRoot;
        if(fixture!=null){ValidateFixture(fixture);locks.Add(HoldDirectory(fixture));ValidateFixture(fixture);}
        Text="Clackly Setup 0.1.3 — "+(fixture==null?"未签名本地候选":"隔离 FIXTURE（无真实安装）");
        Font=new Font("Microsoft YaHei UI",9F);AutoScaleMode=AutoScaleMode.Dpi;
        ClientSize=new Size(600,420);MinimumSize=new Size(480,400);StartPosition=FormStartPosition.CenterScreen;
        var layout=new TableLayoutPanel {Dock=DockStyle.Fill,Padding=new Padding(24),ColumnCount=1,RowCount=9};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        for(int i=5;i<9;i++) layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        var title=new Label {Text="安装 Clackly",AutoSize=true,Font=new Font(Font.FontFamily,18F,FontStyle.Bold),Margin=new Padding(0,0,0,14)};
        version.Text="当前版本：未知（尚未读取安装目录）    目标版本：0.1.3";version.AutoSize=true;version.Margin=new Padding(0,0,0,20);
        stage.Text="验证安装来源";stage.AutoSize=true;stage.Font=new Font(Font,FontStyle.Bold);stage.Margin=new Padding(0,0,0,8);
        elapsed.Text="尚未开始";elapsed.AutoSize=true;elapsed.Margin=new Padding(0,0,0,8);
        description.Text=fixture==null?"此 EXE 是未签名的 R24 本地候选。可验证原始官方 ZIP；真实安装仍被编译保护锁定。验证需要网络访问 GitHub。":"隔离测试使用惰性插件、模拟宿主与惰性 Native。不会读取或安装真实 Resolve 插件。";
        description.Dock=DockStyle.Fill;description.AutoSize=false;description.Margin=new Padding(0,0,0,16);
        consent.Text="我已保存工作，将自行退出 Resolve；继续后请等待文件核验。";consent.AutoSize=true;consent.Visible=fixture!=null;consent.Margin=new Padding(0,8,0,12);
        evidence.ReadOnly=true;evidence.Dock=DockStyle.Fill;evidence.AccessibleName="本地证据目录";evidence.Margin=new Padding(0,8,0,12);
        var buttons=new FlowLayoutPanel {AutoSize=true,Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,WrapContents=true};
        action.Text=fixture==null?"验证来源(&V)":"开始隔离测试(&T)";action.AutoSize=true;action.MinimumSize=new Size(120,32);action.Click+=(s,e)=>Act();
        cancel.Text="关闭(&C)";cancel.AutoSize=true;cancel.MinimumSize=new Size(90,32);cancel.Click+=(s,e)=>CancelOrClose();
        buttons.Controls.Add(action);buttons.Controls.Add(cancel);
        var note=new Label {AutoSize=true,Text=fixture==null?"本地候选 · asInvoker · 未签名 · 未公开发布":"FIXTURE · 无厂商代码执行 · 结果由事务与完整树核验",Margin=new Padding(0,12,0,0)};
        layout.Controls.Add(title);layout.Controls.Add(version);layout.Controls.Add(stage);layout.Controls.Add(elapsed);layout.Controls.Add(description);
        layout.Controls.Add(consent);layout.Controls.Add(evidence);layout.Controls.Add(buttons);layout.Controls.Add(note);Controls.Add(layout);
        AcceptButton=action;CancelButton=cancel;consent.CheckedChanged+=(s,e)=> {if(active&&!irreversible&&stage.Tag as string=="waiting")action.Enabled=consent.Checked;};
        layout.SizeChanged+=(s,e)=>{version.MaximumSize=new Size(Math.Max(1,layout.ClientSize.Width-48),0);consent.MaximumSize=version.MaximumSize;note.MaximumSize=version.MaximumSize;};
        FormClosing+=(s,e)=>{if(active){e.Cancel=true;CancelOrClose();}};
        FormClosed+=(s,e)=>{foreach(var handle in locks)handle.Dispose();};
        timer.Interval=150;timer.Tick+=(s,e)=>Tick();
#if FIXTURE
        Shown+=(s,e)=>BeginInvoke(new Action(()=>Act()));
#endif
    }
    static string Hash(Stream stream) {using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
    internal static void ValidateFixture(string path) {
        Canonical(path);
        string allowed=Path.Combine(Path.GetTempPath(),"Clackly-R24-Fixtures")+Path.DirectorySeparatorChar;
        string marker=Path.Combine(path,".clackly-r24-fixture");Canonical(marker);
        if(!path.StartsWith(allowed,StringComparison.OrdinalIgnoreCase)||File.ReadAllText(marker)!="INERT R24 ONLY")throw new Exception("fixture-root-refused");
    }
    static SafeFileHandle HoldDirectory(string path) {
        Canonical(path);
        var held=CreateFile(path,0x80000000,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
        if(held.IsInvalid){held.Dispose();throw new Exception("workspace-lock-failed");}
        var resolved=new StringBuilder(32768);uint n=GetFinalPathNameByHandle(held,resolved,(uint)resolved.Capacity,0);
        if(n==0||n>=resolved.Capacity||!String.Equals(resolved.ToString(),@"\\?\"+path.TrimEnd((char)92),StringComparison.OrdinalIgnoreCase)){held.Dispose();throw new Exception("target-unverified");}
        Canonical(path);return held;
    }
    static void Canonical(string path) {
        if(path!=Path.GetFullPath(path)||path.StartsWith(@"\\")||path.IndexOf(':',2)>=0)throw new Exception("target-unverified");
        string cur=Path.GetPathRoot(path);
        foreach(string part in path.Substring(cur.Length).Split('\\')) {
            if(part.Length==0)continue;if(part.IndexOfAny(new[]{'*','?'})>=0)throw new Exception("target-unverified");
            FileSystemInfo[] entries=new DirectoryInfo(cur).GetFileSystemInfos(part);
            if(entries.Length!=1||!String.Equals(entries[0].Name,part,StringComparison.OrdinalIgnoreCase)||(entries[0].Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("target-unverified");
            cur=entries[0].FullName;
        }
    }
    void Extract() {
        root=Path.Combine(Path.GetTempPath(),"Clackly-Setup-"+id);
        Canonical(Path.GetDirectoryName(root));if(Directory.Exists(root)||File.Exists(root))throw new Exception("workspace-exists");
        Directory.CreateDirectory(root);Canonical(root);
        locks.Add(HoldDirectory(root));
        string code=Path.Combine(root,"code");Directory.CreateDirectory(code);Canonical(code);
        locks.Add(HoldDirectory(code));
        Assembly a=Assembly.GetExecutingAssembly();
        using(var r=new StreamReader(a.GetManifestResourceStream("ResourceMap"),Encoding.UTF8)) {
            string line;while((line=r.ReadLine())!=null) {
                string[] item=line.Split('|');if(item.Length!=3||!Regex.IsMatch(item[2],@"^[A-Za-z0-9._-]+$"))throw new Exception("invalid-resource-map");
                string path=Path.Combine(code,item[2]);
                using(var input=a.GetManifestResourceStream(item[2]))
                using(var output=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None)){input.CopyTo(output);output.Flush(true);}
                Canonical(path);var held=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read);
                if(held.Length!=Int64.Parse(item[1])||Hash(held)!=item[0]){held.Dispose();throw new Exception("resource-hash-mismatch");}
                locks.Add(held);
            }
        }
        evidence.Text=root;
        Write("supervisor.json",new {id=id,pid=Process.GetCurrentProcess().Id,created=Process.GetCurrentProcess().StartTime.ToUniversalTime().ToString("o"),fixture=fixture!=null,productionMutationEnabled=false});
#if FIXTURE
        ValidateFixture(fixture);
        using(var output=new FileStream(Path.Combine(fixture,"session.txt"),FileMode.CreateNew,FileAccess.Write,FileShare.Read)){byte[] b=Encoding.UTF8.GetBytes(root);output.Write(b,0,b.Length);output.Flush(true);}
#endif
    }
    void Write(string name,object value) {
        using(var output=new FileStream(Path.Combine(root,name),FileMode.CreateNew,FileAccess.Write,FileShare.Read)){byte[] b=Encoding.UTF8.GetBytes(json.Serialize(value));output.Write(b,0,b.Length);output.Flush(true);}
    }
    static string Quote(string s){if(s.IndexOf('"')>=0||s.IndexOf('\r')>=0||s.IndexOf('\n')>=0)throw new Exception("invalid-path");return "\""+s+"\"";}
    Process StartChild(string operation,bool inspecting) {
        string ps=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe");Canonical(ps);
        string args="-NoLogo -NoProfile -NonInteractive -File "+Quote(Path.Combine(root,@"code\SetupEntry.ps1"))+" -Operation "+operation+" -SessionRoot "+Quote(root)+" -Id "+id;
#if FIXTURE
        args+=" -FixtureRoot "+Quote(fixture);
#endif
        if(inspecting){foreach(string key in new[]{"baseline","context","result","journal"}){string v=workerWitness!=null&&workerWitness.ContainsKey(key)?Convert.ToString(workerWitness[key]):"absent";if(!Regex.IsMatch(v,@"^(absent|[a-f0-9]{64})$"))throw new Exception("recovery-required");args+=" -"+Char.ToUpperInvariant(key[0])+key.Substring(1)+"Digest "+v;}}
        var info=new ProcessStartInfo(ps,args){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,RedirectStandardInput=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8,WorkingDirectory=Path.Combine(root,"code")};
        foreach(string k in new[]{"NODE_OPTIONS","NODE_PATH","ELECTRON_RUN_AS_NODE","ELECTRON_EXTRA_LAUNCH_ARGS","PSModulePath"})info.EnvironmentVariables.Remove(k);
        Process p=new Process{StartInfo=info};int outputLength=0;
        p.OutputDataReceived+=(s,e)=>{if(e.Data==null)return;if(Interlocked.Add(ref outputLength,e.Data.Length)>65536)return;lock(outputSync){(inspecting?inspectorLines:workerLines).Enqueue(e.Data);}};
        p.ErrorDataReceived+=(s,e)=>{};p.Start();if(inspecting)inspector=p;else worker=p;string created=p.StartTime.ToUniversalTime().ToString("o");
        if(inspecting)inspectorCreated=created;else workerCreated=created;
        Write(inspecting?"inspector-process.json":"worker-process.json",new {id=id,pid=p.Id,created=created,image=ps});
        p.StandardInput.Close();p.BeginOutputReadLine();p.BeginErrorReadLine();return p;
    }
    void Act() {
        if(terminal){Close();return;}
        if(active) {if(stage.Tag as string=="waiting"&&consent.Checked){Write("continue.request",new{id=id});action.Enabled=false;description.Text="请自行保存并退出 Resolve。安装器会持续等待并重新检查宿主状态。";}return;}
        try {Extract();active=true;started=DateTime.UtcNow;phaseStarted=started;action.Enabled=false;cancel.Text="取消(&C)";
#if FIXTURE
            worker=StartChild("Install",false);
#else
            worker=StartChild("Verify",false);
#endif
            timer.Start();
        } catch(Exception ex){if(worker!=null&&!worker.HasExited){irreversible=true;action.Enabled=false;cancel.Enabled=false;description.Text="监督记录异常，执行器可能仍在运行。请保留此窗口与全部证据；不自动终止或重试。";timer.Start();}else Finish("failed",ex.Message);}
    }
    void CancelOrClose() {
        if(!active){Close();return;}
        if(irreversible){description.Text="文件替换已开始，关闭和取消暂不可用。请等待完整核验；若中断，保留证据并进行独立恢复审查。";return;}
        if(!File.Exists(Path.Combine(root,"cancel.request")))Write("cancel.request",new{id=id});
        cancel.Enabled=false;description.Text="已请求取消。正在等待执行器确认安全终态，请勿结束进程。";
    }
    void Receive(string line,bool inspecting) {
        try {
            var row=json.Deserialize<Dictionary<string,object>>(line);Process p=inspecting?inspector:worker;
            string created=inspecting?inspectorCreated:workerCreated;
            if(p==null||Convert.ToString(row["id"])!=id||Convert.ToInt32(row["pid"])!=p.Id||Convert.ToString(row["created"])!=created)return;
            string kind=Convert.ToString(row["event"]);
            if(kind=="terminal"){if(!inspecting&&row.ContainsKey("witness")){workerWitness=row["witness"] as Dictionary<string,object>;workerTerminalSeen=true;}if(inspecting){pendingStatus=Convert.ToString(row["status"]);pendingReason=Convert.ToString(row["reason"]);inspectorTerminalSeen=true;}return;}
            int n=Convert.ToInt32(row["sequence"]);if(n<=(inspecting?inspectorSequence:sequence))return;if(inspecting)inspectorSequence=n;else sequence=n;phaseStarted=DateTime.UtcNow;
            stage.Tag=kind;version.Text="当前版本："+Convert.ToString(row["current"])+"    目标版本：0.1.3";
            if(kind=="verifying"){stage.Text="正在验证官方来源与完整文件清单";description.Text="核对 GitHub Release / Asset / SHA-256、版本、来源提交与 Runtime。网络或身份无法核验时安全停止。";}
            if(kind=="source-checked"){stage.Text="官方 ZIP 与完整文件清单已核验";description.Text="来源核验完成。正在进入本地安装资格检查；尚未确认安装成功。";}
            if(kind=="preparing"){stage.Text="正在检查安装位置与保留文件";description.Text="读取原安装树、配置和历史事务，核对是否具备安全安装条件。";}
            if(kind=="prepared"){stage.Text="暂存文件与 Native 已核验";description.Text="正在再次检查原目录和宿主状态，随后开始事务替换。";}
            if(kind=="checking"||kind=="transaction-checked"){stage.Text="正在核验安装后的完整文件";description.Text="事务仍在进行。需要等待执行器自然退出和新的独立检查进程确认结果。";}
            if(kind=="inspecting"){stage.Text="执行器已退出，独立检查官方来源";description.Text="新的检查进程正在重新核对官方 ZIP、完整清单与原监督凭据。";}
            if(kind=="inspect-transaction"){stage.Text="独立检查事务与新旧完整文件树";description.Text="正在重新取得锁并检查实际目录和备份，尚未确认最终结果。";}
            if(kind=="waiting"){stage.Text="等待您保存工作并退出 Resolve";description.Text="请先保存工作。确认后安装器仍会独立等待宿主退出，并在文件移动前重新检查。";action.Text="确认并等待(&W)";action.Enabled=consent.Checked;}
            if(kind=="staging"){stage.Text="准备安装与验证 Native";description.Text="尚未替换旧版，可请求取消。完成后进入保留完整旧树的事务替换。";action.Enabled=false;}
            if(kind=="installing"){irreversible=true;stage.Text="正在替换文件并核验";description.Text="取消截止点已过。请保持此窗口打开，等待实际执行器退出与独立核验。";action.Enabled=false;cancel.Enabled=false;}
#if FIXTURE
            CaptureFixture(kind);
            if(kind=="waiting" && !File.Exists(Path.Combine(fixture,"manual-consent"))){consent.Checked=true;Act();}
#endif
        } catch { /* Invalid stdout never advances trusted state. */ }
    }
    void DrainOutput(bool inspecting) {
        string[] lines;lock(outputSync){var queue=inspecting?inspectorLines:workerLines;lines=queue.ToArray();queue.Clear();}
        foreach(string line in lines)Receive(line,inspecting);
    }
    void Tick() {
        try {
            DrainOutput(false);DrainOutput(true);
            elapsed.Text="已用时 "+(DateTime.UtcNow-started).ToString(@"mm\:ss")+" · 当前阶段 "+(DateTime.UtcNow-phaseStarted).ToString(@"mm\:ss");
            if(worker!=null&&inspector==null&&worker.HasExited){worker.WaitForExit();DrainOutput(false);workerExit=worker.ExitCode;
                Write("worker-exit.json",new{id=id,pid=worker.Id,created=workerCreated,exitCode=workerExit,observed=DateTime.UtcNow.ToString("o")});
                if(!workerTerminalSeen||workerWitness==null){Finish("failed","recovery-required");return;}
                phaseStarted=DateTime.UtcNow;stage.Text="执行器已退出，独立核验持久事务与完整文件树";irreversible=true;cancel.Enabled=false;
                inspector=StartChild("Inspect",true);return;}
            if(inspector!=null&&inspector.HasExited){inspector.WaitForExit();DrainOutput(true);
                bool expected=workerExit==((pendingStatus=="failed"||pendingStatus=="rolled-back")?1:0);
                if(inspector.ExitCode!=0||!inspectorTerminalSeen||pendingStatus==null||!expected)Finish("failed","recovery-required");
                else Finish(pendingStatus,pendingReason);return;}
            if(DateTime.UtcNow-started>TimeSpan.FromMinutes(25)){stage.Text="执行时间超限，需要保留证据";description.Text=(inspector!=null?"执行器已退出，独立检查仍未完成。":"执行器仍未取得安全终态。")+"此窗口继续监督；保留全部证据，由维护者审查，不自动终止或重试。";irreversible=true;cancel.Enabled=false;}
        } catch {irreversible=true;cancel.Enabled=false;action.Enabled=false;stage.Text="执行状态无法核实，需要保留证据";description.Text="监督检查遇到异常，尚未取得安全终态。保持窗口打开；禁止自动终止、清理或重试。";}
    }
    void Finish(string status,string reason) {
        active=false;terminal=true;timer.Stop();elapsed.Text="总用时 "+(DateTime.UtcNow-started).ToString(@"mm\:ss");OutcomeCode=(status=="installed"||status=="cancelled"||status=="source-verified")?0:1;
        stage.Tag=status;stage.Text=status=="installed"?"隔离安装完成，完整文件核验通过":status=="cancelled"?"已安全取消":status=="rolled-back"?"安装失败，已恢复完整旧版":status=="source-verified"?"官方来源验证通过；真实安装保持锁定":"安装未完成";
        if(status=="installed")version.Text="当前版本：0.1.3（隔离核验通过）    目标版本：0.1.3";
        description.Text=status=="source-verified"?"原样 0.1.3 官方 ZIP 已核验。此未签名本地候选未读取真实安装目录或 Native，也不会执行真实安装。签名、旧端对账与真实宿主验收仍待单独批准。":status=="installed"?"执行器已真实退出。独立检查进程重新核对事务和所有新旧文件；如有旧版本，其完整文件树保留在隔离备份中。这不代表真实 Resolve 安装通过。":status=="cancelled"?"执行器已退出，原安装树保持完整。惰性证据与暂存文件保留。":status=="rolled-back"?"独立检查已确认旧版所有文件恢复。证据、暂存与失败树保留，未自动重试。":"原因："+reason+"。保留全部记录；未知事务需独立对账，禁止通过删除 pointer 或备份重试。";
        action.Text="关闭(&C)";action.Enabled=true;cancel.Visible=false;consent.Enabled=false;
        if(root!=null){try{Write("supervisor-terminal.json",new{id=id,status=status,reason=reason,workerExitCode=workerExit,inspectorExitCode=inspector==null?-999:inspector.ExitCode,pid=Process.GetCurrentProcess().Id,created=Process.GetCurrentProcess().StartTime.ToUniversalTime().ToString("o"),observed=DateTime.UtcNow.ToString("o")});}catch{}}
#if FIXTURE
        CaptureFixture("terminal");if(!File.Exists(Path.Combine(fixture,"keep-open")))BeginInvoke(new Action(()=>Close()));
#endif
    }
#if FIXTURE
    void CaptureFixture(string state){try{ValidateFixture(fixture);using(var output=new FileStream(Path.Combine(fixture,"ui-"+state+".json"),FileMode.CreateNew,FileAccess.Write,FileShare.Read)){byte[] b=Encoding.UTF8.GetBytes(json.Serialize(new{fixture=true,stage=stage.Text,version=version.Text,description=description.Text,action=action.Text,actionEnabled=action.Enabled,cancelEnabled=cancel.Enabled,consent=consent.Checked}));output.Write(b,0,b.Length);output.Flush(true);}using(var bmp=new Bitmap(Width,Height)){DrawToBitmap(bmp,new Rectangle(0,0,Width,Height));using(var output=new FileStream(Path.Combine(fixture,"fixture-"+state+".png"),FileMode.CreateNew,FileAccess.Write,FileShare.Read)){bmp.Save(output,System.Drawing.Imaging.ImageFormat.Png);}}}catch{}}
#endif
}
