@echo off
setlocal EnableExtensions
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
pushd "%PROJECT_ROOT%" >nul

echo [GIT] Current status:
git status -sb

echo.
set /p MSG="Commit message: "
if "%MSG%"=="" (
  echo [ERROR] Commit message is required.
  popd >nul
  endlocal
  exit /b 1
)

git add .
if errorlevel 1 goto :fail

git commit -m "%MSG%"
if errorlevel 1 goto :fail

git push
if errorlevel 1 goto :fail

echo.
echo [GIT] Done.
git status -sb

echo.
popd >nul
endlocal
exit /b 0

:fail
echo.
echo [ERROR] git push failed. Fix and try again.
popd >nul
endlocal
pause
exit /b 1
