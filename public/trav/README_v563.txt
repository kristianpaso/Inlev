INSTALL (v5.6.3)
1) Ersätt `public/trav/app.js` med denna fil.
2) Ta bort ALLA tidigare `app.additions.*.js` och alla <script src="...additions..."> i HTML.
3) Överblick: <body data-page="overview"> och knappen
   <button class="btn" data-action="create-game">Skapa spelsystem</button>
4) Spelsystem-sidan: `trav.html`. Koden läser ?game= och sätter #gameId automatiskt.
