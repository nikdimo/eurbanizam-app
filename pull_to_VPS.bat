@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "DEPLOY_SCRIPT=%SCRIPT_DIR%tools\pull_to_VPS.ps1"

if not exist "%DEPLOY_SCRIPT%" (
  echo [ERROR] Missing deploy script: "%DEPLOY_SCRIPT%"
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%DEPLOY_SCRIPT%" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo [ERROR] VPS deploy failed.
  pause
)

endlocal & exit /b %EXITCODE%
