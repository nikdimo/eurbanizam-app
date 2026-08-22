@echo off
setlocal EnableExtensions

rem Resolve workspace root (this folder)
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

rem Path to the actual prototype app (Replit finance workspace)
set "APP_DIR=%PROJECT_ROOT%\artifacts\finance-workspace"

if not exist "%APP_DIR%\package.json" (
  echo [ERROR] Could not find app package.json at:
  echo   "%APP_DIR%\package.json"
  echo.
  echo Make sure the Replit UI code lives in "artifacts\finance-workspace".
  pause
  goto :end
)

rem Prefer pnpm when available (matches Replit workspace tooling)
where pnpm >nul 2>&1
if %errorlevel% equ 0 (
  echo [INFO] Using pnpm workspace from "%PROJECT_ROOT%".
  echo [INFO] Starting dev server with: pnpm --filter @workspace/finance-workspace dev
  pushd "%PROJECT_ROOT%" >nul
  pnpm --filter @workspace/finance-workspace dev
  popd >nul
  goto :end
)

echo [ERROR] pnpm is not installed, and this workspace relies on pnpm.
echo Install pnpm globally with:
echo   npm install -g pnpm
echo and then re-run start_ui.bat
pause

:end
endlocal
exit /b 0

