Patch v2.4 – Trav slider (endast förhandsvisare)

Lägg in filen i ditt projekt under: root/public/trav/ui-slider.js

Öppna din trav-HTML (t.ex. root/public/trav/index.html) och lägg till
följande rad precis före </body>:

  <script src="ui-slider.js"></script>

Vad gör den?
- Bygger en slider med Avdelning X / Y (pilar, swipe, prickar)
- Populära (vänster): visar alla hästnummer, markerar populärast röd
- Hästinformation (mitten): Häst namn / Kusk / %
- Min kupong (höger): klickbara rutor (blå när valda)
- Överblick + pris under slidern
- Döljer den gamla avdelningslistan (.section .avd-list)

Krav:
- Dina kupong-inputs bör vara i element som matchar .coupon-card input[type="text"]
  (eller .coupon-grid input[type="text"]). Justera selektorerna i ui-slider.js om
  din layout skiljer sig.
