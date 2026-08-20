import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";
import { ACCOUNT_KEY, COMPETITION_KEY } from "./storage.js";
import { friendIds, friendRequests, pendingFriendRequest, setFriendIds, setFriendRequests } from "./friends.js";
import { ensureMemberCode } from "./account.js";

export function createFriendController({
  accounts,
  catches,
  completedAchievementCount,
  currentAccount,
  isBigplusCatch,
  isLive,
  liveChannel,
  renderHomeFriendsOnline,
  renderLiveStatus,
  remoteFriends,
  authApiRoot,
  loadRemoteCompetitions,
  loadRemoteFriends,
  renderMapSharePanel
}) {
  let friendSearchResult = null;

  function friendTournamentId(firstId, secondId) {
    return "friend-tournament:" + [firstId, secondId].sort().join(":");
  }

  function competitions() {
    try {
      return JSON.parse(localStorage.getItem(COMPETITION_KEY) || "[]");
    } catch {
      return [];
    }
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
      name: "V\u00e4nturnering: " + (friend.name || "Fiskare"),
      description: "St\u00f6rsta fisk per art",
      daysLeft: 365,
      createdBy: account.id,
      members: [account.id, friend.id],
      createdAt: new Date().toISOString()
    };
    localStorage.setItem(COMPETITION_KEY, JSON.stringify([...competitions(), tournament]));
    return id;
  }

  function friendBestBySpecies(ids) {
    const result = new Map();
    catches().filter((item) => ids.includes(item.userId)).forEach((item) => {
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
        return `<div><span>${escapeHtml(species)}</span><strong>${item.length.toFixed(1)} cm</strong><small>${escapeHtml(owner?.name || "Fiskare")}</small></div>`;
      }).join("") : '<p class="friend-tournament-empty">Registrera f\u00e5ngster f\u00f6r att b\u00f6rja j\u00e4mf\u00f6ra arter.</p>';
      return `<article class="friend-tournament-card"><div class="friend-tournament-heading"><div><span class="section-kicker">V\u00c4NUTMANING</span><h3>${escapeHtml(friend.name || "Fiskare")}</h3><p>St\u00f6rsta fisk per art</p></div><span class="friend-tournament-icon">\u2605</span></div><div class="friend-tournament-results">${rows}</div></article>`;
    }).join("");
    target.innerHTML = `<div class="friend-tournament-title"><div><h3>V\u00e4nturneringar</h3><p>Varje v\u00e4n f\u00e5r en egen t\u00e4vling d\u00e4r b\u00e4sta resultatet per art f\u00f6ljs.</p></div><span>\u26a1</span></div>${cards}`;
  }

  function renderFriends() {
    const listTarget = $("#friendList");
    const suggestionsTarget = $("#friendSuggestions");
    const account = currentAccount();
    if (!listTarget || !account) return;
    const ids = friendIds(account.id);
    const remote = remoteFriends();
    const friends = remote ? remote.friends : ids.map((id) => accounts().find((item) => item.id === id)).filter(Boolean);
    const incoming = remote ? remote.incoming : friendRequests(account.id).filter((request) => request.status === "pending");
    const outgoing = remote ? remote.outgoing : accounts().filter((recipient) => recipient.id !== account.id).flatMap((recipient) => friendRequests(recipient.id)
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
        const action = isFriend ? '<span class="friend-search-status">V\u00e4n</span>' : pendingOutgoing ? '<span class="friend-search-status">V\u00e4ntar p\u00e5 svar</span>' : pendingIncoming ? '<span class="friend-search-status">Har skickat en f\u00f6rfr\u00e5gan</span>' : `<button class="primary-button" type="button" data-friend-id="${escapeHtml(result.id)}">L\u00e4gg till v\u00e4n</button>`;
        suggestionsTarget.innerHTML = `<article class="friend-suggestion friend-search-result"><span class="competition-avatar">${escapeHtml((result.name || "F").slice(0, 1).toUpperCase())}</span><span class="friend-search-result-copy"><strong>${escapeHtml(result.name || "Fiskare")}</strong><small>${escapeHtml(result.memberCode || "Medlem")}</small></span>${action}</article>`;
      } else {
        suggestionsTarget.innerHTML = search && candidates.length ? candidates.map((item) => `<button class="friend-suggestion" type="button" data-friend-id="${escapeHtml(item.id)}"><span class="competition-avatar">${escapeHtml((item.name || "F").slice(0, 1).toUpperCase())}</span><span>${escapeHtml(item.name || item.email)}</span><b>L\u00e4gg till</b></button>`).join("") : "";
      }
    }
    const friendMarkup = friends.length ? friends.map((friend) => {
      const ownCatches = catches().filter((item) => item.userId === friend.id);
      const bigplus = ownCatches.filter(isBigplusCatch).length;
      const achievements = completedAchievementCount(ownCatches);
      const live = isLive(friend.id);
      const channel = live ? liveChannel(friend.id) : "";
      const channelMarkup = channel ? `<a class="live-channel-link" href="${escapeHtml(channel)}" target="_blank" rel="noopener">Titta p\u00e5 stream</a>` : "";
      return `<article class="friend-card"><span class="competition-avatar">${escapeHtml((friend.name || "F").slice(0, 1).toUpperCase())}</span><div class="friend-card-main"><strong>${escapeHtml(friend.name || "Fiskare")}${live ? '<span class="live-badge"><span class="live-dot"></span> LIVE</span>' : ""}</strong><small>${ownCatches.length} f\u00e5ngster \u00b7 ${bigplus} Bigplus</small><span class="friend-progress"><i style="width:${Math.min(100, achievements * 20)}%"></i></span><small>${achievements} achievements klara</small>${channelMarkup}</div><button class="text-button friend-remove-button" type="button" data-remove-friend="${escapeHtml(String(friend.id || friend._id))}">Ta bort</button></article>`;
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
    if (remoteFriends()) {
      fetch(`${authApiRoot}/friends/requests`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: friend.id }) })
        .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Kunde inte skicka v\u00e4nf\u00f6rfr\u00e5gan."); await loadRemoteFriends(); })
        .catch((error) => window.alert(error.message));
      return;
    }
    const existing = friendRequests(friend.id).find((request) => request.fromId === account.id && request.status === "pending");
    if (!existing && !friendIds(account.id).includes(friend.id)) {
      setFriendRequests(friend.id, [...friendRequests(friend.id), { id: `${account.id}-${friend.id}-${Date.now()}`, fromId: account.id, toId: friend.id, status: "pending", createdAt: new Date().toISOString() }]);
    }
    const input = $("#friendSearchInput");
    if (input) input.value = "";
    friendSearchResult = null;
    renderFriends();
  }

  function acceptFriendRequest(requestId) {
    const account = currentAccount();
    if (!account) return;
    if (remoteFriends()) {
      fetch(`${authApiRoot}/friends/requests/${encodeURIComponent(requestId)}/accept`, { method: "POST", credentials: "include" })
        .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Kunde inte acceptera v\u00e4nf\u00f6rfr\u00e5gan."); await loadRemoteFriends(); })
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
    if (remoteFriends()) {
      fetch(`${authApiRoot}/friends/requests/${encodeURIComponent(requestId)}/deny`, { method: "POST", credentials: "include" })
        .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Kunde inte neka v\u00e4nf\u00f6rfr\u00e5gan."); await loadRemoteFriends(); })
        .catch((error) => window.alert(error.message));
      return;
    }
    setFriendRequests(account.id, friendRequests(account.id).filter((item) => item.id !== requestId));
    renderFriends();
  }

  function removeFriend(friendId) {
    const account = currentAccount();
    const friend = (remoteFriends()?.friends || []).find((item) => String(item.id || item._id) === String(friendId))
      || accounts().find((item) => String(item.id) === String(friendId));
    if (!account || !friend) return;
    const friendName = friend.name || "v\u00e4nnen";
    if (!window.confirm(`\u00c4r du s\u00e4ker p\u00e5 att du vill ta bort ${friendName} som v\u00e4n?`)) return;
    if (remoteFriends()) {
      fetch(`${authApiRoot}/friends/${encodeURIComponent(friendId)}`, { method: "DELETE", credentials: "include" })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Kunde inte ta bort v\u00e4nnen.");
          await loadRemoteFriends();
        })
        .catch((error) => window.alert(error.message));
      return;
    }
    setFriendIds(account.id, friendIds(account.id).filter((id) => String(id) !== String(friendId)));
    setFriendIds(friendId, friendIds(friendId).filter((id) => String(id) !== String(account.id)));
    renderFriends();
  }

  async function submitFriendSearch(event) {
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
        const response = await fetch(`${authApiRoot}/members/search?memberCode=${encodeURIComponent(query)}`, { credentials: "include" });
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
      renderFriends();
      return;
    }
    window.alert("Ingen anv\u00e4ndare hittades.");
  }

  async function ensureRemoteFriendTournaments() {
    const remote = remoteFriends();
    if (!remote?.friends?.length) return;
    await fetch(`${authApiRoot}/competitions/friends/ensure`, { method: "POST", credentials: "include" }).catch(() => {});
    await loadRemoteCompetitions();
  }

  function clearFriendSearch() {
    friendSearchResult = null;
    renderFriends();
  }

  return {
    acceptFriendRequest,
    clearFriendSearch,
    denyFriendRequest,
    ensureRemoteFriendTournaments,
    removeFriend,
    renderFriends,
    renderFriendTournaments,
    sendFriendRequest,
    submitFriendSearch
  };
}
