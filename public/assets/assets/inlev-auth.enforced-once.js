
// inlev-auth.enforced-once.js — redirects at most ONCE per browser session to avoid loops.
(function(){
  const KEY='auth_enf_'+location.host, DAY=24*60*60*1000, POST='postLogin', ONCE='authRedirectedOnce';
  const load=()=>{ try{ return JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ return null; } };
  const save=t=>localStorage.setItem(KEY, JSON.stringify(t));
  const clear=()=>localStorage.removeItem(KEY);
  function isAuthed(){ const t=load(); if(!t) return false; if(!t.exp||Date.now()>t.exp){ clear(); return false; } return true; }
  function getUser(){ const t=load(); return t?.user || null; }
  async function tryServerLogin(u,p){
    try{
      const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({username:u,password:p})});
      if(r.ok) return {user:u,exp:Date.now()+DAY,issued:Date.now()};
    }catch(e){}
    return null;
  }
  async function login(u,p){ let t=await tryServerLogin(u,p); if(!t){ if(!u) throw new Error('Skriv ett användarnamn.'); t={user:u,exp:Date.now()+DAY,issued:Date.now()}; } save(t); return true; }
  function logout(){ clear(); }
  function remember(){ try{ sessionStorage.setItem(POST, location.pathname+location.search+location.hash);}catch(e){} }
  function consume(){ try{ const v=sessionStorage.getItem(POST); sessionStorage.removeItem(POST); return v||'/statistik/'; }catch(e){ return '/statistik/'; } }
  function guard(){
    const protectedDirs=['/plock','/trav','/statistik','/schema','/sandningar','/sandningar'];
    const p=location.pathname;
    const needs=protectedDirs.some(d=> p===d || p.startsWith(d+'/'));
    if (needs && !isAuthed()){
      if (!sessionStorage.getItem(ONCE)){
        sessionStorage.setItem(ONCE,'1');
        remember();
        location.replace('/login.html'); // one-time redirect
      }
      // if we've already redirected once this session, don't redirect again
    }
  }
  function init(){
    window.InlevAuth={login,logout,isAuthed,guard,getUser};
    try{ guard(); }catch(e){}
    if (isAuthed() && location.pathname.toLowerCase().endsWith('/login.html')){
      const target=consume(); location.replace(target);
    }
  }
  init();
})();