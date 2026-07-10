@echo off
setlocal

cd /d "%~dp0"
set "PORT=3001"

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /i "%%A"=="PORT" set "PORT=%%B"
  )
)

set "URL=http://127.0.0.1:%PORT%/index.html"

where node >nul 2>nul
if %errorlevel%==0 (
  start "AI Buddy server" /min node server.mjs
  timeout /t 1 /nobreak >nul
  start "" "%URL%"
  goto :done
)

echo Node.js was not found.
echo Install Node.js, then run this file again.
pause

:done
endlocal
