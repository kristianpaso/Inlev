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
    referenceId: "glasses",
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
    scaleStartCenterX: 0,
    scaleStartCenterY: 0,
    scaleStartAngle: 0,
    scaleStartAxis: 0,
    scaleStartLength: 150,
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

let draggedReferenceId = "";
let palettePointerDrag = null;
let suppressPaletteClick = false;

const els = {
  connectionStatus: document.querySelector("#connectionStatus"),
  photoInput: document.querySelector("#photoInput"),
  photoInputLabel: document.querySelector("#photoInputLabel"),
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
  clearButton: document.querySelector("#clearButton"),
  paletteGlasses: document.querySelector("#paletteGlasses"),
  paletteCan: document.querySelector("#paletteCan"),
  checkPhoto: document.querySelector("#checkPhoto"),
  checkReference: document.querySelector("#checkReference"),
  checkGlasses: document.querySelector("#checkGlasses"),
  lockReferenceChecklist: document.querySelector("#lockReferenceChecklist"),
  checkCan: document.querySelector("#checkCan"),
  checkSize: document.querySelector("#checkSize"),
  lockSizeChecklist: document.querySelector("#lockSizeChecklist"),
  checkLength: document.querySelector("#checkLength"),
  checkHeight: document.querySelector("#checkHeight"),
  checkResult: document.querySelector("#checkResult"),
  editLengthButton: document.querySelector("#editLengthButton"),
  editHeightButton: document.querySelector("#editHeightButton"),
  lockLengthButton: document.querySelector("#lockLengthButton"),
  lockHeightButton: document.querySelector("#lockHeightButton"),
  checklistNextButton: document.querySelector("#checklistNextButton"),
  checklistStepTitle: document.querySelector("#checklistStepTitle"),
  checklistStepText: document.querySelector("#checklistStepText"),
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
  guidedOverlay: document.querySelector("#guidedOverlay"),
  guidedBubble: document.querySelector("#guidedBubble"),
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
glassesReferenceImage.src = "/bigplus/assets/glasses-reference.png?v=20260720";
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

function currentUserId() {
  return String(localStorage.getItem("inlev_user") || "").trim();
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
  if (els.paletteCan) {
    const canEnabled = Boolean(state.referenceSlots.glasses?.virtual?.locked);
    els.paletteCan.disabled = !canEnabled;
    els.paletteCan.draggable = true;
    els.paletteCan.title = canEnabled ? "Dra in burken" : "Lås glasögonen först";
    els.paletteCan.classList.toggle("is-next-step", Boolean(state.image && canEnabled && !state.referenceSlots.can));
  }
  if (els.paletteGlasses) {
    els.paletteGlasses.disabled = false;
    els.paletteGlasses.draggable = true;
    els.paletteGlasses.classList.toggle("is-next-step", Boolean(state.image && !state.referenceSlots.glasses));
    els.paletteGlasses.title = state.image && !state.referenceSlots.glasses
      ? "Dra in glasögonen till bilden"
      : "Dra och placera glasögonen";
  }
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

function editReferenceSlot(slotName) {
  const slot = state.referenceSlots[slotName];
  if (!slot) return;
  slot.virtual.locked = false;
  state.referenceSlots.active = slotName;
  loadReferenceSlot(slotName, true);
  state.virtualReference.locked = false;
  state.virtualReference.selected = true;
  setTool("ref");
  setStatus(slotName === "glasses" ? "Glasögon upplåsta" : "Burk upplåst");
  updateReferenceLockButton();
  updateReferenceChecklistLockButton();
  updateSimpleReferenceButtons();
  draw();
}

function guidedStepText() {
  if (!state.image) return "Välj bild.";
  const glasses = state.referenceSlots.glasses;
  const can = state.referenceSlots.can;
  if (!glasses) return "Dra in Glasögonen.";
  if (!glasses.virtual?.locked) return "Placera glasögonen och lås dem.";
  if (!can) return "Dra in burken.";
  if (!can.virtual?.locked) return "Placera burken och lås den.";
  if (state.points.fish.length < 2) return "Dra längdlinjen från nos till stjärt.";
  if (!state.measurementLocks.fish) return "Kontrollera längden och lås markeringen.";
  if (state.points.body.length < 2) return "Markera höjden där fisken är som tjockast.";
  if (!state.measurementLocks.body) return "Kontrollera höjden och lås markeringen.";
  return "";
}

function updateGuidedOverlay() {
  if (!els.guidedOverlay || !els.guidedBubble || !els.canvasWrap) return;
  const text = guidedStepText();
  const visible = Boolean(text);
  els.guidedOverlay.classList.toggle("hidden", !visible);
  els.canvasWrap.classList.toggle("is-guided", visible);
  if (visible) els.guidedBubble.textContent = text;
}

function isAnyReferenceLocked() {
  return Boolean(
    state.referenceSlots.glasses?.virtual?.locked ||
    state.referenceSlots.can?.virtual?.locked ||
    state.virtualReference.locked
  );
}

function areAllReferencesLocked() {
  const slots = [state.referenceSlots.glasses, state.referenceSlots.can].filter(Boolean);
  return slots.length > 0 && slots.every((slot) => Boolean(slot.virtual?.locked));
}

function updateReferenceChecklistLockButton() {
  const button = els.lockReferenceChecklist;
  if (!button) return;
  const hasReference = Boolean(state.referenceSlots.glasses || state.referenceSlots.can || state.virtualReference.enabled);
  const locked = areAllReferencesLocked();
  button.disabled = !hasReference;
  button.classList.toggle("is-locked", locked);
  button.setAttribute("aria-label", locked ? "Lås upp referenser" : "Lås referenser");
  button.title = locked ? "Lås upp referenser" : "Lås referenser";
}

function setReferencePlacementLock(locked) {
  ["glasses", "can"].forEach((slotName) => {
    const slot = state.referenceSlots[slotName];
    if (!slot?.virtual) return;
    slot.virtual.locked = locked;
    slot.virtual.selected = false;
    slot.virtual.dragging = false;
    slot.virtual.pointerAction = "";
  });

  if (state.virtualReference.enabled) {
    state.virtualReference.locked = locked;
    state.virtualReference.selected = true;
    state.virtualReference.dragging = false;
    state.virtualReference.pointerAction = "";
  }
}

function toggleReferencePlacementLock() {
  if (!state.image || !state.virtualReference.enabled) {
    setStatus("Placera referens först");
    return;
  }

  const shouldUnlock = areAllReferencesLocked();
  setReferencePlacementLock(!shouldUnlock);
  if (shouldUnlock) {
    state.virtualReference.selected = true;
    setTool("ref");
    setStatus("Referenser upplåsta");
  } else {
    setTool("fish");
    setStatus("Referenser låsta");
  }
  syncActiveReferenceSlot();
  updateReferenceLockButton();
  updateReferenceChecklistLockButton();
  updateChecklist();
  draw();
}

function updateMeasurementLockButtons() {
  const updateButton = (button, tool, label) => {
    if (!button) return;
    const locked = Boolean(state.measurementLocks[tool]);
    const canLock = state.points[tool].length >= 2;
    button.disabled = !canLock && !locked;
    button.classList.toggle("is-locked", locked);
    button.setAttribute("aria-label", locked ? `Lås upp ${label}` : `Lås ${label}`);
    button.title = locked ? `Lås upp ${label}` : `Lås ${label}`;
  };

  updateButton(els.lockLengthButton, "fish", "längd");
  updateButton(els.lockHeightButton, "body", "höjd");
}

function updateSizeChecklistLockButton() {
  const button = els.lockSizeChecklist;
  if (!button) return;
  const hasSize = state.points.fish.length >= 2 && state.points.body.length >= 2;
  const locked = Boolean(state.measurementLocks.fish && state.measurementLocks.body);
  button.disabled = !hasSize;
  button.classList.toggle("is-locked", locked);
  button.setAttribute("aria-label", locked ? "Lås upp storlek" : "Lås storlek");
  button.title = locked ? "Lås upp storlek" : "Lås storlek";
}

function toggleSizeChecklistLock() {
  if (state.points.fish.length < 2 || state.points.body.length < 2) {
    setStatus("Markera längd och höjd först");
    return;
  }
  const locked = state.measurementLocks.fish && state.measurementLocks.body;
  if (locked) {
    unlockMeasurement("fish");
    unlockMeasurement("body");
    setStatus("Storlek upplåst");
  } else {
    state.measurementLocks.fish = true;
    state.measurementLocks.body = true;
    setTool("ref");
    setStatus("Storlek låst");
    updateChecklist();
    draw();
  }
}

function checklistNextLabel() {
  if (!state.image) return "Välj bild";
  if (!state.referenceSlots.glasses) return "Placera glasögon";
  if (!state.referenceSlots.can) return "Placera burk";
  if (!areAllReferencesLocked()) return "Lås referenser";
  if (state.points.fish.length < 2) return "Markera längd";
  if (!state.measurementLocks.fish) return "Lås längd";
  if (state.points.body.length < 2) return "Markera höjd";
  if (!state.measurementLocks.body) return "Lås höjd";
  if (!state.lastResult) return "Räkna Bigplus";
  return "Spara Bigplus";
}

function updateChecklistNextButton() {
  if (!els.checklistNextButton) return;
  const nextStep = checklistNextLabel();
  els.checklistNextButton.textContent = nextStep;
  els.checklistNextButton.disabled = !state.image;
  if (els.checklistStepTitle && els.checklistStepText) {
    const help = {
      "Välj bild": ["Börja här", "Ladda upp en bild på fisken."],
      "Placera glasögon": ["Nästa steg", "Dra glasögonen till huvudet så att de passar."],
      "Placera burk": ["Nästa steg", "Dra in burken som nästa referens."],
      "Lås referenser": ["Nästa steg", "Kontrollera glasögon och burk. Lås sedan Referens när placeringen känns bra."],
      "Markera längd": ["Nästa steg", "Markera nos och stjärt. Klicka sedan på längdlinjen för att lägga till en böjning."],
      "Lås längd": ["Nästa steg", "Kontrollera längdlinjen och lås den när den ligger rätt."],
      "Markera höjd": ["Nästa steg", "Markera fiskens tjockaste ställe från rygg till buk."],
      "Lås höjd": ["Nästa steg", "Kontrollera höjdlinjen och lås den när den ligger rätt."],
      "Räkna Bigplus": ["Nästa steg", "Tryck på Räkna Bigplus när markeringarna är klara."],
      "Spara Bigplus": ["Klart", "Din Bigplus är redo att sparas."],
    }[nextStep] || ["Nästa steg", "Följ checklistan för att gå vidare."];
    els.checklistStepTitle.textContent = help[0];
    els.checklistStepText.textContent = help[1];
  }
}

function updateChecklist() {
  const referencesLocked = Boolean(
    state.referenceSlots.glasses?.virtual?.locked &&
    state.referenceSlots.can?.virtual?.locked
  );
  const items = [
    [els.checkPhoto, Boolean(state.image)],
    [els.checkReference, referencesLocked],
    [els.checkGlasses, Boolean(state.referenceSlots.glasses)],
    [els.checkCan, Boolean(state.referenceSlots.can)],
    [els.checkSize, state.points.fish.length >= 2 && state.points.body.length >= 2],
    [els.checkLength, state.points.fish.length >= 2],
    [els.checkHeight, state.points.body.length >= 2],
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
  updateSizeChecklistLockButton();
  updateReferenceChecklistLockButton();
  updateMeasurementLockButtons();
  updateChecklistNextButton();
}

function invalidateResult() {
  state.lastResult = null;
  state.lastPayload = null;
  els.saveButton.disabled = true;
  renderResult(null);
}

function lockMeasurement(tool) {
  if ((tool !== "fish" && tool !== "body") || state.points[tool].length < 2) return;
  state.measurementLocks[tool] = true;
  updateChecklist();
}

function unlockMeasurement(tool) {
  if (tool !== "fish" && tool !== "body") return;
  state.measurementLocks[tool] = false;
  invalidateResult();
  setTool(tool);
  setStatus(tool === "fish" ? "Justera längd" : "Justera höjd");
  draw();
}

function toggleMeasurementLock(tool) {
  if (tool !== "fish" && tool !== "body") return;
  if (state.points[tool].length < 2) {
    unlockMeasurement(tool);
    return;
  }

  if (state.measurementLocks[tool]) {
    unlockMeasurement(tool);
    return;
  }

  lockMeasurement(tool);
  setStatus(tool === "fish" ? "Längd låst" : "Höjd låst");
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
    referenceId: els.referenceSelect.value,
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
  // A can placed in the hand is a physical-size anchor at the fish's depth.
  // Prefer it over the glasses reference, which is normally farther back.
  const canScale = scales.find((item) => item.referenceId === "can-330");
  if (canScale) return canScale.scaleCmPerPixel;
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
  return classicCanReferenceImage;
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
    : Math.max(5, state.virtualReference.baseHeight * perspectiveScaleForY(anchorY));
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

function referenceSlotContainsPoint(slotName, point) {
  const slot = state.referenceSlots[slotName];
  if (!slot) return false;

  const savedReferenceId = els.referenceSelect.value;
  const savedVirtualReference = { ...state.virtualReference };
  const savedPoints = clonePoints(state.points.ref);
  els.referenceSelect.value = slot.referenceId;
  state.virtualReference = {
    ...state.virtualReference,
    ...slot.virtual,
    enabled: true
  };
  state.points.ref = clonePoints(slot.points);
  const inside = isInsideVirtualReference(point);
  els.referenceSelect.value = savedReferenceId;
  state.virtualReference = savedVirtualReference;
  state.points.ref = savedPoints;
  return inside;
}

function referenceSlotAtPoint(point) {
  const slotNames = ["glasses", "can"];
  return slotNames.find((slotName) => referenceSlotContainsPoint(slotName, point)) || "";
}

function virtualReferenceHandles() {
  const rect = virtualReferenceGeometry();
  return {
    rotate: rotateLocalPoint(rect.centerX, rect.centerY, 0, -rect.height / 2 - 34, rect.angle),
    scale: rotateLocalPoint(rect.centerX, rect.centerY, rect.width / 2 + 16, rect.height / 2 + 16, rect.angle),
    lock: rotateLocalPoint(rect.centerX, rect.centerY, rect.width / 2 + 50, rect.height / 2 + 16, rect.angle)
  };
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polylineDistance(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += pointDistance(points[index - 1], points[index]);
  }
  return total;
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return pointDistance(point, start);
  const projection = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return pointDistance(point, {
    x: start.x + projection * dx,
    y: start.y + projection * dy
  });
}

function nextToolAfterComplete(tool) {
  if (tool === "ref") return "fish";
  if (tool === "fish") return "body";
  return "body";
}

function isActiveUnlockedMeasurementTool() {
  return (state.activeTool === "fish" || state.activeTool === "body") && !state.measurementLocks[state.activeTool];
}

function hitMeasurementPoint(point) {
  const hitRadius = 18 / state.view.zoom;
  // The active measurement owns pointer hits while it is being placed.
  // This allows height endpoints to sit directly on length endpoints.
  if (isActiveUnlockedMeasurementTool()) {
    const points = state.points[state.activeTool];
    for (let index = 0; index < points.length; index += 1) {
      if (pointDistance(point, points[index]) <= hitRadius) {
        return { tool: state.activeTool, index };
      }
    }
    return null;
  }
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

function hitMeasurementSegment(point, tool = state.activeTool) {
  if (tool !== "fish" || state.measurementLocks.fish) return -1;
  const points = state.points.fish;
  const hitRadius = 18 / state.view.zoom;
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= hitRadius) return index - 1;
  }
  return -1;
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
  const handles = virtualReferenceHandles();
  if (pointDistance(point, handles.lock) <= 20) return "lock";
  if (state.virtualReference.locked) return "";
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

  const start = points[0];
  const end = points[points.length - 1];
  const endPrevious = points[points.length - 2];
  const startNext = points[1];
  const startAngle = Math.atan2(startNext.y - start.y, startNext.x - start.x);
  const endAngle = Math.atan2(end.y - endPrevious.y, end.x - endPrevious.x);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.stroke();

  drawArrowHead(end, endAngle, color);
  drawArrowHead(start, startAngle + Math.PI, color);

  if (points.length > 2) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let index = 1; index < points.length - 1; index += 1) {
      ctx.beginPath();
      ctx.arc(points[index].x, points[index].y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (label) {
    const labelPoint = points[Math.floor((points.length - 1) / 2)];
    const midX = labelPoint.x;
    ctx.font = "800 16px system-ui, sans-serif";
    const paddingX = 8;
    const width = ctx.measureText(label).width + paddingX * 2;
    const height = 26;
    const isHeightLabel = label === "höjd";
    const labelY = isHeightLabel
      ? labelPoint.y - height - 14
      : labelPoint.y + 14;
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
    gradient.addColorStop(0, "#737c7b");
    gradient.addColorStop(0.22, "#eef1ef");
    gradient.addColorStop(0.55, "#b8c0be");
    gradient.addColorStop(0.82, "#f4f6f5");
    gradient.addColorStop(1, "#737c7b");

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

function drawRotateControl(point) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#24a0c8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#17201b";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 1, 6.2, -0.2, Math.PI * 1.42);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5.8, 4.8);
  ctx.lineTo(-10.2, 5.4);
  ctx.lineTo(-7.4, 1.9);
  ctx.stroke();
  ctx.restore();
}

function drawScaleControl(point) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#17201b";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.roundRect(-12, -12, 24, 24, 6);
  ctx.fill();
  ctx.stroke();

  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-5.5, 5.5);
  ctx.lineTo(5.5, -5.5);
  ctx.moveTo(5.5, -5.5);
  ctx.lineTo(0.5, -5.5);
  ctx.moveTo(5.5, -5.5);
  ctx.lineTo(5.5, -0.5);
  ctx.moveTo(-5.5, 5.5);
  ctx.lineTo(-0.5, 5.5);
  ctx.moveTo(-5.5, 5.5);
  ctx.lineTo(-5.5, 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawReferenceLockControl(point, locked) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.fillStyle = locked ? "#ddf6e9" : "#ffffff";
  ctx.strokeStyle = locked ? "#1f6d4a" : "#17201b";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.roundRect(-12, -12, 24, 24, 6);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-6, -1, 12, 9, 2);
  ctx.stroke();
  ctx.beginPath();
  if (locked) ctx.arc(0, -1, 5, Math.PI, 0);
  else ctx.arc(0, -1, 5, Math.PI * 1.2, Math.PI * 0.05);
  ctx.stroke();
  ctx.restore();
}

function drawMoveHandControl(point) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.strokeStyle = "#263c49";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#263c49";
  ctx.beginPath();
  ctx.roundRect(-5, -1, 10, 9, 4);
  ctx.fill();
  ctx.lineWidth = 2.3;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#263c49";
  for (const fingerX of [-6, -2, 2, 6]) {
    ctx.beginPath();
    ctx.moveTo(fingerX, 2);
    ctx.lineTo(fingerX, -8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVirtualReference(referenceId = state.virtualReference.referenceId || els.referenceSelect.value) {
  if (!state.virtualReference.enabled) return;

  const rect = virtualReferenceGeometry();
  const radius = rect.width / 2;
  const x = -rect.width / 2;
  const y = -rect.height / 2;

  const glassesReference = referenceId === "glasses";
  if (glassesReference) {
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

  if (!state.virtualReference.selected) return;

  const handles = virtualReferenceHandles();
  const topPoint = state.points.ref[0];
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#24a0c8";
  ctx.fillStyle = "#ffffff";
  if (topPoint && !state.virtualReference.locked) {
    ctx.beginPath();
    ctx.moveTo(topPoint.x, topPoint.y);
    ctx.lineTo(handles.rotate.x, handles.rotate.y);
    ctx.stroke();
  }
  ctx.beginPath();
  if (!state.virtualReference.locked) {
    drawRotateControl(handles.rotate);
    drawScaleControl(handles.scale);
    drawMoveHandControl({ x: rect.centerX, y: rect.centerY });
  }
  drawReferenceLockControl(handles.lock, state.virtualReference.locked);
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
  drawVirtualReference(slot.referenceId);

  els.referenceSelect.value = savedReferenceId;
  state.virtualReference = savedVirtualReference;
  state.points.ref = savedPoints;
}

function draw() {
  resizeCanvasToDisplay();
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  updateReferenceLockButton();
  updateChecklist();
  updateGuidedOverlay();

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
  drawMeasurementArrowLine(state.points.fish, "#24a0c8", "längd");
  drawMeasurementArrowLine(state.points.body, "#d97706", "höjd");
  updateChecklist();
  updateGuidedOverlay();
  ctx.restore();
}

function setTool(tool) {
  state.activeTool = tool;
  els.refTool.classList.toggle("active", tool === "ref");
  els.fishTool.classList.toggle("active", tool === "fish");
  els.bodyTool.classList.toggle("active", tool === "body");
}

function resetPoints(options = {}) {
  const clearImage = Boolean(options.clearImage);
  if (clearImage) {
    state.image = null;
    state.imageDataUrl = "";
    els.photoInput.value = "";
    els.emptyState.classList.remove("hidden");
    resetZoom();
    setStatus("Redo");
  } else {
    setStatus("Rensad");
  }
  state.virtualReference.enabled = false;
  state.virtualReference.referenceId = "glasses";
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
  const fishPixels = polylineDistance(state.points.fish);
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
    bodyPixels: state.points.body.length >= 2 ? bodyPixels : null,
    refCm: referenceScaleCmPerPixel,
    calibrationFactor: 1,
    speciesId: els.speciesSelect.value,
    minCm: Number(els.minSize.value),
    referenceMode: state.referenceSlots.can ? "can-hand" : "glasses-depth",
    faceDepthCm: faceDepthDistanceCm()
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
      userId: currentUserId(),
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
  const userId = currentUserId();
  try {
    const catches = await getCatches(userId);
    renderCatches(catches);
  } catch {
    renderCatches(getLocalCatches(userId).slice(-30).reverse());
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
  invalidateResult();
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
  state.virtualReference.referenceId = els.referenceSelect.value;
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
  setTool(options.nextTool || "ref");
  invalidateResult();
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

function defaultPalettePoint(referenceId) {
  const frame = getImageFrame();
  if (referenceId === "glasses") {
    return {
      x: frame.offsetX + frame.drawWidth * 0.5,
      y: frame.offsetY + frame.drawHeight * 0.32
    };
  }

  return {
    x: frame.offsetX + frame.drawWidth * 0.18,
    y: frame.offsetY + frame.drawHeight * 0.58
  };
}

function placeDefaultGlassesReference(status = "Dra och placera glasögonen") {
  prepareGlassesReference();
  placeGlassesAtPoint(defaultPalettePoint("glasses"), undefined, status);
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

  placeDefaultGlassesReference("Dra och placera glasögonen");
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

function placePaletteReference(referenceId, point = null) {
  if (!state.image) {
    setStatus("Välj bild först");
    updateGuidedOverlay();
    return;
  }

  if (referenceId === "can-330" && !state.referenceSlots.glasses) {
    setStatus("Placera glasögon först");
    return;
  }

  syncActiveReferenceSlot();
  const slotName = referenceSlotNameForId(referenceId);
  if (slotName) state.referenceSlots.active = slotName;
  els.referenceSelect.value = referenceId;
  els.customReferenceWrap.style.display = "none";

  if (referenceId === "glasses") {
    // The first reference is always glasses. Clear a stale can slot so it
    // cannot be rendered over the newly dropped glasses.
    if (!state.referenceSlots.glasses) state.referenceSlots.can = null;
    prepareGlassesReference();
    state.referenceSlots.active = "glasses";
    state.virtualReference.referenceId = "glasses";
    state.virtualReference.locked = false;
    placeGlassesAtPoint(point || defaultPalettePoint("glasses"), undefined, "Dra och placera glasögonen");
    updateSimpleReferenceButtons();
    updateGuidedOverlay();
    return;
  }

  els.autoPerspectiveToggle.checked = true;
  els.depthModeSelect.value = "fish";
  els.referenceScaleRange.value = "150";
  els.referenceRotationRange.value = "0";
  setCalibrationPercent(100);
  updateReferenceSpecificControls();
  updateSimpleReferenceButtons();

  const center = point || defaultPalettePoint(referenceId);
  const height = Number(els.referenceScaleRange.value) || 150;
  const width = height * selectedReferenceWidthRatio();
  placeVirtualReference({
    x: center.x - width / 2,
    groundY: center.y + height / 2,
    rotationDeg: 0,
    status: "Burk placerad"
  });
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
  toggleReferencePlacementLock();
}

async function finishChecklistStep() {
  if (!state.image) {
    setStatus("Välj bild");
    return;
  }

  if (!state.referenceSlots.glasses) {
    placePaletteReference("glasses");
    return;
  }

  if (!state.referenceSlots.glasses.virtual?.locked) {
    if (state.virtualReference.enabled) toggleReferencePlacementLock();
    return;
  }

  if (!state.referenceSlots.can) {
    setStatus("Dra in burken");
    els.paletteCan?.focus();
    updateSimpleReferenceButtons();
    draw();
    return;
  }

  if (!areAllReferencesLocked()) {
    if (!state.virtualReference.enabled) {
      loadReferenceSlot(state.referenceSlots.active || "glasses", true);
    }
    if (state.virtualReference.enabled) {
      setReferencePlacementLock(true);
      syncActiveReferenceSlot();
      setTool("fish");
      setStatus("Referenser låsta");
      updateReferenceLockButton();
      updateReferenceChecklistLockButton();
      updateChecklist();
      draw();
    }
    return;
  }

  if (state.points.fish.length < 2) {
    unlockMeasurement("fish");
    setStatus("Markera längd");
    return;
  }

  if (!state.measurementLocks.fish) {
    lockMeasurement("fish");
    setTool("body");
    setStatus("Längd låst");
    draw();
    return;
  }

  if (state.points.body.length < 2) {
    unlockMeasurement("body");
    setStatus("Markera höjd");
    return;
  }

  if (!state.measurementLocks.body) {
    lockMeasurement("body");
    setStatus("Höjd låst");
    draw();
    return;
  }

  if (!state.lastResult) {
    await calculate();
    return;
  }

  await persistCatch();
}

function bindReferencePaletteItem(element, referenceId) {
  if (!element) return;

  element.addEventListener("pointerdown", (event) => {
    if (element.disabled) return;
    if (event.pointerType !== "mouse") event.preventDefault();
    // Keep native HTML drag available for mouse users; pointer tracking covers touch and pen.
    if (event.pointerType !== "mouse" && element.setPointerCapture) {
      element.setPointerCapture(event.pointerId);
    }
    palettePointerDrag = {
      referenceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    element.classList.add("is-dragging");
  });
  element.addEventListener("pointercancel", () => {
    palettePointerDrag = null;
    element.classList.remove("is-dragging");
  });
  element.addEventListener("click", () => {
    if (suppressPaletteClick) {
      suppressPaletteClick = false;
      return;
    }
    placePaletteReference(referenceId);
  });
  element.addEventListener("dragstart", (event) => {
    draggedReferenceId = referenceId;
    element.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", referenceId);
    event.dataTransfer.setData("application/x-bigplus-reference", referenceId);
  });
  element.addEventListener("dragend", () => {
    element.classList.remove("is-dragging");
    window.setTimeout(() => {
      draggedReferenceId = "";
    }, 0);
  });
}

window.addEventListener("pointermove", (event) => {
  if (!palettePointerDrag || event.pointerId !== palettePointerDrag.pointerId) return;
  if (Math.hypot(event.clientX - palettePointerDrag.startX, event.clientY - palettePointerDrag.startY) > 6) {
    palettePointerDrag.moved = true;
  }
}, true);

window.addEventListener("pointerup", (event) => {
  if (!palettePointerDrag || event.pointerId !== palettePointerDrag.pointerId) return;
  const drag = palettePointerDrag;
  palettePointerDrag = null;
  document.querySelectorAll(".reference-palette-item.is-dragging").forEach((item) => item.classList.remove("is-dragging"));
  if (!drag.moved) {
    suppressPaletteClick = true;
    placePaletteReference(drag.referenceId);
    return;
  }
  suppressPaletteClick = true;
  const rect = els.canvas.getBoundingClientRect();
  const overCanvas = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!overCanvas) return;
  if (!state.image) {
    setStatus("Välj bild först");
    updateGuidedOverlay();
    return;
  }
  placePaletteReference(drag.referenceId, getCanvasPoint(event));
}, true);

function referenceIdFromDrop(event) {
  return (
    draggedReferenceId ||
    event.dataTransfer.getData("application/x-bigplus-reference") ||
    event.dataTransfer.getData("text/plain") ||
    ""
  );
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
  renderCatches(getLocalCatches(currentUserId()).slice(-30).reverse());

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

async function loadTestImage() {
  try {
    const response = await fetch("http://localhost:4100/api/bigplus/test-image");
    if (!response.ok) throw new Error("Testbild saknas");
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const image = new Image();
    image.onload = () => {
      state.image = image;
      state.imageDataUrl = dataUrl;
      els.emptyState.classList.add("hidden");
      els.photoInputLabel.textContent = "Mät ny fisk";
      resetZoom();
      resetPoints();
      els.referenceSelect.value = "glasses";
      state.referenceSlots.active = "glasses";
      draw();
    };
    image.src = dataUrl;
  } catch {
    setStatus("Välj bild");
  }
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
      els.photoInputLabel.textContent = "Mät ny fisk";
      resetZoom();
      resetPoints();
      els.referenceSelect.value = "glasses";
      state.referenceSlots.active = "glasses";
      draw();
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
  const measuring = isActiveUnlockedMeasurementTool();
  if (state.glassesPlacement.active) {
    placeGlassesAtPoint(point, undefined, "Glasögon placerade");
    return;
  }
  if (!measuring && isInsideVirtualReference(point)) {
    if (state.virtualReference.locked) return;
    state.virtualReference.selected = true;
    draw();
    return;
  }
  if (!measuring && state.virtualReference.enabled && state.virtualReference.selected) {
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
    if (completedTool === "fish" || completedTool === "body") {
      state.measurementLocks[completedTool] = false;
      setStatus(completedTool === "fish" ? "Längd markerad" : "Höjd markerad");
    } else {
      setTool(nextToolAfterComplete(completedTool));
    }
  }
  invalidateResult();
  draw();
});

els.canvas.addEventListener("pointerdown", (event) => {
  if (!state.image) return;
  const screenPoint = getCanvasScreenPoint(event);
  const point = getCanvasPoint(event);
  const measuring = isActiveUnlockedMeasurementTool();
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

  if (!measuring && !state.virtualReference.locked) {
    const slotName = referenceSlotAtPoint(point);
    if (slotName && slotName !== state.referenceSlots.active) {
      loadReferenceSlot(slotName, true);
      setTool("ref");
      setStatus(slotName === "glasses" ? "Glasögon valda" : "Burk vald");
      draw();
      return;
    }
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

  const segmentIndex = hitMeasurementSegment(point);
  if (segmentIndex >= 0) {
    state.points.fish.splice(segmentIndex + 1, 0, point);
    state.pointDrag.dragging = true;
    state.pointDrag.tool = "fish";
    state.pointDrag.index = segmentIndex + 1;
    state.pointDrag.moved = false;
    state.view.suppressNextClick = true;
    invalidateResult();
    els.canvas.setPointerCapture(event.pointerId);
    draw();
    return;
  }

  if (!measuring && state.virtualReference.enabled && !state.virtualReference.selected && isInsideVirtualReference(point)) {
    if (state.virtualReference.locked) return;
    state.virtualReference.selected = true;
    state.virtualReference.suppressNextClick = true;
    draw();
    return;
  }

  const action = measuring ? "" : hitVirtualReferenceControl(point);
  if (action === "lock") {
    toggleReferencePlacementLock();
    state.view.suppressNextClick = true;
    return;
  }
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
  if (action === "scale") {
    const geometry = virtualReferenceGeometry();
    const local = localReferencePoint(point, geometry);
    state.virtualReference.scaleStartCenterX = geometry.centerX;
    state.virtualReference.scaleStartCenterY = geometry.centerY;
    state.virtualReference.scaleStartAngle = geometry.angle;
    state.virtualReference.scaleStartAxis = isGlassesReference() ? local.x : local.y;
    state.virtualReference.scaleStartLength = state.virtualReference.height;
  }
  els.canvas.setPointerCapture(event.pointerId);
});

els.canvas.addEventListener("pointermove", (event) => {
  if (state.faceDepthLine.dragging) {
    const point = getCanvasPoint(event);
    state.faceDepthLine.points[state.faceDepthLine.index] = point;
    state.virtualReference.faceDepthOffset = selectedFaceDepthOffset();
    invalidateResult();
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
      invalidateResult();
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
    const hoverAction = isActiveUnlockedMeasurementTool() ? "" : hitVirtualReferenceControl(point);
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
    const start = {
      centerX: state.virtualReference.scaleStartCenterX,
      centerY: state.virtualReference.scaleStartCenterY,
      angle: state.virtualReference.scaleStartAngle
    };
    const local = localReferencePoint(point, start);
    const axis = isGlassesReference() ? local.x : local.y;
    const maxReferenceSize = 5000;
    const visualLength = clamp(
      state.virtualReference.scaleStartLength + (axis - state.virtualReference.scaleStartAxis) * 2,
      5,
      5000
    );
    const anchorY = getPerspectiveAnchorY();
    const perspective = state.virtualReference.autoPerspective && anchorY !== null && state.virtualReference.depthMode !== "manual"
      ? perspectiveScaleForY(anchorY)
      : 1;
    state.virtualReference.baseHeight = clamp(visualLength / Math.max(0.1, perspective), 5, maxReferenceSize);
    els.referenceScaleRange.value = String(Math.round(state.virtualReference.baseHeight));
    state.virtualReference.height = state.virtualReference.baseHeight * perspective;
    const visualHeight = referenceVisualHeight(state.virtualReference.height);
    state.virtualReference.x = state.virtualReference.scaleStartCenterX
      - (state.virtualReference.height * selectedReferenceWidthRatio()) / 2;
    state.virtualReference.groundY = state.virtualReference.scaleStartCenterY + visualHeight / 2;
    if (state.virtualReference.depthMode === "fish") {
      state.virtualReference.lockedAnchorY = state.virtualReference.groundY;
    }
    state.virtualReference.y = state.virtualReference.groundY - visualHeight;
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
  invalidateResult();
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
    invalidateResult();
    draw();
  }
});

els.referenceRotationRange.addEventListener("input", () => {
  state.virtualReference.rotationDeg = Number(els.referenceRotationRange.value) || 0;
  if (state.virtualReference.enabled) {
    updateVirtualReferencePoints();
    invalidateResult();
    draw();
  } else {
    renderReferenceReadout();
  }
});

els.calibrationRange.addEventListener("input", () => {
  state.virtualReference.calibrationFactor = Number(els.calibrationRange.value) / 100 || 1;
  els.calibrationValue.textContent = `${Math.round(state.virtualReference.calibrationFactor * 100)}%`;
  invalidateResult();
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
    invalidateResult();
    draw();
  } else {
    renderReferenceReadout();
  }
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
    invalidateResult();
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
els.editLengthButton?.addEventListener("click", () => unlockMeasurement("fish"));
els.editHeightButton?.addEventListener("click", () => unlockMeasurement("body"));
els.lockLengthButton?.addEventListener("click", () => toggleMeasurementLock("fish"));
els.lockHeightButton?.addEventListener("click", () => toggleMeasurementLock("body"));
els.lockSizeChecklist?.addEventListener("click", toggleSizeChecklistLock);
els.simpleCanButton?.addEventListener("click", () => chooseSimpleReference("can-330"));
els.simpleGlassesButton?.addEventListener("click", () => chooseSimpleReference("glasses"));
els.lockReferenceButton.addEventListener("click", toggleReferenceLock);
els.lockReferenceChecklist?.addEventListener("click", toggleReferencePlacementLock);
els.checkGlasses?.querySelector(".check-label")?.addEventListener("click", () => editReferenceSlot("glasses"));
els.checkCan?.querySelector(".check-label")?.addEventListener("click", () => editReferenceSlot("can"));
els.checklistNextButton?.addEventListener("click", finishChecklistStep);
bindReferencePaletteItem(els.paletteGlasses, "glasses");
bindReferencePaletteItem(els.paletteCan, "can-330");
els.canvasWrap.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});
els.canvasWrap.addEventListener("drop", (event) => {
  event.preventDefault();
  if (!state.image) {
    setStatus("Välj bild först");
    updateGuidedOverlay();
    return;
  }
  const referenceId = referenceIdFromDrop(event);
  if (!["glasses", "can-330"].includes(referenceId)) return;
  placePaletteReference(referenceId, getCanvasPoint(event));
});
els.placeReferenceButton.addEventListener("click", placeVirtualReference);
els.placeGlassesReferenceButton.addEventListener("click", placeGlassesReference);
els.faceDepthToolButton.addEventListener("click", startFaceDepthLine);
els.placeHandReferenceButton.addEventListener("click", placeHandReference);
els.addReferenceButton.addEventListener("click", addReference);
els.removeReferenceButton.addEventListener("click", removeSelectedReference);
els.clearButton?.addEventListener("click", () => resetPoints());
els.resetButton.addEventListener("click", () => resetPoints({ clearImage: true }));
els.calculateButton.addEventListener("click", calculate);
els.saveButton.addEventListener("click", persistCatch);
window.addEventListener("resize", draw);

boot().catch((error) => {
  setStatus("Fel");
  console.error(error);
});
