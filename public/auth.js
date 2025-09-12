(function(global){
  const KEY='inleverans_auth';
  function save(token,exp,user){ localStorage.setItem(KEY, JSON.stringify({token,exp,user})); }
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ return null; } }
  function now(){ return Math.floor(Date.now()/1000); }

  async function tryServerLogin(username,password){
    try{
      const r=await fetch('/api/auth/login',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username,password})
      });
      if(!r.ok) return null;
      return await r.json();
    }catch(e){
      return null;
    }
  }

  const InlevAuth = {
    signIn: async (u,p)=>{
      // 1) Try server auth (Netlify/Express). If it works, persist that token.
      const res = await tryServerLogin(u,p);
      if(res && res.token){
        const {token,exp,user} = res;
        save(token,exp,user);
        return true;
      }

      // 2) Dev/offline fallback: allow Admin/test locally and run in "lokalt läge".
      //    This lets you create sändningar etc. with localStorage even if API is offline.
      if((u==='Admin' || u==='admin') && p==='test'){
        const exp = now() + 24*3600; // 24h
        // Fake token; API calls that require server will gracefully fall back to local mode.
        const token = 'local-dev-'+String(Date.now());
        save(token,exp,{name:'Admin',role:'admin',mode:'local'});
        return true;
      }
      return false;
    },
    signOut: ()=> localStorage.removeItem(KEY),
    get: ()=> load(),
    isAuthed: ()=>{ const s=load(); return !!(s && s.exp>now()); },
    getAccessToken: async ()=>{ const s=load(); if(s&&s.exp>now()) return s.token; return null; }
  };
  global.InlevAuth = InlevAuth;
})(window);