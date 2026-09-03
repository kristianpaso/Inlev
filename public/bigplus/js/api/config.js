const LOCAL_API_HOST = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? window.location.hostname
  : "localhost";

export const LOCAL_API_ROOT = `http://${LOCAL_API_HOST}:4100/api/bigplus`;
export const RENDER_API_ROOT = window.BIGPLUS_RENDER_API_ROOT || "https://bigplus-api.onrender.com/api/bigplus";

function resolveApiRoot() {
  const params = new URLSearchParams(window.location.search);
  const apiTarget = params.get("api") || window.BIGPLUS_API_TARGET;

  if (apiTarget === "local" || apiTarget === "render") {
    localStorage.setItem("bigplus_api_target", apiTarget);
  }

  const isLocalFrontend = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const savedTarget = localStorage.getItem("bigplus_api_target");
  if (isLocalFrontend && savedTarget === "local") return LOCAL_API_ROOT;
  if (savedTarget === "render") return RENDER_API_ROOT;

  return isLocalFrontend ? LOCAL_API_ROOT : RENDER_API_ROOT;
}

export const API_ROOT = resolveApiRoot();

export function getApiMode() {
  const isLocal = API_ROOT === LOCAL_API_ROOT;
  return {
    mode: isLocal ? "dev" : "prod",
    label: isLocal ? "DEV" : "PROD",
    apiRoot: API_ROOT,
    target: isLocal ? "local" : "render"
  };
}

export function userQuery(userId) {
  const clean = String(userId || "").trim();
  return clean ? `?user=${encodeURIComponent(clean)}` : "";
}
