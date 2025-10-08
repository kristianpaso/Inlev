
# Inlev – Fullt projekt (med gemensam header på alla sidor)

## Köra lokalt (identiskt med Netlify)
1) `npm i`
2) `npm run dev`  → http://localhost:8888

## Deploy
`npm run deploy:prod`

## Vad som är inkopplat
- Alla sidor laddar **/assets/header.js** + **/assets/include-header.js** och visar samma toppheader från **/assets/header.html**.
- Auth-läge är **enforced** som standard (sidorna skyddas). Login-sidan kör **safe** i sin egen fil.
- Routing via `_redirects` (plock/trav/statistik/schema/login) och `/api/*` proxy lokalt.

## Byta auth-läge per sida
I `<head>`: `<script src="/assets/header.js" data-auth-mode="enforced" defer></script>`
- `enforced` = skydda sida
- `safe` = inga auto-redirects (felsökning)

## OCR (Schema)
Robust avdelningsmatchning (case/diakritik, vanliga typos) + sparning till `localStorage` + statistik-sida som läser loggen.
