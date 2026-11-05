[CmdletBinding()]
param(
    [ValidateSet('InitRoot','Closed','Inspect','ExportRegistry','RestoreRegistry','Native','Install')][string]$Mode,
    [string]$Id, [string]$Setup, [string]$Sha256
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$target=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design/DaVinci Resolve/Support/Workflow Integration Plugins/com.wutpeach.clackly'))
$root=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Clackly Dev Deploy'
$key='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{22BD637C-3208-4D0C-ABDE-D8A497D8C6C8}_is1'
$regKey='HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{22BD637C-3208-4D0C-ABDE-D8A497D8C6C8}_is1'
function Assert-Closed {
    foreach($p in @(Get-CimInstance Win32_Process)){
        if($p.Name -ieq 'Resolve.exe' -or $p.Name -ieq 'Clackly.exe' -or
            $p.Name -ieq 'electron.exe' -or $p.Name -like 'Clackly-Setup*' -or $p.Name -like 'unins*.exe' -or
            ($p.ExecutablePath -and $p.ExecutablePath.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase))){
            throw ('host-or-installer-running: '+$p.Name+' PID '+$p.ProcessId)
        }
    }
    foreach($name in @('ClacklyInnoSetup','Global\ClacklyInnoSetup')){
        try{$mutex=[Threading.Mutex]::OpenExisting($name)}catch [Threading.WaitHandleCannotBeOpenedException]{continue}
        $mutex.Dispose();throw 'inno-installer-running'
    }
}
function Assert-Registry {
    $subkey='SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{22BD637C-3208-4D0C-ABDE-D8A497D8C6C8}_is1'
    foreach($location in @(@([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry32),@([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryView]::Registry64))){
        $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey($location[0],$location[1])
        try{$other=$base.OpenSubKey($subkey);if($other){$other.Dispose();throw 'ambiguous-inno-registration'}}finally{$base.Dispose()}
    }
    $r=Get-ItemProperty -LiteralPath $key
    if($r.DisplayName -cne 'Clackly' -or [IO.Path]::GetFullPath($r.InstallLocation).TrimEnd('\') -ine $target -or
        $r.UninstallString -ine ('"'+$target+'\unins000.exe" /LOG') -or
        $r.'Inno Setup: Setup Version' -cne '6.7.1'){throw 'inno-registration-mismatch'}
    return $r
}
if(!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'administrator-required'}
if(![Environment]::Is64BitProcess){throw '64-bit-powershell-required'}
Assert-Closed
if($Mode -eq 'InitRoot'){
    # Protect only our backup/code workspace, never Resolve's shared directories.
    if(!(Test-Path -LiteralPath $root)){
        [IO.Directory]::CreateDirectory($root)|Out-Null
        $acl=[Security.AccessControl.DirectorySecurity]::new()
        $admin=[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
        $acl.SetOwner($admin);$acl.SetAccessRuleProtection($true,$false)
        foreach($sid in @('S-1-5-18','S-1-5-32-544')){
            $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow')
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $root -AclObject $acl
    }
    $acl=Get-Acl -LiteralPath $root
    if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cnotin @('S-1-5-18','S-1-5-32-544')){throw 'backup-root-owner-unverified'}
    foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
        if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -cnotin @('S-1-5-18','S-1-5-32-544')){throw 'backup-root-permissions-unverified'}
    }
    exit 0
}
if($Mode -eq 'Closed'){exit 0}
if($Mode -eq 'Inspect'){
    $r=Assert-Registry
    if(Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Clackly Installer/previous')){throw 'inno-previous-backup-needs-attention'}
    $r|Select-Object DisplayName,DisplayVersion,InstallLocation,UninstallString,'Inno Setup: Setup Version'|ConvertTo-Json -Compress
    exit 0
}
if($Id -cnotmatch '^[a-f0-9]{32}$'){throw 'invalid-session-id'}
$session=Join-Path $root $Id
if(!(Test-Path -LiteralPath $session -PathType Container)){throw 'missing-session'}
if($Mode -eq 'ExportRegistry'){
    Assert-Registry|Out-Null
    & reg.exe export $regKey (Join-Path $session 'uninstall.reg') /y|Out-Null
    if($LASTEXITCODE -ne 0){throw 'registry-export-failed'}
    Push-Location (Split-Path -Parent $target)
    try{& icacls.exe 'com.wutpeach.clackly' /save (Join-Path $session 'permissions.acl') /t /q|Out-Null
        if($LASTEXITCODE -ne 0){throw 'acl-backup-failed'}}finally{Pop-Location}
}elseif($Mode -eq 'RestoreRegistry'){
    # The complete old fixed key is restored, including removal of new values.
    & reg.exe delete $regKey /f|Out-Null
    if($LASTEXITCODE -ne 0){throw 'registry-delete-failed'}
    & reg.exe import (Join-Path $session 'uninstall.reg')|Out-Null
    if($LASTEXITCODE -ne 0){throw 'registry-restore-failed'}
    & icacls.exe (Split-Path -Parent $target) /restore (Join-Path $session 'permissions.acl') /q|Out-Null
    if($LASTEXITCODE -ne 0){throw 'acl-restore-failed'}
    Assert-Registry|Out-Null
}elseif($Mode -eq 'Native'){
    Import-Module (Join-Path $PSScriptRoot '../workflow-update/WorkflowTransaction.psm1') -DisableNameChecking
    Import-Module (Join-Path $PSScriptRoot '../workflow-update/LocalNative.psm1') -DisableNameChecking
    $stage=Join-Path $session 'native'
    [IO.Directory]::CreateDirectory((Join-Path $stage 'workflow-plugin'))|Out-Null
    try{Copy-LocalResolveNative $stage ''|ConvertTo-Json -Compress}catch{
        $cause=$_.Exception
        while($cause){
            if($cause.Data.Contains('Clackly.LocalNative.FirstFailure')){
                $cause.Data['Clackly.LocalNative.FirstFailure']|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $session 'native-failure.json') -Encoding UTF8
                break
            }
            $cause=$cause.InnerException
        }
        throw
    }
}elseif($Mode -eq 'Install'){
    Assert-Registry|Out-Null
    if((Get-FileHash -LiteralPath $Setup).Hash -ine $Sha256){throw 'setup-hash-mismatch'}
    # Inno owns file registration and uninstall logs; never Copy/Junction over it.
    $arguments='/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /LOG="'+(Join-Path $session 'inno.log')+'"'
    $p=Start-Process -FilePath $Setup -ArgumentList $arguments -PassThru -Wait -WindowStyle Hidden
    @{exitCode=$p.ExitCode}|ConvertTo-Json -Compress
}
