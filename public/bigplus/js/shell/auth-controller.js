import { $, $$ } from "./dom.js";
import { setAppLoading } from "./loading.js";

export function createAuthController({ accountKey, authApiRoot, currentAccount, ensureDemoAccount, loadInitialRemoteData, renderAccount, sessionKey, showView }) {
  let bootstrapActive = true;
  const isLocalBootstrap = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const bootstrapSessionTimeoutMs = isLocalBootstrap ? 4500 : 20000;
  const bootstrapRemoteDataTimeoutMs = isLocalBootstrap ? 4500 : 20000;
  const devAuthMode = isLocalBootstrap ? new URLSearchParams(window.location.search).get("devAuth") : "";

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function loadInitialRemoteDataWithLimit() {
    if (!isLocalBootstrap) {
      await loadInitialRemoteData();
      return;
    }
    await Promise.race([loadInitialRemoteData(), sleep(bootstrapRemoteDataTimeoutMs)]);
  }

  function useLocalDevAccount() {
    if (!devAuthMode || typeof ensureDemoAccount !== "function") return false;
    ensureDemoAccount();
    if (!currentAccount()) {
      localStorage.setItem(sessionKey, "demo-admin");
      localStorage.setItem("inlev_user", "demo-admin");
    }
    return Boolean(currentAccount());
  }

  async function showLocalDevFallback() {
    renderAccount();
    await loadInitialRemoteDataWithLimit();
    showView(startView());
  }

  function startView() {
    return devAuthMode === "profile" ? "profile" : "home";
  }

  function openAuth(mode = "login") {
    const modal = $("#authModal");
    if (!modal) return;
    document.body.classList.add("auth-required");
    modal.hidden = false;
    setAuthMode(mode);
    $("#authEmail")?.focus();
  }

  function setAuthMode(mode) {
    const register = mode === "register";
    $$('[data-auth-mode]').forEach((button) => button.classList.toggle("active", button.dataset.authMode === mode));
    $("#authTitle").textContent = register ? "Skapa konto" : "Logga in";
    $("#authSubmit").textContent = register ? "Skapa konto" : "Logga in";
    $(".register-only").hidden = !register;
    $("#authModal")?.classList.toggle("is-register", register);
    $("#authForm").dataset.mode = mode;
    $("#authMessage").textContent = "";
  }

  async function handleAuth(event) {
    event.preventDefault();
    bootstrapActive = false;
    const form = event.currentTarget;
    const mode = form.dataset.mode || "login";
    const email = $("#authEmail").value.trim().toLowerCase();
    const password = $("#authPassword").value;
    const message = $("#authMessage");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${authApiRoot}/auth/${mode}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: mode === "register" ? $("#authName").value.trim() : undefined, email, password }), signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunde inte logga in.");
      const account = data.user;
      if (!account?.id) throw new Error("Inloggningen gav inget giltigt användarkonto.");
      localStorage.setItem(accountKey, JSON.stringify([account]));
      localStorage.setItem(sessionKey, account.id);
      localStorage.setItem("inlev_user", account.id);
    } catch (error) {
      message.textContent = error.name === "AbortError" ? "Servern tar längre tid än vanligt att vakna. Försök igen om en stund." : (error.message || "Kunde inte ansluta till servern.");
      return;
    } finally { window.clearTimeout(timeout); }
    $("#authModal").hidden = true;
    document.body.classList.remove("auth-required");
    setAppLoading(true, "Laddar din medlemsprofil...");
    try { await loadInitialRemoteData(); showView("home"); } finally { setAppLoading(false); }
  }

  function finishAuthBootstrap() {
    bootstrapActive = false;
    document.body.classList.remove("auth-bootstrap-pending");
    setAppLoading(false);
  }

  function bootstrap() {
    if (currentAccount()) showView(startView()); else openAuth("login");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), bootstrapSessionTimeoutMs);
    fetch(`${authApiRoot}/auth/me`, { credentials: "include", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then(async (data) => {
        if (!bootstrapActive) return;
        if (!data?.user) {
          if (currentAccount()) { renderAccount(); await loadInitialRemoteDataWithLimit(); showView(startView()); return; }
          if (useLocalDevAccount()) { await showLocalDevFallback(); return; }
          localStorage.removeItem(accountKey); localStorage.removeItem(sessionKey); localStorage.removeItem("inlev_user");
          renderAccount(); openAuth("login"); return;
        }
        localStorage.setItem(accountKey, JSON.stringify([data.user]));
        localStorage.setItem(sessionKey, data.user.id);
        localStorage.setItem("inlev_user", data.user.id);
        await loadInitialRemoteDataWithLimit(); showView(startView());
      })
      .catch(async () => {
        if (!bootstrapActive) return;
        if (currentAccount()) { renderAccount(); await loadInitialRemoteDataWithLimit(); showView(startView()); return; }
        if (useLocalDevAccount()) { await showLocalDevFallback(); return; }
        localStorage.removeItem(accountKey); localStorage.removeItem(sessionKey); localStorage.removeItem("inlev_user");
        renderAccount(); openAuth("login");
      })
      .finally(() => {
        window.clearTimeout(timeout);
        finishAuthBootstrap();
      });
  }

  return { bootstrap, handleAuth, openAuth, setAuthMode };
}
