
/* FIX45 guard: allow if localStorage user or cookie 'inlev' */
(function(){
  function hasCookie(name){ return document.cookie.split(/;\s*/).some(p=>p.split('=')[0]===name); }
  if (localStorage.getItem('inlev_user') || hasCookie('inlev')) return;
  try { sessionStorage.setItem('inlev_next', location.pathname + location.search + location.hash); } catch {}
  var login = location.pathname.includes('/sandningar/') ? '../login.html' : './login.html';
  location.replace(login);
})();
