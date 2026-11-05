// One-use UAC handoff. Peer PIDs come from Windows, never command-line claims.
static wstring PipeName(){unsigned char bytes[16];Require(BCryptGenRandom(nullptr,bytes,16,BCRYPT_USE_SYSTEM_PREFERRED_RNG)>=0,"random-failed");wstring name=L"Clackly-R29-";const wchar_t*hex=L"0123456789abcdef";for(auto b:bytes){name+=hex[b>>4];name+=hex[b&15];}return name;}
static wstring PipePath(const wstring&name){Require(name.size()==44&&name.substr(0,12)==L"Clackly-R29-","handoff-name-refused");for(size_t i=12;i<name.size();i++)Require((name[i]>=L'0'&&name[i]<=L'9')||(name[i]>=L'a'&&name[i]<=L'f'),"handoff-name-refused");return LR"(\\.\pipe\)"+name;}
static void Peer(DWORD pid,const wstring&image,int elevated){
    Handles held;HANDLE process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid);Require(process!=nullptr,"handoff-peer-unavailable");held.all.push_back(process);
    wchar_t path[32768];DWORD size=32768;Require(QueryFullProcessImageNameW(process,0,path,&size)&&Equal(path,image),"handoff-peer-image-refused");
    HANDLE token;Require(OpenProcessToken(process,TOKEN_QUERY,&token)!=0,"handoff-token-unverified");held.all.push_back(token);
    auto user=Token(token,TokenUser);auto elevation=Token(token,TokenElevation);
    Require(Sid(((TOKEN_USER*)user.data())->User.Sid)==User()&&(elevated<0||int(bool(((TOKEN_ELEVATION*)elevation.data())->TokenIsElevated))==elevated),"handoff-peer-token-refused");
}
static HANDLE Server(Handles&held,const wstring&name){
    PSECURITY_DESCRIPTOR sd=nullptr;wstring sddl=L"D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;"+User()+L")";
    Require(ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(),SDDL_REVISION_1,&sd,nullptr)!=0,"handoff-security-failed");SECURITY_ATTRIBUTES security{sizeof(security),sd,FALSE};
    HANDLE pipe=CreateNamedPipeW(PipePath(name).c_str(),PIPE_ACCESS_DUPLEX|FILE_FLAG_OVERLAPPED|FILE_FLAG_FIRST_PIPE_INSTANCE,PIPE_TYPE_BYTE|PIPE_READMODE_BYTE|PIPE_REJECT_REMOTE_CLIENTS,1,256,256,5000,&security);LocalFree(sd);Require(pipe!=INVALID_HANDLE_VALUE,"handoff-server-failed");held.all.push_back(pipe);return pipe;
}
static void FinishIo(HANDLE pipe,OVERLAPPED&io,BOOL completed,DWORD error,DWORD expected){
    DWORD transferred=0;
    if(!completed){if(error!=ERROR_IO_PENDING){CloseHandle(io.hEvent);throw std::runtime_error("handoff-io-failed");}
        if(WaitForSingleObject(io.hEvent,10000)!=WAIT_OBJECT_0){CancelIoEx(pipe,&io);GetOverlappedResult(pipe,&io,&transferred,TRUE);CloseHandle(io.hEvent);throw std::runtime_error("handoff-timeout");}}
    BOOL ok=GetOverlappedResult(pipe,&io,&transferred,FALSE);CloseHandle(io.hEvent);Require(ok&&transferred==expected,"handoff-io-failed");
}
static void Transfer(HANDLE pipe,void*bytes,DWORD count,bool write){OVERLAPPED io{};io.hEvent=CreateEventW(nullptr,TRUE,FALSE,nullptr);Require(io.hEvent!=nullptr,"handoff-event-failed");BOOL done=write?WriteFile(pipe,bytes,count,nullptr,&io):ReadFile(pipe,bytes,count,nullptr,&io);DWORD error=GetLastError();FinishIo(pipe,io,done,error,count);}
static void Accept(HANDLE pipe,DWORD child,const wstring&image,bool elevated){
    OVERLAPPED io{};io.hEvent=CreateEventW(nullptr,TRUE,FALSE,nullptr);Require(io.hEvent!=nullptr,"handoff-event-failed");BOOL done=ConnectNamedPipe(pipe,&io);DWORD error=GetLastError();
    if(!done&&error==ERROR_PIPE_CONNECTED)CloseHandle(io.hEvent);else FinishIo(pipe,io,done,error,0);
    ULONG peer;Require(GetNamedPipeClientProcessId(pipe,&peer)&&peer==child,"handoff-child-refused");Peer(peer,image,elevated);
    unsigned char challenge[32],answer[32];Require(BCryptGenRandom(nullptr,challenge,32,BCRYPT_USE_SYSTEM_PREFERRED_RNG)>=0,"random-failed");Transfer(pipe,challenge,32,true);Transfer(pipe,answer,32,false);Require(memcmp(challenge,answer,32)==0,"handoff-challenge-refused");
}
static void Connect(const wstring&name,const wstring&image,int elevated){
    Handles held;wstring path=PipePath(name);Require(WaitNamedPipeW(path.c_str(),10000)!=0,"handoff-server-unavailable");HANDLE pipe=CreateFileW(path.c_str(),GENERIC_READ|GENERIC_WRITE,0,nullptr,OPEN_EXISTING,FILE_FLAG_OVERLAPPED|SECURITY_SQOS_PRESENT|SECURITY_IDENTIFICATION,nullptr);Require(pipe!=INVALID_HANDLE_VALUE,"handoff-connect-failed");held.all.push_back(pipe);
    ULONG peer;Require(GetNamedPipeServerProcessId(pipe,&peer)!=0,"handoff-server-unverified");Peer(peer,image,elevated);unsigned char challenge[32];Transfer(pipe,challenge,32,false);Transfer(pipe,challenge,32,true);
}
static void ClearStartupEnvironment(){
    auto allow=CleanEnvironment();LPWCH raw=GetEnvironmentStringsW();Require(raw!=nullptr,"environment-unverified");std::vector<wstring> names;
    for(auto p=raw;*p;p+=wcslen(p)+1){wstring item(p);auto equal=item.find(L'=');if(equal!=wstring::npos&&equal>0)names.push_back(item.substr(0,equal));}FreeEnvironmentStringsW(raw);
    for(auto&name:names)Require(SetEnvironmentVariableW(name.c_str(),nullptr)!=0,"environment-clear-failed");
    for(auto p=allow.data();*p;p+=wcslen(p)+1){wstring item(p);auto equal=item.find(L'=');Require(SetEnvironmentVariableW(item.substr(0,equal).c_str(),item.substr(equal+1).c_str())!=0,"environment-set-failed");}
}
