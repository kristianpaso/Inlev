import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";
import { completedAchievementCount, isBigplusCatch } from "./catch-utils.js";
import { isLive } from "./live.js";

export function createHomeWidgets(deps) {
  const getList = (list) => Array.isArray(list) ? list : deps.userCatches();

  function renderHomeActivity(list = deps.userCatches()) {
    const target = $("#homeActivityList");
    if (!target) return;
    const events = [];
    const account = deps.currentAccount();
    const friendAccounts = account
      ? deps.friendIds(account.id).map((id) => deps.accounts().find((item) => item.id === id)).filter(Boolean)
      : [];
    friendAccounts.forEach((friend) => {
      const friendCatches = deps.catches()
        .filter((item) => item.userId === friend.id)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const latestFriendCatch = friendCatches[0];
      if (!latestFriendCatch) return;
      const measurement = latestFriendCatch.measurement || latestFriendCatch;
      const friendName = friend.name || friend.email || "En v\u00e4n";
      const species = measurement.speciesName || measurement.species || "F\u00e5ngst";
      const length = Number(measurement.lengthCm || 0);
      events.push({
        icon: "\u25c8",
        title: `${friendName} f\u00e5ngade n\u00e5got`,
        detail: `${species}${length > 0 ? ` \u00b7 ${length.toFixed(1)} cm` : ""}`,
        date: latestFriendCatch.createdAt
      });
      const friendAchievements = completedAchievementCount(friendCatches);
      if (friendAchievements > 0) {
        events.push({
          icon: "\u2726",
          title: `${friendName} klarade ett achievement`,
          detail: `${friendAchievements} achievements klara`,
          date: latestFriendCatch.createdAt
        });
      }
    });
    const sorted = [...getList(list)].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
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
      events.push({ icon: "\u{1f3c6}", title: "Du fick ett nytt Bigplus!", detail: `${measurement.speciesName || measurement.species || "F\u00e5ngst"} ${Number(measurement.lengthCm || 0).toFixed(1)} cm`, date: latestBigplus.createdAt });
    }
    if (latestCatch && latestCatch !== latestBigplus) {
      const measurement = latestCatch.measurement || latestCatch;
      events.push({ icon: "\u25c8", title: "Ny f\u00e5ngst registrerad", detail: `${measurement.speciesName || measurement.species || "F\u00e5ngst"} \u00b7 ${Number(measurement.lengthCm || 0).toFixed(1)} cm`, date: latestCatch.createdAt });
    }
    const joinedCompetition = deps.competitions().find(deps.isCompetitionMember);
    if (joinedCompetition) events.push({ icon: "\u265f", title: joinedCompetition.name, detail: "Du deltar i t\u00e4vlingen", date: joinedCompetition.createdAt });
    const achievements = completedAchievementCount(getList(list));
    if (achievements > 0) events.push({ icon: "\u2726", title: "M\u00e4rke uppl\u00e5st", detail: `${achievements} avklarade achievements`, date: latestBigplus?.createdAt || latestCatch?.createdAt });
    const html = events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 3).map((event) => `<div class="home-activity-row"><span class="home-activity-icon" aria-hidden="true">${event.icon}</span><span class="home-activity-copy"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail)}</small></span><time>${escapeHtml(timeLabel(event.date))}</time></div>`).join("");
    target.innerHTML = html || `<div class="empty-list"><strong>Ingen aktivitet \u00e4nnu</strong><span>M\u00e4t din f\u00f6rsta fisk f\u00f6r att b\u00f6rja f\u00f6lja utvecklingen.</span></div>`;
  }

  function renderHomeFriendsOnline() {
    const target = $("#homeFriendsOnlineList");
    const account = deps.currentAccount();
    if (!target || !account) return;
    const remote = Array.isArray(deps.remoteFriends()?.friends) ? deps.remoteFriends().friends : [];
    const local = deps.friendIds(account.id)
      .map((id) => deps.accounts().find((item) => item.id === id))
      .filter(Boolean);
    const friends = [...remote, ...local]
      .filter((friend) => friend && String(friend.id || friend._id || "") !== String(account.id))
      .filter((friend, index, items) => items.findIndex((item) => String(item.id || item._id || "") === String(friend.id || friend._id || "")) === index)
      .sort((a, b) => Number(isLive(b.id || b._id)) - Number(isLive(a.id || a._id)) || String(a.name || "").localeCompare(String(b.name || ""), "sv"))
      .slice(0, 10);
    target.innerHTML = friends.length
      ? friends.map((friend) => {
        const live = isLive(friend.id || friend._id);
        return `<article class="home-friend-online-row"><span class="competition-avatar">${escapeHtml((friend.name || "F").slice(0, 1).toUpperCase())}${live ? '<i aria-hidden="true"></i>' : ""}</span><span><strong>${escapeHtml(friend.name || "Fiskare")}</strong><small>${live ? "Fiskar just nu" : "Inte LIVE just nu"}</small></span>${live ? "<b>LIVE</b>" : "<b aria-hidden=\"true\"></b>"}</article>`;
      }).join("")
      : `<div class="empty-list"><strong>Inga v\u00e4nner \u00e4nnu</strong><span>L\u00e4gg till v\u00e4nner f\u00f6r att se deras LIVE-status h\u00e4r.</span></div>`;
  }

  function renderHomeTournament() {
    const target = $("#homeTournamentBlock");
    if (!target) return;
    const selected = deps.competitions().find((item) => item.id === deps.favoriteCompetition());
    if (!selected) {
      target.innerHTML = `<div class="empty-list"><strong>V\u00e4lj en favoritturnering</strong><span>Markera en t\u00e4vling med Favorit f\u00f6r att f\u00f6lja den h\u00e4r.</span></div>`;
      return;
    }
    const items = deps.catches().filter((item) => Array.isArray(item.competitionIds) && item.competitionIds.includes(selected.id));
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
    const percent = Math.round(Math.min(100, (progress / targetCm) * 100));
    target.innerHTML = `<article class="home-tournament-card"><div class="home-tournament-heading"><div><span class="tournament-days-left">${daysLeft} dagar kvar</span><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.description || "P\u00e5g\u00e5ende utmaning")}</p></div><span class="home-tournament-star">\u2605</span></div><div class="home-tournament-progress"><div><strong>Framsteg</strong><span>${progress.toFixed(0)} / ${targetCm.toFixed(0)} cm</span></div><span class="progress-track"><i style="width:${percent}%"></i></span><b>${percent}%</b></div><div class="home-tournament-leaderboard"><strong>Topplista</strong>${leaders.length ? leaders.map((leader, index) => { const profile = deps.accounts().find((item) => item.id === leader.userId); return `<div><b>${index + 1}</b><span>${escapeHtml(profile?.name || "Fiskare")}</span><strong>${leader.best.toFixed(1)} cm</strong></div>`; }).join("") : `<small>Topplistan fylls p\u00e5 n\u00e4r deltagarna registrerar f\u00e5ngster.</small>`}</div></article>`;
  }

  function renderHomeCompetitionRank() {
    const target = $("#homeCompetitionRank");
    if (!target) return;
    const account = deps.currentAccount();
    const competition = deps.competitions().find(deps.isCompetitionMember);
    if (!account || !competition) {
      target.textContent = "Rank --";
      return;
    }
    const scores = new Map();
    deps.catches().filter((item) => Array.isArray(item.competitionIds) && item.competitionIds.includes(competition.id)).forEach((item) => {
      const length = Number((item.measurement || item).lengthCm || 0);
      if (!length) return;
      const userId = item.userId || "guest";
      scores.set(userId, Math.max(scores.get(userId) || 0, length));
    });
    const ranking = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const index = ranking.findIndex(([userId]) => userId === account.id);
    target.textContent = index >= 0 ? `Rank ${index + 1}` : "Rank --";
  }

  return {
    renderHomeActivity,
    renderHomeFriendsOnline,
    renderHomeTournament,
    renderHomeCompetitionRank
  };
}
