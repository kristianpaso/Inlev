import { API_ROOT, userQuery } from "./config.js";
import { fetchJson } from "./http.js";
import { calculateMeasurementOffline } from "./measurement.js";

export function getCatches(userId = "") {
  return fetchJson(`${API_ROOT}/catches${userQuery(userId)}`, {}, "Kunde inte hämta fångster");
}

export function saveCatch(payload) {
  return fetchJson(
    `${API_ROOT}/catches`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 60000
    },
    "Kunde inte spara fångsten"
  );
}

export function getLocalCatches(userId = "") {
  try {
    const catches = JSON.parse(localStorage.getItem("bigplus_catches") || "[]");
    const clean = String(userId || "").trim();
    return clean ? catches.filter((item) => item.userId === clean) : catches;
  } catch {
    return [];
  }
}

export function saveLocalCatch(payload, result) {
  const catches = getLocalCatches();
  const item = {
    id: `local-${Date.now()}`,
    createdAt: new Date().toISOString(),
    userId: String(payload.userId || "").slice(0, 80),
    note: String(payload.note || "").slice(0, 240),
    photo: typeof payload.photo === "string" ? payload.photo : "",
    location: payload.location && Number.isFinite(Number(payload.location.latitude)) && Number.isFinite(Number(payload.location.longitude))
      ? { latitude: Number(payload.location.latitude), longitude: Number(payload.location.longitude) }
      : null,
    competitionIds: Array.isArray(payload.competitionIds) ? payload.competitionIds.map((id) => String(id).slice(0, 100)).slice(0, 20) : [],
    measurement: result || calculateMeasurementOffline(payload.measurement || payload)
  };
  catches.push(item);

  const key = "bigplus_catches";
  const save = (items) => localStorage.setItem(key, JSON.stringify(items));
  try {
    save(catches.slice(-100));
  } catch (error) {
    // Photos are also stored in MongoDB. If localStorage is full, keep a
    // compact offline log without photo data so saving the catch still works.
    if (error?.name !== "QuotaExceededError" && error?.code !== 22) throw error;
    const compact = catches.slice(-100).map((entry) => ({ ...entry, photo: "" }));
    try {
      save(compact);
    } catch {
      save(compact.slice(-25));
    }
  }
  return item;
}
