@echo off
setlocal
set "KEY=%USERPROFILE%\.ssh\contabo_nikola"
set "HOST=niki@5.189.136.118"

ssh -i "%KEY%" %HOST%
endlocal
