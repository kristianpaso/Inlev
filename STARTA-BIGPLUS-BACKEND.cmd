@echo off
setlocal

cd /d "%~dp0bigplus-api"

echo.
echo Startar Bigplus-backend pa http://localhost:4100
echo Health-check finns pa http://localhost:4100/health
echo.

if not exist "node_modules\express" (
  if exist "%~dp0trav-api\node_modules\express" (
    set "NODE_PATH=%~dp0trav-api\node_modules"
    echo Anvander trav-api\node_modules for lokal dev.
    echo.
  ) else (
    echo OBS: bigplus-api\node_modules saknas.
    echo Kor npm install i bigplus-api om servern inte startar.
    echo.
  )
)

npm run start:local

echo.
echo Backend stoppad. Tryck valfri tangent for att stanga.
pause >nul
