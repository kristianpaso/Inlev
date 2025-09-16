
/* Inlev simple client-side auth (cookie): admin/test */
(function (w, d) {
  var CREDS_USER = 'admin';
  var CREDS_PASS = 'test';
  var CK_U='inlev_u', CK_EXP='inlev_exp', RETURN_KEY='inlev_return_to';
  function setCookie(k,v,maxAgeSec){ d.cookie=k+'='+encodeURIComponent(v)+'; path=/; max-age='+(maxAgeSec||0); }
  function getCookie(k){ var name=k+'='; var ca=d.cookie?d.cookie.split(';'):[]; for(var i=0;i<ca.length;i++){var c=ca[i].trim(); if(c.indexOf(name)===0) return decodeURIComponent(c.substring(name.length));} return null; }
  function clearCookie(k){ d.cookie=k+'=; path=/; max-age=0'; }
  function saveSession(user, minutes){ var ttlMin=(typeof minutes==='number'?minutes:12*60); var exp=(new Date().getTime())+ttlMin*60*1000; setCookie(CK_U,user||'Admin',ttlMin*60); setCookie(CK_EXP,String(exp),ttlMin*60); }
  function readSession(){ var u=getCookie(CK_U), e=getCookie(CK_EXP); if(!u||!e) return null; var exp=parseInt(e,10); if(!(exp>0)) return null; return {u:u,exp:exp}; }
  function isAuthed(){ var s=readSession(); return !!(s && s.exp && s.exp>(new Date().getTime())); }
  function logout(opts){ clearCookie(CK_U); clearCookie(CK_EXP); w.location.href=(opts&&opts.to)||'/login.html'; }
  function login(user, pass){ return new Promise(function(res, rej){ if(!user||!pass){ rej(new Error('missing')); return;} var ok=String(user).toLowerCase()===CREDS_USER && String(pass)===CREDS_PASS; if(!ok){ rej(new Error('bad')); return;} saveSession(user); res({ok:true,user:user}); }); }
  function requireAuth(){ if(isAuthed()) return; if(w.sessionStorage&&w.sessionStorage.setItem){ w.sessionStorage.setItem(RETURN_KEY,w.location.pathname+w.location.search+w.location.hash); } w.location.href='/login.html'; }
  function afterLoginRedirect(){ var url='/'; if(w.sessionStorage&&w.sessionStorage.getItem){ var back=w.sessionStorage.getItem(RETURN_KEY); if(back){ url=back; if(w.sessionStorage.removeItem) w.sessionStorage.removeItem(RETURN_KEY);} } w.location.href=url; }
  w.InlevAuth = { login:login, logout:logout, isAuthed:isAuthed, requireAuth:requireAuth, afterLoginRedirect:afterLoginRedirect };
  if (w.InlevAuth && !w.InlevAuth.signIn) { w.InlevAuth.signIn = w.InlevAuth.login; }
})(window, document);
