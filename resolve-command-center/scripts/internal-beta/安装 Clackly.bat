@echo off
setlocal EnableExtensions
set "SCRIPT=%~dp0tools\Install-Clackly.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "CLACKLY_EXIT=%ERRORLEVEL%"
if "%CLACKLY_EXIT%"=="0" (
  echo.
  echo Clackly installed. Start DaVinci Resolve, then choose Workspace ^> Workflow Integrations ^> Clackly.
) else (
  echo.
  echo Clackly install did not finish. Exit code %CLACKLY_EXIT%. Read the message above and confirm Resolve is closed.
)
pause
exit /b %CLACKLY_EXIT%
