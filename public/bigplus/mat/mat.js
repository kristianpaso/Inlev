import { analyzeFishMeasurement } from "/bigplus/js/measurement-engine.js?v=20260904-mat-v2";
import { segmentFish } from "/bigplus/js/fish-segmentation.js?v=20260904-ai-proxy-v1";
import { buildDepthContext, requestDepthAnalysis } from "/bigplus/js/depth-estimator.js?v=20260904-ai-proxy-v1";
import { saveCatch } from "/bigplus/js/api/catches.js?v=20260903-mat-v1";
import { AUTH_API_ROOT } from "/bigplus/js/shell/api-root.js?v=20260903-mat-v1";

const canvas = document.querySelector("#matCanvas");
const context = canvas.getContext("2d");
const imageInput = document.querySelector("#matImageInput");
const cameraInput = document.querySelector("#matCameraInput");
const analyzeButton = document.querySelector("#matAnalyzeButton");
const changeButton = document.querySelector("#matChangeButton");
const resetButton = document.querySelector("#matResetButton");
const empty = document.querySelector("#matEmpty");
const startPanel = document.querySelector("#matStartPanel");
const manualButton = document.querySelector("#matManualButton");
const betaButton = document.querySelector("#matBetaButton");
const cameraButton = document.querySelector("#matCameraButton");
const backButton = document.querySelector("#matBackButton");
const status = document.querySelector("#matStatus");
const resultPanel = document.querySelector("#matResultPanel");
const resultClose = document.querySelector("#matResultClose");
const adjustButton = document.querySelector("#matAdjustButton");
const authStatus = document.querySelector("#matAuthStatus");
const speciesResult = document.querySelector("#matSpeciesResult");
const confidenceResult = document.querySelector("#matConfidenceResult");
const lengthResult = document.querySelector("#matLengthResult");
const heightResult = document.querySelector("#matHeightResult");
const rangeResult = document.querySelector("#matRangeResult");
const versionResult = document.querySelector("#matVersionResult");
const resultStatus = document.querySelector("#matResultStatus");
const perspectiveResult = document.querySelector("#matPerspectiveResult");
const checks = document.querySelector("#matResultChecks");
const saveButton = document.querySelector("#matSaveButton");
const saveStatus = document.querySelector("#matSaveStatus");
const zoomValue = document.querySelector("#matZoomValue");

const state = {
  image: null,
  imageDataUrl: "",
  points: [],
  segmentation: null,
  depth: null,
  result: null,
  account: null,
  dragging: -1,
  busy: false,
  saved: false,
  zoom: 1,
  autoAnalyze: true
};

function setStatus(message) { status.textContent = message; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function pointDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function formatCm(value) { return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} cm` : "-- cm"; }
function confidenceLabel(confidence) {
  const level = confidence?.level;
  const label = level === "very_high" ? "Mycket hög" : level === "high" ? "Hög" : level === "medium" ? "Medel" : "Låg";
  return `${label} ${Number(confidence?.score || 0)}/100`;
}

function draw() {
  if (!state.image) {
    canvas.width = 1;
    canvas.height = 1;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  startPanel.hidden = true;
  const stage = canvas.parentElement;
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  const imageRatio = state.image.naturalWidth / state.image.naturalHeight;
  const stageRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (imageRatio > stageRatio) drawHeight = width / imageRatio;
  else drawWidth = height * imageRatio;
  drawWidth *= state.zoom;
  drawHeight *= state.zoom;
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  context.fillStyle = "#081c25";
  context.fillRect(0, 0, width, height);
  context.drawImage(state.image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  if (state.points.length < 2) return;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  const toCanvas = (point) => ({ x: offsetX + point.x / state.image.naturalWidth * drawWidth, y: offsetY + point.y / state.image.naturalHeight * drawHeight });
  context.save();
  context.strokeStyle = "#55d7ff";
  context.lineWidth = Math.max(2.5, Math.min(width, height) / 250);
  context.lineJoin = "round";
  context.beginPath();
  state.points.forEach((point, index) => { const mapped = toCanvas(point); if (index) context.lineTo(mapped.x, mapped.y); else context.moveTo(mapped.x, mapped.y); });
  context.stroke();
  state.points.forEach((point, index) => {
    const mapped = toCanvas(point);
    context.fillStyle = "#f6fbfd";
    context.strokeStyle = "#079bd0";
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(mapped.x, mapped.y, Math.max(4, Math.min(width, height) / 105), 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (index === 0 || index === state.points.length - 1) {
      context.fillStyle = "#071d24";
      context.font = "700 12px system-ui";
      context.fillText(index === 0 ? "NOS" : "STJÄRT", mapped.x + 8, mapped.y - 8);
    }
  });
  context.restore();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const imageRatio = state.image.naturalWidth / state.image.naturalHeight;
  const stageRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (imageRatio > stageRatio) drawHeight = width / imageRatio;
  else drawWidth = height * imageRatio;
  drawWidth *= state.zoom;
  drawHeight *= state.zoom;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  return {
    x: clamp((event.clientX - rect.left - offsetX) / drawWidth * state.image.naturalWidth, 0, state.image.naturalWidth),
    y: clamp((event.clientY - rect.top - offsetY) / drawHeight * state.image.naturalHeight, 0, state.image.naturalHeight)
  };
}

function resetResult() {
  state.result = null;
  state.depth = null;
  state.saved = false;
  resultPanel.hidden = true;
  lengthResult.textContent = "-- cm";
  heightResult.textContent = "-- cm";
  rangeResult.textContent = "--";
  confidenceResult.textContent = "--";
  versionResult.textContent = "--";
  checks.replaceChildren();
  saveButton.disabled = true;
  saveStatus.textContent = "";
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error("Analysen tog för lång tid.")), timeoutMs))
  ]);
}

async function compressImage(file) {
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await loadImage(source);
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(image.naturalWidth * scale));
  output.height = Math.max(1, Math.round(image.naturalHeight * scale));
  output.getContext("2d").drawImage(image, 0, 0, output.width, output.height);
  const dataUrl = output.toDataURL("image/jpeg", .82);
  return { image: await loadImage(dataUrl), dataUrl };
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function loadFile(file) {
  const loaded = await compressImage(file);
  state.image = loaded.image;
  state.imageDataUrl = loaded.dataUrl;
  state.points = [];
  state.segmentation = null;
  state.zoom = 1;
  resetResult();
  analyzeButton.disabled = false;
  resetButton.disabled = false;
  draw();
  if (state.autoAnalyze) await analyzeImage();
  else setStatus("Bilden är laddad. Tryck på Mät fisken när du vill starta analysen.");
}

async function analyzeImage() {
  if (!state.image || state.busy) return;
  state.busy = true;
  analyzeButton.disabled = true;
  setStatus("Analyserar bilden med SAM 2...");
  try {
    const segmentation = await withTimeout(segmentFish(state.image), 60000).catch(() => null);
    state.segmentation = segmentation;
    const detected = segmentation?.fishLandmarks?.centerline || segmentation?.fishLandmarks?.points || [];
    if (segmentation?.modelBacked && segmentation?.maskAvailable && detected.length >= 2) {
      state.points = detected.map((point) => ({ x: Number(point.x), y: Number(point.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      setStatus("Fisk hittad. Kontrollera nos och stjärt.");
      draw();
      await calculate();
    } else {
      state.points = [];
      setStatus("SAM hittade inte fisken. Klicka på nosen och sedan på stjärten.");
      draw();
    }
  } catch (error) {
    setStatus(error.message || "Analysen misslyckades. Markera nos och stjärt.");
  } finally {
    state.busy = false;
    analyzeButton.disabled = !state.image;
  }
}

function renderResult(result) {
  const analysis = result.analysis || {};
  speciesResult.textContent = result.species || "Fisk";
  confidenceResult.textContent = confidenceLabel(result.confidence);
  lengthResult.textContent = formatCm(result.lengthCm);
  heightResult.textContent = result.bodyCm ? formatCm(result.bodyCm) : "-- cm";
  rangeResult.textContent = Number.isFinite(result.rangeMinCm) ? `${formatCm(result.rangeMinCm)}-${formatCm(result.rangeMaxCm)}` : "--";
  versionResult.textContent = result.measurementVersion || "V1 Beta";
  resultStatus.textContent = !analysis.fishLandmarksDetected
    ? "Flytta markörerna till fiskens nos och stjärt innan du sparar."
    : !analysis.fishSegmentationModelBacked
      ? "En preliminär lokal segmentering används. Kontrollera nos och stjärt innan du sparar."
      : result.status === "BIGPLUS" ? "Fångsten är godkänd." : "Kontrollera måttet innan du sparar.";
  perspectiveResult.textContent = analysis.depthUsed
    ? `Djupanalys korrigerade perspektivet (${Math.round((analysis.depthConfidence || 0) * 100)}/100).`
    : analysis.actualDepthModelAvailable ? "Djupanalys klar men gav ingen säker korrigering." : "Djupmodellen kunde inte användas i denna analys.";
  const checkItems = [
    [Boolean(analysis.fishLandmarksDetected), "Nos och stjärt är markerade"],
    [Boolean(analysis.fishSegmentationModelBacked), "Fisksegmentering med tränad modell"],
    [Boolean(analysis.depthUsed), analysis.actualDepthModelAvailable ? "Djupmodell användes" : "Djupmodell ej tillgänglig"]
  ];
  checks.replaceChildren(...checkItems.map(([complete, label]) => {
    const item = document.createElement("li");
    item.className = complete ? "is-complete" : "is-pending";
    item.textContent = `${complete ? "✓" : "!"} ${label}`;
    return item;
  }));
  resultPanel.hidden = false;
  saveButton.disabled = !state.account;
  authStatus.textContent = state.account ? `Inloggad som ${state.account.name || state.account.email || "medlem"}` : "Logga in på Bigplus för att spara fångsten på din profil.";
}

async function calculate() {
  if (!state.image || state.points.length < 2) {
    setStatus("Markera nos och stjärt.");
    return;
  }
  setStatus("Räknar längd...");
  try {
    const imageWidth = state.image.naturalWidth;
    const imageHeight = state.image.naturalHeight;
    if (state.segmentation?.modelBacked && state.segmentation?.maskAvailable) {
      state.depth = await requestDepthAnalysis({
        imageDataUrl: state.imageDataUrl,
        analysisId: `mat-${Date.now()}`,
        context: buildDepthContext({ segmentation: state.segmentation, fishPoints: state.points, width: imageWidth, height: imageHeight })
      }).catch(() => null);
    }
    state.result = analyzeFishMeasurement({
      fishPoints: state.points,
      referenceFreeMode: true,
      imageWidthPx: imageWidth,
      imageHeightPx: imageHeight,
      speciesId: "pike",
      speciesName: "Gädda",
      minCm: 0,
      fishVisibilityScore: state.segmentation?.modelBacked ? clamp(Number(state.segmentation.visiblePercentage) || .7, .4, .95) : .45,
      fishLandmarksDetected: state.points.length >= 2,
      fishSegmentationAvailable: Boolean(state.segmentation?.maskAvailable),
      fishSegmentationModelBacked: Boolean(state.segmentation?.modelBacked),
      depthModelAvailable: Boolean(state.depth?.ok),
      depthAnalysis: state.depth?.ok ? state.depth : null
    });
    state.saved = false;
    renderResult(state.result);
    setStatus("Mätning klar. Kontrollera markeringarna och spara.");
  } catch (error) {
    resetResult();
    setStatus(error.message || "Kunde inte räkna längden.");
  }
}

async function checkAuth() {
  try {
    const response = await fetch(`${AUTH_API_ROOT}/auth/me`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.user) throw new Error("Inte inloggad");
    state.account = data.user;
    authStatus.textContent = `Inloggad som ${data.user.name || data.user.email || "medlem"}`;
    if (state.result) saveButton.disabled = false;
  } catch {
    state.account = null;
    authStatus.textContent = "Logga in på Bigplus för att spara fångsten på din profil.";
    saveButton.disabled = true;
  }
}

async function saveMeasurement() {
  if (!state.result || !state.account || state.saved) return;
  saveButton.disabled = true;
  saveStatus.textContent = "Sparar...";
  try {
    const weight = Number(state.result.weightKg?.mid || 0);
    await saveCatch({
      manual: true,
      speciesId: "pike",
      species: state.result.species,
      lengthCm: state.result.lengthCm,
      weightKg: weight,
      photo: state.imageDataUrl,
      measurement: {
        species: state.result.species,
        speciesName: state.result.species,
        lengthCm: state.result.lengthCm,
        weightKg: weight,
        minCm: 0,
        status: state.result.status,
        confidence: "Mätfunktion",
        isBigplus: false
      }
    });
    state.saved = true;
    saveStatus.textContent = "Fångsten är sparad på din profil.";
    setStatus("Sparad");
  } catch (error) {
    saveButton.disabled = false;
    saveStatus.textContent = error.message || "Kunde inte spara fångsten.";
  }
}

imageInput.addEventListener("change", () => {
  const [file] = imageInput.files;
  if (file) void loadFile(file).catch(() => setStatus("Bilden kunde inte läsas."));
});
cameraInput.addEventListener("change", () => {
  const [file] = cameraInput.files;
  if (file) void loadFile(file).catch(() => setStatus("Bilden kunde inte läsas."));
});
analyzeButton.addEventListener("click", () => void analyzeImage());
resetButton.addEventListener("click", () => {
  state.image = null;
  state.imageDataUrl = "";
  state.points = [];
  imageInput.value = "";
  analyzeButton.disabled = true;
  resetButton.disabled = true;
  resetResult();
  startPanel.hidden = false;
  draw();
  setStatus("Ingen bild vald.");
});
resultClose.addEventListener("click", () => { resultPanel.hidden = true; });
adjustButton.addEventListener("click", () => { resultPanel.hidden = true; setStatus("Dra markeringarna till rätt nos och stjärt."); });
saveButton.addEventListener("click", () => void saveMeasurement());
manualButton.addEventListener("click", () => { state.autoAnalyze = false; imageInput.click(); });
betaButton.addEventListener("click", () => { state.autoAnalyze = true; imageInput.click(); });
cameraButton.addEventListener("click", () => { state.autoAnalyze = true; cameraInput.click(); });
changeButton.addEventListener("click", () => { state.autoAnalyze = true; imageInput.click(); });
backButton.addEventListener("click", () => {
  if (window.history.length > 1) window.history.back();
  else window.location.assign("/bigplus/");
});
document.querySelector("#matZoomOut").addEventListener("click", () => { state.zoom = clamp(state.zoom - .1, .7, 2); zoomValue.textContent = `${Math.round(state.zoom * 100)}%`; draw(); });
document.querySelector("#matZoomIn").addEventListener("click", () => { state.zoom = clamp(state.zoom + .1, .7, 2); zoomValue.textContent = `${Math.round(state.zoom * 100)}%`; draw(); });
document.querySelector("#matZoomReset").addEventListener("click", () => { state.zoom = 1; zoomValue.textContent = "100%"; draw(); });
canvas.addEventListener("pointerdown", (event) => {
  if (!state.image || state.busy) return;
  const point = canvasPoint(event);
  const nearest = state.points.reduce((best, candidate, index) => pointDistance(candidate, point) < pointDistance(state.points[best] || point, point) ? index : best, -1);
  if (nearest >= 0 && pointDistance(state.points[nearest], point) < state.image.naturalWidth * .05) {
    state.dragging = nearest;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (state.points.length < 2) {
    state.points.push(point);
    draw();
    if (state.points.length === 2) void calculate();
  }
});
canvas.addEventListener("pointermove", (event) => { if (state.dragging >= 0) { state.points[state.dragging] = canvasPoint(event); draw(); } });
canvas.addEventListener("pointerup", () => { if (state.dragging >= 0) { state.dragging = -1; if (state.points.length >= 2) void calculate(); } });
window.addEventListener("resize", draw);

draw();
void checkAuth();
