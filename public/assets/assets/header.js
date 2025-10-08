
/**
 * header.js — Auth-aware header + loop-safe gating
 * data-auth-mode: 'gate' (default), 'safe', 'enforced-once'
 *  - gate: never redirects; hides main content with a login prompt if not authed
 *  - safe: never redirects; shows full content regardless (for debugging)
 *  - enforced-once: redirects to /login.html at most once per session if not authed
 */
(function(){
  const tag = document.currentScript;
  const mode = (tag && tag.dataset.authMode) || 'gate';

  function load(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.defer=true; s.onload=res; s.onerror=()=>rej(new Error('Kunde inte ladda '+src)); document.head.appendChild(s); }); }

  async function boot(){
    try{
      if (mode==='enforced-once') await load('/assets/inlev-auth.enforced-once.js');
      else await load('/assets/inlev-auth.safe.js'); // covers 'gate' and 'safe'
    }catch(e){ console.warn('[header] auth load fail', e); }

    const mount = document.getElementById('site-header') || (function(){ const d=document.createElement('div'); d.id='site-header'; document.body.insertBefore(d, document.body.firstChild); return d; })();
    const user = (window.InlevAuth && InlevAuth.getUser && InlevAuth.getUser()) || 'Gäst';
    const authed = window.InlevAuth && InlevAuth.isAuthed && InlevAuth.isAuthed();

    // Render header
    mount.innerHTML = `
      <div style="padding:12px 16px;background:#0d1420;border-bottom:1px solid #1f2a37;display:flex;gap:14px;align-items:center;color:#fff">
        <strong>Inlev</strong>
        <a href="/plock/" style="color:#fff;text-decoration:none">Plock</a>
        <a href="/trav/" style="color:#fff;text-decoration:none">Trav</a>
        <a href="/statistik/" style="color:#fff;text-decoration:none">Statistik</a>
        <a href="/schema/" style="color:#fff;text-decoration:none">Schema</a>
        <a href="/sandningar/" style="color:#fff;text-decoration:none">Sändningar</a>
        <span style="margin-left:auto;opacity:.9">Inloggad som: <strong>${user}</strong></span>
        ${authed
          ? '<button id="logoutBtn" style="margin-left:10px;background:#ef4444;border:none;color:#fff;padding:8px 10px;border-radius:8px;cursor:pointer">Logga ut</button>'
          : '<a id="loginBtn" href="/login.html" style="margin-left:10px;background:#4aa3ff;border:none;color:#fff;padding:8px 10px;border-radius:8px;text-decoration:none">Logga in</a>'}
      </div>`;

    // GATE mode: hide content if not authed, show inline prompt instead (no redirects)
    if (mode==='gate'){
      const main = document.querySelector('main') || document.body;
      if (!authed){
        main.setAttribute('data-gated','1');
        main.innerHTML = `
          <div style="max-width:680px;margin:28px auto" class="card">
            <h2>Inloggning krävs</h2>
            <p>Du måste vara inloggad för att se den här sidan.</p>
            <p><a href="/login.html" style="background:#4aa3ff;color:#fff;padding:10px 12px;border-radius:8px;text-decoration:none">Gå till inloggning</a></p>
          </div>`;
      }
    }

    const btn = document.getElementById('logoutBtn');
    if (btn) btn.addEventListener('click', () => { try{ InlevAuth.logout && InlevAuth.logout(); }catch(e){} location.replace('/login.html'); });

    // Update header if token changes
    window.addEventListener('storage', (ev)=>{ if((ev.key||'').includes('auth_')) location.reload(); });
  }
  boot();
})();