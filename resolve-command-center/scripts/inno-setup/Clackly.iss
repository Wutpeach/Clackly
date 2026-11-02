#ifndef PayloadDir
  #error PayloadDir is required; run Build.ps1
#endif
#ifndef AppVersion
  #error AppVersion is required; run Build.ps1
#endif
[Setup]
AppId={{22BD637C-3208-4D0C-ABDE-D8A497D8C6C8}
AppName=Clackly
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
VersionInfoTextVersion={#AppVersion}
AppPublisher=Wutpeach
DefaultDirName={commonappdata}\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly
DisableDirPage=yes
DisableProgramGroupPage=yes
UsePreviousAppDir=no
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputBaseFilename=Clackly-Setup-{#AppVersion}-win-x64
Compression=lzma2/fast
SolidCompression=yes
DiskSpanning=no
CloseApplications=no
RestartApplications=no
SetupLogging=yes
UninstallLogging=yes
WizardStyle=modern
UninstallDisplayName=Clackly
SetupMutex=ClacklyInnoSetup

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "Check-Install.ps1"; Flags: dontcopy
Source: "Check-Install.ps1"; DestDir: "{app}"; DestName: "clackly-setup-check.ps1"; Flags: ignoreversion
Source: "{tmp}\ClacklyNative\WorkflowIntegration.node"; DestDir: "{app}\workflow-plugin"; Flags: external ignoreversion

[Code]
var
  PreviousMoved, InstallFinished, InstallStarted: Boolean;

function Target: String;
begin
  Result := ExpandConstant('{commonappdata}\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly');
end;

function Previous: String;
begin
  Result := ExpandConstant('{commonappdata}\Clackly Installer\previous');
end;

function Check(const Script, Mode: String): String;
var Code: Integer; Text: AnsiString; Report: String;
begin
  Report := ExpandConstant('{tmp}\clackly-check.txt');
  DeleteFile(Report);
  Result := '';
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + Script +
    '" -Mode ' + Mode + ' -ExpectedVersion {#AppVersion} -Work "' + ExpandConstant('{tmp}\ClacklyNative') +
    '" -Report "' + Report + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) then
    Result := 'Clackly check could not start.';
  if (Result = '') and (Code <> 0) then begin
    if LoadStringFromFile(Report, Text) then Result := UTF8Decode(Text)
    else Result := 'Clackly check failed. See the setup log.';
  end;
  Log('Clackly ' + Mode + ': ' + Result);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  if ExpandConstant('{app}') <> Target then begin
    Result := 'Clackly must use the fixed Resolve Workflow plugin directory.'; exit;
  end;
  ExtractTemporaryFile('Check-Install.ps1');
  Result := Check(ExpandConstant('{tmp}\Check-Install.ps1'), 'Prepare');
  if Result <> '' then exit;
  if DirExists(Previous) then begin
    Result := 'A previous installation backup needs attention: ' + Previous; exit;
  end;
  if DirExists(Target) then begin
    ForceDirectories(ExtractFileDir(Previous));
    if not RenameFile(Target, Previous) then begin
      Result := 'Cannot move the old Clackly directory. Close Resolve and retry.'; exit;
    end;
    PreviousMoved := True;
  end;
  InstallStarted := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    // Inno owns deployment success; ssPostInstall exceptions do not roll it back.
    InstallFinished := True;
    if PreviousMoved and not DelTree(Previous, True, True, True) then
      Log('The old program backup could not be removed: ' + Previous);
  end;
end;

procedure DeinitializeSetup();
begin
  if InstallStarted and not InstallFinished then begin
    if not DelTree(Target, True, True, True) then Log('Partial installation remains: ' + Target);
    if PreviousMoved and not RenameFile(Previous, Target) then
      MsgBox('Could not restore the old Clackly directory. Keep Resolve closed. Backup: ' + Previous, mbError, MB_OK);
  end;
end;

function InitializeUninstall(): Boolean;
var Failure: String;
begin
  Failure := Check(ExpandConstant('{app}\clackly-setup-check.ps1'), 'Host');
  Result := Failure = '';
  if not Result then MsgBox(Failure, mbError, MB_OK);
end;
