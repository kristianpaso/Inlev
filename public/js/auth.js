<<<<<<< HEAD

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
  function afterLoginRedirect(){ var url='/statistik/'; if(w.sessionStorage&&w.sessionStorage.getItem){ var back=w.sessionStorage.getItem(RETURN_KEY); if(back){ url=back; if(w.sessionStorage.removeItem) w.sessionStorage.removeItem(RETURN_KEY);} } w.location.href=url; }
  w.InlevAuth = { login:login, logout:logout, isAuthed:isAuthed, requireAuth:requireAuth, afterLoginRedirect:afterLoginRedirect };
  if (w.InlevAuth && !w.InlevAuth.signIn) { w.InlevAuth.signIn = w.InlevAuth.login; }
})(window, document);
=======
// /public/js/auth.js
// Works on both localhost (/api/auth) and Netlify (redirect -> /.netlify/functions/auth)
(function () {
  "use strict";

  const API = "/api/auth";

  async function updateApiBadge(ok) {
    const el = document.getElementById("apiStatus");
    if (el) {
      el.textContent = ok ? "API: OK" : "API: når inte /api/auth";
      el.style.background = ok ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.2)";
      el.style.color = ok ? "#10B981" : "#EF4444";
    }
  }

  async function checkApi() {
    try {
      const res = await fetch(API + "/health", { cache: "no-store" });
      await updateApiBadge(res.ok);
    } catch (err) {
      console.error("API health failed:", err);
      await updateApiBadge(false);
    }
  }

  async function doLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    const u = (document.getElementById("username") || {}).value || "";
    const p = (document.getElementById("password") || {}).value || "";

    try {
      const res = await fetch(API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u.trim(), password: p })
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error || "Inloggning misslyckades";
        throw new Error(msg);
      }
      const data = await res.json();
      localStorage.setItem("token", data.token);
      // Go to the app (change if your start page is different)
      window.location.href = "/index.html";
    } catch (err) {
      console.error(err);
      alert(err && err.message ? err.message : "Något gick fel vid inloggning.");
    }
  }

  // Expose one global init used by login.html: <body onload="initAuth()">
  window.initAuth = function initAuth() {
    checkApi();
    const form = document.getElementById("loginForm");
    const btn = document.getElementById("loginBtn");
    if (form) form.addEventListener("submit", doLogin);
    if (btn) btn.addEventListener("click", doLogin);
  };
})();
>>>>>>> d8d7a1e89c1ca5c243a59af23b3a3e094fbe6945
