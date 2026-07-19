@echo off
setlocal

echo.
echo Stoppar Trav-backend pa port 4000...
echo.

set "FOUND="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":4000 .*LISTENING"') do (
  set "FOUND=1"
  echo Hittade process %%P pa port 4000.
  taskkill /PID %%P /T /F
)

if not defined FOUND (
  echo Ingen process lyssnar pa port 4000.
)

echo.
echo Klart. Tryck valfri tangent for att stanga.
pause >nul
