# Bigplus frontendstruktur

Målet är att appen ska bli snabbare att ändra utan att varje fix kräver jakt i jättestora filer.

## Nuvarande modulgränser

- `api.js` är en kompatibel export-fil. Befintlig kod kan fortsätta importera från den.
- `api/config.js` hanterar lokal/render API-adress och API-läge.
- `api/http.js` innehåller gemensam `fetchJson`.
- `api/reference-data.js` innehåller referenser, arter och serverbaserad mätning.
- `api/measurement.js` innehåller offlineberäkning av längd/vikt.
- `api/catches.js` innehåller fångster och lokal backup-lagring.
- `shell/dom.js` innehåller små DOM-hjälpare som används av app-skalet.
- `shell/storage.js` innehåller localStorage-nycklar och säker JSON-läsning.
- `shell/format.js` innehåller ren formatering för HTML, bilder och datum.
- `shell/assets.js` innehåller bildval för artbilder och achievement-märken.
- `shell/api-root.js` innehåller API-adresser för lokal backend och Render.
- `shell/api-fetch.js` innehåller API-hämtning med lokal fallback.
- `shell/live.js` innehåller LIVE-status, timer och streamlänk för användare.
- `shell/home-catch-view.js` innehåller valet mellan lista och rutnät för senaste fångster.

## Nästa bra uppdelningar

- Flytta inloggning/session från `app-shell.js` till `features/auth.js`.
- Flytta tävlingar från `app-shell.js` till `features/competitions.js`.
- Flytta vänner/live/karta-delning från `app-shell.js` till `features/friends.js`.
- Flytta mät-canvas från `main.js` till `features/measure-canvas.js`.
- Dela CSS i `css/base.css`, `css/header.css`, `css/home.css`, `css/measure.css`, `css/catches.css`, `css/profile.css`.

Gör en modul i taget och behåll gamla imports tills den delen är testad.
