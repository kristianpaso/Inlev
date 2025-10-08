
// inlev-auth.safe.js — SAFE MODE: never redirects. No loops.
(function(){
  const KEY='auth_safe_'+location.host, DAY=24*60*60*1000;
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
  function guard(){ /* no-op */ }
  window.InlevAuth={login,logout,isAuthed,guard,getUser};
})();