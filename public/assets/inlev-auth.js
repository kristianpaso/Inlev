
(function(){
  const KEY = 'inlev_auth_token_v2_' + location.host;
  const ONE_DAY = 24*60*60*1000;

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
  function normalizePath(p){ if(!p.startsWith('/')) p='/'+p; if(p.endsWith('.html')) return p; return p.endsWith('/')?p:p+'/'; }
  function redirect(p){ location.replace(normalizePath(p)); }
  function guard(){
    const protectedDirs=['/plock','/trav','/statistik','/schema'];
    const here = location.pathname.toLowerCase();
    const needsAuth = protectedDirs.some(d => here.startsWith(normalizePath(d)));
    if(needsAuth && !isAuthed()) redirect('/login.html');
  }
  function init(){ window.InlevAuth={init,login,logout,isAuthed,guard,normalizePath}; try{guard();}catch(e){console.warn(e);} }
  init();
})();
