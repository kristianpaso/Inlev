import { AUTH_API_ROOT } from "../js/shell/api-root.js";
import { fetchWithApiFallback } from "../js/shell/api-fetch.js";
import { $, $$ } from "../js/shell/dom.js";
import { ACCOUNT_KEY, SESSION_KEY } from "../js/shell/storage.js";
import { accounts, currentAccount, ensureDemoAccount } from "../js/shell/account.js";
import { createCompetitionCardHelpers } from "../js/shell/competition-cards.js";
import { createCompetitionController } from "../js/shell/competition-controller.js";
import { createLeaderboardRenderer } from "../js/shell/leaderboard.js";
import { favoriteCompetition, setFavoriteCompetition } from "../js/shell/preferences.js";
import { competitionMetricLabel, competitionSpeciesLabel } from "../js/shell/competition-utils.js";
import { mountSiteChrome } from "../js/shell/site-chrome.js?v=20260908-header-icons-1";

let remoteCompetitions = [];
let remoteCatches = [];

function apiUrl(path) { return `${AUTH_API_ROOT}${path}`; }
function account() { return currentAccount(); }
function setNotice(message = "") { $("competitionPageNotice").textContent = message; }

function setAuthMode(mode = "login") {
  const register = mode === "register";
  $$('[data-auth-mode]').forEach((button) => button.classList.toggle("active", button.dataset.authMode === mode));
  $("authTitle").textContent = register ? "Skapa konto" : "Logga in";
  $("authSubmit").textContent = register ? "Skapa konto" : "Logga in";
  $("authForm").dataset.mode = mode;
  $$(".register-only").forEach((field) => { field.hidden = !register; });
  $("authMessage").textContent = "";
}

function openAuth(mode = "login") {
  document.body.classList.add("auth-required");
  $("authModal").hidden = false;
  setAuthMode(mode);
  $("authEmail")?.focus();
}

function updateAccountChrome() {
  const user = account();
  const initial = (user?.name || "B").slice(0, 1).toUpperCase();
  [$("mobileAccountButton"), $("desktopAccountButton")].filter(Boolean).forEach((button) => { button.textContent = initial; });
}

async function handleAuth(event) {
  event.preventDefault();
  const mode = event.currentTarget.dataset.mode || "login";
  const message = $("authMessage");
  try {
    const response = await fetch(apiUrl(`/auth/${mode}`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: mode === "register" ? $("authName").value.trim() : undefined, email: $("authEmail").value.trim().toLowerCase(), password: $("authPassword").value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.user?.id) throw new Error(data.error || "Kunde inte logga in.");
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify([data.user]));
    localStorage.setItem(SESSION_KEY, data.user.id);
    localStorage.setItem("inlev_user", data.user.id);
    $("authModal").hidden = true;
    document.body.classList.remove("auth-required");
    updateAccountChrome();
    await loadPageData();
  } catch (error) {
    message.textContent = error.message || "Kunde inte ansluta till servern.";
  }
}

async function loadRemoteCatches() {
  try {
    const response = await fetchWithApiFallback(apiUrl("/catches"), { credentials: "include" });
    remoteCatches = response.ok ? await response.json().catch(() => []) : [];
  } catch { remoteCatches = []; }
}

async function loadRemoteCompetitions() {
  const response = await fetchWithApiFallback(apiUrl("/competitions"), { credentials: "include" });
  const data = await response.json().catch(() => []);
  if (response.status === 401) {
    openAuth("login");
    setNotice("Din session behöver förnyas. Logga in igen för att se tävlingarna.");
    return;
  }
  if (!response.ok) throw new Error(data.error || `Kunde inte ladda tävlingar (HTTP ${response.status}).`);
  remoteCompetitions = Array.isArray(data) ? data : [];
  renderCompetitions();
}

const renderLeaderboard = createLeaderboardRenderer({
  acceptedFriendIds: () => [],
  accounts,
  catches: () => remoteCatches,
  currentAccount: account
});

const { competitionCard, decorateCompetitionCards } = createCompetitionCardHelpers({
  competitionMetricLabel,
  competitionSpeciesLabel,
  competitions: () => remoteCompetitions,
  currentAccount: account,
  isCompetitionMember: (item) => Boolean(account()?.id && (item?.members || []).map(String).includes(String(account().id)))
});

const competitionController = createCompetitionController({
  accounts,
  authApiRoot: AUTH_API_ROOT,
  competitionCard,
  competitions: () => remoteCompetitions,
  currentAccount: account,
  decorateCompetitionCards,
  isCompetitionMember: (item) => Boolean(account()?.id && (item?.members || []).map(String).includes(String(account().id))),
  loadRemoteCompetitions,
  openAuth,
  renderHomeActivity: () => {},
  renderHomeCompetitionRank: () => {},
  renderHomeTournament: () => {},
  renderLeaderboard
});

const { createCompetition, deleteCompetition, joinCompetition, leaveCompetition, renderCompetitionDetails, renderCompetitions, renderParticipantCatches, saveCompetition, toggleCompetitionDetails } = competitionController;

function showCompetitionView() {
  document.body.classList.remove("auth-bootstrap-pending");
  document.body.classList.remove("auth-required");
  $("competitionsView").hidden = false;
  updateAccountChrome();
}

async function loadPageData() {
  showCompetitionView();
  try {
    await Promise.all([loadRemoteCatches(), loadRemoteCompetitions()]);
    renderCompetitions();
    renderLeaderboard();
  } catch (error) {
    setNotice(error.message || "Kunde inte ladda tävlingarna.");
    $("competitionsList").innerHTML = '<div class="empty-list"><strong>Tävlingarna kunde inte laddas</strong><span>Försök igen när servern är tillgänglig.</span></div>';
  }
}

function navigate(view) {
  const routes = {
    home: "/bigplus/",
    catches: "/bigplus/fangster",
    weather: "/bigplus/?view=weather",
    measure: "/bigplus/mat/",
    competitions: "/bigplus/tavlingar",
    profile: "/bigplus/profil",
    journal: "/bigplus/fisketurer"
  };
  if (routes[view] && view !== "competitions") window.location.assign(routes[view]);
}

function bind() {
  $$('[data-auth-mode]').forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
  $("authForm")?.addEventListener("submit", handleAuth);
  $("closeAuthButton")?.addEventListener("click", () => { $("authModal").hidden = true; });
  $("mobileAccountButton")?.addEventListener("click", () => navigate("profile"));
  $("desktopAccountButton")?.addEventListener("click", () => navigate("profile"));
  $$('[data-view]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
  $("mobileMenuButton")?.addEventListener("click", (event) => {
    const open = document.body.classList.toggle("mobile-menu-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  $("profileMenuEdit")?.addEventListener("click", () => navigate("profile"));
  $("profileMenuLogout")?.addEventListener("click", async () => {
    await fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem(ACCOUNT_KEY); localStorage.removeItem(SESSION_KEY); localStorage.removeItem("inlev_user");
    openAuth("login");
  });
  $("createCompetitionButton")?.addEventListener("click", createCompetition);
  $("competitionForm")?.addEventListener("submit", saveCompetition);
  $("competitionSpeciesAll")?.addEventListener("change", (event) => {
    document.querySelectorAll('input[name="competitionSpecies"]').forEach((input) => { input.disabled = event.target.checked; });
  });
  document.querySelectorAll('input[name="competitionSpecies"]').forEach((input) => { input.disabled = $("competitionSpeciesAll")?.checked === true; });
  $("cancelCompetitionButton")?.addEventListener("click", () => { $("competitionCreatePanel").hidden = true; });
  $("competitionsList")?.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-competition-action]");
    const card = event.target.closest(".competition-card");
    const id = action?.dataset.competitionId || card?.dataset.competitionId;
    if (!id) return;
    try {
      if (action?.dataset.competitionAction === "join") await joinCompetition(id);
      else if (action?.dataset.competitionAction === "leave") await leaveCompetition(id);
      else if (action?.dataset.competitionAction === "delete") await deleteCompetition(id);
      else if (action?.dataset.competitionAction === "favorite") { setFavoriteCompetition(favoriteCompetition() === id ? "" : id); renderCompetitions(); }
      else toggleCompetitionDetails(id);
    } catch (error) { setNotice(error.message || "Kunde inte uppdatera tävlingen."); }
  });
  $("competitionDetails")?.addEventListener("click", (event) => {
    const favorite = event.target.closest('[data-competition-action="favorite"]');
    if (favorite) { const id = favorite.dataset.competitionId; setFavoriteCompetition(favoriteCompetition() === id ? "" : id); renderCompetitions(); renderCompetitionDetails(id); return; }
    const participant = event.target.closest(".competition-participant");
    if (participant) renderParticipantCatches(participant.dataset.competitionId, participant.dataset.participantId);
  });
}

async function bootstrap() {
  mountSiteChrome();
  if (["localhost", "127.0.0.1"].includes(window.location.hostname) && new URLSearchParams(window.location.search).get("devAuth") === "competitions") ensureDemoAccount();
  bind();
  if (!account()) { document.body.classList.remove("auth-bootstrap-pending"); openAuth("login"); return; }
  await loadPageData();
}

bootstrap();
