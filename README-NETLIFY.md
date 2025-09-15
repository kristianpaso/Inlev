# Inlev – Netlify Deploy

Detta repo är förberett för Netlify.

## Snabbstart (GitHub → Netlify)

```bash
# 1) Om detta kommer från en zip: ta bort ev. gammal .git-mapp
rm -rf .git

# 2) Initiera nytt repo & första commit
git init
git add .
git commit -m "Init: Inlev med Statistik + Netlify"

# 3) Skapa repo på GitHub och lägg till remote
git branch -M main
git remote add origin https://github.com/<ditt-konto>/<ditt-repo>.git
git push -u origin main
```

## Netlify (via webben)

1. Gå till https://app.netlify.com/ → "Add new site" → "Import an existing project".
2. Välj ditt Git-repo.
3. Build settings:
   - **Base directory:** (lämna tomt)
   - **Build command:** *(tomt)*
   - **Publish directory:** `public`
4. Deploy!

## Netlify (via CLI)

```bash
npm i -g netlify-cli
netlify login
netlify init          # välj "Use current git remote" → "public" som publish dir
netlify deploy --prod # (ska inte behöva build-steg)
```

## Struktur

- `public/` – hela webbplatsen (servas statiskt av Netlify)
- `public/statistik/` – nya Statistik-sidan (filuppladdning + diagram)
- `netlify.toml` – pekar ut `public` samt redirects / headers
- `_redirects` – redundans för pretty URLs (`/plock` → `/plock/`)
```

## Tips
- Använd absoluta länkar som börjar med `/` (vilket projektet redan gör).
- Vill du ha egna domänen? Lägg till på Netlify under "Domain settings".
