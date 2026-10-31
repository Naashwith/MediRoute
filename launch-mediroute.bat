@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)
start "MediRoute dispatch server" /D "%~dp0" cmd /k node server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000/"
start "" "http://localhost:3000/compounder.html"
echo MediRoute patient and compounder portals have been opened.
echo Keep the MediRoute dispatch server window running.
