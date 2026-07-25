const ACCOUNT_KEY = "bigplus_accounts";
const SESSION_KEY = "bigplus_session";
const CATCH_KEY = "bigplus_catches";
const COMPETITION_KEY = "bigplus_competitions";
const PERSONAL_BEST_KEY = "bigplus_personal_bests";
const FAVORITE_COMPETITION_KEY = "bigplus_favorite_competition";
const FRIENDS_KEY = "bigplus_friends";
const FRIEND_REQUESTS_KEY = "bigplus_friend_requests";
const LIVE_KEY = "bigplus_live_status";
let remoteCatches = null;
let pendingProfilePhoto = "";
const AUTH_API_ROOT = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? `http://${window.location.hostname}:4100/api/bigplus`
  : (window.BIGPLUS_RENDER_API_ROOT || "https://bigplus-api.onrender.com/api/bigplus");

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}

function accounts() { return readJson(ACCOUNT_KEY, []); }
function catches() { return readJson(CATCH_KEY, []); }
function competitions() {
  const list = readJson(COMPETITION_KEY, []);
  const filtered = list.filter((item) => item?.id !== "nordic-pike-challenge");
  if (filtered.length !== list.length) localStorage.setItem(COMPETITION_KEY, JSON.stringify(filtered));
  return filtered;
}
function membershipKey() {
  return `bigplus_competition_memberships:${currentAccount()?.id || "guest"}`;
}
function memberships() { return readJson(membershipKey(), []); }
function isCompetitionMember(competition) {
  const accountId = currentAccount()?.id;
  return Boolean(accountId && (memberships().includes(competition?.id) || (competition?.members || []).includes(accountId)));
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
function setFriendIds(accountId, ids) { if (accountId) localStorage.setItem(`${FRIENDS_KEY}:${accountId}`, JSON.stringify([...new Set(ids)])); }
function friendRequests(accountId = currentAccount()?.id) { return accountId ? readJson(`${FRIEND_REQUESTS_KEY}:${accountId}`, []) : []; }
function setFriendRequests(accountId, requests) { if (accountId) localStorage.setItem(`${FRIEND_REQUESTS_KEY}:${accountId}`, JSON.stringify(requests)); }
function isLive(accountId) { return localStorage.getItem(`${LIVE_KEY}:${accountId}`) === "true"; }
function setLive(accountId, value) { if (accountId) localStorage.setItem(`${LIVE_KEY}:${accountId}`, String(value)); }
function createMemberCode() {
  const digits = String(Math.floor(10000 + Math.random() * 90000));
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  return `#${digits}-${letters}`;
}
function ensureMemberCode(account) {
  if (!account) return "";
  if (account.memberCode) return account.memberCode;
  const code = createMemberCode();
  const updated = accounts().map((item) => item.id === account.id ? { ...item, memberCode: code } : item);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(updated));
  account.memberCode = code;
  return code;
}

function renderFriends() {
  const listTarget = $("#friendList");
  const suggestionsTarget = $("#friendSuggestions");
  const account = currentAccount();
  if (!listTarget || !account) return;
  const ids = friendIds(account.id);
  const incomingRequests = friendRequests(account.id).filter((request) => request.status === "pending");
  const friends = ids.map((id) => accounts().find((item) => item.id === id)).filter(Boolean);
  const search = $("#friendSearchInput")?.value.trim().toLowerCase() || "";
  const candidates = accounts().filter((item) => item.id !== account.id && item.profileVisibility !== "private" && !ids.includes(item.id) && (!search || `${item.name} ${item.email} ${item.memberCode || ""}`.toLowerCase().includes(search))).slice(0, 5);
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
      return `<article class="friend-request"><span class="competition-avatar">${escapeHtml((sender.name || "F").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(sender.name || "Fiskare")}</strong><small>Vill bli din vän</small></span><button class="secondary-button" type="button" data-accept-friend-request="${escapeHtml(request.id)}">Godkänn</button></article>`;
    }).join("");
    listTarget.insertAdjacentHTML("afterbegin", `<div class="friend-request-list"><h3>Vänförfrågningar</h3>${requestMarkup}</div>`);
  }
  const liveButton = $("#liveStatusButton");
  if (liveButton) {
    const active = isLive(account.id);
    liveButton.classList.toggle("is-live", active);
    liveButton.setAttribute("aria-pressed", String(active));
    $("#liveStatusLabel").textContent = active ? "LIVE aktiv" : "Aktivera LIVE";
  }
  const codeTarget = $("#profileMemberCode");
  if (codeTarget) codeTarget.textContent = ensureMemberCode(account);
}

function sendFriendRequest(friendId) {
  const account = currentAccount();
  const friend = accounts().find((item) => item.id === friendId);
  if (!account || !friend || account.id === friend.id) return;
  const existing = friendRequests(friend.id).find((request) => request.fromId === account.id && request.status === "pending");
  if (!existing && !friendIds(account.id).includes(friend.id)) {
    setFriendRequests(friend.id, [...friendRequests(friend.id), { id: `${account.id}-${Date.now()}`, fromId: account.id, status: "pending", createdAt: new Date().toISOString() }]);
  }
  $("#friendSearchInput").value = "";
  renderFriends();
}

function acceptFriendRequest(requestId) {
  const account = currentAccount();
  if (!account) return;
  const requests = friendRequests(account.id);
  const request = requests.find((item) => item.id === requestId);
  if (!request) return;
  setFriendRequests(account.id, requests.filter((item) => item.id !== requestId));
  setFriendIds(account.id, [...friendIds(account.id), request.fromId]);
  setFriendIds(request.fromId, [...friendIds(request.fromId), account.id]);
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
  const account = currentAccount();
  if (account && remoteCatches) return remoteCatches;
  const all = catches();
  return account ? all.filter((item) => item.userId === account.id) : all.filter((item) => !item.userId);
}

async function loadRemoteCatches() {
  if (!currentAccount()) { remoteCatches = null; return; }
  try {
    const response = await fetch(`${AUTH_API_ROOT}/catches`, { credentials: "include" });
    if (!response.ok) return;
    remoteCatches = await response.json();
    renderCatchLists();
  } catch {
    remoteCatches = null;
  }
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

function competitionCard(competition) {
  const days = Number(competition.daysLeft);
  $("#competitionDetailsMeta").textContent = "";
  const ending = Number.isFinite(days) ? `Avslutas om ${days} dagar` : "Aktiv tävling";
  const joined = isCompetitionMember(competition);
  const owner = competition.createdBy && competition.createdBy === currentAccount()?.id;
  const homeOnly = arguments[1]?.home;
  const participationAction = joined ? `<button class="secondary-button competition-leave-button" type="button" data-competition-action="leave" data-competition-id="${escapeHtml(competition.id)}">Lämna</button>` : `<button class="secondary-button competition-join-button" type="button" data-competition-action="join" data-competition-id="${escapeHtml(competition.id)}">Delta</button>`;
  const action = owner ? `${participationAction}<button class="secondary-button competition-delete-button" type="button" data-competition-action="delete" data-competition-id="${escapeHtml(competition.id)}">Ta bort</button>` : participationAction;
  const favorite = favoriteCompetition() === competition.id;
  const favoriteButton = `<button class="secondary-button competition-favorite-button${favorite ? " is-favorite" : ""}" type="button" data-competition-action="favorite" data-competition-id="${escapeHtml(competition.id)}" aria-pressed="${favorite}">${favorite ? "★ Favorit" : "☆ Favorit"}</button>`;
  return `<article class="competition-card${homeOnly ? " competition-card-home" : ""}" data-competition-id="${escapeHtml(competition.id)}"${homeOnly ? ' role="button" tabindex="0"' : ""}><div class="competition-card-main"><span class="competition-emblem" aria-hidden="true">★</span><div><h3>${escapeHtml(competition.name)}${owner ? '<span class="competition-title-star" aria-label="Skapad av dig">★</span>' : ""}</h3><p>${escapeHtml(competition.description || "Mät och jämför dina fångster.")}</p><small>${ending}</small>${owner ? '<span class="competition-owner-label">Din tävling</span>' : ""}</div></div>${homeOnly ? "" : `<div class="competition-card-actions">${favoriteButton}${action}</div>`}</article>`;
}

function renderCompetitions() {
  const list = competitions().filter((item) => item && item.name);
  const details = $("#competitionDetails");
  const detailsSlot = $("#competitionDetailsSlot");
  if (details && detailsSlot && details.parentElement !== detailsSlot) detailsSlot.appendChild(details);
  const html = list.length ? list.map(competitionCard).join("") : `<div class="empty-list"><strong>Inga aktiva tävlingar</strong><span>Skapa den första tävlingen.</span></div>`;
  const target = $("#competitionsList");
  if (target) target.innerHTML = html;
  if (target) decorateCompetitionCards(target);
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
  const scores = new Map();
  catches().forEach((item) => {
    const measurement = item.measurement || item;
    if (measurement.status !== "BIGPLUS" && !measurement.isBigplus) return;
    const id = item.userId || "guest";
    const score = scores.get(id) || { id, count: 0, best: 0 };
    score.count += 1;
    score.best = Math.max(score.best, Number(measurement.lengthCm || 0));
    scores.set(id, score);
  });
  const rows = [...scores.values()].sort((a, b) => b.count - a.count || b.best - a.best).slice(0, 10);
  target.innerHTML = rows.length ? rows.map((row, index) => {
    const account = accounts().find((item) => item.id === row.id);
    return `<div class="leaderboard-row"><strong class="leaderboard-rank">${index + 1}</strong><span class="competition-avatar">${escapeHtml((account?.name || "F").slice(0, 1).toUpperCase())}</span><span class="leaderboard-name">${escapeHtml(account?.name || "Fiskare")}</span><strong>${row.count} Bigplus</strong><small>Bäst ${row.best.toFixed(1)} cm</small></div>`;
  }).join("") : '<div class="empty-list"><strong>Topplistan väntar på fångster</strong><span>Registrera din första Bigplus-fisk.</span></div>';
}

function renderCompetitionDetails(competitionId) {
  const competition = competitions().find((item) => item.id === competitionId);
  const details = $("#competitionDetails");
  const participants = $("#competitionParticipants");
  if (!competition || !details || !participants) return;
  const slot = $("#competitionDetailsSlot");
  if (slot && details.parentElement !== slot) slot.appendChild(details);
  const participantMap = new Map();
  const memberIds = new Set([...(competition.members || []), ...(competition.createdBy ? [competition.createdBy] : [])]);
  memberIds.forEach((userId) => participantMap.set(userId, { userId, catches: [] }));
  catches().filter((item) => Array.isArray(item.competitionIds) && item.competitionIds.includes(competitionId)).forEach((item) => {
    const userId = item.userId || "guest";
    const own = participantMap.get(userId) || { userId, catches: [] };
    own.catches.push(item);
    participantMap.set(userId, own);
  });
  const members = [...participantMap.values()].sort((a, b) => Math.max(...b.catches.map((item) => Number(item.measurement?.lengthCm || 0))) - Math.max(...a.catches.map((item) => Number(item.measurement?.lengthCm || 0))));
  $("#competitionDetailsTitle").textContent = "Deltagare och bästa resultat";
  const days = Number(competition.daysLeft);
  $("#competitionDetailsMeta").textContent = Number.isFinite(days) ? `Avslutas om ${days} dagar` : "Aktiv tävling";
  participants.innerHTML = members.length ? members.map((member) => {
    const account = accounts().find((item) => item.id === member.userId);
    const best = member.catches.reduce((winner, item) => Number(item.measurement?.lengthCm || 0) > Number(winner?.measurement?.lengthCm || 0) ? item : winner, null);
    return `<button class="competition-participant" type="button" data-participant-id="${escapeHtml(member.userId)}" data-competition-id="${escapeHtml(competitionId)}"><span class="competition-avatar">${escapeHtml((account?.name || "F").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(account?.name || "Fiskare")}</strong><small>${member.catches.length} fångster</small></span><b>${best ? `${Number(best.measurement.lengthCm || 0).toFixed(1)} cm` : "--"}</b></button>`;
  }).join("") : '<div class="empty-list"><strong>Inga deltagare ännu</strong><span>Registrera en fångst för att synas här.</span></div>';
  $("#competitionDetailsMeta").textContent = "";
  details.hidden = false;
  details.dataset.competitionId = competitionId;
  details.classList.add("competition-details-inline");
  const card = [...document.querySelectorAll("#competitionsList .competition-card")].find((item) => item.dataset.competitionId === competitionId);
  if (card) card.insertAdjacentElement("afterend", details);
  $("#participantCatches").hidden = true;
  details.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleCompetitionDetails(competitionId) {
  const details = $("#competitionDetails");
  if (details && !details.hidden && details.dataset.competitionId === competitionId) {
    details.hidden = true;
    details.removeAttribute("data-competition-id");
    return;
  }
  renderCompetitionDetails(competitionId);
}

function renderParticipantCatches(competitionId, participantId) {
  const target = $("#participantCatches");
  if (!target) return;
  const items = catches().filter((item) => item.userId === participantId && Array.isArray(item.competitionIds) && item.competitionIds.includes(competitionId));
  target.innerHTML = `<h3>Uppladdade bilder</h3>${items.length ? `<div class="participant-photo-grid">${items.map((item) => item.photo ? `<figure><img src="${escapeHtml(item.photo)}" alt="Fångst"><figcaption>${Number(item.measurement?.lengthCm || 0).toFixed(1)} cm</figcaption></figure>` : "").join("")}</div>` : '<p class="hint">Inga bilder uppladdade ännu.</p>'}`;
  target.hidden = false;
}

function createCompetition() {
  const panel = $("#competitionCreatePanel");
  if (!panel) return;
  panel.hidden = false;
  $("#competitionNameInput")?.focus();
}

function saveCompetition(event) {
  event.preventDefault();
  const name = $("#competitionNameInput").value.trim();
  if (!name) return;
  const description = $("#competitionDescriptionInput").value.trim() || "Tävla om den längsta fisken.";
  const daysLeft = Math.max(1, Math.min(365, Number($("#competitionDaysInput").value) || 7));
  const creatorId = currentAccount()?.id || "";
  const joinOnCreate = $("#competitionJoinOnCreate")?.checked !== false;
  const next = { id: `competition-${Date.now()}`, name: name.slice(0, 80), description: description.slice(0, 140), daysLeft, createdBy: creatorId, members: joinOnCreate && creatorId ? [creatorId] : [], createdAt: new Date().toISOString() };
  localStorage.setItem(COMPETITION_KEY, JSON.stringify([...competitions(), next]));
  const joined = memberships();
  localStorage.setItem(membershipKey(), JSON.stringify(joinOnCreate ? [...new Set([...joined, next.id])] : joined.filter((id) => id !== next.id)));
  event.currentTarget.reset();
  $("#competitionDaysInput").value = "7";
  $("#competitionCreatePanel").hidden = true;
  renderCompetitions();
  window.alert("Tävlingen skapades.");
}

function joinCompetition(competitionId) {
  if (!competitionId || !currentAccount()) { openAuth("login"); return; }
  const joined = memberships();
  if (!joined.includes(competitionId)) joined.push(competitionId);
  localStorage.setItem(membershipKey(), JSON.stringify(joined));
  localStorage.setItem(COMPETITION_KEY, JSON.stringify(competitions().map((item) => item.id === competitionId ? { ...item, members: [...new Set([...(item.members || []), currentAccount()?.id].filter(Boolean))] } : item)));
  renderCompetitions();
  renderCompetitionDetails(competitionId);
  window.alert("Du deltar nu i tävlingen.");
}

function leaveCompetition(competitionId) {
  const joined = memberships().filter((id) => id !== competitionId);
  localStorage.setItem(membershipKey(), JSON.stringify(joined));
  const accountId = currentAccount()?.id;
  localStorage.setItem(COMPETITION_KEY, JSON.stringify(competitions().map((item) => item.id === competitionId ? { ...item, members: (item.members || []).filter((id) => id !== accountId) } : item)));
  renderCompetitions();
  window.alert("Du har lämnat tävlingen.");
}

function deleteCompetition(competitionId) {
  const competition = competitions().find((item) => item.id === competitionId);
  if (!competition || competition.createdBy !== currentAccount()?.id) return;
  if (!window.confirm(`Ta bort tävlingen ${competition.name}?`)) return;
  localStorage.setItem(COMPETITION_KEY, JSON.stringify(competitions().filter((item) => item.id !== competitionId)));
  localStorage.setItem(membershipKey(), JSON.stringify(memberships().filter((id) => id !== competitionId)));
  $("#competitionDetails").hidden = true;
  renderCompetitions();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
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
  const photo = item.photoDataUrl || item.photo || "";
  const catchKey = item.id || item._id || `catch-${index}`;
  if (compact) {
    const location = measurement.location || item.location || item.water || "Plats ej angiven";
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
  const list = userCatches();
  const item = list.find((entry) => String(entry.id || entry._id) === String(catchId)) || list[Number(String(catchId).replace("catch-", ""))];
  const detail = $("#catchDetail");
  if (!item || !detail) return;
  const measurement = item.measurement || item;
  const photo = item.photoDataUrl || item.photo || "";
  $("#catchDetailImage").src = photo;
  const weight = measurement.weightKg?.mid ?? measurement.weightKg ?? measurement.weight;
  const isBigplus = measurement.status === "BIGPLUS" || measurement.isBigplus;
  $("#catchDetailLength").textContent = `${Number(measurement.lengthCm || 0).toFixed(1)} cm`;
  $("#catchDetailWeight").textContent = weight ? `${Number(weight).toFixed(1)} kg` : "-- kg";
  $("#catchDetailStatus").classList.toggle("is-approved", Boolean(isBigplus));
  $("#catchDetailStatus strong").textContent = isBigplus ? "BIGPLUS" : "MÄTNING KLAR";
  $("#catchDetailStatus small").textContent = isBigplus ? "Godkänd fångst" : "Resultat från din mätning";
  $("#catchDetailTitle").textContent = measurement.speciesName || measurement.species || "Fångst";
  $("#catchDetailMeta").textContent = `${Number(measurement.lengthCm || 0).toFixed(1)} cm · ${measurement.status || "Mätt"}`;
  detail.hidden = false;
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const badgeIcons = ["★", "◈", "♛", "10+", "50+"];
  const badges = badgeIcons.map((icon, index) => {
    const complete = index < completed;
    return `<span class="home-badge-icon home-badge-icon-${index + 1}${complete ? " is-complete" : ""}" aria-label="${complete ? "Upplåst badge" : "Ej upplåst badge"}">${icon}</span>`;
  }).join("");
  const progress = achievements.length ? Math.round((completed / achievements.length) * 100) : 0;
  target.innerHTML = `<div class="home-achievement-overview"><div class="home-badge-icon-row">${badges}</div><div class="home-achievement-progress-label"><strong>${completed} / ${achievements.length} märken upplåsta</strong><button class="text-button" type="button" data-go-view="achievements">Visa alla</button></div><div class="home-achievement-progress"><i style="width:${progress}%"></i></div></div>`;
}

function renderHomeNextBadge(list) {
  const target = $("#homeNextBadge");
  if (!target) return;
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
    const capturedBest = Math.max(0, ...catchesForSpecies.map((item) => Number((item.measurement || item).lengthCm || 0)));
    const previousBest = Number(manual[name] || 0);
    const best = Math.max(capturedBest, previousBest);
    const bestCatch = catchesForSpecies.find((item) => Number((item.measurement || item).lengthCm || 0) === capturedBest);
    return { name, best, previousBest, photo: bestCatch?.photoDataUrl || bestCatch?.photo || "" };
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
    const capturedBest = Math.max(0, ...catchesForSpecies.map((item) => Number((item.measurement || item).lengthCm || 0)));
    const previousBest = Number(manual[name] || 0);
    const bestCatch = catchesForSpecies.find((item) => Number((item.measurement || item).lengthCm || 0) === capturedBest);
    return { name, capturedBest, previousBest, best: Math.max(capturedBest, previousBest), photo: bestCatch?.photoDataUrl || bestCatch?.photo || "" };
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
    const capturedBest = Math.max(0, ...catchesForSpecies.map((item) => Number((item.measurement || item).lengthCm || 0)));
    const previousBest = Number(manual[name] || 0);
    const bestCatch = catchesForSpecies.find((item) => Number((item.measurement || item).lengthCm || 0) === capturedBest);
    return { name, capturedBest, previousBest, best: Math.max(capturedBest, previousBest), photo: bestCatch?.photoDataUrl || bestCatch?.photo || "" };
  }).filter((item) => item.capturedBest > 0 || item.previousBest > 0 || editor).sort((a, b) => b.best - a.best || a.name.localeCompare(b.name, "sv"));
  if (home) {
    const tableRows = rows.filter((item) => item.capturedBest > 0 || item.previousBest > 0).slice(0, 5);
    home.innerHTML = tableRows.length ? `<div class="personal-best-table"><div class="personal-best-table-head"><span>Art</span><span>Livstid</span><span>Bigplus</span></div>${tableRows.map((item) => `<div class="personal-best-table-row"><div class="personal-best-species"><div class="personal-best-thumb">${item.photo ? `<img src="${item.photo}" alt="">` : "<span>FISK</span>"}</div><strong>${escapeHtml(item.name)}</strong></div><strong>${item.previousBest ? `${item.previousBest.toFixed(1)} cm` : "-- cm"}</strong><strong>${item.capturedBest ? `${item.capturedBest.toFixed(1)} cm` : "-- cm"}</strong></div>`).join("")}</div>` : `<div class="empty-list"><strong>Inga personbästa ännu</strong><span>Mät en fisk eller lägg till tidigare resultat i profilen.</span></div>`;
  }
  if (editor) {
    editor.innerHTML = rows.map((item) => `<div class="personal-best-row"><div class="personal-best-thumb">${item.photo ? `<img src="${item.photo}" alt="">` : "<span>FISK</span>"}</div><strong>${escapeHtml(item.name)}</strong><span class="personal-best-value">${item.best ? `${item.best.toFixed(1)} cm` : "-- cm"}</span><label class="personal-best-input"><span class="sr-only">Tidigare personbästa för ${escapeHtml(item.name)}</span><input type="number" min="0" step="0.1" value="${item.previousBest || ""}" placeholder="Tidigare cm" data-personal-best-species="${escapeHtml(item.name)}"></label></div>`).join("");
  }
}

let catchMapInstance = null;
let catchMapMarkers = null;

function renderCatchMap() {
  const panel = $("#catchMapPanel");
  const target = $("#catchMap");
  const empty = $("#catchMapEmpty");
  if (!panel || !target || panel.hidden) return;
  const located = userCatches().filter((item) => Number.isFinite(Number(item.location?.latitude)) && Number.isFinite(Number(item.location?.longitude)));
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
      const length = Number(measurement.lengthCm || 0);
      window.L.marker([latitude, longitude]).bindPopup(`<strong>${escapeHtml(species)}</strong><br>${length ? `${length.toFixed(1)} cm` : "Mätning"}`).addTo(catchMapMarkers);
    });
    catchMapInstance.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  }
  window.setTimeout(() => catchMapInstance.invalidateSize(), 50);
}

function renderCatchLists() {
  const list = userCatches().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const html = list.length ? list.slice(0, 4).map((item, index) => formatCatch(item, true, index)).join("") : `<div class="empty-list"><strong>Inga sparade fångster ännu</strong><span>Mät din första fisk för att se den här.</span></div>`;
  const home = $("#homeCatchList");
  const all = $("#allCatchList");
  if (home) home.innerHTML = html;
  if (all) all.innerHTML = list.length ? list.map((item, index) => formatCatch(item, false, index)).join("") : html;
  renderPersonalBestLists(list);
  renderHomeActivity(list);
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
  badges.push(
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
  const completed = badges.filter((item) => item.value >= item.goal).length;
  const rare = badges.filter((item) => item.value >= item.goal && item.points >= 50).length;
  $("#achievementCount")?.replaceChildren(document.createTextNode(String(completed)));
  $("#achievementRareCount")?.replaceChildren(document.createTextNode(String(rare)));
  $("#achievementGoalCount")?.replaceChildren(document.createTextNode(String(completed)));
  target.innerHTML = badges.map((item) => { const done = item.value >= item.goal; const progress = Math.min(100, item.value / item.goal * 100); return `<article class="achievement-card${done ? " is-complete" : ""}"><div class="achievement-badge ${done ? "fish-badge" : "target-badge"}">${item.icon}</div><h2>${escapeHtml(item.name.toUpperCase())}</h2><p>${escapeHtml(item.text)}<br><strong>${Math.min(item.value, item.goal)} / ${item.goal} · ${item.points} p</strong></p><span class="achievement-card-progress"><i style="width:${progress}%"></i></span></article>`; }).join("");
}

function renderAccount() {
  const account = currentAccount();
  const name = account?.name || "Gästfiskare";
  const initial = name.trim().charAt(0).toUpperCase() || "B";
  const button = $("#accountButton");
  if (button) button.textContent = account ? name : "Logga in";
  [$("#homeProfileName"), $("#profileName"), $("#profileHeading")].forEach((el) => { if (el) el.textContent = name; });
  if ($("#homeGreeting")) $("#homeGreeting").textContent = "Hej!";
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

function showView(view) {
  if (!currentAccount()) {
    document.body.classList.add("auth-required");
    openAuth("login");
    return;
  }
  document.body.classList.remove("auth-required");
  document.body.classList.toggle("measure-active", view === "measure");
  $$('[data-app-view]').forEach((section) => { section.hidden = section.dataset.appView !== view; });
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const measure = $(".workspace");
  if (measure) measure.hidden = view !== "measure";
  if (view === "home" || view === "catches" || view === "profile" || view === "competitions" || view === "achievements") renderCatchLists();
  if (view === "achievements") renderAchievementPage(userCatches());
  if (view === "home" || view === "competitions") renderCompetitions();
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
    const list = accounts().filter((item) => item.id !== account.id && item.email !== account.email);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify([...list, account]));
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
  renderAccount();
  renderCatchLists();
  await loadRemoteCatches();
  showView("home");
}

function bind() {
  $$('[data-view]').forEach((button) => button.addEventListener("click", () => {
    document.body.classList.remove("mobile-menu-open");
    $("#mobileMenuButton")?.setAttribute("aria-expanded", "false");
    showView(button.dataset.view);
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
  $("#createCompetitionButton")?.addEventListener("click", createCompetition);
  $("#competitionForm")?.addEventListener("submit", saveCompetition);
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
  $("#homeCompetitionList")?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-competition-id]");
    if (card) { showView("competitions"); toggleCompetitionDetails(card.dataset.competitionId); }
  });
  $("#competitionParticipants")?.addEventListener("click", (event) => {
    const participant = event.target.closest(".competition-participant");
    if (participant) renderParticipantCatches(participant.dataset.competitionId, participant.dataset.participantId);
  });
  $("#allCatchList")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-catch-id]");
    if (row) renderCatchDetail(row.dataset.catchId);
  });
  $("#homeCatchList")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-catch-id]");
    if (!row) return;
    showView("catches");
    renderCatchDetail(row.dataset.catchId);
  });
  $("#allCatchList")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-catch-id]");
    if (row) { event.preventDefault(); renderCatchDetail(row.dataset.catchId); }
  });
  $("#showCatchesMap")?.addEventListener("click", () => {
    $("#catchMapPanel").hidden = false;
    renderCatchMap();
  });
  $("#hideCatchesMap")?.addEventListener("click", () => {
    $("#catchMapPanel").hidden = true;
  });
  $("#closeCatchDetail")?.addEventListener("click", () => { $("#catchDetail").hidden = true; });
  $("#catchDetailImage")?.addEventListener("click", () => {
    const source = $("#catchDetailImage").src;
    if (!source) return;
    $("#catchLightboxImage").src = source;
    $("#catchImageLightbox").hidden = false;
  });
  $("#closeCatchImage")?.addEventListener("click", () => { $("#catchImageLightbox").hidden = true; });
  $("#catchImageLightbox")?.addEventListener("click", (event) => {
    if (event.target.id === "catchImageLightbox") event.currentTarget.hidden = true;
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
    setLive(account.id, !isLive(account.id));
    renderFriends();
  });
  $("#friendSearchInput")?.addEventListener("input", renderFriends);
  $("#friendAddForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = $("#friendSearchInput")?.value.trim().toLowerCase();
    const friend = accounts().find((item) => item.id !== currentAccount()?.id && `${item.name} ${item.email} ${item.memberCode || ""}`.toLowerCase().includes(query || ""));
    if (!friend && query) {
      try {
        const response = await fetch(`${AUTH_API_ROOT}/members/search?memberCode=${encodeURIComponent(query)}`, { credentials: "include" });
        const data = await response.json();
        if (response.ok && data.user) {
          const list = accounts().filter((item) => item.id !== data.user.id);
          localStorage.setItem(ACCOUNT_KEY, JSON.stringify([...list, data.user]));
          return sendFriendRequest(data.user.id);
        }
      } catch { /* Use the local search fallback message below. */ }
    }
    if (friend) return sendFriendRequest(friend.id);
    else window.alert("Ingen användare hittades.");
  });
  $("#friendSuggestions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-friend-id]");
    if (button) sendFriendRequest(button.dataset.friendId);
  });
  $("#friendList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-accept-friend-request]");
    if (button) acceptFriendRequest(button.dataset.acceptFriendRequest);
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
  $("#logoutButton")?.addEventListener("click", async () => { await fetch(`${AUTH_API_ROOT}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {}); remoteCatches = null; localStorage.removeItem(SESSION_KEY); localStorage.removeItem("inlev_user"); renderAccount(); showView("home"); });
  window.addEventListener("bigplus:catch-saved", () => { renderCatchLists(); loadRemoteCatches(); });
  window.addEventListener("storage", () => { renderAccount(); renderCatchLists(); renderFriends(); });
}

bind();
ensureDemoAccount();
renderAccount();
renderFriends();
renderCatchLists();
renderCompetitions();
showView("home");

fetch(`${AUTH_API_ROOT}/auth/me`, { credentials: "include" })
  .then((response) => response.ok ? response.json() : null)
  .then((data) => {
    if (!data?.user) return;
    const list = accounts().filter((item) => item.email !== data.user.email);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify([...list, data.user]));
    localStorage.setItem(SESSION_KEY, data.user.id);
    localStorage.setItem("inlev_user", data.user.id);
    renderAccount();
    renderCatchLists();
    loadRemoteCatches();
    showView("home");
  })
  .catch(() => {});
