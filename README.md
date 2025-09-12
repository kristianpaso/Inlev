
# Inleverans – komplett projekt

## Lokalt
```bash
cd server
npm install
npm run dev
```
Öppna http://localhost:5000/login.html (Admin/test).

## Netlify
- `netlify.toml` + `netlify/functions/*`
- Sätt env `JWT_SECRET` i Netlify Site settings.
- `public/` är frontend, `/api/*` proxas till Functions.

## Sidor
- Sändningar – skapa/öppna/byt namn/ta bort, export/import
- Basinformation – Länkade rader, Uppackning, Registrerade kollin (Tolka + Spara + förhandsvisning)
- Felsök – överlagring av Uppdatera info, färger, Dölj kompletta, Felsökt klar/Ångra klar, klick på rad visar Kolliruta + Kollistat
- Uppdatera info – separata fält; påverkar endast Felsök via överlagring
- Skicka Diff – alla rader markerade som klara
