/**
 * Netlify Function: auth
 * Routes:
 *   GET  /api/auth/health   -> 200 OK
 *   POST /api/auth/login    -> { token }
 *
 * ENV (optional):
 *   ADMIN_USER, ADMIN_PASS   (fallbacks: Admin / 1234)
 */
const json = (statusCode, body = {}, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extraHeaders
  },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      },
      body: ""
    };
  }

  // path looks like "/.netlify/functions/auth/health" after redirect
  const path = (event.path || "").replace(/^\/\.netlify\/functions\/auth/, "");
  const method = event.httpMethod || "GET";

  if (method === "GET" && path === "/health") {
    return json(200, { ok: true, service: "auth", ts: new Date().toISOString() });
  }

  if (method === "POST" && path === "/login") {
    try {
      const { username, password } = JSON.parse(event.body || "{}");

      const USER = process.env.ADMIN_USER || "Admin";
      const PASS = process.env.ADMIN_PASS || "1234";

      if (username === USER && password === PASS) {
        const token = Buffer.from(`${USER}:${Date.now()}`).toString("base64");
        return json(200, { token });
      }
      return json(401, { error: "Fel användarnamn eller lösenord" });
    } catch (err) {
      return json(400, { error: "Ogiltig begäran", details: String(err && err.message || err) });
    }
  }

  return json(404, { error: "Not found", method, path });
};
