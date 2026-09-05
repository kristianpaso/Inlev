function headerValue(headers = {}, name) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1] || "";
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    body: JSON.stringify(payload)
  };
}

async function proxyMultipart(event, { serviceUrl, path, serviceName }) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (!serviceUrl) {
    return json(503, {
      ok: false,
      error: `${serviceName} är inte konfigurerad för Netlify. Ange ${serviceName === "SAM 2" ? "SAM2_SERVICE_URL" : "DEPTH_SERVICE_URL"}.`
    });
  }

  try {
    const baseUrl = serviceUrl.endsWith("/") ? serviceUrl : `${serviceUrl}/`;
    const upstreamUrl = new URL(path, baseUrl);
    if (event.rawQuery) upstreamUrl.search = event.rawQuery;
    const body = event.body
      ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
      : undefined;
    const response = await fetch(upstreamUrl, {
      method: event.httpMethod || "POST",
      headers: {
        "content-type": headerValue(event.headers, "content-type"),
        accept: "application/json"
      },
      body
    });
    const responseBody = Buffer.from(await response.arrayBuffer());
    return {
      statusCode: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
        "access-control-allow-origin": "*"
      },
      isBase64Encoded: true,
      body: responseBody.toString("base64")
    };
  } catch (error) {
    return json(502, { ok: false, error: `${serviceName}-tjänsten kunde inte nås: ${error.message}` });
  }
}

module.exports = { proxyMultipart };
