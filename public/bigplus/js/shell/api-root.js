// The hosted ChatGPT address is the local test environment. Production hosts
// use Render, while localhost and the hosted test page use the local API.
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const isHostedTestHost = window.location.hostname === "bigplus-app.paso-kristian.chatgpt.site";
const useLocalApi = isLocalHost || isHostedTestHost;
const LOCAL_API_HOST = window.location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";

export const AUTH_API_ROOT = useLocalApi
  ? `http://${LOCAL_API_HOST}:4100/api/bigplus`
  : (window.BIGPLUS_RENDER_API_ROOT || "https://bigplus-api.onrender.com/api/bigplus");

export const AUTH_API_FALLBACK_ROOT = useLocalApi
  ? `http://${LOCAL_API_HOST === "127.0.0.1" ? "localhost" : "127.0.0.1"}:4100/api/bigplus`
  : null;
