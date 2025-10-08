# Inlev FIX50 – Folder index utan redirect
Den här patchen ersätter `index.html` i projekmapparna så de **inte** redirectar till de gamla sidorna.
Istället laddas `../<legacy>.html` via `fetch` och injiceras, med automatiska fixar av relativa paths.
Detta bryter redirect-loopar (t.ex. /plock/ <-> /plock.html) som kan uppstå av webserverns pretty-URLs.

Mappar: sandningar, plock, trav, schema, statistik, users.
- Sändningar index laddar även guarden.
