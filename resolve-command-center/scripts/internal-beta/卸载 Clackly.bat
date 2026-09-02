@echo off
setlocal EnableExtensions
set "SCRIPT=%~dp0tools\Uninstall-Clackly.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "CLACKLY_EXIT=%ERRORLEVEL%"
if "%CLACKLY_EXIT%"=="0" (
  echo.
  echo Clackly was uninstalled. Your settings were preserved.
) else (
  echo.
  echo Clackly uninstall did not finish. Exit code %CLACKLY_EXIT%. Read the message above and confirm Resolve is closed.
)
pause
exit /b %CLACKLY_EXIT%
