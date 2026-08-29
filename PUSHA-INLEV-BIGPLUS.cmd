@echo off
setlocal

cd /d "%~dp0"

set "BIGPLUS_SOURCE=D:\Bigplus"

echo === Inlev / Bigplus: Git-status ===
git status --short
if errorlevel 1 goto :error

if exist "%BIGPLUS_SOURCE%\public\bigplus\" (
  echo.
  echo === Synkar senaste Bigplus till Inlev-paketet ===
  robocopy "%BIGPLUS_SOURCE%\public\bigplus" "%CD%\public\bigplus" /E /XD node_modules .git /NFL /NDL /NJH /NJS /NP
  if errorlevel 8 goto :error
  if exist "%BIGPLUS_SOURCE%\bigplus-api\" (
    robocopy "%BIGPLUS_SOURCE%\bigplus-api" "%CD%\bigplus-api" /E /XD node_modules .git /NFL /NDL /NJH /NJS /NP
    if errorlevel 8 goto :error
  )
) else (
  echo.
  echo OBS: Bigplus-kallan hittades inte: "%BIGPLUS_SOURCE%"
  echo Fortsatter med Bigplus-kopian som redan finns i deploy-rooten.
)

echo.
echo === Lagger till alla andringar i Inlev-paketet ===
git add .
if errorlevel 1 goto :error

echo.
echo === Filer som kommer att pushas ===
git diff --cached --name-only

echo.
echo Kontrollera listan ovan. Avbryt med Ctrl+C om nagot ser fel ut.
pause

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Update Inlev projects"
  if errorlevel 1 goto :error
) else (
  echo.
  echo Inga nya filer att committa. Fortsatter med befintliga commits.
)

git push origin main
if errorlevel 1 goto :error

echo.
echo === Deployar hela public till Netlify ===
npx --yes netlify-cli deploy --prod --dir="%CD%\public" --site="sage-vacherin-aa5cd3"
if errorlevel 1 goto :error

echo.
echo Klart. Andringarna ar pushade till Inlev och hela public ar deployad till Netlify.
echo Render deployar om automatiskt om auto-deploy ar aktiverat.
pause
exit /b 0

:error
echo.
echo Push misslyckades. Las felmeddelandet ovan.
pause
exit /b 1
