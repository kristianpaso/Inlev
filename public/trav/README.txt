
Installation
============
1) Lägg `public/trav/additions.js` i projektet.
2) I `public/trav/index.html`, lägg sist före </body>:

   <script src="./additions.js"></script>

Vad som ingår
-------------
- Sparar manuell kupong och uppdaterar ”Importerade kuponger” direkt (om renderImportedCoupons finns; annars via fallback-lista).
- Tar bort prompt-flödet (endast modal).
- Prisguide 50–400 kr:
  * Uppdateras automatiskt när ”Min kupong” ändras.
  * Respekterar min-antal per avdelning.
  * Kräver inte längre ”minst 3 ben ≥3”.
  * Om du valt 9 i någon avdelning visas bara kombinationer där minst en avdelning är ≥ 9.
  * Snyggare kompakt panel (chip visar aktiva krav).
