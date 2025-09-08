# Inlev – Netlify version (statisk + Functions)

## Deploy
1) Lägg upp hela projektet på GitHub och koppla till Netlify.
2) I Netlify:
   - **Build settings**: Publish directory = `public`
   - Functions directory = `netlify/functions` (hämtas från `netlify.toml`)
3) **Environment variables** (Site settings → Environment):
   - `JWT_SECRET` = (lång slumpmässig sträng)
   - `REFRESH_SECRET` = (annan lång slumpmässig sträng)
4) Deploya.

## Första inloggning
Öppna `/login.html` → kryssa i **"Skapa första admin"**, fyll i e-post/lösenord → Fortsätt.

## API
Frontenden anropar `/api/auth/*` och Netlify redirectar till `/.netlify/functions/auth/*`.
Lösenord hashas med **bcryptjs**, tokens med **JWT** i HttpOnly cookies.

## Lokalt (netlify dev – valfritt)
```bash
npm i -g netlify-cli
netlify dev
```
