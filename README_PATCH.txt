
Inlev auth patch (admin/test)

1) Kopiera `public/js/auth.js` till din sajt (behåll sökvägen).
2) I `login.html`:
   - Lägg till i <head>:   <script src="/js/auth.js"></script>
   - Klistra in innehållet från `docs/login-wiring.html` precis före </body>.
3) På sidor som ska skyddas (index.html, /statistik/, /plock/, /trav/):
   - Lägg till i <head>:   <script src="/js/auth.js"></script>
   - Lägg till direkt efter <body>:  <script>try{ InlevAuth.requireAuth(); }catch(e){}</script>
4) Hård-refresh (Ctrl/Cmd + Shift + R) och logga in med:
   - Användare: admin
   - Lösenord: test
