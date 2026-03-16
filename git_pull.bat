@echo off
setlocal EnableExtensions
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
pushd "%PROJECT_ROOT%" >nul

echo [GIT] Pulling latest changes...
git pull
if errorlevel 1 goto :fail

echo.
echo [GIT] Current status:
git status -sb

echo.
popd >nul
endlocal
exit /b 0

:fail
echo.
echo [ERROR] git pull failed. Resolve conflicts and try again.
popd >nul
endlocal
pause
exit /b 1
