(function(){
  const TOKEN_KEY = 'token';
  const EXP_KEY   = 'token_exp';
  const USER_KEY  = 'user';

  async function authFetch(path, init){
  // prefer /api first, but fall back on 404/5xx or network error
  try{
    const r = await fetch('/api/auth-lite/' + path, init);
    if (r.ok) return r;
    if (r.status !== 404 && r.status < 500) return r; // allow 401/403 to surface
  }catch(e){ /* fall back */ }
  return fetch('/.netlify/functions/auth-lite/' + path, init);
}catch(e){}
    return fetch('/.netlify/functions/auth/' + path, init);
  }

  window.InlevAuth = {
    getToken(){ return localStorage.getItem(TOKEN_KEY); },
    isAuthed(){
      const t = localStorage.getItem(TOKEN_KEY);
      const exp = parseInt(localStorage.getItem(EXP_KEY) || '0', 10);
      return !!t && (!exp || Date.now() < exp * 1000);
    },
    logout(){
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXP_KEY);
      localStorage.removeItem(USER_KEY);
    },
    health: async ()=>{ try{ const r = await authFetch('health'); return r.ok; }catch(e){ return false; } }
      catch(e){ return false; }
    },
    signIn: async (username, password) => {
      const res = await authFetch('login', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ username, password })
      });
      if(!res.ok) return false;
      const data = await res.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('token_exp', data.exp);
      localStorage.setItem('user', JSON.stringify(data.user || {}));
      return true;
    },
        body: JSON.stringify({ username, password })
      });
      if(!res.ok) return false;
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(EXP_KEY, data.exp);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user || {}));
      return true;
    }
  };
})();