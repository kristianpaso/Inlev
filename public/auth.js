(function(){
  const TOKEN_KEY = 'token';
  const EXP_KEY   = 'token_exp';
  const USER_KEY  = 'user';

  async function authFetch(path, init){
    try{
      const r = await fetch('/api/auth/' + path, init);
      if (r.ok || r.status !== 404) return r;
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
    health: async () => {
      try { const r = await authFetch('health'); return r.ok; }
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
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(EXP_KEY, data.exp);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user || {}));
      return true;
    }
  };
})();