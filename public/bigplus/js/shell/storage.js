export const ACCOUNT_KEY = "bigplus_accounts";
export const SESSION_KEY = "bigplus_session";
export const CATCH_KEY = "bigplus_catches";
export const COMPETITION_KEY = "bigplus_competitions";
export const PERSONAL_BEST_KEY = "bigplus_personal_bests";
export const FAVORITE_COMPETITION_KEY = "bigplus_favorite_competition";
export const FRIENDS_KEY = "bigplus_friends";
export const FRIEND_REQUESTS_KEY = "bigplus_friend_requests";
export const LIVE_KEY = "bigplus_live_status";
export const LIVE_CHANNEL_KEY = "bigplus_live_channel";
export const HOME_CATCH_VIEW_KEY = "bigplus_home_catch_view";

export function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
