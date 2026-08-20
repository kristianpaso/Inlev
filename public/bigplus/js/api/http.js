export async function fetchJson(url, options = {}, fallbackMessage = "API-fel") {
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;

  try {
    response = await fetch(url, {
      ...fetchOptions,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(fetchOptions.headers || {}) },
      signal: fetchOptions.signal || controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Anslutningen tog för lång tid. Försök igen.");
    throw error;
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallbackMessage);
  return data;
}
