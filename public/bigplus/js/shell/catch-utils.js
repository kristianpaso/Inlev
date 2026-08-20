import { currentAccount } from "./account.js";
import { displayValue, escapeHtml, photoSource } from "./format.js";

export function formatCatch(item, compact = false, index = 0) {
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
  return `<article class="catch-row${compact ? " home-catch-card" : ""}" data-catch-id="${escapeHtml(catchKey)}" role="button" tabindex="0"><span class="catch-rank-badge" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><div class="catch-thumb">${photo ? `<img src="${photo}" alt="">` : "<span>FISK</span>"}</div><div class="catch-copy"><strong>${escapeHtml(species)}</strong><small>${compact ? (length ? `${length.toFixed(1)} cm` : "-- cm") : date}</small></div><div class="catch-values"><strong>${length ? `${length.toFixed(1)} cm` : "-- cm"}</strong><small>${compact ? date : (weight ? `${weight.toFixed(1)} kg` : "-- kg")}</small></div></article>`;
}

export function isBigplusCatch(item) {
  const measurement = item.measurement || item;
  return measurement.status === "BIGPLUS" || measurement.isBigplus;
}

export function completedAchievementCount(list) {
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

export function recentWindowDelta(list, predicate) {
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

export function calculateBigplusRank(catchList, accountId = currentAccount()?.id) {
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
