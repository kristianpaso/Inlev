/* Inlev auth scaffold – Netlify Identity + role checks */
window.InlevAuth = (function(){
  let identity = null;
  const ROLES = ['admin','superuser','watcher'];

  function loadIdentity(){
    if(window.netlifyIdentity){ return window.netlifyIdentity; }
    // If widget not on page, still allow anonymous (for local dev)
    return null;
  }
  function currentUser(){
    const id = loadIdentity();
    return id ? id.currentUser() : null;
  }
  function normalizeRole(u){
    const roles = (u && u.app_metadata && u.app_metadata.roles) || [];
    const r = (roles[0]||'').toLowerCase();
    if(ROLES.includes(r)) return r;
    return 'watcher';
  }
  function hasAnyRole(u, allowed){
    if(!u) return false;
    const roles = (u.app_metadata && u.app_metadata.roles) || [];
    return roles.some(r => allowed.includes(String(r).toLowerCase()));
  }
  function requireAuth(allowed=['admin','superuser','watcher']){
    const id = loadIdentity();
    if(!id){ // no widget present; allow for local dev
      return {user:null, role:'watcher'};
    }
    const u = id.currentUser();
    if(!u){
      const ret = encodeURIComponent(location.pathname+location.search);
      location.replace('/login.html?return='+ret);
      return null;
    }
    if(!hasAnyRole(u, allowed)){
      document.documentElement.innerHTML = '<div style="padding:24px;font-family:sans-serif;color:#e7eeff;background:#0b1020">Ingen behörighet för den här sidan.</div>';
      return null;
    }
    return {user:u, role:normalizeRole(u)};
  }
  function applyRoleUI(role){
    const canEdit = (role==='admin' || role==='superuser');
    // Common buttons across app – disable for watchers
    const ids = ['markResolved','unmarkResolved','parseUppackning','parseRegistrerade','parseLankade','saveAll','openAll'];
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if(el){ el.disabled = !canEdit; el.title = canEdit ? '' : 'Endast Admin/Superuser kan utföra denna åtgärd'; }
    });
  }
  function initPage(allowedRoles){
    const r = requireAuth(allowedRoles || ['admin','superuser','watcher']);
    if(!r) return;
    applyRoleUI(r.role);
    return r;
  }
  function initIndex(opts){
    const id = loadIdentity();
    const handler = ()=>{
      const u = currentUser();
      if(opts && typeof opts.onUser==='function'){ opts.onUser(u); }
    };
    if(id){
      id.on('init', handler);
      id.on('login', ()=>{ handler(); });
      id.on('logout', ()=>{ handler(); });
      id.init();
    }else{
      handler();
    }
  }
  function initLogin(opts){
    const id = loadIdentity();
    if(!id){
      if(opts && opts.onStatus) opts.onStatus('Netlify Identity Widget saknas – körs lokalt?');
      return;
    }
    id.on('init', user => {
      if(opts && opts.onStatus) opts.onStatus(user ? 'Inloggad' : 'Inte inloggad');
    });
    id.on('login', user => {
      if(opts && opts.onStatus) opts.onStatus('Inloggad');
      const ret = new URLSearchParams(location.search).get('return');
      location.href = ret || (opts && opts.onLoggedInRedirect) || '/';
    });
    id.on('logout', () => {
      if(opts && opts.onStatus) opts.onStatus('Utloggad');
    });
    id.on('error', err => {
      if(opts && opts.onStatus) opts.onStatus('Fel: '+(err && err.message || err));
    });
    id.init();
  }
  function logoutTo(path){
    const id = loadIdentity();
    if(!id){ location.href = path || '/'; return; }
    id.logout();
    setTimeout(()=>{ location.href = path || '/'; }, 300);
  }
  return { initPage, initIndex, initLogin, logoutTo };
})();