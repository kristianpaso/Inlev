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
