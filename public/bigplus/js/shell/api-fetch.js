import { AUTH_API_FALLBACK_ROOT, AUTH_API_ROOT } from "./api-root.js";

export async function fetchWithApiFallback(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (!AUTH_API_FALLBACK_ROOT || !url.startsWith(AUTH_API_ROOT)) throw error;
    return fetch(`${AUTH_API_FALLBACK_ROOT}${url.slice(AUTH_API_ROOT.length)}`, options);
  }
}
