Installera:
1) Kopiera `trav/app.js` till `root/public/trav/app.js` (ersätt din befintliga).
2) (valfritt) Lägg till `trav/overview-fix.css` i index.html om du vill använda grid-stylingen.
3) Hårdrefresh i webbläsaren.

Vad patchen gör:
- Visar exakt EN (1) “Skapa spelsystem”-knapp på överblicken (#view-overview) och döljer den på spelsystem-vyn (?game=...).
- Binder klick till er befintliga skapa-funktion (openCreateModal/openCreate/showCreate/newGameModal) eller dispatchar event `trav:create`.
- Renderar sparade spelsystem från localStorage `trav:games` under knappen i ett grid (om det finns).
