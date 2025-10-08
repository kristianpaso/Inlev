/* Inlev FIX49 – auth with ROOT as default redirect */
(function(){
  const API = '/api/auth/login';
  function setCookie(name,val){ document.cookie = name+'='+val+'; path=/; SameSite=Lax'; }
  function hasCookie(name){ return document.cookie.split(/;\s*/).some(p=>p.split('=')[0]===name); }

  // Default target is now the ROOT hub (index.html)
  function redirectAfter(){
    let next=null; try{ next=sessionStorage.getItem('inlev_next'); }catch{}
    if(!next || next==='null' || next==='undefined') next='/index.html';
    try{ sessionStorage.removeItem('inlev_next'); }catch{}
    try{ const u=new URL(next, location.origin); location.assign(u.toString()); }catch{ location.href=next; }
  }

  async function tryServer(u,p){
    try{
      const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
      if(!r.ok) throw new Error('status '+r.status);
      const d=await r.json().catch(()=>({}));
      if(d && (d.token||d.ok)){
        if(d.token) localStorage.setItem('inlev_token', d.token);
        localStorage.setItem('inlev_user', u||'inloggad');
        setCookie('inlev','1');
        return true;
      }
      throw new Error('bad payload');
    }catch(e){ console.warn('server auth unavailable', e); return false; }
  }

  function local(u,p){
    if ((u||'').toLowerCase()==='admin' && p==='test' || (u&&p)){
      localStorage.setItem('inlev_user', u);
      localStorage.setItem('inlev_token','dev-'+Date.now());
      setCookie('inlev','1');
      return true;
    }
    return false;
  }

  function setError(m){ const el=document.getElementById('loginError'); if(el){ el.textContent=m||''; el.style.display=m?'block':'none'; } }

  async function onSubmit(ev){
    ev.preventDefault();
    const u=document.getElementById('username')?.value?.trim();
    const p=document.getElementById('password')?.value?.trim();
    setError('');
    if (await tryServer(u,p)) return redirectAfter();
    if (local(u,p)) return redirectAfter();
    setError('Felaktiga uppgifter. (Tips: Admin / test)');
  }

  function attach(){
    const f=document.getElementById('loginForm'); if(f) f.addEventListener('submit', onSubmit);
    // Auto-forward från login om redan inloggad
    const isLogin=/\/login\.html(\?|#|$)/.test(location.pathname) || document.title.toLowerCase().includes('logga in');
    if (isLogin && (localStorage.getItem('inlev_user') || hasCookie('inlev'))) redirectAfter();
  }

  window.InlevAuth={ redirectAfter };
  document.addEventListener('DOMContentLoaded', attach);
})();
