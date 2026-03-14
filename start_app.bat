@echo off
setlocal EnableExtensions
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
pushd "%PROJECT_ROOT%" >nul
set "VENV_ROOT=%USERPROFILE%\.venvs\eurbanizam-v2"
set "PY=%VENV_ROOT%\Scripts\python.exe"
set "REQ=%PROJECT_ROOT%\requirements.txt"
set "STAMP=%VENV_ROOT%\requirements.sha256"
rem Optional: force reinstall deps: start_app.bat --install
set "FORCE_INSTALL=0"
if /I "%~1"=="--install" set "FORCE_INSTALL=1"
if not exist "%PY%" (
  echo [SETUP] Creating venv at "%VENV_ROOT%"
  python -m venv "%VENV_ROOT%" || goto :fail
)
rem Ensure local runtime folders exist (no DB changes)
set "EU_RUNTIME_ROOT=%USERPROFILE%\.eurbanizam"
if not exist "%EU_RUNTIME_ROOT%\db" mkdir "%EU_RUNTIME_ROOT%\db" >nul 2>&1
if not exist "%EU_RUNTIME_ROOT%\json\cases_full_json" mkdir "%EU_RUNTIME_ROOT%\json\cases_full_json" >nul 2>&1
if not exist "%EU_RUNTIME_ROOT%\logs" mkdir "%EU_RUNTIME_ROOT%\logs" >nul 2>&1
if not exist "%EU_RUNTIME_ROOT%\snapshots" mkdir "%EU_RUNTIME_ROOT%\snapshots" >nul 2>&1
if not exist "%EU_RUNTIME_ROOT%\secrets" mkdir "%EU_RUNTIME_ROOT%\secrets" >nul 2>&1
if not exist "%EU_RUNTIME_ROOT%\test_db" mkdir "%EU_RUNTIME_ROOT%\test_db" >nul 2>&1
if not exist "%EU_RUNTIME_ROOT%\test_jsons" mkdir "%EU_RUNTIME_ROOT%\test_jsons" >nul 2>&1
if not exist "%EU_RUNTIME_ROOT%\test_logs" mkdir "%EU_RUNTIME_ROOT%\test_logs" >nul 2>&1
rem Check for required modules (force install if missing)
"%PY%" -c "import importlib.util,sys; sys.exit(0) if importlib.util.find_spec('playwright') else sys.exit(1)" >nul 2>&1
if errorlevel 1 set "FORCE_INSTALL=1"
rem Install deps only if requirements.txt changed (or forced)
if not exist "%REQ%" (
  echo [WARN] requirements.txt not found at "%REQ%" - skipping dependency check.
  goto :run
)
for /f "usebackq delims=" %%H in (`"%PY%" -c "import hashlib,sys; p=sys.argv[1]; print(hashlib.sha256(open(p,'rb').read()).hexdigest())" "%REQ%"`) do set "CUR_HASH=%%H"
if "%CUR_HASH%"=="" set "FORCE_INSTALL=1"
set "OLD_HASH="
if exist "%STAMP%" set /p OLD_HASH=<"%STAMP%"
if "%FORCE_INSTALL%"=="1" goto :do_install
if /I "%CUR_HASH%"=="%OLD_HASH%" (
  echo [OK] requirements unchanged. Skipping pip install.
  goto :run
)
:do_install
echo [SETUP] Installing dependencies...
"%PY%" -m pip install -r "%REQ%" || goto :fail
"%PY%" -c "import importlib.util,sys; sys.exit(0) if importlib.util.find_spec('playwright') else sys.exit(1)" >nul 2>&1
if errorlevel 1 (
  "%PY%" -m pip install playwright || goto :fail
)
"%PY%" -m playwright install || goto :fail
>"%STAMP%" echo %CUR_HASH%
:run
set "EU_STREAMLIT=1"
set "APP=admin_ui.py"
if not exist "%PROJECT_ROOT%\%APP%" set "APP=admin.py"
echo [RUN] %APP%
start "Admin UI" "%PY%" -m streamlit run "%PROJECT_ROOT%\%APP%"

rem Start Telegram bot in a separate window
if exist "%PROJECT_ROOT%\tools\telegram_bot_server.py" (
  start "Telegram Bot" "%PY%" "%PROJECT_ROOT%\tools\telegram_bot_server.py"
)
popd >nul
endlocal
exit /b 0
:fail
echo.
echo [ERROR] Start failed. See messages above.
popd >nul
endlocal
pause
exit /b 1
