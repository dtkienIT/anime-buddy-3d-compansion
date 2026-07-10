@echo off
setlocal

cd /d "%~dp0"
set "PORT=8090"
set "URL=http://127.0.0.1:%PORT%/index.html"

where py >nul 2>nul
if %errorlevel%==0 (
  start "3D Buddy server" /min py -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0"
  timeout /t 1 /nobreak >nul
  start "" "%URL%"
  goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "3D Buddy server" /min python -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0"
  timeout /t 1 /nobreak >nul
  start "" "%URL%"
  goto :done
)

echo Python was not found.
echo Install Python, then run this file again.
pause

:done
endlocal
