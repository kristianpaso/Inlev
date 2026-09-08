import { API_ROOT, LOCAL_API_ROOT, RENDER_API_ROOT } from "../api/config.js";
import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";
import { AUTH_API_ROOT } from "./api-root.js?v=20260903-account-api-1";
import { currentAccount } from "./account.js";

const JOURNAL_TRIPS_KEY = "bigplus_fishing_trips";
const JOURNAL_PLANNER_KEY = "bigplus_journal_planner_state_v2";
const JOURNAL_PLANS_KEY = "bigplus_journal_plans_v1";
const JOURNAL_ACTIVE_PLAN_KEY = "bigplus_journal_active_plan_v1";
const JOURNAL_PIN_COLORS = [
  { base: "#27d97f", light: "#a1ffc7", route: "#27d97f" },
  { base: "#2585ff", light: "#9bcfff", route: "#2585ff" },
  { base: "#ff8b20", light: "#ffd08c", route: "#ff8b20" },
  { base: "#864cff", light: "#c7a9ff", route: "#864cff" },
  { base: "#ff4f82", light: "#ff9fbd", route: "#ff4f82" },
  { base: "#ffd43b", light: "#fff0a3", route: "#ffd43b" },
];

const INITIAL_SPOTS = [
  { name: "Bj\u00f6rkviks brygga", area: "Ingar\u00f6, V\u00e4rmd\u00f6", coordinates: "59.2380, 18.4900", lngLat: [18.49, 59.238], time: "08:30 - 09:30 (1 h)", shortTime: "08:30", priority: "Start", method: "Genomg\u00e5ng - F\u00f6rbered utrustning", wind: "6 m/s V", depth: "Brygga", notes: "Samling, s\u00e4kerhetskontroll och sj\u00f6s\u00e4ttning.", image: "/bigplus/assets/catch-page/scene-9.png", checklist: ["Kontrollera br\u00e4nsle", "Starta ekolod", "S\u00e4kerhetsgenomg\u00e5ng", "F\u00f6rdela utrustning", "Logga avg\u00e5ng"] },
  { name: "Krokviken", area: "N\u00e4md\u00f6fj\u00e4rden, V\u00e4rmd\u00f6", coordinates: "59.2821, 18.5412", lngLat: [18.5412, 59.2821], time: "11:15 - 13:45 (2 h 30 min)", shortTime: "11:15", priority: "H\u00f6g", method: "Jigging - Gummijigg 12-15 cm", wind: "7 m/s V", depth: "3 - 12 m", notes: "Brant kant mot djup. Bra g\u00e4ddl\u00e4ge.", image: "/bigplus/assets/catch-page/scene-4.png", checklist: ["Kontrollera djup p\u00e5 ekolod", "Testa jigghastighet vid grundkanten", "Prova l\u00e5ngsam jigging", "Foto och logga resultat", "Notera betesfisk"] },
  { name: "Landholmsviken", area: "N\u00e4md\u00f6fj\u00e4rden, V\u00e4rmd\u00f6", coordinates: "59.3050, 18.6800", lngLat: [18.68, 59.305], time: "14:30 - 16:30 (2 h)", shortTime: "14:30", priority: "Medel", method: "Drop shot - Mask 10 cm", wind: "6 m/s V", depth: "2 - 10 m", notes: "Grund vik med vegetation. Bra f\u00f6r abborre.", image: "/bigplus/assets/catch-page/scene-6.png", checklist: ["S\u00f6k betesfisk", "Prova drop shot", "Fiska vegetationskanten", "Fotografera platsen", "Notera vattentemperatur"] },
  { name: "S\u00f6dra grundet", area: "N\u00e4md\u00f6fj\u00e4rden, V\u00e4rmd\u00f6", coordinates: "59.2450, 18.8300", lngLat: [18.83, 59.245], time: "16:30 - 17:30 (1 h)", shortTime: "16:30", priority: "Medel", method: "Spinnfiske - Inlinebete 10 cm", wind: "5 m/s V", depth: "1 - 4 m", notes: "Avsluta \u00f6ver grundet om vinden till\u00e5ter.", image: "/bigplus/assets/catch-page/scene-9.png", checklist: ["Kontrollera vinden", "Fiska lovartsidan", "Testa snabb hemtagning", "Logga sista f\u00e5ngsten", "Kontrollera hemf\u00e4rd"] },
];
let SPOTS = [];
let HIGHLIGHTS = [];

// Waypoints keep the planner route in the visible water corridors or along the road network.
const ROUTE_COORDINATES = {
  boat: [
    [18.49, 59.238], [18.496, 59.227], [18.522, 59.221], [18.555, 59.229], [18.581, 59.247], [18.583, 59.268], [18.5412, 59.2821],
    [18.573, 59.266], [18.612, 59.246], [18.652, 59.255], [18.68, 59.305], [18.714, 59.289], [18.754, 59.273], [18.795, 59.254], [18.83, 59.245],
  ],
  car: [
    [18.49, 59.238], [18.503, 59.244], [18.519, 59.254], [18.528, 59.269], [18.5412, 59.2821],
    [18.566, 59.291], [18.594, 59.302], [18.633, 59.311], [18.68, 59.305], [18.708, 59.295], [18.741, 59.278], [18.779, 59.259], [18.83, 59.245],
  ],
};

const DEFAULT_CHECKS = { 0: [true, true, true, false, false], 1: [true, true, false, false, true], 2: [true, false, false, false, false], 3: [false, false, false, false, false] };
let plannerState = readPlannerState();
const savedPlannerStops = [];
const hasExplicitBoatStops = savedPlannerStops.some((spot) => spot?.travelMode === "boat");
const hasExplicitCarStops = savedPlannerStops.some((spot) => spot?.travelMode === "car" || spot?.travelMode === "walk");
const savedTransport = plannerState.fields.transport;
const savedTransportVersion = Number(plannerState.fields.transportVersion) || 0;
let journalTransport = savedTransportVersion >= 2 && savedTransport === "boat" && hasExplicitBoatStops && !hasExplicitCarStops ? "boat" : "car";
let journalMode = plannerState.fields.mode === "create" ? "create" : "edit";
let journalAddDestinationMode = false;
let journalMarkerMoveMode = false;
let journalPendingDestination = null;
let journalEditingSpotIndex = null;
let journalQuickBoatMode = false;
let journalBoatRouteCoordinates = [];
let journalCarRouteCoordinates = [];
let journalBoatRouteSegments = [];
let journalCarRouteSegments = [];
let journalCarTravelMode = "car";
let journalRouteRequestId = 0;
let journalRouteRefreshTimer = 0;
let journalFitRouteAfterCalculation = false;
let journalRouteMissingRamp = false;
let journalMap = null;
let journalMarkers = [];
let journalMapPinInfoIndex = null;
let journalMarkerActionMode = null;
let journalEditingHighlightIndex = null;
let journalRouteTimeLabels = [];
let journalRouteOverlay = null;
let plannerBound = false;
let mapReadyListenerBound = false;
let remotePlans = null;
let remotePlanSaveQueue = Promise.resolve();
const remotePlanSaveTimers = new Map();

SPOTS = SPOTS.map((spot, index) => ({ ...spot, pinColorIndex: Number.isInteger(spot.pinColorIndex) ? spot.pinColorIndex : index % JOURNAL_PIN_COLORS.length }));
if (!plannerState.fields.planId) plannerState.fields.planId = "legacy-plan";
if (!plannerState.fields.startTime) plannerState.fields.startTime = "08:30";
if (!plannerState.fields.planDate) plannerState.fields.planDate = localDateValue();
function readPlannerState() {
  if (currentAccount()) return { activeSpot: 0, favorites: [], checks: {}, ratings: [], started: false, savedAt: "", notes: "", fields: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(JOURNAL_PLANNER_KEY) || "null");
    if (saved && typeof saved === "object") return { activeSpot: Number.isInteger(saved.activeSpot) ? saved.activeSpot : 1, favorites: Array.isArray(saved.favorites) ? saved.favorites : [1], checks: saved.checks && typeof saved.checks === "object" ? saved.checks : DEFAULT_CHECKS, ratings: Array.isArray(saved.ratings) ? saved.ratings : [5, 5, 5, 3], started: Boolean(saved.started), savedAt: saved.savedAt || "", notes: saved.notes || "", fields: saved.fields && typeof saved.fields === "object" ? saved.fields : {} };
  } catch {}
  return { activeSpot: 1, favorites: [1], checks: DEFAULT_CHECKS, ratings: [5, 5, 5, 3], started: false, savedAt: "", notes: "", fields: {} };
}

function clonePlannerValue(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

function plannerPlanId() {
  return String(plannerState.fields.planId || "legacy-plan");
}

function isHighlightPlace(spot) {
  return spot?.highlightType === "boat_ramp" || spot?.isHighlight === true || spot?.type === "boat_ramp";
}

function spotIsBoatPlace(spot) {
  return !isHighlightPlace(spot) && (spot?.isBoatPlace === true || spot?.isBoatBase === true || spot?.travelMode === "boat" || spot?.routeMode === "boat");
}

function normalizeBoatPlace(spot) {
  return {
    ...spot,
    isBoatPlace: true,
    isBoatBase: false,
    isWater: true,
    routeMode: "boat",
    travelMode: "boat",
  };
}

function normalizeHighlight(spot, index, routeOrder = index) {
  return {
    ...spot,
    name: spot?.name || "Båtplats",
    type: "boat_ramp",
    highlightType: "boat_ramp",
    isBoatBase: true,
    isWater: true,
    travelMode: "boat",
    routeOrder: Number.isFinite(Number(spot?.routeOrder)) ? Number(spot.routeOrder) : routeOrder,
    pinColorIndex: Number.isInteger(spot?.pinColorIndex) ? spot.pinColorIndex : index % JOURNAL_PIN_COLORS.length,
  };
}

function splitPlanCollections(rawStops = [], rawHighlights = []) {
  const stops = [];
  const highlights = rawHighlights.map((spot, index) => normalizeHighlight(spot, index, spot?.routeOrder ?? index));
  rawStops.forEach((spot, index) => {
    const normalized = { ...spot, lngLat: Array.isArray(spot?.lngLat) ? spot.lngLat.map(Number) : [18.66, 59.27] };
    if (isHighlightPlace(normalized)) highlights.push(normalizeHighlight(normalized, highlights.length, normalized.routeOrder ?? index));
      else stops.push({ ...(spotIsBoatPlace(normalized) ? normalizeBoatPlace(normalized) : normalized), routeOrder: Number.isFinite(Number(normalized.routeOrder)) ? Number(normalized.routeOrder) : index });
  });
  return { stops, highlights };
}

function plannerRouteNodes(includeHighlights = false) {
  const nodes = SPOTS.map((spot, index) => ({ spot, spotIndex: index, highlight: false, order: Number.isFinite(Number(spot?.routeOrder)) ? Number(spot.routeOrder) : index }));
  if (includeHighlights) HIGHLIGHTS.forEach((spot, index) => nodes.push({ spot, spotIndex: SPOTS.length + index, highlight: true, highlightIndex: index, order: Number.isFinite(Number(spot?.routeOrder)) ? Number(spot.routeOrder) : SPOTS.length + index }));
  return nodes.sort((left, right) => left.order - right.order || left.spotIndex - right.spotIndex);
}

function nextHighlightRouteOrder() {
  const nodes = plannerRouteNodes(true);
  const maxOrder = nodes.reduce((highest, node) => Math.max(highest, Number(node.order) || 0), -1);
  let lastBoatIndex = -1;
  nodes.forEach((node, index) => { if (spotIsBoatPlace(node.spot)) lastBoatIndex = index; });
  if (lastBoatIndex < 0) return maxOrder + 1;
  let passageOrder = Number(nodes[lastBoatIndex].order) || 0;
  for (let index = lastBoatIndex + 1; index < nodes.length; index += 1) {
    if (!nodes[index].highlight) break;
    passageOrder = Number(nodes[index].order) || passageOrder;
  }
  const nextNormal = nodes.find((node) => !node.highlight && Number(node.order) > passageOrder);
  return nextNormal ? (passageOrder + Number(nextNormal.order)) / 2 : passageOrder + 0.5;
}

function routeOriginCoordinate() {
  return plannerRouteNodes()[0]?.spot?.lngLat || [18.66, 59.27];
}

function plannerStorageKey(accountId = currentAccount()?.id) {
  return accountId ? `${JOURNAL_PLANS_KEY}:${accountId}` : JOURNAL_PLANS_KEY;
}

function activePlanStorageKey(accountId = currentAccount()?.id) {
  return accountId ? `${JOURNAL_ACTIVE_PLAN_KEY}:${accountId}` : JOURNAL_ACTIVE_PLAN_KEY;
}

function rememberedActivePlanId() {
  try { return localStorage.getItem(activePlanStorageKey()) || ""; } catch { return ""; }
}

function rememberActivePlan(planId) {
  if (!planId) return;
  try { localStorage.setItem(activePlanStorageKey(), String(planId)); } catch {}
}

function readLocalSavedPlans(key = plannerStorageKey()) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved.filter((plan) => plan && typeof plan === "object" && plan.id) : [];
  } catch { return []; }
}

function readSavedPlans() {
  return currentAccount() && Array.isArray(remotePlans) ? remotePlans : [];
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function planDateValue(plan) {
  return String(plan?.date || plan?.fields?.planDate || "").slice(0, 10);
}

function planIsArchived(plan) {
  const date = planDateValue(plan);
  return Boolean(date && date < localDateValue());
}

function formatPlanDate(date) {
  if (!date) return "Datum saknas";
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Datum saknas";
  return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function currentPlanSnapshot() {
  const stops = SPOTS.map((spot) => ({ ...spot, lngLat: [...spot.lngLat] }));
  const highlights = HIGHLIGHTS.map((spot) => ({ ...spot, lngLat: [...spot.lngLat] }));
  return {
    id: plannerPlanId(),
    title: plannerState.fields.planTitle || "Min fisketur",
    date: plannerState.fields.planDate || localDateValue(),
    stops,
    highlights,
    fields: { ...clonePlannerValue(plannerState.fields), stops, highlights },
    activeSpot: plannerState.activeSpot,
    favorites: clonePlannerValue(plannerState.favorites),
    checks: clonePlannerValue(plannerState.checks),
    ratings: clonePlannerValue(plannerState.ratings),
    started: Boolean(plannerState.started),
    notes: plannerState.notes || "",
    savedAt: new Date().toISOString(),
  };
}

async function putRemotePlan(snapshot) {
  if (!currentAccount()) return null;
  try {
    const response = await fetch(`${AUTH_API_ROOT}/plans/${encodeURIComponent(snapshot.id)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

function queueRemotePlanSave(snapshot) {
  if (!currentAccount()) return;
  const existingTimer = remotePlanSaveTimers.get(snapshot.id);
  if (existingTimer) window.clearTimeout(existingTimer);
  const timer = window.setTimeout(() => {
    remotePlanSaveTimers.delete(snapshot.id);
    remotePlanSaveQueue = remotePlanSaveQueue.then(async () => {
      const saved = await putRemotePlan(snapshot);
      if (!saved || !Array.isArray(remotePlans)) return;
      const next = remotePlans.filter((plan) => plan.id !== saved.id);
      remotePlans = [saved, ...next];
    });
  }, 350);
  remotePlanSaveTimers.set(snapshot.id, timer);
}

function saveCurrentPlanToLibrary() {
  const snapshot = currentPlanSnapshot();
  if (!currentAccount()) return snapshot;
  const plans = readSavedPlans();
  const existing = plans.findIndex((plan) => plan.id === snapshot.id);
  if (existing >= 0) plans[existing] = snapshot; else plans.unshift(snapshot);
  remotePlans = plans;
  queueRemotePlanSave(snapshot);
  return snapshot;
}

function persistPlannerState() {
  if (!currentAccount()) return;
  if (plannerState.fields.planId) saveCurrentPlanToLibrary();
}

function persistPlannerStops() {
  plannerState.fields.stops = SPOTS.map((spot) => ({ ...spot, lngLat: [...spot.lngLat] }));
  plannerState.fields.highlights = HIGHLIGHTS.map((spot) => ({ ...spot, lngLat: [...spot.lngLat] }));
  persistPlannerState();
}

export async function refreshJournalPlans() {
  const account = currentAccount();
  if (!account) {
    remotePlans = null;
    return;
  }
  try {
    const response = await fetch(`${AUTH_API_ROOT}/plans`, { credentials: "include" });
    if (!response.ok) throw new Error("Planerna kunde inte hämtas.");
    const plans = await response.json();
    remotePlans = (Array.isArray(plans) ? plans : []).filter((plan) => plan?.id).sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
    const rememberedId = rememberedActivePlanId();
    const currentId = String(plannerState.fields.planId || "");
    const preferredPlan = remotePlans.find((plan) => plan.id === rememberedId)
      || remotePlans.find((plan) => plan.id === currentId)
      || remotePlans[0];
    if (preferredPlan && preferredPlan.id !== currentId) switchPlan(preferredPlan.id);
    else if (preferredPlan) {
      renderReferencePlan();
      if (journalMap?.loaded()) {
        fitJournalPlanSpots();
        void updateCalculatedTransportRoute();
      }
    } else renderReferencePlan();
  } catch {
    remotePlans = [];
  }
}

function routeDistanceKm(coordinates) {
  const earthRadiusKm = 6371;
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lonA, latA] = coordinates[index - 1].map((value) => Number(value) * Math.PI / 180);
    const [lonB, latB] = coordinates[index].map((value) => Number(value) * Math.PI / 180);
    const deltaLat = latB - latA;
    const deltaLon = lonB - lonA;
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
    total += earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

export function journalTrips() {
  try { const parsed = JSON.parse(localStorage.getItem(JOURNAL_TRIPS_KEY) || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export function saveJournalTrips(trips) { localStorage.setItem(JOURNAL_TRIPS_KEY, JSON.stringify(trips)); }

export function formatJournalDate(value) {
  if (!value) return "Datum saknas";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function renderJournalTrip(trip) {
  const details = [trip.location, trip.species].filter(Boolean).map((value) => escapeHtml(String(value))).join(" \u00b7 ");
  return `<article class="journal-trip-card"><div class="journal-trip-date"><strong>${escapeHtml(formatJournalDate(trip.date))}</strong><span>${escapeHtml(trip.time || "Flexibel tid")}</span></div><div class="journal-trip-body"><h3>${escapeHtml(String(trip.title || "Fisketur"))}</h3><p>${details || "Ingen plats eller malart vald annu."}</p></div></article>`;
}

function setText(selector, value) { const target = $(selector); if (target) target.textContent = value; }

function alphaMarkerLabel(value) {
  let label = "";
  for (let current = Math.max(1, value); current > 0; current = Math.floor((current - 1) / 26)) label = String.fromCharCode(65 + ((current - 1) % 26)) + label;
  return label;
}

function boatMarkerLabel(index) {
  let count = 0;
  for (let cursor = 0; cursor <= index; cursor += 1) if (spotIsBoatPlace(SPOTS[cursor])) count += 1;
  return alphaMarkerLabel(count || 1);
}

function spotMarkerLabel(spot, index) {
  if (spotIsBoatPlace(spot)) return boatMarkerLabel(index);
  if (spot?.isPause) return "P";
  return String(SPOTS.slice(0, index + 1).filter((item) => !spotIsBoatPlace(item) && !item?.isPause).length);
}

function highlightMarkerLabel(index) {
  return "\u2693";
}

function journalSpotFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: SPOTS.map((spot, index) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: spot.lngLat },
      properties: {
        index,
        pinColorIndex: spotColorIndex(spot, index),
        numberLabel: spotMarkerLabel(spot, index),
        label: `${spot.name}${spotTimeLabel(spot, index) ? `\n${spotTimeLabel(spot, index)}` : ""}`,
        active: index === plannerState.activeSpot,
      },
    })),
  };
}

function spotColorIndex(spot, index = 0) {
  return Number.isInteger(spot?.pinColorIndex)
    ? ((spot.pinColorIndex % JOURNAL_PIN_COLORS.length) + JOURNAL_PIN_COLORS.length) % JOURNAL_PIN_COLORS.length
    : ((index % JOURNAL_PIN_COLORS.length) + JOURNAL_PIN_COLORS.length) % JOURNAL_PIN_COLORS.length;
}

function updateJournalSpotsSource() {
  const source = journalMap?.getSource("journalSpots");
  if (!source) return;
  source.setData(journalSpotFeatureCollection());
  renderJournalPlaceLabels();
  journalMap.triggerRepaint();
}

function renderJournalPlaceLabels() {
  if (!journalMap) return;
  journalMarkers.forEach(({ element }) => element.remove());
  journalMarkers = [];
  journalMapPinInfoIndex = null;
  const container = journalMap.getContainer();
  SPOTS.forEach((spot, index) => {
    const color = JOURNAL_PIN_COLORS[spotColorIndex(spot, index)];
    const placement = "is-center";
    const label = document.createElement("div");
    label.setAttribute("role", "button");
    label.tabIndex = 0;
    label.className = `journal-place-label ${placement}`;
    label.setAttribute("aria-label", `${spot.name}, ${spotTimeLabel(spot, index) || "tid saknas"}`);
    label.style.setProperty("--journal-place-color", color.route);
    label.style.setProperty("--journal-place-base", color.base);
    const markerLabel = spotMarkerLabel(spot, index);
    const markerIcon = spotIsBoatPlace(spot) ? "<span class=\"journal-boat-place-icon\" aria-hidden=\"true\">&#9973;</span>" : "";
    label.innerHTML = `<span class="journal-place-label-pin">${markerIcon}<strong>${markerLabel}</strong></span><span class="journal-place-label-copy"><strong>${escapeHtml(spot.name)}</strong><small>${escapeHtml(spotTimeLabel(spot, index) || "Tid saknas")}</small></span><span class="journal-map-pin-info" hidden><strong>${escapeHtml(spot.name)}</strong><small>${escapeHtml(spotTimeLabel(spot, index) || "Tid saknas")} &nbsp; · &nbsp; ${escapeHtml(spotTransportLabel(spot))}</small></span>`;
    const handleLabelClick = (event) => {
      event.stopPropagation();
      if (journalMarkerActionMode) {
        handleMarkerAction("spot", index);
        return;
      }
      const view = $("#journalView");
      const editMode = view?.classList.contains("journal-mobile-edit-mode");
      selectSpot(index, true, false);
      journalMapPinInfoIndex = editMode ? null : index;
      if (editMode) view?.classList.add("journal-mobile-editor-open");
      updateJournalMapPinInfo();
    };
    label.addEventListener("click", handleLabelClick);
    label.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleLabelClick(event); }
    });
    container.appendChild(label);
    journalMarkers.push({ element: label, spotIndex: index });
  });
  HIGHLIGHTS.forEach((highlight, index) => {
    const color = JOURNAL_PIN_COLORS[spotColorIndex(highlight, SPOTS.length + index)];
    const label = document.createElement("div");
    label.setAttribute("role", "button");
    label.tabIndex = 0;
    label.className = "journal-place-label journal-highlight-label is-center";
    label.setAttribute("aria-label", `${highlight.name || "Båtplats"}, highlight`);
    label.style.setProperty("--journal-place-color", color.route);
    label.style.setProperty("--journal-place-base", color.base);
    label.innerHTML = `<span class="journal-place-label-pin journal-highlight-pin"><strong aria-hidden="true">${highlightMarkerLabel(index)}</strong></span><span class="journal-place-label-copy"><strong>${escapeHtml(highlight.name || "Båtramp")}</strong><small>&#9875; Båtramp · Highlight</small></span>`;
    const handleHighlightClick = (event) => {
      event.stopPropagation();
      if (journalMarkerActionMode) {
        handleMarkerAction("highlight", index);
        return;
      }
      showPlannerStatus(`${highlight.name || "Båtplats"} är en highlight i planen`);
    };
    label.addEventListener("click", handleHighlightClick);
    label.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleHighlightClick(event); }
    });
    container.appendChild(label);
    journalMarkers.push({ element: label, highlightIndex: index, isHighlight: true });
  });
  updateJournalPlaceLabelPositions();
  updateJournalMapPinInfo();
}

function updateJournalMapPinInfo() {
  const selectedIndex = Number(journalMapPinInfoIndex);
  const hasSelection = Number.isInteger(selectedIndex) && Boolean(SPOTS[selectedIndex]);
  const actions = $("#journalMapPinActions");
  if (actions) actions.hidden = !journalMap;
  journalMarkers.forEach(({ element, spotIndex, isHighlight }) => {
    if (isHighlight) return;
    const info = element.querySelector(".journal-map-pin-info");
    const active = hasSelection && selectedIndex === spotIndex;
    element.classList.toggle("is-info-active", active);
    if (info) info.hidden = !active;
  });
}

function updateJournalPlaceLabelPositions() {
  if (!journalMap) return;
  journalMarkers.forEach(({ element, spotIndex, highlightIndex, isHighlight }) => {
    const spot = isHighlight ? HIGHLIGHTS[highlightIndex] : SPOTS[spotIndex];
    if (!spot) return;
    const point = journalMap.project(spot.lngLat);
    element.style.left = `${Math.round(point.x)}px`;
    element.style.top = `${Math.round(point.y)}px`;
    element.style.transform = "translate(-50%, -100%)";
  });
}

function showPlannerStatus(message) {
  const target = $("#journalReferenceStatus") || $("#journalActionStatus");
  if (!target) return;
  target.textContent = message;
  window.clearTimeout(showPlannerStatus.timer);
  showPlannerStatus.timer = window.setTimeout(() => { target.textContent = ""; }, 2800);
}

const MARKER_ACTION_LABELS = {
  edit: "Redigera markör",
  move: "Flytta markör",
  boat: "Välj plats för båtmarkör",
  car: "Välj plats för bilmarkör",
  delete: "Välj markör att ta bort",
};

function clearMarkerActionMode() {
  journalMarkerActionMode = null;
  $("#journalView")?.classList.remove("is-marker-action-mode");
  updateJournalMapPinInfo();
}

function activateMarkerActionMode(action) {
  if (!journalMap) return;
  journalMarkerActionMode = action;
  journalMapPinInfoIndex = null;
  const view = $("#journalView");
  view?.classList.add("is-marker-action-mode");
  view?.classList.remove("journal-mobile-places-open", "journal-mobile-plans-open", "journal-mobile-editor-open", "journal-mobile-info-open", "journal-mobile-pin-info-open", "journal-mobile-menu-open");
  $("#journalMobilePinInfo")?.setAttribute("hidden", "hidden");
  setText("#journalMapReferenceHint strong", MARKER_ACTION_LABELS[action] || "Välj markör");
  setText("#journalMapReferenceHint span", "Klicka på en plats eller highlight på kartan");
  $("#journalMapReferenceHint")?.classList.add("is-add-mode");
  updateJournalMapPinInfo();
  showPlannerStatus(MARKER_ACTION_LABELS[action] || "Välj markör på kartan");
}

function deleteSpot(index) {
  const removed = SPOTS.splice(index, 1)[0];
  if (!removed) return;
  if (!SPOTS.length) {
    SPOTS.push({ name: "Ny fiskespot", area: "Vald pa kartan", coordinates: "59.2700, 18.6600", lngLat: [18.66, 59.27], time: "45 min", shortTime: "Ny", priority: "Medel", method: "Planeras", wind: "-", depth: "-", notes: "Lagg till detaljer for platsen.", image: "/bigplus/assets/catch-page/scene-9.png", type: "fishing", durationMinutes: 45, checklist: ["Bekrafta plats", "Kontrollera vader", "Valj metod", "Foto och logga resultat", "Notera resultat"] });
  }
  plannerState.activeSpot = Math.min(plannerState.activeSpot, SPOTS.length - 1);
  journalMapPinInfoIndex = null;
  clearMarkerActionMode();
  persistPlannerStops();
  rebuildJournalMarkers();
  renderSpot();
  scheduleCalculatedTransportRoute(0);
  showPlannerStatus(`${removed.name || "Markören"} är borttagen`);
}

function deleteHighlight(index) {
  const removed = HIGHLIGHTS.splice(index, 1)[0];
  if (!removed) return;
  clearMarkerActionMode();
  persistPlannerStops();
  rebuildJournalMarkers();
  renderSpot();
  scheduleCalculatedTransportRoute(0);
  showPlannerStatus(`${removed.name || "Highlight"} är borttagen`);
}

function handleMarkerAction(kind, index) {
  const action = journalMarkerActionMode;
  if (!action) return;
  if (action === "edit") {
    if (kind === "highlight") openHighlightEditor(index); else openDestinationEditor(index);
    return;
  }
  if (action === "move") {
    if (kind === "highlight") activateMoveHighlightMode(index); else { plannerState.activeSpot = index; journalEditingSpotIndex = index; activateMoveMarkerMode(); }
    return;
  }
  if (action === "delete") {
    if (kind === "highlight") deleteHighlight(index); else deleteSpot(index);
    return;
  }
  if (kind !== "spot") {
    clearMarkerActionMode();
    showPlannerStatus("Båt- och bilmarkör gäller vanliga platser");
    return;
  }
  clearMarkerActionMode();
  if (action === "boat") toggleSelectedSpotBoatMarker(index);
  if (action === "car") setSelectedSpotCarMarker(index);
}

function journalMapStyle() {
  const emptyRoute = [[18.66, 59.27], [18.6601, 59.2701]];
  const boatRoute = { type: "Feature", geometry: { type: "LineString", coordinates: journalBoatRouteCoordinates.length >= 2 ? journalBoatRouteCoordinates : emptyRoute }, properties: {} };
  const carRoute = { type: "Feature", geometry: { type: "LineString", coordinates: journalCarRouteCoordinates.length >= 2 ? journalCarRouteCoordinates : emptyRoute }, properties: {} };
  // The raster map already contains roads, labels and land detail. Keep only
  // the small transportation vector subset for route fallback queries so the
  // first visible map does not wait for every polygon and glyph tile.
  if (false) return {
    version: 8,
    name: "BIGPLUS Fast Trip Planner",
    sources: {
      openmaptiles: { type: "vector", url: `${API_ROOT}/weather/map/planet?v=20260903-https-1`, attribution: "OpenStreetMap contributors" },
      mapFallbackRaster: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "© Esri, © OpenStreetMap contributors" },
      journalRouteBoat: { type: "geojson", lineMetrics: true, data: boatRoute },
      journalRouteCar: { type: "geojson", lineMetrics: true, data: carRoute },
      journalRouteWalk: { type: "geojson", lineMetrics: true, data: carRoute },
      journalSpots: { type: "geojson", data: journalSpotFeatureCollection() },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#00060f" } },
      { id: "map-fallback-raster", type: "raster", source: "mapFallbackRaster", minzoom: 0, maxzoom: 20, paint: { "raster-opacity": 0, "raster-contrast": 0.06, "raster-brightness-min": 0.03, "raster-brightness-max": 0.82 } },
      { id: "roads", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 4, maxzoom: 22, filter: ["match", ["get", "class"], ["path", "track", "footway", "pedestrian", "cycleway"], false, true], paint: { "line-color": "#b9a850", "line-width": 0.9, "line-opacity": 0.34 } },
      { id: "walkways", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 4, maxzoom: 22, filter: ["match", ["get", "class"], ["path", "track", "footway", "pedestrian", "cycleway"], true, false], paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.38 } },
      { id: "journal-poi-boat-ramp", type: "circle", source: "openmaptiles", "source-layer": "poi", layout: { visibility: "none" }, paint: { "circle-color": "#126ee8", "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      { id: "journal-poi-parking", type: "circle", source: "openmaptiles", "source-layer": "poi", layout: { visibility: "none" }, paint: { "circle-color": "#7b5be4", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      { id: "journal-poi-restaurant", type: "circle", source: "openmaptiles", "source-layer": "poi", layout: { visibility: "none" }, paint: { "circle-color": "#f0782e", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      { id: "journal-poi-camping", type: "circle", source: "openmaptiles", "source-layer": "poi", layout: { visibility: "none" }, paint: { "circle-color": "#25a85b", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      { id: "journal-poi-fuel", type: "circle", source: "openmaptiles", "source-layer": "poi", layout: { visibility: "none" }, paint: { "circle-color": "#e24e55", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      // Route geometry is drawn once by the projected SVG overlay. These
      // source layers stay available for compatibility and hit-testing.
      { id: "journal-route-boat-shadow", type: "line", source: "journalRouteBoat", layout: { visibility: "none" }, paint: { "line-color": "#020a12", "line-width": 1, "line-opacity": 0 } },
      { id: "journal-route-boat", type: "line", source: "journalRouteBoat", layout: { visibility: "none" }, paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0 } },
      { id: "journal-route-car-shadow", type: "line", source: "journalRouteCar", layout: { visibility: "none" }, paint: { "line-color": "#020a12", "line-width": 1, "line-opacity": 0 } },
      { id: "journal-route-car", type: "line", source: "journalRouteCar", layout: { visibility: "none" }, paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0 } },
      { id: "journal-route-walk-shadow", type: "line", source: "journalRouteWalk", layout: { visibility: "none" }, paint: { "line-color": "#020a12", "line-width": 1, "line-opacity": 0 } },
      { id: "journal-route-walk", type: "line", source: "journalRouteWalk", layout: { visibility: "none" }, paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0 } },
      { id: "journal-spot-pins", type: "circle", source: "journalSpots", layout: { visibility: "none" }, paint: { "circle-color": "#2585ff", "circle-radius": 1, "circle-opacity": 0 } },
      { id: "journal-spot-pins-glow", type: "circle", source: "journalSpots", layout: { visibility: "none" }, paint: { "circle-color": "#2585ff", "circle-radius": 1, "circle-opacity": 0 } },
      { id: "journal-spot-numbers", type: "symbol", source: "journalSpots", layout: { visibility: "none", "text-field": ["get", "numberLabel"] }, paint: { "text-color": "#ffffff" } },
      { id: "journal-spot-labels", type: "symbol", source: "journalSpots", layout: { visibility: "none", "text-field": ["get", "label"] }, paint: { "text-color": "#ffffff" } },
    ],
  };
  /* The full dark vector style below is the active style for Fisketurer. */
  return {
    version: 8,
    name: "BIGPLUS Trip Planner",
    glyphs: `${API_ROOT}/weather/map/fonts/{fontstack}/{range}.pbf`,
    sources: {
openmaptiles: { type: "vector", url: `${API_ROOT}/weather/map/planet?v=20260903-https-1`, attribution: "OpenStreetMap contributors" },
      mapFallbackRaster: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "© Esri, © OpenStreetMap contributors" },
      journalRouteBoat: { type: "geojson", lineMetrics: true, data: boatRoute },
      journalRouteCar: { type: "geojson", lineMetrics: true, data: carRoute },
      journalRouteWalk: { type: "geojson", lineMetrics: true, data: carRoute },
      journalSpots: { type: "geojson", data: journalSpotFeatureCollection() },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#00060f" } },
      { id: "map-fallback-raster", type: "raster", source: "mapFallbackRaster", minzoom: 0, maxzoom: 20, paint: { "raster-opacity": 0, "raster-contrast": 0.08, "raster-brightness-min": 0.02, "raster-brightness-max": 0.72 } },
      { id: "landcover", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": ["match", ["coalesce", ["get", "class"], ["get", "subclass"], ""], ["wood", "forest"], "#00060f", ["grass", "scrub", "meadow"], "#0a2a32", ["wetland", "marsh", "bog", "swamp", "fen"], "#123b43", "#081b2b"], "fill-opacity": 1 } },
      { id: "wood-outline", type: "line", source: "openmaptiles", "source-layer": "landcover", filter: ["match", ["coalesce", ["get", "class"], ["get", "subclass"], ""], ["wood", "forest"], true, false], paint: { "line-color": "#00060f", "line-width": 0.65, "line-opacity": 1 } },
      { id: "landuse", type: "fill", source: "openmaptiles", "source-layer": "landuse", paint: { "fill-color": "#0d2634", "fill-opacity": 0.96 } },
      { id: "residential", type: "fill", source: "openmaptiles", "source-layer": "landuse", minzoom: 4, maxzoom: 22, filter: ["==", ["get", "class"], "residential"], paint: { "fill-color": ["interpolate", ["exponential", 1], ["zoom"], 4, "#3f0e03", 12, "#876464"], "fill-opacity": 0.45 } },
      { id: "journal-wetlands", type: "fill", source: "openmaptiles", "source-layer": "landcover", filter: ["any", ["match", ["get", "class"], ["wetland", "marsh", "bog", "swamp", "fen"], true, false], ["match", ["get", "subclass"], ["wetland", "marsh", "bog", "swamp", "fen"], true, false]], paint: { "fill-color": "#15505a", "fill-opacity": 0.7 } },
      { id: "building", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 12, maxzoom: 22, paint: { "fill-extrusion-color": "#5c748a", "fill-extrusion-opacity": 1, "fill-extrusion-base": 0, "fill-extrusion-height": 10, "fill-extrusion-vertical-gradient": true } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#158b96", "fill-opacity": .82 } },
      { id: "water-outline", type: "line", source: "openmaptiles", "source-layer": "water", paint: { "line-color": "#42b8c0", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.8, 12, 1.6], "line-opacity": .72 } },
      { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": "#169b96", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 12, 1.8], "line-opacity": .72, "line-blur": 1 } },
      { id: "journal-roads-casing", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 4, maxzoom: 22, paint: { "line-color": "#b9a850", "line-width": 1, "line-opacity": .51 } },
      { id: "roads", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 4, maxzoom: 22, paint: { "line-color": "#b9a850", "line-width": 1, "line-opacity": .51 } },
      { id: "walkways", type: "line", source: "openmaptiles", "source-layer": "transportation", filter: ["match", ["get", "class"], ["path", "track", "footway", "pedestrian", "cycleway"], true, false], paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 12, 1.7], "line-opacity": 1, "line-dasharray": [4, 4, 1, 4] } },
      { id: "bridge", type: "line", source: "openmaptiles", "source-layer": "transportation", filter: ["==", ["get", "brunnel"], "bridge"], paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 2, 12, 4], "line-opacity": 1 } },
      { id: "pier", type: "fill", source: "openmaptiles", "source-layer": "transportation", minzoom: 10, maxzoom: 22, filter: ["any", ["==", ["get", "class"], "pier"], ["==", ["get", "subclass"], "pier"]], paint: { "fill-color": "#ff0022", "fill-opacity": 1 } },
      { id: "railway", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 7, maxzoom: 22, filter: ["match", ["get", "class"], ["rail", "railway"], true, false], paint: { "line-color": "#ffffff", "line-opacity": .42, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 14, 2], "line-dasharray": [2, 4] } },
      { id: "aviation-line", type: "line", source: "openmaptiles", "source-layer": "aeroway", minzoom: 10, maxzoom: 22, paint: { "line-color": "#114878", "line-opacity": 1, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2], "line-dasharray": [2, 4] } },
      { id: "transit", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 11, maxzoom: 22, filter: ["match", ["get", "class"], ["tram", "subway", "transit"], true, false], paint: { "line-color": "#00e022", "line-opacity": 1, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 16, 2.4], "line-dasharray": [4, 4, 1, 4] } },
      { id: "other-border", type: "line", source: "openmaptiles", "source-layer": "boundary", paint: { "line-color": "#ff14d0", "line-opacity": .17, "line-width": 1, "line-dasharray": [2, 1] } },
      { id: "journal-poi-boat-ramp", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["any", ["==", ["get", "class"], "harbour"], ["==", ["get", "subclass"], "slipway"]], paint: { "circle-color": "#126ee8", "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      { id: "journal-poi-parking", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["==", ["get", "class"], "parking"], paint: { "circle-color": "#7b5be4", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      { id: "journal-poi-restaurant", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["match", ["get", "class"], ["restaurant", "cafe"], true, false], paint: { "circle-color": "#f0782e", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      { id: "journal-poi-camping", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["match", ["get", "class"], ["campsite", "camp_site"], true, false], paint: { "circle-color": "#25a85b", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      { id: "journal-poi-fuel", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["==", ["get", "class"], "fuel"], paint: { "circle-color": "#e24e55", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } },
      { id: "water-names", type: "symbol", source: "openmaptiles", "source-layer": "water_name", layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 7, 15, 12, 20], "text-font": ["Noto Sans Italic"] }, paint: { "text-color": "#ffd76a", "text-halo-color": "#061a2b", "text-halo-width": 2.4 } },
      { id: "place-names", type: "symbol", source: "openmaptiles", "source-layer": "place", minzoom: 8, maxzoom: 22, layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 13, 12, 17, 16, 22, 18], "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#ffffff", "text-opacity": 1, "text-halo-color": "#082640", "text-halo-width": 2, "text-halo-blur": 0 } },
      { id: "transportation-names", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", minzoom: 10, layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 12], "text-font": ["Noto Sans Regular"], "text-max-angle": 30 }, paint: { "text-color": "#d0bd69", "text-halo-color": "#081a20", "text-halo-width": 1.35 } },
      // The projected SVG overlay is the single visible route renderer. Keep
      // these layers hidden so a route is never painted twice.
      { id: "journal-route-boat-shadow", type: "line", source: "journalRouteBoat", layout: { visibility: "none" }, paint: { "line-color": "#020a12", "line-width": 15, "line-opacity": .94, "line-offset": ["match", ["get", "spotIndex"], 1, -7, 2, 7, 3, -7, 4, 7, 5, -7, 6, 7, 0] } },
      { id: "journal-route-boat", type: "line", source: "journalRouteBoat", layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "pinColorIndex"], 0, "#ff3b6b", 1, "#9b5cff", 2, "#ff5b00", 3, "#ff2bd6", 4, "#d7ff2f", 5, "#00ffb7", "#9b5cff"], "line-width": 8, "line-offset": ["match", ["get", "spotIndex"], 1, -7, 2, 7, 3, -7, 4, 7, 5, -7, 6, 7, 0] } },
      { id: "journal-route-car-shadow", type: "line", source: "journalRouteCar", layout: { visibility: "none" }, paint: { "line-color": "#020a12", "line-width": 15, "line-opacity": .96, "line-offset": ["match", ["get", "spotIndex"], 1, -7, 2, 7, 3, -7, 4, 7, 5, -7, 6, 7, 0] } },
      { id: "journal-route-car", type: "line", source: "journalRouteCar", layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "pinColorIndex"], 0, "#ff3b6b", 1, "#9b5cff", 2, "#ff5b00", 3, "#ff2bd6", 4, "#d7ff2f", 5, "#00ffb7", "#9b5cff"], "line-width": 8, "line-offset": ["match", ["get", "spotIndex"], 1, -7, 2, 7, 3, -7, 4, 7, 5, -7, 6, 7, 0] } },
      { id: "journal-route-walk-shadow", type: "line", source: "journalRouteWalk", layout: { visibility: "none" }, paint: { "line-color": "#020a12", "line-width": 15, "line-opacity": .9, "line-offset": ["match", ["get", "spotIndex"], 1, -7, 2, 7, 3, -7, 4, 7, 5, -7, 6, 7, 0] } },
      { id: "journal-route-walk", type: "line", source: "journalRouteWalk", layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "pinColorIndex"], 0, "#ff3b6b", 1, "#9b5cff", 2, "#ff5b00", 3, "#ff2bd6", 4, "#d7ff2f", 5, "#00ffb7", "#9b5cff"], "line-width": 7.5, "line-opacity": .9, "line-offset": ["match", ["get", "spotIndex"], 1, -7, 2, 7, 3, -7, 4, 7, 5, -7, 6, 7, 0] } },
      { id: "journal-route-pin-rings", type: "circle", source: "journalSpots", layout: { visibility: "none" }, paint: { "circle-color": "#071522", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 10, 10, 15, 14, 19], "circle-opacity": 0, "circle-stroke-color": ["match", ["get", "pinColorIndex"], 0, "#ff3b6b", 1, "#9b5cff", 2, "#ff5b00", 3, "#ff2bd6", 4, "#d7ff2f", 5, "#00ffb7", "#9b5cff"], "circle-stroke-width": 3, "circle-stroke-opacity": .98 } },
      { id: "journal-spot-pins-glow", type: "circle", source: "journalSpots", layout: { visibility: "none" }, paint: { "circle-color": ["match", ["get", "pinColorIndex"], 0, "#27d97f", 1, "#2585ff", 2, "#ff8b20", 3, "#864cff", 4, "#ff4f82", 5, "#0edbd0", "#2585ff"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 12, 10, 17, 14, 22], "circle-blur": 0.72, "circle-opacity": 0.62 } },
      { id: "journal-spot-pins", type: "circle", source: "journalSpots", layout: { visibility: "none" }, paint: { "circle-color": ["match", ["get", "pinColorIndex"], 0, "#27d97f", 1, "#2585ff", 2, "#ff8b20", 3, "#864cff", 4, "#ff4f82", 5, "#0edbd0", "#2585ff"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 7, 10, 10.5, 14, 14], "circle-stroke-color": "#ffffff", "circle-stroke-width": ["case", ["boolean", ["get", "active"], false], 4, 3], "circle-opacity": 1 } },
      { id: "journal-spot-numbers", type: "symbol", source: "journalSpots", layout: { visibility: "none", "text-field": ["get", "numberLabel"], "text-size": ["interpolate", ["linear"], ["zoom"], 6, 9, 10, 12, 14, 15], "text-font": ["Noto Sans Bold"], "text-anchor": "center", "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": "#ffffff", "text-halo-color": "#071522", "text-halo-width": 1.2 } },
      { id: "journal-spot-labels", type: "symbol", source: "journalSpots", layout: { visibility: "none", "text-field": ["get", "label"], "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 10, 13, 14, 16], "text-font": ["Noto Sans Bold"], "text-anchor": "bottom", "text-offset": [0, -1.85], "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": "#ffffff", "text-halo-color": "#071522", "text-halo-width": 2 } },
    ],
  };
}

function fitJournalRoute() {
  if (!journalMap || !window.maplibregl) return;
  const bounds = new window.maplibregl.LngLatBounds();
  const isMobile = window.matchMedia("(max-width: 680px)").matches;
  const route = journalTransport === "boat" ? journalBoatRouteCoordinates : journalCarRouteCoordinates;
  const coordinates = route.length >= 2 ? route : SPOTS.map((spot) => spot.lngLat);
  if (coordinates.length >= 2) {
    coordinates.forEach((coordinate) => bounds.extend(coordinate));
    journalMap.fitBounds(bounds, { padding: isMobile ? { top: 96, right: 142, bottom: 92, left: 72 } : { top: 90, right: 70, bottom: 80, left: 70 }, duration: 550, maxZoom: isMobile ? 12.3 : 13.5 });
  } else if (coordinates.length === 1) {
    journalMap.easeTo({ center: coordinates[0], zoom: isMobile ? 11.8 : 12.5, duration: 450 });
  }
}

function fitJournalPlanSpots() {
  if (!journalMap || !window.maplibregl || !plannerRouteNodes().length) return;
  const coordinates = plannerRouteNodes()
    .map((node) => node.spot)
    .map((spot) => Array.isArray(spot?.lngLat) ? spot.lngLat : null)
    .filter((coordinate) => coordinate && coordinate.length >= 2 && coordinate.every(Number.isFinite));
  if (!coordinates.length) return;
  const isMobile = window.matchMedia("(max-width: 680px)").matches;
  if (coordinates.length === 1) {
    journalMap.easeTo({ center: coordinates[0], zoom: isMobile ? 12.8 : 13.2, duration: 450, essential: true });
    return;
  }
  const bounds = new window.maplibregl.LngLatBounds();
  coordinates.forEach((coordinate) => bounds.extend(coordinate));
  journalMap.fitBounds(bounds, {
    padding: isMobile ? { top: 108, right: 132, bottom: 112, left: 54 } : { top: 120, right: 92, bottom: 88, left: 370 },
    duration: 500,
    maxZoom: isMobile ? 12.3 : 13.5,
    essential: true,
  });
}

function centerJournalOnPosition() {
  if (!journalMap) return;
  if (!navigator.geolocation) {
    fitJournalRoute();
    showPlannerStatus("Position saknas, rutten visas");
    return;
  }
  navigator.geolocation.getCurrentPosition((position) => {
    journalMap.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 12.5, duration: 550 });
    showPlannerStatus("Kartan är centrerad på din position");
  }, () => {
    fitJournalRoute();
    showPlannerStatus("Kunde inte läsa positionen, rutten visas");
  }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
}

function routeFeature(coordinates) {
  return { type: "Feature", geometry: { type: "LineString", coordinates }, properties: {} };
}

function journalRouteSegmentColorIndex(segment, fallbackIndex = 0) {
  const spotIndex = Number(segment?.spotIndex) || fallbackIndex + 1;
  if (Number.isInteger(segment?.pinColorIndex)) return segment.pinColorIndex;
  return spotColorIndex(plannerRouteNodes()[spotIndex]?.spot, spotIndex);
}

function routeFeatureCollection(segments) {
  return {
    type: "FeatureCollection",
    features: segments.filter((segment) => Array.isArray(segment?.coordinates) && segment.coordinates.length >= 2).map((segment, index) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: segment.coordinates },
      properties: { spotIndex: Number(segment.spotIndex) || index + 1, pinColorIndex: journalRouteSegmentColorIndex(segment, index), duration: Number(segment.duration) || 0, travelMode: segment.travelMode || "car" },
    })),
  };
}

function primePlanRoutePreview() {
  const emptyRoute = [[18.66, 59.27], [18.6601, 59.2701]];
  const preview = journalMap?.loaded()
    ? (journalTransport === "boat" ? calculateLayerRoute("water") : calculateLayerRoute("roads") || calculateLayerRoute("walkways"))
    : null;
  if (preview?.length >= 2) {
    if (journalTransport === "boat") {
      journalBoatRouteCoordinates = preview;
      journalBoatRouteSegments = [{ coordinates: preview, duration: 0, spotIndex: Math.max(1, SPOTS.length - 1), pinColorIndex: spotColorIndex(SPOTS[Math.max(1, SPOTS.length - 1)], Math.max(1, SPOTS.length - 1)), travelMode: "boat" }];
      setJournalRouteSource("journalRouteBoat", journalBoatRouteSegments);
    } else {
      journalCarRouteCoordinates = preview;
      journalCarRouteSegments = [{ coordinates: preview, duration: 0, spotIndex: 1, travelMode: "car" }];
      journalCarTravelMode = "car";
      setJournalRouteSource("journalRouteCar", journalCarRouteSegments);
    }
    return;
  }
  if (journalTransport === "boat") {
    journalBoatRouteCoordinates = [];
    journalBoatRouteSegments = [];
    setJournalRouteSource("journalRouteBoat", emptyRoute);
  } else {
    journalCarRouteCoordinates = [];
    journalCarRouteSegments = [];
    setJournalRouteSource("journalRouteCar", emptyRoute);
  }
}

function setJournalRouteSource(sourceId, coordinatesOrSegments) {
  const source = journalMap?.getSource(sourceId);
  if (!source) return false;
  const data = Array.isArray(coordinatesOrSegments) && coordinatesOrSegments.length && Array.isArray(coordinatesOrSegments[0]?.coordinates)
    ? routeFeatureCollection(coordinatesOrSegments)
    : routeFeature(coordinatesOrSegments);
  source.setData(data);
  journalMap.triggerRepaint();
  return true;
}

function clearJournalRouteDisplay() {
  journalRouteMissingRamp = false;
  setJournalRouteAlert("");
  journalBoatRouteCoordinates = [];
  journalCarRouteCoordinates = [];
  journalBoatRouteSegments = [];
  journalCarRouteSegments = [];
  const emptyRoute = [[18.66, 59.27], [18.6601, 59.2701]];
  if (journalMap?.loaded()) {
    setJournalRouteSource("journalRouteCar", emptyRoute);
    setJournalRouteSource("journalRouteWalk", emptyRoute);
    setJournalRouteSource("journalRouteBoat", emptyRoute);
  }
  journalRouteTimeLabels.forEach((label) => label.remove());
  journalRouteTimeLabels = [];
  if (journalRouteOverlay) journalRouteOverlay.replaceChildren();
}

function setJournalRouteAlert(message = "") {
  const target = $("#journalRouteAlert");
  if (!target) return;
  target.textContent = message;
  target.hidden = !message;
}

function formatRouteDuration(seconds) {
  const minutes = Math.max(1, Math.round(Number(seconds || 0) / 60));
  return minutes >= 60 ? String(Math.floor(minutes / 60)) + " h " + (minutes % 60 ? String(minutes % 60) + " min" : "") : String(minutes) + " min";
}

function formatClockMinutes(totalMinutes) {
  const minutes = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function spotArrivalTime(index) {
  const startTime = String(plannerState.fields.startTime || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(startTime);
  if (!match) return "";
  let totalMinutes = Number(match[1]) * 60 + Number(match[2]);
  const segments = journalTransport === "boat" ? journalBoatRouteSegments : journalCarRouteSegments;
  for (let leg = 1; leg <= index; leg += 1) {
    totalMinutes += Number(SPOTS[leg - 1]?.durationMinutes) || 0;
    const segment = segments.find((item) => Number(item?.spotIndex) === leg) || segments[leg - 1];
    totalMinutes += Number(segment?.duration) > 0 ? Number(segment.duration) / 60 : 0;
  }
  return formatClockMinutes(totalMinutes);
}

function spotTimeLabel(spot, index) {
  return spotArrivalTime(index) || (spot.shortTime && spot.shortTime !== "Ny" ? spot.shortTime : "");
}

function routeSegmentDuration(segment, coordinates) {
  const duration = Number(segment?.duration) || 0;
  if (duration > 0) return duration;
  const distance = routeDistanceKm(coordinates);
  return distance * (segment?.travelMode === "walk" ? 720 : segment?.travelMode === "boat" ? 54 : 84);
}

function updateRouteTimeLabels() {
  if (!journalMap) return;
  const routeCoordinates = journalTransport === "boat" ? journalBoatRouteCoordinates : journalCarRouteCoordinates;
  const routeSegments = journalTransport === "boat" ? journalBoatRouteSegments : journalCarRouteSegments;
  const segments = routeSegments.length ? routeSegments : routeCoordinates.length >= 2 ? [{ coordinates: routeCoordinates, duration: 0, spotIndex: 1 }] : [];
  journalRouteTimeLabels.forEach((label, index) => {
    const segment = segments[index];
    const coordinates = segment?.coordinates;
    if (!coordinates || coordinates.length < 2) { label.hidden = true; return; }
    const middleIndex = Math.floor(coordinates.length / 2);
    const point = journalMap.project(coordinates[middleIndex]);
    const previous = journalMap.project(coordinates[Math.max(0, middleIndex - 1)]);
    const next = journalMap.project(coordinates[Math.min(coordinates.length - 1, middleIndex + 1)]);
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const laneOffset = segments.length > 1 ? (Number(segment.spotIndex) % 2 === 0 ? 5.5 : -5.5) : 0;
    const labelX = point.x - (dy / length) * laneOffset;
    const labelY = point.y + (dx / length) * laneOffset;
    label.hidden = false;
    const distance = routeDistanceKm(coordinates);
    label.innerHTML = `<strong>${distance.toFixed(1).replace(".", ",")} km</strong><small>~${formatRouteDuration(routeSegmentDuration(segment, coordinates))}</small>`;
    const colorIndex = journalRouteSegmentColorIndex(segment, index);
    const color = JOURNAL_PIN_COLORS[colorIndex % JOURNAL_PIN_COLORS.length];
    label.style.setProperty("--route-label-color", color.route);
    label.style.transform = "translate(" + Math.round(labelX) + "px, " + Math.round(labelY) + "px) translate(-50%, -50%)";
  });
}

function renderRouteTimeLabels() {
  if (!journalMap) return;
  journalRouteTimeLabels.forEach((label) => label.remove());
  journalRouteTimeLabels = [];
  const segments = journalTransport === "boat" ? journalBoatRouteSegments : journalCarRouteSegments;
  segments.forEach((segment) => {
    if (!Array.isArray(segment?.coordinates) || segment.coordinates.length < 2) return;
    const label = document.createElement("span");
    label.className = "journal-route-time-label";
    label.setAttribute("aria-hidden", "true");
    journalMap.getContainer().appendChild(label);
    journalRouteTimeLabels.push(label);
  });
  updateRouteTimeLabels();
}

function renderRouteOverlay() {
  if (!journalMap) return;
  const container = journalMap.getContainer();
  // Keep the SVG in the same coordinate system as map.project(). The parent panel
  // can contain layout offsets while the MapLibre container always starts at 0,0.
  const overlayHost = container;
  if (!journalRouteOverlay) {
    journalRouteOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    journalRouteOverlay.classList.add("journal-route-overlay");
    journalRouteOverlay.setAttribute("aria-hidden", "true");
  }
  // Keep the route overlay attached to the active map container and above the
  // canvas after MapLibre has inserted or reordered its render elements.
  overlayHost.appendChild(journalRouteOverlay);
  journalRouteOverlay.style.zIndex = "80";
  journalRouteOverlay.style.visibility = "visible";
  const size = overlayHost.getBoundingClientRect();
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  journalRouteOverlay.setAttribute("viewBox", "0 0 " + width + " " + height);
  const routeCoordinates = journalTransport === "boat" ? journalBoatRouteCoordinates : journalCarRouteCoordinates;
  const routeSegments = journalTransport === "boat" ? journalBoatRouteSegments : journalCarRouteSegments;
  const segments = routeSegments.length ? routeSegments : routeCoordinates.length >= 2 ? [{ coordinates: routeCoordinates, duration: 0, spotIndex: 1 }] : [];
  // SVG paints later children on top. Draw later legs first so the first leg
  // remains visible wherever several legs use the same road.
  const renderSegments = segments
    .map((segment, index) => ({ segment, index }))
    .sort((left, right) => (Number(right.segment?.spotIndex) || right.index + 1) - (Number(left.segment?.spotIndex) || left.index + 1));
  const projectedSegments = renderSegments.map(({ segment }) => ({ segment, points: (Array.isArray(segment?.coordinates) ? segment.coordinates : []).map((coordinate) => { try { return journalMap.project(coordinate); } catch { return null; } }).filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)) }));
  const paths = [];
  renderSegments.forEach(({ segment, index }, renderIndex) => {
    const coordinates = Array.isArray(segment?.coordinates) ? segment.coordinates : [];
    const points = projectedSegments[renderIndex].points;
    if (points.length < 2) return;
    const spotIndex = Number(segment.spotIndex) || index + 1;
    const colorIndex = journalRouteSegmentColorIndex(segment, index);
    const color = JOURNAL_PIN_COLORS[colorIndex % JOURNAL_PIN_COLORS.length].route;
    const offsetPoints = points;
    const d = offsetPoints.map((point, pointIndex) => (pointIndex ? "L " : "M ") + Math.round(point.x) + " " + Math.round(point.y)).join(" ");
    const route = document.createElementNS("http://www.w3.org/2000/svg", "path");
    route.setAttribute("d", d);
    const isBoat = segment.travelMode === "boat";
    route.setAttribute("class", `journal-route-overlay-path${isBoat ? " is-boat" : ""}`);
    route.style.stroke = color;
    route.style.setProperty("--route-label-color", color);
    const isWalking = segment.travelMode === "walk";
    route.style.strokeDasharray = "none";
    route.style.strokeDashoffset = "";
    route.style.opacity = segment.travelMode === "walk" ? "0.86" : "1";
    const arrowIndex = Math.max(1, Math.min(offsetPoints.length - 2, Math.floor(offsetPoints.length * 0.54)));
    const arrowFrom = offsetPoints[Math.max(0, arrowIndex - 1)];
    const arrowTo = offsetPoints[Math.min(offsetPoints.length - 1, arrowIndex + 1)];
    const arrowDx = arrowTo.x - arrowFrom.x;
    const arrowDy = arrowTo.y - arrowFrom.y;
    const arrowLength = Math.hypot(arrowDx, arrowDy) || 1;
    const ux = arrowDx / arrowLength;
    const uy = arrowDy / arrowLength;
    const px = -uy;
    const py = ux;
    const arrowPoint = offsetPoints[arrowIndex];
    const tip = { x: arrowPoint.x + ux * 10, y: arrowPoint.y + uy * 10 };
    const left = { x: arrowPoint.x - ux * 7 + px * 6, y: arrowPoint.y - uy * 7 + py * 6 };
    const right = { x: arrowPoint.x - ux * 7 - px * 6, y: arrowPoint.y - uy * 7 - py * 6 };
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrow.setAttribute("d", `M ${Math.round(tip.x)} ${Math.round(tip.y)} L ${Math.round(left.x)} ${Math.round(left.y)} L ${Math.round(right.x)} ${Math.round(right.y)} Z`);
    arrow.setAttribute("class", `journal-route-overlay-arrow${isBoat ? " is-boat" : ""}`);
    arrow.style.opacity = isWalking ? "0.55" : "0.96";
    paths.push(route, arrow);
  });
  journalRouteOverlay.replaceChildren(...paths);
}

function scheduleCalculatedTransportRoute(delay = 120) {
  window.clearTimeout(journalRouteRefreshTimer);
  journalRouteRefreshTimer = window.setTimeout(() => {
    journalRouteRefreshTimer = 0;
    if (!journalMap) return;
    updateJournalRouteMode();
    updateCalculatedTransportRoute();
  }, delay);
}

function fitJournalRouteAfterCalculationIfNeeded() {
  if (!journalFitRouteAfterCalculation || !journalMap?.loaded()) return;
  journalFitRouteAfterCalculation = false;
  fitJournalRoute();
}

function findGridRoute(from, to, layerId, step = 42) {
  if (!journalMap) return null;
  const start = journalMap.project(from);
  const end = journalMap.project(to);
  const padding = layerId === "water" ? 140 : 64;
  const minX = Math.max(12, Math.min(start.x, end.x) - padding);
  const maxX = Math.min(journalMap.getCanvas().width - 12, Math.max(start.x, end.x) + padding);
  const minY = Math.max(12, Math.min(start.y, end.y) - padding);
  const maxY = Math.min(journalMap.getCanvas().height - 12, Math.max(start.y, end.y) + padding);
  const columns = Math.max(2, Math.min(90, Math.ceil((maxX - minX) / step)));
  const rows = Math.max(2, Math.min(60, Math.ceil((maxY - minY) / step)));
  const pointFor = (column, row) => ({ x: minX + (column / columns) * (maxX - minX), y: minY + (row / rows) * (maxY - minY) });
  const sampleRadius = layerId === "roads" || layerId === "walkways" ? 22 : 0;
  const featureAt = (point) => sampleRadius ? journalMap.queryRenderedFeatures([[point.x - sampleRadius, point.y - sampleRadius], [point.x + sampleRadius, point.y + sampleRadius]], { layers: [layerId] }) : journalMap.queryRenderedFeatures(point, { layers: [layerId] });
  const nearestIndex = (point) => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let row = 0; row <= rows; row += 1) for (let column = 0; column <= columns; column += 1) {
      const index = row * (columns + 1) + column;
      if (!passable[index]) continue;
      const candidate = pointFor(column, row);
      const distance = ((candidate.x - point.x) ** 2) + ((candidate.y - point.y) ** 2);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
    return bestDistance < Number.POSITIVE_INFINITY ? bestIndex : -1;
  };
  const passable = [];
  for (let row = 0; row <= rows; row += 1) for (let column = 0; column <= columns; column += 1) {
    const index = row * (columns + 1) + column;
    passable[index] = featureAt(pointFor(column, row)).length > 0;
  }
  const startIndex = nearestIndex(start);
  const endIndex = nearestIndex(end);
  if (startIndex < 0 || endIndex < 0) return null;
  const width = columns + 1;
  const open = [{ index: startIndex, score: 0 }];
  const cameFrom = new Map();
  const costSoFar = new Map([[startIndex, 0]]);
  const rowColumn = (index) => ({ column: index % width, row: Math.floor(index / width) });
  while (open.length) {
    open.sort((a, b) => a.score - b.score);
    const current = open.shift().index;
    if (current === endIndex) break;
    const { column, row } = rowColumn(current);
    for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) for (let columnDelta = -1; columnDelta <= 1; columnDelta += 1) {
      if (!rowDelta && !columnDelta) continue;
      if (layerId === "water" && rowDelta && columnDelta) continue;
      const nextColumn = column + columnDelta;
      const nextRow = row + rowDelta;
      if (nextColumn < 0 || nextColumn > columns || nextRow < 0 || nextRow > rows) continue;
      const next = nextRow * width + nextColumn;
      if (!passable[next]) continue;
      const moveCost = rowDelta && columnDelta ? 1.4 : 1;
      const newCost = (costSoFar.get(current) || 0) + moveCost;
      if (!costSoFar.has(next) || newCost < costSoFar.get(next)) {
        costSoFar.set(next, newCost);
        const target = rowColumn(endIndex);
        const heuristic = Math.hypot(target.column - nextColumn, target.row - nextRow);
        open.push({ index: next, score: newCost + heuristic });
        cameFrom.set(next, current);
      }
    }
  }
  if (startIndex !== endIndex && !cameFrom.has(endIndex)) return null;
  const indices = [endIndex];
  while (indices[0] !== startIndex) indices.unshift(cameFrom.get(indices[0]));
  return indices.map((index) => { const { column, row } = rowColumn(index); return journalMap.unproject(pointFor(column, row)).toArray(); });
}

function waterLineIsClear(from, to) {
  if (!journalMap?.loaded()) return false;
  try {
    const start = journalMap.project(from);
    const end = journalMap.project(to);
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const samples = Math.max(2, Math.ceil(distance / 10));
    for (let index = 0; index <= samples; index += 1) {
      const ratio = index / samples;
      const point = { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
      if (!waterFeatureAtScreenPoint(point)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function simplifyWaterRoute(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 3 || !journalMap?.loaded()) return coordinates;
  const simplified = [coordinates[0]];
  let anchor = 0;
  while (anchor < coordinates.length - 1) {
    let next = anchor + 1;
    for (let candidate = coordinates.length - 1; candidate > anchor + 1; candidate -= 1) {
      if (waterLineIsClear(coordinates[anchor], coordinates[candidate])) {
        next = candidate;
        break;
      }
    }
    simplified.push(coordinates[next]);
    anchor = next;
  }
  return simplified;
}

function calculateLayerRoute(layerId) {
  if (!journalMap?.loaded()) return null;
  const nodes = plannerRouteNodes();
  const route = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const segment = findGridRoute(nodes[index - 1].spot.lngLat, nodes[index].spot.lngLat, layerId, layerId === "roads" || layerId === "walkways" ? 30 : 42);
    if (!segment) return null;
    route.push(...(index === 1 ? [nodes[index - 1].spot.lngLat] : []), ...segment, nodes[index].spot.lngLat);
  }
  return route.filter((coordinate, index) => index === 0 || coordinate[0] !== route[index - 1][0] || coordinate[1] !== route[index - 1][1]);
}

async function requestRoadRouteSegment(spotIndex, mode, routeIndex = 0) {
  const result = await requestRoadRouteCoordinates(SPOTS[spotIndex - 1].lngLat, SPOTS[spotIndex].lngLat, mode, routeIndex);
  return { ...result, spotIndex, pinColorIndex: SPOTS[spotIndex]?.pinColorIndex, travelMode: mode === "walking" ? "walk" : "car" };
}

async function requestRoadRouteCoordinates(from, to, mode, routeIndex = 0) {
  const routeRoots = [...new Set([API_ROOT, LOCAL_API_ROOT, RENDER_API_ROOT].filter(Boolean))];
  const coordinates = [from, to].map((coordinate) => coordinate.join(",")).join(";");
  let lastError = new Error("Ingen rutt hittades");
  for (const routeApiRoot of routeRoots) {
    try {
      const response = await fetch(`${routeApiRoot}/weather/map/route?mode=${mode}&alternatives=3&coordinates=${encodeURIComponent(coordinates)}`);
      if (!response.ok) throw new Error(`Routing svarade ${response.status}`);
      const result = await response.json();
      const alternatives = Array.isArray(result.alternatives) && result.alternatives.length
        ? result.alternatives.filter((candidate) => Array.isArray(candidate?.coordinates) && candidate.coordinates.length >= 2)
        : [{ index: 0, distance: result.distance, duration: result.duration, coordinates: result.coordinates }];
      if (!alternatives.length) throw new Error("Ingen rutt hittades");
      const selectedIndex = Math.min(Math.max(0, Number(routeIndex) || 0), alternatives.length - 1);
      const selected = alternatives[selectedIndex];
      return { ...result, ...selected, coordinates: selected.coordinates, alternatives, routeIndex: Number(selected.index) || selectedIndex };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function requestRoadCoordinatesWithFallback(from, to) {
  try {
    return await requestRoadRouteCoordinates(from, to, "driving");
  } catch {
    return requestRoadRouteCoordinates(from, to, "walking");
  }
}

const JOURNAL_BOAT_MARKER_CLEARANCE_PX = 22;

function waterFeatureAtScreenPoint(point) {
  if (!journalMap?.loaded()) return false;
  const layers = ["water", "waterway"].filter((layerId) => journalMap.getLayer(layerId));
  if (!layers.length) return false;
  try { return journalMap.queryRenderedFeatures(point, { layers }).length > 0; } catch { return false; }
}

function safeWaterAnchorForCoordinate(coordinate, requiredClearance = JOURNAL_BOAT_MARKER_CLEARANCE_PX) {
  if (!journalMap?.loaded() || !Array.isArray(coordinate) || coordinate.length < 2) return null;
  try {
    const origin = journalMap.project(coordinate);
    for (let radius = 0; radius <= 260; radius += 8) {
      const count = radius ? 16 : 1;
      for (let cursor = 0; cursor < count; cursor += 1) {
        const angle = radius ? (cursor / count) * Math.PI * 2 : 0;
        const candidate = { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
        if (candidate.x < 8 || candidate.y < 8 || candidate.x > journalMap.getCanvas().width - 8 || candidate.y > journalMap.getCanvas().height - 8) continue;
        if (!waterFeatureAtScreenPoint(candidate)) continue;
        const anchor = journalMap.unproject(candidate).toArray();
        const clearance = Math.max(8, Number(requiredClearance) || JOURNAL_BOAT_MARKER_CLEARANCE_PX);
        const clearAround = [
          [clearance, 0], [-clearance, 0], [0, clearance], [0, -clearance],
          [clearance * .7, clearance * .7], [-clearance * .7, clearance * .7],
          [clearance * .7, -clearance * .7], [-clearance * .7, -clearance * .7],
        ].every(([offsetX, offsetY]) => waterFeatureAtScreenPoint({ x: candidate.x + offsetX, y: candidate.y + offsetY }));
        if (clearAround) return anchor;
      }
    }
    return null;
  } catch { return null; }
}

function normalizeBoatMarkerPositions() {
  if (!journalMap?.loaded()) return false;
  let changed = false;
  SPOTS = SPOTS.map((spot) => {
    if (!spotIsBoatPlace(spot)) return spot;
    const anchor = safeWaterAnchorForCoordinate(spot.lngLat);
    if (!anchor) return spot;
    try {
      const previous = journalMap.project(spot.lngLat);
      const next = journalMap.project(anchor);
      if (Math.hypot(previous.x - next.x, previous.y - next.y) < 5) return spot;
    } catch { return spot; }
    changed = true;
    return { ...spot, lngLat: anchor, coordinates: `${Number(anchor[1]).toFixed(4)}, ${Number(anchor[0]).toFixed(4)}` };
  });
  HIGHLIGHTS = HIGHLIGHTS.map((spot) => {
    if (spot?.isBoatBase !== true) return spot;
    const anchor = safeWaterAnchorForCoordinate(spot.lngLat);
    if (!anchor) return spot;
    try {
      const previous = journalMap.project(spot.lngLat);
      const next = journalMap.project(anchor);
      if (Math.hypot(previous.x - next.x, previous.y - next.y) < 5) return spot;
    } catch { return spot; }
    changed = true;
    return { ...spot, lngLat: anchor, coordinates: `${Number(anchor[1]).toFixed(4)}, ${Number(anchor[0]).toFixed(4)}` };
  });
  if (changed) {
    persistPlannerStops();
    updateJournalSpotsSource();
    renderSpot();
  }
  return changed;
}

function spotIsOnWater(spot) {
  if (!spot) return false;
  if (spot.isBoatBase === true) return true;
  if (spotIsBoatPlace(spot)) return true;
  if (spot.type === "boat_ramp") return false;
  if (spot.isWater === true || spot.routeMode === "boat" || spot.travelMode === "boat") return true;
  if (journalMap?.loaded() && journalMap.getLayer("water")) {
    try {
      const point = journalMap.project(spot.lngLat);
      const box = [[point.x - 12, point.y - 12], [point.x + 12, point.y + 12]];
      if (journalMap.queryRenderedFeatures(box, { layers: ["water", "waterway"] }).length > 0) return true;
    } catch {}
  }
  return false;
}

function nearestBoatRamp(coordinate) {
  if (!journalMap?.loaded() || !journalMap.getLayer("journal-poi-boat-ramp")) return null;
  try {
    const features = journalMap.queryRenderedFeatures({ layers: ["journal-poi-boat-ramp"] });
    const candidates = features.map((feature) => feature.geometry?.coordinates).filter((value) => Array.isArray(value) && value.length >= 2);
    if (!candidates.length) return null;
    return candidates.reduce((closest, candidate) => {
      const distance = ((Number(candidate[0]) - Number(coordinate[0])) ** 2) + ((Number(candidate[1]) - Number(coordinate[1])) ** 2);
      return !closest || distance < closest.distance ? { coordinate: [Number(candidate[0]), Number(candidate[1])], distance } : closest;
    }, null)?.coordinate || null;
  } catch {
    return null;
  }
}

function nearestRoadAnchor(coordinate) {
  if (!journalMap?.loaded() || !journalMap.getLayer("roads")) return null;
  try {
    const origin = journalMap.project(coordinate);
    let closest = null;
    const features = journalMap.queryRenderedFeatures({ layers: ["roads"] });
    features.forEach((feature) => {
      const geometry = feature.geometry;
      const lines = geometry?.type === "LineString" ? [geometry.coordinates] : geometry?.type === "MultiLineString" ? geometry.coordinates : [];
      lines.flat().forEach((candidate) => {
        if (!Array.isArray(candidate) || candidate.length < 2) return;
        const point = journalMap.project(candidate);
        const distance = ((point.x - origin.x) ** 2) + ((point.y - origin.y) ** 2);
        if (!closest || distance < closest.distance) closest = { coordinate: [Number(candidate[0]), Number(candidate[1])], distance };
      });
    });
    return closest && closest.distance <= 240 ** 2 ? closest.coordinate : null;
  } catch {
    return null;
  }
}

function waterRouteBetween(from, to) {
  if (!journalMap?.loaded()) return null;
  const safeFrom = safeWaterAnchorForCoordinate(from) || safeWaterAnchorForCoordinate(from, 12);
  const safeTo = safeWaterAnchorForCoordinate(to) || safeWaterAnchorForCoordinate(to, 12);
  if (!safeFrom || !safeTo) return null;
  if (waterLineIsClear(safeFrom, safeTo)) return [safeFrom, safeTo];
  for (const step of [20, 24, 30, 38, 50, 64]) {
    const route = findGridRoute(safeFrom, safeTo, "water", step);
    if (route?.length) {
      const filtered = route.filter((coordinate, index, list) => index === 0 || coordinate[0] !== list[index - 1][0] || coordinate[1] !== list[index - 1][1]);
      return simplifyWaterRoute(filtered);
    }
  }
  return null;
}

function nearestPlannerHighlightNode(coordinate) {
  return plannerHighlightNodesByDistance(coordinate)[0] || null;
}

function plannerHighlightNodesByDistance(coordinate) {
  return HIGHLIGHTS
    .map((spot, index) => ({ spot, spotIndex: SPOTS.length + index, highlight: true, highlightIndex: index }))
    .filter((node) => Array.isArray(node.spot?.lngLat))
    .sort((left, right) => {
      const leftDistance = ((Number(left.spot.lngLat[0]) - Number(coordinate[0])) ** 2) + ((Number(left.spot.lngLat[1]) - Number(coordinate[1])) ** 2);
      const rightDistance = ((Number(right.spot.lngLat[0]) - Number(coordinate[0])) ** 2) + ((Number(right.spot.lngLat[1]) - Number(coordinate[1])) ** 2);
      return leftDistance - rightDistance;
    });
}

function waterRampRouteTo(coordinate, fromRamp = false) {
  for (const node of plannerHighlightNodesByDistance(coordinate)) {
    const water = fromRamp
      ? waterRouteBetween(node.spot.lngLat, coordinate)
      : waterRouteBetween(coordinate, node.spot.lngLat);
    if (water?.length >= 2) return { node, water };
  }
  return null;
}

function appendRouteSegment(target, coordinates, spotIndex, travelMode, duration = 0, pinColorIndex = spotColorIndex(plannerRouteNodes()[spotIndex]?.spot, spotIndex)) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return;
  target.push({ coordinates, spotIndex, duration, pinColorIndex: Number.isInteger(pinColorIndex) ? pinColorIndex : spotColorIndex(plannerRouteNodes()[spotIndex]?.spot, spotIndex), travelMode });
}

async function requestMixedTransportSegments(requestId) {
  const nodes = plannerRouteNodes();
  const segments = [];
  journalRouteMissingRamp = false;
  let current = nodes[0]?.spot?.lngLat;
  for (let index = 1; index < nodes.length; index += 1) {
    if (requestId !== journalRouteRequestId) return null;
    const source = nodes[index - 1].spot;
    const destination = nodes[index].spot;
    const sourceOnWater = spotIsOnWater(source);
    const destinationOnWater = spotIsOnWater(destination);

    if (!sourceOnWater && !destinationOnWater) {
      let road;
      try {
        road = await requestRoadCoordinatesWithFallback(current, destination.lngLat);
      } catch {
        return segments.length ? segments : null;
      }
      appendRouteSegment(segments, road.coordinates, index, "car", road.duration || 0, spotColorIndex(destination, index));
    } else if (!sourceOnWater && destinationOnWater) {
      const rampRoute = waterRampRouteTo(destination.lngLat, true);
      const rampNode = rampRoute?.node;
      const ramp = rampNode?.spot?.lngLat;
      if (!rampRoute || !ramp) { journalRouteMissingRamp = true; return segments.length ? segments : null; }
      let road;
      try {
        road = await requestRoadCoordinatesWithFallback(current, nearestRoadAnchor(ramp) || ramp);
      } catch {
        return segments.length ? segments : null;
      }
      appendRouteSegment(segments, road.coordinates, index, "car", road.duration || 0, spotColorIndex(destination, index));
      appendRouteSegment(segments, rampRoute.water, index, "boat", 0, spotColorIndex(destination, index));
    } else if (sourceOnWater && destinationOnWater) {
      const water = waterRouteBetween(current, destination.lngLat);
      if (!water) return segments.length ? segments : null;
      appendRouteSegment(segments, water, index, "boat", 0, spotColorIndex(destination, index));
    } else {
      const rampRoute = waterRampRouteTo(current, false);
      const rampNode = rampRoute?.node;
      const ramp = rampNode?.spot?.lngLat;
      if (!rampRoute || !ramp) { journalRouteMissingRamp = true; return segments.length ? segments : null; }
      appendRouteSegment(segments, rampRoute.water, index, "boat", 0, spotColorIndex(rampNode.spot, rampNode.spotIndex));
      let road;
      try {
        road = await requestRoadCoordinatesWithFallback(nearestRoadAnchor(ramp) || ramp, destination.lngLat);
      } catch {
        return segments.length ? segments : null;
      }
      appendRouteSegment(segments, road.coordinates, index, "car", road.duration || 0, spotColorIndex(destination, index));
    }
    current = destination.lngLat;
  }
  return segments;
}

async function updateCalculatedTransportRoute() {
  if (!journalMap) return;
  const requestedTransport = journalTransport;
  if (typeof journalMap.isMoving === "function" && journalMap.isMoving()) {
    journalMap.once("idle", () => {
      if (journalMap && journalTransport === requestedTransport) scheduleCalculatedTransportRoute(0);
    });
    return;
  }
  const requestId = ++journalRouteRequestId;
  journalRouteMissingRamp = false;
  setJournalRouteAlert("");
  normalizeBoatMarkerPositions();
  const routeNodes = plannerRouteNodes();
  const routeOrigin = routeOriginCoordinate();
  if (routeNodes.length < 2) {
    journalCarRouteCoordinates = [];
    journalBoatRouteCoordinates = [];
    journalCarRouteSegments = [];
    journalBoatRouteSegments = [];
    const emptyRoute = [routeOrigin, routeOrigin];
    setJournalRouteSource("journalRouteCar", emptyRoute);
    setJournalRouteSource("journalRouteWalk", emptyRoute);
    setJournalRouteSource("journalRouteBoat", emptyRoute);
    updateJournalRouteMode();
    return;
  }
  const hasWaterStops = routeNodes.some((node) => spotIsOnWater(node.spot));
  const hasLandStops = routeNodes.some((node) => !spotIsOnWater(node.spot));
  const hasBoatMarkers = routeNodes.some((node) => node.spot?.isBoatBase === true || node.spot?.type === "boat_ramp" || node.spot?.travelMode === "boat" || node.spot?.routeMode === "boat");
  const shouldUseMixedTransport = hasWaterStops && (requestedTransport !== "boat" || hasLandStops);
  if (shouldUseMixedTransport) {
    try {
      const segments = await requestMixedTransportSegments(requestId);
      if (!segments?.length) {
        if ((hasBoatMarkers || hasWaterStops) && requestId === journalRouteRequestId && journalTransport === requestedTransport) {
          journalCarRouteCoordinates = [];
          journalCarRouteSegments = [];
          journalBoatRouteCoordinates = [];
          journalBoatRouteSegments = [];
          setJournalRouteSource("journalRouteCar", [routeOrigin, routeOrigin]);
          setJournalRouteSource("journalRouteBoat", [routeOrigin, routeOrigin]);
          updateJournalRouteMode();
          setJournalRouteAlert(journalRouteMissingRamp ? "⚓ Båtramp saknas" : "");
          showPlannerStatus(journalRouteMissingRamp ? "Båtramp saknas – ingen sträcka till vattenplatsen" : "Vattenrutten beräknas utan landsträcka");
        }
        return;
      }
      if (requestId !== journalRouteRequestId || journalTransport !== requestedTransport) return;
      setJournalRouteAlert(journalRouteMissingRamp ? "⚓ Båtramp saknas – rutten stannar före vattenplatsen" : "");
      const combinedCoordinates = segments.reduce((coordinates, segment) => coordinates.concat(segment.coordinates.slice(coordinates.length ? 1 : 0)), []);
      const hasBoatSegments = segments.some((segment) => segment.travelMode === "boat");
      const hasCarSegments = segments.some((segment) => segment.travelMode === "car");
      if (requestedTransport === "boat") {
        journalBoatRouteCoordinates = combinedCoordinates;
        journalBoatRouteSegments = segments;
      } else {
        journalCarRouteCoordinates = combinedCoordinates;
        journalCarRouteSegments = segments;
      }
      journalCarTravelMode = hasBoatSegments && hasCarSegments ? "mixed" : hasBoatSegments ? "boat" : "car";
      setJournalRouteSource("journalRouteCar", requestedTransport === "boat" ? [routeOrigin, routeOrigin] : hasCarSegments ? segments.filter((segment) => segment.travelMode === "car") : [routeOrigin, routeOrigin]);
      setJournalRouteSource("journalRouteBoat", requestedTransport === "boat" ? segments : [routeOrigin, routeOrigin]);
      setJournalRouteSource("journalRouteWalk", [routeOrigin, routeOrigin]);
      updateJournalRouteMode();
      fitJournalRouteAfterCalculationIfNeeded();
      return;
    } catch {
      // A boat marker makes a road fallback invalid: it would draw a straight
      // land line across the water while the water graph is still resolving.
      if (hasBoatMarkers || hasWaterStops) {
        journalCarRouteCoordinates = [];
        journalCarRouteSegments = [];
        journalBoatRouteCoordinates = [];
        journalBoatRouteSegments = [];
        setJournalRouteSource("journalRouteCar", [routeOrigin, routeOrigin]);
        setJournalRouteSource("journalRouteBoat", [routeOrigin, routeOrigin]);
        updateJournalRouteMode();
        setJournalRouteAlert(journalRouteMissingRamp ? "⚓ Båtramp saknas" : "");
        showPlannerStatus(journalRouteMissingRamp ? "Båtramp saknas – ingen sträcka till vattenplatsen" : "Vattenrutten beräknas utan landsträcka");
        return;
      }
    }
  }
  const immediatePreview = requestedTransport === "boat"
    ? calculateLayerRoute("water")
    : calculateLayerRoute("roads") || calculateLayerRoute("walkways");
  if (immediatePreview?.length >= 2 && requestId === journalRouteRequestId && journalTransport === requestedTransport) {
    if (requestedTransport === "boat") {
      journalBoatRouteCoordinates = immediatePreview;
      journalBoatRouteSegments = [{ coordinates: immediatePreview, duration: 0, spotIndex: Math.max(1, routeNodes.length - 1), pinColorIndex: spotColorIndex(routeNodes[Math.max(1, routeNodes.length - 1)]?.spot, Math.max(1, routeNodes.length - 1)), travelMode: "boat" }];
      setJournalRouteSource("journalRouteBoat", journalBoatRouteSegments);
    } else if (!journalCarRouteCoordinates.length) {
      journalCarRouteCoordinates = immediatePreview;
      journalCarRouteSegments = [{ coordinates: immediatePreview, duration: 0, spotIndex: 1, travelMode: "car" }];
      journalCarTravelMode = "car";
      setJournalRouteSource("journalRouteCar", journalCarRouteSegments);
    }
    updateJournalRouteMode();
  }
  if (requestedTransport === "boat") {
    const calculated = calculateLayerRoute("water");
    if (calculated && requestId === journalRouteRequestId && journalTransport === requestedTransport) {
      journalBoatRouteCoordinates = calculated;
      journalBoatRouteSegments = [{ coordinates: calculated, duration: 0, spotIndex: Math.max(1, routeNodes.length - 1), pinColorIndex: spotColorIndex(routeNodes[Math.max(1, routeNodes.length - 1)]?.spot, Math.max(1, routeNodes.length - 1)), travelMode: "boat" }];
      setJournalRouteSource("journalRouteBoat", journalBoatRouteSegments);
      updateJournalRouteMode();
      fitJournalRouteAfterCalculationIfNeeded();
      return;
    }
    // Never convert a failed boat route into a road line. The route must either
    // follow the water graph or remain hidden until the graph is ready.
    if (hasBoatMarkers || hasWaterStops) {
      journalBoatRouteCoordinates = [];
      journalBoatRouteSegments = [];
      setJournalRouteSource("journalRouteBoat", [routeOrigin, routeOrigin]);
      updateJournalRouteMode();
      showPlannerStatus("Vattenrutten beräknas utan landsträcka");
      return;
    }
    journalTransport = "car";
    plannerState.fields.transport = "car";
    persistPlannerState();
    document.querySelectorAll("[data-journal-transport]").forEach((button) => button.classList.toggle("active", button.dataset.journalTransport === journalTransport));
    return updateCalculatedTransportRoute();
  }

  try {
    const routeIndexes = Array.from({ length: Math.max(0, SPOTS.length - 1) }, (_, offset) => offset + 1);
    // The API calls are independent. Running them together removes the
    // cumulative wait from long plans while preserving the stop order.
    const segments = await Promise.all(routeIndexes.map(async (index) => {
      const requestedRouteIndex = Math.max(0, Number(SPOTS[index]?.routeAlternativeIndex) || 0);
      try {
        return await requestRoadRouteSegment(index, "driving", requestedRouteIndex);
      } catch {
        return requestRoadRouteSegment(index, "walking", requestedRouteIndex);
      }
    }));
    let routeSelectionChanged = false;
    segments.forEach((segment, segmentOffset) => {
      const index = routeIndexes[segmentOffset];
      const requestedRouteIndex = Math.max(0, Number(SPOTS[index]?.routeAlternativeIndex) || 0);
      if ((Number(segment.routeIndex) || 0) !== requestedRouteIndex) {
        SPOTS[index] = { ...SPOTS[index], routeAlternativeIndex: Number(segment.routeIndex) || 0 };
        routeSelectionChanged = true;
      }
    });
    if (requestId !== journalRouteRequestId || journalTransport !== requestedTransport) return;
    const combinedCoordinates = segments.reduce((coordinates, segment) => coordinates.concat(segment.coordinates.slice(coordinates.length ? 1 : 0)), []);
    const carSegments = segments.filter((segment) => segment.travelMode !== "walk");
    const walkSegments = segments.filter((segment) => segment.travelMode === "walk");
    const emptyRoute = [routeOrigin, routeOrigin];
    journalCarRouteCoordinates = combinedCoordinates;
    journalCarRouteSegments = segments;
    journalCarTravelMode = walkSegments.length ? (carSegments.length ? "mixed" : "walk") : "car";
    if (routeSelectionChanged) persistPlannerStops();
    setJournalRouteSource("journalRouteCar", carSegments.length ? carSegments : emptyRoute);
    setJournalRouteSource("journalRouteWalk", walkSegments.length ? walkSegments : emptyRoute);
  } catch {
    const fallback = calculateLayerRoute("roads") || calculateLayerRoute("walkways");
    if (requestId !== journalRouteRequestId || journalTransport !== requestedTransport) return;
    if (fallback) {
      journalCarTravelMode = "walk";
      journalCarRouteCoordinates = fallback;
      journalCarRouteSegments = [{ coordinates: fallback, duration: 0, spotIndex: 1, travelMode: "walk" }];
    } else if (journalCarRouteCoordinates.length >= 2) {
      // Keep the last working route visible during a temporary refresh failure.
      showPlannerStatus("Rutten behålls medan vägen uppdateras");
      updateJournalRouteMode();
      renderRouteOverlay();
      return;
    } else {
      journalCarTravelMode = "car";
      journalCarRouteCoordinates = [];
      journalCarRouteSegments = [];
      showPlannerStatus("Ingen väg kunde beräknas för planen");
    }
    const emptyRoute = [routeOrigin, routeOrigin];
    setJournalRouteSource("journalRouteCar", emptyRoute);
    setJournalRouteSource("journalRouteWalk", fallback ? journalCarRouteSegments : emptyRoute);
  }
  updateJournalRouteMode();
  fitJournalRouteAfterCalculationIfNeeded();
}

function updateJournalRouteMode() {
  const isBoat = journalTransport === "boat";
  const route = journalTransport === "boat" ? journalBoatRouteCoordinates : journalCarRouteCoordinates;
  const isWalking = !isBoat && journalCarTravelMode === "walk";
  const isMixed = !isBoat && journalCarTravelMode === "mixed";
  const hasBoatSegments = !isBoat && journalCarRouteSegments.some((segment) => segment.travelMode === "boat");
  const distance = routeDistanceKm(route);
  const distanceLabel = `${distance.toFixed(1).replace(".", ",")} km`;
  setText("#journalReferenceDistance", distanceLabel);
  setText("#journalSpotInfoDistance", distanceLabel);
  setText("#journalReferencePlanSummary", `${SPOTS.length} stopp \u00b7 ${distanceLabel}`);
  setText("#journalReferenceRouteLabel", isBoat ? "B\u00e5t via vatten" : hasBoatSegments ? "Bil + b\u00e5t via ramp" : isMixed ? "Bil + promenad" : isWalking ? "Promenad via g\u00e5ngv\u00e4g" : "Bil via v\u00e4g");
  setText("#journalReferenceTravelTime", isBoat ? "1 h 35 min" : hasBoatSegments ? "Bil + b\u00e5t" : isMixed ? "Bil + promenad" : isWalking ? "2 h 15 min" : "1 h 45 min");
  setText("#journalRouteModeBadge", isBoat ? "\u2693 \u00a0 Rutten f\u00f6ljer vatten" : hasBoatSegments ? "\uD83D\uDE97 + \u2693 \u00a0 V\u00e4g till ramp, sedan b\u00e5t" : isMixed ? "\uD83D\uDE97 + \uD83D\uDEB6 \u00a0 Bilv\u00e4g + promenad" : isWalking ? "\uD83D\uDEB6 \u00a0 Rutten f\u00f6ljer g\u00e5ngv\u00e4gar" : "\uD83D\uDE97 \u00a0 Rutten f\u00f6ljer v\u00e4gar");
  if (!journalMap) return;
  if (!journalMap.loaded()) {
    renderRouteOverlay();
    return;
  }
  ["journal-route-boat-shadow", "journal-route-boat", "journal-route-car-shadow", "journal-route-car", "journal-route-walk-shadow", "journal-route-walk"].forEach((layerId) => {
    if (journalMap.getLayer(layerId)) journalMap.setLayoutProperty(layerId, "visibility", "none");
  });
  renderRouteTimeLabels();
  renderRouteOverlay();
  renderReferencePlan();
  updateJournalMarkerLabels();
}

function createJournalMarkers() {
  if (!journalMap) return;
  updateJournalSpotsSource();
  updateMarkerState();
  updateJournalMarkerScale();
}

function rebuildJournalMarkers() {
  journalMarkers.forEach(({ element }) => element.remove());
  journalMarkers = [];
  createJournalMarkers();
}

function setJournalMobilePinLayers() {
  if (!journalMap || !window.matchMedia("(max-width: 680px)").matches) return;
  if (journalMap.getLayer("journal-spot-pins")) {
    journalMap.setLayoutProperty("journal-spot-pins", "visibility", "none");
    journalMap.setPaintProperty("journal-spot-pins", "circle-stroke-width", 2);
  }
  if (journalMap.getLayer("journal-spot-numbers")) {
    journalMap.setLayoutProperty("journal-spot-numbers", "visibility", "none");
  }
  if (journalMap.getLayer("journal-spot-pins-glow")) journalMap.setLayoutProperty("journal-spot-pins-glow", "visibility", "none");
}

function ensureJournalMap() {
  const target = $("#journalMapReference") || $("#journalMap");
  if (!target) return;
  if (journalMap) {
    journalMap.resize();
    if (journalMap.loaded()) {
      updateJournalRouteMode();
      scheduleCalculatedTransportRoute();
    }
    return;
  }
  if (!window.maplibregl) {
    if (!mapReadyListenerBound) { mapReadyListenerBound = true; window.addEventListener("bigplus:maplibre-ready", ensureJournalMap, { once: true }); }
    return;
  }
  journalMap = new window.maplibregl.Map({ container: target, style: journalMapStyle(), center: [18.66, 59.27], zoom: 10.2, attributionControl: false, dragRotate: false, pitchWithRotate: false });
  const resizeJournalMap = () => {
    if (!journalMap) return;
    const rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) journalMap.resize();
  };
  journalMap.on("load", () => { resizeJournalMap(); $(".journal-reference-map-panel")?.classList.add("is-map-ready"); setJournalMobilePinLayers(); createJournalMarkers(); updateJournalRouteMode(); fitJournalPlanSpots(); scheduleCalculatedTransportRoute(260); });
  window.requestAnimationFrame(resizeJournalMap);
  window.setTimeout(resizeJournalMap, 180);
  ["move", "zoom", "resize"].forEach((eventName) => journalMap.on(eventName, () => { updateJournalPlaceLabelPositions(); updateRouteTimeLabels(); renderRouteOverlay(); updateJournalMarkerScale(); }));
  journalMap.on("render", () => { updateJournalPlaceLabelPositions(); updateRouteTimeLabels(); renderRouteOverlay(); });
  journalMap.on("click", (event) => {
    if (journalMarkerMoveMode) {
      const nextDestination = event.lngLat.toArray();
      if (journalEditingHighlightIndex != null && HIGHLIGHTS[journalEditingHighlightIndex]) {
        const index = journalEditingHighlightIndex;
        const waterDestination = safeWaterAnchorForCoordinate(nextDestination);
        if (!waterDestination) { showPlannerStatus("Båtrampen måste ligga på vatten"); return; }
        const [lng, lat] = waterDestination;
        HIGHLIGHTS[index] = { ...HIGHLIGHTS[index], lngLat: [lng, lat], coordinates: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
        updateJournalSpotsSource();
        persistPlannerStops();
        journalPendingDestination = nextDestination;
        renderSpot();
        scheduleCalculatedTransportRoute(0);
        showPlannerStatus(`${HIGHLIGHTS[index].name || "Highlight"} har flyttats`);
      } else if (journalEditingSpotIndex != null && SPOTS[journalEditingSpotIndex]) {
        const index = journalEditingSpotIndex;
        const waterDestination = spotIsBoatPlace(SPOTS[index]) ? safeWaterAnchorForCoordinate(nextDestination) : nextDestination;
        if (!waterDestination) { showPlannerStatus("Båtmarkören måste ligga på vatten"); return; }
        const [lng, lat] = waterDestination;
        SPOTS[index] = { ...SPOTS[index], lngLat: [lng, lat], coordinates: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
        updateJournalSpotsSource();
        plannerState.activeSpot = index;
        persistPlannerStops();
        journalPendingDestination = nextDestination;
        renderSpot();
        scheduleCalculatedTransportRoute(0);
        showPlannerStatus(`${SPOTS[index].name} har flyttats`);
      } else {
        journalPendingDestination = nextDestination;
        showPlannerStatus("Markören är flyttad. Spara platsen när uppgifterna är klara.");
      }
      journalMarkerMoveMode = false;
      $("#journalView")?.classList.remove("is-move-marker-mode");
      $(".journal-reference-map-panel")?.classList.remove("is-move-marker-mode");
      journalEditingHighlightIndex = null;
      return;
    }
    if (journalMarkerActionMode) {
      showPlannerStatus("Klicka direkt på en markör");
      return;
    }
    if (!journalAddDestinationMode) {
      const spotFeature = journalMap.queryRenderedFeatures(event.point, { layers: ["journal-spot-pins", "journal-spot-labels"] })[0];
      if (spotFeature) {
        selectSpot(Number(spotFeature.properties?.index) || 0, false, true);
        if ($("#journalView")?.classList.contains("journal-mobile-edit-mode")) $("#journalView")?.classList.add("journal-mobile-editor-open");
        return;
      }
      showPlannerStatus("Tryck pa Lagg till plats for att skapa ett stopp");
      return;
    }
    journalPendingDestination = event.lngLat.toArray();
    $("#journalView")?.classList.add("is-destination-form-open");
    $("#journalDestinationQuickActions")?.removeAttribute("hidden");
    const dialog = $("#journalDestinationDialog");
    if (dialog) {
      dialog.hidden = false;
      setText("#journalMapReferenceHint strong", "Skapa ny plats");
      setText("#journalMapReferenceHint span", "Fyll i informationen och spara platsen");
      $("#journalDialogName")?.focus();
    }
  });
}

function updateMarkerState() { updateJournalSpotsSource(); }

function updateJournalMarkerLabels() {
  updateJournalSpotsSource();
}

function updateJournalMarkerScale() {
  if (!journalMap) return;
  journalMap.triggerRepaint();
}

function renderChecklist(index) {
  const target = $("#journalSpotChecklist");
  const spot = SPOTS[index];
  if (!target || !spot) return;
  const values = Array.isArray(plannerState.checks[index]) ? plannerState.checks[index] : (DEFAULT_CHECKS[index] || [false, false, false, false, false]);
  target.innerHTML = spot.checklist.map((item, itemIndex) => `<label><input type="checkbox" data-journal-check="${itemIndex}"${values[itemIndex] ? " checked" : ""}> ${escapeHtml(item)}</label>`).join("");
  setText("#journalChecklistCount", `${values.filter(Boolean).length} av ${spot.checklist.length} klara`);
}

function spotTransportLabel(spot) {
  if (spot.isPause) return "Paus · " + (spot.durationMinutes || 30) + " min";
  if (spot.travelMode === "boat") return `Båt${spot.motor ? ` · ${spot.motor}` : ""}`;
  if (spot.travelMode === "walk") return "Gång";
  return "Bil";
}

function renderSpotInfoList() {
  const target = $("#journalSpotInfoList");
  if (!target) return;
  setText("#journalSpotInfoCount", `${SPOTS.length} ${SPOTS.length === 1 ? "plats" : "platser"}`);
  const route = journalTransport === "boat" ? journalBoatRouteCoordinates : journalCarRouteCoordinates;
  const distance = routeDistanceKm(route?.length >= 2 ? route : []);
  setText("#journalSpotInfoDistance", `${distance.toFixed(1).replace(".", ",")} km`);
  if (!SPOTS.length) {
    target.innerHTML = `<p class="journal-spot-info-empty">Lägg till en plats på kartan.</p>`;
    return;
  }
  target.innerHTML = SPOTS.map((spot, index) => {
    const active = index === plannerState.activeSpot;
    const transport = spotTransportLabel(spot);
    const color = JOURNAL_PIN_COLORS[spotColorIndex(spot, index)];
    const details = `<dl class="journal-spot-info-details"><div><dt>Tid här</dt><dd>${escapeHtml(spot.time || `${spot.durationMinutes || 45} min`)}</dd></div><div><dt>Färdsätt</dt><dd>${escapeHtml(transport)}</dd></div><div><dt>Målart</dt><dd>${escapeHtml(spot.target || "-")}</dd></div><div><dt>Koordinater</dt><dd>${escapeHtml(spot.coordinates || "-")}</dd></div><div><dt>Metod</dt><dd>${escapeHtml(spot.method || "Planeras")}</dd></div></dl><button type="button" class="journal-spot-info-edit" data-journal-info-edit="${index}" aria-label="Redigera ${escapeHtml(spot.name)}" title="Redigera plats">&#9998; Redigera plats</button>`;
    const rowActions = `<span class="journal-spot-info-actions"><strong>${escapeHtml(spotTimeLabel(spot, index) || spot.shortTime || "")}</strong><button type="button" data-journal-info-move="up" data-journal-info-index="${index}" aria-label="Flytta ${escapeHtml(spot.name)} upp"${index === 0 ? " disabled" : ""}>&uarr;</button><button type="button" data-journal-info-move="down" data-journal-info-index="${index}" aria-label="Flytta ${escapeHtml(spot.name)} ner"${index === SPOTS.length - 1 ? " disabled" : ""}>&darr;</button><button type="button" data-journal-info-edit="${index}" aria-label="Redigera ${escapeHtml(spot.name)}" title="Redigera plats">&#9998;</button></span>`;
    return `<article class="journal-spot-info-item${active ? " is-active" : ""}" data-journal-info-index="${index}"><button type="button" class="journal-spot-info-toggle" aria-expanded="false" aria-controls="journalSpotInfoDetails${index}"><span class="journal-spot-info-pin" style="--journal-pin-color:${color.base}">${spot.isPause ? "🍴" : spotMarkerLabel(spot, index)}</span><span class="journal-spot-info-title"><strong>${escapeHtml(spot.name)}</strong><small>${escapeHtml(transport)}</small></span><b aria-hidden="true">&rsaquo;</b></button>${rowActions}<div id="journalSpotInfoDetails${index}" class="journal-spot-info-details-wrap" hidden>${details}</div></article>`;
  }).join("");
}

function renderMobilePinInfo(index = plannerState.activeSpot) {
  if (!window.matchMedia("(max-width: 680px)").matches) return;
  const spot = SPOTS[index];
  const panel = $("#journalMobilePinInfo");
  if (!panel || !spot) return;
  const color = JOURNAL_PIN_COLORS[spotColorIndex(spot, index)];
  setText("#journalMobilePinInfoPosition", `Plats ${index + 1} av ${SPOTS.length}`);
  setText("#journalMobilePinInfoPin", spotMarkerLabel(spot, index));
  setText("#journalMobilePinInfoName", spot.name || "Vald plats");
  setText("#journalMobilePinInfoTime", spotTimeLabel(spot, index) || spot.time || "Tid saknas");
  setText("#journalMobilePinInfoTransport", spotTransportLabel(spot));
  setText("#journalMobilePinInfoTarget", spot.target || (spot.isPause ? "Paus" : "Fiske"));
  setText("#journalMobilePinInfoCoordinates", spot.coordinates || "-");
  journalMapPinInfoIndex = index;
  const pin = $("#journalMobilePinInfoPin");
  pin?.style.setProperty("--journal-pin-color", color.base);
  const previous = $("#journalMobilePinInfoPrev");
  const next = $("#journalMobilePinInfoNext");
  if (previous) previous.disabled = index <= 0;
  if (next) next.disabled = index >= SPOTS.length - 1;
  panel.hidden = false;
  $("#journalView")?.classList.add("journal-mobile-pin-info-open");
  updateJournalMapPinInfo();
}

function renderSelectedSpotForm() {
  const empty = $("#journalInfoSpotEmpty");
  const fields = $(".journal-selected-spot-fields");
  const spot = SPOTS[plannerState.activeSpot];
  if (!spot) {
    if (empty) empty.hidden = false;
    if (fields) fields.hidden = true;
    setText("#journalInfoSpotPosition", "Ingen plats vald");
    return;
  }
  journalEditingSpotIndex = plannerState.activeSpot;
  if (empty) empty.hidden = true;
  if (fields) fields.hidden = false;
  setText("#journalInfoSpotPosition", `Plats ${plannerState.activeSpot + 1} av ${SPOTS.length}`);
  setText("#journalInfoSpotCoordinates", spot.coordinates || "-");
  const values = {
    "#journalInfoEditName": spot.name || "",
    "#journalInfoEditDuration": String(spot.durationMinutes || 45),
    "#journalInfoEditTransport": spot.travelMode || (spot.isPause ? "car" : "car"),
    "#journalInfoEditMotor": spot.motor || "40 hk",
    "#journalInfoEditTarget": spot.target || (spot.isPause ? "Paus" : "Gädda"),
    "#journalInfoEditMethod": spot.method || "Planeras",
    "#journalInfoEditNotes": spot.notes || "",
  };
  Object.entries(values).forEach(([selector, value]) => { const input = $(selector); if (input) input.value = value; });
  const motorField = $("#journalInfoEditMotorField");
  if (motorField) motorField.hidden = spot.travelMode !== "boat";
  const actions = $(".journal-selected-spot-actions");
  let alternativeButton = $("#journalInfoAlternativeRouteButton");
  if (!alternativeButton && actions) {
    alternativeButton = document.createElement("button");
    alternativeButton.type = "button";
    alternativeButton.id = "journalInfoAlternativeRouteButton";
    alternativeButton.className = "journal-form-secondary";
    actions.insertBefore(alternativeButton, actions.lastElementChild);
  }
  if (alternativeButton) {
    const routeIndex = Number(spot.routeAlternativeIndex) || 0;
    const canAlternate = plannerState.activeSpot > 0 && journalTransport !== "boat";
    alternativeButton.disabled = !canAlternate;
    alternativeButton.innerHTML = routeIndex ? "&#8634; Kortaste rutt" : "&#8646; Alternativ rutt";
    alternativeButton.title = canAlternate ? (routeIndex ? "Byt tillbaka till kortaste rutten" : "Visa alternativ rutt") : "Första platsen har ingen föregående sträcka";
    alternativeButton.setAttribute("aria-label", alternativeButton.title);
    alternativeButton.onclick = toggleAlternativeRoute;
  }
  const boatButton = $("#journalInfoBoatMarkerButton");
  const isBoatMarker = spotIsBoatPlace(spot);
  if (boatButton) {
    boatButton.innerHTML = isBoatMarker ? "&#128205; Platsmarkör" : "&#9973; Båtmarkör";
    boatButton.title = isBoatMarker ? "Gör platsen till en vanlig platsmarkör" : "Gör platsen till båtmarkör";
    boatButton.setAttribute("aria-pressed", String(isBoatMarker));
  }
}

function toggleSelectedSpotBoatMarker(index = plannerState.activeSpot) {
  const spot = SPOTS[index];
  if (!spot) return;
  const next = spotIsBoatPlace(spot)
    ? { ...spot, isBoatPlace: false, isBoatBase: false, isWater: false, routeMode: "car", travelMode: "car" }
    : normalizeBoatPlace(spot);
  SPOTS[index] = next;
  plannerState.activeSpot = index;
  persistPlannerStops();
  window.clearTimeout(journalRouteRefreshTimer);
  journalRouteRequestId += 1;
  clearJournalRouteDisplay();
  rebuildJournalMarkers();
  renderSpot();
  updateJournalRouteMode();
  scheduleCalculatedTransportRoute(0);
  if (window.matchMedia("(max-width: 680px)").matches) {
    journalMapPinInfoIndex = index;
    renderMobilePinInfo(index);
  } else {
    journalMapPinInfoIndex = index;
    updateJournalMapPinInfo();
  }
  showPlannerStatus(`${spot.name} är nu ${spotIsBoatPlace(next) ? "båtplats" : "vanlig plats"}`);
}

function setSelectedSpotCarMarker(index = plannerState.activeSpot) {
  const spot = SPOTS[index];
  if (!spot) return;
  SPOTS[index] = {
    ...spot,
    type: "fishing",
    isPause: false,
    isBoatPlace: false,
    isBoatBase: false,
    isWater: false,
    routeMode: "car",
    travelMode: "car",
  };
  plannerState.activeSpot = index;
  persistPlannerStops();
  window.clearTimeout(journalRouteRefreshTimer);
  journalRouteRequestId += 1;
  clearJournalRouteDisplay();
  rebuildJournalMarkers();
  renderSpot();
  updateJournalRouteMode();
  scheduleCalculatedTransportRoute(0);
  journalMapPinInfoIndex = index;
  if (window.matchMedia("(max-width: 680px)").matches) renderMobilePinInfo(index);
  else updateJournalMapPinInfo();
  showPlannerStatus(`${spot.name} är nu bilmarkör`);
}

function toggleAlternativeRoute() {
  const index = plannerState.activeSpot;
  const spot = SPOTS[index];
  if (!spot || index <= 0 || journalTransport === "boat") return;
  const nextRouteIndex = Number(spot.routeAlternativeIndex) === 1 ? 0 : 1;
  SPOTS[index] = { ...spot, routeAlternativeIndex: nextRouteIndex };
  persistPlannerStops();
  window.clearTimeout(journalRouteRefreshTimer);
  journalRouteRequestId += 1;
  clearJournalRouteDisplay();
  renderSelectedSpotForm();
  updateJournalRouteMode();
  scheduleCalculatedTransportRoute(0);
  showPlannerStatus(nextRouteIndex ? "Alternativ rutt beräknas" : "Kortaste rutt beräknas");
}

function saveSelectedSpotForm(event) {
  event.preventDefault();
  const index = plannerState.activeSpot;
  const spot = SPOTS[index];
  if (!spot) { showPlannerStatus("Välj en plats först"); return; }
  const name = $("#journalInfoEditName")?.value.trim() || spot.name;
  const durationMinutes = Math.max(5, Number($("#journalInfoEditDuration")?.value || spot.durationMinutes || 45));
  const travelMode = $("#journalInfoEditTransport")?.value || "car";
  const target = $("#journalInfoEditTarget")?.value || spot.target || "Gädda";
  SPOTS[index] = { ...spot, name, durationMinutes, time: `${durationMinutes} min`, travelMode, isBoatPlace: travelMode === "boat", isBoatBase: false, isWater: travelMode === "boat", routeMode: travelMode === "boat" ? "boat" : travelMode === "walk" ? "walk" : "car", motor: $("#journalInfoEditMotor")?.value || spot.motor || "", target, method: $("#journalInfoEditMethod")?.value.trim() || "Planeras", notes: $("#journalInfoEditNotes")?.value.trim() || "" };
  journalTransport = travelMode === "boat" ? "boat" : "car";
  journalCarTravelMode = travelMode === "walk" ? "walk" : "car";
  plannerState.fields.transport = journalTransport;
  plannerState.fields.transportVersion = 2;
  persistPlannerStops();
  window.clearTimeout(journalRouteRefreshTimer);
  journalRouteRequestId += 1;
  clearJournalRouteDisplay();
  rebuildJournalMarkers();
  renderSpot();
  updateJournalRouteMode();
  scheduleCalculatedTransportRoute(0);
  showPlannerStatus(`${name} är uppdaterad`);
  closeJournalMobilePanels();
}

function renderSpot() {
  if (!SPOTS.length) {
    [["#journalSpotPosition", "Inga destinationer"], ["#journalSpotName", "Planera första stoppet"], ["#journalSpotArea", "Klicka på kartan för att börja"], ["#journalSpotCoordinates", ""], ["#journalSpotTime", ""], ["#journalSpotPriority", ""], ["#journalSpotMethod", ""], ["#journalSpotWind", ""], ["#journalSpotDepth", ""], ["#journalSpotNotes", ""]].forEach(([selector, value]) => setText(selector, value));
    setText("#journalNextStopName", "Första destinationen");
    [["#journalInfoSpotPosition", "Ingen plats vald"], ["#journalInfoSpotName", "Välj en pin"], ["#journalInfoSpotTime", "-"], ["#journalInfoSpotTransport", "-"], ["#journalInfoSpotTarget", "-"], ["#journalInfoSpotCoordinates", "-"], ["#journalInfoSpotMethod", "-"]].forEach(([selector, value]) => setText(selector, value));
    renderSpotInfoList();
    renderSelectedSpotForm();
    updateMarkerState();
    renderReferencePlan();
    return;
  }
  const index = Math.min(SPOTS.length - 1, Math.max(0, plannerState.activeSpot));
  plannerState.activeSpot = index;
  const spot = SPOTS[index];
  const transportLabel = spotTransportLabel(spot);
  setText("#journalInfoSpotPosition", `Plats ${index + 1} av ${SPOTS.length}`);
  setText("#journalInfoSpotName", spot.name);
  setText("#journalInfoSpotTime", spot.time || `${spot.durationMinutes || 45} min`);
  setText("#journalInfoSpotTransport", transportLabel);
  setText("#journalInfoSpotTarget", spot.target || "- ");
  setText("#journalInfoSpotCoordinates", spot.coordinates || "-");
  setText("#journalInfoSpotMethod", spot.method || "Planeras");
  renderSpotInfoList();
  renderSelectedSpotForm();
  [["#journalSpotPosition", `Spot ${index + 1} av ${SPOTS.length}`], ["#journalSpotName", spot.name], ["#journalSpotArea", spot.area], ["#journalSpotCoordinates", spot.coordinates], ["#journalSpotTime", spot.time], ["#journalSpotPriority", spot.priority], ["#journalSpotMethod", spot.method], ["#journalSpotWind", spot.wind], ["#journalSpotDepth", spot.depth], ["#journalSpotNotes", spot.notes], ["#journalNextStopName", SPOTS[(index + 1) % SPOTS.length].name]].forEach(([selector, value]) => setText(selector, value));
  const image = $("#journalSpotImage");
  if (image) image.src = spot.image;
  $("#journalTimeline")?.querySelectorAll("[data-journal-spot-index]").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.journalSpotIndex) === index));
  $("#journalFavoriteSpot")?.classList.toggle("is-active", plannerState.favorites.includes(index));
  renderChecklist(index);
  updateMarkerState();
  renderReferencePlan();
}

function renderPlanPicker() {
  renderSelectedPlanSummary();
  const targets = [$("#journalPlanOptions"), $("#journalQuickPlanOptions")].filter(Boolean);
  if (!targets.length) return;
  const current = currentPlanSnapshot();
  const plans = [...readSavedPlans()];
  if (plans.length && !plans.some((plan) => plan.id === current.id)) plans.unshift(current);
  const renderOptions = (items) => items.map((plan) => {
    const title = plan.title || plan.fields?.planTitle || "Min fisketur";
    const stops = planStopCount(plan);
    const active = plan.id === current.id;
    const archived = planIsArchived(plan);
    return "<button type=\"button\" class=\"journal-plan-option" + (active ? " is-active" : "") + (archived ? " is-archived" : "") + "\" data-journal-plan-id=\"" + escapeHtml(plan.id) + "\"><span class=\"journal-plan-option-icon\">" + (archived ? "&#128465;" : active ? "&#10003;" : "&#9876;") + "</span><span><strong>" + escapeHtml(title) + "</strong><small>" + escapeHtml(formatPlanDate(planDateValue(plan))) + " &nbsp; · &nbsp; " + stops + " " + (stops === 1 ? "plats" : "platser") + (active ? " &nbsp; · &nbsp; Aktiv" : "") + "</small></span><b aria-hidden=\"true\">&rsaquo;</b></button>";
  }).join("");
  const activePlans = plans.filter((plan) => !planIsArchived(plan));
  const archivedPlans = plans.filter((plan) => planIsArchived(plan));
  const markup = (activePlans.length ? "<div class=\"journal-plan-group\"><strong>Aktiva planer</strong>" + renderOptions(activePlans) + "</div>" : "") + (archivedPlans.length ? "<div class=\"journal-plan-group journal-plan-group-archived\"><strong>Arkiverade</strong>" + renderOptions(archivedPlans) + "</div>" : "") || "<p class=\"journal-plan-empty\">Inga planer sparade ännu.</p>";
  targets.forEach((target) => { target.innerHTML = markup; });
}

function planStopCount(plan) {
  const rawStops = Array.isArray(plan?.stops) ? plan.stops : Array.isArray(plan?.fields?.stops) ? plan.fields.stops : [];
  const rawHighlights = Array.isArray(plan?.highlights) ? plan.highlights : Array.isArray(plan?.fields?.highlights) ? plan.fields.highlights : [];
  return splitPlanCollections(rawStops, rawHighlights).stops.length;
}

function renderSelectedPlanSummary() {
  const target = $("#journalSelectedPlanSummaryText");
  const hasPlan = plannerState.fields.planId && plannerState.fields.planId !== "legacy-plan";
  const title = hasPlan ? (plannerState.fields.planTitle || "Min fisketur") : "Ingen plan vald";
  const count = SPOTS.length;
  const date = plannerState.fields.planDate || localDateValue();
  const startTime = plannerState.fields.startTime || "08:30";
  if (target) target.textContent = title;
  setText("#journalSelectedPlanSummaryMeta", hasPlan ? `${count} ${count === 1 ? "plats" : "platser"} · Start ${startTime} · ${date}` : "Skapa en plan för att börja");
}

function switchPlan(planId) {
  const plan = readSavedPlans().find((item) => item.id === planId);
  if (!plan) return;
  const activePlanId = String(plan.id);
  rememberActivePlan(plan.id);
  const rawStops = Array.isArray(plan.stops) ? plan.stops : Array.isArray(plan.fields?.stops) ? plan.fields.stops : [];
  const rawHighlights = Array.isArray(plan.highlights) ? plan.highlights : Array.isArray(plan.fields?.highlights) ? plan.fields.highlights : [];
  const collections = splitPlanCollections(rawStops, rawHighlights);
  const stops = collections.stops.map((spot, index) => ({ ...spot, pinColorIndex: spotColorIndex(spot, index), lngLat: Array.isArray(spot.lngLat) ? spot.lngLat.map(Number) : [18.66, 59.27] }));
  const highlights = collections.highlights.map((spot, index) => normalizeHighlight({ ...spot, lngLat: Array.isArray(spot.lngLat) ? spot.lngLat.map(Number) : [18.66, 59.27] }, index, spot.routeOrder));
  const fields = { ...(plan.fields && typeof plan.fields === "object" ? clonePlannerValue(plan.fields) : {}), planId: plan.id, planTitle: plan.title || plan.fields?.planTitle || "Min fisketur", stops, highlights, mode: "edit" };
  plannerState = {
    activeSpot: Math.min(Math.max(0, Number(plan.activeSpot) || 0), Math.max(0, stops.length - 1)),
    favorites: Array.isArray(plan.favorites) ? plan.favorites : [],
    checks: plan.checks && typeof plan.checks === "object" ? plan.checks : {},
    ratings: Array.isArray(plan.ratings) ? plan.ratings : [5, 5, 5, 3],
    started: Boolean(plan.started),
    savedAt: plan.savedAt || "",
    notes: plan.notes || "",
    fields,
  };
  SPOTS = stops;
  HIGHLIGHTS = highlights;
  const savedTransport = fields.transport;
  const hasBoatStops = stops.some((spot) => spot?.travelMode === "boat");
  journalTransport = Number(fields.transportVersion) >= 2 && fields.transport === "boat" && hasBoatStops && !stops.some((spot) => spot?.travelMode === "car" || spot?.travelMode === "walk") ? "boat" : "car";
  journalCarTravelMode = stops.some((spot) => spot?.travelMode === "walk") ? "walk" : "car";
  window.clearTimeout(journalRouteRefreshTimer);
  journalRouteRequestId += 1;
  journalFitRouteAfterCalculation = true;
  clearJournalRouteDisplay();
  journalMapPinInfoIndex = null;
  primePlanRoutePreview();
  $("#journalPlanPicker")?.setAttribute("hidden", "hidden");
  $("#journalQuickPlansReference")?.setAttribute("hidden", "hidden");
  $("#journalSelectedPlanSummary")?.setAttribute("aria-expanded", "false");
  $("#journalView")?.classList.remove("journal-mobile-plans-open");
  setJournalMode("edit", false);
  document.querySelectorAll("[data-journal-transport]").forEach((button) => button.classList.toggle("active", button.dataset.journalTransport === journalTransport));
  persistPlannerState();
  rebuildJournalMarkers();
  setJournalMobilePinLayers();
  renderSpot();
  if (journalMap?.loaded()) {
    fitJournalPlanSpots();
    updateJournalRouteMode();
    renderRouteOverlay();
    const refreshPlanRoute = () => {
      if (!journalMap || String(plannerState.fields.planId || "") !== activePlanId) return;
      primePlanRoutePreview();
      updateJournalRouteMode();
      renderRouteOverlay();
      void updateCalculatedTransportRoute();
    };
    journalMap.once("idle", refreshPlanRoute);
    if (!journalMap.isMoving?.()) refreshPlanRoute();
  } else if (journalMap) {
    scheduleCalculatedTransportRoute(0);
  }
  showPlannerStatus((fields.planTitle || "Planen") + " är aktiv");
}

function renderReferencePlan() {
  const planTarget = $("#journalReferencePlanStops");
  const timelineTarget = $("#journalReferenceTimeline");
  setText("#journalMobileStopCount", String(SPOTS.length));
  renderPlanPicker();
  const planDateInput = $("#journalPlanDate");
  if (planDateInput) planDateInput.value = plannerState.fields.planDate || localDateValue();
  const timeLabels = SPOTS.map((spot, index) => spotTimeLabel(spot, index));
  if (planTarget) {
    planTarget.innerHTML = SPOTS.map((spot, index) => { const typeLabel = spot.isPause ? "Paus" : spotIsBoatPlace(spot) ? "Båt" : spot.type === "fishing" ? "Fiske" : spot.type ? escapeHtml(spot.type) : index === 0 ? "Startpunkt" : "Fiske"; const duration = spot.durationMinutes || [90, 75, 75, 60][index] || 45; const color = JOURNAL_PIN_COLORS[spotColorIndex(spot, index)]; return `<article class="journal-plan-stop${index === plannerState.activeSpot ? " is-active" : ""}" data-journal-reference-spot="${index}"><b style="--journal-pin-color:${color.base}">${spot.isPause ? "🍴" : spotMarkerLabel(spot, index)}</b><span class="journal-plan-stop-copy"><strong>${escapeHtml(spot.name)}</strong><small>${typeLabel} &nbsp; · &nbsp; ${duration} min</small></span><span class="journal-plan-stop-actions"><strong>${timeLabels[index]}</strong><button type="button" data-journal-plan-move="up" data-journal-plan-index="${index}" aria-label="Flytta upp"${index === 0 ? " disabled" : ""}>&uarr;</button><button type="button" data-journal-plan-move="down" data-journal-plan-index="${index}" aria-label="Flytta ner"${index === SPOTS.length - 1 ? " disabled" : ""}>&darr;</button><button type="button" data-journal-plan-edit="${index}" aria-label="Redigera ${escapeHtml(spot.name)}">&#9998;</button><button type="button" data-journal-plan-delete="${index}" aria-label="Ta bort ${escapeHtml(spot.name)}">&#128465;</button></span></article>`; }).join("");
  }
  const highlightTarget = $("#journalReferenceHighlights");
  if (highlightTarget) {
    setText("#journalReferenceHighlightCount", `${HIGHLIGHTS.length} ${HIGHLIGHTS.length === 1 ? "highlight" : "highlights"}`);
    highlightTarget.hidden = false;
    highlightTarget.innerHTML = HIGHLIGHTS.length
      ? HIGHLIGHTS.map((highlight, index) => `<button type="button" class="journal-highlight-list-item" data-journal-highlight-index="${index}"><b class="journal-highlight-list-icon"><span aria-hidden="true">&#9875;</span></b><span><strong>${escapeHtml(highlight.name || "Båtramp")}</strong><small>Passagepunkt · ${escapeHtml(highlight.coordinates || "-")}</small></span><i aria-hidden="true">&rsaquo;</i></button>`).join("")
      : `<p class="journal-highlight-empty">Inga båtramper eller andra highlights i planen ännu.</p>`;
  }
  if (timelineTarget) {
    timelineTarget.innerHTML = SPOTS.map((spot, index) => `<button type="button" class="${index === plannerState.activeSpot ? "is-active" : ""}" data-journal-spot-index="${index}"><b>${index + 1}</b><span><strong>${timeLabels[index]}</strong><small>${index === 0 ? "Björkviks brygga" : index === 1 ? "Körtid till Krokviken" : index === 2 ? "Landholmsviken" : "Södra grundet"}</small></span><em>${index === 0 ? "1 h 30 min" : index === 1 ? "1 h 15 min" : index === 2 ? "1 h 15 min" : "1 h"}</em></button>`).join("");
  }
}

function selectSpot(index, moveMap = false, showPinInfo = false) {
  journalMapPinInfoIndex = null;
  updateJournalMapPinInfo();
  plannerState.activeSpot = Math.min(SPOTS.length - 1, Math.max(0, Number(index) || 0));
  persistPlannerState();
  renderSpot();
  if (showPinInfo) {
    if (window.matchMedia("(max-width: 680px)").matches) {
      renderMobilePinInfo(plannerState.activeSpot);
    } else {
      const view = $("#journalView");
      view?.classList.remove("journal-mobile-places-open", "journal-mobile-plans-open", "journal-mobile-info-open");
      view?.classList.add("journal-mobile-editor-open");
    }
  }
  if (moveMap && journalMap) {
    const isMobile = window.matchMedia("(max-width: 680px)").matches;
    journalMap.easeTo({ center: SPOTS[plannerState.activeSpot].lngLat, zoom: isMobile ? 13 : 12, duration: 450, essential: true });
    window.requestAnimationFrame(() => { updateJournalRouteMode(); renderRouteOverlay(); });
  }
}

function activateAddDestinationMode() {
  ensureJournalMap();
  const view = $("#journalView");
  view?.classList.remove("journal-mobile-places-open", "journal-mobile-plans-open", "journal-mobile-editor-open", "journal-mobile-info-open", "journal-mobile-pin-info-open", "journal-mobile-menu-open");
  $("#journalMobilePinInfo")?.setAttribute("hidden", "hidden");
  journalMapPinInfoIndex = null;
  updateJournalMapPinInfo();
  $("#journalPlanPicker")?.setAttribute("hidden", "hidden");
  $("#journalQuickPlansReference")?.setAttribute("hidden", "hidden");
  $("#journalCreatePlanDialog")?.setAttribute("hidden", "hidden");
  $("#journalDestinationDialog")?.setAttribute("hidden", "hidden");
  $("#journalPauseDialog")?.setAttribute("hidden", "hidden");
  journalAddDestinationMode = true;
  journalMarkerMoveMode = false;
  journalEditingSpotIndex = null;
  journalPendingDestination = null;
  journalQuickBoatMode = false;
  view?.classList.remove("is-destination-form-open");
  view?.classList.remove("is-move-marker-mode");
  const transport = $("#journalDialogTransport");
  if (transport) transport.value = "car";
  updateDestinationDialogFields();
  $("#journalDestinationQuickActions")?.removeAttribute("hidden");
  $("#journalView")?.classList.add("is-add-destination-mode");
  $(".journal-reference-map-panel")?.classList.add("is-focus-mode");
  $("#journalMapReferenceHint")?.classList.add("is-add-mode");
  setText("#journalMapReferenceHint strong", "Skapa ny plats");
  setText("#journalMapReferenceHint span", "Klicka på kartan där pinnen ska placeras");
  setText("#journalDestinationDialog .journal-dialog-heading strong", "Ny plats");
  $("#journalDestinationQuickActions")?.setAttribute("hidden", "hidden");
  showPlannerStatus("Klicka pa kartan for att lagga till plats");
}

function openPauseDialog() {
  if (!journalPendingDestination) {
    showPlannerStatus("Klicka först på kartan för att välja pausplats");
    return;
  }
  $("#journalDestinationDialog")?.setAttribute("hidden", "hidden");
  const dialog = $("#journalPauseDialog");
  if (dialog) dialog.hidden = false;
  $("#journalPauseTitle")?.focus();
}

function closePauseDialog(showDestination = true) {
  const dialog = $("#journalPauseDialog");
  if (dialog) dialog.hidden = true;
  if (showDestination && journalPendingDestination) {
    const destinationDialog = $("#journalDestinationDialog");
    if (destinationDialog) destinationDialog.hidden = false;
    $("#journalDialogName")?.focus();
  }
}

function addPauseFromDialog(event) {
  event.preventDefault();
  if (!journalPendingDestination) return;
  const title = $("#journalPauseTitle")?.value.trim() || "Lunchpaus";
  const durationMinutes = Math.max(5, Number($("#journalPauseDuration")?.value || 30));
  const notes = $("#journalPauseNotes")?.value.trim() || "Paus inlagd i planen.";
  const [lng, lat] = journalPendingDestination;
  const pause = { name: title, area: "Pausplats vald på kartan", coordinates: lat.toFixed(4) + ", " + lng.toFixed(4), lngLat: [lng, lat], pinColorIndex: SPOTS.length % JOURNAL_PIN_COLORS.length, time: durationMinutes + " min", shortTime: "Paus", priority: "Medel", method: "Lunch", wind: "-", depth: "-", notes, image: "/bigplus/assets/catch-page/scene-9.png", type: "pause", isPause: true, durationMinutes, travelMode: journalTransport, target: "Paus", checklist: ["Planera lunch", "Ta med dryck", "Kontrollera tid", "Städa platsen", "Fortsätt turen"] };
  SPOTS.push(pause);
  plannerState.activeSpot = SPOTS.length - 1;
  plannerState.checks[plannerState.activeSpot] = [false, false, false, false, false];
  persistPlannerStops();
  closePauseDialog(false);
  closeDestinationDialog();
  rebuildJournalMarkers();
  renderSpot();
  updateJournalRouteMode();
  scheduleCalculatedTransportRoute();
  $("#journalPauseTitle").value = "";
  showPlannerStatus(title + " är tillagd som paus");
}

function openCreatePlanDialog() {
  setJournalMode("create", false);
  const dialog = $("#journalCreatePlanDialog");
  if (dialog) { dialog.hidden = false; const date = $("#journalCreatePlanDate"); if (date) date.value = localDateValue(); $("#journalCreatePlanTitle")?.focus(); }
}

function closeCreatePlanDialog() {
  const dialog = $("#journalCreatePlanDialog");
  if (dialog) dialog.hidden = true;
  setJournalMode("edit", false);
}

function createPlanFromDialog(event) {
  event.preventDefault();
  const title = $("#journalCreatePlanTitle")?.value.trim();
  if (!title) return;
  const planDate = $("#journalCreatePlanDate")?.value || localDateValue();
  saveCurrentPlanToLibrary();
  const planId = "plan-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  plannerState = { activeSpot: 0, favorites: [], checks: {}, ratings: [5, 5, 5, 3], started: false, savedAt: new Date().toISOString(), notes: "", fields: { planId, planTitle: title, planDate, stops: [], highlights: [], mode: "edit", transport: "car", startTime: "08:30" } };
  SPOTS = [];
  HIGHLIGHTS = [];
  journalBoatRouteCoordinates = [];
  journalCarRouteCoordinates = [];
  persistPlannerState();
  $("#journalCreatePlanDialog")?.setAttribute("hidden", "hidden");
  setJournalMode("edit", false);
  const planTitle = $("#journalReferencePlanTitle");
  if (planTitle) planTitle.innerHTML = `&#128506; ${escapeHtml(title)}`;
  activateAddDestinationMode();
  rebuildJournalMarkers();
  renderSpot();
  updateJournalRouteMode();
  showPlannerStatus(`${title} är skapad. Klicka på kartan för första destinationen.`);
}

function closeDestinationDialog() {
  journalMarkerMoveMode = false;
  journalPendingDestination = null;
  journalEditingSpotIndex = null;
  journalEditingHighlightIndex = null;
  journalMarkerActionMode = null;
  journalAddDestinationMode = false;
  journalQuickBoatMode = false;
  $("#journalView")?.classList.remove("is-destination-form-open");
  $("#journalView")?.classList.remove("is-add-destination-mode");
  $("#journalView")?.classList.remove("is-move-marker-mode");
  $(".journal-reference-map-panel")?.classList.remove("is-focus-mode");
  $(".journal-reference-map-panel")?.classList.remove("is-move-marker-mode");
  const dialog = $("#journalDestinationDialog");
  if (dialog) dialog.hidden = true;
  $("#journalDestinationQuickActions")?.setAttribute("hidden", "hidden");
  $("#journalPauseDialog")?.setAttribute("hidden", "hidden");
  $("#journalMapReferenceHint")?.classList.remove("is-add-mode");
  setText("#journalMapReferenceHint strong", "Planera nästa plats");
  setText("#journalMapReferenceHint span", "Tryck på Lägg till plats och klicka sedan på kartan");
  setText("#journalDestinationDialog .journal-dialog-heading strong", "Ny plats");
}

function closeJournalMobilePanels() {
  const view = $("#journalView");
  const destination = $("#journalDestinationDialog");
  const pause = $("#journalPauseDialog");
  if (destination && !destination.hidden) closeDestinationDialog();
  else if (pause && !pause.hidden) closeDestinationDialog();
  const create = $("#journalCreatePlanDialog");
  if (create && !create.hidden) closeCreatePlanDialog();
  view?.classList.remove("journal-mobile-places-open", "journal-mobile-plans-open", "journal-mobile-editor-open", "journal-mobile-edit-mode", "journal-mobile-info-open", "journal-mobile-pin-info-open");
  $("#journalMobilePinInfo")?.setAttribute("hidden", "hidden");
  $("#journalPlanPicker")?.setAttribute("hidden", "hidden");
  journalMapPinInfoIndex = null;
  updateJournalMapPinInfo();
}

function activateMoveMarkerMode() {
  if (!journalMap) return;
  const index = journalEditingSpotIndex != null ? journalEditingSpotIndex : (SPOTS[plannerState.activeSpot] ? plannerState.activeSpot : null);
  if ((index == null || !SPOTS[index]) && !journalPendingDestination) {
    showPlannerStatus("Välj först en plats på kartan");
    return;
  }
  if (index != null && SPOTS[index]) journalEditingSpotIndex = index;
  journalEditingHighlightIndex = null;
  journalMarkerActionMode = null;
  journalMarkerMoveMode = true;
  journalAddDestinationMode = false;
  journalQuickBoatMode = false;
  journalPendingDestination = index != null && SPOTS[index] ? [...SPOTS[index].lngLat] : [...journalPendingDestination];
  const view = $("#journalView");
  view?.classList.remove("journal-mobile-places-open", "journal-mobile-plans-open", "journal-mobile-editor-open", "journal-mobile-info-open", "journal-mobile-pin-info-open", "journal-mobile-menu-open");
  view?.classList.remove("is-add-destination-mode");
  $("#journalMobilePinInfo")?.setAttribute("hidden", "hidden");
  $("#journalPlanPicker")?.setAttribute("hidden", "hidden");
  journalMapPinInfoIndex = null;
  updateJournalMapPinInfo();
  $("#journalQuickPlansReference")?.setAttribute("hidden", "hidden");
  $("#journalCreatePlanDialog")?.setAttribute("hidden", "hidden");
  $("#journalDestinationDialog")?.setAttribute("hidden", "hidden");
  $("#journalPauseDialog")?.setAttribute("hidden", "hidden");
  $("#journalView")?.classList.add("is-move-marker-mode");
  $(".journal-reference-map-panel")?.classList.add("is-move-marker-mode");
  setText("#journalMapReferenceHint strong", "Flyttar markör");
  setText("#journalMapReferenceHint span", "Klicka på den nya platsen och spara planen längst ner");
  $("#journalMapReferenceHint")?.classList.add("is-add-mode");
  showPlannerStatus("Klicka på kartan där markören ska ligga");
}

function activateMoveHighlightMode(index) {
  const highlight = HIGHLIGHTS[index];
  if (!highlight || !journalMap) return;
  journalEditingHighlightIndex = index;
  journalEditingSpotIndex = null;
  journalMarkerActionMode = null;
  journalMarkerMoveMode = true;
  journalAddDestinationMode = false;
  journalQuickBoatMode = false;
  journalPendingDestination = [...highlight.lngLat];
  const view = $("#journalView");
  view?.classList.remove("journal-mobile-places-open", "journal-mobile-plans-open", "journal-mobile-editor-open", "journal-mobile-info-open", "journal-mobile-pin-info-open", "journal-mobile-menu-open", "is-add-destination-mode");
  $("#journalMobilePinInfo")?.setAttribute("hidden", "hidden");
  $("#journalDestinationDialog")?.setAttribute("hidden", "hidden");
  view?.classList.add("is-move-marker-mode");
  $(".journal-reference-map-panel")?.classList.add("is-move-marker-mode");
  setText("#journalMapReferenceHint strong", "Flyttar highlight");
  setText("#journalMapReferenceHint span", "Klicka på den nya platsen och spara");
  $("#journalMapReferenceHint")?.classList.add("is-add-mode");
  showPlannerStatus("Klicka på kartan där highlighten ska ligga");
}

function addDestinationFromDialog(event) {
  event.preventDefault();
  if (!journalPendingDestination) return;
  const wasEditing = journalEditingSpotIndex != null;
  const wasEditingHighlight = journalEditingHighlightIndex != null && Boolean(HIGHLIGHTS[journalEditingHighlightIndex]);
  const name = $("#journalDialogName")?.value.trim() || "Ny fiskespot";
  const type = $("#journalDialogType")?.value || "fishing";
  const durationMinutes = Number($("#journalDialogDuration")?.value || 45);
  const selectedTransport = $("#journalDialogTransport")?.value || "car";
  const boatType = $("#journalDialogBoatType")?.value || "";
  const motor = $("#journalDialogMotor")?.value || "";
  const target = $("#journalDialogTarget")?.value || "";
  const [lng, lat] = journalPendingDestination;
  const spot = { name, area: "Vald pa kartan", coordinates: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lngLat: [lng, lat], pinColorIndex: journalEditingSpotIndex != null && SPOTS[journalEditingSpotIndex] ? SPOTS[journalEditingSpotIndex].pinColorIndex : SPOTS.length % JOURNAL_PIN_COLORS.length, time: `${durationMinutes} min`, shortTime: "Ny", priority: "Medel", method: "Planeras", wind: "-", depth: "-", notes: "Ny destination tillagd fran kartan.", image: "/bigplus/assets/catch-page/scene-9.png", type, durationMinutes, travelMode: selectedTransport, boatType, motor, target, checklist: ["Bekrafta plats", "Kontrollera vader", "Valj metod", "Foto och logga resultat", "Notera resultat"], isBoatBase: type === "boat_ramp", isBoatPlace: selectedTransport === "boat" && type !== "boat_ramp", isWater: selectedTransport === "boat" || type === "boat_ramp", routeMode: selectedTransport };
  if (journalQuickBoatMode || type === "boat_ramp") {
    spot.type = "boat_ramp";
    spot.isBoatBase = true;
    spot.isWater = true;
  }
  const isHighlight = spot.isBoatBase === true;
  if (isHighlight) {
    const routeOrder = wasEditingHighlight ? HIGHLIGHTS[journalEditingHighlightIndex].routeOrder : nextHighlightRouteOrder();
    if (wasEditingHighlight) HIGHLIGHTS[journalEditingHighlightIndex] = normalizeHighlight({ ...HIGHLIGHTS[journalEditingHighlightIndex], ...spot, routeOrder }, journalEditingHighlightIndex, routeOrder);
    else HIGHLIGHTS.push(normalizeHighlight({ ...spot, routeOrder }, HIGHLIGHTS.length, routeOrder));
    plannerState.activeSpot = Math.min(plannerState.activeSpot, Math.max(0, SPOTS.length - 1));
  } else if (journalEditingSpotIndex != null && SPOTS[journalEditingSpotIndex]) {
    SPOTS[journalEditingSpotIndex] = { ...SPOTS[journalEditingSpotIndex], ...spot, shortTime: SPOTS[journalEditingSpotIndex].shortTime || "Ny" };
    plannerState.activeSpot = journalEditingSpotIndex;
  } else {
    const routeOrder = plannerRouteNodes().reduce((highest, node) => Math.max(highest, Number(node.order) || 0), -1) + 1;
    SPOTS.push({ ...spot, routeOrder });
    plannerState.activeSpot = SPOTS.length - 1;
  }
  if (!isHighlight) plannerState.checks[plannerState.activeSpot] = [false, false, false, false, false];
  persistPlannerStops();
  closeDestinationDialog();
  rebuildJournalMarkers();
  renderSpot();
  journalTransport = selectedTransport === "boat" ? "boat" : "car";
  journalCarTravelMode = selectedTransport === "walk" ? "walk" : "car";
  plannerState.fields.transport = journalTransport;
  plannerState.fields.transportVersion = 2;
  persistPlannerStops();
  updateJournalRouteMode();
  scheduleCalculatedTransportRoute();
  showPlannerStatus(`${name} ${isHighlight ? (wasEditingHighlight ? "är uppdaterad" : "är tillagd som highlight") : wasEditing ? "är uppdaterad" : "är tillagd"} i planen`);
}

function openDestinationEditor(index) {
  const spot = SPOTS[index];
  if (!spot) return;
  journalEditingSpotIndex = index;
  journalEditingHighlightIndex = null;
  journalMarkerActionMode = null;
  journalQuickBoatMode = false;
  journalPendingDestination = [...spot.lngLat];
  journalAddDestinationMode = false;
  const view = $("#journalView");
  view?.classList.remove("is-destination-form-open", "journal-mobile-pin-info-open");
  $("#journalMobilePinInfo")?.setAttribute("hidden", "hidden");
  journalMapPinInfoIndex = null;
  updateJournalMapPinInfo();
  $(".journal-reference-map-panel")?.classList.add("is-focus-mode");
  $("#journalMapReferenceHint")?.classList.add("is-add-mode");
  setText("#journalMapReferenceHint strong", "Redigera plats");
  setText("#journalMapReferenceHint span", "Ändra uppgifterna och spara");
  setText("#journalDestinationDialog .journal-dialog-heading strong", "Redigera plats");
  const values = {
    "#journalDialogName": spot.name,
    "#journalDialogType": spot.type || "fishing",
    "#journalDialogDuration": String(spot.durationMinutes || 45),
    "#journalDialogTransport": spot.travelMode || (spot.type === "boat_ramp" ? "boat" : "car"),
    "#journalDialogBoatType": spot.boatType || "Aluminiumbåt",
    "#journalDialogMotor": spot.motor || "40 hk",
    "#journalDialogTarget": spot.target || "Gädda",
  };
  Object.entries(values).forEach(([selector, value]) => { const input = $(selector); if (input) input.value = value; });
  updateDestinationDialogFields();
  const dialog = $("#journalDestinationDialog");
  if (dialog) { dialog.hidden = false; $("#journalDialogName")?.focus(); }
  showPlannerStatus(`Redigerar ${spot.name}`);
}

function openHighlightEditor(index) {
  const highlight = HIGHLIGHTS[index];
  if (!highlight) return;
  journalEditingHighlightIndex = index;
  journalEditingSpotIndex = null;
  journalMarkerActionMode = null;
  journalQuickBoatMode = false;
  journalPendingDestination = [...highlight.lngLat];
  journalAddDestinationMode = false;
  const view = $("#journalView");
  view?.classList.remove("journal-mobile-pin-info-open");
  $("#journalMobilePinInfo")?.setAttribute("hidden", "hidden");
  journalMapPinInfoIndex = null;
  updateJournalMapPinInfo();
  $(".journal-reference-map-panel")?.classList.add("is-focus-mode");
  $("#journalMapReferenceHint")?.classList.add("is-add-mode");
  setText("#journalMapReferenceHint strong", "Redigera highlight");
  setText("#journalMapReferenceHint span", "Ändra båtrampens uppgifter och spara");
  setText("#journalDestinationDialog .journal-dialog-heading strong", "Redigera båtramp");
  const values = {
    "#journalDialogName": highlight.name || "Båtramp",
    "#journalDialogType": "boat_ramp",
    "#journalDialogDuration": String(highlight.durationMinutes || 45),
    "#journalDialogTransport": "boat",
    "#journalDialogBoatType": highlight.boatType || "Aluminiumbåt",
    "#journalDialogMotor": highlight.motor || "40 hk",
    "#journalDialogTarget": highlight.target || "Gädda",
  };
  Object.entries(values).forEach(([selector, value]) => { const input = $(selector); if (input) input.value = value; });
  updateDestinationDialogFields();
  const dialog = $("#journalDestinationDialog");
  if (dialog) { dialog.hidden = false; $("#journalDialogName")?.focus(); }
  view?.classList.add("is-destination-form-open");
  showPlannerStatus(`Redigerar ${highlight.name || "Båtramp"}`);
}

function updateDestinationDialogFields() {
  const transport = $("#journalDialogTransport")?.value || "car";
  const type = $("#journalDialogType")?.value || "fishing";
  document.querySelectorAll(".journal-boat-only-field").forEach((field) => { field.hidden = transport !== "boat"; });
  document.querySelectorAll(".journal-fishing-only-field").forEach((field) => { field.hidden = type !== "fishing"; });
}

function setQuickBoatDestination() {
  const type = $("#journalDialogType");
  const transport = $("#journalDialogTransport");
  if (type) type.value = "boat_ramp";
  if (transport) transport.value = "boat";
  journalQuickBoatMode = true;
  updateDestinationDialogFields();
  showPlannerStatus("Platsen markeras som båtbas");
}

function movePlannerStop(index, direction) {
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= SPOTS.length) return;
  [SPOTS[index], SPOTS[nextIndex]] = [SPOTS[nextIndex], SPOTS[index]];
  plannerState.activeSpot = nextIndex;
  persistPlannerStops();
  rebuildJournalMarkers();
  renderSpot();
  scheduleCalculatedTransportRoute();
  showPlannerStatus("Stoppens ordning ar uppdaterad");
}

function renderRatings() {
  document.querySelectorAll("[data-journal-rating]").forEach((target) => {
    const index = Number(target.dataset.journalRating);
    const value = Number(plannerState.ratings[index]) || 0;
    target.innerHTML = Array.from({ length: 5 }, (_, starIndex) => `<button type="button" data-journal-rate="${starIndex + 1}" aria-label="${starIndex + 1} av 5 stjarnor" class="${starIndex < value ? "is-active" : ""}">&#9733;</button>`).join("");
  });
}

function restoreSavedFields() {
  document.querySelectorAll("[data-journal-save]").forEach((input) => { const key = input.dataset.journalSave; if (Object.prototype.hasOwnProperty.call(plannerState.fields, key)) input.checked = Boolean(plannerState.fields[key]); });
  const destination = $("#journalDestinationInput");
  if (destination && plannerState.fields.referenceDestination) destination.value = plannerState.fields.referenceDestination;
  const notes = $("#journalLiveNotes");
  if (notes) notes.value = plannerState.notes;
  const startTime = $("#journalPlanStartTime");
  if (startTime) startTime.value = plannerState.fields.startTime || "08:30";
}

function plannerSummary() {
  const title = plannerState.fields.planTitle || "Min fisketur";
  return [`BIGPLUS - ${title}`, "Datum: 24 maj 2025", "Resl\u00e4ngd: 42 km | Total tid: ca 7 h 15 min", "", ...SPOTS.map((spot, index) => `${index + 1}. ${spot.name} - ${spot.time} - ${spot.method}`), "", `Anteckningar: ${plannerState.notes || "Inga anteckningar"}`].join("\n");
}

function savePlanSnapshot() {
  const wasCreating = journalMode === "create";
  saveCurrentPlanToLibrary();
  const trip = { id: "journal-" + plannerPlanId(), title: plannerState.fields.planTitle || "Min fisketur", date: "2025-05-24", time: "08:30", location: "Nämndöfjärden, Värmdö", species: "Gädda, Abborre, Gös", bait: "Jigging, drop shot och spinnfiske", weather: "16 grader, 7 m/s V", notes: plannerState.notes, planId: plannerPlanId(), stops: SPOTS.length, createdAt: new Date().toISOString() };
  const trips = journalTrips();
  const existing = trips.findIndex((item) => item.id === trip.id);
  if (existing >= 0) trips[existing] = trip; else trips.push(trip);
  saveJournalTrips(trips);
  plannerState.savedAt = new Date().toISOString();
  persistPlannerState();
  if (wasCreating) setJournalMode("edit", false);
  showPlannerStatus(wasCreating ? "Ny fisketur \u00e4r sparad" : "\u00c4ndringarna \u00e4r sparade");
}

function setJournalMode(mode, announce = true) {
  journalMode = mode === "create" ? "create" : "edit";
  plannerState.fields.mode = journalMode;
  persistPlannerState();
  const view = $("#journalView");
  if (view) view.dataset.journalMode = journalMode;
  document.querySelectorAll("[data-journal-mode]").forEach((button) => {
    const active = button.dataset.journalMode === journalMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const creating = journalMode === "create";
  setText("#journalModeTitle", creating ? "Skapa en ny fisketur" : "Redigera din plan");
  setText("#journalModeDescription", creating ? "L\u00e4gg till stopp och bygg rutten steg f\u00f6r steg." : "\u00c4ndra stopp, f\u00e4rds\u00e4tt och m\u00e5l direkt p\u00e5 kartan.");
  setText("#journalDestinationActionLabel", creating ? "L\u00e4gg till f\u00f6rsta plats" : "L\u00e4gg till plats");
  const planTitle = $("#journalReferencePlanTitle");
  if (planTitle) planTitle.innerHTML = creating ? "&#10022; Ny plan" : `&#128506; ${escapeHtml(plannerState.fields.planTitle || "Min färdplan")}`;
  if (announce) showPlannerStatus(creating ? "Skapa Plan \u00e4r aktivt" : "Redigera Plan \u00e4r aktivt");
}

function exportPlan() {
  const blob = new Blob([plannerSummary()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bigplus-fiskeplan-namdo.txt";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showPlannerStatus("Planen har exporterats");
}

async function sharePlan() {
  const text = plannerSummary();
  if (navigator.share) {
    try { await navigator.share({ title: "BIGPLUS fiskeplan", text }); showPlannerStatus("Delningen ar klar"); return; } catch (error) { if (error?.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); showPlannerStatus("Planen ar kopierad"); } catch { showPlannerStatus("Kunde inte dela planen"); }
}

function toggleTripStarted() {
  plannerState.started = !plannerState.started;
  persistPlannerState();
  const label = plannerState.started ? "&#9632; &nbsp; Avsluta resa" : "&#9654; &nbsp; Starta resa";
  [$("#journalStartButton"), $("#journalReferenceStartButton")].filter(Boolean).forEach((button) => { button.innerHTML = label; });
  showPlannerStatus(plannerState.started ? "Resan ar startad" : "Resan ar avslutad");
}

function bindPlannerUi() {
  if (plannerBound) return;
  plannerBound = true;
  document.addEventListener("click", (event) => {
    const element = event.target instanceof Element ? event.target : event.target?.parentElement;
    const control = element?.closest("#journalDesktopCreatePlan, #journalMobileCreatePlan, #journalNewTripButton, #journalDesktopAddPlace, #journalMobileAddStop, #journalReferenceAddStop, #journalAddSpotButton");
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    if (control.matches("#journalDesktopCreatePlan, #journalMobileCreatePlan, #journalNewTripButton")) openCreatePlanDialog();
    else activateAddDestinationMode();
  }, true);
  document.querySelectorAll("[data-journal-mode]").forEach((button) => button.addEventListener("click", () => { if (button.dataset.journalMode === "create") openCreatePlanDialog(); else setJournalMode("edit"); }));
  $("#journalTimeline")?.addEventListener("click", (event) => { const button = event.target.closest("[data-journal-spot-index]"); if (button) selectSpot(Number(button.dataset.journalSpotIndex), true); });
  $("#journalReferenceTimeline")?.addEventListener("click", (event) => { const button = event.target.closest("[data-journal-spot-index]"); if (button) selectSpot(Number(button.dataset.journalSpotIndex), true); });
  $("#journalSpotInfoList")?.addEventListener("click", (event) => {
    const move = event.target.closest("[data-journal-info-move]");
    if (move) {
      movePlannerStop(Number(move.dataset.journalInfoIndex), move.dataset.journalInfoMove === "up" ? -1 : 1);
      event.stopPropagation();
      return;
    }
    const edit = event.target.closest("[data-journal-info-edit]");
    if (edit) {
      const index = Number(edit.dataset.journalInfoEdit);
      selectSpot(index, true, false);
      $("#journalView")?.classList.remove("journal-mobile-places-open");
      $("#journalView")?.classList.add("journal-mobile-editor-open");
      event.stopPropagation();
      return;
    }
    const item = event.target.closest("[data-journal-info-index]");
    if (item) {
      const index = Number(item.dataset.journalInfoIndex);
      if (journalMarkerActionMode) { handleMarkerAction("spot", index); return; }
      selectSpot(index, true, false);
    }
  });
  $("#journalReferencePlanStops")?.addEventListener("click", (event) => {
    const stop = event.target.closest("[data-journal-reference-spot]");
    if (!stop) return;
    const index = Number(stop.dataset.journalReferenceSpot);
    const move = event.target.closest("[data-journal-plan-move]");
    if (move) { movePlannerStop(index, move.dataset.journalPlanMove === "up" ? -1 : 1); return; }
    if (event.target.closest("[data-journal-plan-delete]")) {
      const removed = SPOTS.splice(index, 1)[0];
      if (!SPOTS.length) { SPOTS.push({ name: "Ny fiskespot", area: "Vald pa kartan", coordinates: "59.2700, 18.6600", lngLat: [18.66, 59.27], time: "45 min", shortTime: "Ny", priority: "Medel", method: "Planeras", wind: "-", depth: "-", notes: "Lagg till detaljer for platsen.", image: "/bigplus/assets/catch-page/scene-9.png", type: "fishing", durationMinutes: 45, checklist: ["Bekrafta plats", "Kontrollera vader", "Valj metod", "Foto och logga resultat", "Notera resultat"] }); }
      plannerState.activeSpot = Math.min(plannerState.activeSpot, SPOTS.length - 1);
      persistPlannerStops(); rebuildJournalMarkers(); renderSpot(); scheduleCalculatedTransportRoute(); showPlannerStatus(`${removed?.name || "Stoppet"} ar borttagen`); return;
    }
    if (event.target.closest("[data-journal-plan-edit]")) { selectSpot(index, false); openDestinationEditor(index); return; }
    selectSpot(index, true);
  });
  $("#journalReferenceHighlights")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-journal-highlight-index]");
    if (!button || !journalMap) return;
    const highlight = HIGHLIGHTS[Number(button.dataset.journalHighlightIndex)];
    if (!highlight) return;
    if (journalMarkerActionMode) { handleMarkerAction("highlight", Number(button.dataset.journalHighlightIndex)); return; }
    journalMap.flyTo({ center: highlight.lngLat, zoom: Math.max(journalMap.getZoom(), 12.5), duration: 450, essential: true });
    showPlannerStatus(`${highlight.name || "Båtplats"} är vald som passagepunkt`);
  });
  $("#journalSpotChecklist")?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-journal-check]");
    if (!input) return;
    const index = plannerState.activeSpot;
    const values = Array.isArray(plannerState.checks[index]) ? [...plannerState.checks[index]] : [...DEFAULT_CHECKS[index]];
    values[Number(input.dataset.journalCheck)] = input.checked;
    plannerState.checks[index] = values;
    persistPlannerState();
    renderChecklist(index);
  });
  $("#journalMapTabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-journal-layer]");
    if (!button) return;
    $("#journalMapTabs")?.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    $(".journal-map-stage")?.setAttribute("data-layer", button.dataset.journalLayer);
    showPlannerStatus(`${button.textContent.trim()} visas pa kartan`);
  });
  $("#journalReferenceMapTabs")?.addEventListener("click", (event) => { const button = event.target.closest("[data-journal-reference-layer]"); if (!button) return; $("#journalReferenceMapTabs")?.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button)); $(".journal-reference-map-panel")?.setAttribute("data-reference-layer", button.dataset.journalReferenceLayer); showPlannerStatus(`${button.textContent.trim()} visas pa kartan`); });
  const quickLayerIds = { boat_ramps: ["journal-poi-boat-ramp"], parking: ["journal-poi-parking"], restaurant: ["journal-poi-restaurant"], camping: ["journal-poi-camping"], fuel: ["journal-poi-fuel"] };
  document.querySelectorAll("[data-journal-quick-layer]").forEach((button) => button.addEventListener("click", () => { button.classList.toggle("active"); const visible = button.classList.contains("active") ? "visible" : "none"; (quickLayerIds[button.dataset.journalQuickLayer] || []).forEach((layerId) => { if (journalMap?.getLayer(layerId)) journalMap.setLayoutProperty(layerId, "visibility", visible); }); showPlannerStatus(`${button.textContent.trim()} ${button.classList.contains("active") ? "visas" : "dold"} pa kartan`); }));
  $("#journalZoomIn")?.addEventListener("click", () => journalMap?.zoomIn());
  $("#journalZoomOut")?.addEventListener("click", () => journalMap?.zoomOut());
  $("#journalFitRoute")?.addEventListener("click", fitJournalRoute);
  $("#journalReferenceZoomIn")?.addEventListener("click", () => journalMap?.zoomIn());
  $("#journalReferenceZoomOut")?.addEventListener("click", () => journalMap?.zoomOut());
  $("#journalReferenceFitRoute")?.addEventListener("click", fitJournalRoute);
  $("#journalFavoriteSpot")?.addEventListener("click", () => { const index = plannerState.activeSpot; plannerState.favorites = plannerState.favorites.includes(index) ? plannerState.favorites.filter((item) => item !== index) : [...plannerState.favorites, index]; persistPlannerState(); renderSpot(); });
  $("#journalCloseSpot")?.addEventListener("click", () => $(".journal-primary-grid")?.classList.toggle("is-spot-hidden"));
  document.querySelectorAll("[data-journal-save]").forEach((input) => input.addEventListener("change", () => { plannerState.fields[input.dataset.journalSave] = input.checked; persistPlannerState(); }));
  $("#journalLiveNotes")?.addEventListener("input", (event) => { plannerState.notes = event.target.value; persistPlannerState(); });
  $("#journalRatingList")?.addEventListener("click", (event) => {
    const star = event.target.closest("[data-journal-rate]");
    const row = star?.closest("[data-journal-rating]");
    if (!star || !row) return;
    plannerState.ratings[Number(row.dataset.journalRating)] = Number(star.dataset.journalRate);
    persistPlannerState();
    renderRatings();
  });
  $("#journalSaveButton")?.addEventListener("click", savePlanSnapshot);
  $("#journalExportButton")?.addEventListener("click", exportPlan);
  $("#journalShareButton")?.addEventListener("click", sharePlan);
  $("#journalStartButton")?.addEventListener("click", toggleTripStarted);
  ["#journalInviteButton", "#journalManagePackButton", "#journalTipsButton", "#journalEditGoalsButton", "#journalManagePlanButton", "#journalAddPhotoButton", "#journalLessonsButton"].forEach((selector) => { $(selector)?.addEventListener("click", () => showPlannerStatus("Funktionen ar redo for din plan")); });
  $("#journalReferenceStartButton")?.addEventListener("click", toggleTripStarted);
  $("#journalReferenceSaveButton")?.addEventListener("click", savePlanSnapshot);
  $("#journalReferenceShareButton")?.addEventListener("click", sharePlan);
  $("#journalResetRoute")?.addEventListener("click", () => { plannerState.activeSpot = 0; plannerState.fields.referenceDestination = ""; persistPlannerState(); const input = $("#journalDestinationInput"); if (input) input.value = ""; renderSpot(); if (journalMap) fitJournalRoute(); showPlannerStatus("Rutten ar rensad"); });
  $("#journalRecommendedTime")?.addEventListener("click", () => { const select = $("#journalStayTime"); if (select) select.value = "45 min"; showPlannerStatus("Rekommenderad tid: 45 min"); });
  ["#journalAddGoalButton", "#journalReferencePackButton", "#journalGoalPike", "#journalReferenceAddTourGoal", "#journalReferenceNotesButton"].forEach((selector) => { $(selector)?.addEventListener("click", () => showPlannerStatus("Funktionen ar redo for din plan")); });
  $("#journalSwitchPlanButton")?.addEventListener("click", () => {
    const picker = $("#journalPlanPicker");
    if (!picker) return;
    if (picker.hidden) { renderPlanPicker(); picker.hidden = false; } else picker.hidden = true;
  });
  const handlePlanOptionClick = (event) => {
    const option = event.target.closest("[data-journal-plan-id]");
    if (option) switchPlan(option.dataset.journalPlanId);
  };
  $("#journalSelectedPlanSummary")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const summary = $("#journalSelectedPlanSummary");
    const panel = $("#journalQuickPlansReference");
    if (!summary || !panel) return;
    const open = panel.hidden;
    renderPlanPicker();
    panel.hidden = !open;
    summary.setAttribute("aria-expanded", String(open));
  });
  $("#journalPlanOptions")?.addEventListener("click", handlePlanOptionClick);
  $("#journalQuickPlanOptions")?.addEventListener("click", handlePlanOptionClick);
  $("#journalPlanDate")?.addEventListener("change", (event) => {
    plannerState.fields.planDate = event.target.value || localDateValue();
    persistPlannerState();
    renderPlanPicker();
    showPlannerStatus(`Datum sparat: ${formatPlanDate(plannerState.fields.planDate)}`);
  });
  $("#journalPlanPickerClose")?.addEventListener("click", () => $("#journalPlanPicker")?.setAttribute("hidden", "hidden"));
  $("#journalMobileFocus")?.addEventListener("click", fitJournalRoute);
  $("#journalMobileStopTab")?.addEventListener("click", () => {
    const view = $("#journalView");
    if (!view) return;
    const open = !view.classList.contains("journal-mobile-places-open");
    view.classList.toggle("journal-mobile-places-open", open);
    view.classList.remove("journal-mobile-editor-open");
  });
  $("#journalMobilePinInfoPrev")?.addEventListener("click", () => {
    if (plannerState.activeSpot > 0) selectSpot(plannerState.activeSpot - 1, true, true);
  });
  $("#journalMobilePinInfoNext")?.addEventListener("click", () => {
    if (plannerState.activeSpot < SPOTS.length - 1) selectSpot(plannerState.activeSpot + 1, true, true);
  });
  $("#journalMobileMenuToggle")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const view = $("#journalView");
    const toggle = $("#journalMobileMenuToggle");
    if (!view) return;
    const open = view.classList.toggle("journal-mobile-menu-open");
    toggle?.setAttribute("aria-expanded", String(open));
    toggle?.setAttribute("aria-label", open ? "Stäng fisketursmenyn" : "Öppna fisketursmenyn");
    if (open) fitJournalRoute();
  });
  document.querySelectorAll("[data-journal-mobile-close]").forEach((button) => button.addEventListener("click", closeJournalMobilePanels));
  document.addEventListener("click", (event) => {
    const view = $("#journalView");
    if (!view || view.hidden) return;
    if (journalMapPinInfoIndex != null && !event.target.closest(".journal-place-label, .journal-map-pin-actions")) {
      journalMapPinInfoIndex = null;
      updateJournalMapPinInfo();
    }
    const quickPlans = $("#journalQuickPlansReference");
    if (quickPlans && !quickPlans.hidden && !event.target.closest(".journal-selected-plan-summary, .journal-quick-plans-reference")) {
      quickPlans.hidden = true;
      $("#journalSelectedPlanSummary")?.setAttribute("aria-expanded", "false");
    }
    const openClasses = ["journal-mobile-places-open", "journal-mobile-plans-open", "journal-mobile-editor-open", "journal-mobile-edit-mode", "journal-mobile-info-open", "journal-mobile-pin-info-open"];
    const popups = ["#journalCreatePlanDialog", "#journalDestinationDialog", "#journalPauseDialog"].map((selector) => $(selector)).filter((popup) => popup && !popup.hidden);
    if (!openClasses.some((className) => view.classList.contains(className)) && !popups.length) return;
    if (event.target.closest(".journal-mobile-menu-toggle, .journal-mobile-side-menu, .journal-mobile-action-rail, .journal-mobile-pin-info, .journal-map-pin-actions, .journal-selected-plan-summary, .journal-quick-plans-reference, .journal-spot-info-list-reference, .journal-spot-info-reference, .journal-plan-reference, .journal-place-label, .journal-reference-map-panel, .journal-create-plan-dialog, .journal-destination-dialog, .journal-pause-dialog")) return;
    closeJournalMobilePanels();
  });
  $(".journal-mobile-side-menu")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-journal-mobile-panel]");
    if (!button || button.disabled) return;
    const view = $("#journalView");
    if (!view) return;
    const panel = button.dataset.journalMobilePanel;
    const panelClass = panel === "edit" ? "journal-mobile-edit-mode" : `journal-mobile-${panel}-open`;
    const alreadyOpen = view.classList.contains(panelClass);
    view.classList.remove("journal-mobile-places-open", "journal-mobile-plans-open", "journal-mobile-editor-open", "journal-mobile-info-open");
    view.classList.remove("journal-mobile-edit-mode");
    if (alreadyOpen && panel !== "position") {
      if (panel === "plans") $("#journalPlanPicker")?.setAttribute("hidden", "hidden");
      return;
    }
    if (panel === "places") view.classList.add("journal-mobile-places-open");
    if (panel === "plans") {
      view.classList.add("journal-mobile-plans-open");
      const picker = $("#journalPlanPicker");
      if (picker) { renderPlanPicker(); picker.hidden = false; }
    }
    if (panel === "info") {
      view.classList.add("journal-mobile-info-open");
      view.classList.remove("journal-mobile-menu-open");
      $("#journalMobileMenuToggle")?.setAttribute("aria-expanded", "false");
      $("#journalMobileMenuToggle")?.setAttribute("aria-label", "Öppna fisketursmenyn");
    }
    if (panel === "edit") {
      view.classList.add("journal-mobile-edit-mode");
      showPlannerStatus("Tryck på en plats för att redigera");
    } else if (panel !== "position") {
      view.classList.remove("journal-mobile-edit-mode");
    }
    if (panel === "position") {
      view.classList.remove("journal-mobile-edit-mode");
      centerJournalOnPosition();
    }
  });
  $("#journalAddDestinationButton")?.addEventListener("click", activateAddDestinationMode);
  $("#journalSelectedSpotForm")?.addEventListener("submit", saveSelectedSpotForm);
  $("#journalInfoEditTransport")?.addEventListener("change", (event) => { const motorField = $("#journalInfoEditMotorField"); if (motorField) motorField.hidden = event.target.value !== "boat"; });
  $("#journalInfoMoveMarkerButton")?.addEventListener("click", activateMoveMarkerMode);
  $("#journalInfoEditMarkerButton")?.addEventListener("click", () => openDestinationEditor(plannerState.activeSpot));
  $("#journalInfoBoatMarkerButton")?.addEventListener("click", () => toggleSelectedSpotBoatMarker(plannerState.activeSpot));
  $("#journalMapPinActionEdit")?.addEventListener("click", () => activateMarkerActionMode("edit"));
  $("#journalMapPinActionMove")?.addEventListener("click", () => activateMarkerActionMode("move"));
  $("#journalMapPinActionBoat")?.addEventListener("click", () => activateMarkerActionMode("boat"));
  $("#journalMapPinActionCar")?.addEventListener("click", () => activateMarkerActionMode("car"));
  $("#journalMapPinActionDelete")?.addEventListener("click", () => activateMarkerActionMode("delete"));
  $("#journalPlanStartTime")?.addEventListener("change", (event) => { plannerState.fields.startTime = event.target.value || "08:30"; persistPlannerState(); renderReferencePlan(); updateJournalMarkerLabels(); showPlannerStatus("Starttiden är uppdaterad"); });
  $("#journalDestinationDialog")?.addEventListener("submit", addDestinationFromDialog);
  $("#journalDestinationDialogClose")?.addEventListener("click", closeDestinationDialog);
  $("#journalDestinationDialogCancel")?.addEventListener("click", closeDestinationDialog);
  $("#journalMoveMarkerButton")?.addEventListener("click", activateMoveMarkerMode);
  $("#journalQuickPause")?.addEventListener("click", openPauseDialog);
  $("#journalQuickBoat")?.addEventListener("click", setQuickBoatDestination);
  $("#journalPauseDialog")?.addEventListener("submit", addPauseFromDialog);
  $("#journalPauseDialogClose")?.addEventListener("click", () => closePauseDialog());
  $("#journalPauseDialogCancel")?.addEventListener("click", () => closePauseDialog());
  $("#journalCreatePlanDialog")?.addEventListener("submit", createPlanFromDialog);
  $("#journalCreatePlanCancel")?.addEventListener("click", closeCreatePlanDialog);
  $("#journalCreatePlanCancelSecondary")?.addEventListener("click", closeCreatePlanDialog);
  $("#journalDialogTransport")?.addEventListener("change", updateDestinationDialogFields);
  $("#journalDialogType")?.addEventListener("change", updateDestinationDialogFields);
  $(".journal-notes-actions")?.addEventListener("click", (event) => { const button = event.target.closest("[data-journal-note-action]"); if (button) showPlannerStatus("Funktionen ar redo for din plan"); });
  $("#journalNextStopButton")?.addEventListener("click", () => selectSpot((plannerState.activeSpot + 1) % SPOTS.length, true));
  document.querySelectorAll("[data-journal-transport]").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll("[data-journal-transport]").forEach((item) => item.classList.toggle("active", item === button)); journalTransport = button.dataset.journalTransport === "car" ? "car" : "boat"; plannerState.fields.transport = journalTransport; plannerState.fields.transportVersion = 2; persistPlannerState(); updateJournalRouteMode(); scheduleCalculatedTransportRoute(); fitJournalRoute(); showPlannerStatus(journalTransport === "boat" ? "Batrutten foljer vatten" : "Bilrutten foljer vagar"); }));
  document.querySelectorAll("[data-journal-priority]").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll("[data-journal-priority]").forEach((item) => item.classList.toggle("active", item === button)); }));
}

export function renderJournal() {
  bindPlannerUi();
  $("#journalView")?.classList.remove("journal-mobile-places-open", "journal-mobile-plans-open", "journal-mobile-editor-open", "journal-mobile-edit-mode", "journal-mobile-info-open", "journal-mobile-pin-info-open", "journal-mobile-menu-open");
  $("#journalMobilePinInfo")?.setAttribute("hidden", "hidden");
  $("#journalMobileMenuToggle")?.setAttribute("aria-expanded", "false");
  restoreSavedFields();
  setJournalMode(journalMode, false);
  document.querySelectorAll("[data-journal-transport]").forEach((button) => button.classList.toggle("active", button.dataset.journalTransport === journalTransport));
  updateJournalRouteMode();
  renderSpot();
  renderRatings();
  const startButton = $("#journalStartButton");
  if (startButton && plannerState.started) startButton.innerHTML = "&#9632; &nbsp; Avsluta resa";
  const referenceStartButton = $("#journalReferenceStartButton");
  if (referenceStartButton && plannerState.started) referenceStartButton.innerHTML = "&#9632; &nbsp; Avsluta resa";
  window.requestAnimationFrame(() => { ensureJournalMap(); if (journalMap?.loaded()) fitJournalPlanSpots(); scheduleCalculatedTransportRoute(); });
  const upcomingTarget = $("#journalUpcomingList");
  const pastTarget = $("#journalPastList");
  if (!upcomingTarget || !pastTarget) return;
  const today = new Date().toISOString().slice(0, 10);
  const trips = journalTrips().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  upcomingTarget.innerHTML = trips.filter((trip) => !trip.date || trip.date >= today).map(renderJournalTrip).join("");
  pastTarget.innerHTML = trips.filter((trip) => trip.date && trip.date < today).reverse().map(renderJournalTrip).join("");
}

export function saveJournalTrip(event) {
  event.preventDefault();
  const trip = { id: `journal-${Date.now()}`, title: $("#journalTripTitle")?.value.trim() || "Fisketur", date: $("#journalTripDate")?.value || "", time: $("#journalTripTime")?.value || "", location: $("#journalTripLocation")?.value.trim() || "", species: $("#journalTripSpecies")?.value.trim() || "", bait: $("#journalTripBait")?.value.trim() || "", weather: $("#journalTripWeather")?.value.trim() || "", notes: $("#journalTripNotes")?.value.trim() || "", createdAt: new Date().toISOString() };
  saveJournalTrips([...journalTrips(), trip]);
  setText("#journalPlanTitle", trip.title);
  const planner = $("#journalPlanner");
  if (planner) planner.hidden = true;
  showPlannerStatus("Fisketuren ar sparad");
  renderJournal();
}
