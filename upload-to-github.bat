@echo off
setlocal

cd /d "%~dp0"
title Upload BotDrop Host to GitHub

where gh >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI was not found.
  echo Install it from https://cli.github.com/ or run:
  echo winget install --id GitHub.cli -e
  pause
  exit /b 1
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo You are not logged into GitHub CLI.
  echo A browser login will start now. Complete it, then rerun this script if needed.
  gh auth login --hostname github.com --git-protocol https --web
  if errorlevel 1 goto :failed
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/invincibleMP3/botdrop-host.git
)

echo Creating public GitHub repo and pushing main...
gh repo create invincibleMP3/botdrop-host --public --source . --remote origin --push
if errorlevel 1 (
  echo Repo may already exist. Trying a normal push...
  git push -u origin main
  if errorlevel 1 goto :failed
)

echo.
echo Uploaded: https://github.com/invincibleMP3/botdrop-host
pause
exit /b 0

:failed
echo.
echo Upload failed. Check that GitHub CLI is logged in and that the repo name is available.
pause
exit /b 1
