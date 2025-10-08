# Inlev FIX54 – Flytt till /public/sandningar
Flyttade/mappade sidor:
- public/sandningar/insamlare.html     (wrapper med fallback – lägg din verkliga kod som insamlare-legacy.html i samma mapp)
- public/sandningar/felsok.html        (paths + meny fixade)
- public/sandningar/skicka-diff.html   (paths + meny fixade)
- public/sandningar/link-fix-insamlare.js  (valfritt – reskriver länkar i listan till /sandningar/insamlare.html)

Gör efter patch:
1) Kopiera innehållet i din riktiga public/insamlare.html till:
   public/sandningar/insamlare-legacy.html  (permanent läge)
2) Se till att listlänkar går till /sandningar/insamlare.html?id=<id> (eller inkludera link-fix-insamlare.js)
3) Meny: Trav → ../trav/index.html, Statistik → ../statistik/index.html, osv.
