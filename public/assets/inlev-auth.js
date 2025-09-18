
// inlev-auth.js v5 — SAFE MODE (no auto-redirects).
// Stops all loops by disabling guard redirects. You can still call InlevAuth.login() on /login.html.
(function(){
  const KEY = 'inlev_auth_token_v5_' + location.host;
  const ONE_DAY = 24*60*60*1000;

  function load(){ try{ return JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ return null; } }
  function save(tok){ localStorage.setItem(KEY, JSON.stringify(tok)); }
  function clear(){ localStorage.removeItem(KEY); }
  function isAuthed(){
    const t = load(); if (!t) return false;
    if (!t.exp || Date.now() > t.exp) { clear(); return false; }
    return true;
  }
  function token(u){ return { user:u||'user', exp: Date.now()+ONE_DAY, issued: Date.now() }; }
  async function tryServerLogin(u,p){
    try{
      const r = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({username:u,password:p})});
      if (r.ok) return token(u);
    }catch(e){} return null;
  }
  async function login(u,p){
    let t = await tryServerLogin(u,p);
    if (!t){ if(!u) throw new Error('Skriv ett användarnamn.'); t = token(u); }
    save(t); return true;
  }
  function logout(){ clear(); }

  function guard(){ /* SAFE MODE: do nothing to avoid loops */ }

  window.InlevAuth = { login, logout, isAuthed, guard };
  console.info('[InlevAuth] SAFE MODE active – no auto redirects.');
})();
