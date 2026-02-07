# pris-api (Node/Express) – Google (official API) + optional Prisjakt

Frontend (public/pris) anropar:
- GET /api/pris/search?q=...

## Varför du fick 500
Du saknade env variablerna för Prisjakt.
I v2 är Prisjakt **valfritt** och backend startar ändå.

## Google-sök (rekommenderat)
För att “leta på Google” stabilt behöver vi använda Googles officiella JSON API:
- GOOGLE_CSE_API_KEY
- GOOGLE_CSE_CX

Skapa en Custom Search Engine (CSE) och koppla den till hela webben, få en CX-id.
Sedan kan backend hämta topplänkar och försöka plocka pris från sidor (schema.org JSON-LD).

## Prisjakt (valfritt)
Om du senare får access/nycklar:
- PRISJAKT_CLIENT_ID
- PRISJAKT_CLIENT_SECRET
Då läggs Prisjakt-resultat automatiskt ihop med Google.

## Kör lokalt
1) cd pris-api
2) npm i
3) Skapa en `.env` och lägg t.ex:

PORT=4000
GOOGLE_CSE_API_KEY=...
GOOGLE_CSE_CX=...

# optional:
PRISJAKT_CLIENT_ID=...
PRISJAKT_CLIENT_SECRET=...

4) npm start

Test:
- http://localhost:4000/health
- http://localhost:4000/api/pris/search?q=lowrance%20elite%20fs%209

Frontend:
- Öppna /pris/index.html
- ⚙️ Backend URL: http://localhost:4000
