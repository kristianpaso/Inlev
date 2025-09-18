
// inlev-auth.js v3 — loop-safe auth + postLogin memory + slash normalization
(function(){
  const KEY = 'inlev_auth_token_v3_' + location.host;
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
      const res = await fetch('/api/auth/login',{
        method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
        body: JSON.stringify({ username, password })
      });
      if (res.ok) return token(username);
    }catch(e){/* ignore */}
    return null;
  }

  async function login(username,password){
    let t = await tryServerLogin(username,password);
    if (!t){
      if (!username) throw new Error('Skriv ett användarnamn.');
      t = token(username); // static fallback
    }
    save(t); return true;
  }

  function logout(){ clear(); }

  function normalizePath(p){
    if (!p) return '/';
    if (!p.startsWith('/')) p = '/' + p;
    if (p.endsWith('.html')) return p;    // don't touch files
    return p.endsWith('/') ? p : p + '/'; // ensure trailing slash for dirs
  }

  function redirect(p){ location.replace(normalizePath(p)); }

  function rememberTarget(){
    try{
      sessionStorage.setItem(POST_KEY, location.pathname + location.search + location.hash);
    }catch(e){}
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
    const here = location.pathname;

    // normalize slash once per load to avoid loops
    const wanted = normalizePath(here);
    if (here !== wanted){
      // If Netlify rewrites show as /plock without slash, enforce once
      if (!sessionStorage.getItem('onceSlashFix')){
        sessionStorage.setItem('onceSlashFix','1');
        return redirect(wanted);
      }
    }

    const needsAuth = protectedDirs.some(d => wanted.startsWith(normalizePath(d)));
    if (needsAuth && !isAuthed()){
      rememberTarget();
      if (!wanted.endsWith('/login.html')) redirect('/login.html');
    }
  }

  function init(){
    window.InlevAuth = { init, login, logout, isAuthed, guard, normalizePath };
    try { guard(); } catch (e) { console.warn('Auth guard error', e); }
    // If we land on login.html but already authed → go to remembered page
    const path = location.pathname.toLowerCase();
    if (isAuthed() && path.endsWith('/login.html')){
      const target = consumeTarget();
      redirect(target);
    }
  }

  init();
})();
