import { FAVORITE_COMPETITION_KEY, PERSONAL_BEST_KEY, readJson } from "./storage.js";
import { currentAccount } from "./account.js";

function scopedKey(key, accountId = currentAccount()?.id) {
  return `${key}:${accountId || "guest"}`;
}

export function favoriteCompetition(accountId = currentAccount()?.id) {
  const raw = localStorage.getItem(scopedKey(FAVORITE_COMPETITION_KEY, accountId));
  if (!raw) return "";
  try {
    return JSON.parse(raw) || "";
  } catch {
    return raw;
  }
}

export function setFavoriteCompetition(id, accountId = currentAccount()?.id) {
  localStorage.setItem(scopedKey(FAVORITE_COMPETITION_KEY, accountId), JSON.stringify(id || ""));
}

export function personalBestKey(accountId = currentAccount()?.id) {
  return scopedKey(PERSONAL_BEST_KEY, accountId);
}

export function personalBests(accountId = currentAccount()?.id) {
  return readJson(personalBestKey(accountId), {});
}
