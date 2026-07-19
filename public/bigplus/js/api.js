const LOCAL_API_ROOT = "http://localhost:4100/api/bigplus";
const RENDER_API_ROOT = window.BIGPLUS_RENDER_API_ROOT || "https://bigplus-api.onrender.com/api/bigplus";

function resolveApiRoot() {
  const params = new URLSearchParams(window.location.search);
  const apiTarget = params.get("api") || window.BIGPLUS_API_TARGET;

  if (apiTarget === "local" || apiTarget === "render") {
    localStorage.setItem("bigplus_api_target", apiTarget);
  }

  const savedTarget = localStorage.getItem("bigplus_api_target");
  if (savedTarget === "local") return LOCAL_API_ROOT;
  if (savedTarget === "render") return RENDER_API_ROOT;

  const isLocalFrontend = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  return isLocalFrontend ? LOCAL_API_ROOT : RENDER_API_ROOT;
}

const API_ROOT = resolveApiRoot();

export const DEFAULT_REFERENCES = [
  { id: "can-330", name: "33 cl burk vanlig", sizeCm: 11.5, note: "Klassisk burk, ca 66 mm bred och 115 mm hög." },
  { id: "can-330-slim", name: "33 cl burk smal", sizeCm: 14.5, note: "Smal burk, ca 58 mm bred och 145 mm hög." },
  { id: "can-500", name: "50 cl burk", sizeCm: 16.8, note: "Vanlig hög burk, ungefärlig höjd." },
  { id: "glasses", name: "Glasögon", sizeCm: 13.5, note: "Ungefärlig total bredd över bågen. Justera vid ansiktet." },
  { id: "card", name: "Bankkort", sizeCm: 8.56, note: "Kortets långsida enligt ISO-format." },
  { id: "snus", name: "Snusdosa", sizeCm: 7.0, note: "Ungefärlig diameter." },
  { id: "custom", name: "Egen referens", sizeCm: null, note: "Ange verklig längd i centimeter." }
];

export const DEFAULT_SPECIES = [
  { id: "pike", name: "Gädda", minCm: 40, factor: 0.0000080 },
  { id: "perch", name: "Abborre", minCm: 20, factor: 0.0000155 },
  { id: "zander", name: "Gös", minCm: 45, factor: 0.0000092 },
  { id: "trout", name: "Öring", minCm: 35, factor: 0.0000105 },
  { id: "salmon", name: "Lax", minCm: 60, factor: 0.0000112 },
  { id: "char", name: "Röding", minCm: 35, factor: 0.0000100 },
  { id: "cod", name: "Torsk", minCm: 35, factor: 0.0000095 },
  { id: "other", name: "Annan art", minCm: 0, factor: 0.0000100 }
];

export function getApiMode() {
  const isLocal = API_ROOT === LOCAL_API_ROOT;
  return {
    mode: isLocal ? "dev" : "prod",
    label: isLocal ? "DEV" : "PROD",
    apiRoot: API_ROOT,
    target: isLocal ? "local" : "render"
  };
}

async function fetchJson(url, options = {}, fallbackMessage = "API-fel") {
  const { timeoutMs = 1200, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers: { "Content-Type": "application/json", ...(fetchOptions.headers || {}) },
      signal: fetchOptions.signal || controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallbackMessage);
  return data;
}

export function getReferences() {
  return fetchJson(`${API_ROOT}/references`, {}, "Kunde inte hämta referenser");
}

export function getSpecies() {
  return fetchJson(`${API_ROOT}/species`, {}, "Kunde inte hämta arter");
}

export function calculateMeasurement(payload) {
  return fetchJson(
    `${API_ROOT}/calculate`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    "Kunde inte räkna mätningen"
  );
}

function userQuery(userId) {
  const clean = String(userId || "").trim();
  return clean ? `?user=${encodeURIComponent(clean)}` : "";
}

export function getCatches(userId = "") {
  return fetchJson(`${API_ROOT}/catches${userQuery(userId)}`, {}, "Kunde inte hämta fångster");
}

export function saveCatch(payload) {
  return fetchJson(
    `${API_ROOT}/catches`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    "Kunde inte spara fångsten"
  );
}

function expectedBodyRatio(spec) {
  switch (spec.id) {
    case "perch":
      return 0.30;
    case "pike":
      return 0.16;
    case "zander":
      return 0.20;
    case "cod":
      return 0.24;
    default:
      return 0.22;
  }
}

function bodyConditionMultiplier(spec, lengthCm, bodyCm) {
  if (!Number.isFinite(bodyCm) || bodyCm <= 0 || !Number.isFinite(lengthCm) || lengthCm <= 0) return 1;
  const ratio = bodyCm / lengthCm;
  const expected = expectedBodyRatio(spec);
  return Math.min(1.45, Math.max(0.65, Math.pow(ratio / expected, 1.25)));
}

export function calculateMeasurementOffline(input, speciesList = DEFAULT_SPECIES) {
  const spec = speciesList.find((item) => item.id === input.speciesId) || DEFAULT_SPECIES[DEFAULT_SPECIES.length - 1];
  const refPixels = Number(input.refPixels);
  const fishPixels = Number(input.fishPixels);
  const bodyPixels = Number(input.bodyPixels);
  const refCm = Number(input.refCm);
  const calibrationFactor = Number.isFinite(Number(input.calibrationFactor))
    ? Math.min(1.2, Math.max(0.65, Number(input.calibrationFactor)))
    : 1;
  const minCm = Number.isFinite(Number(input.minCm)) ? Number(input.minCm) : spec.minCm;

  if (!Number.isFinite(refPixels) || !Number.isFinite(fishPixels) || !Number.isFinite(refCm)) {
    throw new Error("Mätvärden saknas");
  }

  if (refPixels <= 0 || fishPixels <= 0 || refCm <= 0) {
    throw new Error("Mätvärden måste vara större än noll");
  }

  const factor = spec.factor || 0.0000100;
  const lengthCm = (fishPixels / refPixels) * refCm * calibrationFactor;
  const bodyCm = Number.isFinite(bodyPixels) && bodyPixels > 0
    ? (bodyPixels / refPixels) * refCm * calibrationFactor
    : null;
  const condition = bodyConditionMultiplier(spec, lengthCm, bodyCm);
  const mid = factor * Math.pow(lengthCm, 3) * condition;

  return {
    species: spec.name,
    lengthCm,
    bodyCm,
    minCm,
    status: minCm <= 0 ? "KOLLA" : lengthCm >= minCm ? "BIGPLUS" : "SLÄPP",
    confidence: bodyCm ? "body" : "local",
    conditionMultiplier: condition,
    weightKg: {
      low: Math.max(0, mid * 0.82),
      mid: Math.max(0, mid),
      high: Math.max(0, mid * 1.18)
    },
    disclaimer: "Lokal beräkning. Kontrollera alltid lokala regler, fredningstider och undantag."
  };
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
    measurement: result || calculateMeasurementOffline(payload.measurement || payload)
  };
  catches.push(item);
  localStorage.setItem("bigplus_catches", JSON.stringify(catches.slice(-100)));
  return item;
}
