Denna patch säkerställer att /plock/index.html inte har redirect.
- Filen innehåller markören PLOCK_ROUTING_FINAL_v4 och loggar 'PLOCK_ROUTING_FINAL_v4' i console.

Om /plock fortfarande loopar:
1) Hård-uppdatera (Ctrl/Cmd+Shift+R) och rensa cache.
2) Avregistrera ev. service worker i DevTools → Application → Service Workers.
3) Om du inte kör Apache, .htaccess ignoreras. Peka menylänken till /plock/index.html eller lägg motsv. regel i din server:
   - nginx: location = /plock { return 302 /plock/index.html; }
   - Express: app.get(['/plock', '/plock/'], (req,res)=>res.redirect(302, '/plock/index.html'));