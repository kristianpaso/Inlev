
Installera:
1) Kopiera mappen `public/` från zippen till din bygg-/deploy-mapp.
   - `public/schema/app.js` ersätter Schema-fronten (robust avdelningsmatchning).
   - `public/login.html`, `public/assets/*`, `public/_redirects` fixar Netlify-login + routing.
2) Se till att sidorna /plock, /trav, /statistik, /schema laddar `/assets/inlev-auth.js` och kallar `InlevAuth.guard()` på DOMContentLoaded.
3) Deploya till Netlify.

Schema-områden som matchas (skiftlägesoberoende + accenttåligt):
OUTBOUND, B2B, KONSOLIDERING, FELSÖK, UTLEVERANS, Inleverans, Extern Inleverans, Retur A.S, Retur Zalando, Komplettering, Påfyllnad, Infackning A.S, Infackning Buffert, Planerade Påfyllnader, Inventering, Övrigt, Upprensning.
