// Fixed one-time trial bootstrap. CLR loads only after native authentication
// and environment cleaning; the managed supervisor owns the sole engine.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <sddl.h>
#include <aclapi.h>
#include <bcrypt.h>
#include <string>
#include <vector>
#include <stdexcept>
#include <iostream>
#include "trial-pin.h"
#pragma comment(lib,"shell32.lib")
#pragma comment(lib,"advapi32.lib")
#pragma comment(lib,"ole32.lib")
#pragma comment(lib,"bcrypt.lib")
#pragma comment(lib,"user32.lib")
using std::wstring;
static void Require(bool ok,const char* why){if(!ok)throw std::runtime_error(why);}
struct Handles {std::vector<HANDLE> all;~Handles(){for(auto h:all)CloseHandle(h);}};
static bool Equal(const wstring&a,const wstring&b){return _wcsicmp(a.c_str(),b.c_str())==0;}
static wstring Known(REFKNOWNFOLDERID id){PWSTR p=nullptr;Require(SUCCEEDED(SHGetKnownFolderPath(id,0,nullptr,&p)),"known-folder-unverified");wstring s(p);CoTaskMemFree(p);return s;}
static wstring Parent(const wstring&p){if(p.size()<=3)return L"";auto n=p.find_last_of(L'\\');return n==2?p.substr(0,3):p.substr(0,n);}
static wstring Directory(){return Known(FOLDERID_ProgramFiles)+L"\\Clackly Setup R29";}
static wstring Launcher(){return Directory()+L"\\Clackly-Setup-0.1.3-win-x64-CONTROLLED-LAUNCHER.exe";}
static wstring Core(){return Directory()+L"\\Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.dll";}
static bool Trusted(PSID sid){
    for(auto text:{L"S-1-5-18",L"S-1-5-32-544",L"S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"}){PSID expected=nullptr;Require(ConvertStringSidToSidW(text,&expected)!=0,"sid-unverified");bool same=EqualSid(sid,expected)!=0;LocalFree(expected);if(same)return true;}return false;
}
static void CheckAcl(PSID owner,PACL dacl,bool leaf){
    Require(owner&&Trusted(owner)&&dacl,"unprotected-owner-or-null-DACL");
    DWORD unsafe=DELETE|FILE_DELETE_CHILD|WRITE_DAC|WRITE_OWNER;if(leaf)unsafe|=FILE_WRITE_DATA|FILE_APPEND_DATA|FILE_WRITE_EA|FILE_WRITE_ATTRIBUTES;
    GENERIC_MAPPING mapping={FILE_GENERIC_READ,FILE_GENERIC_WRITE,FILE_GENERIC_EXECUTE,FILE_ALL_ACCESS};
    for(DWORD i=0;i<dacl->AceCount;i++){void*raw=nullptr;Require(GetAce(dacl,i,&raw)!=0,"acl-unverified");auto head=(ACE_HEADER*)raw;
        if(head->AceFlags&INHERIT_ONLY_ACE)continue;if(head->AceType==ACCESS_DENIED_ACE_TYPE||head->AceType==SYSTEM_AUDIT_ACE_TYPE)continue;
        Require(head->AceType==ACCESS_ALLOWED_ACE_TYPE,"unsupported-ACL");auto ace=(ACCESS_ALLOWED_ACE*)raw;DWORD mask=ace->Mask;MapGenericMask(&mask,&mapping);
        Require(Trusted(&ace->SidStart)||(mask&unsafe)==0,"unprotected-ACL");
    }
}
static HANDLE Hold(Handles&lease,const wstring&path,bool directory,bool leaf,bool acl=true){
    HANDLE h=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ|(directory?FILE_SHARE_WRITE:0),nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT|(directory?FILE_FLAG_BACKUP_SEMANTICS:0),nullptr);
    Require(h!=INVALID_HANDLE_VALUE,"path-hold-failed");lease.all.push_back(h);
    BY_HANDLE_FILE_INFORMATION info{};Require(GetFileInformationByHandle(h,&info)!=0,"path-identity-unverified");
    Require(!(info.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)&&bool(info.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)==directory,"reparse-or-type-refused");
    Require(directory||info.nNumberOfLinks==1,"hardlink-refused");
    wchar_t finalPath[32768];DWORD n=GetFinalPathNameByHandleW(h,finalPath,32768,0);Require(n&&n<32768,"path-identity-unverified");
    wstring expected=path;if(expected.size()==3&&expected[2]==L'\\')expected.pop_back();
    wstring actual=finalPath;if(actual.size()==7&&actual.back()==L'\\')actual.pop_back();
    Require(n&&n<32768&&Equal(actual,L"\\\\?\\"+expected),"path-identity-unverified");
    if(acl){PSID owner=nullptr;PACL dacl=nullptr;PSECURITY_DESCRIPTOR sd=nullptr;
        Require(GetSecurityInfo(h,SE_FILE_OBJECT,OWNER_SECURITY_INFORMATION|DACL_SECURITY_INFORMATION,&owner,nullptr,&dacl,nullptr,&sd)==ERROR_SUCCESS,"acl-unverified");
        try{CheckAcl(owner,dacl,leaf);}catch(...){LocalFree(sd);throw;}LocalFree(sd);}
    return h;
}
static HANDLE Protect(Handles&lease,const wstring&path,bool directory){
    std::vector<wstring> parents;for(wstring p=Parent(path);!p.empty();p=Parent(p))parents.push_back(p);
    for(auto i=parents.rbegin();i!=parents.rend();++i)Hold(lease,*i,true,false);return Hold(lease,path,directory,true);
}
static wstring Hash(HANDLE file){
    BCRYPT_ALG_HANDLE alg=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;Require(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0)>=0,"hash-provider-failed");
    DWORD size=0,count=0;std::vector<unsigned char> object;unsigned char result[32];
    try{Require(BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,(PUCHAR)&size,sizeof(size),&count,0)>=0,"hash-failed");object.resize(size);Require(BCryptCreateHash(alg,&hash,object.data(),size,nullptr,0,0)>=0,"hash-failed");
        LARGE_INTEGER zero{};Require(SetFilePointerEx(file,zero,nullptr,FILE_BEGIN)!=0,"hash-read-failed");unsigned char buffer[65536];DWORD read;
        for(;;){Require(ReadFile(file,buffer,sizeof(buffer),&read,nullptr)!=0,"hash-read-failed");if(!read)break;Require(BCryptHashData(hash,buffer,read,0)>=0,"hash-failed");}
        Require(BCryptFinishHash(hash,result,32,0)>=0,"hash-failed");
    }catch(...){if(hash)BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(alg,0);throw;}
    BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(alg,0);wstring text;const wchar_t*hex=L"0123456789abcdef";for(auto b:result){text+=hex[b>>4];text+=hex[b&15];}return text;
}
static std::vector<unsigned char> Token(HANDLE token,TOKEN_INFORMATION_CLASS kind){DWORD size=0;GetTokenInformation(token,kind,nullptr,0,&size);Require(size>0&&size<65536,"token-unverified");std::vector<unsigned char> data(size);Require(GetTokenInformation(token,kind,data.data(),size,&size)!=0,"token-unverified");return data;}
static wstring Sid(PSID sid){LPWSTR p=nullptr;Require(ConvertSidToStringSidW(sid,&p)!=0,"sid-unverified");wstring value(p);LocalFree(p);return value;}
static wstring User(){Handles h;HANDLE token;Require(OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token)!=0,"token-unverified");h.all.push_back(token);auto info=Token(token,TokenUser);return Sid(((TOKEN_USER*)info.data())->User.Sid);}
static bool Admin(){SID_IDENTIFIER_AUTHORITY nt=SECURITY_NT_AUTHORITY;PSID sid=nullptr;Require(AllocateAndInitializeSid(&nt,2,SECURITY_BUILTIN_DOMAIN_RID,DOMAIN_ALIAS_RID_ADMINS,0,0,0,0,0,0,&sid)!=0,"token-unverified");BOOL member=FALSE;BOOL ok=CheckTokenMembership(nullptr,sid,&member);FreeSid(sid);Require(ok!=0,"token-unverified");return member!=FALSE;}
static void DefaultOwner(){Handles h;HANDLE token;Require(OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token)!=0,"token-unverified");h.all.push_back(token);auto info=Token(token,TokenOwner);Require(Trusted(((TOKEN_OWNER*)info.data())->Owner),"token-default-owner-refused");}
static void CheckPath(const wstring&actual,const wstring&expected){Require(Equal(actual,expected),"protected-location-required");}
static void Handoff(bool admin,const std::vector<wstring>&args){
    if(args.empty())return;
    Require(admin,"ordinary-arguments-refused");
    Require(args.size()==2&&args[0]==L"--handoff","elevated-handoff-refused");
}
static const wchar_t* UacError(DWORD code){return code==ERROR_CANCELLED?L"已取消管理员授权；未启动安装执行器。":L"管理员授权未完成；未启动安装执行器。";}
static std::vector<wchar_t> CleanEnvironment(){
    wchar_t windows[MAX_PATH],system[MAX_PATH];Require(GetWindowsDirectoryW(windows,MAX_PATH)&&GetSystemDirectoryW(system,MAX_PATH),"system-path-unverified");
    // No inherited CLR profiler/AppDomain, startup hook, module or DLL paths.
    // The core creates its private TEMP before starting any PowerShell child.
    std::vector<wstring> values={L"APPDATA="+Known(FOLDERID_RoamingAppData),L"LOCALAPPDATA="+Known(FOLDERID_LocalAppData),L"PATH="+wstring(system)+L";"+windows,L"ProgramData="+Known(FOLDERID_ProgramData),L"ProgramFiles="+Known(FOLDERID_ProgramFiles),L"SystemDrive="+wstring(windows,2),L"SystemRoot="+wstring(windows),L"USERPROFILE="+Known(FOLDERID_Profile),L"windir="+wstring(windows)};
    std::vector<wchar_t> block;for(auto&s:values){block.insert(block.end(),s.begin(),s.end());block.push_back(0);}block.push_back(0);return block;
}
static PROCESS_INFORMATION StartCleanProcess(const wstring&exe,wstring command,const wstring&dir,DWORD flags=0){
    auto environment=CleanEnvironment();STARTUPINFOW startup{sizeof(startup)};PROCESS_INFORMATION process{};
    Require(CreateProcessW(exe.c_str(),&command[0],nullptr,nullptr,FALSE,CREATE_UNICODE_ENVIRONMENT|flags,environment.data(),dir.c_str(),&startup,&process)!=0,"core-process-not-started");return process;
}
#include "SetupHandoff.h"
// Stable .NET Framework hosting ABI; the runtime is a Windows prerequisite.
// Resolve the system shim explicitly; no SDK or downloaded runtime is needed.
struct ClrHost : IUnknown {
    virtual HRESULT STDMETHODCALLTYPE Start()=0;
    virtual HRESULT STDMETHODCALLTYPE Stop()=0;
    virtual HRESULT STDMETHODCALLTYPE SetHostControl(void*)=0;
    virtual HRESULT STDMETHODCALLTYPE GetCLRControl(void**)=0;
    virtual HRESULT STDMETHODCALLTYPE UnloadAppDomain(DWORD,BOOL)=0;
    virtual HRESULT STDMETHODCALLTYPE ExecuteInAppDomain(DWORD,HRESULT(STDMETHODCALLTYPE*)(void*),void*)=0;
    virtual HRESULT STDMETHODCALLTYPE GetCurrentAppDomainId(DWORD*)=0;
    virtual HRESULT STDMETHODCALLTYPE ExecuteApplication(LPCWSTR,DWORD,LPCWSTR*,DWORD,LPCWSTR*,DWORD*)=0;
    virtual HRESULT STDMETHODCALLTYPE ExecuteInDefaultAppDomain(LPCWSTR,LPCWSTR,LPCWSTR,LPCWSTR,DWORD*)=0;
};
static int HostManaged(const wstring&assembly,const wchar_t*method,const wstring&argument){
    ClearStartupEnvironment();Require(SUCCEEDED(CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED)),"STA-initialization-failed");
    wchar_t system[MAX_PATH];Require(GetSystemDirectoryW(system,MAX_PATH)!=0,"system-path-unverified");HMODULE shim=LoadLibraryExW((wstring(system)+L"\\mscoree.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_SYSTEM32);Require(shim!=nullptr,"CLR-shim-unavailable");
    using Bind=HRESULT(STDAPICALLTYPE*)(LPCWSTR,LPCWSTR,DWORD,REFCLSID,REFIID,void**);auto bind=(Bind)GetProcAddress(shim,"CorBindToRuntimeEx");Require(bind!=nullptr,"CLR-bootstrap-unavailable");
    const GUID clsid={0x90f1a06e,0x7712,0x4762,{0x86,0xb5,0x7a,0x5e,0xba,0x6b,0xdb,0x02}},iid={0x90f1a06c,0x7712,0x4762,{0x86,0xb5,0x7a,0x5e,0xba,0x6b,0xdb,0x02}};
    ClrHost*host=nullptr;DWORD exit=1;Require(SUCCEEDED(bind(L"v4.0.30319",L"wks",0,clsid,iid,(void**)&host))&&SUCCEEDED(host->Start()),"CLR-start-failed");
    HRESULT result=host->ExecuteInDefaultAppDomain(assembly.c_str(),L"TrialEntry",method,argument.c_str(),&exit);host->Release();CoUninitialize();Require(SUCCEEDED(result),"managed-trial-failed");return exit;
}
#ifndef INERT_TEST
int WINAPI wWinMain(HINSTANCE,HINSTANCE,PWSTR,int){try{
    wchar_t image[32768];DWORD n=GetModuleFileNameW(nullptr,image,32768);Require(n&&n<32768,"image-unverified");CheckPath(image,Launcher());
    Handles held;Protect(held,Launcher(),false);Protect(held,Directory(),true);auto core=Protect(held,Core(),false);
    Require(Hash(core)==TRIAL_CORE_SHA256,"approved-core-hash-mismatch");
    int argc=0;LPWSTR*argv=CommandLineToArgvW(GetCommandLineW(),&argc);Require(argv!=nullptr,"arguments-unverified");std::vector<wstring> args;for(int i=1;i<argc;i++)args.push_back(argv[i]);LocalFree(argv);
    bool admin=Admin();
    Handoff(admin,args);
    if(args.empty()){
        if(MessageBoxW(nullptr,L"本次清洁试装须已获现场确认。请核对启动器和配套 DLL 的精确 SHA。继续将向 Windows 请求同账户管理员运行；是否显示 UAC 提示由现有系统设置决定。取消不会安装。",L"Clackly R29 — 本机清洁试装",MB_OKCANCEL|MB_ICONWARNING)!=IDOK)return ERROR_CANCELLED;
        wstring name=PipeName();HANDLE pipe=Server(held,name);wstring params=L"--handoff "+name;SHELLEXECUTEINFOW run{sizeof(run)};run.fMask=SEE_MASK_NOCLOSEPROCESS|SEE_MASK_NOASYNC;run.lpVerb=L"runas";wstring exe=Launcher(),dir=Directory();run.lpFile=exe.c_str();run.lpParameters=params.c_str();run.lpDirectory=dir.c_str();run.nShow=SW_SHOWNORMAL;
        if(!ShellExecuteExW(&run)){DWORD error=GetLastError();MessageBoxW(nullptr,UacError(error),L"Clackly R29",MB_OK|MB_ICONINFORMATION);return error==ERROR_CANCELLED?ERROR_CANCELLED:1;}
        Require(run.hProcess!=nullptr,"elevated-process-unverified");held.all.push_back(run.hProcess);Accept(pipe,GetProcessId(run.hProcess),Launcher(),true);WaitForSingleObject(run.hProcess,INFINITE);DWORD exit;Require(GetExitCodeProcess(run.hProcess,&exit)!=0,"elevated-exit-unverified");return exit;
    }
    Connect(args[1],Launcher(),-1);DefaultOwner();return HostManaged(Core(),L"Run",L"");
}catch(const std::exception&e){wstring why;for(const char*p=e.what();*p;p++)why+=*p;MessageBoxW(nullptr,(L"受控试装已停止，未取得安装成功结论。请保留工件与记录："+why).c_str(),L"Clackly R29 — 停止",MB_OK|MB_ICONERROR);return 1;}}
#else
static int passed=0;static void Pass(const char*name){std::cout<<"PASS "<<name<<std::endl;passed++;}
template<class F>static void Reject(F fn,const char*reason){try{fn();}catch(const std::exception&e){Require(std::string(e.what())==reason,"wrong-refusal");return;}throw std::runtime_error("unexpected-acceptance");}
static void Sddl(const wchar_t*text,bool leaf){PSECURITY_DESCRIPTOR sd=nullptr;Require(ConvertStringSecurityDescriptorToSecurityDescriptorW(text,SDDL_REVISION_1,&sd,nullptr)!=0,"test-SDDL");PSID owner=nullptr;PACL dacl=nullptr;BOOL def,present;GetSecurityDescriptorOwner(sd,&owner,&def);GetSecurityDescriptorDacl(sd,&present,&dacl,&def);try{CheckAcl(owner,dacl,leaf);}catch(...){LocalFree(sd);throw;}LocalFree(sd);}
int wmain(int argc,wchar_t**argv){try{
    bool child=argc==3&&wstring(argv[1])==L"--child",peer=argc==4&&wstring(argv[1])==L"--peer";Require(argc==2||child||peer,"inert-root-required");wstring root=argv[peer?3:(child?2:1)],allowed=Known(FOLDERID_LocalAppData)+L"\\Temp\\Clackly-R24-Fixtures\\";Require(root.find(allowed)==0,"inert-root-refused");
    Handles held;auto marker=Hold(held,root+L"\\.clackly-r24-fixture",false,true,false);char text[32];DWORD read;Require(ReadFile(marker,text,32,&read,nullptr)&&std::string(text,read)=="INERT R24 ONLY","inert-marker-refused");
    if(child){wchar_t value[1024];for(auto key:{L"COR_ENABLE_PROFILING",L"COR_PROFILER",L"APPDOMAIN_MANAGER_ASM",L"APPDOMAIN_MANAGER_TYPE",L"PSModulePath",L"NODE_OPTIONS"})Require(GetEnvironmentVariableW(key,value,1024)==0,"child-inherited-environment");return 0;}
    if(peer){wchar_t image[32768];Require(GetModuleFileNameW(nullptr,image,32768)!=0,"test-image-unverified");Connect(argv[2],image,Admin());return 0;}
    CheckPath(Launcher(),Launcher());Reject([]{CheckPath(Core(),Launcher());},"protected-location-required");Pass("fixed-launcher-path-policy-SIMULATED");
    Handoff(false,{});Handoff(true,{});Handoff(true,{L"--handoff",PipeName()});Pass("handoff-shape-is-not-authentication-SIMULATED");
    Reject([]{Handoff(false,{L"--handoff",L"SID",L"SHA"});},"ordinary-arguments-refused");Pass("arguments-cannot-grant-token-SIMULATED");
    for(auto args:{std::vector<wstring>{L"--handoff"},std::vector<wstring>{L"--handoff",L"SID",L"SHA"},std::vector<wstring>{L"--other",L"NAME"}}){Reject([&]{Handoff(true,args);},"elevated-handoff-refused");Pass("old-self-reported-handoff-refused-SIMULATED");}
    Sddl(L"O:BAG:BAD:(A;;FA;;;BA)(A;;FR;;;BU)",true);Pass("protected-ACL-SIMULATED");
    Reject([]{Sddl(L"O:BUG:BUD:(A;;FA;;;BA)",true);},"unprotected-owner-or-null-DACL");Pass("untrusted-owner-refused-SIMULATED");
    Reject([]{Sddl(L"O:BAG:BAD:(A;;FW;;;BU)",true);},"unprotected-ACL");Pass("untrusted-write-refused-SIMULATED");
    Reject([]{Sddl(L"O:BAG:BAD:(A;;0x40;;;BU)",false);},"unprotected-ACL");Pass("ancestor-delete-child-refused-SIMULATED");
    Sddl(L"O:BAG:BAD:(A;;0x4;;;BU)",false);Pass("ancestor-create-alone-not-replacement-SIMULATED");
    auto environment=CleanEnvironment();for(auto&s:{L"COR_ENABLE_PROFILING",L"COR_PROFILER",L"APPDOMAIN_MANAGER_ASM",L"APPDOMAIN_MANAGER_TYPE",L"COMPLUS_Version",L"PSModulePath",L"NODE_OPTIONS"}){wstring probe;for(auto c:environment)probe+=c?c:L'|';Require(probe.find(s)==wstring::npos,"inherited-environment");}Pass("actual-allowlist-excludes-CLR-and-script-injection-environment");
    for(auto key:{L"COR_ENABLE_PROFILING",L"APPDOMAIN_MANAGER_ASM",L"PSModulePath",L"NODE_OPTIONS"})Require(SetEnvironmentVariableW(key,L"INERT_TEST_ONLY")!=0,"test-environment-failed");
    wchar_t image[32768];Require(GetModuleFileNameW(nullptr,image,32768)!=0,"test-image-unverified");auto inert=StartCleanProcess(image,L"\""+wstring(image)+L"\" --child \""+root+L"\"",root,CREATE_NO_WINDOW);held.all.push_back(inert.hProcess);held.all.push_back(inert.hThread);Require(WaitForSingleObject(inert.hProcess,15000)==WAIT_OBJECT_0,"test-child-timeout-preserve");DWORD code;Require(GetExitCodeProcess(inert.hProcess,&code)&&code==0,"test-child-failed");Pass("actual-independent-child-uses-clean-environment-no-elevation");
    auto coreFile=Hold(held,TRIAL_CORE_BUILD_PATH,false,true,false);Require(Hash(coreFile)==TRIAL_CORE_SHA256,"core-hash-drift");Pass("actual-exact-final-core-pin");
    wstring file=root+L"\\inert-resource";{HANDLE h=CreateFileW(file.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);Require(h!=INVALID_HANDLE_VALUE,"test-create");DWORD written;WriteFile(h,"inert",5,&written,nullptr);CloseHandle(h);}
    auto resource=Hold(held,file,false,true,false);Require(Hash(resource)!=TRIAL_CORE_SHA256,"changed-core-accepted");Pass("actual-changed-core-hash-refused");
    HANDLE writer=CreateFileW(file.c_str(),GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,0,nullptr);Require(writer==INVALID_HANDLE_VALUE,"held-file-writable");Pass("actual-held-file-prevents-write");
    wstring dir=root+L"\\held-ancestor";Require(CreateDirectoryW(dir.c_str(),nullptr)!=0,"test-create-directory");Hold(held,dir,true,true,false);Require(!MoveFileW(dir.c_str(),(dir+L"-moved").c_str()),"held-parent-replaceable");Pass("actual-held-ancestor-prevents-rename");
    Require(wstring(UacError(ERROR_CANCELLED))!=UacError(ERROR_ACCESS_DENIED),"UAC-classification");Pass("UAC-cancel-denial-SIMULATED-no-ShellExecute");
    Peer(GetCurrentProcessId(),image,Admin());Reject([&]{Peer(GetCurrentProcessId(),L"wrong.exe",Admin());},"handoff-peer-image-refused");Pass("actual-OS-peer-image-check");
    Reject([&]{Peer(GetCurrentProcessId(),image,!Admin());},"handoff-peer-token-refused");Pass("actual-OS-peer-elevation-check");
    Reject([]{PipePath(L"SID SHA");},"handoff-name-refused");Pass("untrusted-pipe-name-refused");
    wstring name=PipeName();HANDLE pipe=Server(held,name);auto client=StartCleanProcess(image,L"\""+wstring(image)+L"\" --peer "+name+L" \""+root+L"\"",root,CREATE_NO_WINDOW);held.all.push_back(client.hProcess);held.all.push_back(client.hThread);Accept(pipe,client.dwProcessId,image,Admin());Require(WaitForSingleObject(client.hProcess,15000)==WAIT_OBJECT_0&&GetExitCodeProcess(client.hProcess,&code)&&code==0,"handoff-child-failed");Pass("actual-one-use-pipe-OS-PIDs-same-user-challenge-no-UAC");
    Require(HostManaged(TRIAL_FIXTURE_BUILD_PATH,L"Probe",root)==29,"CLR-host-probe-failed");Pass("actual-native-clears-environment-before-hosting-CLR-in-process");
    std::cout<<"TOTAL "<<passed<<" REAL_UAC=0 REAL_ELEVATION=0"<<std::endl;return 0;
}catch(const std::exception&e){std::cout<<"FAIL "<<e.what()<<std::endl;return 1;}}
#endif
