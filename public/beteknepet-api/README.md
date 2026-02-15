# BeteKnepet backend (Express)

## Lokalt
1) `cd public/beteknepet/backend`
2) `npm install`
3) `npm run start`

Backend: `http://localhost:5005`

Frontend (Netlify dev): `http://localhost:8888/beteknepet/index.html`

Tips: Om du vill peka frontenden mot annan API:
- `?api=https://din-render-url` (sparas i localStorage)
- eller sätt `localStorage.BK_API`

## Render (förslag)
- Root directory: `public/beteknepet/backend`
- Build command: `npm install`
- Start command: `npm start`
- Env:
  - `BK_ALLOWED_ORIGINS` = din netlify domän + ev preview domäner (komma-separerat)

Health endpoint:
- `/health`

## Weather endpoint
- POST `/api/beteknepet/weather` body: `{ "lat": 57.70, "lon": 12.94 }`
