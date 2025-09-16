PATCH – Inlev auth fix (admin/test) + bakåtkompatibelt signIn-alias

Filer i denna zip:
- public/js/auth.js  (ny – cookies, inga try/catch, exporterar InlevAuth + alias signIn=login)
- public/login.html  (valfri full ersättning av din befintliga login-sida)
- docs/login-wiring.html  (klistra in precis före </body> i DIN nuvarande login.html om du inte vill ersätta filen)
- docs/guards.html  (snippets för att skydda sidor)

Snabbt sätt:
1) Ersätt /public/js/auth.js (se till att <script src="/js/auth.js"></script> ligger i <head> på sidorna).
2) Antingen:
   a) Ersätt hela /public/login.html med versionen i denna zip
   eller
   b) Klistra in docs/login-wiring.html i din befintliga login.html (precis före </body>).
3) Lägg in skydd enligt docs/guards.html på sidor som ska kräva inloggning.
4) Hård-refresh (Ctrl/Cmd + Shift + R). Logga in med admin / test.
