INSTALL (v5.6.4) – “Skapa spelsystem” fungerar nu även utan extra JS i HTML.

1) Ersätt `public/trav/app.js` med den här filen.
2) Säkerställ att du INTE laddar några `additions.js` eller `app.additions.*.js` i HTML.
3) Överblicken (index.html):
   - Ha `data-page="overview"` på `<body>`
   - Din knapp kan vara:
       <button class="btn" data-action="create-game" data-target="trav.html">Skapa spelsystem</button>
     (data-target kan vara `trav.html` eller `trav.index.html` – default är `trav.html`)
4) Spelsystem-sidan (t.ex. `trav.html`):
   - Inget speciellt behövs; koden läser `?game=` och injicerar `#gameId` automatiskt.

Event delegation gör att vi inte är känsliga för när knappen renderas.
