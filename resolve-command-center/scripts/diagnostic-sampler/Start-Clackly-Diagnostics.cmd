@echo off
setlocal EnableExtensions
set "SCRIPT=%~dp0Collect-ClacklyDiagnostics.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "CLACKLY_EXIT=%ERRORLEVEL%"
if /I "%~1"=="-SelfTest" exit /b %CLACKLY_EXIT%
pause
exit /b %CLACKLY_EXIT%
