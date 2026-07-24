@echo off
setlocal

cd /d "%~dp0"

echo === Inlev / Bigplus: Git-status ===
git status --short
if errorlevel 1 goto :error

echo.
echo === Lagger till andringar ===
git add .
if errorlevel 1 goto :error

echo.
echo === Filer som kommer att pushas ===
git diff --cached --name-only

echo.
echo Kontrollera listan ovan. Avbryt med Ctrl+C om nagot ser fel ut.
pause

git commit -m "Update Bigplus"
if errorlevel 1 goto :error

git push origin main
if errorlevel 1 goto :error

echo.
echo Klart. Andringarna ar pushade till Inlev.
echo Netlify och Render deployar om automatiskt om auto-deploy ar aktiverat.
pause
exit /b 0

:error
echo.
echo Push misslyckades. Las felmeddelandet ovan.
pause
exit /b 1
