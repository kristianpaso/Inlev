import {
  DEFAULT_REFERENCES,
  DEFAULT_SPECIES,
  calculateMeasurementOffline,
  calculateMeasurement,
  getApiMode,
  getCatches,
  getLocalCatches,
  getReferences,
  getSpecies,
  saveCatch,
  saveLocalCatch
} from "./api.js";

const state = {
  references: [],
  species: [],
  image: null,
  imageDataUrl: "",
  activeTool: "ref",
  points: {
    ref: [],
    fish: [],
    body: []
  },
  measurementLocks: {
    fish: false,
    body: false
  },
  virtualReference: {
    enabled: false,
    selected: false,
    dragging: false,
    pointerAction: "",
    suppressNextClick: false,
    x: 0,
    y: 0,
    height: 150,
    baseHeight: 150,
    rotationDeg: 0,
    dragOffsetX: 0,
    dragOffsetY: 0,
    startBaseHeight: 150,
    startAngleDeg: 0,
    autoPerspective: true,
    depthMode: "fish",
    showMarkers: false,
    calibrationFactor: 1,
    faceDepthOffset: 0.15,
    groundY: 0,
    lockedAnchorY: null,
    locked: false
  },
  referenceSlots: {
    active: "glasses",
    glasses: null,
    can: null
  },
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    moved: false,
    suppressNextClick: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0
  },
  pointDrag: {
    dragging: false,
    tool: "",
    index: -1,
    moved: false
  },
  faceDepthLine: {
    active: false,
    dragging: false,
    points: [],
    index: -1
  },
  glassesPlacement: {
    active: false
  },
  lastResult: null,
  lastPayload: null
};

const els = {
  connectionStatus: document.querySelector("#connectionStatus"),
  photoInput: document.querySelector("#photoInput"),
  referenceSelect: document.querySelector("#referenceSelect"),
  customReferenceWrap: document.querySelector("#customReferenceWrap"),
  customReference: document.querySelector("#customReference"),
  placeReferenceButton: document.querySelector("#placeReferenceButton"),
  placeGlassesReferenceButton: document.querySelector("#placeGlassesReferenceButton"),
  placeHandReferenceButton: document.querySelector("#placeHandReferenceButton"),
  referenceScaleRange: document.querySelector("#referenceScaleRange"),
  referenceRotationRange: document.querySelector("#referenceRotationRange"),
  calibrationRange: document.querySelector("#calibrationRange"),
  calibrationValue: document.querySelector("#calibrationValue"),
  autoPerspectiveToggle: document.querySelector("#autoPerspectiveToggle"),
  showReferenceMarkersToggle: document.querySelector("#showReferenceMarkersToggle"),
  depthModeSelect: document.querySelector("#depthModeSelect"),
  faceDepthWrap: document.querySelector("#faceDepthWrap"),
  faceDepthToolButton: document.querySelector("#faceDepthToolButton"),
  faceDepthResult: document.querySelector("#faceDepthResult"),
  newReferenceName: document.querySelector("#newReferenceName"),
  newReferenceSize: document.querySelector("#newReferenceSize"),
  addReferenceButton: document.querySelector("#addReferenceButton"),
  removeReferenceButton: document.querySelector("#removeReferenceButton"),
  speciesSelect: document.querySelector("#speciesSelect"),
  minSize: document.querySelector("#minSize"),
  refTool: document.querySelector("#refTool"),
  fishTool: document.querySelector("#fishTool"),
  bodyTool: document.querySelector("#bodyTool"),
  simpleCanButton: document.querySelector("#simpleCanButton"),
  simpleGlassesButton: document.querySelector("#simpleGlassesButton"),
  lockReferenceButton: document.querySelector("#lockReferenceButton"),
  checkPhoto: document.querySelector("#checkPhoto"),
  checkGlasses: document.querySelector("#checkGlasses"),
  checkLock: document.querySelector("#checkLock"),
  checkCan: document.querySelector("#checkCan"),
  checkLength: document.querySelector("#checkLength"),
  checkHeight: document.querySelector("#checkHeight"),
  checkResult: document.querySelector("#checkResult"),
  calculateButton: document.querySelector("#calculateButton"),
  resetButton: document.querySelector("#resetButton"),
  saveButton: document.querySelector("#saveButton"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  zoomResetButton: document.querySelector("#zoomResetButton"),
  zoomValue: document.querySelector("#zoomValue"),
  canvasWrap: document.querySelector(".canvas-wrap"),
  canvas: document.querySelector("#measureCanvas"),
  emptyState: document.querySelector("#emptyState"),
  referenceNameResult: document.querySelector("#referenceNameResult"),
  referenceSizeResult: document.querySelector("#referenceSizeResult"),
  referenceAngleResult: document.querySelector("#referenceAngleResult"),
  resultPanel: document.querySelector(".result-panel"),
  bigStatus: document.querySelector("#bigStatus"),
  lengthResult: document.querySelector("#lengthResult"),
  weightResult: document.querySelector("#weightResult"),
  bodyDepthResult: document.querySelector("#bodyDepthResult"),
  limitResult: document.querySelector("#limitResult"),
  confidenceResult: document.querySelector("#confidenceResult"),
  catchNote: document.querySelector("#catchNote"),
  disclaimer: document.querySelector("#disclaimer"),
  catchLog: document.querySelector("#catchLog")
};

const ctx = els.canvas.getContext("2d");
const canReferenceImage = new Image();
canReferenceImage.decoding = "async";
canReferenceImage.src = "/bigplus/assets/soda-can.svg";
canReferenceImage.addEventListener("load", draw);
const classicCanReferenceImage = new Image();
classicCanReferenceImage.decoding = "async";
classicCanReferenceImage.src = "/bigplus/assets/can-classic.png?v=20260719";
classicCanReferenceImage.addEventListener("load", draw);
const CLASSIC_CAN_IMAGE_BOUNDS = {
  x: 0,
  y: 0,
  width: 597,
  height: 1060
};
const glassesReferenceImage = new Image();
glassesReferenceImage.decoding = "async";
glassesReferenceImage.src = "/bigplus/assets/glasses-reference.png";
glassesReferenceImage.addEventListener("load", draw);

function setStatus(text) {
  els.connectionStatus.textContent = text;
}

function formatCm(value) {
  return `${value.toFixed(1)} cm`;
}

function formatKgRange(weight) {
  return `${weight.low.toFixed(1)}-${weight.high.toFixed(1)} kg`;
}

function setCalibrationPercent(percent) {
  const normalized = clamp(Number(percent) || 100, 70, 110);
  state.virtualReference.calibrationFactor = normalized / 100;
  els.calibrationRange.value = String(Math.round(normalized));
  els.calibrationValue.textContent = `${Math.round(normalized)}%`;
}

function getStoredReferences() {
  try {
    return JSON.parse(localStorage.getItem("bigplus_references") || "[]");
  } catch {
    return [];
  }
}

function storeReferences(references) {
  localStorage.setItem("bigplus_references", JSON.stringify(references));
}

function updateReferenceSpecificControls() {
  const glasses = isGlassesReference();
  els.faceDepthWrap.classList.toggle("hidden", !glasses);
  els.faceDepthToolButton.classList.toggle("active", glasses && state.faceDepthLine.active);
  updateFaceDepthResult();
  if (glasses) {
    setCalibrationPercent(100);
  }
}

function renderReferenceOptions() {
  els.referenceSelect.innerHTML = state.references
    .map((item) => `<option value="${item.id}">${item.name}${item.sizeCm ? ` (${item.sizeCm} cm)` : ""}</option>`)
    .join("");
  updateSimpleReferenceButtons();
}

function renderSpeciesOptions() {
  els.speciesSelect.innerHTML = state.species
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join("");
}

function getSelectedReferenceCm() {
  const selected = state.references.find((item) => item.id === els.referenceSelect.value);
  return selected?.sizeCm || Number(els.customReference.value);
}

function getReferenceCmById(referenceId) {
  const selected = state.references.find((item) => item.id === referenceId);
  return selected?.sizeCm || Number(els.customReference.value);
}

function distance(points) {
  if (points.length < 2) return 0;
  const [a, b] = points;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCanvasScreenPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  const scaleX = els.canvas.width / rect.width;
  const scaleY = els.canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function screenToWorld(point) {
  return {
    x: (point.x - state.view.panX) / state.view.zoom,
    y: (point.y - state.view.panY) / state.view.zoom
  };
}

function getCanvasPoint(event) {
  return screenToWorld(getCanvasScreenPoint(event));
}

function updateZoomUi() {
  els.zoomValue.textContent = `${Math.round(state.view.zoom * 100)}%`;
}

function canvasCenterPoint() {
  return {
    x: els.canvas.width / 2,
    y: els.canvas.height / 2
  };
}

function setZoom(nextZoom, anchor = canvasCenterPoint()) {
  if (!state.image) return;
  const oldZoom = state.view.zoom;
  const zoom = clamp(nextZoom, 1, 4);
  const worldX = (anchor.x - state.view.panX) / oldZoom;
  const worldY = (anchor.y - state.view.panY) / oldZoom;
  state.view.zoom = zoom;
  state.view.panX = anchor.x - worldX * zoom;
  state.view.panY = anchor.y - worldY * zoom;
  if (zoom === 1) {
    state.view.panX = 0;
    state.view.panY = 0;
  }
  updateZoomUi();
  draw();
}

function resetZoom() {
  state.view.zoom = 1;
  state.view.panX = 0;
  state.view.panY = 0;
  state.view.dragging = false;
  state.view.moved = false;
  state.view.suppressNextClick = false;
  updateZoomUi();
}

function selectedReferenceName() {
  const selected = state.references.find((item) => item.id === els.referenceSelect.value);
  return selected?.name || "Referens";
}

function isGlassesReference() {
  return els.referenceSelect.value === "glasses";
}

function referenceSlotNameForId(referenceId = els.referenceSelect.value) {
  if (referenceId === "glasses") return "glasses";
  if (referenceId === "can-330") return "can";
  return "";
}

function clonePoints(points) {
  return points.map((point) => ({ x: point.x, y: point.y }));
}

function updateSimpleReferenceButtons() {
  const glassesReady = Boolean(state.referenceSlots.glasses) || state.referenceSlots.active === "glasses";
  const canReady = Boolean(state.referenceSlots.can) || state.referenceSlots.active === "can";
  els.simpleGlassesButton?.classList.toggle("active", glassesReady);
  els.simpleCanButton?.classList.toggle("active", canReady);
  if (els.simpleGlassesButton) {
    els.simpleGlassesButton.textContent = state.referenceSlots.glasses ? "Glasögon klar" : "1 Glasögon";
  }
  if (els.simpleCanButton) {
    els.simpleCanButton.textContent = state.referenceSlots.can ? "Burk klar" : "+ Burk";
  }
}

function updateReferenceLockButton() {
  if (!els.lockReferenceButton) return;
  const canLock = Boolean(state.image && state.virtualReference.enabled);
  els.lockReferenceButton.disabled = !canLock;
  els.lockReferenceButton.classList.toggle("active", Boolean(state.virtualReference.locked));
  els.lockReferenceButton.textContent = state.virtualReference.locked ? "Lås upp" : "Lås referens";
}

function updateChecklist() {
  const items = [
    [els.checkPhoto, Boolean(state.image)],
    [els.checkGlasses, Boolean(state.referenceSlots.glasses)],
    [els.checkLock, Boolean(state.referenceSlots.glasses?.virtual?.locked || state.referenceSlots.can?.virtual?.locked || state.virtualReference.locked)],
    [els.checkCan, Boolean(state.referenceSlots.can)],
    [els.checkLength, state.points.fish.length === 2],
    [els.checkHeight, state.points.body.length === 2],
    [els.checkResult, state.lastResult?.status === "BIGPLUS"]
  ];
  const firstOpen = items.find(([element, done]) => element && !done && !element.classList.contains("optional"))?.[0] || null;

  for (const [element, done] of items) {
    if (!element) continue;
    element.classList.toggle("is-done", done);
    element.classList.toggle("is-active", element === firstOpen);
  }
  els.checkLength?.classList.toggle("is-locked", state.measurementLocks.fish);
  els.checkHeight?.classList.toggle("is-locked", state.measurementLocks.body);
}

function lockMeasurement(tool) {
  if ((tool !== "fish" && tool !== "body") || state.points[tool].length < 2) return;
  state.measurementLocks[tool] = true;
  updateChecklist();
}

function unlockMeasurement(tool) {
  if (tool !== "fish" && tool !== "body") return;
  state.measurementLocks[tool] = false;
  state.points[tool] = [];
  state.lastResult = null;
  state.lastPayload = null;
  els.saveButton.disabled = true;
  setTool(tool);
  renderResult(null);
  setStatus(tool === "fish" ? "Markera längd" : "Markera höjd");
  draw();
}

function effectiveCalibrationFactor() {
  const base = state.virtualReference.calibrationFactor;
  if (!isGlassesReference()) return base;
  return base * (1 - state.virtualReference.faceDepthOffset);
}

function faceDepthDistanceCm() {
  if (!isGlassesReference() || state.faceDepthLine.points.length < 2 || state.points.ref.length < 2) return null;
  const refPixels = distance(state.points.ref);
  if (!refPixels) return null;
  return (distance(state.faceDepthLine.points) / refPixels) * getSelectedReferenceCm();
}

function selectedFaceDepthOffset() {
  const depthCm = faceDepthDistanceCm();
  if (depthCm === null) return 0.15;
  return clamp(depthCm / 100, 0, 0.35);
}

function selectedFaceDepthLabel() {
  const depthCm = faceDepthDistanceCm();
  return depthCm === null
    ? "dra linje"
    : `${depthCm.toFixed(0)} cm framför`;
}

function updateFaceDepthResult() {
  if (!els.faceDepthResult) return;
  const depthCm = faceDepthDistanceCm();
  els.faceDepthResult.textContent = depthCm === null
    ? "Dra en linje från glasögon till fisk."
    : `Fisk cirka ${depthCm.toFixed(0)} cm framför kroppen.`;
}

function currentVirtualReferenceSnapshot() {
  return {
    enabled: state.virtualReference.enabled,
    x: state.virtualReference.x,
    y: state.virtualReference.y,
    height: state.virtualReference.height,
    baseHeight: state.virtualReference.baseHeight,
    rotationDeg: state.virtualReference.rotationDeg,
    autoPerspective: state.virtualReference.autoPerspective,
    depthMode: state.virtualReference.depthMode,
    showMarkers: false,
    calibrationFactor: state.virtualReference.calibrationFactor,
    faceDepthOffset: state.virtualReference.faceDepthOffset,
    groundY: state.virtualReference.groundY,
    lockedAnchorY: state.virtualReference.lockedAnchorY,
    locked: state.virtualReference.locked
  };
}

function syncActiveReferenceSlot() {
  const slotName = referenceSlotNameForId();
  if (!slotName || !state.virtualReference.enabled || state.points.ref.length < 2) return;
  state.referenceSlots.active = slotName;
  state.referenceSlots[slotName] = {
    referenceId: els.referenceSelect.value,
    refCm: getSelectedReferenceCm(),
    points: clonePoints(state.points.ref),
    virtual: currentVirtualReferenceSnapshot()
  };
  updateSimpleReferenceButtons();
}

function loadReferenceSlot(slotName, selected = true) {
  const slot = state.referenceSlots[slotName];
  if (!slot) return false;
  state.referenceSlots.active = slotName;
  els.referenceSelect.value = slot.referenceId;
  state.virtualReference = {
    ...state.virtualReference,
    ...slot.virtual,
    enabled: true,
    selected: selected && !slot.virtual?.locked,
    dragging: false,
    pointerAction: "",
    suppressNextClick: false
  };
  state.points.ref = clonePoints(slot.points);
  els.referenceScaleRange.value = String(Math.round(state.virtualReference.baseHeight));
  els.referenceRotationRange.value = String(state.virtualReference.rotationDeg || 0);
  els.calibrationRange.value = String(Math.round((state.virtualReference.calibrationFactor || 1) * 100));
  els.calibrationValue.textContent = `${Math.round((state.virtualReference.calibrationFactor || 1) * 100)}%`;
  updateReferenceSpecificControls();
  updateSimpleReferenceButtons();
  updateReferenceLockButton();
  draw();
  return true;
}

function slotCalibrationFactor(slot) {
  if (!slot) return 1;
  const base = slot.virtual?.calibrationFactor || 1;
  return slot.referenceId === "glasses"
    ? base * (1 - (slot.virtual?.faceDepthOffset || 0))
    : base;
}

function referenceScalesForCalculation() {
  syncActiveReferenceSlot();
  const slots = [state.referenceSlots.glasses, state.referenceSlots.can].filter(Boolean);
  const scales = slots
    .filter((slot) => slot.points?.length === 2 && distance(slot.points) > 0)
    .map((slot) => ({
      referenceId: slot.referenceId,
      scaleCmPerPixel: (slot.refCm * slotCalibrationFactor(slot)) / distance(slot.points)
    }));

  if (scales.length) return scales;
  if (state.points.ref.length === 2 && distance(state.points.ref) > 0) {
    return [{
      referenceId: els.referenceSelect.value,
      scaleCmPerPixel: (getSelectedReferenceCm() * effectiveCalibrationFactor()) / distance(state.points.ref)
    }];
  }
  return [];
}

function combinedReferenceScaleCmPerPixel() {
  const scales = referenceScalesForCalculation();
  if (!scales.length) return null;
  return scales.reduce((sum, item) => sum + item.scaleCmPerPixel, 0) / scales.length;
}

function selectedReferenceWidthRatio() {
  if (isGlassesReference()) return 1;
  if (els.referenceSelect.value === "can-330") return 0.57;
  if (els.referenceSelect.value === "can-330-slim") return 0.4;
  if (els.referenceSelect.value === "can-500") return 0.39;
  return 0.42;
}

function referenceVisualHeight(measureLength) {
  return isGlassesReference() ? measureLength * 0.36 : measureLength;
}

function selectedCanReferenceImage() {
  return els.referenceSelect.value === "can-330"
    ? classicCanReferenceImage
    : canReferenceImage;
}

function renderReferenceReadout() {
  if (!state.virtualReference.enabled) {
    els.referenceNameResult.textContent = "Ingen placerad";
    els.referenceSizeResult.textContent = "Välj och placera ett föremål.";
    els.referenceAngleResult.textContent = "Vinkel 0°";
    return;
  }

  const refCm = getSelectedReferenceCm();
  let scale = state.virtualReference.autoPerspective
    ? ` · ${Math.round(perspectiveScaleForY(state.virtualReference.groundY) * 100)}% perspektiv`
    : "";
  const anchorY = getPerspectiveAnchorY();
  scale = state.virtualReference.autoPerspective && anchorY !== null && state.virtualReference.depthMode !== "manual"
    ? ` · ${Math.round(perspectiveScaleForY(anchorY) * 100)}% ${perspectiveModeLabel()}`
    : ` · ${perspectiveModeLabel()}`;
  els.referenceNameResult.textContent = selectedReferenceName();
  els.referenceSizeResult.textContent = `${refCm} cm${scale} · skala ${Math.round(state.virtualReference.calibrationFactor * 100)}%`;
  els.referenceAngleResult.textContent = `Vinkel ${state.virtualReference.rotationDeg}°`;
}

function enhanceReferenceReadout() {
  if (!state.virtualReference.enabled) return;
  const effective = `skala ${Math.round(effectiveCalibrationFactor() * 100)}%`;
  els.referenceSizeResult.textContent = els.referenceSizeResult.textContent.replace(
    /skala\s+\d+%/,
    effective
  );
  if (isGlassesReference() && !els.referenceSizeResult.textContent.includes("fisk:")) {
    els.referenceSizeResult.textContent += ` · fisk: ${selectedFaceDepthLabel().toLowerCase()}`;
  }
}

function fishDepthY() {
  if (state.points.fish.length === 2) {
    return (state.points.fish[0].y + state.points.fish[1].y) / 2;
  }
  if (state.points.fish.length === 1) {
    return state.points.fish[0].y;
  }
  return null;
}

function fishGuide() {
  if (state.points.fish.length < 2) return null;
  const [a, b] = state.points.fish;
  const head = a.x <= b.x ? a : b;
  const tail = a.x <= b.x ? b : a;
  return {
    head,
    tail,
    centerX: (a.x + b.x) / 2,
    centerY: (a.y + b.y) / 2,
    angleDeg: Math.atan2(tail.y - head.y, tail.x - head.x) * 180 / Math.PI
  };
}

function getPerspectiveAnchorY() {
  if (!state.virtualReference.autoPerspective || state.virtualReference.depthMode === "manual") return null;
  if (Number.isFinite(state.virtualReference.lockedAnchorY)) {
    return state.virtualReference.lockedAnchorY;
  }
  if (state.virtualReference.depthMode === "fish") {
    return fishDepthY() ?? state.virtualReference.groundY;
  }
  return state.virtualReference.groundY;
}

function perspectiveModeLabel() {
  if (!state.virtualReference.autoPerspective || state.virtualReference.depthMode === "manual") return "manuell storlek";
  if (Number.isFinite(state.virtualReference.lockedAnchorY)) return "låst avstånd";
  if (state.virtualReference.depthMode === "fish") {
    return fishDepthY() === null ? "bildhöjd tills fisken markeras" : "fiskavstånd";
  }
  return "bildhöjd";
}

function perspectiveScaleForY(y) {
  const horizonY = els.canvas.height * 0.18;
  const nearY = els.canvas.height * 0.9;
  const t = Math.min(1.25, Math.max(0.28, (y - horizonY) / Math.max(1, nearY - horizonY)));
  return t;
}

function updateVirtualReferenceHeightFromPerspective() {
  if (!state.virtualReference.autoPerspective) return;
  const groundY = state.virtualReference.groundY || state.virtualReference.y + state.virtualReference.height;
  const anchorY = getPerspectiveAnchorY();
  state.virtualReference.height = anchorY === null
    ? state.virtualReference.baseHeight
    : Math.max(42, state.virtualReference.baseHeight * perspectiveScaleForY(anchorY));
  state.virtualReference.y = groundY - referenceVisualHeight(state.virtualReference.height);
}

function virtualReferenceRect() {
  updateVirtualReferenceHeightFromPerspective();
  const measureLength = state.virtualReference.height;
  const width = measureLength * selectedReferenceWidthRatio();
  const height = referenceVisualHeight(measureLength);
  return {
    x: state.virtualReference.x,
    y: state.virtualReference.y,
    width,
    height,
    measureLength
  };
}

function virtualReferenceGeometry() {
  const rect = virtualReferenceRect();
  const angle = (state.virtualReference.rotationDeg * Math.PI) / 180;
  return {
    ...rect,
    angle,
    centerX: rect.x + rect.width / 2,
    centerY: rect.y + rect.height / 2
  };
}

function rotateLocalPoint(centerX, centerY, x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: centerX + x * cos - y * sin,
    y: centerY + x * sin + y * cos
  };
}

function updateVirtualReferencePoints() {
  if (!state.virtualReference.enabled) return;
  const rect = virtualReferenceGeometry();
  if (isGlassesReference()) {
    state.points.ref = [
      rotateLocalPoint(rect.centerX, rect.centerY, -rect.width / 2, 0, rect.angle),
      rotateLocalPoint(rect.centerX, rect.centerY, rect.width / 2, 0, rect.angle)
    ];
  } else {
    state.points.ref = [
      rotateLocalPoint(rect.centerX, rect.centerY, 0, -rect.height / 2, rect.angle),
      rotateLocalPoint(rect.centerX, rect.centerY, 0, rect.height / 2, rect.angle)
    ];
  }
}

function isInsideVirtualReference(point) {
  if (!state.virtualReference.enabled) return false;
  const rect = virtualReferenceGeometry();
  const dx = point.x - rect.centerX;
  const dy = point.y - rect.centerY;
  const cos = Math.cos(rect.angle);
  const sin = Math.sin(rect.angle);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  return Math.abs(localX) <= rect.width / 2 + 10 && Math.abs(localY) <= rect.height / 2 + 10;
}

function virtualReferenceHandles() {
  const rect = virtualReferenceGeometry();
  return {
    rotate: rotateLocalPoint(rect.centerX, rect.centerY, 0, -rect.height / 2 - 34, rect.angle),
    scale: rotateLocalPoint(rect.centerX, rect.centerY, rect.width / 2 + 16, rect.height / 2 + 16, rect.angle)
  };
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nextToolAfterComplete(tool) {
  if (tool === "ref") return "fish";
  if (tool === "fish") return "body";
  return "body";
}

function hitMeasurementPoint(point) {
  const hitRadius = 18 / state.view.zoom;
  const tools = [state.activeTool, "fish", "body", "ref"].filter((tool, index, all) => all.indexOf(tool) === index);

  for (const tool of tools) {
    if (tool === "ref" && state.virtualReference.enabled) continue;
    if ((tool === "fish" || tool === "body") && state.measurementLocks[tool]) continue;
    const points = state.points[tool];
    for (let index = 0; index < points.length; index += 1) {
      if (pointDistance(point, points[index]) <= hitRadius) {
        return { tool, index };
      }
    }
  }

  return null;
}

function hitFaceDepthPoint(point) {
  if (!isGlassesReference() || !state.faceDepthLine.points.length) return -1;
  const hitRadius = 18 / state.view.zoom;
  for (let index = 0; index < state.faceDepthLine.points.length; index += 1) {
    if (pointDistance(point, state.faceDepthLine.points[index]) <= hitRadius) return index;
  }
  return -1;
}

function hitVirtualReferenceControl(point) {
  if (!state.virtualReference.enabled) return "";
  if (!state.virtualReference.selected) return "";
  if (state.virtualReference.locked) return "";
  const handles = virtualReferenceHandles();
  if (pointDistance(point, handles.rotate) <= 20) return "rotate";
  if (pointDistance(point, handles.scale) <= 20) return "scale";
  if (isInsideVirtualReference(point)) return "move";
  return "";
}

function angleFromCenter(point) {
  const rect = virtualReferenceGeometry();
  return Math.atan2(point.y - rect.centerY, point.x - rect.centerX) * 180 / Math.PI + 90;
}

function normalizeAngle(degrees) {
  let angle = degrees;
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return Math.round(angle);
}

function localReferencePoint(point, rect = virtualReferenceGeometry()) {
  const dx = point.x - rect.centerX;
  const dy = point.y - rect.centerY;
  const cos = Math.cos(rect.angle);
  const sin = Math.sin(rect.angle);
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos
  };
}

function resizeCanvasToDisplay() {
  const rect = els.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width * ratio));
  const height = Math.max(420, Math.floor(rect.height * ratio));
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
}

function getImageFrame() {
  if (!state.image) {
    return {
      offsetX: 0,
      offsetY: 0,
      drawWidth: els.canvas.width,
      drawHeight: els.canvas.height
    };
  }

  const canvasRatio = els.canvas.width / els.canvas.height;
  const imageRatio = state.image.width / state.image.height;
  let drawWidth = els.canvas.width;
  let drawHeight = els.canvas.height;
  let offsetX = 0;
  let offsetY = 0;

  if (imageRatio > canvasRatio) {
    drawHeight = els.canvas.width / imageRatio;
    offsetY = (els.canvas.height - drawHeight) / 2;
  } else {
    drawWidth = els.canvas.height * imageRatio;
    offsetX = (els.canvas.width - drawWidth) / 2;
  }

  return { offsetX, offsetY, drawWidth, drawHeight };
}

async function detectFaceInImageFrame() {
  if (!state.image || !("FaceDetector" in window)) return null;

  let bitmap = null;
  try {
    const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
    const detectorInput = "createImageBitmap" in window
      ? await createImageBitmap(state.image)
      : state.image;
    if (detectorInput !== state.image) bitmap = detectorInput;
    const faces = await detector.detect(detectorInput);
    if (!faces.length) return null;

    const face = faces
      .map((item) => item.boundingBox)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
    const frame = getImageFrame();

    return {
      x: frame.offsetX + (face.x / state.image.width) * frame.drawWidth,
      y: frame.offsetY + (face.y / state.image.height) * frame.drawHeight,
      width: (face.width / state.image.width) * frame.drawWidth,
      height: (face.height / state.image.height) * frame.drawHeight
    };
  } catch {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

function drawLine(points, color, label) {
  if (!points.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();

    if (label) {
      const midX = (points[0].x + points[1].x) / 2;
      const midY = (points[0].y + points[1].y) / 2;
      ctx.font = "700 18px system-ui, sans-serif";
      ctx.fillText(label, midX + 10, midY - 10);
    }
  }

  ctx.restore();
}

function drawArrowHead(point, angle, color) {
  const size = 13;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.48);
  ctx.lineTo(-size, size * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMeasurementArrowLine(points, color, label) {
  if (!points.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    const point = points[0];
    ctx.beginPath();
    ctx.moveTo(point.x - 8, point.y);
    ctx.lineTo(point.x + 8, point.y);
    ctx.moveTo(point.x, point.y - 8);
    ctx.lineTo(point.x, point.y + 8);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const [start, end] = points;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  drawArrowHead(end, angle, color);
  drawArrowHead(start, angle + Math.PI, color);

  if (label) {
    const midX = (start.x + end.x) / 2;
    ctx.font = "800 16px system-ui, sans-serif";
    const paddingX = 8;
    const width = ctx.measureText(label).width + paddingX * 2;
    const height = 26;
    const isHeightLabel = label === "höjd";
    const labelY = isHeightLabel
      ? Math.min(start.y, end.y) - height - 14
      : Math.max(start.y, end.y) + 14;
    const boxX = clamp(midX - width / 2, 6, els.canvas.width - width - 6);
    const boxY = clamp(labelY, 6, els.canvas.height - height - 6);
    const textX = boxX + width / 2;
    const textY = boxY + height / 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, width, height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, textX, textY);
  }

  ctx.restore();
}

function drawFaceDepthLine() {
  if (!isGlassesReference() || !state.faceDepthLine.points.length) return;

  const points = state.faceDepthLine.points;
  ctx.save();
  ctx.strokeStyle = "#b83280";
  ctx.fillStyle = "#b83280";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";

  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();

    const depthCm = faceDepthDistanceCm();
    const midX = (points[0].x + points[1].x) / 2;
    const midY = (points[0].y + points[1].y) / 2;
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.fillText(depthCm === null ? "avstånd" : `${depthCm.toFixed(0)} cm`, midX + 10, midY - 10);
  }

  ctx.restore();
}

function drawGlassesReferenceAsset(x, y, rect) {
  if (!glassesReferenceImage.complete || glassesReferenceImage.naturalWidth <= 0) return false;

  ctx.save();
  ctx.translate(rect.centerX, rect.centerY);
  ctx.rotate(rect.angle);
  ctx.shadowColor = "rgba(255, 255, 255, 0.65)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 0;
  ctx.drawImage(glassesReferenceImage, x, y, rect.width, rect.height);
  ctx.restore();
  return true;
}

function drawCanReferenceAsset(x, y, rect, radius) {
  ctx.save();
  ctx.translate(rect.centerX, rect.centerY);
  ctx.rotate(rect.angle);
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;

  const canImage = selectedCanReferenceImage();
  if (canImage.complete && canImage.naturalWidth > 0) {
    if (canImage === classicCanReferenceImage) {
      ctx.drawImage(
        canImage,
        CLASSIC_CAN_IMAGE_BOUNDS.x,
        CLASSIC_CAN_IMAGE_BOUNDS.y,
        CLASSIC_CAN_IMAGE_BOUNDS.width,
        CLASSIC_CAN_IMAGE_BOUNDS.height,
        x,
        y,
        rect.width,
        rect.height
      );
    } else {
      ctx.drawImage(canImage, x, y, rect.width, rect.height);
    }
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + rect.width, y);
    gradient.addColorStop(0, "#941b20");
    gradient.addColorStop(0.22, "#de3440");
    gradient.addColorStop(0.55, "#f36b6d");
    gradient.addColorStop(0.82, "#c9202c");
    gradient.addColorStop(1, "#7a161b");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y + radius * 0.26, rect.width, rect.height - radius * 0.52, radius * 0.25);
    ctx.fill();

    ctx.fillStyle = "#f4f6f5";
    ctx.beginPath();
    ctx.ellipse(0, y + radius * 0.28, radius, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d9dfdc";
    ctx.beginPath();
    ctx.ellipse(0, y + rect.height - radius * 0.28, radius, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawVirtualReference() {
  if (!state.virtualReference.enabled) return;

  const rect = virtualReferenceGeometry();
  const radius = rect.width / 2;
  const x = -rect.width / 2;
  const y = -rect.height / 2;

  if (isGlassesReference()) {
    if (!drawGlassesReferenceAsset(x, y, rect)) {
      ctx.save();
      ctx.translate(rect.centerX, rect.centerY);
      ctx.rotate(rect.angle);
      ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 8;
      ctx.strokeStyle = "#17201b";
      ctx.lineWidth = Math.max(4, rect.height * 0.12);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.roundRect(x, y, rect.width * 0.43, rect.height, rect.height * 0.35);
      ctx.roundRect(x + rect.width * 0.57, y, rect.width * 0.43, rect.height, rect.height * 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + rect.width * 0.43, 0);
      ctx.quadraticCurveTo(0, -rect.height * 0.28, x + rect.width * 0.57, 0);
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#24a0c8";
      ctx.fillRect(x + rect.width * 0.04, y + rect.height * 0.12, rect.width * 0.35, rect.height * 0.76);
      ctx.fillRect(x + rect.width * 0.61, y + rect.height * 0.12, rect.width * 0.35, rect.height * 0.76);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  } else {
    drawCanReferenceAsset(x, y, rect, radius);
  }

  if (!state.virtualReference.selected || state.virtualReference.locked) return;

  const handles = virtualReferenceHandles();
  const topPoint = state.points.ref[0];
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#24a0c8";
  ctx.fillStyle = "#ffffff";
  if (topPoint) {
    ctx.beginPath();
    ctx.moveTo(topPoint.x, topPoint.y);
    ctx.lineTo(handles.rotate.x, handles.rotate.y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(handles.rotate.x, handles.rotate.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#17201b";
  ctx.font = "900 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("R", handles.rotate.x, handles.rotate.y + 1);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#17201b";
  ctx.beginPath();
  ctx.rect(handles.scale.x - 11, handles.scale.y - 11, 22, 22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#17201b";
  ctx.fillText("S", handles.scale.x, handles.scale.y + 1);
  ctx.restore();
}

function drawReferenceSlot(slotName) {
  const slot = state.referenceSlots[slotName];
  if (!slot) return;
  if (state.referenceSlots.active === slotName && state.virtualReference.enabled) return;

  const savedReferenceId = els.referenceSelect.value;
  const savedVirtualReference = { ...state.virtualReference };
  const savedPoints = clonePoints(state.points.ref);

  els.referenceSelect.value = slot.referenceId;
  state.virtualReference = {
    ...state.virtualReference,
    ...slot.virtual,
    enabled: true,
    selected: false,
    dragging: false,
    pointerAction: "",
    showMarkers: false
  };
  state.points.ref = clonePoints(slot.points);
  drawVirtualReference();

  els.referenceSelect.value = savedReferenceId;
  state.virtualReference = savedVirtualReference;
  state.points.ref = savedPoints;
}

function draw() {
  resizeCanvasToDisplay();
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  updateReferenceLockButton();
  updateChecklist();

  if (!state.image) return;

  ctx.save();
  ctx.translate(state.view.panX, state.view.panY);
  ctx.scale(state.view.zoom, state.view.zoom);

  const { offsetX, offsetY, drawWidth, drawHeight } = getImageFrame();

  ctx.drawImage(state.image, offsetX, offsetY, drawWidth, drawHeight);
  updateVirtualReferencePoints();
  state.virtualReference.faceDepthOffset = selectedFaceDepthOffset();
  syncActiveReferenceSlot();
  updateFaceDepthResult();
  renderReferenceReadout();
  enhanceReferenceReadout();
  drawReferenceSlot("glasses");
  drawReferenceSlot("can");
  drawVirtualReference();
  drawFaceDepthLine();
  if (!state.virtualReference.enabled) {
    drawLine(state.points.ref, "#f0b429", state.virtualReference.enabled ? "" : "referens");
  }
  drawMeasurementArrowLine(state.points.fish, "#24a0c8", "längd");
  drawMeasurementArrowLine(state.points.body, "#d97706", "höjd");
  updateChecklist();
  ctx.restore();
}

function setTool(tool) {
  state.activeTool = tool;
  els.refTool.classList.toggle("active", tool === "ref");
  els.fishTool.classList.toggle("active", tool === "fish");
  els.bodyTool.classList.toggle("active", tool === "body");
}

function resetPoints() {
  state.virtualReference.enabled = false;
  state.virtualReference.selected = false;
  state.virtualReference.dragging = false;
  state.virtualReference.pointerAction = "";
  state.virtualReference.suppressNextClick = false;
  state.virtualReference.lockedAnchorY = null;
  state.virtualReference.locked = false;
  state.pointDrag.dragging = false;
  state.pointDrag.tool = "";
  state.pointDrag.index = -1;
  state.pointDrag.moved = false;
  state.faceDepthLine.active = false;
  state.faceDepthLine.dragging = false;
  state.faceDepthLine.points = [];
  state.faceDepthLine.index = -1;
  state.glassesPlacement.active = false;
  state.referenceSlots.active = "glasses";
  state.referenceSlots.glasses = null;
  state.referenceSlots.can = null;
  state.measurementLocks.fish = false;
  state.measurementLocks.body = false;
  els.faceDepthToolButton.classList.remove("active");
  state.points.ref = [];
  state.points.fish = [];
  state.points.body = [];
  els.referenceSelect.value = "glasses";
  state.lastResult = null;
  state.lastPayload = null;
  els.saveButton.disabled = true;
  renderReferenceReadout();
  renderResult(null);
  updateReferenceSpecificControls();
  updateSimpleReferenceButtons();
  updateReferenceLockButton();
  draw();
}

function renderResult(result) {
  els.bigStatus.className = "big-status pending";
  els.resultPanel.classList.toggle("is-empty", !result);
  updateChecklist();

  if (!result) {
    els.bigStatus.querySelector("strong").textContent = "Väntar";
    els.lengthResult.textContent = "-- cm";
    els.weightResult.textContent = "-- kg";
    els.bodyDepthResult.textContent = "-- cm";
    els.limitResult.textContent = "-- cm";
    els.confidenceResult.textContent = "--";
    return;
  }

  const statusClass = result.status === "BIGPLUS" ? "bigplus" : result.status.startsWith("SL") ? "release" : "check";
  els.bigStatus.classList.add(statusClass);
  els.bigStatus.querySelector("strong").textContent = result.status;
  els.lengthResult.textContent = formatCm(result.lengthCm);
  els.weightResult.textContent = formatKgRange(result.weightKg);
  els.bodyDepthResult.textContent = result.bodyCm ? formatCm(result.bodyCm) : "-- cm";
  els.limitResult.textContent = result.minCm > 0 ? formatCm(result.minCm) : "Kolla";
  els.confidenceResult.textContent = result.confidence === "body" ? "Bättre" : result.confidence === "high" ? "Hög" : result.confidence === "local" ? "Lokal" : "Mellan";
  els.disclaimer.textContent = result.disclaimer;
}

async function calculate() {
  const fishPixels = distance(state.points.fish);
  const bodyPixels = distance(state.points.body);
  const referenceScaleCmPerPixel = combinedReferenceScaleCmPerPixel();

  if (!state.image) {
    setStatus("Välj bild");
    return;
  }
  if (!referenceScaleCmPerPixel) {
    setStatus("Placera referens");
    return;
  }
  if (state.points.fish.length < 2) {
    setStatus("Markera längd");
    return;
  }
  if (state.points.body.length < 2) {
    setStatus("Markera höjd");
    return;
  }
  lockMeasurement("fish");
  lockMeasurement("body");

  const payload = {
    refPixels: 1,
    fishPixels,
    bodyPixels: state.points.body.length === 2 ? bodyPixels : null,
    refCm: referenceScaleCmPerPixel,
    calibrationFactor: 1,
    speciesId: els.speciesSelect.value,
    minCm: Number(els.minSize.value)
  };

  try {
    setStatus("Räknar");
    let result;
    try {
      result = await calculateMeasurement(payload);
    } catch {
      result = calculateMeasurementOffline(payload, state.species);
    }
    state.lastResult = result;
    state.lastPayload = payload;
    els.saveButton.disabled = false;
    renderResult(result);
    setStatus(result.status);
  } catch (error) {
    setStatus("Fel");
    alert(error.message);
  }
}

async function persistCatch() {
  if (!state.lastPayload) return;

  try {
    setStatus("Sparar");
    const payload = {
      measurement: state.lastPayload,
      note: els.catchNote.value,
      photo: state.imageDataUrl
    };
    try {
      await saveCatch(payload);
    } catch {
      saveLocalCatch(payload, state.lastResult);
    }
    els.catchNote.value = "";
    await loadCatches();
    setStatus("Sparad");
  } catch (error) {
    setStatus("Fel");
    alert(error.message);
  }
}

function renderCatches(items) {
  if (!items.length) {
    els.catchLog.innerHTML = '<p class="hint">Inga sparade fångster än.</p>';
    return;
  }

  els.catchLog.innerHTML = items
    .map((item) => {
      const photo = item.photo ? `<img class="catch-thumb" src="${item.photo}" alt="">` : '<div class="catch-thumb"></div>';
      return `
        <article class="catch-item">
          ${photo}
          <div>
            <strong>${item.measurement.status} · ${formatCm(item.measurement.lengthCm)}</strong>
            <span>${item.measurement.species} · ${new Date(item.createdAt).toLocaleString("sv-SE")}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadCatches() {
  try {
    const catches = await getCatches();
    renderCatches(catches);
  } catch {
    renderCatches(getLocalCatches().slice(-30).reverse());
  }
}

function addReference() {
  const name = els.newReferenceName.value.trim();
  const sizeCm = Number(els.newReferenceSize.value);

  if (!name || !Number.isFinite(sizeCm) || sizeCm <= 0) {
    setStatus("Fyll referens");
    return;
  }

  const reference = {
    id: `user-${Date.now()}`,
    name,
    sizeCm,
    note: "Egen referens"
  };
  const storedReferences = [...getStoredReferences(), reference];
  storeReferences(storedReferences);

  const customReference = state.references.find((item) => item.id === "custom");
  state.references = [
    ...state.references.filter((item) => item.id !== "custom"),
    reference,
    customReference
  ].filter(Boolean);

  renderReferenceOptions();
  els.referenceSelect.value = reference.id;
  els.customReferenceWrap.style.display = "none";
  els.newReferenceName.value = "";
  els.newReferenceSize.value = "";
  setStatus("Referens tillagd");
}

function removeSelectedReference() {
  const selectedId = els.referenceSelect.value;
  if (!selectedId.startsWith("user-")) {
    setStatus("Endast egna");
    return;
  }

  const storedReferences = getStoredReferences().filter((item) => item.id !== selectedId);
  storeReferences(storedReferences);
  state.references = state.references.filter((item) => item.id !== selectedId);
  renderReferenceOptions();
  els.referenceSelect.value = state.references[0]?.id || "";
  state.virtualReference.enabled = false;
  state.points.ref = [];
  state.points.body = [];
  els.customReferenceWrap.style.display = els.referenceSelect.value === "custom" ? "flex" : "none";
  els.saveButton.disabled = true;
  setStatus("Referens borttagen");
  draw();
}

function placeVirtualReference(options = {}) {
  if (!state.image) {
    setStatus("Ladda bild först");
    return;
  }

  const refCm = getSelectedReferenceCm();
  if (!Number.isFinite(refCm) || refCm <= 0) {
    setStatus("Välj referens");
    return;
  }

  const height = Number(els.referenceScaleRange.value) || 150;
  const groundY = Number.isFinite(options.groundY)
    ? options.groundY
    : Math.max(20 + height, els.canvas.height * 0.55);
  state.virtualReference.enabled = true;
  state.virtualReference.selected = true;
  state.virtualReference.autoPerspective = els.autoPerspectiveToggle.checked;
  state.virtualReference.depthMode = els.depthModeSelect.value;
  state.virtualReference.showMarkers = false;
  state.virtualReference.calibrationFactor = Number(els.calibrationRange.value) / 100 || 1;
  state.virtualReference.faceDepthOffset = selectedFaceDepthOffset();
  state.virtualReference.locked = false;
  state.virtualReference.baseHeight = height;
  state.virtualReference.height = height;
  state.virtualReference.rotationDeg = Number.isFinite(options.rotationDeg)
    ? options.rotationDeg
    : Number(els.referenceRotationRange.value) || 0;
  state.virtualReference.x = Number.isFinite(options.x)
    ? options.x
    : Math.max(20, els.canvas.width * 0.12);
  state.virtualReference.groundY = groundY;
  state.virtualReference.lockedAnchorY = state.virtualReference.depthMode === "fish" ? groundY : null;
  state.virtualReference.y = groundY - height;
  updateVirtualReferenceHeightFromPerspective();
  const rect = virtualReferenceRect();
  state.virtualReference.x = clamp(state.virtualReference.x, 8, Math.max(8, els.canvas.width - rect.width - 8));
  state.virtualReference.groundY = clamp(state.virtualReference.groundY, rect.height + 8, els.canvas.height - 8);
  if (state.virtualReference.depthMode === "fish") {
    state.virtualReference.lockedAnchorY = state.virtualReference.groundY;
  }
  state.virtualReference.y = state.virtualReference.groundY - rect.height;
  updateVirtualReferencePoints();
  syncActiveReferenceSlot();
  setTool("fish");
  els.saveButton.disabled = true;
  setStatus(options.status || "Dra referens");
  draw();
}

function prepareGlassesReference() {
  els.referenceSelect.value = "glasses";
  state.referenceSlots.active = "glasses";
  els.customReferenceWrap.style.display = "none";
  els.autoPerspectiveToggle.checked = true;
  els.depthModeSelect.value = "fish";
  setCalibrationPercent(100);
  els.referenceRotationRange.value = "0";
  state.faceDepthLine.active = false;
  state.faceDepthLine.dragging = false;
  state.faceDepthLine.points = [];
  state.faceDepthLine.index = -1;
  updateReferenceSpecificControls();
}

function placeGlassesAtPoint(point, width, status = "Glasögon placerade") {
  const frame = getImageFrame();
  const targetWidth = Number.isFinite(width)
    ? clamp(width, 70, 230)
    : clamp(frame.drawWidth * 0.24, 82, 180);
  const targetHeight = referenceVisualHeight(targetWidth);
  const groundY = point.y + targetHeight / 2;
  const baseHeight = targetWidth / Math.max(0.1, perspectiveScaleForY(groundY));

  state.glassesPlacement.active = false;
  els.referenceScaleRange.value = String(Math.round(baseHeight));

  placeVirtualReference({
    x: point.x - targetWidth / 2,
    groundY,
    rotationDeg: 0,
    status
  });
}

async function placeGlassesReference() {
  if (!state.image) {
    setStatus("Ladda bild först");
    return;
  }

  setStatus("Söker ansikte");
  resizeCanvasToDisplay();
  prepareGlassesReference();

  const face = await detectFaceInImageFrame();
  if (face) {
    placeGlassesAtPoint(
      {
        x: face.x + face.width / 2,
        y: face.y + face.height * 0.43
      },
      face.width * 0.78,
      "Ansikte hittat"
    );
    return;
  }

  state.glassesPlacement.active = true;
  state.virtualReference.selected = false;
  setStatus("Klicka på ansiktet");
  draw();
}

function startFaceDepthLine() {
  if (!state.image) {
    setStatus("Ladda bild först");
    return;
  }
  if (!isGlassesReference() || !state.virtualReference.enabled) {
    setStatus("Placera glasögon först");
    return;
  }

  state.faceDepthLine.active = true;
  state.faceDepthLine.dragging = false;
  state.faceDepthLine.index = -1;
  state.virtualReference.selected = false;
  els.faceDepthToolButton.classList.add("active");
  setStatus("Dra glasögon till fisk");
  draw();
}

function placeHandReference() {
  if (!state.image) {
    setStatus("Ladda bild först");
    return;
  }

  if (!["can-330", "can-330-slim"].includes(els.referenceSelect.value)) {
    els.referenceSelect.value = "can-330";
    els.customReferenceWrap.style.display = "none";
  }

  els.autoPerspectiveToggle.checked = true;
  els.depthModeSelect.value = "fish";
  setCalibrationPercent(80);
  els.referenceRotationRange.value = "0";

  const guide = fishGuide();
  const baseHeight = Number(els.referenceScaleRange.value) || 150;
  const anchorY = guide?.centerY ?? els.canvas.height * 0.55;
  const estimatedHeight = Math.max(42, baseHeight * perspectiveScaleForY(anchorY));
  const estimatedWidth = estimatedHeight * 0.42;
  const handX = guide ? guide.head.x - estimatedWidth * 0.5 : els.canvas.width * 0.35;
  const handY = guide ? guide.centerY : els.canvas.height * 0.58;

  placeVirtualReference({
    x: handX,
    groundY: handY + estimatedHeight / 2,
    rotationDeg: 0,
    status: guide ? "Handläge" : "Markera fisk först"
  });
}

function placeSelectedSimpleReference(status) {
  updateSimpleReferenceButtons();
  if (!state.image) {
    setStatus(isGlassesReference() ? "Glasögon valt" : "Burk vald");
    return;
  }
  const existingSlot = state.referenceSlots[referenceSlotNameForId()];
  if (existingSlot) {
    loadReferenceSlot(referenceSlotNameForId(), true);
    return;
  }
  if (isGlassesReference()) {
    placeGlassesReference();
    return;
  }
  els.referenceSelect.value = "can-330";
  els.customReferenceWrap.style.display = "none";
  els.autoPerspectiveToggle.checked = true;
  els.depthModeSelect.value = "fish";
  setCalibrationPercent(100);
  updateReferenceSpecificControls();
  updateSimpleReferenceButtons();
  placeVirtualReference({ status: status || "Burk placerad" });
}

function chooseSimpleReference(referenceId) {
  if (referenceId === "can-330" && !state.referenceSlots.glasses) {
    els.referenceSelect.value = "glasses";
    state.referenceSlots.active = "glasses";
    updateReferenceSpecificControls();
    updateSimpleReferenceButtons();
    if (state.image) {
      placeGlassesReference();
    } else {
      setStatus("Börja med glasögon");
    }
    return;
  }

  syncActiveReferenceSlot();
  els.referenceSelect.value = referenceId;
  state.referenceSlots.active = referenceSlotNameForId(referenceId) || state.referenceSlots.active;
  els.customReferenceWrap.style.display = "none";
  updateReferenceSpecificControls();
  updateSimpleReferenceButtons();
  placeSelectedSimpleReference(referenceId === "glasses" ? "Glasögon valt" : "Burk placerad");
}

function toggleReferenceLock() {
  if (!state.image || !state.virtualReference.enabled) {
    setStatus("Placera referens först");
    return;
  }

  state.virtualReference.locked = !state.virtualReference.locked;
  if (state.virtualReference.locked) {
    state.virtualReference.selected = false;
    state.virtualReference.dragging = false;
    state.virtualReference.pointerAction = "";
    setStatus("Referens låst");
  } else {
    state.virtualReference.selected = true;
    setStatus("Referens upplåst");
  }
  syncActiveReferenceSlot();
  updateReferenceLockButton();
  draw();
}

async function boot() {
  const mode = getApiMode();
  setStatus(mode.label);

  const customReference = DEFAULT_REFERENCES.find((item) => item.id === "custom");
  state.references = [
    ...DEFAULT_REFERENCES.filter((item) => item.id !== "custom"),
    ...getStoredReferences(),
    customReference
  ].filter(Boolean);
  state.species = DEFAULT_SPECIES;
  renderReferenceOptions();
  renderSpeciesOptions();
  els.referenceSelect.value = "glasses";
  state.referenceSlots.active = "glasses";
  els.speciesSelect.value = "pike";
  els.minSize.value = state.species.find((item) => item.id === "pike")?.minCm ?? 0;
  els.customReferenceWrap.style.display = "none";
  updateReferenceSpecificControls();
  updateSimpleReferenceButtons();
  renderCatches(getLocalCatches().slice(-30).reverse());

  try {
    const [references, species] = await Promise.all([getReferences(), getSpecies()]);
    state.references = references;
    state.species = species;
    const storedReferences = getStoredReferences();
    state.references = [
      ...state.references.filter((item) => item.id !== "custom"),
      ...storedReferences,
      state.references.find((item) => item.id === "custom") || customReference
    ].filter(Boolean);
    renderReferenceOptions();
    renderSpeciesOptions();
    els.referenceSelect.value = "glasses";
    state.referenceSlots.active = "glasses";
    els.speciesSelect.value = "pike";
    els.minSize.value = state.species.find((item) => item.id === "pike")?.minCm ?? 0;
    updateReferenceSpecificControls();
    updateSimpleReferenceButtons();
  } catch {
    setStatus("Lokalt");
  }

  await loadCatches();
  draw();
}

els.photoInput.addEventListener("change", () => {
  const file = els.photoInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      state.imageDataUrl = reader.result;
      els.emptyState.classList.add("hidden");
      resetZoom();
      resetPoints();
      draw();
      window.setTimeout(() => placeSelectedSimpleReference(), 0);
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

document.addEventListener("pointerdown", (event) => {
  if (!state.virtualReference.enabled || !state.virtualReference.selected) return;
  if (els.canvasWrap.contains(event.target)) return;
  state.virtualReference.selected = false;
  draw();
});

els.canvas.addEventListener("click", (event) => {
  if (!state.image) return;
  if (state.view.suppressNextClick) {
    state.view.suppressNextClick = false;
    return;
  }
  if (state.virtualReference.suppressNextClick) {
    state.virtualReference.suppressNextClick = false;
    return;
  }
  const point = getCanvasPoint(event);
  if (state.glassesPlacement.active) {
    placeGlassesAtPoint(point, undefined, "Glasögon placerade");
    return;
  }
  if (isInsideVirtualReference(point)) {
    if (state.virtualReference.locked) return;
    state.virtualReference.selected = true;
    draw();
    return;
  }
  if (state.virtualReference.enabled && state.virtualReference.selected) {
    state.virtualReference.selected = false;
    draw();
    return;
  }

  let points = state.points[state.activeTool];
  if (state.activeTool === "ref" && state.virtualReference.enabled) {
    state.virtualReference.enabled = false;
    state.points.ref = [];
    points = state.points.ref;
  }
  if ((state.activeTool === "fish" || state.activeTool === "body") && state.measurementLocks[state.activeTool]) return;
  if (points.length >= 2) points.length = 0;
  points.push(point);
  if (points.length === 2) {
    const completedTool = state.activeTool;
    lockMeasurement(completedTool);
    setTool(nextToolAfterComplete(completedTool));
  }
  els.saveButton.disabled = true;
  draw();
});

els.canvas.addEventListener("pointerdown", (event) => {
  if (!state.image) return;
  const screenPoint = getCanvasScreenPoint(event);
  const point = getCanvasPoint(event);
  const faceDepthHit = hitFaceDepthPoint(point);
  if (isGlassesReference() && (state.faceDepthLine.active || faceDepthHit >= 0)) {
    state.faceDepthLine.dragging = true;
    state.faceDepthLine.index = faceDepthHit >= 0 ? faceDepthHit : 1;
    if (faceDepthHit >= 0) {
      state.faceDepthLine.points[state.faceDepthLine.index] = point;
    } else {
      state.faceDepthLine.points = [point, point];
    }
    state.view.suppressNextClick = true;
    els.canvas.setPointerCapture(event.pointerId);
    draw();
    return;
  }

  if (state.virtualReference.enabled && !state.virtualReference.selected && isInsideVirtualReference(point)) {
    if (state.virtualReference.locked) return;
    state.virtualReference.selected = true;
    state.virtualReference.suppressNextClick = true;
    draw();
    return;
  }

  const pointHit = hitMeasurementPoint(point);
  if (pointHit) {
    state.pointDrag.dragging = true;
    state.pointDrag.tool = pointHit.tool;
    state.pointDrag.index = pointHit.index;
    state.pointDrag.moved = false;
    els.canvas.setPointerCapture(event.pointerId);
    return;
  }

  const action = hitVirtualReferenceControl(point);
  if (!action) {
    if (state.view.zoom <= 1) return;
    state.view.dragging = true;
    state.view.moved = false;
    state.view.startX = screenPoint.x;
    state.view.startY = screenPoint.y;
    state.view.startPanX = state.view.panX;
    state.view.startPanY = state.view.panY;
    els.canvas.setPointerCapture(event.pointerId);
    return;
  }

  const rect = virtualReferenceRect();
  state.virtualReference.dragging = true;
  state.virtualReference.pointerAction = action;
  state.virtualReference.suppressNextClick = true;
  state.virtualReference.dragOffsetX = point.x - rect.x;
  state.virtualReference.dragOffsetY = point.y - (rect.y + rect.height);
  state.virtualReference.startBaseHeight = state.virtualReference.baseHeight;
  state.virtualReference.startAngleDeg = state.virtualReference.rotationDeg - angleFromCenter(point);
  els.canvas.setPointerCapture(event.pointerId);
});

els.canvas.addEventListener("pointermove", (event) => {
  if (state.faceDepthLine.dragging) {
    const point = getCanvasPoint(event);
    state.faceDepthLine.points[state.faceDepthLine.index] = point;
    state.virtualReference.faceDepthOffset = selectedFaceDepthOffset();
    els.saveButton.disabled = true;
    els.canvas.style.cursor = "grabbing";
    draw();
    return;
  }

  if (state.pointDrag.dragging) {
    const point = getCanvasPoint(event);
    const points = state.points[state.pointDrag.tool];
    if (points?.[state.pointDrag.index]) {
      points[state.pointDrag.index] = point;
      state.pointDrag.moved = true;
      els.saveButton.disabled = true;
      els.canvas.style.cursor = "grabbing";
      draw();
    }
    return;
  }

  if (state.view.dragging) {
    const screenPoint = getCanvasScreenPoint(event);
    const dx = screenPoint.x - state.view.startX;
    const dy = screenPoint.y - state.view.startY;
    if (Math.hypot(dx, dy) > 3) state.view.moved = true;
    state.view.panX = state.view.startPanX + dx;
    state.view.panY = state.view.startPanY + dy;
    els.canvas.style.cursor = "grabbing";
    draw();
    return;
  }

  const point = getCanvasPoint(event);
  if (!state.virtualReference.dragging) {
    const faceDepthHit = hitFaceDepthPoint(point);
    const pointHit = hitMeasurementPoint(point);
    const hoverAction = hitVirtualReferenceControl(point);
    let cursor = "crosshair";
    if (faceDepthHit >= 0 || pointHit || hoverAction === "rotate") {
      cursor = "grab";
    } else if (hoverAction === "scale") {
      cursor = "nwse-resize";
    } else if (hoverAction === "move") {
      cursor = "move";
    } else if (state.view.zoom > 1) {
      cursor = "grab";
    }
    els.canvas.style.cursor = cursor;
    return;
  }
  const rect = virtualReferenceRect();

  if (state.virtualReference.pointerAction === "rotate") {
    state.virtualReference.rotationDeg = normalizeAngle(angleFromCenter(point) + state.virtualReference.startAngleDeg);
    els.referenceRotationRange.value = String(state.virtualReference.rotationDeg);
  } else if (state.virtualReference.pointerAction === "scale") {
    const geometry = virtualReferenceGeometry();
    const local = localReferencePoint(point, geometry);
    const visualLength = isGlassesReference()
      ? clamp((Math.abs(local.x) - 16) * 2, 42, 360)
      : clamp((Math.abs(local.y) - 16) * 2, 42, 360);
    const anchorY = getPerspectiveAnchorY();
    const perspective = state.virtualReference.autoPerspective && anchorY !== null && state.virtualReference.depthMode !== "manual"
      ? perspectiveScaleForY(anchorY)
      : 1;
    state.virtualReference.baseHeight = clamp(visualLength / Math.max(0.1, perspective), 60, 320);
    els.referenceScaleRange.value = String(Math.round(state.virtualReference.baseHeight));
    state.virtualReference.height = visualLength;
    const visualHeight = referenceVisualHeight(visualLength);
    state.virtualReference.groundY = geometry.centerY + visualHeight / 2;
    if (state.virtualReference.depthMode === "fish") {
      state.virtualReference.lockedAnchorY = state.virtualReference.groundY;
    }
    state.virtualReference.y = state.virtualReference.groundY - visualHeight;
    updateVirtualReferenceHeightFromPerspective();
  } else {
    const nextGroundY = Math.min(
      Math.max(rect.height + 8, point.y - state.virtualReference.dragOffsetY),
      els.canvas.height - 8
    );
    state.virtualReference.x = Math.min(
      Math.max(8, point.x - state.virtualReference.dragOffsetX),
      Math.max(8, els.canvas.width - rect.width - 8)
    );
    state.virtualReference.groundY = nextGroundY;
    if (state.virtualReference.depthMode === "fish") {
      state.virtualReference.lockedAnchorY = nextGroundY;
    }
    state.virtualReference.y = nextGroundY - rect.height;
    updateVirtualReferenceHeightFromPerspective();
  }

  updateVirtualReferencePoints();
  els.saveButton.disabled = true;
  draw();
});

els.canvas.addEventListener("pointerup", (event) => {
  if (state.faceDepthLine.dragging) {
    state.faceDepthLine.dragging = false;
    state.faceDepthLine.active = false;
    state.faceDepthLine.index = -1;
    state.virtualReference.faceDepthOffset = selectedFaceDepthOffset();
    els.faceDepthToolButton.classList.remove("active");
    state.view.suppressNextClick = true;
    if (els.canvas.hasPointerCapture(event.pointerId)) {
      els.canvas.releasePointerCapture(event.pointerId);
    }
    draw();
    return;
  }

  if (state.pointDrag.dragging) {
    state.pointDrag.dragging = false;
    state.view.suppressNextClick = true;
    state.pointDrag.tool = "";
    state.pointDrag.index = -1;
    state.pointDrag.moved = false;
    if (els.canvas.hasPointerCapture(event.pointerId)) {
      els.canvas.releasePointerCapture(event.pointerId);
    }
    return;
  }

  if (state.view.dragging) {
    state.view.dragging = false;
    state.view.suppressNextClick = state.view.moved;
    state.view.moved = false;
    if (els.canvas.hasPointerCapture(event.pointerId)) {
      els.canvas.releasePointerCapture(event.pointerId);
    }
    return;
  }

  if (!state.virtualReference.dragging) return;
  state.virtualReference.dragging = false;
  state.virtualReference.pointerAction = "";
  state.virtualReference.suppressNextClick = true;
  if (els.canvas.hasPointerCapture(event.pointerId)) {
    els.canvas.releasePointerCapture(event.pointerId);
  }
});

els.canvas.addEventListener("pointercancel", () => {
  state.faceDepthLine.dragging = false;
  state.faceDepthLine.index = -1;
  state.pointDrag.dragging = false;
  state.pointDrag.tool = "";
  state.pointDrag.index = -1;
  state.pointDrag.moved = false;
  state.view.dragging = false;
  state.view.moved = false;
  state.virtualReference.dragging = false;
  state.virtualReference.pointerAction = "";
  state.glassesPlacement.active = false;
});

els.referenceSelect.addEventListener("change", () => {
  els.customReferenceWrap.style.display = els.referenceSelect.value === "custom" ? "flex" : "none";
  updateReferenceSpecificControls();
  updateSimpleReferenceButtons();
  if (state.virtualReference.enabled) {
    updateVirtualReferencePoints();
    draw();
  }
});

els.referenceScaleRange.addEventListener("input", () => {
  const nextHeight = Number(els.referenceScaleRange.value) || state.virtualReference.baseHeight;
  state.virtualReference.baseHeight = nextHeight;
  if (!state.virtualReference.autoPerspective) {
    state.virtualReference.height = nextHeight;
    state.virtualReference.groundY = state.virtualReference.y + nextHeight;
  }
  if (state.virtualReference.enabled) {
    updateVirtualReferenceHeightFromPerspective();
    updateVirtualReferencePoints();
    els.saveButton.disabled = true;
    draw();
  }
});

els.referenceRotationRange.addEventListener("input", () => {
  state.virtualReference.rotationDeg = Number(els.referenceRotationRange.value) || 0;
  if (state.virtualReference.enabled) {
    updateVirtualReferencePoints();
    els.saveButton.disabled = true;
    draw();
  } else {
    renderReferenceReadout();
  }
});

els.calibrationRange.addEventListener("input", () => {
  state.virtualReference.calibrationFactor = Number(els.calibrationRange.value) / 100 || 1;
  els.calibrationValue.textContent = `${Math.round(state.virtualReference.calibrationFactor * 100)}%`;
  els.saveButton.disabled = true;
  renderReferenceReadout();
  enhanceReferenceReadout();
});

els.depthModeSelect.addEventListener("change", () => {
  state.virtualReference.depthMode = els.depthModeSelect.value;
  state.virtualReference.lockedAnchorY = state.virtualReference.depthMode === "fish"
    ? state.virtualReference.groundY
    : null;
  if (state.virtualReference.enabled) {
    if (state.virtualReference.depthMode === "manual") {
      state.virtualReference.height = state.virtualReference.baseHeight;
      state.virtualReference.y = state.virtualReference.groundY - state.virtualReference.height;
    } else {
      updateVirtualReferenceHeightFromPerspective();
    }
    updateVirtualReferencePoints();
    els.saveButton.disabled = true;
    draw();
  } else {
    renderReferenceReadout();
  }
});

els.showReferenceMarkersToggle.addEventListener("change", () => {
  state.virtualReference.showMarkers = false;
  els.showReferenceMarkersToggle.checked = false;
  draw();
});

els.autoPerspectiveToggle.addEventListener("change", () => {
  state.virtualReference.autoPerspective = els.autoPerspectiveToggle.checked;
  state.virtualReference.lockedAnchorY = state.virtualReference.autoPerspective && state.virtualReference.depthMode === "fish"
    ? state.virtualReference.groundY
    : null;
  if (state.virtualReference.enabled) {
    if (!state.virtualReference.groundY) {
      state.virtualReference.groundY = state.virtualReference.y + state.virtualReference.height;
    }
    if (!state.virtualReference.autoPerspective) {
      state.virtualReference.height = state.virtualReference.baseHeight;
      state.virtualReference.y = state.virtualReference.groundY - state.virtualReference.height;
    } else {
      updateVirtualReferenceHeightFromPerspective();
    }
    updateVirtualReferencePoints();
    els.saveButton.disabled = true;
    draw();
  }
});

els.speciesSelect.addEventListener("change", () => {
  const selected = state.species.find((item) => item.id === els.speciesSelect.value);
  els.minSize.value = selected?.minCm ?? 0;
});

els.zoomOutButton.addEventListener("click", () => setZoom(state.view.zoom / 1.25));
els.zoomInButton.addEventListener("click", () => setZoom(state.view.zoom * 1.25));
els.zoomResetButton.addEventListener("click", () => {
  resetZoom();
  draw();
});

els.canvas.addEventListener("wheel", (event) => {
  if (!state.image) return;
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.16 : 1 / 1.16;
  setZoom(state.view.zoom * factor, getCanvasScreenPoint(event));
}, { passive: false });

els.refTool.addEventListener("click", () => setTool("ref"));
els.fishTool.addEventListener("click", () => setTool("fish"));
els.bodyTool.addEventListener("click", () => setTool("body"));
els.checkLength?.addEventListener("click", () => unlockMeasurement("fish"));
els.checkHeight?.addEventListener("click", () => unlockMeasurement("body"));
els.simpleCanButton.addEventListener("click", () => chooseSimpleReference("can-330"));
els.simpleGlassesButton.addEventListener("click", () => chooseSimpleReference("glasses"));
els.lockReferenceButton.addEventListener("click", toggleReferenceLock);
els.placeReferenceButton.addEventListener("click", placeVirtualReference);
els.placeGlassesReferenceButton.addEventListener("click", placeGlassesReference);
els.faceDepthToolButton.addEventListener("click", startFaceDepthLine);
els.placeHandReferenceButton.addEventListener("click", placeHandReference);
els.addReferenceButton.addEventListener("click", addReference);
els.removeReferenceButton.addEventListener("click", removeSelectedReference);
els.resetButton.addEventListener("click", resetPoints);
els.calculateButton.addEventListener("click", calculate);
els.saveButton.addEventListener("click", persistCatch);
window.addEventListener("resize", draw);

boot().catch((error) => {
  setStatus("Fel");
  console.error(error);
});
