
(function(global){
  const KEY='inleverans_auth';
  function save(token,exp,user){ localStorage.setItem(KEY, JSON.stringify({token,exp,user})); }
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ return null; } }
  function now(){ return Math.floor(Date.now()/1000); }
  
async function authFetch(path, init){
  // Try via /api first
  try{
    const r = await fetch('/api/auth/' + path, init);
    if (r.ok || r.status !== 404) return r;
  }catch(e){ /* ignore and fall back */ }
  // Fallback direct to Functions (works even utan redirects)
  return fetch('/.netlify/functions/auth/' + path, init);
}

const InlevAuth = {
    health: async ()=>{ try{ const r = await authFetch('health'); return r.ok; }catch(e){ return false; } }catch(e){ return false; } },
    signIn: async (u,p)=>{ 
      try{
        const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
        if(!r.ok) return false;
        const {token,exp,user}=await r.json();
        save(token,exp,user); 
        return true;
      }catch(e){ return false; }
    },
    signOut: ()=> localStorage.removeItem(KEY),
    get: ()=> load(),
    isAuthed: ()=>{ const s=load(); return !!(s && s.exp>now()); },
    getAccessToken: async ()=>{ const s=load(); if(s&&s.exp>now()) return s.token; return null; }
  };
  global.InlevAuth = InlevAuth;
})(window);
