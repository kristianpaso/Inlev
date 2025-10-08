Plock Page Adapter
==================
Den här filen normaliserar PLOCK_STATS-meddelanden från Chrome-tillägget och uppdaterar DOM:
- Lägger text i statusraden
- Uppdaterar plock-räknare
- Uppdaterar felplock (om #errorCount finns)
- Skriver kvar-till-mål eller +COUNT i #badgeValue (om den finns)

Installation
------------
1) Packa upp zippen.
2) Kopiera mappen `plock/js/plock-page-adapter.js` till serverns `/public/plock/js/`.
3) Lägg till följande rad längst ner i `/public/plock/index.html` före `</body>`:

   <script src="/plock/js/plock-page-adapter.js"></script>

4) Ladda om sidan `http://localhost:8888/plock/`.

Tips
----
- Öppna extensionens popup och klicka "Testa plock" för att se att sidan räknar upp.
- Om inget händer, öppna DevTools > Console på /plock och kolla att det kommer
  `PLOCK_STATS`-events: `window.addEventListener('message', e => console.log(e.data))`.
