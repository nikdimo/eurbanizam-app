@echo off
setlocal EnableExtensions
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

set "READ_ANY=0"
for %%F in (
  "README.md"
  "ARCHITECTURE_SUMMARY.md"
  "docs\00_PROJECT_SPECS.md"
  "docs\01_PATH_CONTRACT.md"
  "docs\02_OPERATIONS.md"
  "docs\03_PHONE_POLICY.md"
) do (
  if exist "%PROJECT_ROOT%\%%~F" (
    set "READ_ANY=1"
    echo.
    echo ========================================
    echo %%~F
    echo ========================================
    type "%PROJECT_ROOT%\%%~F"
    echo.
  )
)

if "%READ_ANY%"=="1" (
  echo Press any key to start Codex...
  pause >nul
)

timeout /t 1 /nobreak > nul
codex
endlocal
exit
