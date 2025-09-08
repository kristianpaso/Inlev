# Inlev – egen inloggning (Express + SQLite + Argon2 + JWT)

## Start
```bash
cd server
cp .env.sample .env   # byt JWT_SECRET/REFRESH_SECRET i produktion
npm install
npm run seed          # skapar första admin (admin@example.com / ChangeMe!123)
npm run dev           # http://localhost:5174
```
Öppna http://localhost:5174/ och klicka **Logga in**.
Första användaren registreras automatiskt som admin via `/api/auth/register-initial` (via seed eller manuellt).

## Roller
- **admin** – fulla rättigheter
- **superuser** – fulla rättigheter
- **watcher** – läs-only; knappar för ändringar blir inaktiva

## Säkerhet
- Lösenord hashas med **Argon2id**
- **JWT** i **HttpOnly** cookies (access 15 min, refresh 7 dagar)
- **CSRF**-skydd (double submit cookie + `X-CSRF-Token` header)
- **helmet**-headers
- **SameSite=Lax** standard

## Byta server / hosting
- Kör `server/` var som helst (Linux/Windows/Mac, docker etc)
- Servern **servir** även `public/` statiskt – en process räcker.
- Bakom omvänd proxy (nginx) – sätt `COOKIE_SECURE=true` och `ORIGIN=https://din.domän`.

## API
- `GET  /api/auth/csrf` – hämta CSRF-token (sätter också cookie)
- `POST /api/auth/register-initial` – första admin (om inga användare finns)
- `POST /api/auth/login {email,password}` – logga in
- `POST /api/auth/logout` – logga ut (raderar cookies)
- `GET  /api/auth/me` – aktuell användare
- `POST /api/auth/refresh` – förnya token via refresh-cookie
# Inlev
