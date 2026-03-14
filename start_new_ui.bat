@echo off
setlocal EnableExtensions
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "BACKEND_ROOT=%PROJECT_ROOT%"
set "FRONTEND_ROOT=%PROJECT_ROOT%\apps\web"
set "VENV_ROOT=%USERPROFILE%\.venvs\eurbanizam-v2"
set "PY=%VENV_ROOT%\Scripts\python.exe"

if not exist "%FRONTEND_ROOT%\package.json" (
  echo [ERROR] Frontend folder not found at "%FRONTEND_ROOT%".
  goto :fail
)

if not exist "%PY%" (
  echo [SETUP] Creating venv at "%VENV_ROOT%"
  python -m venv "%VENV_ROOT%" || goto :fail
)

"%PY%" -c "import importlib.util,sys; sys.exit(0) if importlib.util.find_spec('fastapi') and importlib.util.find_spec('uvicorn') else sys.exit(1)" >nul 2>&1
if errorlevel 1 (
  echo [SETUP] Installing Python dependencies...
  "%PY%" -m pip install -r "%BACKEND_ROOT%\requirements.txt" || goto :fail
)

if not exist "%FRONTEND_ROOT%\node_modules\.bin\next.cmd" (
  echo [SETUP] Installing web dependencies...
  pushd "%FRONTEND_ROOT%" >nul
  npm install || goto :fail_popd
  popd >nul
)

echo Starting eUrbanizam API...
start "eUrbanizam API" cmd /k pushd "%BACKEND_ROOT%" ^& "%PY%" -m uvicorn apps.api.main:app --reload

echo Starting eUrbanizam Web...
start "eUrbanizam Web" cmd /k pushd "%FRONTEND_ROOT%" ^& npm run dev

echo Launch commands sent.
endlocal
pause

exit /b 0

:fail_popd
popd >nul

:fail
echo.
echo [ERROR] start_new_ui.bat failed.
endlocal
pause
exit /b 1
