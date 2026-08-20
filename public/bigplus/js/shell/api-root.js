// Keep the local API on the same hostname so host-only session cookies are sent.
const LOCAL_API_HOST = window.location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";

export const AUTH_API_ROOT = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? `http://${LOCAL_API_HOST}:4100/api/bigplus`
  : (window.BIGPLUS_RENDER_API_ROOT || "https://bigplus-api.onrender.com/api/bigplus");

export const AUTH_API_FALLBACK_ROOT = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? `http://${LOCAL_API_HOST === "127.0.0.1" ? "localhost" : "127.0.0.1"}:4100/api/bigplus`
  : null;
