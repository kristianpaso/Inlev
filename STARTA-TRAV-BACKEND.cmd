@echo off
setlocal
title Trav API

set "TRAV_API=D:\Trav\public\trav-api"
cd /d "%TRAV_API%"

if not exist "package.json" (
  echo Trav API hittades inte:
  echo %TRAV_API%
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Trav API saknar npm-paket.
  echo Kor npm install i %TRAV_API% och forsok igen.
  pause
  exit /b 1
)

rem Anvand samma MONGODB_URI som Bigplus om Bigplus har en lokal .env-fil.
if exist "D:\Bigplus\bigplus-api\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("D:\Bigplus\bigplus-api\.env") do if /I "%%A"=="MONGODB_URI" set "MONGODB_URI=%%B"
)

echo Startar Trav API pa http://localhost:4000
echo Health-check: http://localhost:4000/health
echo Stang detta terminalfonster for att stoppa Trav API lokalt.
node server.js
exit /b %errorlevel%
