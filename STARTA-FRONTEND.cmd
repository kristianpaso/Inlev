@echo off
setlocal

cd /d "%~dp0"

echo.
echo Startar Inlev-frontend pa http://127.0.0.1:4173
echo Bigplus finns pa http://127.0.0.1:4173/bigplus/
echo Trav finns pa http://127.0.0.1:4173/trav/
echo.

npm run dev

echo.
echo Frontend stoppad. Tryck valfri tangent for att stanga.
pause >nul
