@echo off
setlocal

cd /d "%~dp0"
set "URL=http://127.0.0.1:3001/"

where node >nul 2>nul
if not %errorlevel%==0 (
  echo Node.js was not found.
  echo Install Node.js, then run this file again.
  pause
  goto :done
)

where npm >nul 2>nul
if not %errorlevel%==0 (
  echo npm was not found.
  echo Install Node.js with npm, then run this file again.
  pause
  goto :done
)

if not exist "node_modules" (
  echo Dependencies are not installed yet.
  echo Run npm install first.
  pause
  goto :done
)

start "3D AI Companion" /min cmd /c npm run dev
timeout /t 3 /nobreak >nul
start "" "%URL%"

:done
endlocal
