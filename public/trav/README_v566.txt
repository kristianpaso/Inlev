INSTALL v5.6.6 – “Skapa spelsystem” med val av spelform + redigerbara häst/kusk-fält

Filer i denna zip:
- public/trav/app.js (ersätt din)
- public/trav/README_v566.txt

Nytt:
1) Klick på “Skapa spelsystem” öppnar en liten modal där du väljer spelform (V64, V75, GS75, V86),
   sätter omgångsnamn/tid och om du vill förfylla rader. Skapar sedan ett gameId och går till index.html?game=<id>.
2) På spelsystem-vy får du en sektion “Avdelning 1–N” där varje rad har två inputs (Hästnamn, Kusk)
   + en ruta till höger för att kryssa i din egen kupong. Ändringar sparas i localStorage per gameId.
