const DEFAULT_ENDPOINT = ["127.0.0.1", "localhost"].includes(window.location.hostname)
  ? "http://127.0.0.1:8300/api/measurement/depth"
  : "/api/measurement/depth";
const cache = new Map();

function truthy(value) {
  return value === true || value === "1" || value === "true" || value === "on";
}

export function getDepthFeatureConfig() {
  const params = new URLSearchParams(window.location.search);
  const enabledValue = localStorage.getItem("bigplus_depth_enabled");
  const shadowValue = localStorage.getItem("bigplus_depth_shadow");
  const configuredEnabled = window.__BIGPLUS_CONFIG__?.fishMeasurementDepthEnabled;
  return {
    enabled: enabledValue === null
      ? (configuredEnabled === undefined ? !params.has("depth=off") : Boolean(configuredEnabled))
      : truthy(enabledValue),
    shadowMode: shadowValue === null ? truthy(params.get("depthShadow")) : truthy(shadowValue),
    endpoint: window.__BIGPLUS_CONFIG__?.depthEndpoint || DEFAULT_ENDPOINT,
    timeoutMs: 18000
  };
}

function normalizedPoint(point, width, height) {
  if (!point || !width || !height) return null;
  return { x: Math.max(0, Math.min(1, point.x / width)), y: Math.max(0, Math.min(1, point.y / height)) };
}

function normalizedBox(box, width, height) {
  if (!box || !width || !height) return null;
  return {
    x: box.x / width,
    y: box.y / height,
    width: box.width / width,
    height: box.height / height
  };
}

export function buildDepthContext({ segmentation, fishPoints = [], handGuides = [], faceBox = null, torsoBox = null, poseContext = null, width, height }) {
  const normalizedFishPoints = fishPoints.map((point) => normalizedPoint(point, width, height)).filter(Boolean);
  const segmentationPoints = segmentation?.outline?.map((point) => normalizedPoint(point, width, height)).filter(Boolean) || [];
  const fishPolygon = segmentationPoints.length >= 3 ? segmentationPoints : normalizedFishPoints;
  const hands = handGuides.slice(0, 2).map((hand) => {
    const grip = normalizedPoint(hand, width, height);
    if (!grip) return null;
    const box = normalizedBox({ x: hand.x - hand.width / 2, y: hand.y - hand.width / 2, width: hand.width, height: hand.width }, width, height);
    return { box, contact: grip, confidence: Number(hand.confidence) || 0.55 };
  }).filter(Boolean);
  return {
    fishPolygon,
    fishBoundingBox: normalizedBox(segmentation?.boundingBox, width, height),
    hands,
    nose: normalizedPoint(fishPoints[0], width, height),
    tail: normalizedPoint(fishPoints[fishPoints.length - 1], width, height),
    faceBox: faceBox ? normalizedBox(faceBox, width, height) : null,
    torsoBox: torsoBox ? normalizedBox(torsoBox, width, height) : null,
    pose: poseContext ? { available: Boolean(poseContext.available), confidence: Number(poseContext.confidence) || 0 } : null
  };
}

async function imageBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function timeoutPromise(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error("Depth timeout")), timeoutMs))
  ]);
}

export async function requestDepthAnalysis({ imageDataUrl, analysisId, context }) {
  const config = getDepthFeatureConfig();
  if (!config.enabled || !imageDataUrl) return null;
  const key = analysisId || imageDataUrl.slice(0, 80);
  if (cache.has(key)) return cache.get(key);
  const request = (async () => {
    try {
      const form = new FormData();
      form.append("file", await imageBlob(imageDataUrl), "fish.jpg");
      form.append("context", JSON.stringify(context || {}));
      const response = await timeoutPromise(fetch(config.endpoint, { method: "POST", body: form }), config.timeoutMs);
      if (!response.ok) throw new Error(`Depth HTTP ${response.status}`);
      const result = await response.json();
      if (!result?.ok) throw new Error(result?.error || "Depth model unavailable");
      return { ...result, analysisId: key, shadowMode: config.shadowMode };
    } catch (error) {
      console.info("BIGPLUS depth fallback:", error.message);
      return { ok: false, depthUsed: false, analysisId: key, error: error.message, shadowMode: config.shadowMode };
    }
  })();
  cache.set(key, request);
  const result = await request;
  cache.set(key, Promise.resolve(result));
  return result;
}

export function clearDepthCache(analysisId = "") {
  if (analysisId) cache.delete(analysisId);
  else cache.clear();
}
