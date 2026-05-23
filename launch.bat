@echo off
setlocal

cd /d "%~dp0"
title BotDrop Host Launcher

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js from https://nodejs.org/ and run this launcher again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  echo Reinstall Node.js with npm enabled and run this launcher again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing BotDrop Host dependencies...
  call npm install
  if errorlevel 1 goto :failed
)

echo Building BotDrop Host...
call npm run build
if errorlevel 1 goto :failed

echo Starting BotDrop Host...
call "%~dp0node_modules\.bin\electron.cmd" .
if errorlevel 1 goto :failed

exit /b 0

:failed
echo.
echo BotDrop Host could not start.
pause
exit /b 1
