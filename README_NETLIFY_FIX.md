
# Netlify login fix + local XLSX vendor fallback

This package contains:
- `netlify/functions/auth.js` — a simple serverless auth API used by the login page.
- `netlify.toml` — adds a redirect so `/api/auth/*` calls the function above.
- `public/js/auth.js` — frontend login script (with safe `catch (err) {}` and a global `initAuth()`).
- `public/js/vendor/xlsx.full.min.js` — your supplied SheetJS bundle.
- `public/js/xlsx-fallback.js` — optional: loads CDN first, then falls back to the local vendor copy.

## How to use

1) **Copy files into your project** (merge folders). Keep `public/` if your static files live there; otherwise move the files into your own static folder and update `netlify.toml` `publish=` accordingly.

2) **Enable the redirect**:
   - Commit `netlify.toml` to the repo.
   - Netlify will automatically route `/api/auth/*` to the function.

3) **Wire the login page** (example `login.html`):
```html
<form id="loginForm">
  <input id="username" placeholder="Användarnamn"/>
  <input id="password" type="password" placeholder="Lösenord"/>
  <button id="loginBtn" type="submit">Fortsätt</button>
  <small id="apiStatus">API: testar…</small>
</form>
<script defer src="/js/auth.js"></script>
<body onload="initAuth()">
```

4) **Stats page XLSX**:
   - Include `<script defer src="/js/xlsx-fallback.js"></script>` before your stats script.

5) **Set credentials (optional)**: in Netlify site settings → Environment variables:
   - `ADMIN_USER` (default `Admin`)
   - `ADMIN_PASS` (default `1234`)

## Why the login broke on Netlify
Your frontend was calling `/api/auth/…` which exists on localhost (Express) but **not** on Netlify static hosting. The redirect in `netlify.toml` forwards those requests to a serverless function (`/.netlify/functions/auth`) so the same URLs work in production.

In the console you also saw `Unexpected token 'catch'` — that can happen if a bare `catch {}` is parsed by an older toolchain. In `public/js/auth.js` we switched to `catch (err) {}` and exposed a global `initAuth()` to remove the "InitAuth is not defined" error.
