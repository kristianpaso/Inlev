const ACCOUNT_KEY = "bigplus_accounts";
const SESSION_KEY = "bigplus_session";
const CATCH_KEY = "bigplus_catches";
const COMPETITION_KEY = "bigplus_competitions";
const PERSONAL_BEST_KEY = "bigplus_personal_bests";
const FAVORITE_COMPETITION_KEY = "bigplus_favorite_competition";
const FRIENDS_KEY = "bigplus_friends";
const FRIEND_REQUESTS_KEY = "bigplus_friend_requests";
const LIVE_KEY = "bigplus_live_status";
const HOME_CATCH_VIEW_KEY = "bigplus_home_catch_view";
let remoteCatches = null;
let remoteCompetitions = null;
let remoteSharedCatches = [];
let remoteFriends = null;
let friendSearchResult = null;
let mapSharingEnabled = false;
let remoteMapZones = [];
let pendingProfilePhoto = "";
let authBootstrapActive = true;
let pendingCatchDeleteId = "";
let pendingCatchDeleteCode = "";
// Keep the local API on the same hostname so host-only session cookies are sent.
const LOCAL_API_HOST = window.location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
const AUTH_API_ROOT = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? `http://${LOCAL_API_HOST}:4100/api/bigplus`
  : (window.BIGPLUS_RENDER_API_ROOT || "https://bigplus-api.onrender.com/api/bigplus");
const AUTH_API_FALLBACK_ROOT = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? `http://${LOCAL_API_HOST === "127.0.0.1" ? "localhost" : "127.0.0.1"}:4100/api/bigplus`
  : null;

async function fetchCompetitionCreate(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (!AUTH_API_FALLBACK_ROOT || !url.startsWith(AUTH_API_ROOT)) throw error;
    return fetch(`${AUTH_API_FALLBACK_ROOT}${url.slice(AUTH_API_ROOT.length)}`, options);
  }
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setAppLoading(active, message = "Laddar...") {
  const screen = $("#appLoadingScreen");
  if (!screen) return;
  screen.hidden = !active;
  screen.setAttribute("aria-hidden", String(!active));
  const label = $("#appLoadingMessage");
  if (label) label.textContent = message;
  document.body.classList.toggle("is-app-loading", active);
}

window.bigplusLoading = {
  show: (message) => setAppLoading(true, message),
  hide: () => setAppLoading(false)
};

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}

function accounts() { return readJson(ACCOUNT_KEY, []); }
function catches() {
  // MongoDB is the source of truth for an authenticated account. Do not let
  // old demo records from this browser leak into the member's views.
  if (currentAccount()) return Array.isArray(remoteCatches) ? remoteCatches : [];
  return [];
}
function competitions() {
  return currentAccount() && Array.isArray(remoteCompetitions) ? remoteCompetitions : [];
}
function membershipKey() {
  return `bigplus_competition_memberships:${currentAccount()?.id || "guest"}`;
}
function memberships() { return readJson(membershipKey(), []); }
function isCompetitionMember(competition) {
  const accountId = currentAccount()?.id;
  return Boolean(accountId && (competition?.members || []).includes(accountId));
}
function personalBestKey() { return `${PERSONAL_BEST_KEY}:${currentAccount()?.id || "guest"}`; }
function personalBests() { return readJson(personalBestKey(), {}); }
function favoriteCompetition() {
  const key = `${FAVORITE_COMPETITION_KEY}:${currentAccount()?.id || "guest"}`;
  const raw = localStorage.getItem(key);
  if (!raw) return "";
  try { return JSON.parse(raw) || ""; } catch { return raw; }
}
function setFavoriteCompetition(id) { localStorage.setItem(`${FAVORITE_COMPETITION_KEY}:${currentAccount()?.id || "guest"}`, JSON.stringify(id || "")); }
function friendIds(accountId = currentAccount()?.id) { return accountId ? readJson(`${FRIENDS_KEY}:${accountId}`, []) : []; }
function acceptedFriendIds(accountId = currentAccount()?.id) {
  const remote = remoteFriends?.friends?.map((item) => String(item.id || item._id || "")).filter(Boolean) || [];
  return [...new Set([...friendIds(accountId), ...remote])].filter((id) => id !== String(accountId || ""));
}
function setFriendIds(accountId, ids) { if (accountId) localStorage.setItem(`${FRIENDS_KEY}:${accountId}`, JSON.stringify([...new Set(ids)])); }
function friendRequests(accountId = currentAccount()?.id) {
  return accountId ? readJson(`${FRIEND_REQUESTS_KEY}:${accountId}`, []).filter((request) => request && request.toId === accountId && request.fromId && request.fromId !== accountId) : [];
}
function setFriendRequests(accountId, requests) { if (accountId) localStorage.setItem(`${FRIEND_REQUESTS_KEY}:${accountId}`, JSON.stringify(requests)); }
function pendingFriendRequest(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return false;
  return friendRequests(toId).some((request) => request.fromId === fromId && request.status === "pending");
}
function liveUntil(accountId) {
  const raw = Number(localStorage.getItem(`${LIVE_KEY}:${accountId}:until`) || 0);
  return Number.isFinite(raw) ? raw : 0;
}
function isLive(accountId) {
  if (!accountId || localStorage.getItem(`${LIVE_KEY}:${accountId}`) !== "true") return false;
  let until = liveUntil(accountId);
  // Give older LIVE flags a finite lifetime instead of leaving them active forever.
  if (!until) {
    until = Date.now() + 60 * 60 * 1000;
    localStorage.setItem(`${LIVE_KEY}:${accountId}:until`, String(until));
  }
  if (until && until <= Date.now()) {
    setLive(accountId, false);
    return false;
  }
  return true;
}
function setLive(accountId, value, durationMinutes = 60) {
  if (!accountId) return;
  if (!value) {
    localStorage.removeItem(`${LIVE_KEY}:${accountId}`);
    localStorage.removeItem(`${LIVE_KEY}:${accountId}:until`);
    return;
  }
  localStorage.setItem(`${LIVE_KEY}:${accountId}`, "true");
  localStorage.setItem(`${LIVE_KEY}:${accountId}:until`, String(Date.now() + Math.max(1, Number(durationMinutes) || 60) * 60 * 1000));
}
function homeCatchView() { return localStorage.getItem(HOME_CATCH_VIEW_KEY) === "grid" ? "grid" : "list"; }
function updateHomeCatchView(mode = homeCatchView()) {
  const home = $("#homeCatchList");
  if (home) home.classList.toggle("is-grid-view", mode === "grid");
  $$('[data-catch-view]').forEach((button) => {
    const active = button.dataset.catchView === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
function liveRemainingMinutes(accountId) {
  if (!isLive(accountId)) return 0;
  return Math.max(1, Math.ceil((liveUntil(accountId) - Date.now()) / 60000));
}
function renderLiveStatus(account) {
  const liveButton = $("#liveStatusButton");
  const durationSelect = $("#liveDurationSelect");
  if (!liveButton || !account) return;
  const active = isLive(account.id);
  const remaining = liveRemainingMinutes(account.id);
  liveButton.classList.toggle("is-live", active);
  liveButton.setAttribute("aria-pressed", String(active));
  $("#liveStatusLabel").textContent = active ? `LIVE · ${remaining} min kvar` : "Aktivera LIVE";
  if (durationSelect) durationSelect.disabled = active;
}
function createMemberCode() {
  const digits = String(Math.floor(10000 + Math.random() * 90000));
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  return `#${digits}-${letters}`;
}
function ensureMemberCode(account) {
  if (!account) return "";
  if (account.memberCode) return account.memberCode;
  const cacheKey = `bigplus_member_code:${account.id}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    account.memberCode = cached;
    return cached;
  }
  const code = createMemberCode();
  localStorage.setItem(cacheKey, code);
  account.memberCode = code;
  return code;
}

function friendTournamentId(firstId, secondId) {
  return "friend-tournament:" + [firstId, secondId].sort().join(":");
}

function ensureFriendTournament(friendId) {
  const account = currentAccount();
  const friend = accounts().find((item) => item.id === friendId) || (friendSearchResult?.id === friendId ? friendSearchResult : null);
  if (!account || !friend || account.id === friend.id) return null;
  const id = friendTournamentId(account.id, friend.id);
  if (competitions().some((item) => item.id === id)) return id;
  const tournament = {
    id,
    type: "friend",
    friendIds: [account.id, friend.id],
    name: "Vänturnering: " + (friend.name || "Fiskare"),
    description: "Största fisk per art",
    daysLeft: 365,
    createdBy: account.id,
    members: [account.id, friend.id],
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(COMPETITION_KEY, JSON.stringify([...competitions(), tournament]));
  return id;
}

function friendBestBySpecies(friendIds) {
  const result = new Map();
  catches().filter((item) => friendIds.includes(item.userId)).forEach((item) => {
    const measurement = item.measurement || item;
    const species = String(measurement.speciesName || measurement.species || "Annan art");
    const length = Number(measurement.lengthCm || 0);
    if (length > Number(result.get(species)?.length || 0)) result.set(species, { length, userId: item.userId });
  });
  return [...result.entries()].sort((a, b) => b[1].length - a[1].length);
}

function renderFriendTournaments() {
  const target = $("#friendTournamentList");
  const account = currentAccount();
  if (!target || !account) return;
  const friends = friendIds(account.id).map((id) => accounts().find((item) => item.id === id)).filter(Boolean);
  if (!friends.length) { target.innerHTML = ""; return; }
  const cards = friends.map((friend) => {
    const best = friendBestBySpecies([account.id, friend.id]).slice(0, 5);
    const rows = best.length ? best.map(([species, item]) => {
      const owner = accounts().find((entry) => entry.id === item.userId);
      return "<div><span>" + escapeHtml(species) + "</span><strong>" + item.length.toFixed(1) + " cm</strong><small>" + escapeHtml(owner?.name || "Fiskare") + "</small></div>";
    }).join("") : '<p class="friend-tournament-empty">Registrera fångster för att börja jämföra arter.</p>';
    return '<article class="friend-tournament-card"><div class="friend-tournament-heading"><div><span class="section-kicker">VÄNUTMANING</span><h3>' + escapeHtml(friend.name || "Fiskare") + '</h3><p>Största fisk per art</p></div><span class="friend-tournament-icon">★</span></div><div class="friend-tournament-results">' + rows + '</div></article>';
  }).join("");
  target.innerHTML = '<div class="friend-tournament-title"><div><h3>Vänturneringar</h3><p>Varje vän får en egen tävling där bästa resultatet per art följs.</p></div><span>⚡</span></div>' + cards;
}

function renderFriendsLegacy() {
  const listTarget = $("#friendList");
  const suggestionsTarget = $("#friendSuggestions");
  const account = currentAccount();
  if (!listTarget || !account) return;
  const ids = friendIds(account.id);
  const incomingRequests = friendRequests(account.id).filter((request) => request.status === "pending" && request.fromId !== account.id);
  const friends = ids.map((id) => accounts().find((item) => item.id === id)).filter(Boolean);
  friends.forEach((friend) => ensureFriendTournament(friend.id));
  const search = $("#friendSearchInput")?.value.trim().toLowerCase() || "";
  const candidates = accounts().filter((item) => item.id !== account.id && item.profileVisibility !== "private" && !ids.includes(item.id) && !pendingFriendRequest(account.id, item.id) && !pendingFriendRequest(item.id, account.id) && (!search || `${item.name} ${item.email} ${item.memberCode || ""}`.toLowerCase().includes(search))).slice(0, 5);
  if (suggestionsTarget) suggestionsTarget.innerHTML = search && candidates.length ? candidates.map((item) => `<button class="friend-suggestion" type="button" data-friend-id="${escapeHtml(item.id)}"><span class="competition-avatar">${escapeHtml((item.name || "F").slice(0, 1).toUpperCase())}</span><span>${escapeHtml(item.name || item.email)}</span><b>Lägg till</b></button>`).join("") : "";
  listTarget.innerHTML = friends.length ? friends.map((friend) => {
    const catchesForFriend = catches().filter((item) => item.userId === friend.id);
    const bigplus = catchesForFriend.filter(isBigplusCatch).length;
    const achievements = completedAchievementCount(catchesForFriend);
    const live = isLive(friend.id);
    return `<article class="friend-card"><span class="competition-avatar">${escapeHtml((friend.name || "F").slice(0, 1).toUpperCase())}</span><div class="friend-card-main"><strong>${escapeHtml(friend.name || "Fiskare")}${live ? '<span class="live-badge"><span class="live-dot"></span> LIVE</span>' : ""}</strong><small>${catchesForFriend.length} fångster · ${bigplus} Bigplus</small><span class="friend-progress"><i style="width:${Math.min(100, achievements * 20)}%"></i></span><small>${achievements} achievements klara</small></div></article>`;
  }).join("") : `<div class="empty-list"><strong>Inga vänner ännu</strong><span>Sök efter en användare ovan för att lägga till en vän.</span></div>`;
  if (incomingRequests.length) {
    const requestMarkup = incomingRequests.map((request) => {
      const sender = accounts().find((item) => item.id === request.fromId);
      if (!sender) return "";
      return `<article class="friend-request"><span class="competition-avatar">${escapeHtml((sender.name || "F").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(sender.name || "Fiskare")}</strong><small>Vill bli din vän</small></span><span class="friend-request-actions"><button class="secondary-button friend-accept-button" type="button" data-accept-friend-request="${escapeHtml(request.id)}">Acceptera</button><button class="text-button friend-deny-button" type="button" data-deny-friend-request="${escapeHtml(request.id)}">Neka</button></span></article>`;
    }).join("");
    listTarget.insertAdjacentHTML("afterbegin", `<div class="friend-request-list"><h3>Vänförfrågningar</h3>${requestMarkup}</div>`);
  }
  const outgoingRequests = accounts().filter((recipient) => recipient.id !== account.id).flatMap((recipient) => friendRequests(recipient.id)
    .filter((request) => request.fromId === account.id && request.status === "pending" && request.toId !== account.id)
    .map((request) => ({ ...request, recipient })));
  if (outgoingRequests.length) {
    const outgoingMarkup = outgoingRequests.map(({ recipient }) => `<article class="friend-request is-pending"><span class="competition-avatar">${escapeHtml((recipient.name || "F").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(recipient.name || "Fiskare")}</strong><small>VÃ¤ntar pÃ¥ svar</small></span></article>`).join("");
    listTarget.insertAdjacentHTML("afterbegin", `<div class="friend-request-list friend-request-outgoing"><h3>Skickade fÃ¶rfrÃ¥gningar</h3>${outgoingMarkup}</div>`);
  }
  // Normalize legacy mojibake from older friend labels before showing the list.
  listTarget.innerHTML = listTarget.innerHTML
    .replaceAll("L\u00c3\u00a4gg", "L\u00e4gg")
    .replaceAll("f\u00c3\u00a5ngster", "f\u00e5ngster")
    .replaceAll("\u00c2\u00b7", "\u00b7")
    .replaceAll("v\u00c3\u00a4nner", "v\u00e4nner")
    .replaceAll("S\u00c3\u00b6k", "S\u00f6k")
    .replaceAll("f\u00c3\u00b6r", "f\u00f6r")
    .replaceAll("V\u00c3\u00a4n", "V\u00e4n")
    .replaceAll("V\u00c3\u00a4nf\u00c3\u00b6rfr\u00c3\u00a5gningar", "V\u00e4nf\u00f6rfr\u00e5gningar")
    .replaceAll("V\u00c3\u0192\u00c2\u00a4ntar p\u00c3\u0192\u00c2\u00a5 svar", "V\u00e4ntar p\u00e5 svar")
    .replaceAll("Skickade f\u00c3\u0192\u00c2\u00b6rfr\u00c3\u0192\u00c2\u00a5gningar", "Skickade f\u00f6rfr\u00e5gningar")
    .replaceAll("Skickade f\u00c3\u00b6rfr\u00c3\u00a5gningar", "Skickade f\u00f6rfr\u00e5gningar");
  renderLiveStatus(account);
  const codeTarget = $("#profileMemberCode");
  if (codeTarget) codeTarget.textContent = ensureMemberCode(account);
  renderFriendTournaments();
}

function renderFriends() {
  const listTarget = $("#friendList");
  const suggestionsTarget = $("#friendSuggestions");
  const account = currentAccount();
  if (!listTarget || !account) return;
  const ids = friendIds(account.id);
  const friends = remoteFriends ? remoteFriends.friends : ids.map((id) => accounts().find((item) => item.id === id)).filter(Boolean);
  const incoming = remoteFriends ? remoteFriends.incoming : friendRequests(account.id).filter((request) => request.status === "pending");
  const outgoing = remoteFriends ? remoteFriends.outgoing : accounts().filter((recipient) => recipient.id !== account.id).flatMap((recipient) => friendRequests(recipient.id)
    .filter((request) => request.fromId === account.id && request.status === "pending")
    .map((request) => ({ ...request, to: recipient })));
  const search = $("#friendSearchInput")?.value.trim().toLowerCase() || "";
  const candidates = accounts().filter((item) => item.id !== account.id && item.profileVisibility !== "private" && !ids.includes(item.id) && !pendingFriendRequest(account.id, item.id) && !pendingFriendRequest(item.id, account.id) && (!search || `${item.name} ${item.email} ${item.memberCode || ""}`.toLowerCase().includes(search))).slice(0, 5);
  if (suggestionsTarget) {
    const result = friendSearchResult && friendSearchResult.id !== account.id ? friendSearchResult : null;
    if (result) {
      const isFriend = friends.some((item) => item.id === result.id);
      const pendingOutgoing = outgoing.some((request) => String(request.to?.id || request.toId) === String(result.id));
      const pendingIncoming = incoming.some((request) => String(request.from?.id || request.fromId) === String(result.id));
      const action = isFriend ? '<span class="friend-search-status">Vän</span>' : pendingOutgoing ? '<span class="friend-search-status">Väntar på svar</span>' : pendingIncoming ? '<span class="friend-search-status">Har skickat en förfrågan</span>' : `<button class="primary-button" type="button" data-friend-id="${escapeHtml(result.id)}">Lägg till vän</button>`;
      suggestionsTarget.innerHTML = `<article class="friend-suggestion friend-search-result"><span class="competition-avatar">${escapeHtml((result.name || "F").slice(0, 1).toUpperCase())}</span><span class="friend-search-result-copy"><strong>${escapeHtml(result.name || "Fiskare")}</strong><small>${escapeHtml(result.memberCode || "Medlem")}</small></span>${action}</article>`;
    } else {
      suggestionsTarget.innerHTML = search && candidates.length ? candidates.map((item) => `<button class="friend-suggestion" type="button" data-friend-id="${escapeHtml(item.id)}"><span class="competition-avatar">${escapeHtml((item.name || "F").slice(0, 1).toUpperCase())}</span><span>${escapeHtml(item.name || item.email)}</span><b>L\u00e4gg till</b></button>`).join("") : "";
    }
  }
  const friendMarkup = friends.length ? friends.map((friend) => {
    const ownCatches = catches().filter((item) => item.userId === friend.id);
    const bigplus = ownCatches.filter(isBigplusCatch).length;
    const achievements = completedAchievementCount(ownCatches);
    return `<article class="friend-card"><span class="competition-avatar">${escapeHtml((friend.name || "F").slice(0, 1).toUpperCase())}</span><div class="friend-card-main"><strong>${escapeHtml(friend.name || "Fiskare")}${isLive(friend.id) ? '<span class="live-badge"><span class="live-dot"></span> LIVE</span>' : ""}</strong><small>${ownCatches.length} f\u00e5ngster \u00b7 ${bigplus} Bigplus</small><span class="friend-progress"><i style="width:${Math.min(100, achievements * 20)}%"></i></span><small>${achievements} achievements klara</small></div><button class="text-button friend-remove-button" type="button" data-remove-friend="${escapeHtml(String(friend.id || friend._id))}">Ta bort</button></article>`;
  }).join("") : `<div class="empty-list"><strong>Inga v\u00e4nner \u00e4nnu</strong><span>S\u00f6k efter en anv\u00e4ndare ovan f\u00f6r att l\u00e4gga till en v\u00e4n.</span></div>`;
  const incomingMarkup = incoming.length ? `<div class="friend-request-list"><h3>V\u00e4nf\u00f6rfr\u00e5gningar</h3>${incoming.map((request) => {
    const sender = request.from || accounts().find((item) => item.id === request.fromId);
    if (!sender) return "";
    return `<article class="friend-request"><span class="competition-avatar">${escapeHtml((sender.name || "F").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(sender.name || "Fiskare")}</strong><small>Vill bli din v\u00e4n</small></span><span class="friend-request-actions"><button class="secondary-button friend-accept-button" type="button" data-accept-friend-request="${escapeHtml(request.id)}">Acceptera</button><button class="text-button friend-deny-button" type="button" data-deny-friend-request="${escapeHtml(request.id)}">Neka</button></span></article>`;
  }).join("")}</div>` : "";
  const outgoingMarkup = outgoing.length ? `<div class="friend-request-list friend-request-outgoing"><h3>Skickade f\u00f6rfr\u00e5gningar</h3>${outgoing.map((request) => {
    const recipient = request.to || request.recipient || accounts().find((item) => item.id === request.toId);
    if (!recipient) return "";
    return `<article class="friend-request is-pending"><span class="competition-avatar">${escapeHtml((recipient.name || "F").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(recipient.name || "Fiskare")}</strong><small>V\u00e4ntar p\u00e5 svar</small></span></article>`;
  }).join("")}</div>` : "";
  listTarget.innerHTML = incomingMarkup + outgoingMarkup + friendMarkup;
  renderLiveStatus(account);
  const codeTarget = $("#profileMemberCode");
  if (codeTarget) codeTarget.textContent = ensureMemberCode(account);
  renderFriendTournaments();
}

function sendFriendRequest(friendId) {
  const account = currentAccount();
  const friend = accounts().find((item) => item.id === friendId) || (friendSearchResult?.id === friendId ? friendSearchResult : null);
  if (!account || !friend || account.id === friend.id) return;
  if (remoteFriends) {
    fetch(`${AUTH_API_ROOT}/friends/requests`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: friend.id }) })
      .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Kunde inte skicka vänförfrågan."); await loadRemoteFriends(); })
      .catch((error) => window.alert(error.message));
    return;
  }
  const existing = friendRequests(friend.id).find((request) => request.fromId === account.id && request.status === "pending");
  if (!existing && !friendIds(account.id).includes(friend.id)) {
    setFriendRequests(friend.id, [...friendRequests(friend.id), { id: `${account.id}-${friend.id}-${Date.now()}`, fromId: account.id, toId: friend.id, status: "pending", createdAt: new Date().toISOString() }]);
  }
  $("#friendSearchInput").value = "";
  friendSearchResult = null;
  renderFriends();
}

function acceptFriendRequest(requestId) {
  const account = currentAccount();
  if (!account) return;
  if (remoteFriends) {
    fetch(`${AUTH_API_ROOT}/friends/requests/${encodeURIComponent(requestId)}/accept`, { method: "POST", credentials: "include" })
      .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Kunde inte acceptera vänförfrågan."); await loadRemoteFriends(); })
      .catch((error) => window.alert(error.message));
    return;
  }
  const requests = friendRequests(account.id);
  const request = requests.find((item) => item.id === requestId);
  if (!request || request.fromId === account.id || (request.toId && request.toId !== account.id)) return;
  setFriendRequests(account.id, requests.filter((item) => item.id !== requestId));
  setFriendIds(account.id, [...friendIds(account.id), request.fromId]);
  setFriendIds(request.fromId, [...friendIds(request.fromId), account.id]);
  ensureFriendTournament(request.fromId);
  renderFriends();
}

function denyFriendRequest(requestId) {
  const account = currentAccount();
  if (!account) return;
  if (remoteFriends) {
    fetch(`${AUTH_API_ROOT}/friends/requests/${encodeURIComponent(requestId)}/deny`, { method: "POST", credentials: "include" })
      .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Kunde inte neka vänförfrågan."); await loadRemoteFriends(); })
      .catch((error) => window.alert(error.message));
    return;
  }
  setFriendRequests(account.id, friendRequests(account.id).filter((item) => item.id !== requestId));
  renderFriends();
}

function removeFriend(friendId) {
  const account = currentAccount();
  const friend = (remoteFriends?.friends || []).find((item) => String(item.id || item._id) === String(friendId))
    || accounts().find((item) => String(item.id) === String(friendId));
  if (!account || !friend) return;
  const friendName = friend.name || "vännen";
  if (!window.confirm(`Är du säker på att du vill ta bort ${friendName} som vän?`)) return;
  if (remoteFriends) {
    fetch(`${AUTH_API_ROOT}/friends/${encodeURIComponent(friendId)}`, { method: "DELETE", credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Kunde inte ta bort vännen.");
        await loadRemoteFriends();
      })
      .catch((error) => window.alert(error.message));
    return;
  }
  setFriendIds(account.id, friendIds(account.id).filter((id) => String(id) !== String(friendId)));
  setFriendIds(friendId, friendIds(friendId).filter((id) => String(id) !== String(account.id)));
  renderFriends();
}
/*
    description: "Tävla om den längsta gäddan.",
    daysLeft: 5,
    createdAt: new Date().toISOString()
  }]));
}
*/
function ensureDemoAccount() {
  const list = accounts();
  if (list.some((account) => account.email === "admin")) return;
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify([...list, {
    id: "demo-admin",
    email: "admin",
    password: "Admin",
    name: "Admin Paso"
  }]));
}
function currentAccount() {
  const id = localStorage.getItem(SESSION_KEY) || localStorage.getItem("inlev_user");
  return accounts().find((account) => account.id === id) || null;
}

function userCatches() {
  return catches();
}

function mapSharingLocalKey(accountId = currentAccount()?.id) {
  return accountId ? `bigplus_map_sharing:${accountId}` : "";
}
function mapSharingLocal() {
  const key = mapSharingLocalKey();
  return key ? Boolean(readJson(key, false)) : false;
}
function mapCatchRecords() {
  return [...userCatches(), ...(Array.isArray(remoteSharedCatches) ? remoteSharedCatches : [])];
}
function catchRecordById(catchId) {
  return mapCatchRecords().find((entry) => String(entry.id || entry._id) === String(catchId));
}

function makeCatchDeleteCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 5 }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function removeLocalCatch(catchId) {
  const stored = readJson(CATCH_KEY, []);
  if (!Array.isArray(stored)) return;
  localStorage.setItem(CATCH_KEY, JSON.stringify(stored.filter((item) => String(item?.id || item?._id || "") !== String(catchId))));
}

function openDeleteCatchDialog(catchId) {
  const item = catchRecordById(catchId);
  const modal = $("#deleteCatchModal");
  const code = $("#deleteCatchCode");
  const input = $("#deleteCatchCodeInput");
  const message = $("#deleteCatchMessage");
  const confirm = $("#confirmDeleteCatch");
  if (!item || !modal || !code || !input || !confirm) return;
  pendingCatchDeleteId = String(item.id || item._id || catchId);
  pendingCatchDeleteCode = makeCatchDeleteCode();
  code.textContent = pendingCatchDeleteCode;
  input.value = "";
  input.setAttribute("aria-label", `Skriv koden ${pendingCatchDeleteCode}`);
  confirm.disabled = true;
  if (message) message.textContent = "";
  modal.hidden = false;
  window.setTimeout(() => input.focus(), 0);
}

function closeDeleteCatchDialog() {
  const modal = $("#deleteCatchModal");
  if (modal) modal.hidden = true;
  pendingCatchDeleteId = "";
  pendingCatchDeleteCode = "";
}

async function confirmDeleteCatch() {
  const input = $("#deleteCatchCodeInput");
  const message = $("#deleteCatchMessage");
  const value = String(input?.value || "").trim().toUpperCase();
  if (!pendingCatchDeleteId || value !== pendingCatchDeleteCode) {
    if (message) message.textContent = "Koden stämmer inte. Försök igen.";
    return;
  }

  const catchId = pendingCatchDeleteId;
  const confirm = $("#confirmDeleteCatch");
  if (confirm) { confirm.disabled = true; confirm.textContent = "Tar bort..."; }
  try {
    if (!String(catchId).startsWith("local-")) {
      const response = await fetch(`${AUTH_API_ROOT}/catches/${encodeURIComponent(catchId)}`, { method: "DELETE", credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort fångsten.");
    }
    removeLocalCatch(catchId);
    if (Array.isArray(remoteCatches)) remoteCatches = remoteCatches.filter((item) => String(item.id || item._id || "") !== String(catchId));
    closeDeleteCatchDialog();
    $("#catchDetail").hidden = true;
    renderCatchLists();
  } catch (error) {
    if (message) message.textContent = error.message || "Kunde inte ta bort fångsten.";
    if (confirm) { confirm.disabled = false; confirm.textContent = "Ta bort fångsten"; }
  }
}
function updateMapShareControls() {
  const button = $("#shareMapWithFriends");
  const status = $("#mapShareStatus");
  if (!button) return;
  button.textContent = "Dela karta med v\u00e4nner";
  button.classList.toggle("is-active", remoteMapZones.length > 0 || mapSharingEnabled);
  if (status) status.textContent = remoteMapZones.length ? `${remoteMapZones.length} delad${remoteMapZones.length === 1 ? " zon" : "e zoner"}.` : "V\u00e4lj f\u00e5ngster och v\u00e4nner i delningspanelen.";
}
async function loadSharedMapData() {
  if (!currentAccount()) { remoteSharedCatches = []; mapSharingEnabled = false; updateMapShareControls(); return; }
  try {
    const [shareResponse, mapResponse, zonesResponse] = await Promise.all([
      fetch(`${AUTH_API_ROOT}/sharing/map`, { credentials: "include" }),
      fetch(`${AUTH_API_ROOT}/sharing/maps`, { credentials: "include" }),
      fetch(`${AUTH_API_ROOT}/sharing/zones`, { credentials: "include" })
    ]);
    const share = await shareResponse.json().catch(() => ({}));
    const shared = await mapResponse.json().catch(() => []);
    const zones = await zonesResponse.json().catch(() => []);
    mapSharingEnabled = Boolean(share.enabled);
    remoteSharedCatches = Array.isArray(shared) ? shared : [];
    const localZones = readJson(`bigplus_map_zones:${currentAccount()?.id}`, []);
    const serverZones = Array.isArray(zones) ? zones : [];
    const serverIds = new Set(serverZones.map((zone) => String(zone.id || zone._id || "")));
    remoteMapZones = [...serverZones, ...(Array.isArray(localZones) ? localZones.filter((zone) => !serverIds.has(String(zone.id || zone._id || ""))) : [])];
  } catch {
    mapSharingEnabled = mapSharingLocal();
    remoteSharedCatches = [];
    remoteMapZones = readJson(`bigplus_map_zones:${currentAccount()?.id}`, []);
  }
  updateMapShareControls();
  renderCatchMap();
  renderMapSharePanel();
}
function renderMapSharePanel() {
  const panel = $("#mapSharePanel");
  const account = currentAccount();
  if (!panel || !account) return;
  const catchTarget = $("#mapShareCatchChoices");
  const friendTarget = $("#mapShareFriendChoices");
  const located = userCatches().filter((item) => Number.isFinite(Number(item.location?.latitude)) && Number.isFinite(Number(item.location?.longitude)));
  const friends = remoteFriends?.friends || acceptedFriendIds(account.id).map((id) => accounts().find((item) => item.id === id)).filter(Boolean);
  if (catchTarget) catchTarget.innerHTML = located.length ? located.map((item) => {
    const measurement = item.measurement || item;
    const species = measurement.speciesName || measurement.species || "Fångst";
    const length = Number(measurement.lengthCm || 0);
    return `<label class="map-share-choice"><input type="checkbox" name="catchIds" value="${escapeHtml(String(item.id || item._id))}"><span><strong>${escapeHtml(species)}</strong><small>${length ? `${length.toFixed(1)} cm` : "Mått saknas"}</small></span></label>`;
  }).join("") : `<p class="map-share-empty">Inga fångster med sparad plats ännu.</p>`;
  if (friendTarget) friendTarget.innerHTML = friends.length ? friends.map((friend) => `<label class="map-share-choice"><input type="checkbox" name="recipientIds" value="${escapeHtml(String(friend.id || friend._id))}"><span><strong>${escapeHtml(friend.name || "Fiskare")}</strong><small>${escapeHtml(friend.memberCode || "Accepterad vän")}</small></span></label>`).join("") : `<p class="map-share-empty">Lägg till och acceptera en vän först.</p>`;
  const zones = $("#mapShareZoneList");
  if (zones) zones.innerHTML = remoteMapZones.length ? `<h3>Dina delade zoner</h3>${remoteMapZones.map((zone) => `<div class="map-share-zone-row"><span><strong>${escapeHtml(zone.name)}</strong><small>${zone.catchIds.length} fångst${zone.catchIds.length === 1 ? "" : "er"} · ${zone.recipientIds.length} vän${zone.recipientIds.length === 1 ? "" : "ner"}</small></span><button type="button" class="text-button" data-delete-map-zone="${escapeHtml(zone.id)}">Ta bort</button></div>`).join("")}` : "";
}

async function createMapShareZone(event) {
  event.preventDefault();
  const account = currentAccount();
  const status = $("#mapShareFormStatus");
  if (!account) return openAuth("login");
  const form = event.currentTarget;
  const catchIds = [...form.querySelectorAll("input[name='catchIds']:checked")].map((input) => input.value);
  const recipientIds = [...form.querySelectorAll("input[name='recipientIds']:checked")].map((input) => input.value);
  if (!catchIds.length) { if (status) status.textContent = "Välj minst en fångst med plats."; return; }
  if (!recipientIds.length) { if (status) status.textContent = "Välj minst en accepterad vän."; return; }
  const body = { name: $("#mapShareZoneName")?.value || "Delad zon", catchIds, recipientIds };
  try {
    const response = await fetch(`${AUTH_API_ROOT}/sharing/zones`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Kunde inte dela zonen (HTTP ${response.status}).`);
    remoteMapZones = [data, ...remoteMapZones];
    localStorage.setItem(`bigplus_map_zones:${account.id}`, JSON.stringify(remoteMapZones));
    form.reset();
    renderMapSharePanel();
    updateMapShareControls();
    if (status) status.textContent = "Zonen delas nu med valda vänner.";
  } catch (error) {
    if (status) status.textContent = error.message || "Kunde inte dela zonen.";
  }
}

async function deleteMapShareZone(zoneId) {
  try {
    const response = await fetch(`${AUTH_API_ROOT}/sharing/zones/${encodeURIComponent(zoneId)}`, { method: "DELETE", credentials: "include" });
    if (!response.ok) throw new Error("Kunde inte ta bort zonen.");
    remoteMapZones = remoteMapZones.filter((zone) => String(zone.id) !== String(zoneId));
    renderMapSharePanel();
    updateMapShareControls();
  } catch (error) { window.alert(error.message); }
}

async function toggleMapSharing() {
  const account = currentAccount();
  if (!account) { openAuth("login"); return; }
  const recipientIds = acceptedFriendIds(account.id);
  if (!recipientIds.length) { window.alert("Lägg till minst en accepterad vän först."); return; }
  const enabled = !mapSharingEnabled;
  try {
    const response = await fetch(`${AUTH_API_ROOT}/sharing/map`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, recipientIds })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera kartdelning.");
    mapSharingEnabled = Boolean(data.enabled);
    localStorage.setItem(mapSharingLocalKey(account.id), JSON.stringify(mapSharingEnabled));
    updateMapShareControls();
  } catch (error) { window.alert(error.message || "Kunde inte uppdatera kartdelning."); }
}
function catchShareFriendRecords(accountId = currentAccount()?.id) {
  const remote = Array.isArray(remoteFriends?.friends) ? remoteFriends.friends : [];
  if (remote.length) return remote;
  return acceptedFriendIds(accountId)
    .map((id) => accounts().find((account) => String(account.id) === String(id)))
    .filter(Boolean);
}

function renderCatchShareFriends() {
  const target = $("#catchShareFriendChoices");
  if (!target) return;
  const account = currentAccount();
  const friends = account ? catchShareFriendRecords(account.id) : [];
  if (!friends.length) {
    target.innerHTML = '<p class="catch-share-empty">Lägg till och acceptera en vän först.</p>';
    return;
  }
  target.innerHTML = friends.map((friend) => {
    const id = String(friend.id || friend._id || "");
    const name = escapeHtml(friend.name || friend.displayName || friend.email || "Vän");
    return `<label class="catch-share-choice"><input type="checkbox" name="catchShareRecipientIds" value="${escapeHtml(id)}"><span><strong>${name}</strong></span></label>`;
  }).join("");
}

function ensureCatchShareModal() {
  let modal = $("#catchShareModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "catchShareModal";
  modal.className = "catch-share-modal";
  modal.hidden = true;
  modal.innerHTML = `<div class="catch-share-dialog" role="dialog" aria-modal="true" aria-labelledby="catchShareTitle"><button class="text-button catch-detail-close" id="closeCatchShareModal" type="button">Stäng</button><p class="catch-detail-label">DELA I APPEN</p><h2 id="catchShareTitle">Dela fångstplats</h2><p>Välj vilka accepterade vänner som får se koordinaterna i Bigplus.</p><form id="catchShareForm"><div id="catchShareFriendChoices" class="catch-share-friend-choices"></div><p id="catchShareFormStatus" role="status"></p><div class="catch-share-actions"><button class="secondary-button" id="cancelCatchShare" type="button">Avbryt</button><button class="primary-button" type="submit">Dela med valda vänner</button></div></form></div>`;
  document.body.appendChild(modal);
  $("#catchShareForm")?.addEventListener("submit", submitCatchCoordinateShare);
  $("#closeCatchShareModal")?.addEventListener("click", closeCatchShareModal);
  $("#cancelCatchShare")?.addEventListener("click", closeCatchShareModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeCatchShareModal();
  });
  return modal;
}

async function shareCatchCoordinates() {
  const account = currentAccount();
  if (!account) { openAuth("login"); return; }
  const detail = $("#catchDetail");
  const item = catchRecordById(detail?.dataset.catchId);
  const status = $("#catchShareStatus");
  const latitude = Number(item?.location?.latitude);
  const longitude = Number(item?.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) { if (status) status.textContent = "Fångsten saknar sparade koordinater."; return; }
  const modal = ensureCatchShareModal();
  modal.hidden = false;
  modal.dataset.catchId = String(item.id || item._id || detail?.dataset.catchId || "");
  const formStatus = $("#catchShareFormStatus");
  if (formStatus) formStatus.textContent = "Välj accepterade vänner som ska se platsen i appen.";
  renderCatchShareFriends();
  await loadRemoteFriends();
  renderCatchShareFriends();
}

function closeCatchShareModal() {
  const modal = $("#catchShareModal");
  if (modal) modal.hidden = true;
}

async function submitCatchCoordinateShare(event) {
  event.preventDefault();
  const account = currentAccount();
  const modal = $("#catchShareModal");
  const status = $("#catchShareFormStatus");
  const itemId = modal?.dataset.catchId;
  const recipientIds = [...document.querySelectorAll("input[name='catchShareRecipientIds']:checked")].map((input) => input.value);
  if (!account || !itemId) { if (status) status.textContent = "Logga in och öppna fångsten igen."; return; }
  if (!recipientIds.length) { if (status) status.textContent = "Välj minst en vän."; return; }
  try {
    const response = await fetch(`${AUTH_API_ROOT}/sharing/catches/${encodeURIComponent(itemId)}`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientIds })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kunde inte dela koordinaterna.");
    let sharedZone = {
      id: `local-catch-share-${Date.now()}`,
      name: "Delad fångst",
      catchIds: [String(itemId)],
      recipientIds: recipientIds.map(String),
      createdAt: new Date().toISOString()
    };
    try {
      const zoneResponse = await fetch(`${AUTH_API_ROOT}/sharing/zones`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Delad fångst", catchIds: [String(itemId)], recipientIds })
      });
      const zoneData = await zoneResponse.json().catch(() => ({}));
      if (zoneResponse.ok && zoneData && (zoneData.id || zoneData._id)) sharedZone = zoneData;
    } catch {
      // Keep a local entry visible even when the optional zone endpoint is unavailable.
    }
    remoteMapZones = [sharedZone, ...remoteMapZones];
    localStorage.setItem(`bigplus_map_zones:${account.id}`, JSON.stringify(remoteMapZones));
    renderMapSharePanel();
    updateMapShareControls();
    const count = Array.isArray(data.recipientIds) ? data.recipientIds.length : recipientIds.length;
    const catchStatus = $("#catchShareStatus");
    if (catchStatus) catchStatus.textContent = `Koordinaterna delas i appen med ${count} vän${count === 1 ? "" : "ner"}.`;
    closeCatchShareModal();
  } catch (error) {
    if (status) status.textContent = error.message || "Kunde inte dela koordinaterna.";
  }
}

async function loadRemoteCatches() {
  if (!currentAccount()) { remoteCatches = null; remoteSharedCatches = []; return; }
  try {
    const response = await fetch(`${AUTH_API_ROOT}/catches`, { credentials: "include" });
    if (!response.ok) {
      remoteCatches = [];
      renderCatchLists();
      loadSharedMapData();
      return;
    }
    remoteCatches = await response.json();
    renderCatchLists();
    loadSharedMapData();
  } catch {
    remoteCatches = [];
    renderCatchLists();
    loadSharedMapData();
  }
}

async function loadRemoteFriends() {
  if (!currentAccount()) { remoteFriends = null; renderFriends(); return; }
  try {
    const response = await fetch(`${AUTH_API_ROOT}/friends`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kunde inte h\u00e4mta v\u00e4nner.");
    remoteFriends = {
      friends: Array.isArray(data.friends) ? data.friends : [],
      incoming: Array.isArray(data.incoming) ? data.incoming : [],
      outgoing: Array.isArray(data.outgoing) ? data.outgoing : []
    };
  } catch {
    remoteFriends = { friends: [], incoming: [], outgoing: [] };
  }
  renderFriends();
  renderMapSharePanel();
  renderHomeFriendsOnline();
  if (remoteFriends.friends.length) {
    await fetch(`${AUTH_API_ROOT}/competitions/friends/ensure`, { method: "POST", credentials: "include" }).catch(() => {});
    await loadRemoteCompetitions();
  }
}

async function loadRemoteCompetitions() {
  if (!currentAccount()) { remoteCompetitions = null; return; }
  try {
    const response = await fetch(`${AUTH_API_ROOT}/competitions`, { credentials: "include" });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || "Kunde inte hämta tävlingar.");
    remoteCompetitions = Array.isArray(data) ? data : [];
  } catch {
    remoteCompetitions = [];
  }
  window.bigplusCompetitionIds = remoteCompetitions.flatMap((item) => isCompetitionMember(item) ? [item.id] : []);
  renderCompetitions();
}

async function loadGroups() {
  const target = $("#groupsList");
  if (!target || !currentAccount()) return;
  try {
    const response = await fetch(`${AUTH_API_ROOT}/groups`, { credentials: "include" });
    const groups = await response.json();
    if (!response.ok) throw new Error(groups.error || "Kunde inte hämta grupper.");
    target.innerHTML = groups.length ? groups.map((group) => `<article class="group-live-card"><div class="group-live-heading"><div><h3>${escapeHtml(group.name)}</h3><p>${group.memberCount} medlemmar</p></div><strong>Rankning</strong></div><ol class="group-ranking">${group.ranking.slice(0, 10).map((member) => `<li><span>${escapeHtml(member.name)}</span><strong>${member.bigplus} Bigplus</strong><small>${member.bestLengthCm ? `${member.bestLengthCm.toFixed(1)} cm` : "–"}</small></li>`).join("")}</ol></article>`).join("") : `<div class="empty-list"><strong>Inga grupper ännu</strong><span>Skapa din första grupp.</span></div>`;
  } catch (error) {
    target.innerHTML = `<div class="empty-list"><strong>${escapeHtml(error.message)}</strong><span>Starta om backend om gruppfunktionen inte svarar.</span></div>`;
  }
}

async function createGroup() {
  if (!currentAccount()) { openAuth("login"); return; }
  const name = window.prompt("Vad ska gruppen heta?");
  if (!name?.trim()) return;
  try {
    const response = await fetch(`${AUTH_API_ROOT}/groups`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      window.alert(data.error || "Kunde inte skapa gruppen.");
      if (response.status === 401) openAuth("login");
      return;
    }
    await loadGroups();
  } catch (error) {
    window.alert(error.message || "Kunde inte ansluta till Bigplus-servern.");
  }
}

function formatCompetitionDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("sv-SE") : "Okänt datum";
}

function competitionMetric(competition) {
  return ["length", "weight", "both"].includes(competition?.scoringMetric) ? competition.scoringMetric : "length";
}

function competitionMetricLabel(competition) {
  const metric = competitionMetric(competition);
  return metric === "weight" ? "Vikt" : metric === "both" ? "Längd + vikt" : "Längd";
}

function competitionSpeciesLabel(competition) {
  const species = Array.isArray(competition?.species) ? competition.species.filter(Boolean) : [];
  return species.length ? species.join(", ") : "Alla arter";
}

function competitionAllowsSpecies(competition, measurement) {
  const selected = Array.isArray(competition?.species) ? competition.species.filter(Boolean) : [];
  if (!selected.length) return true;
  const name = String(measurement?.speciesName || measurement?.species || "").toLowerCase();
  return selected.some((item) => String(item).toLowerCase() === name);
}

function competitionScore(item, competition) {
  const measurement = item?.measurement || item || {};
  if (!competitionAllowsSpecies(competition, measurement)) return 0;
  if (competitionMetric(competition) === "weight") {
    const value = measurement.weightKg?.mid ?? measurement.weightKg ?? measurement.weight ?? 0;
    return Number(value) || 0;
  }
  return Number(measurement.lengthCm ?? measurement.length ?? 0) || 0;
}

function formatCompetitionScore(value, competition) {
  return value > 0 ? `${value.toFixed(1)} ${competitionMetric(competition) === "weight" ? "kg" : "cm"}` : "--";
}

function formatCompetitionResult(item, competition) {
  const measurement = item?.measurement || item || {};
  if (competitionMetric(competition) !== "both") return formatCompetitionScore(competitionScore(item, competition), competition);
  const length = Number(measurement.lengthCm ?? measurement.length ?? 0);
  const weight = Number(measurement.weightKg?.mid ?? measurement.weightKg ?? measurement.weight ?? 0);
  const values = [];
  if (length > 0) values.push(`${length.toFixed(1)} cm`);
  if (weight > 0) values.push(`${weight.toFixed(1)} kg`);
  return values.length ? values.join(" · ") : "--";
}

function competitionCardMarkup(competition) {
  const days = Number(competition.daysLeft);
  // The detail panel is rendered only after a competition is opened.
  const ending = Number.isFinite(days) ? `Avslutas om ${days} dagar` : "Aktiv tävling";
  const joined = isCompetitionMember(competition);
  const owner = competition.createdBy && competition.createdBy === currentAccount()?.id;
  const homeOnly = arguments[1]?.home;
  const daysBadge = Number.isFinite(days) ? `<span class="competition-days-badge">${days} dagar</span>` : "";
  const participationAction = joined ? `<button class="secondary-button competition-leave-button" type="button" data-competition-action="leave" data-competition-id="${escapeHtml(competition.id)}">Lämna</button>` : `<button class="secondary-button competition-join-button" type="button" data-competition-action="join" data-competition-id="${escapeHtml(competition.id)}">Delta</button>`;
  const action = owner ? `${participationAction}<button class="secondary-button competition-delete-button" type="button" data-competition-action="delete" data-competition-id="${escapeHtml(competition.id)}">Ta bort</button>` : participationAction;
  const details = homeOnly
    ? `<small class="home-competition-species">${escapeHtml(competitionMetricLabel(competition))} · ${escapeHtml(competitionSpeciesLabel(competition))}</small>`
    : `<p>${escapeHtml(competition.description || "Mät och jämför dina fångster.")}</p><small>${ending} · Skapad ${formatCompetitionDate(competition.createdAt)}</small><small class="competition-rule-summary">${escapeHtml(competitionMetricLabel(competition))} · ${escapeHtml(competitionSpeciesLabel(competition))}</small>`;
  return `<article class="competition-card${homeOnly ? " competition-card-home" : ""}" data-competition-id="${escapeHtml(competition.id)}"${homeOnly ? ' role="button" tabindex="0"' : ""}><div class="competition-card-main"><span class="competition-emblem" aria-hidden="true">★</span><div><h3>${escapeHtml(competition.name)}${daysBadge}${owner ? '<span class="competition-title-star" aria-label="Skapad av dig">★</span>' : ""}</h3>${details}${owner ? '<span class="competition-owner-label">Din tävling</span>' : ""}</div></div>${homeOnly ? "" : `<div class="competition-card-actions">${action}</div>`}</article>`;
}

function competitionCard(competition, options) {
  return `<div class="competition-card-shell" data-competition-shell-id="${escapeHtml(competition.id)}">${competitionCardMarkup(competition, options)}</div>`;
}

function renderCompetitions() {
  const list = competitions().filter((item) => item && item.name);
  const details = $("#competitionDetails");
  const detailsSlot = $("#competitionDetailsSlot");
  const activeDetailsId = details && !details.hidden ? details.dataset.competitionId : "";
  if (details && detailsSlot && details.parentElement !== detailsSlot) detailsSlot.appendChild(details);
  const html = list.length ? list.map(competitionCard).join("") : `<div class="empty-list"><strong>Inga aktiva tävlingar</strong><span>Skapa den första tävlingen.</span></div>`;
  const target = $("#competitionsList");
  if (target) target.innerHTML = html;
  if (target) decorateCompetitionCards(target);
  if (activeDetailsId) renderCompetitionDetails(activeDetailsId);
  const home = $("#homeCompetitionList");
  if (home) {
    const joinedList = list.filter(isCompetitionMember);
    home.hidden = false;
    home.innerHTML = joinedList.length
      ? joinedList.slice(0, 3).map((item) => competitionCard(item, { home: true })).join("")
      : `<div class="empty-list"><strong>Du deltar inte i någon tävling</strong><span>Öppna Tävlingar för att hitta en utmaning.</span></div>`;
    decorateCompetitionCards(home);
  }
  renderHomeCompetitionRank();
  renderHomeTournament();
  renderHomeActivity();
  renderLeaderboard();
}

function renderHomeActivity(list = userCatches()) {
  const target = $("#homeActivityList");
  if (!target) return;
  const events = [];
  const account = currentAccount();
  const friendAccounts = account
    ? friendIds(account.id).map((id) => accounts().find((item) => item.id === id)).filter(Boolean)
    : [];
  friendAccounts.forEach((friend) => {
    const friendCatches = catches()
      .filter((item) => item.userId === friend.id)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const latestFriendCatch = friendCatches[0];
    if (!latestFriendCatch) return;
    const measurement = latestFriendCatch.measurement || latestFriendCatch;
    const friendName = friend.name || friend.email || "En vän";
    const species = measurement.speciesName || measurement.species || "Fångst";
    const length = Number(measurement.lengthCm || 0);
    events.push({
      icon: "◈",
      title: `${friendName} fångade något`,
      detail: `${species}${length > 0 ? ` · ${length.toFixed(1)} cm` : ""}`,
      date: latestFriendCatch.createdAt
    });
    const friendAchievements = completedAchievementCount(friendCatches);
    if (friendAchievements > 0) {
      events.push({
        icon: "✦",
        title: `${friendName} klarade ett achievement`,
        detail: `${friendAchievements} achievements klara`,
        date: latestFriendCatch.createdAt
      });
    }
  });
  const sorted = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const dateLabel = (value) => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? "Nyligen" : date.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  };
  const timeLabel = (value) => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? "" : `${dateLabel(value)} ${date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`;
  };
  const latestBigplus = sorted.find(isBigplusCatch);
  const latestCatch = sorted[0];
  if (latestBigplus) {
    const measurement = latestBigplus.measurement || latestBigplus;
    events.push({ icon: "🏆", title: "Du fick ett nytt Bigplus!", detail: `${measurement.speciesName || measurement.species || "Fångst"} ${Number(measurement.lengthCm || 0).toFixed(1)} cm`, date: latestBigplus.createdAt });
  }
  if (latestCatch && latestCatch !== latestBigplus) {
    const measurement = latestCatch.measurement || latestCatch;
    events.push({ icon: "◈", title: "Ny fångst registrerad", detail: `${measurement.speciesName || measurement.species || "Fångst"} · ${Number(measurement.lengthCm || 0).toFixed(1)} cm`, date: latestCatch.createdAt });
  }
  const joinedCompetition = competitions().find(isCompetitionMember);
  if (joinedCompetition) events.push({ icon: "♟", title: joinedCompetition.name, detail: "Du deltar i tävlingen", date: joinedCompetition.createdAt });
  const achievements = completedAchievementCount(list);
  if (achievements > 0) events.push({ icon: "✦", title: "Märke upplåst", detail: `${achievements} avklarade achievements`, date: latestBigplus?.createdAt || latestCatch?.createdAt });
  const html = events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 3).map((event) => `<div class="home-activity-row"><span class="home-activity-icon" aria-hidden="true">${event.icon}</span><span class="home-activity-copy"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail)}</small></span><time>${escapeHtml(timeLabel(event.date))}</time></div>`).join("");
  target.innerHTML = html || `<div class="empty-list"><strong>Ingen aktivitet ännu</strong><span>Mät din första fisk för att börja följa utvecklingen.</span></div>`;
}

function renderHomeFriendsOnline() {
  const target = $("#homeFriendsOnlineList");
  const account = currentAccount();
  if (!target || !account) return;
  const remote = Array.isArray(remoteFriends?.friends) ? remoteFriends.friends : [];
  const local = friendIds(account.id)
    .map((id) => accounts().find((item) => item.id === id))
    .filter(Boolean);
  const friends = [...remote, ...local]
    .filter((friend) => friend && String(friend.id || friend._id || "") !== String(account.id))
    .filter((friend, index, list) => list.findIndex((item) => String(item.id || item._id || "") === String(friend.id || friend._id || "")) === index)
    .sort((a, b) => Number(isLive(b.id || b._id)) - Number(isLive(a.id || a._id)) || String(a.name || "").localeCompare(String(b.name || ""), "sv"))
    .slice(0, 10);
  target.innerHTML = friends.length
    ? friends.map((friend) => {
      const live = isLive(friend.id || friend._id);
      return `<article class="home-friend-online-row"><span class="competition-avatar">${escapeHtml((friend.name || "F").slice(0, 1).toUpperCase())}${live ? '<i aria-hidden="true"></i>' : ""}</span><span><strong>${escapeHtml(friend.name || "Fiskare")}</strong><small>${live ? "Fiskar just nu" : "Inte LIVE just nu"}</small></span>${live ? "<b>LIVE</b>" : "<b aria-hidden=\"true\"></b>"}</article>`;
    }).join("")
    : `<div class="empty-list"><strong>Inga vänner ännu</strong><span>Lägg till vänner för att se deras LIVE-status här.</span></div>`;
}

function renderHomeTournament() {
  const target = $("#homeTournamentBlock");
  if (!target) return;
  const selected = competitions().find((item) => item.id === favoriteCompetition());
  if (!selected) {
    target.innerHTML = `<div class="empty-list"><strong>Välj en favoritturnering</strong><span>Markera en tävling med ☆ Favorit för att följa den här.</span></div>`;
    return;
  }
  const items = catches().filter((item) => Array.isArray(item.competitionIds) && item.competitionIds.includes(selected.id));
  const targetCm = Number(selected.targetCm || 5000);
  const daysLeft = Math.max(0, Number(selected.daysLeft || 0));
  const progress = items.reduce((sum, item) => sum + Number((item.measurement || item).lengthCm || 0), 0);
  const scores = new Map();
  items.forEach((item) => {
    const userId = item.userId || "guest";
    const score = scores.get(userId) || { userId, best: 0 };
    score.best = Math.max(score.best, Number((item.measurement || item).lengthCm || 0));
    scores.set(userId, score);
  });
  const leaders = [...scores.values()].sort((a, b) => b.best - a.best).slice(0, 3);
  target.innerHTML = `<article class="home-tournament-card"><div class="home-tournament-heading"><div><span class="tournament-live-dot">● Live</span><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.description || "Pågående utmaning")}</p></div><span class="home-tournament-star">★</span></div><div class="home-tournament-progress"><div><strong>Framsteg</strong><span>${progress.toFixed(0)} / ${targetCm.toFixed(0)} cm</span></div><span class="progress-track"><i style="width:${Math.min(100, (progress / targetCm) * 100)}%"></i></span><b>${Math.round(Math.min(100, (progress / targetCm) * 100))}%</b></div><div class="home-tournament-leaderboard"><strong>Topplista</strong>${leaders.length ? leaders.map((leader, index) => { const account = accounts().find((item) => item.id === leader.userId); return `<div><b>${index + 1}</b><span>${escapeHtml(account?.name || "Fiskare")}</span><strong>${leader.best.toFixed(1)} cm</strong></div>`; }).join("") : `<small>Topplistan fylls på när deltagarna registrerar fångster.</small>`}</div></article>`;
  target.querySelector(".tournament-live-dot")?.remove();
  const progressLabel = target.querySelector(".home-tournament-progress > div");
  if (progressLabel) progressLabel.insertAdjacentHTML("afterbegin", `<span class="tournament-days-left">${daysLeft} dagar kvar</span>`);
}

function decorateCompetitionCards(target) {
  target.querySelectorAll(".competition-card").forEach((card) => {
    const competition = competitions().find((item) => item.id === card.dataset.competitionId);
    const title = card.querySelector("h3");
    const days = Number(competition?.daysLeft);
    if (!title || !Number.isFinite(days) || title.querySelector(".competition-days-badge")) return;
    title.insertAdjacentHTML("beforeend", `<span class="competition-days-badge"><b>${days}</b> dagar</span>`);
  });
}

function renderHomeCompetitionRank() {
  const target = $("#homeCompetitionRank");
  if (!target) return;
  const account = currentAccount();
  const competition = competitions().find(isCompetitionMember);
  if (!account || !competition) {
    target.textContent = "Rank --";
    return;
  }
  const scores = new Map();
  catches().filter((item) => Array.isArray(item.competitionIds) && item.competitionIds.includes(competition.id)).forEach((item) => {
    const length = Number((item.measurement || item).lengthCm || 0);
    if (!length) return;
    const userId = item.userId || "guest";
    scores.set(userId, Math.max(scores.get(userId) || 0, length));
  });
  const ranking = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const index = ranking.findIndex(([userId]) => userId === account.id);
  target.textContent = index >= 0 ? `Rank ${index + 1}` : "Rank --";
}

function renderLeaderboard() {
  const target = $("#bigplusLeaderboard");
  if (!target) return;
  const account = currentAccount();
  const visibleIds = new Set([account?.id, ...acceptedFriendIds(account?.id)].filter(Boolean).map(String));
  const scores = new Map();
  catches().forEach((item) => {
    const measurement = item.measurement || item;
    if (measurement.status !== "BIGPLUS" && !measurement.isBigplus) return;
    const id = String(item.userId || "");
    if (!id || !visibleIds.has(id)) return;
    const score = scores.get(id) || { id, count: 0, bestLength: 0, bestWeight: 0 };
    score.count += 1;
    score.bestLength = Math.max(score.bestLength, Number(measurement.lengthCm || measurement.length || 0));
    score.bestWeight = Math.max(score.bestWeight, Number(measurement.weightKg || measurement.weight || 0));
    scores.set(id, score);
  });
  const renderBoard = (title, subtitle, valueKey, formatter) => {
    const rows = [...scores.values()]
      .filter((row) => row[valueKey] > 0)
      .sort((a, b) => b[valueKey] - a[valueKey] || b.count - a.count)
      .slice(0, 10);
    const body = rows.length ? rows.map((row, index) => {
      const profile = accounts().find((item) => String(item.id) === row.id);
      const name = profile?.name || (row.id === String(account?.id) ? account?.name : "Fiskare") || "Fiskare";
      return `<div class="leaderboard-row"><strong class="leaderboard-rank">${index + 1}</strong><span class="competition-avatar">${escapeHtml(name.slice(0, 1).toUpperCase())}</span><span class="leaderboard-name">${escapeHtml(name)}</span><strong>${formatter(row[valueKey])}</strong></div>`;
    }).join("") : '<div class="empty-list"><strong>Ingen registrerad än</strong><span>Lägg till en Bigplus-fångst för att synas här.</span></div>';
    return `<section class="leaderboard-board"><h3>${title}</h3><p>${subtitle}</p><div class="leaderboard-list">${body}</div></section>`;
  };
  target.innerHTML = [
    renderBoard("Vikt", "Bästa Bigplus-vikt", "bestWeight", (value) => `${value.toFixed(1)} kg`),
    renderBoard("Längd", "Längsta Bigplus-fisk", "bestLength", (value) => `${value.toFixed(1)} cm`),
    renderBoard("Antal", "Flest Bigplus-fångster", "count", (value) => `${value} st`)
  ].join("");
}

function renderCompetitionDetails(competitionId) {
  const competition = competitions().find((item) => item.id === competitionId);
  const details = $("#competitionDetails");
  const participants = $("#competitionParticipants");
  if (!competition || !details || !participants) return;
  const shell = [...document.querySelectorAll("#competitionsList .competition-card-shell")]
    .find((item) => item.dataset.competitionShellId === competitionId);
  const participantMap = new Map((competition.participants || []).map((participant) => [participant.userId, {
    ...participant,
    catches: (participant.catches || []).filter((item) => competitionAllowsSpecies(competition, item.measurement || item))
  }]));
  const members = [...participantMap.values()].sort((a, b) => Math.max(0, ...b.catches.map((item) => competitionScore(item, competition))) - Math.max(0, ...a.catches.map((item) => competitionScore(item, competition))));
  $("#competitionDetailsTitle").textContent = "Deltagare och bästa resultat";
  const days = Number(competition.daysLeft);
  $("#competitionDetailsMeta").textContent = Number.isFinite(days) ? `Avslutas om ${days} dagar` : "Aktiv tävling";
  participants.innerHTML = members.length ? members.map((member) => {
    const account = accounts().find((item) => item.id === member.userId) || { name: member.name, photo: member.photo };
    const best = member.catches.reduce((winner, item) => competitionScore(item, competition) > competitionScore(winner, competition) ? item : winner, null);
    return `<button class="competition-participant" type="button" data-participant-id="${escapeHtml(member.userId)}" data-competition-id="${escapeHtml(competitionId)}"><span class="competition-avatar">${escapeHtml((account?.name || "F").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(account?.name || "Fiskare")}</strong><small>${member.catches.length} fångster</small></span><b>${best ? `${Number(best.measurement.lengthCm || 0).toFixed(1)} cm` : "--"}</b></button>`;
  }).join("") : '<div class="empty-list"><strong>Inga deltagare ännu</strong><span>Registrera en fångst för att synas här.</span></div>';
  const participantsHeading = document.createElement("div");
  participantsHeading.className = "competition-participants-heading";
  const participantsHeadingText = document.createElement("strong");
  participantsHeadingText.textContent = "Deltagare och bästa resultat";
  participantsHeading.append(participantsHeadingText);
  participants.prepend(participantsHeading);
  const detailsHeader = document.createElement("div");
  detailsHeader.className = "competition-details-header";
  const detailsIntro = document.createElement("div");
  const detailsName = document.createElement("strong");
  detailsName.textContent = competition.name;
  const detailsRule = document.createElement("small");
  detailsRule.textContent = `Skapad ${formatCompetitionDate(competition.createdAt)} · ${competitionMetricLabel(competition)} · ${competitionSpeciesLabel(competition)}`;
  detailsIntro.append(detailsName, detailsRule);
  const favoriteButton = document.createElement("button");
  const isFavorite = favoriteCompetition() === competition.id;
  favoriteButton.type = "button";
  favoriteButton.className = `competition-favorite-button${isFavorite ? " is-favorite" : ""}`;
  favoriteButton.dataset.competitionAction = "favorite";
  favoriteButton.dataset.competitionId = competition.id;
  favoriteButton.setAttribute("aria-pressed", String(isFavorite));
  favoriteButton.textContent = isFavorite ? "★ Favorit" : "☆ Favorit";
  favoriteButton.setAttribute("aria-label", isFavorite ? "Ta bort favorit" : "Markera som favorit");
  favoriteButton.title = isFavorite ? "Ta bort favorit" : "Markera som favorit";
  favoriteButton.textContent = isFavorite ? "★" : "☆";
  participantsHeading.append(favoriteButton);
  participants.querySelectorAll(".competition-participant").forEach((button, index) => {
    const member = members[index];
    const bestValue = member ? Math.max(0, ...member.catches.map((item) => competitionScore(item, competition))) : 0;
    const score = button.querySelector("b");
    const best = member?.catches.reduce((winner, item) => competitionScore(item, competition) > competitionScore(winner, competition) ? item : winner, null);
    if (score) score.textContent = best ? formatCompetitionResult(best, competition) : formatCompetitionScore(bestValue, competition);
  });
  $("#competitionDetailsMeta").textContent = "";
  details.hidden = false;
  details.dataset.competitionId = competitionId;
  details.classList.add("competition-details-inline");
  document.querySelectorAll("#competitionsList .competition-card-shell").forEach((item) => item.classList.remove("has-open-details"));
  if (shell) {
    shell.appendChild(details);
    shell.classList.add("has-open-details");
  }
  $("#participantCatches").hidden = true;
}

function toggleCompetitionDetails(competitionId) {
  const details = $("#competitionDetails");
  if (details && !details.hidden && details.dataset.competitionId === competitionId) {
    details.hidden = true;
    details.removeAttribute("data-competition-id");
    document.querySelectorAll("#competitionsList .competition-card-shell").forEach((item) => {
      if (item.dataset.competitionShellId === competitionId) item.classList.remove("has-open-details");
    });
    return;
  }
  renderCompetitionDetails(competitionId);
}

function renderParticipantCatches(competitionId, participantId) {
  const target = $("#participantCatches");
  if (!target) return;
  const competition = competitions().find((item) => item.id === competitionId);
  const participant = competition?.participants?.find((item) => item.userId === participantId);
  const items = participant?.catches || [];
  target.innerHTML = `<h3>Uppladdade bilder</h3>${items.length ? `<div class="participant-photo-grid">${items.map((item) => item.photo ? `<figure><img src="${escapeHtml(item.photo)}" alt="Fångst"><figcaption>${Number(item.measurement?.lengthCm || 0).toFixed(1)} cm</figcaption></figure>` : "").join("")}</div>` : '<p class="hint">Inga bilder uppladdade ännu.</p>'}`;
  target.hidden = false;
}

function createCompetition() {
  const panel = $("#competitionCreatePanel");
  if (!panel) return;
  panel.hidden = false;
  $("#competitionNameInput")?.focus();
}

async function saveCompetition(event) {
  event.preventDefault();
  const name = $("#competitionNameInput").value.trim();
  if (!name) return;
  const description = $("#competitionDescriptionInput").value.trim() || "Tävla om den längsta fisken.";
  const daysLeft = Math.max(1, Math.min(365, Number($("#competitionDaysInput").value) || 7));
  if (!currentAccount()) { openAuth("login"); return; }
  const joinOnCreate = $("#competitionJoinOnCreate")?.checked !== false;
  const allSpecies = $("#competitionSpeciesAll")?.checked !== false;
  const selectedSpecies = [...new Set([...document.querySelectorAll('input[name="competitionSpecies"]:checked')].map((input) => input.value))];
  if (!allSpecies && !selectedSpecies.length) {
    window.alert("Välj minst en art eller Alla arter.");
    return;
  }
  const selectedMetric = document.querySelector('input[name="competitionMetric"]:checked')?.value;
  const scoringMetric = ["length", "weight", "both"].includes(selectedMetric) ? selectedMetric : "length";
  try {
    const response = await fetchCompetitionCreate(`${AUTH_API_ROOT}/competitions`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.slice(0, 80), description: description.slice(0, 140), daysLeft, species: allSpecies ? [] : selectedSpecies, scoringMetric, joinOnCreate }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { window.alert(data.error || `Kunde inte skapa tävlingen (HTTP ${response.status}).`); return; }
    event.currentTarget.reset();
    $("#competitionDaysInput").value = "7";
    $("#competitionCreatePanel").hidden = true;
    await loadRemoteCompetitions();
    window.alert("Tävlingen skapades.");
  } catch (error) {
    console.error("Kunde inte skapa tävlingen", error);
    window.alert(`Kunde inte nå Bigplus-servern på ${AUTH_API_ROOT}. Kontrollera att backend körs och att du är inloggad på nytt efter en server- eller adressändring.`);
  }
}

async function joinCompetition(competitionId) {
  if (!competitionId || !currentAccount()) { openAuth("login"); return; }
  const response = await fetch(`${AUTH_API_ROOT}/competitions/${encodeURIComponent(competitionId)}/join`, { method: "POST", credentials: "include" });
  if (!response.ok) { const data = await response.json().catch(() => ({})); window.alert(data.error || "Kunde inte delta i tävlingen."); return; }
  await loadRemoteCompetitions();
  renderCompetitionDetails(competitionId);
  window.alert("Du deltar nu i tävlingen.");
}

async function leaveCompetition(competitionId) {
  const response = await fetch(`${AUTH_API_ROOT}/competitions/${encodeURIComponent(competitionId)}/leave`, { method: "POST", credentials: "include" });
  if (!response.ok) { const data = await response.json().catch(() => ({})); window.alert(data.error || "Kunde inte lämna tävlingen."); return; }
  await loadRemoteCompetitions();
  window.alert("Du har lämnat tävlingen.");
}

async function deleteCompetition(competitionId) {
  const competition = competitions().find((item) => item.id === competitionId);
  if (!competition || competition.createdBy !== currentAccount()?.id) return;
  if (!window.confirm(`Ta bort tävlingen ${competition.name}?`)) return;
  const response = await fetch(`${AUTH_API_ROOT}/competitions/${encodeURIComponent(competitionId)}`, { method: "DELETE", credentials: "include" });
  if (!response.ok) { const data = await response.json().catch(() => ({})); window.alert(data.error || "Kunde inte ta bort tävlingen."); return; }
  $("#competitionDetails").hidden = true;
  await loadRemoteCompetitions();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function photoSource(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.url || value.secure_url || value.src || value.dataUrl || value.data || "";
}

function displayValue(value, fallback = "") {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return fallback;
  return value.name || value.label || value.title || fallback;
}

function achievementBadgeImage(name) {
  const normalized = String(name || "").trim().toLowerCase();
  const badges = [
    ["abborre", "abborre-badge-v1.png"], ["mört", "mort-badge-v1.png"], ["mÃ¶rt", "mort-badge-v1.png"],
    ["gädda", "gadda-badge-v1.png"], ["gÃ¤dda", "gadda-badge-v1.png"], ["braxen", "braxen-badge-v1.png"],
    ["gös", "gos-badge-v1.png"], ["gÃ¶s", "gos-badge-v1.png"], ["lake", "lake-badge-v1.png"],
    ["ruda", "ruda-badge-v1.png"], ["sutare", "sutare-badge-v1.png"], ["id", "id-badge-v1.png"],
    ["björkna", "bjorkna-badge-v1.png"], ["bjÃ¶rkna", "bjorkna-badge-v1.png"],
    ["första över 10 cm", "over10-badge-v1.png"], ["fÃ¶rsta Ã¶ver 10 cm", "over10-badge-v1.png"],
    ["första över 25 cm", "first25cm-badge-v1.png"], ["fÃ¶rsta Ã¶ver 25 cm", "first25cm-badge-v1.png"],
    ["din första bigplus", "bigplus-badge-v1.png"], ["din fÃ¶rsta bigplus", "bigplus-badge-v1.png"],
    ["5 arter fångade", "5art-badge-v1.png"], ["5 arter fÃ¥ngade", "5art-badge-v1.png"],
    ["första verifierade", "forstaveri-badge-v1.png"], ["fÃ¶rsta verifierade", "forstaveri-badge-v1.png"],
    ["lägg till en vän", "1van-badge-v1.png"], ["lÃ¤gg till en vÃ¤n", "1van-badge-v1.png"],
    ["gå med i en grupp", "joingroup-badge-v1.png"], ["gÃ¥ med i en grupp", "joingroup-badge-v1.png"],
    ["3 dagars streak", "3daystreak-badge-v1.png"], ["7 dagars streak", "7daystreak-badge-v1.png"]
  ];
  const badge = badges.find(([species]) => normalized === species);
  return badge ? `/bigplus/assets/achievements/${badge[1]}` : "";
}

function speciesReferenceImage(name) {
  const normalized = String(name || "").toLowerCase();
  const plain = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (plain.includes("abborre")) return "/bigplus/assets/species/abborre.jpg";
  if (plain.includes("gos")) return "/bigplus/assets/species/gos.jpg";
  if (plain.includes("gadda")) return "/bigplus/assets/species/gadda.jpg";
  if (plain.includes("oring")) return "/bigplus/assets/species/oring.jpg";
  if (normalized.includes("gös") || normalized.includes("gÃ¶s")) return "/bigplus/assets/species/gos.jpg";
  if (normalized.includes("gädda") || normalized.includes("gÃ¤dda")) return "/bigplus/assets/species/gadda.jpg";
  if (normalized.includes("oring") || normalized.includes("öring") || normalized.includes("Ã–ring")) return "/bigplus/assets/species/oring.jpg";
  return "/bigplus/assets/fangster-icon.png";
}

function formatCatch(item, compact = false, index = 0) {
  const measurement = item.measurement || item;
  const length = Number(measurement.lengthCm ?? measurement.length ?? 0);
  const weightValue = measurement.weightKg?.mid ?? measurement.weightKg ?? measurement.weight ?? 0;
  const weight = Number(weightValue);
  const species = measurement.speciesName || measurement.species || "Fångst";
  const created = item.createdAt ? new Date(item.createdAt) : null;
  const dayDiff = created ? Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(created).setHours(0, 0, 0, 0)) / 86400000) : null;
  const date = dayDiff === 0 ? "Idag" : dayDiff === 1 ? "Igår" : created ? created.toLocaleDateString("sv-SE") : "Nyligen";
  const photo = photoSource(item.photoDataUrl || item.photo);
  const catchKey = item.id || item._id || `catch-${index}`;
  if (compact) {
    const location = displayValue(measurement.location || item.location || item.water, "Plats ej angiven");
    return `<article class="catch-row home-catch-card" data-catch-id="${escapeHtml(catchKey)}" role="button" tabindex="0"><div class="catch-thumb">${photo ? `<img src="${photo}" alt="">` : "<span>FISK</span>"}</div><div class="catch-copy"><strong>${escapeHtml(species)}</strong><b>${length ? `${length.toFixed(1)} cm` : "-- cm"}</b><small>${escapeHtml(location)}</small></div><time class="catch-date">${escapeHtml(date)}</time></article>`;
  }
  return `<article class="catch-row${compact ? " home-catch-card" : ""}" data-catch-id="${escapeHtml(catchKey)}" role="button" tabindex="0"><div class="catch-thumb">${photo ? `<img src="${photo}" alt="">` : "<span>FISK</span>"}</div><div class="catch-copy"><strong>${escapeHtml(species)}</strong><small>${compact ? (length ? `${length.toFixed(1)} cm` : "-- cm") : date}</small></div><div class="catch-values"><strong>${length ? `${length.toFixed(1)} cm` : "-- cm"}</strong><small>${compact ? date : (weight ? `${weight.toFixed(1)} kg` : "-- kg")}</small></div></article>`;
}

function isBigplusCatch(item) {
  const measurement = item.measurement || item;
  return measurement.status === "BIGPLUS" || measurement.isBigplus;
}

function completedAchievementCount(list) {
  const bigplus = list.filter(isBigplusCatch).length;
  const species = new Set(list.map((item) => {
    const measurement = item.measurement || item;
    return measurement.speciesName || measurement.species;
  }).filter(Boolean)).size;
  const longPike = list.filter((item) => {
    const measurement = item.measurement || item;
    return Number(measurement.lengthCm || 0) >= 100 && String(measurement.speciesName || measurement.species || "").toLowerCase().includes("gädd");
  }).length;
  return [bigplus >= 1, species >= 5, longPike >= 3, list.length >= 50].filter(Boolean).length;
}

function recentWindowDelta(list, predicate) {
  const now = Date.now();
  const currentStart = now - (7 * 86400000);
  const previousStart = now - (14 * 86400000);
  const current = list.filter((item) => predicate(item) && new Date(item.createdAt || 0).getTime() >= currentStart).length;
  const previous = list.filter((item) => {
    const time = new Date(item.createdAt || 0).getTime();
    return predicate(item) && time >= previousStart && time < currentStart;
  }).length;
  return current > previous ? current - previous : 0;
}

function setStatChange(id, delta, suffix = "denna vecka") {
  const target = $(`#${id}`);
  if (!target) return;
  target.hidden = !delta;
  target.textContent = delta ? `↗ +${delta} ${suffix}` : "";
}

function calculateBigplusRank(catchList, accountId = currentAccount()?.id) {
  const scores = new Map();
  catchList.forEach((item) => {
    if (!isBigplusCatch(item)) return;
    const userId = item.userId || "guest";
    scores.set(userId, (scores.get(userId) || 0) + 1);
  });
  if (!accountId) return null;
  const ranking = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const position = ranking.findIndex(([userId]) => userId === accountId);
  return position >= 0 ? position + 1 : null;
}

function renderCatchDetail(catchId) {
  const list = mapCatchRecords();
  const item = catchRecordById(catchId) || list[Number(String(catchId).replace("catch-", ""))];
  const detail = $("#catchDetail");
  if (!item || !detail) return;
  detail.dataset.catchId = String(item.id || item._id || catchId);
  const measurement = item.measurement || item;
  const photo = photoSource(item.photoDataUrl || item.photo);
  const detailImage = $("#catchDetailImage");
  if (detailImage) detailImage.src = photo;
  const weight = measurement.weightKg?.mid ?? measurement.weightKg ?? measurement.weight;
  const isBigplus = measurement.status === "BIGPLUS" || measurement.isBigplus;
  const detailLength = $("#catchDetailLength");
  const detailWeight = $("#catchDetailWeight");
  const detailStatus = $("#catchDetailStatus");
  const detailStatusTitle = $("#catchDetailStatus strong");
  const detailStatusText = $("#catchDetailStatus small");
  const detailTitle = $("#catchDetailTitle");
  const detailMeta = $("#catchDetailMeta");
  if (detailLength) detailLength.textContent = `${Number(measurement.lengthCm || 0).toFixed(1)} cm`;
  if (detailWeight) detailWeight.textContent = weight ? `${Number(weight).toFixed(1)} kg` : "-- kg";
  if (detailStatus) detailStatus.classList.toggle("is-approved", Boolean(isBigplus));
  if (detailStatusTitle) detailStatusTitle.textContent = isBigplus ? "BIGPLUS" : "MÄTNING KLAR";
  if (detailStatusText) detailStatusText.textContent = isBigplus ? "Godkänd fångst" : "Resultat från din mätning";
  if (detailTitle) detailTitle.textContent = measurement.speciesName || measurement.species || "Fångst";
  if (detailMeta) detailMeta.textContent = `${Number(measurement.lengthCm || 0).toFixed(1)} cm · ${measurement.status || "Mätt"}`;
  const coordinateButton = $("#shareCatchCoordinates");
  const shareStatus = $("#catchShareStatus");
  const detailActions = detail.querySelector(".catch-detail-actions");
  let deleteDetailButton = $("#deleteCatchFromDetail");
  if (!deleteDetailButton && detailActions) {
    deleteDetailButton = document.createElement("button");
    deleteDetailButton.id = "deleteCatchFromDetail";
    deleteDetailButton.type = "button";
    deleteDetailButton.className = "danger-button compact-button";
    deleteDetailButton.textContent = "Ta bort fångsten";
    detailActions.insertBefore(deleteDetailButton, detailActions.querySelector("small"));
    deleteDetailButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDeleteCatchDialog(event.currentTarget.dataset.deleteCatch);
    });
  }
  const itemId = String(item.id || item._id || catchId);
  const canDelete = String(itemId).startsWith("local-") || String(item.userId || "") === String(currentAccount()?.id || "");
  if (deleteDetailButton) {
    deleteDetailButton.hidden = !canDelete;
    deleteDetailButton.dataset.deleteCatch = itemId;
  }
  const hasCoordinates = Number.isFinite(Number(item.location?.latitude)) && Number.isFinite(Number(item.location?.longitude));
  if (coordinateButton) coordinateButton.hidden = !hasCoordinates;
  if (shareStatus) shareStatus.textContent = hasCoordinates ? "" : "Ingen plats sparad för fångsten.";
  const allCatchList = $("#allCatchList");
  const row = allCatchList
    ? [...allCatchList.querySelectorAll(".catch-row[data-catch-id]")].find((entry) => String(entry.dataset.catchId) === String(catchId))
    : null;
  if (row) {
    allCatchList.querySelector(".catch-row.is-selected")?.classList.remove("is-selected");
    row.classList.add("is-selected");
    row.insertAdjacentElement("afterend", detail);
  }
  detail.classList.remove("is-open");
  detail.hidden = false;
  detail.classList.add("is-open");
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeCatchDetailPanel() {
  const detail = $("#catchDetail");
  if (!detail) return;
  detail.hidden = true;
  $("#allCatchList .catch-row.is-selected")?.classList.remove("is-selected");
  zoomOutAfterCatchDetail();
}

function renderLegacyHomeAchievements(list) {
  const target = $("#homeAchievementList");
  if (!target) return;
  const bigplus = list.filter((item) => (item.measurement || item).status === "BIGPLUS" || (item.measurement || item).isBigplus).length;
  const species = new Set(list.map((item) => (item.measurement || item).speciesName || (item.measurement || item).species).filter(Boolean)).size;
  const longPike = list.filter((item) => Number((item.measurement || item).lengthCm || 0) >= 100 && String((item.measurement || item).speciesName || (item.measurement || item).species || "").toLowerCase().includes("gädd")).length;
  const achievements = [
    ["Första Bigplus", bigplus, 1, "Få din första godkända fisk"],
    ["Artmästare", species, 5, "Få Bigplus på 5 olika arter"],
    ["Gäddjägaren", longPike, 3, "Få 3 gäddor över 100 cm"],
    ["Fotomästare", list.length, 50, "Ladda upp 50 fiskar"]
  ].sort((a, b) => (a[1] / a[2]) - (b[1] / b[2]));
  target.innerHTML = achievements.map(([name, value, goal, text]) => `<article class="home-achievement-item${value >= goal ? " is-complete" : ""}"><div><span class="achievement-badge" aria-hidden="true">${value >= goal ? "✓" : "★"}</span><strong>${name}</strong><small>${text}</small></div><span class="achievement-progress"><i style="width:${Math.min(100, (value / goal) * 100)}%"></i></span><b>${value} / ${goal}</b></article>`).join("");
}

function renderHomeAchievements(list) {
  const target = $("#homeAchievementList");
  if (!target) return;
  const bigplus = list.filter((item) => (item.measurement || item).status === "BIGPLUS" || (item.measurement || item).isBigplus).length;
  const species = new Set(list.map((item) => (item.measurement || item).speciesName || (item.measurement || item).species).filter(Boolean)).size;
  const longPike = list.filter((item) => Number((item.measurement || item).lengthCm || 0) >= 100 && String((item.measurement || item).speciesName || (item.measurement || item).species || "").toLowerCase().includes("g" + "\u00e4dd")).length;
  const achievements = [["F" + "\u00f6rsta Bigplus", bigplus, 1], ["Artm" + "\u00e4stare", species, 5], ["G" + "\u00e4ddj" + "\u00e4garen", longPike, 3], ["Fotom" + "\u00e4stare", list.length, 50]];
  const completed = achievements.filter(([, value, goal]) => value >= goal).length;
  const badgeIcons = ["★", "◈", "♛"];
  badgeIcons[0] = `<img src="${achievementBadgeImage("Din första Bigplus")}" alt="" loading="lazy">`;
  badgeIcons[1] = `<img src="${achievementBadgeImage("5 arter fångade")}" alt="" loading="lazy">`;
  badgeIcons[2] = `<img src="${achievementBadgeImage("Gädda")}" alt="" loading="lazy">`;
  const badges = badgeIcons.map((icon, index) => {
    const complete = index < completed;
    return `<span class="home-badge-icon home-badge-icon-${index + 1}${complete ? " is-complete" : ""}" aria-label="${complete ? "Upplåst badge" : "Ej upplåst badge"}">${icon}</span>`;
  }).join("");
  const progress = achievements.length ? Math.round((completed / achievements.length) * 100) : 0;
  target.innerHTML = `<div class="home-achievement-overview"><div class="home-badge-icon-row">${badges}</div><div class="home-achievement-progress-label"><strong>${completed} / ${achievements.length} märken upplåsta</strong><button class="text-button" type="button" data-go-view="achievements">Visa alla</button></div><div class="home-achievement-progress"><i style="width:${progress}%"></i></div></div>`;
}

function renderHomeNextBadgeLegacy(list) {
  const target = $("#homeNextBadge");
  if (!target) return;
  const achievementSection = document.querySelector(".home-achievement-section");
  const badgeSection = target.closest(".home-badge-section");
  if (achievementSection && badgeSection && achievementSection.nextElementSibling !== badgeSection) achievementSection.after(badgeSection);
  target.closest(".home-badge-section")?.querySelector(".section-heading h2")?.replaceChildren(document.createTextNode("P" + "\u00e5b" + "\u00f6rjade achievements"));
  const bigplus = list.filter((item) => (item.measurement || item).status === "BIGPLUS" || (item.measurement || item).isBigplus).length;
  const species = new Set(list.map((item) => (item.measurement || item).speciesName || (item.measurement || item).species).filter(Boolean)).size;
  const longPike = list.filter((item) => Number((item.measurement || item).lengthCm || 0) >= 100 && String((item.measurement || item).speciesName || (item.measurement || item).species || "").toLowerCase().includes("gÃ¤dd")).length;
  const definitions = [
    ["FÃ¶rsta Bigplus", bigplus, 1, "FÃ¥ din fÃ¶rsta godkÃ¤nda fisk"],
    ["ArtmÃ¤stare", species, 5, "FÃ¥ Bigplus pÃ¥ 5 olika arter"],
    ["GÃ¤ddjÃ¤garen", longPike, 3, "FÃ¥ 3 gÃ¤ddor Ã¶ver 100 cm"],
    ["FotomÃ¤stare", list.length, 50, "Ladda upp 50 fiskar"]
  ];
  const next = definitions.filter((item) => item[1] < item[2]).sort((a, b) => (a[1] / a[2]) - (b[1] / b[2]))[0] || definitions[0];
  const [name, value, goal, text] = next;
  const progress = Math.min(100, (value / goal) * 100);
  target.innerHTML = `<span class="home-badge-emblem" aria-hidden="true">★</span><div class="home-badge-copy"><strong>${name}</strong><small>${text}</small><div class="home-progress-row"><span class="home-progress-track"><span style="width:${progress}%"></span></span><strong>${value} / ${goal}</strong><small>${Math.round(progress)}%</small></div></div>`;
}

/* The home card focuses on the three achievements that already have progress. */
function renderHomeNextBadge(list) {
  const target = $("#homeNextBadge");
  if (!target) return;
  const achievementSection = document.querySelector(".home-achievement-section");
  const badgeSection = target.closest(".home-badge-section");
  if (achievementSection && badgeSection && achievementSection.nextElementSibling !== badgeSection) achievementSection.after(badgeSection);
  target.closest(".home-badge-section")?.querySelector(".section-heading h2")?.replaceChildren(document.createTextNode("P" + "\u00e5b" + "\u00f6rjade achievements"));
  const bigplus = list.filter((item) => (item.measurement || item).status === "BIGPLUS" || (item.measurement || item).isBigplus).length;
  const species = new Set(list.map((item) => (item.measurement || item).speciesName || (item.measurement || item).species).filter(Boolean)).size;
  const longPike = list.filter((item) => Number((item.measurement || item).lengthCm || 0) >= 100 && String((item.measurement || item).speciesName || (item.measurement || item).species || "").toLowerCase().includes("g" + "\u00e4dd")).length;
  const definitions = [
    ["F" + "\u00f6rsta Bigplus", bigplus, 1, "F" + "\u00e5 din f" + "\u00f6rsta godk" + "\u00e4nda fisk"],
    ["Artm" + "\u00e4stare", species, 5, "F" + "\u00e5 Bigplus p" + "\u00e5 5 olika arter"],
    ["G" + "\u00e4ddj" + "\u00e4garen", longPike, 3, "F" + "\u00e5 3 g" + "\u00e4ddor " + "\u00f6ver 100 cm"],
    ["Fotom" + "\u00e4stare", list.length, 50, "Ladda upp 50 fiskar"]
  ];
  const started = definitions.filter((item) => item[1] > 0 && item[1] < item[2]).sort((a, b) => (b[1] / b[2]) - (a[1] / a[2]));
  const notStarted = definitions.filter((item) => item[1] === 0 && item[1] < item[2]);
  const progressItems = [...started, ...notStarted].slice(0, 3);
  target.innerHTML = `<div class="home-progress-achievement-list">${progressItems.map(([name, value, goal, text]) => { const progress = Math.min(100, value / goal * 100); return `<article class="home-progress-achievement"><strong>${name}</strong><small>${text}</small><span class="achievement-progress"><i style="width:${progress}%"></i></span><small>${value} / ${goal} (${Math.round(progress)}%)</small></article>`; }).join("")}</div>`;
}

function renderLegacyPersonalBestLists(list = userCatches()) {
  const home = $("#homePersonalBestList");
  const editor = $("#profilePersonalBestList");
  if (!home && !editor) return;
  const manual = personalBests();
  const species = new Set(["Gädda", "Gös", "Abborre", "Öring"]);
  list.forEach((item) => {
    const measurement = item.measurement || item;
    const name = measurement.speciesName || measurement.species;
    if (name) species.add(name);
  });
  const rows = [...species].map((name) => {
    const catchesForSpecies = list.filter((item) => {
      const measurement = item.measurement || item;
      return String(measurement.speciesName || measurement.species || "").toLowerCase() === name.toLowerCase();
    });
    const capturedBest = Math.max(0, ...catchesForSpecies.filter(isBigplusCatch).map((item) => Number((item.measurement || item).lengthCm || 0)));
    const previousBest = Number(manual[name] || 0);
    const best = Math.max(capturedBest, previousBest);
    const bestCatch = catchesForSpecies.filter(isBigplusCatch).find((item) => Number((item.measurement || item).lengthCm || 0) === capturedBest);
    return { name, best, previousBest, photo: photoSource(bestCatch?.photoDataUrl || bestCatch?.photo) };
  }).filter((item) => item.best > 0 || editor).sort((a, b) => b.best - a.best || a.name.localeCompare(b.name, "sv"));
  const row = (item, editable) => `<div class="personal-best-row"><div class="personal-best-thumb">${item.photo ? `<img src="${item.photo}" alt="">` : "<span>FISK</span>"}</div><strong>${escapeHtml(item.name)}</strong><span class="personal-best-value">${item.best ? `${item.best.toFixed(1)} cm` : "-- cm"}</span>${editable ? `<label class="personal-best-input"><span class="sr-only">Tidigare personbästa för ${escapeHtml(item.name)}</span><input type="number" min="0" step="0.1" value="${item.previousBest || ""}" placeholder="Tidigare cm" data-personal-best-species="${escapeHtml(item.name)}"></label>` : ""}</div>`;
  if (home) home.innerHTML = rows.length ? rows.slice(0, 5).map((item) => row(item, false)).join("") : `<div class="empty-list"><strong>Inga personbästa ännu</strong><span>Mät en fisk eller lägg till tidigare resultat i profilen.</span></div>`;
  if (home) {
    const tableRows = rows.filter((item) => item.capturedBest > 0 || item.previousBest > 0).slice(0, 5);
    home.innerHTML = tableRows.length ? `<div class="personal-best-table"><div class="personal-best-table-head"><span>Art</span><span>Livstid</span><span>Bigplus</span></div>${tableRows.map((item) => `<div class="personal-best-table-row"><div class="personal-best-species"><div class="personal-best-thumb">${item.photo ? `<img src="${item.photo}" alt="">` : "<span>FISK</span>"}</div><strong>${escapeHtml(item.name)}</strong></div><strong>${item.previousBest ? `${item.previousBest.toFixed(1)} cm` : "-- cm"}</strong><strong>${item.capturedBest ? `${item.capturedBest.toFixed(1)} cm` : "-- cm"}</strong></div>`).join("")}</div>` : `<div class="empty-list"><strong>Inga personbästa ännu</strong><span>Mät en fisk eller lägg till tidigare resultat i profilen.</span></div>`;
  }
  if (editor) editor.innerHTML = rows.map((item) => row(item, true)).join("");
}

function renderLegacyTwoColumnPersonalBestLists(list = userCatches()) {
  const home = $("#homePersonalBestList");
  const editor = $("#profilePersonalBestList");
  if (!home && !editor) return;
  const manual = personalBests();
  const species = new Set(["G\u00e4dda", "G\u00f6s", "Abborre", "\u00d6ring"]);
  list.forEach((item) => {
    const measurement = item.measurement || item;
    const name = measurement.speciesName || measurement.species;
    if (name) species.add(name);
  });
  const rows = [...species].map((name) => {
    const catchesForSpecies = list.filter((item) => {
      const measurement = item.measurement || item;
      return String(measurement.speciesName || measurement.species || "").toLowerCase() === name.toLowerCase();
    });
    const capturedBest = Math.max(0, ...catchesForSpecies.filter(isBigplusCatch).map((item) => Number((item.measurement || item).lengthCm || 0)));
    const previousBest = Number(manual[name] || 0);
    const bestCatch = catchesForSpecies.filter(isBigplusCatch).find((item) => Number((item.measurement || item).lengthCm || 0) === capturedBest);
    return { name, capturedBest, previousBest, best: capturedBest, photo: photoSource(bestCatch?.photoDataUrl || bestCatch?.photo), speciesPhoto: speciesReferenceImage(name) };
  }).filter((item) => item.capturedBest > 0 || item.previousBest > 0 || editor).sort((a, b) => b.best - a.best || a.name.localeCompare(b.name, "sv"));
  const row = (item, editable) => `<div class="personal-best-row"><div class="personal-best-thumb">${item.photo ? `<img src="${item.photo}" alt="">` : "<span>FISK</span>"}</div><strong>${escapeHtml(item.name)}</strong><span class="personal-best-value">${item.best ? `${item.best.toFixed(1)} cm` : "-- cm"}</span>${editable ? `<label class="personal-best-input"><span class="sr-only">Tidigare personbästa för ${escapeHtml(item.name)}</span><input type="number" min="0" step="0.1" value="${item.previousBest || ""}" placeholder="Tidigare cm" data-personal-best-species="${escapeHtml(item.name)}"></label>` : ""}</div>`;
  if (home) {
    const appRows = rows.filter((item) => item.capturedBest > 0).slice(0, 5);
    const manualRows = rows.filter((item) => item.previousBest > 0).slice(0, 5);
    const listMarkup = (items, type) => items.length ? items.map((item) => row({ ...item, best: type === "app" ? item.capturedBest : item.previousBest }, false)).join("") : `<div class="empty-list"><span>${type === "app" ? "Mät en fisk i Bigplus för att bygga listan." : "Lägg till tidigare rekord under Profil."}</span></div>`;
    home.innerHTML = `<div class="personal-best-column"><h3>Personbästa Bigplus</h3><p>Uppmätt i Bigplus</p><div class="personal-best-column-list">${listMarkup(appRows, "app")}</div></div><div class="personal-best-column"><h3>Personbästa</h3><p>Dina manuella rekord</p><div class="personal-best-column-list">${listMarkup(manualRows, "manual")}</div></div>`;
  }
  if (editor) editor.innerHTML = rows.map((item) => row(item, true)).join("");
}

function renderPersonalBestLists(list = userCatches()) {
  const home = $("#homePersonalBestList");
  const editor = $("#profilePersonalBestList");
  if (!home && !editor) return;
  const manual = personalBests();
  const species = new Set([
    "Abborre", "Mört", "G" + "\u00e4dda", "Braxen", "G" + "\u00f6s", "Lake", "Ruda", "Sutare", "Id", "Björkna",
    "Nors", "Gärs", "Elritsa", "Stäm", "Lax", "Öring", "Röding", "Sik", "Siklöja", "Ål"
  ]);
  list.forEach((item) => {
    const measurement = item.measurement || item;
    const name = measurement.speciesName || measurement.species;
    if (name) species.add(name);
  });
  const rows = [...species].map((name) => {
    const catchesForSpecies = list.filter((item) => {
      const measurement = item.measurement || item;
      return String(measurement.speciesName || measurement.species || "").toLowerCase() === name.toLowerCase();
    });
    const capturedBest = Math.max(0, ...catchesForSpecies.filter(isBigplusCatch).map((item) => Number((item.measurement || item).lengthCm || 0)));
    const previousBest = Number(manual[name] || 0);
    const bestCatch = catchesForSpecies.filter(isBigplusCatch).find((item) => Number((item.measurement || item).lengthCm || 0) === capturedBest);
    return { name, capturedBest, previousBest, best: capturedBest, photo: photoSource(bestCatch?.photoDataUrl || bestCatch?.photo), speciesPhoto: speciesReferenceImage(name) };
  }).filter((item) => item.capturedBest > 0 || item.previousBest > 0 || editor).sort((a, b) => b.best - a.best || a.name.localeCompare(b.name, "sv"));
  if (home) {
    const tableRows = rows.filter((item) => item.capturedBest > 0 || item.previousBest > 0).slice(0, 5);
    home.innerHTML = tableRows.length ? `<div class="personal-best-table"><div class="personal-best-table-head"><span>Art</span><span>Livstid</span><span>Bigplus</span></div>${tableRows.map((item) => { const image = item.speciesPhoto || speciesReferenceImage(item.name) || item.photo; return `<div class="personal-best-table-row"><div class="personal-best-species"><div class="personal-best-thumb"><img src="${image}" alt="${escapeHtml(item.name)}"></div><span class="personal-best-species-name">${escapeHtml(item.name)}</span></div><strong>${item.previousBest ? `${item.previousBest.toFixed(1)} cm` : "-- cm"}</strong><strong>${item.capturedBest ? `${item.capturedBest.toFixed(1)} cm` : "-- cm"}</strong></div>`; }).join("")}</div>` : `<div class="empty-list"><strong>Inga personbästa ännu</strong><span>Mät en fisk eller lägg till tidigare resultat i profilen.</span></div>`;
  }
  if (editor) {
    editor.innerHTML = rows.map((item) => {
      const image = item.speciesPhoto || speciesReferenceImage(item.name) || item.photo;
      return `<article class="profile-personal-best-row">
        <div class="profile-personal-best-species">
          <div class="profile-personal-best-thumb">${image ? `<img src="${image}" alt="${escapeHtml(item.name)}">` : "<span>FISK</span>"}</div>
          <strong>${escapeHtml(item.name)}</strong>
        </div>
        <div class="profile-personal-best-bigplus"><span>Bigplus</span><strong>${item.capturedBest ? `${item.capturedBest.toFixed(1)} cm` : "-- cm"}</strong></div>
        <label class="profile-personal-best-input"><span>Livstid</span><input type="number" min="0" step="0.1" value="${item.previousBest || ""}" placeholder="-- cm" aria-label="Livstidsrekord för ${escapeHtml(item.name)}" data-personal-best-species="${escapeHtml(item.name)}"></label>
      </article>`;
    }).join("");
  }
}

let catchMapInstance = null;
let catchMapMarkers = null;

function renderCatchMap() {
  const panel = $("#catchMapPanel");
  const target = $("#catchMap");
  const empty = $("#catchMapEmpty");
  const catchesView = $("#catchesView");
  if (!panel || !target || panel.hidden || catchesView?.hidden) return;
  const located = mapCatchRecords().filter((item) => Number.isFinite(Number(item.location?.latitude)) && Number.isFinite(Number(item.location?.longitude)));
  if (!window.L) {
    if (empty) { empty.hidden = false; empty.textContent = "Kartan kunde inte laddas just nu."; }
    return;
  }
  if (!catchMapInstance) {
    catchMapInstance = window.L.map(target, { scrollWheelZoom: true });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap-bidragsgivare" }).addTo(catchMapInstance);
    catchMapMarkers = window.L.layerGroup().addTo(catchMapInstance);
  }
  catchMapMarkers.clearLayers();
  if (!located.length) {
    if (empty) empty.hidden = false;
    catchMapInstance.setView([62.0, 15.0], 4);
  } else {
    if (empty) empty.hidden = true;
    const bounds = [];
    located.forEach((item) => {
      const latitude = Number(item.location.latitude);
      const longitude = Number(item.location.longitude);
      bounds.push([latitude, longitude]);
      const measurement = item.measurement || item;
      const species = measurement.speciesName || measurement.species || "Fångst";
      const shared = String(item.ownerId || item.userId || "") !== String(currentAccount()?.id || "");
      const marker = window.L.circleMarker([latitude, longitude], { radius: 8, color: shared ? "#f97316" : "#2563eb", fillColor: shared ? "#fb923c" : "#3b82f6", fillOpacity: 0.9, weight: 3 });
      marker.bindTooltip(`${species} · ${shared ? `Delad av ${item.ownerName || "vän"}` : "Din fångst"}`);
      marker.addTo(catchMapMarkers);
    });
    catchMapMarkers.eachLayer((marker) => marker.unbindPopup?.());
    catchMapInstance.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  }
  window.setTimeout(() => catchMapInstance.invalidateSize(), 50);
}

function zoomToCatchOnMap(catchId) {
  const item = catchRecordById(catchId);
  const latitude = Number(item?.location?.latitude);
  const longitude = Number(item?.location?.longitude);
  if (!catchMapInstance || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  catchMapInstance.setView([latitude, longitude], Math.max(catchMapInstance.getZoom(), 15), { animate: true });
}

function zoomOutAfterCatchDetail() {
  if (!catchMapInstance) return;
  const targetZoom = Math.max(4, catchMapInstance.getZoom() - 6);
  catchMapInstance.setZoom(targetZoom, { animate: true });
}

function renderCatchLists() {
  const list = userCatches().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const html = list.length ? list.slice(0, 4).map((item, index) => formatCatch(item, true, index)).join("") : `<div class="empty-list"><strong>Inga sparade fångster ännu</strong><span>Mät din första fisk för att se den här.</span></div>`;
  const home = $("#homeCatchList");
  const all = $("#allCatchList");
  if (home) home.innerHTML = html;
  updateHomeCatchView();
  if (all) all.innerHTML = list.length ? list.map((item, index) => formatCatch(item, false, index)).join("") : html;
  renderCatchMap();
  renderPersonalBestLists(list);
  renderHomeActivity(list);
  renderHomeFriendsOnline();
  renderHomeAchievements(list);
  renderHomeNextBadge(list);
  renderHomeCompetitionRank();
  const bigplusCount = list.filter(isBigplusCatch).length;
  const competitionWins = list.filter((item) => (item.measurement || item).competitionWon).length;
  [$("#statCatches"), $("#profileCatchCount")].forEach((el) => { if (el) el.textContent = list.length; });
  [$("#statBigplus"), $("#profileBigplusCount")].forEach((el) => { if (el) el.textContent = bigplusCount; });
  if ($("#statAchievements")) $("#statAchievements").textContent = completedAchievementCount(list);
  const rank = calculateBigplusRank(catches());
  if ($("#statRank")) $("#statRank").textContent = rank ? `#${rank}` : "--";
  setStatChange("statCatchesChange", recentWindowDelta(list, () => true));
  setStatChange("statBigplusChange", recentWindowDelta(list, isBigplusCatch));
  setStatChange("statAchievementsChange", Math.max(0, completedAchievementCount(list) - completedAchievementCount(list.filter((item) => new Date(item.createdAt || 0).getTime() < Date.now() - (7 * 86400000)))));
  const rankCutoff = Date.now() - (7 * 86400000);
  const previousRank = calculateBigplusRank(catches().filter((item) => new Date(item.createdAt || 0).getTime() < rankCutoff));
  setStatChange("statRankChange", rank && previousRank && previousRank > rank ? previousRank - rank : 0, "platser denna vecka");
  if ($("#competitionWins")) $("#competitionWins").textContent = competitionWins;
  if ($("#profileCompetitionCount")) $("#profileCompetitionCount").textContent = competitionWins;
}

function renderAchievementPage(list = userCatches()) {
  const target = $("#achievementGrid");
  if (!target) return;
  const bigplus = list.filter(isBigplusCatch);
  const hasSpecies = (name) => bigplus.some((item) => String((item.measurement || item).speciesName || (item.measurement || item).species || "").toLowerCase() === name.toLowerCase());
  const species = ["Abborre", "Mört", "Gädda", "Braxen", "Gös", "Lake", "Ruda", "Sutare", "Id", "Björkna", "Nors", "Gärs", "Elritsa", "Stäm", "Lax", "Öring", "Röding", "Sik", "Siklöja", "Ål"];
  const points = [10, 10, 25, 15, 40, 50, 25, 35, 30, 15, 20, 15, 20, 15, 80, 70, 80, 40, 35, 100];
  const badges = species.map((name, index) => ({ name, text: `Få en Bigplus på ${name}`, value: hasSpecies(name) ? 1 : 0, goal: 1, points: points[index], icon: "◈" }));
  const over = (cm) => list.filter((item) => Number((item.measurement || item).lengthCm || 0) >= cm).length;
  const captureDays = [...new Set(list.map((item) => {
    const timestamp = new Date(item.createdAt || (item.measurement || item).createdAt || 0).getTime();
    return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
  }).filter(Boolean))].sort().reverse();
  let streak = 0;
  for (let index = 0; index < captureDays.length; index += 1) {
    const current = new Date(`${captureDays[index]}T00:00:00`);
    const previous = captureDays[index + 1] ? new Date(`${captureDays[index + 1]}T00:00:00`) : null;
    if (index === 0 || (previous && Math.round((current - previous) / 86400000) === 1)) streak += 1;
    else break;
  }
  badges.push(
    { name: "3 dagars streak", text: "Registrera en fangst tre dagar i rad", value: Math.min(streak, 3), goal: 3, points: 20, icon: "*" },
    { name: "7 dagars streak", text: "Registrera en fangst sju dagar i rad", value: Math.min(streak, 7), goal: 7, points: 40, icon: "*" },
    { name: "Första fisken", text: "Registrera din första fångst", value: Math.min(list.length, 1), goal: 1, points: 10, icon: "◈" },
    { name: "Första över 10 cm", text: "Mät en fisk över 10 cm", value: Math.min(over(10), 1), goal: 1, points: 10, icon: "▱" },
    { name: "Första över 25 cm", text: "Mät en fisk över 25 cm", value: Math.min(over(25), 1), goal: 1, points: 15, icon: "▱" },
    { name: "Första verifierade", text: "Registrera en godkänd fångst", value: Math.min(bigplus.length, 1), goal: 1, points: 20, icon: "✓" },
    { name: "Din första Bigplus", text: "Få din första Bigplus", value: Math.min(bigplus.length, 1), goal: 1, points: 40, icon: "+" },
    { name: "5 arter fångade", text: "Få Bigplus på 5 olika arter", value: new Set(bigplus.map((item) => (item.measurement || item).speciesName || (item.measurement || item).species).filter(Boolean)).size, goal: 5, points: 30, icon: "◈" },
    { name: "10 arter fångade", text: "Få Bigplus på 10 olika arter", value: new Set(bigplus.map((item) => (item.measurement || item).speciesName || (item.measurement || item).species).filter(Boolean)).size, goal: 10, points: 60, icon: "◈" },
    { name: "50 fångster", text: "Registrera 50 fångster", value: list.length, goal: 50, points: 80, icon: "▣" },
    { name: "100 fångster", text: "Registrera 100 fångster", value: list.length, goal: 100, points: 150, icon: "100" },
    { name: "Lägg till en vän", text: "Bli vän med en annan fiskare", value: Math.min(friendIds().length, 1), goal: 1, points: 10, icon: "+" },
    { name: "Gå med i en grupp", text: "Delta i en tävling", value: Math.min(memberships().length, 1), goal: 1, points: 15, icon: "♟" },
    { name: "Vinn en utmaning", text: "Vinn en tävling", value: list.filter((item) => (item.measurement || item).competitionWon).length, goal: 1, points: 100, icon: "♜" },
    { name: "100-klubben", text: "Få en Bigplus över 100 cm", value: bigplus.filter((item) => Number((item.measurement || item).lengthCm || 0) >= 100).length, goal: 1, points: 120, icon: "100" }
  );
  badges.forEach((item) => {
    const image = achievementBadgeImage(item.name);
    if (image) item.icon = `<img src="${image}" alt="${escapeHtml(item.name)} badge" loading="lazy">`;
  });
  const completed = badges.filter((item) => item.value >= item.goal).length;
  const rare = badges.filter((item) => item.value >= item.goal && item.points >= 50).length;
  $("#achievementCount")?.replaceChildren(document.createTextNode(String(completed)));
  $("#achievementRareCount")?.replaceChildren(document.createTextNode(String(rare)));
  $("#achievementGoalCount")?.replaceChildren(document.createTextNode(String(completed)));
  target.innerHTML = badges.map((item) => { const done = item.value >= item.goal; const progress = Math.min(100, item.value / item.goal * 100); return `<article class="achievement-card${done ? " is-complete" : ""}"><div class="achievement-badge ${done ? "fish-badge" : "target-badge"}">${item.icon}</div><h2>${escapeHtml(item.name.toUpperCase())}</h2><p>${escapeHtml(item.text)}<br><strong>${Math.min(item.value, item.goal)} / ${item.goal} · ${item.points} p</strong></p><span class="achievement-card-progress"><i style="width:${progress}%"></i></span></article>`; }).join("");
}

function renderAccount() {
  const account = currentAccount();
  const name = account?.name || "Logga in";
  const initial = name.trim().charAt(0).toUpperCase() || "B";
  const button = $("#accountButton");
  if (button) button.textContent = account ? name : "Logga in";
  [$("#homeProfileName"), $("#profileName"), $("#profileHeading")].forEach((el) => { if (el) el.textContent = name; });
  if ($("#homeGreeting")) $("#homeGreeting").textContent = "Hej!";
  if ($("#homeProfileSubtitle")) $("#homeProfileSubtitle").textContent = account ? "F\u00f6lj dina f\u00e5ngster och kl\u00e4ttra i Bigplus." : "Logga in f\u00f6r att se din profil och dina f\u00e5ngster.";
  if ($("#profileEmail")) $("#profileEmail").textContent = account?.email || "Logga in för att få ett eget konto.";
  if ($("#homeProfileLocation")) $("#homeProfileLocation").textContent = account ? account.email : "Logga in för att spara dina fångster.";
  if ($("#profileAccountHint")) $("#profileAccountHint").textContent = account ? "Dina fångster hör ihop med ditt Bigplus-konto." : "Dina fångster sparas lokalt på den här enheten.";
  const avatarText = account?.name === "Admin Paso" ? "AP" : initial;
  [$("#homeAvatar"), $("#mobileAccountButton"), $("#desktopAccountButton"), $("#profileAvatar")].forEach((el) => {
    if (!el) return;
    el.textContent = account?.photo ? "" : avatarText;
    el.classList.toggle("has-profile-photo", Boolean(account?.photo));
    el.style.setProperty("background-image", account?.photo ? `url("${account.photo}")` : "none", "important");
    el.style.setProperty("background-size", account?.photo ? "cover" : "", "important");
    el.style.setProperty("background-position", account?.photo ? "center" : "", "important");
    el.style.setProperty("background-repeat", "no-repeat", "important");
  });
  if ($("#profileAuthButton")) $("#profileAuthButton").textContent = account ? "Redigera konto" : "Logga in";
  if ($("#logoutButton")) $("#logoutButton").hidden = !account;
}

function openProfileSettings() {
  const account = currentAccount();
  if (!account) { openAuth("login"); return; }
  $("#profileNameInput").value = account.name || "";
  $("#profileUnitInput").value = localStorage.getItem("bigplus_unit") === "inch" ? "inch" : "cm";
  $("#profileVisibilityInput").checked = account.profileVisibility !== "private";
  pendingProfilePhoto = account.photo || "";
  const photoInput = $("#profilePhotoInput");
  if (photoInput) { photoInput.value = ""; photoInput.dataset.photo = pendingProfilePhoto; }
  $("#profileSettingsMessage").textContent = "";
  updateSettingsPreview(account.photo || "", account.name || "");
  $("#profileSettingsModal").hidden = false;
}

function updateSettingsPreview(photo, name) {
  const preview = $("#settingsPhotoPreview");
  if (!preview) return;
  preview.textContent = photo ? "" : (name.trim().slice(0, 2).toUpperCase() || "AP");
  preview.style.backgroundImage = photo ? `url("${photo}")` : "";
  preview.style.backgroundSize = photo ? "cover" : "";
  preview.style.backgroundPosition = photo ? "center" : "";
}

async function saveProfile(event) {
  event.preventDefault();
  const account = currentAccount();
  if (!account) return;
  const list = accounts();
  const name = $("#profileNameInput").value.trim();
  const photo = pendingProfilePhoto || $("#profilePhotoInput").dataset.photo || account.photo || "";
  const profileVisibility = $("#profileVisibilityInput").checked ? "public" : "private";
  localStorage.setItem("bigplus_unit", $("#profileUnitInput").value === "inch" ? "inch" : "cm");
  const updated = list.map((item) => item.id === account.id ? { ...item, name, photo, profileVisibility } : item);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(updated));
  let savedRemotely = false;
  try {
    const response = await fetch(`${AUTH_API_ROOT}/auth/profile`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, photo, profileVisibility })
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.user) {
        const remoteUpdated = accounts().map((item) => item.id === account.id ? data.user : item);
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify(remoteUpdated));
      }
      savedRemotely = true;
    }
  } catch {
    savedRemotely = false;
  }
  const message = $("#profileSettingsMessage");
  if (message) message.textContent = savedRemotely ? "Profilen är sparad." : "Profilen är sparad på den här enheten.";
  $("#profileSettingsModal").hidden = true;
  renderAccount();
  pendingProfilePhoto = photo;
  window.dispatchEvent(new CustomEvent("bigplus:settings-changed"));
}

function closeProfileMenu() {
  const menu = $("#profileMenu");
  if (menu) menu.hidden = true;
}

function toggleProfileMenu() {
  const account = currentAccount();
  if (!account) { openAuth("login"); return; }
  const menu = $("#profileMenu");
  if (menu) menu.hidden = !menu.hidden;
}

const JOURNAL_TRIPS_KEY = "bigplus_fishing_trips";

function journalTrips() {
  try {
    const parsed = JSON.parse(localStorage.getItem(JOURNAL_TRIPS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJournalTrips(trips) {
  localStorage.setItem(JOURNAL_TRIPS_KEY, JSON.stringify(trips));
}

function formatJournalDate(value) {
  if (!value) return "Datum saknas";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
}

function renderJournalTrip(trip) {
  const details = [trip.location, trip.species].filter(Boolean).map((value) => escapeHtml(String(value))).join(" · ");
  const meta = [trip.bait || "Bete ej valt", trip.weather || "V\u00e4der ej ifyllt"].map((value) => `<span>${escapeHtml(String(value))}</span>`).join("");
  return `<article class="journal-trip-card"><div class="journal-trip-date"><strong>${escapeHtml(formatJournalDate(trip.date))}</strong><span>${escapeHtml(trip.time || "Flexibel tid")}</span></div><div class="journal-trip-body"><h3>${escapeHtml(String(trip.title || "Fisketur"))}</h3><p>${details || "Ingen plats eller m\u00e5lart vald \u00e4nnu."}</p><div class="journal-trip-meta">${meta}</div>${trip.notes ? `<p class="journal-trip-notes">${escapeHtml(String(trip.notes))}</p>` : ""}</div></article>`;
}

function renderJournal() {
  const upcomingTarget = $("#journalUpcomingList");
  const pastTarget = $("#journalPastList");
  if (!upcomingTarget || !pastTarget) return;
  const today = new Date().toISOString().slice(0, 10);
  const trips = journalTrips().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const upcoming = trips.filter((trip) => !trip.date || trip.date >= today);
  const past = trips.filter((trip) => trip.date && trip.date < today).reverse();
  upcomingTarget.innerHTML = upcoming.length ? upcoming.map(renderJournalTrip).join("") : `<div class="empty-list"><strong>Inga planerade turer</strong><span>Planera n\u00e4sta tur med v\u00e4der, vind och bete.</span></div>`;
  pastTarget.innerHTML = past.length ? past.map(renderJournalTrip).join("") : `<div class="empty-list"><strong>Din fiskeloggbok b\u00f6rjar h\u00e4r</strong><span>Avslutade turer kan fyllas p\u00e5 med anteckningar senare.</span></div>`;
}

function saveJournalTrip(event) {
  event.preventDefault();
  const trip = {
    id: `journal-${Date.now()}`,
    title: $("#journalTripTitle")?.value.trim() || "Fisketur",
    date: $("#journalTripDate")?.value || "",
    time: $("#journalTripTime")?.value || "",
    location: $("#journalTripLocation")?.value.trim() || "",
    species: $("#journalTripSpecies")?.value.trim() || "",
    bait: $("#journalTripBait")?.value.trim() || "",
    weather: $("#journalTripWeather")?.value.trim() || "",
    notes: $("#journalTripNotes")?.value.trim() || "",
    createdAt: new Date().toISOString(),
  };
  saveJournalTrips([...journalTrips(), trip]);
  event.currentTarget.reset();
  $("#journalPlanner").hidden = true;
  const status = $("#journalFormStatus");
  if (status) status.textContent = "Fisketuren \u00e4r sparad.";
  renderJournal();
}

function showView(view) {
  if (!currentAccount()) {
    document.body.classList.add("auth-required");
    openAuth("login");
    return;
  }
  document.body.classList.remove("auth-required");
  const authModal = $("#authModal");
  if (authModal) authModal.hidden = true;
  document.body.classList.toggle("measure-active", view === "measure");
  $$('[data-app-view]').forEach((section) => { section.hidden = section.dataset.appView !== view; });
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const measure = $(".workspace");
  if (measure) measure.hidden = view !== "measure";
  if (view === "home" || view === "catches" || view === "profile" || view === "competitions" || view === "achievements") renderCatchLists();
  if (view === "achievements") renderAchievementPage(userCatches());
  if (view === "home" || view === "competitions") renderCompetitions();
  if (view === "journal") renderJournal();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  authBootstrapActive = false;
  const form = event.currentTarget;
  const mode = form.dataset.mode || "login";
  const email = $("#authEmail").value.trim().toLowerCase();
  const password = $("#authPassword").value;
  const message = $("#authMessage");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${AUTH_API_ROOT}/auth/${mode}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: mode === "register" ? $("#authName").value.trim() : undefined, email, password }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kunde inte logga in.");
    const account = data.user;
    if (!account?.id) throw new Error("Inloggningen gav inget giltigt användarkonto.");
    // Keep only the authenticated MongoDB member locally. Previous versions
    // stored demo users here, which made stale accounts appear in the app.
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify([account]));
    localStorage.setItem(SESSION_KEY, account.id);
    localStorage.setItem("inlev_user", account.id);
  } catch (error) {
    message.textContent = error.name === "AbortError"
      ? "Servern tar längre tid än vanligt att vakna. Försök igen om en stund."
      : (error.message || "Kunde inte ansluta till servern.");
    return;
  } finally {
    window.clearTimeout(timeout);
  }
  $("#authModal").hidden = true;
  document.body.classList.remove("auth-required");
  setAppLoading(true, "Laddar din medlemsprofil...");
  try {
    await loadInitialRemoteData();
    showView("home");
  } finally {
    setAppLoading(false);
  }
  // Visa appen direkt. En långsam eller tillfälligt otillgänglig fångstlista
  // ska inte hålla kvar användaren på inloggningssidan.
}

function bind() {
  $$('[data-view]').forEach((button) => button.addEventListener("click", () => {
    document.body.classList.remove("mobile-menu-open");
    $("#mobileMenuButton")?.setAttribute("aria-expanded", "false");
    showView(button.dataset.view);
  }));
  $$('[data-catch-view]').forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.catchView === "grid" ? "grid" : "list";
    localStorage.setItem(HOME_CATCH_VIEW_KEY, mode);
    updateHomeCatchView(mode);
  }));
  $("#mobileMenuButton")?.addEventListener("click", (event) => {
    const open = document.body.classList.toggle("mobile-menu-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
    event.currentTarget.setAttribute("aria-label", open ? "Stäng meny" : "Öppna meny");
  });
  $("#mobileAccountButton")?.addEventListener("click", toggleProfileMenu);
  $("#desktopAccountButton")?.addEventListener("click", toggleProfileMenu);
  $("#homeAvatar")?.addEventListener("click", toggleProfileMenu);
  $("#profileMenuEdit")?.addEventListener("click", () => { closeProfileMenu(); showView("profile"); openProfileSettings(); });
  $("#profileMenuLogout")?.addEventListener("click", () => { closeProfileMenu(); $("#logoutButton")?.click(); });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#profileMenu, #mobileAccountButton, #desktopAccountButton, #homeAvatar")) closeProfileMenu();
  });
  $$('[data-go-view]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.goView)));
  $("#journalNewTripButton")?.addEventListener("click", () => { $("#journalPlanner").hidden = false; $("#journalTripTitle")?.focus(); });
  $("#journalCancelButton")?.addEventListener("click", () => { $("#journalPlanner").hidden = true; });
  $("#journalTripForm")?.addEventListener("submit", saveJournalTrip);
  $("#createCompetitionButton")?.addEventListener("click", createCompetition);
  $("#competitionForm")?.addEventListener("submit", saveCompetition);
  $("#competitionSpeciesAll")?.addEventListener("change", (event) => {
    document.querySelectorAll('input[name="competitionSpecies"]').forEach((input) => {
      input.disabled = event.target.checked;
    });
  });
  $("#cancelCompetitionButton")?.addEventListener("click", () => { $("#competitionCreatePanel").hidden = true; });
  $("#competitionsList")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-competition-action]");
    if (actionButton?.dataset.competitionAction === "join") joinCompetition(actionButton.dataset.competitionId);
    else if (actionButton?.dataset.competitionAction === "leave") leaveCompetition(actionButton.dataset.competitionId);
    else if (actionButton?.dataset.competitionAction === "delete") deleteCompetition(actionButton.dataset.competitionId);
    else if (actionButton?.dataset.competitionAction === "favorite") {
      const id = actionButton.dataset.competitionId;
      setFavoriteCompetition(favoriteCompetition() === id ? "" : id);
      renderCompetitions();
    }
    else {
      const card = event.target.closest(".competition-card");
      if (card) toggleCompetitionDetails(card.dataset.competitionId);
    }
  });
  $("#competitionDetails")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest('[data-competition-action="favorite"]');
    if (!actionButton) return;
    event.preventDefault();
    event.stopPropagation();
    const id = actionButton.dataset.competitionId;
    setFavoriteCompetition(favoriteCompetition() === id ? "" : id);
    renderCompetitions();
    renderCompetitionDetails(id);
  });
  $("#homeCompetitionList")?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-competition-id]");
    if (card) { showView("competitions"); toggleCompetitionDetails(card.dataset.competitionId); }
  });
  $("#competitionParticipants")?.addEventListener("click", (event) => {
    const participant = event.target.closest(".competition-participant");
    if (participant) renderParticipantCatches(participant.dataset.competitionId, participant.dataset.participantId);
  });
  $("#allCatchList")?.addEventListener("click", (event) => {
    // The inline detail card lives inside the catch list; do not let its
    // buttons or image trigger the parent catch-row handler again.
    if (event.target.closest("#catchDetail")) return;
    const deleteButton = event.target.closest("[data-delete-catch]");
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      openDeleteCatchDialog(deleteButton.dataset.deleteCatch);
      return;
    }
    const row = event.target.closest("[data-catch-id]");
    if (row) {
      if (row.classList.contains("is-selected") && !$("#catchDetail")?.hidden) {
        closeCatchDetailPanel();
        return;
      }
      renderCatchDetail(row.dataset.catchId);
      zoomToCatchOnMap(row.dataset.catchId);
    }
  });
  $("#homeCatchList")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-catch-id]");
    if (!row) return;
    showView("catches");
    renderCatchDetail(row.dataset.catchId);
    window.setTimeout(() => zoomToCatchOnMap(row.dataset.catchId), 0);
  });
  $("#allCatchList")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("#catchDetail")) return;
    const row = event.target.closest("[data-catch-id]");
    if (row) {
      event.preventDefault();
      if (row.classList.contains("is-selected") && !$("#catchDetail")?.hidden) {
        closeCatchDetailPanel();
        return;
      }
      renderCatchDetail(row.dataset.catchId);
      zoomToCatchOnMap(row.dataset.catchId);
    }
  });
  $("#showCatchesMap")?.addEventListener("click", () => {
    $("#catchMapPanel").hidden = false;
    renderCatchMap();
  });
  $("#shareMapWithFriends")?.addEventListener("click", async () => {
    const panel = $("#mapSharePanel");
    if (!panel) return;
    if (!panel.hidden && panel.classList.contains("is-open")) {
      panel.hidden = true;
      panel.classList.remove("is-open");
      return;
    }
    panel.hidden = false;
    panel.classList.add("is-open");
    renderMapSharePanel();
    // Refresh both lists so a newly accepted friend or newly saved catch is available immediately.
    await Promise.all([loadRemoteFriends(), loadSharedMapData()]);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#closeMapSharePanel")?.addEventListener("click", () => {
    const panel = $("#mapSharePanel");
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove("is-open");
  });
  $("#mapShareZoneForm")?.addEventListener("submit", createMapShareZone);
  $("#mapShareZoneList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-map-zone]");
    if (button) deleteMapShareZone(button.dataset.deleteMapZone);
  });
  $("#shareCatchCoordinates")?.addEventListener("click", shareCatchCoordinates);
  $("#deleteCatchCodeInput")?.addEventListener("input", (event) => {
    const value = String(event.target.value || "").trim().toUpperCase();
    event.target.value = value;
    const confirm = $("#confirmDeleteCatch");
    if (confirm) confirm.disabled = value.length !== 5;
    const message = $("#deleteCatchMessage");
    if (message) message.textContent = "";
  });
  $("#closeDeleteCatchModal")?.addEventListener("click", closeDeleteCatchDialog);
  $("#cancelDeleteCatch")?.addEventListener("click", closeDeleteCatchDialog);
  $("#confirmDeleteCatch")?.addEventListener("click", confirmDeleteCatch);
  $("#deleteCatchModal")?.addEventListener("click", (event) => {
    if (event.target.id === "deleteCatchModal") closeDeleteCatchDialog();
  });
  $("#hideCatchesMap")?.addEventListener("click", () => {
    $("#catchMapPanel").hidden = true;
  });
  $("#closeCatchDetail")?.addEventListener("click", () => {
    closeCatchDetailPanel();
  });
  $("#catchDetailImage")?.addEventListener("click", () => {
    const source = $("#catchDetailImage").src;
    if (!source) return;
    const mapPanel = $("#catchMapPanel");
    if (mapPanel) {
      mapPanel.dataset.wasVisibleForLightbox = String(!mapPanel.hidden);
      mapPanel.hidden = true;
    }
    $("#catchLightboxImage").src = source;
    $("#catchImageLightbox").hidden = false;
  });
  const closeCatchImageLightbox = () => {
    $("#catchImageLightbox").hidden = true;
    const mapPanel = $("#catchMapPanel");
    if (mapPanel?.dataset.wasVisibleForLightbox === "true") {
      mapPanel.hidden = false;
      renderCatchMap();
    }
    if (mapPanel) delete mapPanel.dataset.wasVisibleForLightbox;
  };
  $("#closeCatchImage")?.addEventListener("click", closeCatchImageLightbox);
  $("#catchImageLightbox")?.addEventListener("click", (event) => {
    if (event.target.id === "catchImageLightbox") closeCatchImageLightbox();
  });
  $("#closeCompetitionDetails")?.addEventListener("click", () => {
    $("#competitionDetails").hidden = true;
    $("#competitionDetails").removeAttribute("data-competition-id");
  });
  $("#accountButton")?.addEventListener("click", () => currentAccount() ? showView("profile") : openAuth("login"));
  $("#profileAuthButton")?.addEventListener("click", () => currentAccount() ? showView("profile") : openAuth("login"));
  $("#profileSettingsButton")?.addEventListener("click", openProfileSettings);
  $("#liveStatusButton")?.addEventListener("click", () => {
    const account = currentAccount();
    if (!account) return openAuth("login");
    const active = isLive(account.id);
    const duration = Number($("#liveDurationSelect")?.value || 60);
    setLive(account.id, !active, duration);
    renderFriends();
    renderHomeFriendsOnline();
  });
  window.setInterval(() => {
    const account = currentAccount();
    if (!account) return;
    const wasLive = localStorage.getItem(`${LIVE_KEY}:${account.id}`) === "true";
    const active = isLive(account.id);
    renderLiveStatus(account);
    if (wasLive && !active) {
      renderFriends();
      renderHomeFriendsOnline();
    }
  }, 30000);
  $("#friendSearchInput")?.addEventListener("input", () => { friendSearchResult = null; renderFriends(); });
  $("#friendAddForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rawQuery = $("#friendSearchInput")?.value.trim().toUpperCase();
    const query = rawQuery && /^[0-9]{5}-[A-Z]{3}$/.test(rawQuery) ? `#${rawQuery}` : rawQuery;
    friendSearchResult = null;
    if (!query) {
      renderFriends();
      return;
    }
    const friend = accounts().find((item) => item.id !== currentAccount()?.id && String(item.memberCode || "").toUpperCase() === query);
    if (!friend && query) {
      try {
        const response = await fetch(`${AUTH_API_ROOT}/members/search?memberCode=${encodeURIComponent(query)}`, { credentials: "include" });
        const data = await response.json();
        if (response.ok && data.user && data.user.id !== currentAccount()?.id) {
          const list = accounts().filter((item) => item.id !== data.user.id);
          localStorage.setItem(ACCOUNT_KEY, JSON.stringify([...list, data.user]));
          friendSearchResult = data.user;
          renderFriends();
          return;
        }
      } catch { /* Use the local search fallback message below. */ }
    }
    if (friend) {
      friendSearchResult = friend;
      return renderFriends();
    }
    else window.alert("Ingen användare hittades.");
  });
  $("#friendSuggestions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-friend-id]");
    if (button) sendFriendRequest(button.dataset.friendId);
  });
  $("#friendList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-accept-friend-request]");
    if (button) acceptFriendRequest(button.dataset.acceptFriendRequest);
    const denyButton = event.target.closest("[data-deny-friend-request]");
    if (denyButton) denyFriendRequest(denyButton.dataset.denyFriendRequest);
    const removeButton = event.target.closest("[data-remove-friend]");
    if (removeButton) removeFriend(removeButton.dataset.removeFriend);
  });
  $("#copyMemberCode")?.addEventListener("click", async () => {
    const code = ensureMemberCode(currentAccount());
    try { await navigator.clipboard.writeText(code); } catch { window.prompt("Kopiera ditt medlemsnummer", code); }
    $("#copyMemberCode").textContent = "Kopierat";
    setTimeout(() => { if ($("#copyMemberCode")) $("#copyMemberCode").textContent = "Kopiera"; }, 1400);
  });
  $("#closeProfileSettingsButton")?.addEventListener("click", () => { $("#profileSettingsModal").hidden = true; });
  $("#profileSettingsModal")?.addEventListener("click", (event) => { if (event.target.id === "profileSettingsModal") event.currentTarget.hidden = true; });
  $("#profileSettingsForm")?.addEventListener("submit", saveProfile);
  $("#profilePersonalBestList")?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-personal-best-species]");
    if (!input) return;
    const values = personalBests();
    const value = Number(input.value);
    if (value > 0) values[input.dataset.personalBestSpecies] = value;
    else delete values[input.dataset.personalBestSpecies];
    localStorage.setItem(personalBestKey(), JSON.stringify(values));
    renderPersonalBestLists(userCatches());
  });
  $("#profilePhotoInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      pendingProfilePhoto = String(reader.result || "");
      event.target.dataset.photo = pendingProfilePhoto;
      updateSettingsPreview(pendingProfilePhoto, $("#profileNameInput").value);
    });
    reader.readAsDataURL(file);
  });
  $("#closeAuthButton")?.addEventListener("click", () => openAuth("login"));
  $("#authModal")?.addEventListener("click", (event) => { if (event.target.id === "authModal") openAuth("login"); });
  $$('[data-auth-mode]').forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
  $("#authForm")?.addEventListener("submit", handleAuth);
  $("#toggleAuthPassword")?.addEventListener("click", (event) => {
    const input = $("#authPassword");
    if (!input) return;
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    event.currentTarget.textContent = visible ? "○" : "◉";
    event.currentTarget.setAttribute("aria-label", visible ? "Dölj lösenord" : "Visa lösenord");
    event.currentTarget.setAttribute("title", visible ? "Dölj lösenord" : "Visa lösenord");
  });
  $("#logoutButton")?.addEventListener("click", async () => { await fetch(`${AUTH_API_ROOT}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {}); remoteCatches = null; remoteFriends = null; localStorage.removeItem(SESSION_KEY); localStorage.removeItem("inlev_user"); renderAccount(); showView("home"); });
  window.addEventListener("bigplus:catch-saved", async (event) => {
    setAppLoading(true, "Laddar din fångst...");
    try {
      renderCatchLists();
      await loadRemoteCatches();
      await loadRemoteFriends();
      await loadRemoteCompetitions();
      const catchId = event.detail?.catchId;
      showView("catches");
      if (catchId) {
        renderCatchDetail(catchId);
      }
    } finally {
      setAppLoading(false);
    }
  });
  window.addEventListener("storage", () => { renderAccount(); renderCatchLists(); renderFriends(); });
}

bind();
renderAccount();
renderFriends();
renderCatchLists();
renderCompetitions();

// Vänta på backendens session innan appen visas. Annars kan ett gammalt
// localStorage-konto öppna appen som en falsk gäst eller låsa fast loginvyn.
async function loadInitialRemoteData() {
  await loadRemoteCatches();
  await loadRemoteFriends();
  await loadRemoteCompetitions();
  renderAccount();
  renderCatchLists();
  renderFriends();
  renderCompetitions();
}

function finishAuthBootstrap() {
  authBootstrapActive = false;
  document.body.classList.remove("auth-bootstrap-pending");
  setAppLoading(false);
}

if (currentAccount()) showView("home");
else openAuth("login");

fetch(`${AUTH_API_ROOT}/auth/me`, { credentials: "include" })
  .then((response) => response.ok ? response.json() : null)
  .then(async (data) => {
    if (!authBootstrapActive) return;
    if (!data?.user) {
      if (currentAccount()) {
        renderAccount();
        await loadInitialRemoteData();
        showView("home");
        return;
      }
      localStorage.removeItem(ACCOUNT_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem("inlev_user");
      renderAccount();
      openAuth("login");
      return;
    }
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify([data.user]));
    localStorage.setItem(SESSION_KEY, data.user.id);
    localStorage.setItem("inlev_user", data.user.id);
    await loadInitialRemoteData();
    showView("home");
  })
  .catch(async () => {
    if (!authBootstrapActive) return;
    if (currentAccount()) {
      renderAccount();
      await loadInitialRemoteData();
      showView("home");
      return;
    }
    localStorage.removeItem(ACCOUNT_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem("inlev_user");
    renderAccount();
    openAuth("login");
  })
  .finally(finishAuthBootstrap);
