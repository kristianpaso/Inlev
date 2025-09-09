/* Inlev custom auth: Express + SQLite + JWT (cookies) */
window.InlevAuth = (function(){
  const CSRF_COOKIE = 'inlev_csrf';
  let _csrf = null;
  async function json(path, opts={}){
    const res = await fetch(path, Object.assign({
      credentials: 'include',
      headers: Object.assign({'Content-Type':'application/json'}, opts.headers||{})
    }, opts));
    if(res.status===204) return null;
    const ct = res.headers.get('content-type')||'';
    if(!ct.includes('application/json')){
      const t = await res.text();
      throw new Error('Unexpected response: '+t);
    }
    const data = await res.json();
    if(!res.ok) throw new Error(data.error||('HTTP '+res.status));
    return data;
  }
  function getCookie(name){
    return document.cookie.split('; ').find(row => row.startsWith(name+'='))?.split('=')[1];
  }
  async function ensureCsrf(){
    if(!_csrf){
      const d = await json('/api/auth/csrf', {method:'GET'});
      _csrf = d.token;
    }
    return _csrf;
  }
  async function me(){
    try{
      const d = await json('/api/auth/me');
      return d.user;
    }catch(_){ return null; }
  }
  async function login(email, password){
    const token = await ensureCsrf();
    const d = await json('/api/auth/login', {
      method:'POST',
      headers: {'X-CSRF-Token': token},
      body: JSON.stringify({email, password})
    });
    return !!d && !!d.user;
  }
  async function logoutTo(path){
    try{
      const token = await ensureCsrf();
      await json('/api/auth/logout', {method:'POST', headers:{'X-CSRF-Token': token}});
    }catch(_){}
    location.href = path || '/login.html';
  }
  function hasAnyRole(user, roles){
    const r = String(user?.role||'watcher').toLowerCase();
    return roles.map(String).map(s=>s.toLowerCase()).includes(r);
  }
  async function initPage(allowedRoles){
    const u = await me();
    if(!u){
      const ret = encodeURIComponent(location.pathname+location.search);
      location.href = '/login.html?return='+ret;
      return;
    }
    if(allowedRoles && allowedRoles.length && !hasAnyRole(u, allowedRoles)){
      document.documentElement.innerHTML = '<div style="padding:24px;font-family:sans-serif;color:#e7eeff;background:#0b1020">Ingen behörighet för den här sidan.</div>';
      return;
    }
    // Apply role UI
    const canEdit = (u.role==='admin' || u.role==='superuser');
    ['markResolved','unmarkResolved','parseUppackning','parseRegistrerade','parseLankade','saveAll','openAll'].forEach(id=>{
      const el = document.getElementById(id);
      if(el){ el.disabled = !canEdit; el.title = canEdit ? '' : 'Endast Admin/Superuser'; }
    });
  }
  return { ensureCsrf, login, logoutTo, me, initPage };
})();