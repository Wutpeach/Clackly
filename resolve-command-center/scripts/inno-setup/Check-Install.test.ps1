$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('Clackly-Inno-Checks-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$helper=Join-Path $PSScriptRoot 'Check-Install.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($helper,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'helper-parse-failed'}
foreach($definition in $ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Refused([scriptblock]$Action,[string]$Expected){
    try{& $Action;throw 'unexpected-pass'}catch{if($_.Exception.Message -notlike $Expected){throw}}
}
Refused {Assert-Native (Join-Path $root 'missing.node')} '*SamplePlugin*missing*'
Write-Output 'PASS missing official Native stops before installation'
$damaged=Join-Path $root 'damaged.node';[IO.File]::WriteAllText($damaged,'not a signed DLL')
Refused {Assert-Native $damaged} '*signature*'
Write-Output 'PASS invalid Native signature stops before installation'
$hostImage=Join-Path $root 'Resolve.exe'
[IO.File]::Copy((Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'),$hostImage)
$hostProcess=Start-Process -FilePath $hostImage -ArgumentList '-NoProfile -NonInteractive -Command Start-Sleep -Seconds 8' -WindowStyle Hidden -PassThru
$null=$hostProcess.Handle
try{
    if($hostProcess.HasExited){throw 'inert-host-exited-early'}
    Refused {Assert-HostClosed} '*close DaVinci Resolve*'
    Write-Output 'PASS actual inert Resolve.exe process blocks install (no real Resolve launched)'
}finally{if(!$hostProcess.WaitForExit(15000)){throw 'inert-host-did-not-exit-naturally'}}
Write-Output ('TOTAL 3 PASS; fixture '+$root)
