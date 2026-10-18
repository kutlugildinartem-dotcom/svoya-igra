@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install it from https://nodejs.org or just open public\index.html in a browser.
  pause
  exit /b
)
start "" http://localhost:3000/screen
node server.js
pause
