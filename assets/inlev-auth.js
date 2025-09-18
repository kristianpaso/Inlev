
// inlev-auth.js v4 — loop-proof: no slash redirects, only login/post-login handling.
(function(){
  const KEY = 'inlev_auth_token_v4_' + location.host;
  const ONE_DAY = 24*60*60*1000;
  const POST_KEY = 'postLogin';

  function load(){ try{ return JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ return null; } }
  function save(tok){ localStorage.setItem(KEY, JSON.stringify(tok)); }
  function clear(){ localStorage.removeItem(KEY); }

  function isAuthed(){
    const t = load();
    if (!t) return false;
    if (!t.exp || Date.now() > t.exp) { clear(); return false; }
    return true;
  }
  function token(u){ return { user:u||'user', exp: Date.now()+ONE_DAY, issued: Date.now() }; }

  async function tryServerLogin(username,password){
    try{
      const res = await fetch('/api/auth/login',{ method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ username, password }) });
      if (res.ok) return token(username);
    }catch(e){}
    return null;
  }

  async function login(username,password){
    let t = await tryServerLogin(username,password);
    if (!t){
      if (!username) throw new Error('Skriv ett användarnamn.');
      t = token(username);
    }
    save(t); return true;
  }

  function logout(){ clear(); }

  function rememberTarget(){
    try{ sessionStorage.setItem(POST_KEY, location.pathname + location.search + location.hash); }catch(e){}
  }
  function consumeTarget(){
    try{
      const v = sessionStorage.getItem(POST_KEY);
      sessionStorage.removeItem(POST_KEY);
      return v || '/statistik/';
    }catch(e){ return '/statistik/'; }
  }

  function guard(){
    const protectedDirs = ['/plock','/trav','/statistik','/schema'];
    const path = location.pathname; // use as-is; no slash normalization to avoid loops
    const needsAuth = protectedDirs.some(d => path === d || path.startsWith(d + '/') );
    if (needsAuth && !isAuthed()){
      rememberTarget();
      if (!path.endsWith('/login.html')) location.replace('/login.html');
    }
  }

  function init(){
    window.InlevAuth = { init, login, logout, isAuthed, guard };
    try { guard(); } catch (e) { console.warn('Auth guard error', e); }
    const path = location.pathname.toLowerCase();
    if (isAuthed() && path.endsWith('/login.html')){
      const target = consumeTarget();
      location.replace(target); // do not normalize; rely on redirects
    }
  }

  init();
})();
