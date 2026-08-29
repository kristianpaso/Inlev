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
} from "./api.js?v=20260731-modules";
import { compressImageFile } from "./shell/image-utils.js";
import { analyzeFishMeasurement } from "./measurement-engine.js?v=20260829-depth-v1";
import { segmentFish } from "./fish-segmentation.js?v=20260829-measure-v7";
import { buildDepthContext, getDepthFeatureConfig, requestDepthAnalysis } from "./depth-estimator.js?v=20260829-depth-v1";

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
  rulerVisible: false,
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
    can: null,
    ring: null,
    fish: null
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
  handGuides: [],
  handCalibration: null,
  fingerRing: {
    available: false,
    pixels: 0,
    referencePixels: 0,
    point: null,
    rotationDeg: 0,
    label: ""
  },
  handDepth: {
    available: false,
    relative: 0,
    scale: 1,
    label: ""
  },
  // The first V1 line is only a starting suggestion until the user confirms it.
  v1SeedLine: false,
  v1AnalysisPending: false,
  v1LandmarksConfirmed: false,
  v1LandmarksDetected: false,
  v1Segmentation: null,
  depthAnalysis: null,
  depthAnalysisId: "",
  poseContext: {
    available: false,
    sameShoulderHeight: false,
    armReach: 0,
    armAngle: 0,
    confidence: 0,
    label: ""
  },
  referenceDepth: {
    canBaselineHeight: null
  },
  lastResult: null,
  lastPayload: null
};

let draggedReferenceId = "";
let savingCatch = false;
let savingManualCatch = false;
let mediaPipeFaceLandmarkerPromise = null;
let mediaPipeHolisticLandmarkerPromise = null;
let mediaPipeHandLandmarkerPromise = null;
let faceDetectionError = false;
let holisticDetectionError = false;
let handDetectionError = false;
let palettePointerDrag = null;
let suppressPaletteClick = false;
const canvasTouchPointers = new Map();
const pinchReference = {
  active: false,
  startDistance: 0,
  startHeight: 150
};

const els = {
  connectionStatus: document.querySelector("#connectionStatus"),
  photoInput: document.querySelector("#photoInput"),
  photoInputLabel: document.querySelector("#photoInputLabel"),
  manualPhotoInput: document.querySelector("#manualPhotoInput"),
  cameraPhotoInput: document.querySelector("#cameraPhotoInput"),
  manualCaptureButton: document.querySelector("#manualCaptureButton"),
  guidedCaptureButton: document.querySelector("#guidedCaptureButton"),
  measureStepMenu: document.querySelector("#measureStepMenu"),
  guidedMeasureButton: document.querySelector("#guidedMeasureButton"),
  guidedResultPopup: document.querySelector("#guidedResultPopup"),
  guidedResultPopupClose: document.querySelector("#guidedResultPopupClose"),
  guidedLengthResult: document.querySelector("#guidedLengthResult"),
  guidedHeightResult: document.querySelector("#guidedHeightResult"),
  guidedSpeciesResult: document.querySelector("#guidedSpeciesResult"),
  guidedConfidenceResult: document.querySelector("#guidedConfidenceResult"),
  guidedRangeResult: document.querySelector("#guidedRangeResult"),
  guidedVersionResult: document.querySelector("#guidedVersionResult"),
  guidedResultChecks: document.querySelector("#guidedResultChecks"),
  guidedResultStatus: document.querySelector("#guidedResultStatus"),
  guidedPerspectiveResult: document.querySelector("#guidedPerspectiveResult"),
  guidedResultAdjust: document.querySelector("#guidedResultAdjust"),
  changeMeasurePhotoButton: document.querySelector("#changeMeasurePhotoButton"),
  cancelMeasureButton: document.querySelector("#cancelMeasureButton"),
  cameraCaptureButton: document.querySelector("#cameraCaptureButton"),
  manualEntryPanel: document.querySelector("#manualEntryPanel"),
  manualEntryImage: document.querySelector("#manualEntryImage"),
  manualSpeciesSelect: document.querySelector("#manualSpeciesSelect"),
  manualLengthInput: document.querySelector("#manualLengthInput"),
  manualWeightInput: document.querySelector("#manualWeightInput"),
  manualCatchNote: document.querySelector("#manualCatchNote"),
  chooseManualCatchLocation: document.querySelector("#chooseManualCatchLocation"),
  manualLocationPicker: document.querySelector("#manualLocationPicker"),
  manualLocationMap: document.querySelector("#manualLocationMap"),
  manualLocationLabel: document.querySelector("#manualLocationLabel"),
  clearManualCatchLocation: document.querySelector("#clearManualCatchLocation"),
  saveManualCatchButton: document.querySelector("#saveManualCatchButton"),
  manualBackButton: document.querySelector("#manualBackButton"),
  referenceSelect: document.querySelector("#referenceSelect"),
  customReferenceWrap: document.querySelector("#customReferenceWrap"),
  customReference: document.querySelector("#customReference"),
  placeReferenceButton: document.querySelector("#placeReferenceButton"),
  placeGlassesReferenceButton: document.querySelector("#placeGlassesReferenceButton"),
  placeHandReferenceButton: document.querySelector("#placeHandReferenceButton"),
  referenceScaleRange: document.querySelector("#referenceScaleRange"),
  mobileReferenceControls: document.querySelector("#mobileReferenceControls"),
  mobileReferenceScale: document.querySelector("#mobileReferenceScale"),
  mobileReferenceScaleValue: document.querySelector("#mobileReferenceScaleValue"),
  mobileScaleDown: document.querySelector("#mobileScaleDown"),
  mobileScaleUp: document.querySelector("#mobileScaleUp"),
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
  handCalibrationButton: document.querySelector("#handCalibrationButton"),
  handCalibrationDialog: document.querySelector("#handCalibrationDialog"),
  handCalibrationForm: document.querySelector("#handCalibrationForm"),
  handCalibrationFront: document.querySelector("#handCalibrationFront"),
  handCalibrationSide: document.querySelector("#handCalibrationSide"),
  calibratedFingerWidth: document.querySelector("#calibratedFingerWidth"),
  handCalibrationStatus: document.querySelector("#handCalibrationStatus"),
  handCalibrationSave: document.querySelector("#handCalibrationSave"),
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
  paletteFishReference: document.querySelector("#paletteFishReference"),
  lockGlassesPalette: document.querySelector("#lockGlassesPalette"),
  lockCanPalette: document.querySelector("#lockCanPalette"),
  lockFishPalette: document.querySelector("#lockFishPalette"),
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
  lengthCard: document.querySelector("#lengthCard"),
  heightCard: document.querySelector("#heightCard"),
  rulerToggleButton: document.querySelector("#rulerToggleButton"),
  lengthCardValue: document.querySelector("#lengthCardValue"),
  heightCardValue: document.querySelector("#heightCardValue"),
  checklistNextButton: document.querySelector("#checklistNextButton"),
  checklistStepTitle: document.querySelector("#checklistStepTitle"),
  checklistStepText: document.querySelector("#checklistStepText"),
  calculateButton: document.querySelector("#calculateButton"),
  measureNewFishButton: document.querySelector("#measureNewFishButton"),
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
  resultPhoto: document.querySelector("#resultPhoto"),
  resultSpecies: document.querySelector("#resultSpecies"),
  resultSpeciesLatin: document.querySelector("#resultSpeciesLatin"),
  resultMeasureAgain: document.querySelector("#resultMeasureAgain"),
  measureTargetSummary: document.querySelector("#measureTargetSummary"),
  measureTargetSummaryText: document.querySelector("#measureTargetSummaryText"),
  measureStatusSummary: document.querySelector("#measureStatusSummary"),
  measureStatusSummaryText: document.querySelector("#measureStatusSummaryText"),
  measureProgressPanel: document.querySelector("#measureProgressPanel"),
  measurePhotoProgress: document.querySelector("#measurePhotoProgress"),
  measureReferenceProgress: document.querySelector("#measureReferenceProgress"),
  measureLengthProgress: document.querySelector("#measureLengthProgress"),
  measureHeightProgress: document.querySelector("#measureHeightProgress"),
  measureResultProgress: document.querySelector("#measureResultProgress"),
  bigStatus: document.querySelector("#bigStatus"),
  lengthResult: document.querySelector("#lengthResult"),
  weightResult: document.querySelector("#weightResult"),
  bodyDepthResult: document.querySelector("#bodyDepthResult"),
  limitResult: document.querySelector("#limitResult"),
  confidenceResult: document.querySelector("#confidenceResult"),
  catchNote: document.querySelector("#catchNote"),
  chooseCatchLocation: document.querySelector("#chooseCatchLocation"),
  useCurrentCatchLocation: document.querySelector("#useCurrentCatchLocation"),
  catchLocationPicker: document.querySelector("#catchLocationPicker"),
  catchLocationMap: document.querySelector("#catchLocationMap"),
  catchLocationLabel: document.querySelector("#catchLocationLabel"),
  clearCatchLocation: document.querySelector("#clearCatchLocation"),
  resultSaveHint: document.querySelector("#resultSaveHint"),
  disclaimer: document.querySelector("#disclaimer"),
  catchLog: document.querySelector("#catchLog")
};

const ctx = els.canvas.getContext("2d");
let catchLocationPickerMap = null;
let catchLocationPickerMarker = null;
let selectedCatchLocation = null;
let manualLocationPickerMap = null;
let manualLocationPickerMarker = null;
let selectedManualCatchLocation = null;
const classicCanReferenceImage = new Image();
classicCanReferenceImage.decoding = "async";
classicCanReferenceImage.src = "/bigplus/assets/can-ring-calibration.png?v=20260825-ring-can-1";
classicCanReferenceImage.addEventListener("load", draw);
const CLASSIC_CAN_IMAGE_BOUNDS = {
  x: 0,
  y: 0,
  width: 597,
  height: 1060
};
// Keep the automatic overlay tied to the physical reference dimensions. Any
// perspective correction comes from the detected hand depth, not a sample-
// specific percentage.
const AUTO_CAN_SIZE_FACTOR = 1.12;
const FINGER_WIDTH_CM = 2;
const RING_OUTER_WIDTH_CM = 2.25;
const RING_HOLE_WIDTH_CM = 2;
const FINGER_PROXY_FACTOR = 3.52;
const FINGER_CALC_FACTOR = 2.90;
const CAN_REFERENCE_CORRECTION = 0.76;
const CAN_HEIGHT_CM = 11.5;
const FULL_GRIP_SPAN_CORRECTION = 4 / 3;
const glassesReferenceImage = new Image();
glassesReferenceImage.decoding = "async";
glassesReferenceImage.src = "/bigplus/assets/glasses-reference.png?v=20260720";
glassesReferenceImage.addEventListener("load", draw);
const fingerRingReferenceImage = new Image();
fingerRingReferenceImage.decoding = "async";
fingerRingReferenceImage.src = "/bigplus/assets/ring-reference.png?v=20260824-ring-2cm";
fingerRingReferenceImage.addEventListener("load", draw);

function setStatus(text) {
  if (els.connectionStatus) els.connectionStatus.textContent = text;
}

function preferredUnit() {
  return localStorage.getItem("bigplus_unit") === "inch" ? "inch" : "cm";
}

function formatCm(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "--";
  return preferredUnit() === "inch"
    ? `${(numericValue / 2.54).toFixed(1)} inch`
    : `${numericValue.toFixed(1)} cm`;
}

function formatKgRange(weight) {
  if (Number.isFinite(Number(weight))) return `${Number(weight).toFixed(2)} kg`;
  return `${weight.low.toFixed(1)}-${weight.high.toFixed(1)} kg`;
}

function parseManualNumber(value) {
  return Number(String(value ?? "").trim().replace(",", "."));
}

function setCalibrationPercent(percent) {
  const normalized = clamp(Number(percent) || 100, 70, 110);
  state.virtualReference.calibrationFactor = normalized / 100;
  if (els.calibrationRange) els.calibrationRange.value = String(Math.round(normalized));
  if (els.calibrationValue) els.calibrationValue.textContent = `${Math.round(normalized)}%`;
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

function currentMemberships() {
  if (Array.isArray(window.bigplusCompetitionIds)) return window.bigplusCompetitionIds;
  const key = `bigplus_competition_memberships:${currentUserId() || "guest"}`;
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function updateReferenceSpecificControls() {
  const glasses = isGlassesReference();
  els.faceDepthWrap?.classList.toggle("hidden", !glasses);
  els.faceDepthToolButton?.classList.toggle("active", glasses && state.faceDepthLine.active);
  updateFaceDepthResult();
  if (glasses) {
    setCalibrationPercent(100);
  }
  syncMobileReferenceControls();
}

function syncMobileReferenceControls() {
  if (!els.mobileReferenceControls) return;
  const active = Boolean(state.image && state.virtualReference.enabled && state.virtualReference.selected && !state.virtualReference.locked);
  els.mobileReferenceControls.classList.toggle("hidden", !active);
  if (!active) return;

  const height = clamp(Number(state.virtualReference.baseHeight) || 150, 40, 500);
  els.mobileReferenceScale.value = String(height);
  if (els.mobileReferenceScaleValue) {
    els.mobileReferenceScaleValue.textContent = `${Math.round((height / 150) * 100)}%`;
  }

  const canvasRect = els.canvas.getBoundingClientRect();
  const wrapRect = els.canvasWrap.getBoundingClientRect();
  if (!canvasRect.width || !canvasRect.height || !wrapRect.width || !wrapRect.height) return;
  const geometry = virtualReferenceGeometry();
  const scaleX = canvasRect.width / els.canvas.width;
  const scaleY = canvasRect.height / els.canvas.height;
  const centerX = (geometry.centerX * state.view.zoom + state.view.panX) * scaleX + (canvasRect.left - wrapRect.left);
  const bottomY = ((geometry.y + geometry.height) * state.view.zoom + state.view.panY) * scaleY + (canvasRect.top - wrapRect.top) + 62;
  const panelWidth = Math.min(360, wrapRect.width - 20);
  const panelHeight = els.mobileReferenceControls.offsetHeight || 86;
  els.mobileReferenceControls.style.width = `${panelWidth}px`;
  els.mobileReferenceControls.style.left = `${clamp(centerX, panelWidth / 2 + 10, wrapRect.width - panelWidth / 2 - 10)}px`;
  els.mobileReferenceControls.style.top = `${clamp(bottomY, 10, wrapRect.height - panelHeight - 10)}px`;
}

function setMobileReferenceScale(value) {
  if (!state.virtualReference.enabled || state.virtualReference.locked) return;
  const nextHeight = clamp(Number(value) || state.virtualReference.baseHeight || 150, 40, 500);
  state.virtualReference.baseHeight = nextHeight;
  state.virtualReference.height = nextHeight;
  state.virtualReference.y = state.virtualReference.groundY - nextHeight;
  updateVirtualReferenceHeightFromPerspective();
  updateVirtualReferencePoints();
  syncActiveReferenceSlot();
  invalidateResult();
  syncMobileReferenceControls();
  draw();
}

function renderReferenceOptions() {
  els.referenceSelect.innerHTML = state.references
    .map((item) => {
      const dimensions = item.widthCm && item.heightCm
        ? ` (${item.widthCm} x ${item.heightCm} cm)`
        : item.sizeCm
          ? ` (${item.sizeCm} cm)`
          : "";
      return `<option value="${item.id}">${item.name}${dimensions}</option>`;
    })
    .join("") + `<option value="fish-reference">Fiskreferens (valfri)</option>`;
  updateSimpleReferenceButtons();
}

function renderSpeciesOptions() {
  const options = `<option value="">Välj art</option>` + state.species
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join("");
  els.speciesSelect.innerHTML = options;
  if (els.manualSpeciesSelect) els.manualSpeciesSelect.innerHTML = options;
}

function updateMeasureTargetSummary() {
  const selected = state.species.find((item) => item.id === els.speciesSelect.value);
  if (els.measureTargetSummary) els.measureTargetSummary.textContent = selected?.minCm ? formatCm(selected.minCm) : "–";
  if (els.measureTargetSummaryText) els.measureTargetSummaryText.textContent = selected?.minCm ? "Minimimått" : "Ej valt";
}

function updateProgressItem(name, options = {}) {
  const item = document.querySelector(`[data-progress-item="${name}"]`);
  if (!item) return;
  item.classList.toggle("is-done", Boolean(options.done));
  item.classList.toggle("is-active", Boolean(options.active));
  item.classList.toggle("is-warn", Boolean(options.warn));
}

function updateMeasureProgress() {
  const hasImage = Boolean(state.image);
  const referenceFreeMode = document.body.classList.contains("measure-v1-active");
  const referencesLocked = Boolean(
    state.referenceSlots.glasses?.virtual?.locked &&
    state.referenceSlots.can?.virtual?.locked
  );
  const hasAnyReference = Boolean(state.referenceSlots.glasses || state.referenceSlots.can);
  const lengthReady = state.points.fish.length >= 2
    && (!referenceFreeMode || !state.v1SeedLine);
  const heightReady = state.points.body.length >= 2;
  const lengthLocked = Boolean(state.measurementLocks.fish);
  const heightLocked = Boolean(state.measurementLocks.body);
  const hasResult = Boolean(state.lastResult);
  const guidedMeasureReady = referenceFreeMode
    ? Boolean(hasImage && lengthReady)
    : Boolean(hasImage && state.referenceSlots.glasses && state.referenceSlots.can && lengthReady && heightReady);
  const guidedButtonEnabled = referenceFreeMode ? hasImage : guidedMeasureReady;
  const canUseGuidedButton = guidedButtonEnabled && !state.v1AnalysisPending;
  els.guidedMeasureButton?.classList.toggle("is-ready", guidedMeasureReady);
  els.guidedMeasureButton?.classList.toggle("is-analyzing", state.v1AnalysisPending);
  if (els.guidedMeasureButton) {
    els.guidedMeasureButton.disabled = !canUseGuidedButton;
    els.guidedMeasureButton.setAttribute("aria-disabled", String(!canUseGuidedButton));
    const label = els.guidedMeasureButton.querySelector(".measure-tool-label");
    if (label) label.textContent = state.v1AnalysisPending ? "Analyserar..." : "Mät fisken";
    els.guidedMeasureButton.title = state.v1AnalysisPending
      ? "Analyserar bilden"
      : guidedMeasureReady
      ? "Räkna ut fiskens längd"
      : "Markera först fiskens nos och stjärt i bilden";
  }

  if (els.measurePhotoProgress) els.measurePhotoProgress.textContent = hasImage ? "Vald" : "Väntar";
  if (els.measureReferenceProgress) {
    els.measureReferenceProgress.textContent = referencesLocked
      ? "Låst"
      : hasAnyReference
        ? "Lås"
        : "Saknas";
  }
  if (els.measureLengthProgress) els.measureLengthProgress.textContent = lengthLocked ? "Låst" : lengthReady ? "Klar" : "Ej klar";
  if (els.measureHeightProgress) els.measureHeightProgress.textContent = heightLocked ? "Låst" : heightReady ? "Klar" : "Ej klar";
  if (els.measureResultProgress) els.measureResultProgress.textContent = hasResult ? state.lastResult.status : "Väntar";

  updateProgressItem("photo", { done: hasImage, active: !hasImage });
  updateProgressItem("reference", { done: referencesLocked, active: hasImage && !referencesLocked });
  updateProgressItem("length", { done: lengthLocked, active: referencesLocked && !lengthLocked });
  updateProgressItem("height", { done: heightLocked, active: lengthLocked && !heightLocked });
  updateProgressItem("result", {
    done: hasResult,
    active: referencesLocked && lengthLocked && heightLocked && !hasResult,
    warn: hasResult && state.lastResult.status !== "BIGPLUS"
  });

  if (els.resultSaveHint) {
    if (!hasResult) {
      els.resultSaveHint.textContent = "Mät fisken innan fångsten sparas.";
    } else if (state.lastResult.status === "BIGPLUS") {
      els.resultSaveHint.textContent = "Resultatet är klart. Lägg till plats eller anteckning om du vill och spara fångsten.";
    } else {
      els.resultSaveHint.textContent = "Resultatet är klart men behöver kontrolleras mot lokala regler innan du sparar.";
    }
  }
}

function manualCatchStatus(species, lengthCm) {
  if (!species?.minCm) return "KOLLA";
  return lengthCm >= species.minCm ? "BIGPLUS" : "SLÄPP";
}

function updateManualEntryState() {
  const speciesId = els.manualSpeciesSelect?.value || "";
  const species = state.species.find((item) => item.id === speciesId);
  const lengthCm = parseManualNumber(els.manualLengthInput?.value);
  const weightKg = parseManualNumber(els.manualWeightInput?.value);
  const ready = Boolean(
    state.imageDataUrl &&
    species &&
    Number.isFinite(lengthCm) &&
    lengthCm > 0 &&
    Number.isFinite(weightKg) &&
    weightKg >= 0
  );
  if (els.saveManualCatchButton) {
    els.saveManualCatchButton.disabled = savingManualCatch || !ready;
  }
  if (ready) {
    setStatus(manualCatchStatus(species, lengthCm));
  }
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

function requiredMeasurementPoints(tool) {
  return 2;
}

function bodyMeasurementValues(points = state.points.body) {
  const values = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    values.push(distance([points[index], points[index + 1]]));
  }
  return values;
}

function bodyMeasurementPixels(points = state.points.body) {
  const values = bodyMeasurementValues(points).sort((a, b) => a - b);
  if (!values.length) return 0;
  return values[Math.floor(values.length / 2)];
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
  if (els.zoomValue) els.zoomValue.textContent = `${Math.round(state.view.zoom * 100)}%`;
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

function activeReferenceId() {
  return state.virtualReference.enabled
    ? state.virtualReference.referenceId
    : els.referenceSelect.value;
}

function isGlassesReference() {
  return activeReferenceId() === "glasses";
}

function referenceSlotNameForId(referenceId = els.referenceSelect.value) {
  if (referenceId === "glasses") return "glasses";
  if (referenceId === "can-330") return "can";
  if (referenceId === "ring-2cm") return "ring";
  if (referenceId === "fish-reference") return "fish";
  return "";
}

function clonePoints(points) {
  return points.map((point) => ({ x: point.x, y: point.y }));
}

function updateSimpleReferenceButtons() {
  const glassesReady = Boolean(state.referenceSlots.glasses) || state.referenceSlots.active === "glasses";
  const canReady = Boolean(state.referenceSlots.can) || state.referenceSlots.active === "can";
  const fishReady = Boolean(state.referenceSlots.fish) || state.referenceSlots.active === "fish";
  els.simpleGlassesButton?.classList.toggle("active", glassesReady);
  els.simpleCanButton?.classList.toggle("active", canReady);
  if (els.paletteCan) {
    const canEnabled = Boolean(state.referenceSlots.glasses?.virtual?.locked);
    els.paletteCan.disabled = !canEnabled;
    els.paletteCan.draggable = true;
    els.paletteCan.title = canEnabled ? "Skapa burk i bilden" : "Lås glasögonen först";
    els.paletteCan.classList.toggle("is-next-step", Boolean(state.image && canEnabled && !state.referenceSlots.can));
    els.paletteCan.classList.toggle("is-complete", Boolean(state.referenceSlots.can?.virtual?.locked));
    els.paletteCan.classList.toggle("is-active-reference", state.referenceSlots.active === "can" && state.virtualReference.enabled && state.virtualReference.selected && !state.virtualReference.locked);
    els.lockCanPalette?.classList.toggle("is-locked", Boolean(state.referenceSlots.can?.virtual?.locked));
  }
  if (els.paletteGlasses) {
    els.paletteGlasses.disabled = false;
    els.paletteGlasses.draggable = true;
    els.paletteGlasses.classList.toggle("is-next-step", Boolean(state.image && !state.referenceSlots.glasses));
    els.paletteGlasses.classList.toggle("is-complete", Boolean(state.referenceSlots.glasses?.virtual?.locked));
    els.paletteGlasses.classList.toggle("is-active-reference", state.referenceSlots.active === "glasses" && state.virtualReference.enabled && state.virtualReference.selected && !state.virtualReference.locked);
    els.lockGlassesPalette?.classList.toggle("is-locked", Boolean(state.referenceSlots.glasses?.virtual?.locked));
    els.paletteGlasses.title = state.image && !state.referenceSlots.glasses
      ? "Skapa glasögon i bilden"
      : "Skapa eller redigera glasögonen";
  }
  if (els.paletteFishReference) {
    const fishEnabled = Boolean(state.referenceSlots.can?.virtual?.locked);
    els.paletteFishReference.disabled = !fishEnabled;
    els.paletteFishReference.draggable = fishEnabled;
    els.paletteFishReference.title = fishEnabled ? "Skapa fiskreferens i bilden" : "Lås burken först";
    els.paletteFishReference.classList.toggle("is-next-step", Boolean(state.image && fishEnabled && !state.referenceSlots.fish));
    els.paletteFishReference.classList.toggle("is-complete", Boolean(state.referenceSlots.fish?.virtual?.locked));
    els.paletteFishReference.classList.toggle("is-active-reference", state.referenceSlots.active === "fish" && state.virtualReference.enabled && state.virtualReference.selected && !state.virtualReference.locked);
    els.lockFishPalette?.classList.toggle("is-locked", Boolean(state.referenceSlots.fish?.virtual?.locked));
  }
  if (els.simpleGlassesButton) {
    els.simpleGlassesButton.textContent = state.referenceSlots.glasses ? "Glasögon klar" : "1 Glasögon";
  }
  if (els.simpleCanButton) {
    els.simpleCanButton.textContent = state.referenceSlots.can ? "Burk klar" : "+ Burk";
  }
}

function togglePaletteReferenceLock(slotName) {
  const slot = state.referenceSlots[slotName];
  if (!slot?.virtual) {
    setStatus("Placera referensen först");
    return;
  }
  if (slot.virtual.locked) {
    editReferenceSlot(slotName);
    return;
  }
  if (state.referenceSlots.active !== slotName || !state.virtualReference.enabled) {
    loadReferenceSlot(slotName, true);
  }
  slot.virtual.locked = true;
  slot.virtual.selected = false;
  slot.virtual.dragging = false;
  if (state.referenceSlots.active === slotName) {
    state.virtualReference.locked = true;
    state.virtualReference.selected = false;
  }
  if (slotName === "glasses") {
    state.referenceSlots.active = "glasses";
    state.virtualReference.referenceId = "glasses";
    // Keep the workflow in reference mode until the can is created explicitly.
    setTool("ref");
    setStatus("Glasögon klara. Skapa burk.");
  } else if (slotName === "fish") {
    state.referenceSlots.active = "fish";
    state.virtualReference.referenceId = "fish-reference";
    setTool("ref");
    setStatus("Fiskreferens klar");
  } else {
    state.referenceSlots.active = "can";
    state.virtualReference.referenceId = "can-330";
    if (areAllReferencesLocked()) {
      setTool("fish");
      setStatus("Referenser klara. Markera längd.");
    } else {
      setTool("ref");
      setStatus("Burk klar");
    }
  }
  updateSimpleReferenceButtons();
  updateGuidedOverlay();
  if (slotName === "glasses" && !state.referenceSlots.can) {
    els.paletteCan?.focus();
  }
  draw();
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
  setStatus(slotName === "glasses" ? "Glasögon upplåsta" : slotName === "fish" ? "Fiskreferens upplåst" : "Burk upplåst");
  updateReferenceLockButton();
  updateReferenceChecklistLockButton();
  updateSimpleReferenceButtons();
  draw();
}

function guidedStepText() {
  if (!state.image) return "";
  const glasses = state.referenceSlots.glasses;
  const can = state.referenceSlots.can;
  if (!glasses) return "Tryck på Skapa glasögon.";
  if (!glasses.virtual?.locked) return "Placera glasögonen och lås dem.";
  if (!can) return "Tryck på Skapa burk.";
  if (!can.virtual?.locked) return "Placera burken och lås den.";
  if (state.points.fish.length < 2) return "Dra längdlinjen från nos till stjärt.";
  if (!state.measurementLocks.fish) return "Kontrollera längden och lås markeringen.";
  if (state.points.body.length < 2) return "Markera höjden från rygg till buk.";
  if (!state.measurementLocks.body) return "Kontrollera höjden och lås markeringen.";
  return "";
}

function updateGuidedOverlay() {
  if (!els.guidedOverlay || !els.guidedBubble || !els.canvasWrap) return;
  const text = guidedStepText();
  els.guidedOverlay.classList.add("hidden");
  els.canvasWrap.classList.remove("is-guided");
  els.guidedBubble.textContent = text;
  const targets = [els.photoInputLabel, els.paletteGlasses, els.paletteCan, els.lengthCard, els.heightCard];
  targets.forEach((target) => target?.classList.remove("process-target"));
  if (!state.image) return;
  if (!state.referenceSlots.glasses || !state.referenceSlots.glasses.virtual?.locked) {
    els.paletteGlasses?.classList.add("process-target");
    els.paletteGlasses?.setAttribute("data-guidance", state.referenceSlots.glasses ? "Placera glasögonen och lås dem." : "Tryck på Skapa glasögon.");
  } else if (!state.referenceSlots.can || !state.referenceSlots.can.virtual?.locked) {
    els.paletteCan?.classList.add("process-target");
    els.paletteCan?.setAttribute("data-guidance", state.referenceSlots.can ? "Placera burken och lås den." : "Tryck på Skapa burk.");
  } else if (state.points.fish.length < 2 || !state.measurementLocks.fish) {
    els.lengthCard?.classList.add("process-target");
    els.lengthCard?.setAttribute("data-guidance", state.points.fish.length < 2 ? "Markera fiskens längd." : "Kontrollera längden och lås den.");
  } else if (state.points.body.length < 2 || !state.measurementLocks.body) {
    els.heightCard?.classList.add("process-target");
    els.heightCard?.setAttribute("data-guidance", state.points.body.length < 2 ? "Markera höjden från rygg till buk." : "Kontrollera höjden och lås den.");
  }
}

function isAnyReferenceLocked() {
  return Boolean(
    state.referenceSlots.glasses?.virtual?.locked ||
    state.referenceSlots.can?.virtual?.locked ||
    state.referenceSlots.fish?.virtual?.locked ||
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
  const hasReference = Boolean(state.referenceSlots.glasses || state.referenceSlots.can || state.referenceSlots.fish || state.virtualReference.enabled);
  const locked = areAllReferencesLocked();
  button.disabled = !hasReference;
  button.classList.toggle("is-locked", locked);
  button.setAttribute("aria-label", locked ? "Lås upp referenser" : "Lås referenser");
  button.title = locked ? "Lås upp referenser" : "Lås referenser";
}

function setReferencePlacementLock(locked) {
  ["glasses", "can", "fish"].forEach((slotName) => {
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

  const slotName = state.referenceSlots.active || referenceSlotNameForId(state.virtualReference.referenceId);
  const slot = slotName ? state.referenceSlots[slotName] : null;
  const shouldUnlock = Boolean(slot?.virtual?.locked || state.virtualReference.locked);

  // Canvas lock and palette lock must operate on the same active object.
  // Do not lock every reference here: the can is intentionally a separate step.
  if (slot?.virtual) {
    slot.virtual.locked = !shouldUnlock;
    slot.virtual.selected = shouldUnlock;
    slot.virtual.dragging = false;
    slot.virtual.pointerAction = "";
    els.referenceSelect.value = slot.referenceId;
  }
  state.virtualReference.locked = !shouldUnlock;
  state.virtualReference.selected = shouldUnlock;
  state.virtualReference.dragging = false;
  state.virtualReference.pointerAction = "";

  if (shouldUnlock) {
    setTool("ref");
    setStatus(slotName === "can" ? "Burk upplåst" : slotName === "fish" ? "Fiskreferens upplåst" : "Glasögon upplåsta");
  } else if (slotName === "glasses") {
    setTool("ref");
    setStatus("Glasögon klara. Skapa burk.");
  } else if (slotName === "fish") {
    setTool("ref");
    setStatus("Fiskreferens låst");
  } else if (slotName === "can" && areAllReferencesLocked()) {
    setTool("fish");
    setStatus("Referenser klara. Markera längd.");
  } else {
    setTool("ref");
    setStatus("Referens låst");
  }
  syncActiveReferenceSlot();
  updateSimpleReferenceButtons();
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
    const card = tool === "fish" ? els.lengthCard : els.heightCard;
    card?.classList.toggle("is-locked", locked);
    card?.classList.toggle("is-ready", canLock);
    card?.classList.toggle("is-active", state.activeTool === tool && !locked);
    button.setAttribute("aria-label", locked ? `Lås upp ${label}` : `Lås ${label}`);
    button.title = locked ? `Lås upp ${label}` : `Lås ${label}`;
  };

  updateButton(els.lockLengthButton, "fish", "längd");
  updateButton(els.lockHeightButton, "body", "höjd");
  if (els.lengthCardValue) els.lengthCardValue.textContent = state.points.fish.length >= 2 ? "Klar" : "Ej klar";
  if (els.heightCardValue) els.heightCardValue.textContent = state.points.body.length >= 2 ? "Klar" : "Ej klar";
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
  updateMeasureProgress();
}

function invalidateResult() {
  state.lastResult = null;
  state.lastPayload = null;
  els.saveButton.disabled = true;
  renderResult(null);
}

function lockMeasurement(tool) {
  if ((tool !== "fish" && tool !== "body") || state.points[tool].length < requiredMeasurementPoints(tool)) return;
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
  if (state.points[tool].length < requiredMeasurementPoints(tool)) {
    unlockMeasurement(tool);
    return;
  }

  if (state.measurementLocks[tool]) {
    unlockMeasurement(tool);
    return;
  }

  lockMeasurement(tool);
  if (tool === "fish") {
    setTool("body");
    setStatus("Längd låst. Markera höjd.");
  } else {
    setStatus("Höjd låst");
  }
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
    referenceId: state.virtualReference.referenceId || els.referenceSelect.value,
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
  const activeId = state.virtualReference.referenceId || els.referenceSelect.value;
  const slotName = referenceSlotNameForId(activeId);
  if (!slotName || !state.virtualReference.enabled || state.points.ref.length < 2) return;
  state.referenceSlots.active = slotName;
  state.referenceSlots[slotName] = {
    referenceId: activeId,
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
  if (slot.referenceId === "can-330") return base * CAN_REFERENCE_CORRECTION;
  return slot.referenceId === "glasses"
    ? base * (1 - (slot.virtual?.faceDepthOffset || 0))
    : base;
}

function referenceScalesForCalculation() {
  syncActiveReferenceSlot();
  const slots = [state.referenceSlots.ring, state.referenceSlots.can, state.referenceSlots.glasses].filter(Boolean);
  const scales = slots
    .filter((slot) => slot.points?.length === 2 && distance(slot.points) > 0)
    .map((slot) => ({
      referenceId: slot.referenceId,
      scaleCmPerPixel: (slot.refCm * slotCalibrationFactor(slot)) / distance(slot.points)
    }));

  const lockedRing = scales.find((item) => item.referenceId === "ring-2cm");
  const detectedRing = state.fingerRing.available && state.fingerRing.pixels > 0
    ? {
        referenceId: "ring-finger-auto",
        scaleCmPerPixel: RING_HOLE_WIDTH_CM / state.fingerRing.pixels,
        confidence: 0.78,
        weight: 0.88,
        method: "ring_finger"
      }
    : null;
  const ring = lockedRing || detectedRing;

  // The can is the primary physical scale at the fish's plane. A visible ring
  // calibrates an uncertain can, but does not replace it: this lets both the
  // can size control and the known 2 cm finger opening affect the result.
  const glasses = state.referenceSlots.glasses;
  const can = scales.find((item) => item.referenceId === "can-330");
  const candidates = [];
  if (can) candidates.push({ ...can, method: "can", confidence: 0.55, weight: 0.55 });
  if (ring) candidates.push({ ...ring, method: lockedRing ? "ring" : "ring_finger", confidence: lockedRing ? 0.72 : 0.78, weight: lockedRing ? 0.72 : 0.88 });
  if (can && ring) {
    const ringToCan = clamp(ring.scaleCmPerPixel / can.scaleCmPerPixel, 0.70, 1.30);
    candidates.push({
      referenceId: "can-ring-calibrated",
      method: "can_ring_fusion",
      scaleCmPerPixel: can.scaleCmPerPixel * Math.pow(ringToCan, 0.35),
      confidence: 0.68,
      weight: 0.78
    });
  }
  if (candidates.length) return candidates;

  // Glasses and hand depth describe the perspective context when no physical
  // object reference has been placed.
  if (glasses?.points?.length === 2 && distance(glasses.points) > 0 && state.handDepth.available) {
    const objectDepthScale = clamp(state.handDepth.scale || 1, 0.75, 1.35);
    const facePlaneScale = (glasses.refCm * (glasses.virtual?.calibrationFactor || 1)) / distance(glasses.points);
    return [{ referenceId: "hand-fish-plane", method: "face_depth", scaleCmPerPixel: facePlaneScale / objectDepthScale, confidence: 0.35, weight: 0.20 }];
  }

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
  return scales[0].scaleCmPerPixel;
}

function canPerspectiveRatio() {
  return state.handDepth.available ? clamp(state.handDepth.scale || 1, 0.75, 1.35) : null;
}

function canPerspectiveLabel() {
  if (state.fingerRing.available && state.fingerRing.pixels > 0) {
    return "Ringreferensen används för fiskens plan och skala.";
  }
  const ratio = canPerspectiveRatio();
  if (ratio === null) return "Ingen burkjustering registrerad.";
  const change = Math.round(Math.abs(ratio - 1) * 100);
  if (change < 2) return "Fisk och burk ligger nära ansiktets djupplan.";
  return ratio > 1
    ? `Fisk och burk hålls ungefär ${change}% närmare kameran än ansiktsplanet.`
    : `Fisk och burk hålls ungefär ${change}% längre bort än ansiktsplanet.`;
}

function glassesBasedCanHeight() {
  const glasses = state.referenceSlots.glasses;
  const glassesPixels = glasses?.points?.length === 2 ? distance(glasses.points) : 0;
  const objectDepthScale = combinedObjectDepthScale();
  return glassesPixels ? glassesPixels * (11.5 / 14) * objectDepthScale * AUTO_CAN_SIZE_FACTOR : 0;
}

function combinedObjectDepthScale() {
  const handScale = state.handDepth.available ? clamp(state.handDepth.scale || 1, 0.88, 1.12) : null;
  const pose = state.poseContext;
  // Pose z is useful only as a gentle correction. It is not metric depth.
  const poseScale = pose?.available && Number.isFinite(pose.wristZ)
    ? clamp(1 - pose.wristZ * 0.08, 0.94, 1.06)
    : null;
  if (handScale === null && poseScale === null) return 1;
  if (handScale === null) return poseScale;
  if (poseScale === null) return handScale;
  const poseWeight = pose.sameShoulderHeight ? 0.35 : 0.15;
  return clamp(handScale * (1 - poseWeight) + poseScale * poseWeight, 0.88, 1.12);
}

function fingerPlaneScale() {
  if (!state.fingerRing.available || state.fingerRing.pixels <= 0) return 1;
  const glasses = state.referenceSlots.glasses;
  const glassesPixels = glasses?.points?.length === 2 ? distance(glasses.points) : 0;
  const referencePixels = state.fingerRing.referencePixels || glassesPixels * (RING_HOLE_WIDTH_CM / 14);
  if (!referencePixels) return 1;
  return clamp(state.fingerRing.pixels / referencePixels, 0.85, 1.45);
}

function selectedReferenceWidthRatio(referenceId = activeReferenceId()) {
  const reference = state.references.find((item) => item.id === referenceId);
  if (reference?.widthCm > 0 && reference?.heightCm > 0) {
    return reference.widthCm / reference.heightCm;
  }
  if (referenceId === "glasses") return 1;
  if (referenceId === "ring-2cm") return 1024 / 417;
  if (referenceId === "can-330") return 0.57;
  if (referenceId === "can-330-slim") return 0.4;
  if (referenceId === "can-500") return 0.39;
  return 0.42;
}

function referenceVisualHeight(measureLength, referenceId = activeReferenceId()) {
  const reference = state.references.find((item) => item.id === referenceId);
  if (reference?.widthCm > 0 && reference?.heightCm > 0) {
    return referenceId === "glasses"
      ? measureLength * (reference.heightCm / reference.widthCm)
      : measureLength;
  }
  return referenceId === "glasses" ? measureLength * 0.36 : measureLength;
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

  const referenceId = state.virtualReference.referenceId || els.referenceSelect.value;
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
  if (isGlassesReference() || activeReferenceId() === "ring-2cm") {
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
  const slotNames = ["glasses", "can", "ring"];
  return slotNames.find((slotName) => referenceSlotContainsPoint(slotName, point)) || "";
}

function virtualReferenceHandles() {
  const rect = virtualReferenceGeometry();
  return {
    rotate: rotateLocalPoint(rect.centerX, rect.centerY, 0, -rect.height / 2 - 34, rect.angle),
    scale: rotateLocalPoint(rect.centerX, rect.centerY, rect.width / 2 + 16, rect.height / 2 + 16, rect.angle),
    lock: rotateLocalPoint(rect.centerX, rect.centerY, rect.width / 2 + 50, rect.height / 2 + 16, rect.angle),
    move: rotateLocalPoint(rect.centerX, rect.centerY, rect.width / 2 + 34, 0, rect.angle)
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
  const handles = virtualReferenceHandles();
  if (pointDistance(point, handles.lock) <= 20) return "lock";
  if (state.virtualReference.locked) return "";
  if (pointDistance(point, handles.move) <= 22) return "move";
  if (!state.virtualReference.selected) return "";
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

function transformImagePoint(point, oldFrame, newFrame) {
  if (!point || !oldFrame.drawWidth || !oldFrame.drawHeight) return point;
  return {
    ...point,
    x: newFrame.offsetX + ((point.x - oldFrame.offsetX) / oldFrame.drawWidth) * newFrame.drawWidth,
    y: newFrame.offsetY + ((point.y - oldFrame.offsetY) / oldFrame.drawHeight) * newFrame.drawHeight
  };
}

function transformImagePoints(points, oldFrame, newFrame) {
  if (!Array.isArray(points)) return;
  for (let index = 0; index < points.length; index += 1) {
    points[index] = transformImagePoint(points[index], oldFrame, newFrame);
  }
}

function transformVirtualReferenceForResize(reference, oldFrame, newFrame) {
  if (!reference) return;
  const oldScaleX = newFrame.drawWidth / Math.max(1, oldFrame.drawWidth);
  const oldScaleY = newFrame.drawHeight / Math.max(1, oldFrame.drawHeight);
  const oldWidth = (Number(reference.height) || 0) * selectedReferenceWidthRatio(reference.referenceId);
  const oldCenter = {
    x: (Number(reference.x) || 0) + oldWidth / 2,
    y: (Number(reference.y) || 0) + (Number(reference.height) || 0) / 2
  };
  const nextCenter = transformImagePoint(oldCenter, oldFrame, newFrame);
  const nextHeight = (Number(reference.height) || 0) * oldScaleY;
  const nextWidth = nextHeight * selectedReferenceWidthRatio(reference.referenceId);
  reference.height = nextHeight;
  reference.baseHeight = (Number(reference.baseHeight) || 0) * oldScaleY;
  reference.x = nextCenter.x - nextWidth / 2;
  reference.y = nextCenter.y - nextHeight / 2;
  reference.groundY = transformImagePoint({ x: 0, y: Number(reference.groundY) || oldCenter.y }, oldFrame, newFrame).y;
  if (Number.isFinite(reference.lockedAnchorY)) {
    reference.lockedAnchorY = transformImagePoint({ x: 0, y: reference.lockedAnchorY }, oldFrame, newFrame).y;
  }
}

function preserveMeasurementStateOnResize(oldFrame, newFrame) {
  if (!state.image || !oldFrame.drawWidth || !newFrame.drawWidth) return;
  transformImagePoints(state.points.ref, oldFrame, newFrame);
  transformImagePoints(state.points.fish, oldFrame, newFrame);
  transformImagePoints(state.points.body, oldFrame, newFrame);
  transformImagePoints(state.faceDepthLine.points, oldFrame, newFrame);
  transformImagePoints(state.faceDepthLine.startPoints, oldFrame, newFrame);
  state.handGuides.forEach((guide) => {
    Object.assign(guide, transformImagePoint(guide, oldFrame, newFrame));
    if (guide.shoulder) guide.shoulder = transformImagePoint(guide.shoulder, oldFrame, newFrame);
    if (guide.elbow) guide.elbow = transformImagePoint(guide.elbow, oldFrame, newFrame);
  });
  transformVirtualReferenceForResize(state.virtualReference, oldFrame, newFrame);
  Object.values(state.referenceSlots).forEach((slot) => {
    if (!slot || typeof slot !== "object") return;
    transformImagePoints(slot.points, oldFrame, newFrame);
    transformVirtualReferenceForResize(slot.virtual, oldFrame, newFrame);
  });
  if (Number.isFinite(state.referenceDepth.canBaselineHeight)) {
    state.referenceDepth.canBaselineHeight *= newFrame.drawHeight / Math.max(1, oldFrame.drawHeight);
  }
}

function resizeCanvasToDisplay() {
  const rect = els.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width * ratio));
  const height = Math.max(420, Math.floor(rect.height * ratio));
  if (els.canvas.width !== width || els.canvas.height !== height) {
    const oldFrame = getImageFrame();
    els.canvas.width = width;
    els.canvas.height = height;
    preserveMeasurementStateOnResize(oldFrame, getImageFrame());
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

async function getMediaPipeFaceLandmarker() {
  if (!mediaPipeFaceLandmarkerPromise) {
    mediaPipeFaceLandmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("/bigplus/vendor/face/vision_bundle.js");
      const fileset = await FilesetResolver.forVisionTasks("/bigplus/vendor/face/wasm");
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "/bigplus/vendor/face/face_landmarker.task",
          // CPU works across desktop and mobile browsers without requiring WebGL.
          delegate: "CPU"
        },
        numFaces: 1,
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
        runningMode: "IMAGE"
      });
    })().catch((error) => {
      mediaPipeFaceLandmarkerPromise = null;
      throw error;
    });
  }
  return mediaPipeFaceLandmarkerPromise;
}

async function getMediaPipeHolisticLandmarker() {
  if (!mediaPipeHolisticLandmarkerPromise) {
    mediaPipeHolisticLandmarkerPromise = (async () => {
      const { HolisticLandmarker, FilesetResolver } = await import("/bigplus/vendor/face/vision_bundle.js");
      const fileset = await FilesetResolver.forVisionTasks("/bigplus/vendor/face/wasm");
      return HolisticLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "/bigplus/vendor/face/holistic_landmarker.task",
          delegate: "CPU"
        },
        minFaceDetectionConfidence: 0.1,
        minPoseDetectionConfidence: 0.1,
        minHandLandmarksConfidence: 0.1,
        minPosePresenceConfidence: 0.1,
        minTrackingConfidence: 0.1,
        outputSegmentationMasks: false,
        runningMode: "IMAGE"
      });
    })().catch((error) => {
      mediaPipeHolisticLandmarkerPromise = null;
      throw error;
    });
  }
  return mediaPipeHolisticLandmarkerPromise;
}

async function getMediaPipeHandLandmarker() {
  if (!mediaPipeHandLandmarkerPromise) {
    mediaPipeHandLandmarkerPromise = (async () => {
      const { HandLandmarker, FilesetResolver } = await import("/bigplus/vendor/face/vision_bundle.js");
      const fileset = await FilesetResolver.forVisionTasks("/bigplus/vendor/face/wasm");
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "/bigplus/vendor/face/hand_landmarker.task",
          delegate: "CPU"
        },
        numHands: 2,
        minHandDetectionConfidence: 0.12,
        minHandPresenceConfidence: 0.1,
        minTrackingConfidence: 0.1,
        runningMode: "IMAGE"
      });
    })().catch((error) => {
      mediaPipeHandLandmarkerPromise = null;
      throw error;
    });
  }
  return mediaPipeHandLandmarkerPromise;
}

function faceBoxToImageFrame(face) {
  if (!face || !state.image) return null;
  const frame = getImageFrame();
  return {
    x: frame.offsetX + (face.x / state.image.width) * frame.drawWidth,
    y: frame.offsetY + (face.y / state.image.height) * frame.drawHeight,
    width: (face.width / state.image.width) * frame.drawWidth,
    height: (face.height / state.image.height) * frame.drawHeight,
    eyeDistancePx: ((face.width / state.image.width) * frame.drawWidth) * 0.38,
    rotationDeg: 0
  };
}

function faceLandmarksToImageFrame(landmarks) {
  if (!landmarks?.length || !state.image) return null;
  const frame = getImageFrame();
  const point = (index) => landmarks[index];
  const average = (indexes) => indexes.reduce((sum, index) => ({
    x: sum.x + point(index).x / indexes.length,
    y: sum.y + point(index).y / indexes.length
  }), { x: 0, y: 0 });
  const rightEye = average([33, 133, 159, 145]);
  const leftEye = average([362, 263, 386, 374]);
  const eyeDistance = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  if (!Number.isFinite(eyeDistance) || eyeDistance <= 0) return null;

  return {
    x: frame.offsetX + ((rightEye.x + leftEye.x) / 2) * frame.drawWidth,
    y: frame.offsetY + ((rightEye.y + leftEye.y) / 2) * frame.drawHeight,
    width: eyeDistance * frame.drawWidth * 2.55,
    height: Math.abs(leftEye.y - rightEye.y) * frame.drawHeight,
    eyeDistancePx: eyeDistance * frame.drawWidth,
    rotationDeg: Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x) * 180 / Math.PI
  };
}

function automaticGlassesWidth(face) {
  if (!face) return null;
  return Number.isFinite(face.eyeDistancePx)
    ? face.eyeDistancePx * 2.35
    : face.width * 0.84;
}

function handLandmarksToImageFrame(landmarks) {
  if (!landmarks?.length || !state.image) return null;
  const frame = getImageFrame();
  const point = (index) => landmarks[index];
  const palm = [5, 9, 13, 17].reduce((sum, index) => ({
    x: sum.x + point(index).x / 4,
    y: sum.y + point(index).y / 4
  }), { x: 0, y: 0 });
  const fingertips = [8, 12, 16, 20].reduce((sum, index) => ({
    x: sum.x + point(index).x / 4,
    y: sum.y + point(index).y / 4
  }), { x: 0, y: 0 });
  const grip = {
    x: (palm.x + fingertips.x) / 2,
    y: (palm.y + fingertips.y) / 2
  };
  const palmWidth = Math.hypot(point(5).x - point(17).x, point(5).y - point(17).y);
  // Use the finger span across the grip as the physical reference. The thumb
  // is excluded; a full grip uses four fingers at about 2 cm each.
  const visibleFingerCount = [8, 12, 16, 20].filter((index) => point(index)).length;
  const centralFingerCount = [8, 12, 16].filter((index) => point(index)).length;
  const fingerSpanCm = visibleFingerCount >= 3
    ? 4 * FINGER_WIDTH_CM
    : Math.max(FINGER_WIDTH_CM, visibleFingerCount * FINGER_WIDTH_CM);
  // Use only the three central fingers. The thumb and little finger are poor
  // references because their angles and visible widths vary too much.
  const fingerCandidates = [
    { tip: 12, dip: 11, name: "långfinger" },
    { tip: 8, dip: 7, name: "pekfinger" },
    { tip: 16, dip: 15, name: "ringfinger" }
  ].filter(({ tip, dip }) => point(tip) && point(dip));
  const selectedFinger = fingerCandidates
    .sort((a, b) => point(a.tip).y - point(b.tip).y)[0] || null;
  const upperFinger = selectedFinger ? {
    x: frame.offsetX + ((point(selectedFinger.tip).x + point(selectedFinger.dip).x) / 2) * frame.drawWidth,
    y: frame.offsetY + ((point(selectedFinger.tip).y + point(selectedFinger.dip).y) / 2) * frame.drawHeight
  } : null;
  const upperFingerRotationDeg = selectedFinger
    ? Math.atan2(
        point(selectedFinger.tip).y - point(selectedFinger.dip).y,
        point(selectedFinger.tip).x - point(selectedFinger.dip).x
      ) * 180 / Math.PI
    : 0;
  // A ring is sized from the selected finger segment plus the knuckle span.
  // Landmarks have no finger edges, so the palm span provides a stable width
  // fallback while the local segment keeps the result responsive to scale.
  const selectedFingerLengthPx = selectedFinger
    ? Math.hypot(
        (point(selectedFinger.tip).x - point(selectedFinger.dip).x) * frame.drawWidth,
        (point(selectedFinger.tip).y - point(selectedFinger.dip).y) * frame.drawHeight
      )
    : 0;
  // The model gives reliable joints, but not the visible finger edges. Use the
  // knuckle span as a calibrated proxy so the 2 cm ring opening matches the
  // finger instead of the much shorter raw landmark distance.
  const upperFingerPixels = selectedFingerLengthPx > 0
    ? Math.max(selectedFingerLengthPx * 1.2, palmWidth * frame.drawWidth * FINGER_PROXY_FACTOR)
    : 0;
  return {
    x: frame.offsetX + grip.x * frame.drawWidth,
    y: frame.offsetY + grip.y * frame.drawHeight,
    width: palmWidth * frame.drawWidth,
    // Palm-to-finger conversion is intentionally conservative: the
    // landmark span is wider than the visible finger itself.
    fingerWidth: visibleFingerCount >= 1 ? palmWidth * frame.drawWidth : 0,
    upperFinger,
    upperFingerPixels,
    upperFingerRotationDeg,
    selectedFinger: selectedFinger?.name || "",
    fingerSpanPixels: visibleFingerCount >= 3
      ? palmWidth * frame.drawWidth * FULL_GRIP_SPAN_CORRECTION
      : palmWidth * frame.drawWidth,
    fingerReferenceCm: FINGER_WIDTH_CM,
    fingerSpanCm,
    visibleFingerCount,
    centralFingerCount,
    wrist: {
      x: frame.offsetX + point(0).x * frame.drawWidth,
      y: frame.offsetY + point(0).y * frame.drawHeight
    }
  };
}

function updateHandDepthEstimate(result) {
  updateArmPoseContext(result);
  const face = result?.faceLandmarks?.[0];
  const hands = [result?.leftHandLandmarks?.[0], result?.rightHandLandmarks?.[0]].filter(Boolean);
  if (!face?.length || !hands.length) {
    state.handDepth = { available: false, relative: 0, scale: 1, label: "" };
    return state.handDepth;
  }

  const averageLandmark = (landmarks, indexes) => indexes.reduce((sum, index) => ({
    x: sum.x + (landmarks[index]?.x || 0) / indexes.length,
    y: sum.y + (landmarks[index]?.y || 0) / indexes.length,
    z: sum.z + (landmarks[index]?.z || 0) / indexes.length
  }), { x: 0, y: 0, z: 0 });
  const distance3d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const eyeA = averageLandmark(face, [33, 133]);
  const eyeB = averageLandmark(face, [362, 263]);
  const faceCenter = averageLandmark(face, [33, 133, 362, 263]);
  const eyeDistance = distance3d(eyeA, eyeB);
  if (!Number.isFinite(eyeDistance) || eyeDistance <= 0) {
    state.handDepth = { available: false, relative: 0, scale: 1, label: "" };
    return state.handDepth;
  }

  const fish = fishGuide();
  const hand = hands
    .map((landmarks) => averageLandmark(landmarks, [0, 5, 9, 13, 17]))
    .sort((a, b) => {
      if (!fish) return 0;
      const frame = getImageFrame();
      const ax = frame.offsetX + a.x * frame.drawWidth;
      const ay = frame.offsetY + a.y * frame.drawHeight;
      const bx = frame.offsetX + b.x * frame.drawWidth;
      const by = frame.offsetY + b.y * frame.drawHeight;
      return Math.hypot(ax - fish.centerX, ay - fish.centerY) - Math.hypot(bx - fish.centerX, by - fish.centerY);
    })[0];
  const relative = clamp((faceCenter.z - hand.z) / eyeDistance, -1.5, 1.5);
  // Holistic depth is relative rather than metric. Keep its visual influence
  // deliberately small so it corrects perspective without making the can jump.
  const scale = clamp(1 + relative * 0.12, 0.88, 1.12);
  state.handDepth = {
    available: true,
    relative,
    scale,
    label: relative > 0.08 ? "handen framför ansiktet" : relative < -0.08 ? "handen bakom ansiktet" : "handen nära ansiktsplanet"
  };
  return state.handDepth;
}

function resetPoseContext() {
  state.poseContext = {
    available: false,
    sameShoulderHeight: false,
    armReach: 0,
    armAngle: 0,
    confidence: 0,
    label: ""
  };
}

function updateArmPoseContext(result) {
  const pose = result?.poseLandmarks?.[0] || result?.poseLandmarks || [];
  if (!pose.length || !state.image) {
    state.poseContext = {
      available: false,
      sameShoulderHeight: false,
      armReach: 0,
      armAngle: 0,
      confidence: 0,
      label: ""
    };
    return state.poseContext;
  }

  const frame = getImageFrame();
  const toFrame = (landmark) => ({
    x: frame.offsetX + landmark.x * frame.drawWidth,
    y: frame.offsetY + landmark.y * frame.drawHeight
  });
  const visible = (landmark) => landmark && (landmark.visibility ?? 1) >= 0.35;
  const angleAt = (a, b, c) => {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const denominator = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
    if (!denominator) return null;
    return Math.acos(clamp((ab.x * cb.x + ab.y * cb.y) / denominator, -1, 1)) * 180 / Math.PI;
  };
  const arms = [[11, 13, 15], [12, 14, 16]]
    .map(([shoulderIndex, elbowIndex, wristIndex]) => {
      const shoulder = pose[shoulderIndex];
      const elbow = pose[elbowIndex];
      const wrist = pose[wristIndex];
      if (![shoulder, elbow, wrist].every(visible)) return null;
      const shoulderPoint = toFrame(shoulder);
      const elbowPoint = toFrame(elbow);
      const wristPoint = toFrame(wrist);
      return {
        shoulder: shoulderPoint,
        elbow: elbowPoint,
        wrist: wristPoint,
        reach: Math.hypot(shoulderPoint.x - wristPoint.x, shoulderPoint.y - wristPoint.y),
        angle: angleAt(shoulderPoint, elbowPoint, wristPoint),
        wristZ: wrist.z || 0
      };
    })
    .filter(Boolean);
  const fish = fishGuide();
  if (!arms.length) {
    state.poseContext = {
      available: false,
      sameShoulderHeight: false,
      armReach: 0,
      armAngle: 0,
      confidence: 0,
      label: ""
    };
    return state.poseContext;
  }
  const shoulderY = arms.reduce((sum, arm) => sum + arm.shoulder.y, 0) / arms.length;
  const wristY = arms.reduce((sum, arm) => sum + arm.wrist.y, 0) / arms.length;
  const fishHeightDelta = fish ? Math.abs(fish.centerY - shoulderY) / Math.max(1, frame.drawHeight) : 1;
  const sameShoulderHeight = fishHeightDelta < 0.16 || Math.abs(wristY - shoulderY) / Math.max(1, frame.drawHeight) < 0.16;
  const armReach = arms.reduce((sum, arm) => sum + arm.reach, 0) / arms.length;
  const armAngle = arms.reduce((sum, arm) => sum + (arm.angle || 90), 0) / arms.length;
  const confidence = clamp(arms.length / 2 * (sameShoulderHeight ? 1 : 0.65), 0, 1);
  state.poseContext = {
    available: true,
    sameShoulderHeight,
    armReach,
    armAngle,
    confidence,
    wristZ: arms.reduce((sum, arm) => sum + arm.wristZ, 0) / arms.length,
    shoulderY,
    wristY,
    label: sameShoulderHeight ? "fisk nära axelhöjd" : "armposition osäker"
  };
  return state.poseContext;
}

async function detectHolisticInImage() {
  if (!state.image) return null;
  holisticDetectionError = false;
  try {
    const landmarker = await getMediaPipeHolisticLandmarker();
    const result = landmarker.detect(state.image);
    if (result?.faceLandmarks?.[0] || result?.leftHandLandmarks?.[0] || result?.rightHandLandmarks?.[0] || result?.poseLandmarks?.length) {
      updateHandDepthEstimate(result);
      return result;
    }

    const enlargedInput = createFaceDetectionInput(state.image, 1.35);
    const enlargedResult = landmarker.detect(enlargedInput);
    updateHandDepthEstimate(enlargedResult);
    return enlargedResult;
  } catch {
    holisticDetectionError = true;
    return null;
  }
}

async function detectHandsInImage() {
  if (!state.image) return null;
  handDetectionError = false;
  try {
    const landmarker = await getMediaPipeHandLandmarker();
    const inputs = [
      state.image,
      createFaceDetectionInput(state.image, 1.6),
      createFaceDetectionInput(state.image, 2.2)
    ];
    for (const input of inputs) {
      const result = landmarker.detect(input);
      if (result?.landmarks?.length) return result;
    }

    const crops = [
      { x: 0.12, y: 0.36, width: 0.76, height: 0.58 },
      { x: 0.22, y: 0.48, width: 0.56, height: 0.48 },
      { x: 0.02, y: 0.28, width: 0.96, height: 0.70 }
    ];
    for (const crop of crops) {
      const source = {
        x: Math.round(state.image.width * crop.x),
        y: Math.round(state.image.height * crop.y),
        width: Math.round(state.image.width * crop.width),
        height: Math.round(state.image.height * crop.height)
      };
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.width * 2.2));
      canvas.height = Math.max(1, Math.round(source.height * 2.2));
      const detectionContext = canvas.getContext("2d", { alpha: false });
      detectionContext.drawImage(state.image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
      const croppedResult = landmarker.detect(canvas);
      if (croppedResult?.landmarks?.length) {
        return {
          ...croppedResult,
          landmarks: croppedResult.landmarks.map((hand) => hand.map((point) => ({
            ...point,
            x: (source.x + point.x * source.width) / state.image.width,
            y: (source.y + point.y * source.height) / state.image.height
          })))
        };
      }
    }
    return null;
  } catch {
    handDetectionError = true;
    return null;
  }
}

function updateHandGuides(result) {
  const directHands = result?.landmarks || [];
  const holisticHands = [result?.leftHandLandmarks?.[0], result?.rightHandLandmarks?.[0]].filter(Boolean);
  const hands = directHands.length ? directHands : holisticHands;
  const guides = hands
    .map(handLandmarksToImageFrame)
    .filter(Boolean);
  state.handGuides = guides;
  const upperGuide = guides
    .filter((guide) => guide.upperFinger && guide.upperFingerPixels > 0)
    .sort((a, b) => a.upperFinger.y - b.upperFinger.y)[0];
  state.fingerRing = upperGuide
    ? { available: true, pixels: upperGuide.upperFingerPixels, referencePixels: 0, point: upperGuide.upperFinger, rotationDeg: upperGuide.upperFingerRotationDeg, label: `Ring · ${upperGuide.selectedFinger || "finger"} · ytterbredd 2,25 cm · hål 2 cm` }
    : { available: false, pixels: 0, referencePixels: 0, point: null, rotationDeg: 0, label: "" };
  return guides;
}

function updateArmGuides(result) {
  updateArmPoseContext(result);
  const pose = result?.poseLandmarks?.[0] || result?.poseLandmarks || [];
  if (!pose.length || !state.image) return [];
  const frame = getImageFrame();
  const point = (index) => pose[index];
  const toFrame = (landmark) => ({
    x: frame.offsetX + landmark.x * frame.drawWidth,
    y: frame.offsetY + landmark.y * frame.drawHeight
  });
  const pairs = [[11, 13, 15], [12, 14, 16]];
  return pairs.map(([shoulderIndex, elbowIndex, wristIndex]) => {
    const shoulder = point(shoulderIndex);
    const elbow = point(elbowIndex);
    const wrist = point(wristIndex);
    if (!shoulder || !elbow || !wrist) return null;
    if ((shoulder.visibility ?? 1) < 0.35 || (elbow.visibility ?? 1) < 0.35 || (wrist.visibility ?? 1) < 0.35) return null;
    return {
      ...toFrame(wrist),
      width: Math.hypot((elbow.x - wrist.x) * frame.drawWidth, (elbow.y - wrist.y) * frame.drawHeight),
      fingerWidth: 0,
      fingerReferenceCm: 2,
      centralFingerCount: 0,
      armFallback: true,
      shoulder: toFrame(shoulder),
      elbow: toFrame(elbow)
    };
  }).filter(Boolean);
}

function createFaceDetectionInput(image, scale = 1) {
  if (!image || scale === 1) return image;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const detectionContext = canvas.getContext("2d", { alpha: false });
  detectionContext.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function createFaceDetectionCrop(image, crop, scale = 1.5) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.width * scale);
  canvas.height = Math.round(crop.height * scale);
  const detectionContext = canvas.getContext("2d", { alpha: false });
  detectionContext.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas;
}

function mapCropLandmarksToImage(landmarks, crop, image) {
  return landmarks.map((landmark) => ({
    ...landmark,
    x: (crop.x + landmark.x * crop.width) / image.width,
    y: (crop.y + landmark.y * crop.height) / image.height
  }));
}

async function detectWithMediaPipe(image) {
  const landmarker = await getMediaPipeFaceLandmarker();
  const firstPass = landmarker.detect(image);
  if (firstPass?.faceLandmarks?.[0]) return firstPass.faceLandmarks[0];

  // Small faces in portrait photos can be lost during the model's first
  // resize. A second, enlarged pass improves detection without uploading data.
  const enlargedInput = createFaceDetectionInput(image, 1.5);
  const enlargedPass = landmarker.detect(enlargedInput);
  if (enlargedPass?.faceLandmarks?.[0]) return enlargedPass.faceLandmarks[0];

  // Analyse smaller upper-image regions as well. This gives a distant face
  // more pixels while keeping the coordinates mapped to the original photo.
  const upperHeight = image.height * 0.78;
  const crops = [
    { x: 0, y: 0, width: image.width, height: upperHeight },
    { x: 0, y: 0, width: image.width * 0.68, height: upperHeight },
    { x: image.width * 0.32, y: 0, width: image.width * 0.68, height: upperHeight }
  ];
  for (const crop of crops) {
    const cropInput = createFaceDetectionCrop(image, crop, 1.8);
    const cropPass = landmarker.detect(cropInput);
    if (cropPass?.faceLandmarks?.[0]) {
      return mapCropLandmarksToImage(cropPass.faceLandmarks[0], crop, image);
    }
  }
  return null;
}

async function detectFaceInImageFrame() {
  if (!state.image) return null;
  faceDetectionError = false;

  let bitmap = null;
  try {
    if ("FaceDetector" in window) {
      const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
      const detectorInput = "createImageBitmap" in window
        ? await createImageBitmap(state.image)
        : state.image;
      if (detectorInput !== state.image) bitmap = detectorInput;
      const faces = await detector.detect(detectorInput);
      const face = faces
        .map((item) => item.boundingBox)
        .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
      const nativeFace = faceBoxToImageFrame(face);
      if (nativeFace) return nativeFace;
    }

    const landmarks = await detectWithMediaPipe(state.image);
    return faceLandmarksToImageFrame(landmarks);
  } catch {
    faceDetectionError = true;
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
  const size = 8;
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
  if (label === "höjd" && points.length > 2) {
    for (let index = 0; index + 1 < points.length; index += 2) {
      drawMeasurementArrowLine(points.slice(index, index + 2), color, "");
    }
    if (points.length % 2) {
      drawMeasurementArrowLine([points[points.length - 1]], color, "");
    }
    return;
  }
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
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
    ctx.font = "800 13px system-ui, sans-serif";
    const paddingX = 6;
    const width = ctx.measureText(label).width + paddingX * 2;
    const height = 21;
    const isHeightLabel = label === "höjd";
    const labelY = isHeightLabel
      ? labelPoint.y - height - 9
      : labelPoint.y + 9;
    const boxX = clamp(midX - width / 2, 6, els.canvas.width - width - 6);
    const boxY = clamp(labelY, 6, els.canvas.height - height - 6);
    const textX = boxX + width / 2;
    const textY = boxY + height / 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, width, height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, textX, textY + 0.5);
  }

  ctx.restore();
}

function drawLengthRuler() {
  if (!state.rulerVisible || state.points.fish.length < 2) return;

  const scaleCmPerPixel = combinedReferenceScaleCmPerPixel();
  if (!scaleCmPerPixel) return;

  const start = state.points.fish[0];
  const end = state.points.fish[state.points.fish.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const pixelLength = Math.hypot(dx, dy);
  if (!pixelLength) return;

  const lengthCm = pixelLength * scaleCmPerPixel;
  const unitX = dx / pixelLength;
  const unitY = dy / pixelLength;
  const normalX = -unitY;
  const normalY = unitX;
  const offset = 26;
  const rulerStart = { x: start.x + normalX * offset, y: start.y + normalY * offset };
  const rulerEnd = { x: end.x + normalX * offset, y: end.y + normalY * offset };

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(15, 54, 111, 0.94)";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(rulerStart.x, rulerStart.y);
  ctx.lineTo(rulerEnd.x, rulerEnd.y);
  ctx.stroke();

  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2;
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const tickSize = 8;
  const centimetresPerTick = lengthCm > 120 ? 10 : 5;
  const tickCount = Math.max(1, Math.floor(lengthCm / centimetresPerTick));
  for (let index = 0; index <= tickCount; index += 1) {
    const fraction = Math.min(1, (index * centimetresPerTick) / lengthCm);
    const x = rulerStart.x + (rulerEnd.x - rulerStart.x) * fraction;
    const y = rulerStart.y + (rulerEnd.y - rulerStart.y) * fraction;
    const longTick = index % 2 === 0 || index === tickCount;
    const size = longTick ? tickSize : tickSize * 0.65;
    ctx.beginPath();
    ctx.moveTo(x - normalX * size, y - normalY * size);
    ctx.lineTo(x + normalX * size, y + normalY * size);
    ctx.stroke();
    if (longTick) {
      ctx.fillText(String(Math.round(index * centimetresPerTick)), x - normalX * 14, y - normalY * 14);
    }
  }

  const midX = (rulerStart.x + rulerEnd.x) / 2;
  const midY = (rulerStart.y + rulerEnd.y) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 12px system-ui, sans-serif";
  ctx.fillText(`${lengthCm.toFixed(1)} cm`, midX + normalX * 27, midY + normalY * 27);
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
    ctx.drawImage(canImage, x, y, rect.width, rect.height);
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

function drawDetectedHandGuides() {
  if (!state.referenceSlots.glasses?.virtual?.locked || state.referenceSlots.can || !state.handGuides.length) return;
  ctx.save();
  state.handGuides.forEach((guide, index) => {
    if (guide.armFallback) {
      ctx.strokeStyle = "rgba(245, 158, 11, 0.92)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(guide.shoulder.x, guide.shoulder.y);
      ctx.lineTo(guide.elbow.x, guide.elbow.y);
      ctx.lineTo(guide.x, guide.y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(36, 160, 200, 0.95)";
    ctx.fillStyle = "rgba(224, 248, 255, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(guide.x, guide.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#164e63";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(index === 0 ? "Hand" : "Hand 2", guide.x, guide.y - 23);
  });
  ctx.restore();
}

function drawFingerRingReference() {
  if (!state.fingerRing.available || !state.fingerRing.point || !state.fingerRing.pixels) return;
  const pixelsPerCm = state.fingerRing.pixels / RING_HOLE_WIDTH_CM;
  const referencePixels = state.fingerRing.pixels * (RING_OUTER_WIDTH_CM / RING_HOLE_WIDTH_CM);
  state.fingerRing.referencePixels = referencePixels;
  const center = {
    x: state.fingerRing.point.x,
    y: state.fingerRing.point.y
  };
  // The detection proxy is deliberately enlarged for metric calculation.
  // Render the ring from the underlying finger width so it fits visually.
  const displayPixels = Math.max(10, (pixelsPerCm * RING_OUTER_WIDTH_CM) / 1.75);
  const imageWidth = displayPixels * 1.2;
  const imageHeight = displayPixels * 0.52;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate((state.fingerRing.rotationDeg || 0) * Math.PI / 180);
  if (fingerRingReferenceImage.complete && fingerRingReferenceImage.naturalWidth > 0) {
    ctx.drawImage(fingerRingReferenceImage, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
  } else {
    ctx.strokeStyle = "#fbbf24";
    ctx.fillStyle = "rgba(251, 191, 36, 0.16)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, imageWidth / 2, imageHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.rotate(-(state.fingerRing.rotationDeg || 0) * Math.PI / 180);
  ctx.fillStyle = "#fff7d6";
  ctx.font = "800 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Ring 2,25 cm · hål 2 cm", 0, -imageHeight / 2 - 8);
  ctx.restore();
}

function drawVirtualReference(referenceId = state.virtualReference.referenceId || els.referenceSelect.value) {
  if (document.documentElement.dataset.measureMode === "v1") return;
  if (!state.virtualReference.enabled) return;

  const rect = virtualReferenceGeometry();
  const radius = rect.width / 2;
  const x = -rect.width / 2;
  const y = -rect.height / 2;

  const glassesReference = referenceId === "glasses";
  const ringReference = referenceId === "ring-2cm";
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
  } else if (ringReference) {
    if (fingerRingReferenceImage.complete && fingerRingReferenceImage.naturalWidth > 0) {
      ctx.save();
      ctx.translate(rect.centerX, rect.centerY);
      ctx.rotate(rect.angle);
      const ringDisplayScale = 0.3;
      const displayWidth = rect.width * ringDisplayScale;
      const displayHeight = rect.height * ringDisplayScale;
      ctx.drawImage(fingerRingReferenceImage, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
      ctx.restore();
    }
  } else {
    drawCanReferenceAsset(x, y, rect, radius);
  }

  const handles = virtualReferenceHandles();
  if (!state.virtualReference.selected) {
    if (!state.virtualReference.locked) drawMoveHandControl(handles.move);
    return;
  }
  if (!state.virtualReference.locked) {
    ctx.save();
    ctx.translate(rect.centerX, rect.centerY);
    ctx.rotate(rect.angle);
    ctx.strokeStyle = "#246b8f";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(-rect.width / 2 - 7, -rect.height / 2 - 7, rect.width + 14, rect.height + 14);
    ctx.restore();
  }
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
    drawMoveHandControl(handles.move);
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
  document.body.classList.toggle("measure-has-photo", Boolean(state.image));
  resizeCanvasToDisplay();
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  syncMobileReferenceControls();
  updateReferenceLockButton();
  updateChecklist();
  updateGuidedOverlay();

  if (!state.image) return;

  ctx.save();
  ctx.translate(state.view.panX, state.view.panY);
  ctx.scale(state.view.zoom, state.view.zoom);

  const { offsetX, offsetY, drawWidth, drawHeight } = getImageFrame();

  ctx.drawImage(state.image, offsetX, offsetY, drawWidth, drawHeight);
  drawV1SegmentationOverlay();
  updateVirtualReferencePoints();
  state.virtualReference.faceDepthOffset = selectedFaceDepthOffset();
  syncActiveReferenceSlot();
  updateFaceDepthResult();
  renderReferenceReadout();
  enhanceReferenceReadout();
  drawReferenceSlot("glasses");
  drawReferenceSlot("can");
  drawReferenceSlot("ring");
  drawDetectedHandGuides();
  // V1 is reference-free. Keep the legacy renderer available for older flows,
  // but never let it add a reference object to the new measurement screen.
  if (document.documentElement.dataset.measureMode !== "v1") drawVirtualReference();
  // Keep the ring visible as its own object, even when the can overlaps the hand.
  drawFaceDepthLine();
  updateRulerControl();
  drawLengthRuler();
  drawMeasurementArrowLine(state.points.fish, "#24a0c8", "längd");
  drawMeasurementArrowLine(state.points.body, "#d97706", "höjd");
  updateChecklist();
  updateGuidedOverlay();
  ctx.restore();
}

function drawV1SegmentationOverlay() {
  const outline = state.v1Segmentation?.outline;
  if (!document.body.classList.contains("measure-v1-active") || !Array.isArray(outline) || outline.length < 3) return;
  const points = outline.map(imagePointToCanvas);
  const zoom = Math.max(state.view.zoom, 0.1);
  ctx.save();
  ctx.strokeStyle = "rgba(47, 196, 150, 0.9)";
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.beginPath();
  points.forEach((current, index) => {
    if (index === 0) ctx.moveTo(current.x, current.y);
    else ctx.lineTo(current.x, current.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function setTool(tool) {
  state.activeTool = tool;
  els.refTool.classList.toggle("active", tool === "ref");
  els.fishTool.classList.toggle("active", tool === "fish");
  els.bodyTool.classList.toggle("active", tool === "body");
  els.lengthCard?.classList.toggle("is-active", tool === "fish" && !state.measurementLocks.fish);
  els.heightCard?.classList.toggle("is-active", tool === "body" && !state.measurementLocks.body);
  updateMeasureMenuState();
}

function updateMeasureMenuState(activeOverride = "") {
  const active = activeOverride || (state.activeTool === "ref"
    ? state.referenceSlots.active === "can" ? "can" : state.referenceSlots.active === "ring" ? "ring" : "glasses"
    : state.activeTool === "fish" ? "length" : "width");
  els.measureStepMenu?.querySelectorAll("[data-measure-menu]").forEach((button) => {
    const isActive = button.dataset.measureMenu === active;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "step" : "false");
  });
}

function updateRulerControl() {
  if (!els.rulerToggleButton) return;
  const ready = Boolean(state.image && state.points.fish.length >= 2 && combinedReferenceScaleCmPerPixel());
  els.rulerToggleButton.disabled = !ready;
  els.rulerToggleButton.classList.toggle("is-active", state.rulerVisible && ready);
  els.rulerToggleButton.textContent = state.rulerVisible ? "Dölj linjal" : "Visa linjal";
  els.rulerToggleButton.title = ready
    ? "Visa en linjal i samma skala som dina referenser"
    : "Markera längden och placera en referens först";
}

function resetPoints(options = {}) {
  const clearImage = Boolean(options.clearImage);
  delete document.documentElement.dataset.measureMode;
  state.handGuides = [];
  state.fingerRing = { available: false, pixels: 0, referencePixels: 0, point: null, rotationDeg: 0, label: "" };
  state.handDepth = { available: false, relative: 0, scale: 1, label: "" };
  state.depthAnalysis = null;
  state.depthAnalysisId = "";
  resetPoseContext();
  state.referenceDepth.canBaselineHeight = null;
  if (clearImage) {
    state.image = null;
    state.imageDataUrl = "";
    els.photoInput.value = "";
    if (els.manualPhotoInput) els.manualPhotoInput.value = "";
    if (els.cameraPhotoInput) els.cameraPhotoInput.value = "";
    if (els.manualEntryImage) els.manualEntryImage.removeAttribute("src");
    if (els.manualSpeciesSelect) els.manualSpeciesSelect.value = "";
    if (els.manualLengthInput) els.manualLengthInput.value = "";
    if (els.manualWeightInput) els.manualWeightInput.value = "";
    if (els.manualCatchNote) els.manualCatchNote.value = "";
    clearCatchLocation();
    clearManualCatchLocation();
    if (els.manualLocationPicker) els.manualLocationPicker.hidden = true;
    els.emptyState.classList.remove("hidden");
    els.manualEntryPanel?.classList.add("hidden");
    document.querySelector(".measure-area")?.classList.add("is-start");
    if (els.photoInputLabel) els.photoInputLabel.textContent = "Välj bild med fisken";
    resetZoom();
    setStatus("Redo");
    document.body.classList.remove("measure-guided-active", "measure-v1-active");
    document.querySelector(".measure-area")?.classList.remove("is-v1-mode");
  } else {
    setStatus("Rensad");
  }
  state.virtualReference.enabled = false;
  state.virtualReference.referenceId = "glasses";
  state.virtualReference.baseHeight = 150;
  state.virtualReference.height = 150;
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
  state.referenceSlots.ring = null;
  state.measurementLocks.fish = false;
  state.measurementLocks.body = false;
  state.rulerVisible = false;
  if (els.referenceScaleRange) els.referenceScaleRange.value = "150";
  if (els.mobileReferenceScale) els.mobileReferenceScale.value = "150";
  if (els.mobileReferenceScaleValue) els.mobileReferenceScaleValue.textContent = "100%";
  els.faceDepthToolButton?.classList.remove("active");
  state.points.ref = [];
  state.points.fish = [];
  state.points.body = [];
  state.v1SeedLine = false;
  state.v1AnalysisPending = false;
  state.v1LandmarksConfirmed = false;
  state.v1LandmarksDetected = false;
  state.v1Segmentation = null;
  if (els.referenceSelect) els.referenceSelect.value = "glasses";
  if (els.speciesSelect) els.speciesSelect.value = "";
  if (els.minSize) els.minSize.value = 0;
  updateMeasureTargetSummary();
  state.lastResult = null;
  state.lastPayload = null;
  if (els.saveButton) els.saveButton.disabled = true;
  renderReferenceReadout();
  renderResult(null);
  updateManualEntryState();
  updateReferenceSpecificControls();
  updateSimpleReferenceButtons();
  updateReferenceLockButton();
  draw();
}

function showMeasurementWorkspace() {
  els.emptyState.classList.add("hidden");
  els.manualEntryPanel?.classList.add("hidden");
  const measureArea = document.querySelector(".measure-area");
  measureArea?.classList.remove("is-start", "is-manual");
  measureArea?.classList.add("is-guided-mode", "is-v1-mode");
  document.documentElement.dataset.measureMode = "v1";
  document.body.classList.add("measure-guided-active");
  document.body.classList.add("measure-v1-active");
  // V1 starts without physical reference objects. Clear stale objects from
  // a previous measurement before the new image is drawn.
  state.referenceSlots = { glasses: null, can: null, ring: null, fish: null, active: "glasses" };
  state.virtualReference.enabled = false;
  state.virtualReference.selected = false;
  state.virtualReference.locked = false;
  state.virtualReference.dragging = false;
  state.fingerRing = { available: false, pixels: 0, referencePixels: 0, point: null, rotationDeg: 0, label: "" };
  state.handGuides = [];
  state.handDepth = { available: false, relative: 0, scale: 1, label: "" };
  state.depthAnalysis = null;
  state.poseContext = { available: false, sameShoulderHeight: false, confidence: 0, label: "" };
  state.v1SeedLine = false;
  state.v1LandmarksConfirmed = false;
  state.v1LandmarksDetected = false;
  state.v1Segmentation = null;
  setTool("fish");
  updateMeasureMenuState("length");
  if (measureArea) measureArea.dataset.flowStep = "2";
  if (els.photoInputLabel) els.photoInputLabel.textContent = "Mät ny fisk";
}

async function autoPlaceGlassesReference() {
  const imageAtStart = state.image;
  if (!imageAtStart || state.referenceSlots.glasses) return;

  setStatus("Söker ansikte");
  resizeCanvasToDisplay();
  prepareGlassesReference();
  const holistic = await detectHolisticInImage();
  const holisticGuides = updateHandGuides(holistic);
  const armGuides = updateArmGuides(holistic);
  // Keep a successful Holistic hand result when the direct hand pass returns
  // nothing. An empty retry must never clear a usable finger point.
  const directHandResult = await detectHandsInImage();
  const directGuides = directHandResult ? updateHandGuides(directHandResult) : [];
  const handGuides = directGuides.length ? directGuides : holisticGuides.length ? holisticGuides : armGuides;
  state.handGuides = handGuides;
  if (!state.fingerRing.point) {
    const ringGuide = handGuides
      .filter((guide) => guide.upperFinger && guide.upperFingerPixels > 0)
      .sort((a, b) => a.upperFinger.y - b.upperFinger.y)[0];
    if (ringGuide) {
      state.fingerRing = {
        available: true,
        pixels: ringGuide.upperFingerPixels,
        referencePixels: 0,
        point: ringGuide.upperFinger,
        rotationDeg: ringGuide.upperFingerRotationDeg,
        label: `Ring · ${ringGuide.selectedFinger || "finger"} · ytterbredd 2,25 cm · hål 2 cm`
      };
    }
  }
  const holisticFace = faceLandmarksToImageFrame(holistic?.faceLandmarks?.[0]);
  const face = holisticFace || await detectFaceInImageFrame();
  if (imageAtStart !== state.image) return;

  if (face) {
    placeGlassesAtPoint(
      {
        x: face.x + face.width / 2,
        y: face.y + face.height * 0.43
      },
      automaticGlassesWidth(face),
      "Ansikte hittat – glasögon placerade",
      face.rotationDeg || 0
    );
    if (handGuides.length) {
      setStatus(handGuides.some((guide) => guide.armFallback)
        ? "Armarnas V hittad – glasögon placerade"
        : "Ansikte och händer hittade – glasögon placerade");
      await placeHandReference({ autoAdvance: true });
      if (state.fingerRing.point) await placeRingReference({ automatic: true });
    } else {
      await placeHandReference({ autoAdvance: true });
      if (state.fingerRing.point) await placeRingReference({ automatic: true });
    }
    return;
  }

  setStatus(faceDetectionError
    ? "Ansiktsmodellen kunde inte laddas – välj Glasögon"
    : "Ansikte hittades inte – välj Glasögon");
  draw();
}

function showManualEntry() {
  clearManualCatchLocation();
  if (els.manualLocationPicker) els.manualLocationPicker.hidden = true;
  els.emptyState.classList.add("hidden");
  els.manualEntryPanel?.classList.remove("hidden");
  const measureArea = document.querySelector(".measure-area");
  measureArea?.classList.add("is-manual");
  measureArea?.classList.remove("is-start", "is-guided-mode", "is-v1-mode");
  document.body.classList.remove("measure-guided-active", "measure-v1-active");
  delete document.documentElement.dataset.measureMode;
  if (measureArea) measureArea.dataset.flowStep = "manual";
  if (els.manualEntryImage && state.imageDataUrl) {
    els.manualEntryImage.src = state.imageDataUrl;
    els.manualEntryImage.alt = "Uppladdad bild på fångsten";
  }
  updateManualEntryState();
}

function showMeasureStart() {
  els.emptyState.classList.remove("hidden");
  els.manualEntryPanel?.classList.add("hidden");
  document.querySelector(".measure-area")?.classList.remove("is-manual");
  const measureArea = document.querySelector(".measure-area");
  measureArea?.classList.add("is-start");
  measureArea?.classList.remove("is-manual", "is-guided-mode", "is-v1-mode");
  document.body.classList.remove("measure-guided-active", "measure-v1-active");
  delete document.documentElement.dataset.measureMode;
  if (measureArea) measureArea.dataset.flowStep = "1";
}

function cancelGuidedMeasurement() {
  resetPoints({ clearImage: true });
  showMeasureStart();
  draw();
}

async function readImageFile(file, onLoaded) {
  if (!file) return;
  try {
    const dataUrl = await compressImageFile(file, { maxEdge: 1600, quality: 0.78 });
    const image = new Image();
    image.onload = () => onLoaded(image, dataUrl);
    image.src = dataUrl;
  } catch {
    setStatus("Kunde inte läsa bilden");
  }
}

function setMeasurementImage(image, dataUrl) {
  const v1Requested = document.documentElement.dataset.measureMode === "v1"
    || document.body.classList.contains("measure-v1-active");
  state.image = image;
  state.imageDataUrl = dataUrl;
  state.depthAnalysisId = `measurement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.depthAnalysis = null;
  resetZoom();
  resetPoints();
  state.v1AnalysisPending = v1Requested;
  els.referenceSelect.value = "glasses";
  state.referenceSlots.active = "glasses";
  showMeasurementWorkspace();
  draw();
  if (v1Requested) {
    setStatus("Analyserar bilden med AI");
    updateMeasureProgress();
    void analyzeV1FishImage(image);
  }
  if (!v1Requested) {
    window.setTimeout(() => { void autoPlaceGlassesReference(); }, 0);
  }
}

function imagePointToCanvas(point) {
  const frame = getImageFrame();
  const imageWidth = state.image?.naturalWidth || state.image?.width || 1;
  const imageHeight = state.image?.naturalHeight || state.image?.height || 1;
  return {
    x: frame.offsetX + (point.x / imageWidth) * frame.drawWidth,
    y: frame.offsetY + (point.y / imageHeight) * frame.drawHeight
  };
}

function canvasPointToImage(point) {
  const frame = getImageFrame();
  const imageWidth = state.image?.naturalWidth || state.image?.width || 1;
  const imageHeight = state.image?.naturalHeight || state.image?.height || 1;
  return {
    x: ((point.x - frame.offsetX) / Math.max(1, frame.drawWidth)) * imageWidth,
    y: ((point.y - frame.offsetY) / Math.max(1, frame.drawHeight)) * imageHeight
  };
}

async function analyzeV1FishImage(image) {
  try {
    const [segmentation, holistic] = await Promise.all([
      segmentFish(image),
      detectHolisticInImage().catch(() => null)
    ]);
    if (state.image !== image) return;
    state.v1Segmentation = segmentation;
    const holisticGuides = updateHandGuides(holistic);
    const armGuides = updateArmGuides(holistic);
    state.handGuides = holisticGuides.length ? holisticGuides : armGuides;
    updateArmPoseContext(holistic);
    const detectedPoints = segmentation.fishLandmarks?.centerline
      || segmentation.fishLandmarks?.points
      || [];
    const modelLandmarksUsable = segmentation.modelBacked && detectedPoints.length >= 2;
    if (modelLandmarksUsable) {
      state.points.fish = detectedPoints.map(imagePointToCanvas);
      state.v1LandmarksDetected = true;
      state.v1SeedLine = false;
      setStatus("Fisk hittad");
    } else {
      if (!segmentation.modelBacked) state.points.fish = [];
      state.v1SeedLine = false;
      state.v1LandmarksDetected = false;
      setStatus(segmentation.maskAvailable ? "Konturen är osäker. Markera nos och stjärt" : "Markera nos och stjärt");
    }
    if (getDepthFeatureConfig().enabled && state.points.fish.length >= 2) {
      const imageWidth = image.naturalWidth || image.width || 1;
      const imageHeight = image.naturalHeight || image.height || 1;
      const imageFrame = getImageFrame();
      const faceFrame = faceLandmarksToImageFrame(holistic?.faceLandmarks?.[0]);
      const faceTopLeft = faceFrame ? canvasPointToImage(faceFrame) : null;
      const faceBox = faceFrame && faceTopLeft ? {
        ...faceTopLeft,
        width: faceFrame.width / Math.max(1, imageFrame.drawWidth) * imageWidth,
        height: faceFrame.height / Math.max(1, imageFrame.drawHeight) * imageHeight
      } : null;
      const poseLandmarks = holistic?.poseLandmarks?.[0] || [];
      const torsoLandmarks = [poseLandmarks[11], poseLandmarks[12], poseLandmarks[23], poseLandmarks[24]].filter(Boolean);
      const torsoBox = torsoLandmarks.length >= 3 ? {
        x: Math.min(...torsoLandmarks.map((point) => point.x)) * imageWidth,
        y: Math.min(...torsoLandmarks.map((point) => point.y)) * imageHeight,
        width: (Math.max(...torsoLandmarks.map((point) => point.x)) - Math.min(...torsoLandmarks.map((point) => point.x))) * imageWidth,
        height: (Math.max(...torsoLandmarks.map((point) => point.y)) - Math.min(...torsoLandmarks.map((point) => point.y))) * imageHeight
      } : null;
      const depthContext = buildDepthContext({
        segmentation,
        fishPoints: state.points.fish.map(canvasPointToImage),
        handGuides: state.handGuides.map((guide) => ({
          ...canvasPointToImage(guide),
          width: (Number(guide.width) || 0) / Math.max(1, imageFrame.drawWidth) * imageWidth,
          confidence: guide.confidence
        })),
        width: imageWidth,
        height: imageHeight,
        faceBox,
        torsoBox,
        poseContext: state.poseContext
      });
      setStatus("Analyserar perspektiv");
      state.depthAnalysis = await requestDepthAnalysis({
        imageDataUrl: state.imageDataUrl,
        analysisId: state.depthAnalysisId,
        context: depthContext
      });
    }
    state.v1AnalysisPending = false;
    updateMeasureProgress();
    draw();
    await calculate();
  } catch {
    state.v1Segmentation = null;
    state.points.fish = [];
    state.v1SeedLine = false;
    state.v1AnalysisPending = false;
    state.v1LandmarksDetected = false;
    setStatus("Markera nos och stjärt");
    updateMeasureProgress();
    draw();
    await calculate();
  }
}

function seedV1FishLandmarks() {
  if (!state.image || !document.body.classList.contains("measure-v1-active")) return;
  resizeCanvasToDisplay();
  const frame = getImageFrame();
  const y = frame.offsetY + frame.drawHeight * 0.58;
  const left = frame.offsetX + frame.drawWidth * 0.12;
  const right = frame.offsetX + frame.drawWidth * 0.88;
  state.points.fish = [
    { x: left, y },
    { x: right, y }
  ];
  // This is only a temporary editing guide. It is not a detected fish mask
  // and must never be reported as confirmed nose/tail landmarks.
  state.v1SeedLine = true;
  state.v1LandmarksConfirmed = false;
  state.v1LandmarksDetected = false;
}

async function persistManualCatch() {
  if (savingManualCatch) return;
  const speciesId = els.manualSpeciesSelect?.value || "";
  const lengthCm = parseManualNumber(els.manualLengthInput?.value);
  const weightKg = parseManualNumber(els.manualWeightInput?.value);
  const species = state.species.find((item) => item.id === speciesId);
  if (!state.imageDataUrl || !species || !Number.isFinite(lengthCm) || lengthCm <= 0 || !Number.isFinite(weightKg) || weightKg < 0) {
    setStatus("Fyll i art, längd och vikt");
    return;
  }

  const status = manualCatchStatus(species, lengthCm);
  const isBigplus = status === "BIGPLUS";
  const measurement = {
    speciesId,
    species: species.name,
    speciesName: species.name,
    lengthCm,
    weightKg,
    bodyCm: null,
    minCm: species.minCm || 0,
    status,
    isBigplus,
    confidence: "Manuell",
    disclaimer: "Mått och vikt registrerade manuellt."
  };
  const payload = {
    manual: true,
    // Keep these fields at the request root as well as inside measurement.
    // This makes manual saves compatible with older local API processes.
    speciesId,
    species: species.name,
    lengthCm,
    weightKg,
    measurement,
    userId: currentUserId(),
    note: els.manualCatchNote?.value || "Manuell registrering",
    photo: state.imageDataUrl,
    competitionIds: currentMemberships(),
    ...(selectedManualCatchLocation ? { location: selectedManualCatchLocation } : {})
  };
  savingManualCatch = true;
  if (els.saveManualCatchButton) els.saveManualCatchButton.disabled = true;
  try {
    window.bigplusLoading?.show("Sparar din fångst...");
    setStatus("Sparar");
    let saved = null;
    try { saved = await saveCatch(payload); } catch (error) {
      if (currentUserId()) throw error;
    }
    const local = saveLocalCatch(payload, {
      ...measurement,
      weightKg: { low: weightKg, mid: weightKg, high: weightKg }
    });
    resetPoints({ clearImage: true });
    setStatus("Sparad");
    if (saved) {
      await loadCatches();
    } else {
      renderCatches(getLocalCatches(currentUserId()).slice(-30).reverse());
    }
    window.dispatchEvent(new CustomEvent("bigplus:catch-saved", { detail: { catchId: saved?.id || saved?._id || local?.id || "" } }));
  } catch (error) {
    window.bigplusLoading?.hide();
    setStatus("Fel");
    alert(error.message);
  } finally {
    savingManualCatch = false;
    updateManualEntryState();
  }
}

function renderResult(result) {
  if (els.bigStatus) els.bigStatus.className = "big-status pending";
  if (els.resultPanel) els.resultPanel.classList.toggle("is-empty", !result);
  updateChecklist();

  if (!result) {
    if (els.bigStatus?.querySelector("strong")) els.bigStatus.querySelector("strong").textContent = "Väntar";
    if (els.lengthResult) els.lengthResult.textContent = `-- ${preferredUnit()}`;
    if (els.weightResult) els.weightResult.textContent = "-- kg";
    if (els.bodyDepthResult) els.bodyDepthResult.textContent = `-- ${preferredUnit()}`;
    if (els.limitResult) els.limitResult.textContent = `-- ${preferredUnit()}`;
    if (els.confidenceResult) els.confidenceResult.textContent = "--";
    const rangeResult = document.querySelector("#measurementRangeResult");
    const confidenceLevel = document.querySelector("#measurementConfidenceLevel");
    const analysisList = document.querySelector("#measurementAnalysisList");
    if (rangeResult) rangeResult.textContent = "--";
    if (confidenceLevel) confidenceLevel.textContent = "--";
    if (analysisList) analysisList.replaceChildren();
    if (els.resultPhoto) els.resultPhoto.removeAttribute("src");
    if (els.resultSpecies) els.resultSpecies.textContent = "--";
    if (els.resultSpeciesLatin) els.resultSpeciesLatin.textContent = "--";
    if (els.measureStatusSummary) els.measureStatusSummary.textContent = "–";
    if (els.measureStatusSummaryText) els.measureStatusSummaryText.textContent = "Ej mätt";
    if (els.guidedPerspectiveResult) els.guidedPerspectiveResult.textContent = "Ingen burkjustering registrerad.";
    if (els.guidedSpeciesResult) els.guidedSpeciesResult.textContent = "Fisk";
    if (els.guidedConfidenceResult) els.guidedConfidenceResult.textContent = "--";
    if (els.guidedRangeResult) els.guidedRangeResult.textContent = "--";
    if (els.guidedVersionResult) els.guidedVersionResult.textContent = "V1 Beta";
    if (els.guidedResultChecks) els.guidedResultChecks.replaceChildren();
    if (els.guidedResultPopup) els.guidedResultPopup.hidden = true;
    updateMeasureProgress();
    return;
  }

  const statusClass = result.status === "BIGPLUS" ? "bigplus" : result.status.startsWith("SL") ? "release" : "check";
  if (els.bigStatus) els.bigStatus.classList.add(statusClass);
  if (els.bigStatus?.querySelector("strong")) els.bigStatus.querySelector("strong").textContent = result.status;
  if (els.lengthResult) els.lengthResult.textContent = formatCm(result.lengthCm);
  if (els.weightResult) els.weightResult.textContent = result.weightKg ? formatKgRange(result.weightKg) : "-- kg";
  if (els.bodyDepthResult) els.bodyDepthResult.textContent = result.bodyCm ? formatCm(result.bodyCm) : `-- ${preferredUnit()}`;
  if (els.limitResult) els.limitResult.textContent = result.minCm > 0 ? formatCm(result.minCm) : "Kolla";
  const confidence = typeof result.confidence === "object" ? result.confidence : { level: result.confidence === "high" ? "high" : "medium", score: null };
  if (els.confidenceResult) els.confidenceResult.textContent = confidence.level === "very_high" ? "Mycket hög" : confidence.level === "high" ? "Hög" : confidence.level === "low" ? "Låg" : "Mellan";
  const rangeResult = document.querySelector("#measurementRangeResult");
  const confidenceLevel = document.querySelector("#measurementConfidenceLevel");
  const analysisList = document.querySelector("#measurementAnalysisList");
  if (rangeResult) rangeResult.textContent = Number.isFinite(result.rangeMinCm) && Number.isFinite(result.rangeMaxCm)
    ? `${formatCm(result.rangeMinCm)}–${formatCm(result.rangeMaxCm)}`
    : "--";
  if (confidenceLevel) confidenceLevel.textContent = `${confidence.level}${Number.isFinite(confidence.score) ? ` (${confidence.score}/100)` : ""}`;
  if (analysisList) {
    const analysis = result.analysis || {};
    const checks = [
      [analysis.noseVisible && analysis.tailVisible, analysis.noseVisible && analysis.tailVisible ? "Nos och stjärt hittades" : "Nos och stjärt behöver kontrolleras"],
      [analysis.bothHandsUsed, "Två händer användes som skala"],
      [analysis.calibratedHandUsed, "Din handkalibrering användes"],
      [analysis.perspectiveCorrected, "Perspektivet korrigerades"],
      [analysis.speciesMorphologyVerified, "Artens kroppsproportioner kontrollerades"]
    ];
    analysisList.replaceChildren(...checks.map(([ok, label]) => {
      const item = document.createElement("li");
      item.className = ok ? "is-complete" : "is-pending";
      item.textContent = `${ok ? "✓" : "•"} ${label}`;
      return item;
    }));
  }
  if (els.disclaimer) els.disclaimer.textContent = result.disclaimer;
  const selectedSpecies = state.species.find((item) => item.id === (result.speciesId || els.speciesSelect.value));
  if (els.resultPhoto && state.imageDataUrl) els.resultPhoto.src = state.imageDataUrl;
  if (els.resultSpecies) els.resultSpecies.textContent = result.species || selectedSpecies?.name || "Annan art";
  const latinNames = { pike: "Esox lucius", perch: "Perca fluviatilis", zander: "Sander lucioperca", trout: "Salmo trutta", salmon: "Salmo salar", char: "Salvelinus alpinus", cod: "Gadus morhua" };
  if (els.resultSpeciesLatin) els.resultSpeciesLatin.textContent = result.speciesLatinName || selectedSpecies?.latinName || latinNames[selectedSpecies?.id] || "Fisk";
  if (els.measureStatusSummary) els.measureStatusSummary.textContent = result.status === "BIGPLUS" ? "BIGPLUS" : result.status;
  if (els.measureStatusSummaryText) els.measureStatusSummaryText.textContent = result.status === "BIGPLUS" ? "Fångsten är godkänd" : "Kontrollera måttet";
  if (els.guidedLengthResult) els.guidedLengthResult.textContent = formatCm(result.lengthCm);
  if (els.guidedHeightResult) els.guidedHeightResult.textContent = result.bodyCm ? formatCm(result.bodyCm) : `-- ${preferredUnit()}`;
  if (els.guidedSpeciesResult) els.guidedSpeciesResult.textContent = result.species || selectedSpecies?.name || "Fisk";
  if (els.guidedConfidenceResult) {
    const confidenceLabel = confidence.level === "very_high" ? "Mycket hög" : confidence.level === "high" ? "Hög" : confidence.level === "medium" ? "Medel" : "Låg";
    els.guidedConfidenceResult.textContent = `${confidenceLabel}${Number.isFinite(confidence.score) ? ` ${confidence.score}/100` : ""}`;
  }
  if (els.guidedRangeResult) els.guidedRangeResult.textContent = Number.isFinite(result.rangeMinCm) && Number.isFinite(result.rangeMaxCm)
    ? `${formatCm(result.rangeMinCm)}-${formatCm(result.rangeMaxCm)}` : "--";
  if (els.guidedVersionResult) els.guidedVersionResult.textContent = result.measurementVersion || "V1 Beta";
  if (els.guidedResultChecks) {
    const analysis = result.analysis || {};
    const landmarksConfirmed = Boolean(analysis.fishLandmarksDetected);
    const segmentationUsed = Boolean(analysis.fishSegmentationUsed);
    const segmentationModelBacked = Boolean(analysis.fishSegmentationModelBacked);
    const depthModelAvailable = Boolean(analysis.actualDepthModelAvailable);
    const depthUsed = Boolean(analysis.depthUsed);
    const checks = [
      [landmarksConfirmed, landmarksConfirmed ? "Nos och stjärt är markerade" : "Markera nos och stjärt manuellt"],
      [segmentationUsed, segmentationModelBacked ? "Fisksegmentering med tränad modell" : "Preliminär fisksegmentering hittade fiskområdet"],
      [depthUsed, depthUsed ? "Djup och perspektiv korrigerades" : depthModelAvailable ? "Djupanalys klar, men korrigering avvaktade" : "Djupmodell saknas i V1 Beta"],
      [analysis.speciesMorphologyVerified, analysis.speciesMorphologyVerified ? "Artens proportioner kontrollerades" : "Artproportioner används inte som säker mätning"]
    ];
    els.guidedResultChecks.replaceChildren(...checks.map(([ok, label]) => {
      const item = document.createElement("li");
      item.className = ok ? "is-complete" : "is-pending";
      item.textContent = `${ok ? "✓" : "!"} ${label}`;
      return item;
    }));
  }
  if (els.guidedResultStatus) {
    els.guidedResultStatus.textContent = !result.analysis?.fishLandmarksDetected
      ? "Flytta markörerna till fiskens nos och stjärt innan du sparar."
      : !result.analysis?.fishSegmentationModelBacked
        ? "En preliminär lokal fisksegmentering används. Kontrollera alltid nos och stjärt innan du sparar."
        : result.status === "BIGPLUS"
          ? "Måtten är ungefärliga och resultatet uppfyller Bigplus-gränsen."
          : "Måtten är ungefärliga. Kontrollera resultatet innan du sparar.";
  }
  if (els.guidedPerspectiveResult) els.guidedPerspectiveResult.textContent = result.analysis?.depthUsed
    ? `Djupanalys korrigerade perspektivet (${Math.round((result.analysis.depthConfidence || 0) * 100)}/100).`
    : result.analysis?.actualDepthModelAvailable
      ? "Djupanalys klar men gav ingen säker korrigering."
    : "Djupmodellen kunde inte användas i denna analys.";
  if (els.guidedResultPopup && document.body.classList.contains("measure-guided-active")) {
    els.guidedResultPopup.hidden = false;
  }
  updateMeasureTargetSummary();
  updateMeasureProgress();
}

function updateHandCalibrationStatus() {
  if (!els.handCalibrationStatus) return;
  const frontReady = Boolean(els.handCalibrationFront?.files?.length);
  const sideReady = Boolean(els.handCalibrationSide?.files?.length);
  els.handCalibrationStatus.textContent = frontReady && sideReady
    ? "Två bilder valda. Kontrollera pekfingerbredden och spara kalibreringen."
    : "Ringen är 20,0 mm invändigt. Välj båda bilderna innan du sparar.";
}

function saveHandCalibration() {
  const fingerWidth = Number(els.calibratedFingerWidth?.value);
  const frontReady = Boolean(els.handCalibrationFront?.files?.length);
  const sideReady = Boolean(els.handCalibrationSide?.files?.length);
  if (!frontReady || !sideReady || !Number.isFinite(fingerWidth) || fingerWidth < 10 || fingerWidth > 35) {
    updateHandCalibrationStatus();
    setStatus("Välj två bilder och ange fingerbredd");
    return false;
  }
  const now = new Date().toISOString();
  state.handCalibration = {
    userId: currentUserId(),
    referenceInnerDiameterMm: 20,
    indexFingerWidthMm: fingerWidth,
    indexFingerDepthMm: null,
    middleFingerWidthMm: null,
    handWidthMm: null,
    handLengthMm: null,
    calibrationConfidence: 0.72,
    createdAt: state.handCalibration?.createdAt || now,
    updatedAt: now
  };
  localStorage.setItem("bigplus_hand_calibration", JSON.stringify(state.handCalibration));
  setStatus("Handkalibrering sparad");
  invalidateResult();
  draw();
  return true;
}

async function calculate() {
  const guidedMode = document.body.classList.contains("measure-guided-active");
  const referenceFreeMode = document.body.classList.contains("measure-v1-active");
  // Reference-free V1 uses the uploaded image as its metric coordinate space.
  // Canvas points include display scaling/device pixels and cannot be mixed
  // with the image's natural height in the estimate.
  const fishPointsForMeasurement = referenceFreeMode
    ? state.points.fish.map(canvasPointToImage)
    : state.points.fish;
  const fishPixels = polylineDistance(fishPointsForMeasurement);
  const bodyPixels = bodyMeasurementPixels();
  const referenceScaleCmPerPixel = combinedReferenceScaleCmPerPixel();

  if (!state.image) {
    setStatus("Välj bild");
    return;
  }
  if (!els.speciesSelect.value && !guidedMode) {
    setStatus("Välj art");
    els.speciesSelect.focus();
    return;
  }
  if (!referenceFreeMode && !referenceScaleCmPerPixel) {
    setStatus("Placera referens");
    return;
  }
  if (state.points.fish.length < 2 || (referenceFreeMode && state.v1SeedLine)) {
    setStatus("Markera längd");
    return;
  }
  // Height is optional in V1. A missing body guide lowers confidence but must
  // not block a useful length estimate.
  lockMeasurement("fish");
  lockMeasurement("body");

  const speciesId = els.speciesSelect.value || "pike";
  const payload = {
    refPixels: 1,
    fishPixels,
    bodyPixels: state.points.body.length >= 2 ? bodyPixels : null,
    refCm: referenceScaleCmPerPixel || 0,
    calibrationFactor: 1,
    speciesId,
    minCm: Number(els.minSize.value),
    referenceMode: referenceFreeMode ? "reference-free-v1" : state.referenceSlots.can ? "can-hand" : state.referenceSlots.ring ? "ring-hand" : "glasses-depth",
    faceDepthCm: faceDepthDistanceCm(),
    measurementVersion: "BIGPLUS_MEASURE_V1"
  };

  try {
    setStatus("Räknar");
    const selectedSpecies = state.species.find((item) => item.id === speciesId);
    const measurementInput = {
      fishPoints: fishPointsForMeasurement,
      bodyPx: bodyPixels,
      scaleCmPerPixel: referenceScaleCmPerPixel,
      referenceFreeMode,
      imageWidthPx: state.image?.naturalWidth || state.image?.width || 0,
      imageHeightPx: state.image?.naturalHeight || state.image?.height || 0,
      referenceScales: referenceScalesForCalculation(),
      speciesId,
      speciesName: selectedSpecies?.name,
      minCm: Number(els.minSize.value),
      handGuides: state.handGuides,
      handCalibration: state.handCalibration || null,
      perspectiveScale: combinedObjectDepthScale(),
      weightKg: Number(els.manualWeightInput?.value || 0),
      fishVisibilityScore: state.v1Segmentation?.maskAvailable
        ? clamp(Number(state.v1Segmentation.visiblePercentage) || 0.6, 0.4, 0.95)
        : state.points.fish.length >= 2 && state.v1LandmarksConfirmed ? 0.86 : 0.45,
      fishLandmarksDetected: state.v1LandmarksDetected || state.v1LandmarksConfirmed,
      fishSegmentationAvailable: Boolean(state.v1Segmentation?.maskAvailable),
      fishSegmentationModelBacked: Boolean(state.v1Segmentation?.modelBacked),
      depthModelAvailable: Boolean(state.depthAnalysis?.ok),
      depthAnalysis: state.depthAnalysis?.ok ? state.depthAnalysis : null
    };
    const resultWithoutDepth = analyzeFishMeasurement({ ...measurementInput, depthAnalysis: null, depthModelAvailable: false });
    const resultWithDepth = state.depthAnalysis?.ok
      ? analyzeFishMeasurement(measurementInput)
      : resultWithoutDepth;
    const result = state.depthAnalysis?.shadowMode ? resultWithoutDepth : resultWithDepth;
    result.depthComparison = state.depthAnalysis?.ok
      ? { withoutDepth: resultWithoutDepth.lengthCm, withDepth: resultWithDepth.lengthCm, mode: state.depthAnalysis.shadowMode ? "shadow" : "active" }
      : null;
    state.lastResult = result;
    state.lastPayload = {
      ...payload,
      estimatedLengthCm: result.lengthCm,
      rangeMinCm: result.rangeMinCm,
      rangeMaxCm: result.rangeMaxCm,
      uncertaintyCm: result.uncertaintyCm,
      confidence: result.confidence,
      estimates: result.estimates,
      analysis: result.analysis,
      models: result.models,
      depth: result.depth,
      depthComparison: result.depthComparison,
      landmarks: {
        noseTip: state.points.fish[0] || null,
        tailTip: state.points.fish[state.points.fish.length - 1] || null,
        bodyPoints: state.points.body
      },
      manuallyAdjusted: state.v1LandmarksConfirmed
    };
    els.saveButton.disabled = false;
    renderResult(result);
    setStatus(result.status);
  } catch (error) {
    setStatus("Fel");
    alert(error.message);
  }
}

function updateSelectedCatchLocation(location) {
  selectedCatchLocation = location;
  if (catchLocationPickerMap && !catchLocationPickerMarker) catchLocationPickerMarker = window.L.marker([location.latitude, location.longitude]).addTo(catchLocationPickerMap);
  if (catchLocationPickerMarker) catchLocationPickerMarker.setLatLng([location.latitude, location.longitude]);
  if (els.catchLocationLabel) els.catchLocationLabel.textContent = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

function initCatchLocationMap() {
  if (!els.catchLocationMap || !window.L) return;
  if (!catchLocationPickerMap) {
    catchLocationPickerMap = window.L.map(els.catchLocationMap, { zoomControl: true }).setView([62.0, 15.0], 4);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap-bidragsgivare" }).addTo(catchLocationPickerMap);
    catchLocationPickerMap.on("click", (event) => updateSelectedCatchLocation({ latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) }));
  }
  window.setTimeout(() => catchLocationPickerMap.invalidateSize(), 50);
  if (selectedCatchLocation) updateSelectedCatchLocation(selectedCatchLocation);
}

async function chooseCatchLocation() {
  if (!els.catchLocationPicker) return;
  els.catchLocationPicker.hidden = !els.catchLocationPicker.hidden;
  if (!els.catchLocationPicker.hidden) initCatchLocationMap();
}

function clearCatchLocation() {
  selectedCatchLocation = null;
  if (catchLocationPickerMarker) { catchLocationPickerMap.removeLayer(catchLocationPickerMarker); catchLocationPickerMarker = null; }
  if (els.catchLocationLabel) els.catchLocationLabel.textContent = "Välj plats på kartan eller använd GPS";
}

function updateManualCatchLocation(location) {
  selectedManualCatchLocation = location;
  if (manualLocationPickerMap && !manualLocationPickerMarker) {
    manualLocationPickerMarker = window.L.marker([location.latitude, location.longitude]).addTo(manualLocationPickerMap);
  }
  manualLocationPickerMarker?.setLatLng([location.latitude, location.longitude]);
  if (els.manualLocationLabel) els.manualLocationLabel.textContent = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

function initManualCatchLocationMap() {
  if (!els.manualLocationMap || !window.L) return;
  if (!manualLocationPickerMap) {
    manualLocationPickerMap = window.L.map(els.manualLocationMap, { zoomControl: true }).setView([62.0, 15.0], 4);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap-bidragsgivare" }).addTo(manualLocationPickerMap);
    manualLocationPickerMap.on("click", (event) => updateManualCatchLocation({ latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) }));
  }
  window.setTimeout(() => manualLocationPickerMap.invalidateSize(), 50);
  if (selectedManualCatchLocation) updateManualCatchLocation(selectedManualCatchLocation);
}

function chooseManualCatchLocation() {
  if (!els.manualLocationPicker) return;
  els.manualLocationPicker.hidden = !els.manualLocationPicker.hidden;
  if (!els.manualLocationPicker.hidden) initManualCatchLocationMap();
}

function clearManualCatchLocation() {
  selectedManualCatchLocation = null;
  if (manualLocationPickerMarker) {
    manualLocationPickerMap?.removeLayer(manualLocationPickerMarker);
    manualLocationPickerMarker = null;
  }
  if (els.manualLocationLabel) els.manualLocationLabel.textContent = "Valfritt: markera platsen på kartan";
}

async function useCurrentCatchLocation() {
  if (!els.useCurrentCatchLocation) return;
  if (!navigator.geolocation) {
    if (els.catchLocationLabel) els.catchLocationLabel.textContent = "GPS stöds inte i den här webbläsaren";
    return;
  }

  els.useCurrentCatchLocation.disabled = true;
  els.useCurrentCatchLocation.textContent = "Hämtar plats...";
  if (els.catchLocationPicker) els.catchLocationPicker.hidden = false;
  initCatchLocationMap();

  try {
    const location = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)) }),
        reject,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    });
    updateSelectedCatchLocation(location);
    catchLocationPickerMap?.setView([location.latitude, location.longitude], 15);
    if (els.catchLocationLabel) els.catchLocationLabel.textContent = `Din plats: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  } catch (error) {
    if (els.catchLocationLabel) {
      els.catchLocationLabel.textContent = error?.code === 1
        ? "Platsåtkomst nekades. Välj plats på kartan."
        : "Kunde inte hämta platsen. Försök igen eller välj på kartan.";
    }
  } finally {
    els.useCurrentCatchLocation.disabled = false;
    els.useCurrentCatchLocation.textContent = "Använd min plats";
  }
}

function getCatchLocation() {
  return Promise.resolve(selectedCatchLocation);
}

async function persistCatch() {
  if (!state.lastPayload || savingCatch) return;

  savingCatch = true;
  if (els.saveButton) els.saveButton.disabled = true;
  try {
    window.bigplusLoading?.show("Sparar din fångst...");
    setStatus("Sparar");
    let competitionIds = [];
    competitionIds = currentMemberships();
    const location = await getCatchLocation();
    const payload = {
      measurement: state.lastPayload,
      userId: currentUserId(),
      note: els.catchNote?.value || "",
      photo: state.imageDataUrl,
      competitionIds,
      ...(location ? { location } : {})
    };
    let savedCatch = null;
    try { savedCatch = await saveCatch(payload); } catch (error) {
      if (currentUserId()) throw error;
    }
    const localCatch = saveLocalCatch(payload, state.lastResult);
    if (els.catchNote) els.catchNote.value = "";
    await loadCatches();
    resetPoints({ clearImage: true });
    window.dispatchEvent(new CustomEvent("bigplus:catch-saved", {
      detail: { catchId: savedCatch?.id || savedCatch?._id || localCatch?.id || "" }
    }));
    setStatus("Sparad");
  } catch (error) {
    window.bigplusLoading?.hide();
    setStatus("Fel");
    alert(error.message);
  } finally {
    savingCatch = false;
    if (els.saveButton) els.saveButton.disabled = false;
    updateMeasureProgress();
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

  const referenceId = options.referenceId || els.referenceSelect.value;
  els.referenceSelect.value = referenceId;
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
  state.virtualReference.referenceId = referenceId;
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

function placeGlassesAtPoint(point, width, status = "Glasögon placerade", rotationDeg = 0) {
  const frame = getImageFrame();
  const targetWidth = Number.isFinite(width)
    ? clamp(width, 70, 280)
    : clamp(frame.drawWidth * 0.24, 82, 180);
  const targetHeight = referenceVisualHeight(targetWidth, "glasses");
  const groundY = point.y + targetHeight / 2;
  const baseHeight = targetWidth / Math.max(0.1, perspectiveScaleForY(groundY));

  state.glassesPlacement.active = false;
  els.referenceScaleRange.value = String(Math.round(baseHeight));

  placeVirtualReference({
    referenceId: "glasses",
    x: point.x - targetWidth / 2,
    groundY,
    rotationDeg,
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

  if (referenceId === "ring-2cm") {
    return {
      x: state.fingerRing.point?.x || frame.offsetX + frame.drawWidth * 0.5,
      y: state.fingerRing.point?.y || frame.offsetY + frame.drawHeight * 0.58
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
      automaticGlassesWidth(face),
      "Ansikte hittat",
      face.rotationDeg || 0
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

async function placeHandReference({ autoAdvance = false } = {}) {
  if (!state.image) {
    setStatus("Ladda bild först");
    return;
  }

  setStatus("Söker händer och armposition");
  const holisticResult = await detectHolisticInImage();
  const armGuides = updateArmGuides(holisticResult);
  if (!state.handGuides.length) updateHandGuides(holisticResult);
  if (!state.handGuides.length) {
    updateHandGuides(await detectHandsInImage());
  }
  if (!state.handGuides.length) state.handGuides = armGuides;

  if (!["can-330", "can-330-slim"].includes(els.referenceSelect.value)) {
    els.referenceSelect.value = "can-330";
    els.customReferenceWrap.style.display = "none";
  }

  // The can is a fixed-size calibration object. Moving it must not change its
  // visual size; only the explicit size control may do that.
  els.autoPerspectiveToggle.checked = false;
  els.depthModeSelect.value = "manual";
  setCalibrationPercent(100);
  state.virtualReference.rotationDeg = 0;
  els.referenceRotationRange.value = "0";

  const guide = fishGuide();
  const handGuide = state.handGuides
    .slice()
    .sort((a, b) => {
      if (!guide) return b.y - a.y;
      const targetX = guide.centerX;
      const targetY = guide.centerY;
      return Math.hypot(a.x - targetX, a.y - targetY) - Math.hypot(b.x - targetX, b.y - targetY);
    })[0];
  const armFallback = Boolean(handGuide?.armFallback);
  // Glasses and can use different visual dimensions. Do not reuse the
  // glasses height when creating the can after face detection.
  const glassesBasedHeight = glassesBasedCanHeight();
  const baseHeight = glassesBasedHeight || 150;
  // The visible palm is only part of the hand silhouette in a photo. Use a
  // larger local can anchor so the hand covers roughly 70% of the can side.
  const handSizedHeight = handGuide && !glassesBasedHeight
    ? clamp((handGuide.width / 0.56) * 0.97, baseHeight * 0.9, baseHeight * 1.6)
    : 0;
  // Keep the can's physical scale independent from the weak relative z
  // estimate. The explicit size control remains the only way to resize it.
  const fingerSpanBasedHeight = handGuide?.fingerSpanPixels && handGuide.fingerSpanCm
    ? clamp((handGuide.fingerSpanPixels / handGuide.fingerSpanCm) * CAN_HEIGHT_CM, 42, 700)
    : 0;
  const singleFingerBasedHeight = handGuide?.fingerWidth && handGuide.visibleFingerCount === 1
    ? clamp((handGuide.fingerWidth / FINGER_WIDTH_CM) * CAN_HEIGHT_CM, 42, 700)
    : 0;
  const fingerRingBasedHeight = state.fingerRing.available
    ? clamp((state.fingerRing.pixels / FINGER_WIDTH_CM) * CAN_HEIGHT_CM * combinedObjectDepthScale(), baseHeight * 0.92, baseHeight * 1.28)
    : 0;
  const fingerDepthAdjustedHeight = baseHeight * fingerPlaneScale();
  // Finger span is the physical cue at the fish plane. It may enlarge the
  // can, but never shrink the glasses-based starting reference.
  const poseAdjustment = state.poseContext.available && state.poseContext.sameShoulderHeight
    ? clamp(combinedObjectDepthScale(), 0.94, 1.06)
    : 1;
  const estimatedHeight = Math.max(42, baseHeight * poseAdjustment, fingerDepthAdjustedHeight, handSizedHeight, fingerSpanBasedHeight, singleFingerBasedHeight, fingerRingBasedHeight);
  state.virtualReference.baseHeight = estimatedHeight;
  state.virtualReference.height = estimatedHeight;
  if (!Number.isFinite(state.referenceDepth.canBaselineHeight)) {
    state.referenceDepth.canBaselineHeight = estimatedHeight;
  }
  if (handGuide) {
    els.referenceScaleRange.value = String(Math.round(estimatedHeight));
  }
  if (els.mobileReferenceScale) els.mobileReferenceScale.value = String(Math.round(estimatedHeight));
  if (els.mobileReferenceScaleValue) els.mobileReferenceScaleValue.textContent = `${Math.round((estimatedHeight / 150) * 100)}%`;
  const estimatedWidth = estimatedHeight * 0.42;
  const handX = handGuide
    ? handGuide.x - estimatedWidth * 0.5
    : guide ? guide.head.x - estimatedWidth * 0.5 : els.canvas.width * 0.5;
  const handY = handGuide?.y ?? (guide ? guide.centerY : els.canvas.height * 0.62);

  placeVirtualReference({
    x: handX,
    groundY: handY + estimatedHeight / 2,
    rotationDeg: 0,
    status: handGuide
      ? armFallback
        ? "Armarnas V hittad – kontrollera burkens storlek"
        : state.poseContext.sameShoulderHeight
          ? "Hand och axelhöjd hittad – placera burken"
          : "Hand hittad – kontrollera armarnas djup"
      : "Hand hittades inte – justera burken manuellt"
  });
  if (autoAdvance && handGuide) {
    setTool("fish");
    updateMeasureMenuState("length");
    setStatus(armFallback
      ? "Armarnas V hittad – kontrollera burken och markera längden"
      : state.poseContext.sameShoulderHeight
        ? "Axelhöjd och handläge hittade – kontrollera burken och markera längden"
        : "Burk placerad – kontrollera armarnas djup och markera längden");
  } else if (autoAdvance) {
    setTool("fish");
    updateMeasureMenuState("length");
    setStatus("Burk placerad – kontrollera placeringen och markera längden");
  }
}

async function placeRingReference({ automatic = false } = {}) {
  if (!state.image) {
    setStatus("Ladda bild först");
    return;
  }

  setStatus("Söker ett finger");
  const holisticResult = await detectHolisticInImage();
  updateHandGuides(holisticResult);
  if (!state.fingerRing.point) {
    updateHandGuides(await detectHandsInImage());
  }

  if (state.fingerRing.point) {
    placePaletteReference("ring-2cm");
    setStatus("Ring placerad automatiskt på finger");
  } else {
    if (automatic) {
      setStatus("Inget finger hittades – ring väntar på en synlig hand");
      return;
    }
    placePaletteReference("ring-2cm");
    setStatus("Finger hittades inte – flytta ringen till ett finger");
  }
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

  const existingSlotName = referenceSlotNameForId(referenceId);
  if (existingSlotName && state.referenceSlots[existingSlotName]) {
    editReferenceSlot(existingSlotName);
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
    state.virtualReference.referenceId = "glasses";
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

  if (referenceId === "ring-2cm") {
    const fingerPoint = point || state.fingerRing.point || defaultPalettePoint(referenceId);
    const outerPixels = state.fingerRing.pixels > 0
      ? state.fingerRing.pixels * (RING_OUTER_WIDTH_CM / RING_HOLE_WIDTH_CM)
      : 72;
    const ringHeight = clamp(outerPixels / selectedReferenceWidthRatio(referenceId), 28, 180);
    const ringWidth = ringHeight * selectedReferenceWidthRatio(referenceId);
    // The ring is calibrated directly from the finger. Do not inherit the
    // can/glasses perspective correction, or its scale changes after placement.
    els.autoPerspectiveToggle.checked = false;
    els.depthModeSelect.value = "manual";
    els.referenceScaleRange.value = String(Math.round(ringHeight));
    placeVirtualReference({
      referenceId,
      x: fingerPoint.x - ringWidth / 2,
      groundY: fingerPoint.y + ringHeight / 2,
      rotationDeg: state.fingerRing.rotationDeg || 0,
      status: state.fingerRing.point ? "Ring placerad vid finger" : "Ring placerad – flytta den till fingret"
    });
    return;
  }

  const center = point || defaultPalettePoint(referenceId);
  const height = Number(els.referenceScaleRange.value) || 150;
  const width = height * selectedReferenceWidthRatio(referenceId);
  placeVirtualReference({
    referenceId,
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
  element.addEventListener("click", (event) => {
    if (event.target.closest(".reference-palette-lock")) return;
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
    if (event.pointerType !== "mouse") {
      suppressPaletteClick = true;
      placePaletteReference(drag.referenceId);
    }
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
  document.querySelector(".measure-area")?.classList.add("is-start");
  const mode = getApiMode();
  setStatus(mode.label);

  const customReference = DEFAULT_REFERENCES.find((item) => item.id === "custom");
  state.references = [
    ...DEFAULT_REFERENCES.filter((item) => item.id !== "custom"),
    ...getStoredReferences(),
    customReference
  ].filter(Boolean);
  state.species = DEFAULT_SPECIES;
  try {
    const savedCalibration = JSON.parse(localStorage.getItem("bigplus_hand_calibration") || "null");
    if (savedCalibration && Number(savedCalibration.referenceInnerDiameterMm) === 20) state.handCalibration = savedCalibration;
  } catch {
    state.handCalibration = null;
  }
  renderReferenceOptions();
  renderSpeciesOptions();
  els.referenceSelect.value = "glasses";
  state.referenceSlots.active = "glasses";
  els.speciesSelect.value = "";
  els.minSize.value = 0;
  els.customReferenceWrap.style.display = "none";
  updateReferenceSpecificControls();
  updateSimpleReferenceButtons();
  updateManualEntryState();
  renderCatches(getLocalCatches(currentUserId()).slice(-30).reverse());

  try {
    const [references, species] = await Promise.all([getReferences(), getSpecies()]);
    const calibrationReferences = new Map(DEFAULT_REFERENCES.map((item) => [item.id, item]));
    state.references = references.map((item) => {
      const calibrated = calibrationReferences.get(item.id);
      return calibrated
        ? { ...item, sizeCm: calibrated.sizeCm, widthCm: calibrated.widthCm, heightCm: calibrated.heightCm, note: calibrated.note }
        : item;
    });
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
    els.speciesSelect.value = "";
    els.minSize.value = 0;
    updateMeasureTargetSummary();
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
      setMeasurementImage(image, dataUrl);
    };
    image.src = dataUrl;
  } catch {
    setStatus("Välj bild");
  }
}

els.photoInput.addEventListener("change", () => {
  readImageFile(els.photoInput.files?.[0], setMeasurementImage);
});

els.manualPhotoInput?.addEventListener("change", () => {
  readImageFile(els.manualPhotoInput.files?.[0], (image, dataUrl) => {
    state.image = image;
    state.imageDataUrl = dataUrl;
    resetZoom();
    resetPoints();
    showManualEntry();
    draw();
  });
});

els.cameraPhotoInput?.addEventListener("change", () => {
  readImageFile(els.cameraPhotoInput.files?.[0], setMeasurementImage);
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
  const requiredPoints = requiredMeasurementPoints(state.activeTool);
  if (points.length >= requiredPoints) points.length = 0;
  points.push(point);
  if (state.activeTool === "fish") {
    state.v1SeedLine = false;
    if (points.length >= requiredPoints) state.v1LandmarksConfirmed = true;
  }
  if (points.length === requiredPoints) {
    const completedTool = state.activeTool;
    if (completedTool === "fish" || completedTool === "body") {
      state.measurementLocks[completedTool] = false;
      setStatus(completedTool === "fish" ? "Längd markerad" : "Höjd markerad");
    } else {
      setTool(nextToolAfterComplete(completedTool));
    }
  } else if (state.activeTool === "body" && points.length % 2 === 0) {
    setStatus("Höjdens första punkt markerad");
  }
  invalidateResult();
  draw();
});

els.canvas.addEventListener("pointerdown", (event) => {
  if (!state.image) return;
  if (event.pointerType === "touch" && state.virtualReference.enabled && state.virtualReference.selected && !state.virtualReference.locked) {
    canvasTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (canvasTouchPointers.size >= 2) {
      const points = [...canvasTouchPointers.values()];
      pinchReference.active = true;
      pinchReference.startDistance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      pinchReference.startHeight = state.virtualReference.baseHeight;
      state.virtualReference.dragging = false;
      state.virtualReference.pointerAction = "";
      event.preventDefault();
      return;
    }
  }
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
  if (action === "move") state.virtualReference.selected = true;
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
  if (event.pointerType === "touch" && canvasTouchPointers.has(event.pointerId)) {
    canvasTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  if (pinchReference.active && canvasTouchPointers.size >= 2) {
    const points = [...canvasTouchPointers.values()];
    const currentDistance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
    setMobileReferenceScale(pinchReference.startHeight * (currentDistance / pinchReference.startDistance));
    state.view.suppressNextClick = true;
    event.preventDefault();
    return;
  }
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
      if (state.pointDrag.tool === "fish") {
        state.v1SeedLine = false;
        state.v1LandmarksConfirmed = true;
      }
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
  if (event.pointerType === "touch") {
    canvasTouchPointers.delete(event.pointerId);
    if (pinchReference.active) {
      if (canvasTouchPointers.size < 2) pinchReference.active = false;
      state.view.suppressNextClick = true;
      draw();
      return;
    }
  }
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
  canvasTouchPointers.clear();
  pinchReference.active = false;
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

els.mobileReferenceScale?.addEventListener("input", (event) => {
  setMobileReferenceScale(event.target.value);
});
els.mobileScaleDown?.addEventListener("click", () => {
  setMobileReferenceScale((Number(els.mobileReferenceScale.value) || 150) - 8);
});
els.mobileScaleUp?.addEventListener("click", () => {
  setMobileReferenceScale((Number(els.mobileReferenceScale.value) || 150) + 8);
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
  updateMeasureTargetSummary();
  updateMeasureProgress();
});

els.handCalibrationButton?.addEventListener("click", () => {
  updateHandCalibrationStatus();
  if (typeof els.handCalibrationDialog?.showModal === "function") els.handCalibrationDialog.showModal();
  else els.handCalibrationDialog?.setAttribute("open", "open");
});
els.handCalibrationFront?.addEventListener("change", updateHandCalibrationStatus);
els.handCalibrationSide?.addEventListener("change", updateHandCalibrationStatus);
els.handCalibrationForm?.addEventListener("submit", (event) => {
  if (event.submitter !== els.handCalibrationSave) return;
  event.preventDefault();
  if (saveHandCalibration()) els.handCalibrationDialog?.close();
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
els.rulerToggleButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  const ready = Boolean(state.image && state.points.fish.length >= 2 && combinedReferenceScaleCmPerPixel());
  if (!ready) {
    setStatus("Markera längden och placera en referens först");
    return;
  }
  state.rulerVisible = !state.rulerVisible;
  draw();
});
els.lockLengthButton?.addEventListener("click", () => toggleMeasurementLock("fish"));
els.lockHeightButton?.addEventListener("click", () => toggleMeasurementLock("body"));
els.lockLengthButton?.addEventListener("click", (event) => event.stopPropagation());
els.lockHeightButton?.addEventListener("click", (event) => event.stopPropagation());
els.lockGlassesPalette?.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePaletteReferenceLock("glasses");
});
els.lockCanPalette?.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePaletteReferenceLock("can");
});
[els.lockGlassesPalette, els.lockCanPalette].forEach((button) => {
  button?.addEventListener("pointerdown", (event) => {
    // Do not prevent the native click: the lock action is handled on click.
    event.stopPropagation();
  });
});
els.lengthCard?.addEventListener("click", () => unlockMeasurement("fish"));
els.heightCard?.addEventListener("click", () => unlockMeasurement("body"));
els.lengthCard?.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); unlockMeasurement("fish"); } });
els.heightCard?.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); unlockMeasurement("body"); } });
els.lockSizeChecklist?.addEventListener("click", toggleSizeChecklistLock);
els.simpleCanButton?.addEventListener("click", () => chooseSimpleReference("can-330"));
els.simpleGlassesButton?.addEventListener("click", () => chooseSimpleReference("glasses"));
els.lockReferenceButton?.addEventListener("click", toggleReferenceLock);
els.lockReferenceChecklist?.addEventListener("click", toggleReferencePlacementLock);
els.checkGlasses?.querySelector(".check-label")?.addEventListener("click", () => editReferenceSlot("glasses"));
els.checkCan?.querySelector(".check-label")?.addEventListener("click", () => editReferenceSlot("can"));
els.checklistNextButton?.addEventListener("click", finishChecklistStep);
bindReferencePaletteItem(els.paletteGlasses, "glasses");
bindReferencePaletteItem(els.paletteCan, "can-330");
els.manualCaptureButton?.addEventListener("click", () => {
  delete document.documentElement.dataset.measureMode;
  els.manualPhotoInput?.click();
});
els.guidedCaptureButton?.addEventListener("click", () => {
  document.documentElement.dataset.measureMode = "v1";
  els.photoInput?.click();
});
els.cameraCaptureButton?.addEventListener("click", () => {
  document.documentElement.dataset.measureMode = "v1";
  els.cameraPhotoInput?.click();
});
els.changeMeasurePhotoButton?.addEventListener("click", () => els.photoInput?.click());
els.cancelMeasureButton?.addEventListener("click", cancelGuidedMeasurement);
els.guidedMeasureButton?.addEventListener("click", () => {
  const hasConfirmedPoints = state.points.fish.length >= 2
    && (!document.body.classList.contains("measure-v1-active") || !state.v1SeedLine)
    && (state.v1LandmarksDetected || state.v1LandmarksConfirmed);
  if (!hasConfirmedPoints) {
    state.points.fish = [];
    state.v1SeedLine = false;
    state.v1LandmarksDetected = false;
    state.v1LandmarksConfirmed = false;
    invalidateResult();
    setTool("fish");
    setStatus("Klicka på fiskens nos och stjärt");
    draw();
    return;
  }
  void calculate();
});
els.guidedResultPopupClose?.addEventListener("click", () => {
  if (els.guidedResultPopup) els.guidedResultPopup.hidden = true;
});
els.guidedResultAdjust?.addEventListener("click", () => {
  if (!document.body.classList.contains("measure-v1-active")) return;
  if (els.guidedResultPopup) els.guidedResultPopup.hidden = true;
  state.v1SeedLine = true;
  state.v1LandmarksConfirmed = false;
  state.v1LandmarksDetected = false;
  unlockMeasurement("fish");
  setTool("fish");
  setStatus("Dra ändpunkterna till nos och stjärt");
  draw();
});
els.measureStepMenu?.querySelectorAll("[data-measure-menu]").forEach((button) => {
  button.addEventListener("click", () => {
    const step = button.dataset.measureMenu;
    if (step === "glasses") {
      els.paletteGlasses?.click();
      setTool("ref");
    } else if (step === "can") {
      els.paletteCan?.click();
      setTool("ref");
      if (state.image) void placeHandReference();
    } else if (step === "ring") {
      els.referenceSelect.value = "ring-2cm";
      setTool("ref");
      void placeRingReference();
    } else if (step === "length") {
      setTool("fish");
      setStatus(state.points.fish.length >= 2 ? "Justera längden" : "Markera längden på fisken");
    } else if (step === "width") {
      setTool("body");
      setStatus(state.points.body.length >= 2 ? "Justera bredden" : "Markera bredden på fisken");
    }
    updateMeasureMenuState(step);
  });
});
els.saveManualCatchButton?.addEventListener("click", persistManualCatch);
els.manualSpeciesSelect?.addEventListener("change", updateManualEntryState);
els.manualLengthInput?.addEventListener("input", updateManualEntryState);
els.manualWeightInput?.addEventListener("input", updateManualEntryState);
els.chooseManualCatchLocation?.addEventListener("click", chooseManualCatchLocation);
els.clearManualCatchLocation?.addEventListener("click", clearManualCatchLocation);
els.manualBackButton?.addEventListener("click", () => {
  state.image = null;
  state.imageDataUrl = "";
  clearManualCatchLocation();
  if (els.manualLocationPicker) els.manualLocationPicker.hidden = true;
  showMeasureStart();
  draw();
});
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
els.measureNewFishButton?.addEventListener("click", () => resetPoints({ clearImage: true }));
els.calculateButton.addEventListener("click", calculate);
els.saveButton.addEventListener("click", persistCatch);
els.resultMeasureAgain?.addEventListener("click", () => resetPoints());
els.chooseCatchLocation?.addEventListener("click", chooseCatchLocation);
els.useCurrentCatchLocation?.addEventListener("click", useCurrentCatchLocation);
els.clearCatchLocation?.addEventListener("click", clearCatchLocation);
els.resetButton.addEventListener("click", clearCatchLocation);
window.addEventListener("resize", draw);
window.addEventListener("bigplus:settings-changed", () => {
  updateMeasureTargetSummary();
  renderResult(state.lastResult || null);
  draw();
});

boot().catch((error) => {
  setStatus("Fel");
  console.error(error);
});
