[CmdletBinding()]
param([switch]$Elevated)

$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot "ClacklyInstaller.psm1") -Force

function Test-ClacklyAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

try {
  # The package preflight makes an extracted/corrupt artifact fail before requesting elevation.
  Test-ClacklyPackage -PackageRoot $packageRoot | Out-Null
  if (!(Test-ClacklyAdministrator)) {
    if ($Elevated) {
      Write-Host "Elevation was not granted."
      exit 13
    }
    $arguments = New-ClacklyElevationArgumentList -ScriptPath $PSCommandPath
    try {
      $child = Start-Process -FilePath (Get-ClacklyWindowsPowerShellExecutable) -Verb RunAs -Wait -PassThru -ArgumentList $arguments
      exit $child.ExitCode
    } catch {
      Write-Host "Elevation was cancelled or could not start."
      exit 13
    }
  }
  $result = Invoke-ClacklyUninstallTransaction -PluginRoot (Get-ClacklyProductionPluginRoot)
  Write-Host $result.Message
  if (!$result.Success) {
    foreach ($retainedPath in @($result.RetainedPaths)) {
      Write-Host ("Retained transaction path: " + $retainedPath)
    }
  }
  exit $result.Code
} catch {
  Write-Host ("Clackly Beta uninstaller stopped before any uninstall transaction: " + $_.Exception.Message)
  if ($_.Exception.Data.Contains("ClacklyExitCode")) {
    exit [int]$_.Exception.Data["ClacklyExitCode"]
  }
  exit 10
}
