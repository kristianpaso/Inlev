@echo off
setlocal

cd /d "%~dp0trav-api"

echo.
echo Startar Trav-backend pa http://localhost:4000
echo Health-check finns pa http://localhost:4000/health
echo.

if not exist ".env" (
  echo OBS: trav-api\.env saknas.
  echo Forsoker anvanda tidigare MONGODB_URI fran git-historiken for lokal dev...
  for /f "delims=" %%A in ('git show HEAD:public/trav-api/.env 2^>nul ^| findstr /b MONGODB_URI=') do set "%%A"

  if defined MONGODB_URI (
    echo MONGODB_URI hittades och laddades for denna terminalsession.
    echo.
  ) else (
    echo Ingen MONGODB_URI hittades.
    echo Skapa trav-api\.env med MONGODB_URI om du vill ansluta mot Atlas lokalt.
    echo.
  )
)

npm run start:local

echo.
echo Backend stoppad. Tryck valfri tangent for att stanga.
pause >nul
