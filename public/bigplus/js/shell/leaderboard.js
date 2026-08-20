import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";

export function createLeaderboardRenderer({
  acceptedFriendIds,
  accounts,
  catches,
  currentAccount
}) {
  return function renderLeaderboard() {
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
      }).join("") : '<div class="empty-list"><strong>Ingen registrerad \u00e4n</strong><span>L\u00e4gg till en Bigplus-f\u00e5ngst f\u00f6r att synas h\u00e4r.</span></div>';
      return `<section class="leaderboard-board"><h3>${title}</h3><p>${subtitle}</p><div class="leaderboard-list">${body}</div></section>`;
    };

    target.innerHTML = [
      renderBoard("Vikt", "B\u00e4sta Bigplus-vikt", "bestWeight", (value) => `${value.toFixed(1)} kg`),
      renderBoard("L\u00e4ngd", "L\u00e4ngsta Bigplus-fisk", "bestLength", (value) => `${value.toFixed(1)} cm`),
      renderBoard("Antal", "Flest Bigplus-f\u00e5ngster", "count", (value) => `${value} st`)
    ].join("");
  };
}
