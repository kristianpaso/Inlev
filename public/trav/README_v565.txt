Fix v5.6.5
- Gör knappen "Skapa spelsystem" aktiv via data-action="create-game" och data-target="index.html".
- Ingen data-page="overview" på <body> – app.js visar nu spelsystemvyn när ?game= finns.

Hur det funkar:
- Klick på knappen -> nytt gameId -> redirect till index.html?game=<id>
- app.js injicerar #gameId och renderar vyn för avdelningar/kuponger.
