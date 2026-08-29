import { API_ROOT, LOCAL_API_ROOT } from "../api/config.js";
import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";

const JOURNAL_TRIPS_KEY = "bigplus_fishing_trips";
const JOURNAL_PLANNER_KEY = "bigplus_journal_planner_state_v2";

let SPOTS = [
  { name: "Bj\u00f6rkviks brygga", area: "Ingar\u00f6, V\u00e4rmd\u00f6", coordinates: "59.2380, 18.4900", lngLat: [18.49, 59.238], time: "08:30 - 09:30 (1 h)", shortTime: "08:30", priority: "Start", method: "Genomg\u00e5ng - F\u00f6rbered utrustning", wind: "6 m/s V", depth: "Brygga", notes: "Samling, s\u00e4kerhetskontroll och sj\u00f6s\u00e4ttning.", image: "/bigplus/assets/catch-page/scene-9.png", checklist: ["Kontrollera br\u00e4nsle", "Starta ekolod", "S\u00e4kerhetsgenomg\u00e5ng", "F\u00f6rdela utrustning", "Logga avg\u00e5ng"] },
  { name: "Krokviken", area: "N\u00e4md\u00f6fj\u00e4rden, V\u00e4rmd\u00f6", coordinates: "59.2821, 18.5412", lngLat: [18.5412, 59.2821], time: "11:15 - 13:45 (2 h 30 min)", shortTime: "11:15", priority: "H\u00f6g", method: "Jigging - Gummijigg 12-15 cm", wind: "7 m/s V", depth: "3 - 12 m", notes: "Brant kant mot djup. Bra g\u00e4ddl\u00e4ge.", image: "/bigplus/assets/catch-page/scene-4.png", checklist: ["Kontrollera djup p\u00e5 ekolod", "Testa jigghastighet vid grundkanten", "Prova l\u00e5ngsam jigging", "Foto och logga resultat", "Notera betesfisk"] },
  { name: "Landholmsviken", area: "N\u00e4md\u00f6fj\u00e4rden, V\u00e4rmd\u00f6", coordinates: "59.3050, 18.6800", lngLat: [18.68, 59.305], time: "14:30 - 16:30 (2 h)", shortTime: "14:30", priority: "Medel", method: "Drop shot - Mask 10 cm", wind: "6 m/s V", depth: "2 - 10 m", notes: "Grund vik med vegetation. Bra f\u00f6r abborre.", image: "/bigplus/assets/catch-page/scene-6.png", checklist: ["S\u00f6k betesfisk", "Prova drop shot", "Fiska vegetationskanten", "Fotografera platsen", "Notera vattentemperatur"] },
  { name: "S\u00f6dra grundet", area: "N\u00e4md\u00f6fj\u00e4rden, V\u00e4rmd\u00f6", coordinates: "59.2450, 18.8300", lngLat: [18.83, 59.245], time: "16:30 - 17:30 (1 h)", shortTime: "16:30", priority: "Medel", method: "Spinnfiske - Inlinebete 10 cm", wind: "5 m/s V", depth: "1 - 4 m", notes: "Avsluta \u00f6ver grundet om vinden till\u00e5ter.", image: "/bigplus/assets/catch-page/scene-9.png", checklist: ["Kontrollera vinden", "Fiska lovartsidan", "Testa snabb hemtagning", "Logga sista f\u00e5ngsten", "Kontrollera hemf\u00e4rd"] },
];

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
let journalTransport = plannerState.fields.transport === "car" ? "car" : "boat";
let journalMode = plannerState.fields.mode === "create" ? "create" : "edit";
let journalAddDestinationMode = false;
let journalPendingDestination = null;
let journalBoatRouteCoordinates = ROUTE_COORDINATES.boat;
let journalCarRouteCoordinates = ROUTE_COORDINATES.car;
let journalCarTravelMode = "car";
let journalRouteRequestId = 0;
let journalMap = null;
let journalMarkers = [];
let plannerBound = false;
let mapReadyListenerBound = false;

if (Array.isArray(plannerState.fields.stops) && plannerState.fields.stops.length > 0) {
  SPOTS = plannerState.fields.stops.map((spot) => ({ ...spot, lngLat: Array.isArray(spot.lngLat) ? spot.lngLat.map(Number) : [18.66, 59.27] }));
}

function readPlannerState() {
  try {
    const saved = JSON.parse(localStorage.getItem(JOURNAL_PLANNER_KEY) || "null");
    if (saved && typeof saved === "object") return { activeSpot: Number.isInteger(saved.activeSpot) ? saved.activeSpot : 1, favorites: Array.isArray(saved.favorites) ? saved.favorites : [1], checks: saved.checks && typeof saved.checks === "object" ? saved.checks : DEFAULT_CHECKS, ratings: Array.isArray(saved.ratings) ? saved.ratings : [5, 5, 5, 3], started: Boolean(saved.started), savedAt: saved.savedAt || "", notes: saved.notes || "", fields: saved.fields && typeof saved.fields === "object" ? saved.fields : {} };
  } catch {}
  return { activeSpot: 1, favorites: [1], checks: DEFAULT_CHECKS, ratings: [5, 5, 5, 3], started: false, savedAt: "", notes: "", fields: {} };
}

function persistPlannerState() { localStorage.setItem(JOURNAL_PLANNER_KEY, JSON.stringify(plannerState)); }

function persistPlannerStops() {
  plannerState.fields.stops = SPOTS.map((spot) => ({ ...spot, lngLat: [...spot.lngLat] }));
  persistPlannerState();
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

function showPlannerStatus(message) {
  const target = $("#journalReferenceStatus") || $("#journalActionStatus");
  if (!target) return;
  target.textContent = message;
  window.clearTimeout(showPlannerStatus.timer);
  showPlannerStatus.timer = window.setTimeout(() => { target.textContent = ""; }, 2800);
}

function journalMapStyle() {
  const boatRoute = { type: "Feature", geometry: { type: "LineString", coordinates: ROUTE_COORDINATES.boat }, properties: {} };
  const carRoute = { type: "Feature", geometry: { type: "LineString", coordinates: journalCarRouteCoordinates }, properties: {} };
  return {
    version: 8,
    name: "BIGPLUS Trip Planner",
    glyphs: `${API_ROOT}/weather/map/fonts/{fontstack}/{range}.pbf`,
    sources: {
      openmaptiles: { type: "vector", url: `${API_ROOT}/weather/map/planet?v=20260825-journal-1`, attribution: "OpenStreetMap contributors" },
      journalRouteBoat: { type: "geojson", lineMetrics: true, data: boatRoute },
      journalRouteCar: { type: "geojson", lineMetrics: true, data: carRoute },
      journalRouteWalk: { type: "geojson", lineMetrics: true, data: carRoute },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#c5d9c5" } },
      { id: "landcover", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": ["match", ["get", "class"], ["wood", "forest"], "#769d70", ["grass", "scrub"], "#9cba86", "#c5c9a6"], "fill-opacity": 0.88 } },
      { id: "landuse", type: "fill", source: "openmaptiles", "source-layer": "landuse", paint: { "fill-color": "#a8b98a", "fill-opacity": 0.66 } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#70b8df", "fill-opacity": 1 } },
      { id: "water-outline", type: "line", source: "openmaptiles", "source-layer": "water", paint: { "line-color": "#4c99c7", "line-width": 1 } },
      { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": "#5da9d3", "line-width": 1.4 } },
      { id: "journal-roads-casing", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": "rgba(255,250,225,.9)", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.4, 12, 4.5], "line-opacity": .92 } },
      { id: "roads", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": ["match", ["get", "class"], ["motorway", "trunk", "primary"], "#f5a742", ["secondary", "tertiary"], "#f6d27f", "#fff8e8"], "line-width": ["interpolate", ["linear"], ["zoom"], 7, .7, 12, 2.7], "line-opacity": .98 } },
      { id: "walkways", type: "line", source: "openmaptiles", "source-layer": "transportation", filter: ["match", ["get", "class"], ["path", "track", "footway", "pedestrian", "cycleway", "living_street", "residential"], true, false], paint: { "line-color": "#f7f0d5", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 12, 2.2], "line-opacity": .9 } },
      { id: "journal-poi-boat-ramp", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["any", ["==", ["get", "class"], "harbour"], ["==", ["get", "subclass"], "slipway"]], paint: { "circle-color": "#1768e6", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
      { id: "journal-poi-parking", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["==", ["get", "class"], "parking"], paint: { "circle-color": "#2469b5", "circle-radius": 5, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
      { id: "journal-poi-restaurant", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["match", ["get", "class"], ["restaurant", "cafe"], true, false], paint: { "circle-color": "#ec8a25", "circle-radius": 5, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
      { id: "journal-poi-camping", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["match", ["get", "class"], ["campsite", "camp_site"], true, false], paint: { "circle-color": "#2eaf50", "circle-radius": 5, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
      { id: "journal-poi-fuel", type: "circle", source: "openmaptiles", "source-layer": "poi", filter: ["==", ["get", "class"], "fuel"], paint: { "circle-color": "#d34d45", "circle-radius": 5, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
      { id: "water-names", type: "symbol", source: "openmaptiles", "source-layer": "water_name", layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": 12, "text-font": ["Noto Sans Italic"] }, paint: { "text-color": "#245c87", "text-halo-color": "rgba(220,241,250,.86)", "text-halo-width": 1.2 } },
      { id: "place-names", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": 11, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#2e4e45", "text-halo-color": "rgba(244,247,235,.92)", "text-halo-width": 1 } },
      { id: "journal-route-boat-shadow", type: "line", source: "journalRouteBoat", layout: { visibility: journalTransport === "boat" ? "visible" : "none" }, paint: { "line-color": "rgba(255,255,255,.96)", "line-width": 9, "line-opacity": .9 } },
      { id: "journal-route-boat", type: "line", source: "journalRouteBoat", layout: { visibility: journalTransport === "boat" ? "visible" : "none" }, paint: { "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "#2fc45a", .35, "#1689f5", .7, "#1689f5", 1, "#7450e8"], "line-width": 5 } },
      { id: "journal-route-car-shadow", type: "line", source: "journalRouteCar", layout: { visibility: journalTransport === "car" ? "visible" : "none" }, paint: { "line-color": "rgba(255,255,255,.96)", "line-width": 9, "line-opacity": .9 } },
      { id: "journal-route-car", type: "line", source: "journalRouteCar", layout: { visibility: journalTransport === "car" ? "visible" : "none" }, paint: { "line-color": "#ec8a25", "line-width": 5 } },
      { id: "journal-route-walk-shadow", type: "line", source: "journalRouteWalk", layout: { visibility: "none" }, paint: { "line-color": "rgba(255,255,255,.96)", "line-width": 8, "line-opacity": .9 } },
      { id: "journal-route-walk", type: "line", source: "journalRouteWalk", layout: { visibility: "none" }, paint: { "line-color": "#8c55d9", "line-width": 4, "line-dasharray": [1.2, 1.2] } },
    ],
  };
}

function fitJournalRoute() {
  if (!journalMap || !window.maplibregl) return;
  const bounds = new window.maplibregl.LngLatBounds();
  const route = journalTransport === "boat" ? journalBoatRouteCoordinates : journalCarRouteCoordinates;
  route.forEach((coordinate) => bounds.extend(coordinate));
  journalMap.fitBounds(bounds, { padding: { top: 90, right: 70, bottom: 80, left: 70 }, duration: 550, maxZoom: 11.5 });
}

function routeFeature(coordinates) {
  return { type: "Feature", geometry: { type: "LineString", coordinates }, properties: {} };
}

function findGridRoute(from, to, layerId, step = 42) {
  if (!journalMap) return null;
  const start = journalMap.project(from);
  const end = journalMap.project(to);
  const padding = layerId === "water" ? 76 : 64;
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

function calculateLayerRoute(layerId) {
  if (!journalMap?.loaded()) return null;
  const route = [];
  for (let index = 1; index < SPOTS.length; index += 1) {
    const segment = findGridRoute(SPOTS[index - 1].lngLat, SPOTS[index].lngLat, layerId, layerId === "roads" || layerId === "walkways" ? 30 : 42);
    if (!segment) return null;
    route.push(...(index === 1 ? [SPOTS[index - 1].lngLat] : []), ...segment, SPOTS[index].lngLat);
  }
  return route.filter((coordinate, index) => index === 0 || coordinate[0] !== route[index - 1][0] || coordinate[1] !== route[index - 1][1]);
}

async function requestRoadRoute(mode) {
  const coordinates = SPOTS.map((spot) => spot.lngLat.join(",")).join(";");
  const routeApiRoot = ["localhost", "127.0.0.1"].includes(window.location.hostname) ? LOCAL_API_ROOT : API_ROOT;
  const response = await fetch(`${routeApiRoot}/weather/map/route?mode=${mode}&coordinates=${encodeURIComponent(coordinates)}`);
  if (!response.ok) throw new Error(`Routing svarade ${response.status}`);
  const result = await response.json();
  if (!Array.isArray(result.coordinates) || result.coordinates.length < 2) throw new Error("Ingen rutt hittades");
  return result;
}

async function updateCalculatedTransportRoute() {
  if (!journalMap?.loaded()) return;
  const requestedTransport = journalTransport;
  const requestId = ++journalRouteRequestId;
  if (requestedTransport === "boat") {
    const calculated = calculateLayerRoute("water");
    if (!calculated || requestId !== journalRouteRequestId || journalTransport !== requestedTransport) return;
    journalBoatRouteCoordinates = calculated;
    journalMap.getSource("journalRouteBoat")?.setData(routeFeature(calculated));
    updateJournalRouteMode();
    fitJournalRoute();
    return;
  }

  try {
    let result;
    try {
      result = await requestRoadRoute("driving");
      journalCarTravelMode = "car";
    } catch {
      result = await requestRoadRoute("walking");
      journalCarTravelMode = "walk";
    }
    if (requestId !== journalRouteRequestId || journalTransport !== requestedTransport) return;
    journalCarRouteCoordinates = result.coordinates;
    journalMap.getSource("journalRouteCar")?.setData(routeFeature(result.coordinates));
    journalMap.getSource("journalRouteWalk")?.setData(routeFeature(result.coordinates));
  } catch {
    const fallback = calculateLayerRoute("roads") || calculateLayerRoute("walkways");
    if (!fallback || requestId !== journalRouteRequestId || journalTransport !== requestedTransport) return;
    journalCarTravelMode = "walk";
    journalCarRouteCoordinates = fallback;
    journalMap.getSource("journalRouteCar")?.setData(routeFeature(fallback));
    journalMap.getSource("journalRouteWalk")?.setData(routeFeature(fallback));
  }
  updateJournalRouteMode();
  fitJournalRoute();
}

function updateJournalRouteMode() {
  const isBoat = journalTransport === "boat";
  const route = journalTransport === "boat" ? journalBoatRouteCoordinates : journalCarRouteCoordinates;
  const isWalking = !isBoat && journalCarTravelMode === "walk";
  const distance = routeDistanceKm(route);
  const distanceLabel = `${distance.toFixed(1).replace(".", ",")} km`;
  setText("#journalReferenceDistance", distanceLabel);
  setText("#journalReferencePlanSummary", `${SPOTS.length} stopp \u00b7 ${distanceLabel}`);
  setText("#journalReferenceRouteLabel", isBoat ? "B\u00e5t via vatten" : isWalking ? "Promenad via g\u00e5ngv\u00e4g" : "Bil via v\u00e4g");
  setText("#journalReferenceTravelTime", isBoat ? "1 h 35 min" : isWalking ? "2 h 15 min" : "1 h 45 min");
  setText("#journalRouteModeBadge", isBoat ? "\u2693 \u00a0 Rutten f\u00f6ljer vatten" : isWalking ? "\uD83D\uDEB6 \u00a0 Rutten f\u00f6ljer g\u00e5ngv\u00e4gar" : "\uD83D\uDE97 \u00a0 Rutten f\u00f6ljer v\u00e4gar");
  if (!journalMap?.loaded()) return;
  journalMap.setLayoutProperty("journal-route-boat-shadow", "visibility", isBoat ? "visible" : "none");
  journalMap.setLayoutProperty("journal-route-boat", "visibility", isBoat ? "visible" : "none");
  journalMap.setLayoutProperty("journal-route-car-shadow", "visibility", isBoat ? "none" : "visible");
  journalMap.setLayoutProperty("journal-route-car", "visibility", !isBoat && !isWalking ? "visible" : "none");
  journalMap.setLayoutProperty("journal-route-walk-shadow", "visibility", isWalking ? "visible" : "none");
  journalMap.setLayoutProperty("journal-route-walk", "visibility", isWalking ? "visible" : "none");
}

function createJournalMarkers() {
  if (!journalMap || !window.maplibregl || journalMarkers.length) return;
  journalMarkers = SPOTS.map((spot, index) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `journal-route-marker${index === 0 ? " is-start" : ""}`;
    element.dataset.journalMarker = String(index);
    element.setAttribute("aria-label", `Visa ${spot.name}`);
    element.innerHTML = `<b>${index + 1}</b><span>${escapeHtml(spot.name)}<br>${spot.shortTime}</span>`;
    element.addEventListener("click", () => selectSpot(index, true));
    return new window.maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(spot.lngLat).addTo(journalMap);
  });
  updateMarkerState();
}

function rebuildJournalMarkers() {
  journalMarkers.forEach((marker) => marker.remove());
  journalMarkers = [];
  createJournalMarkers();
}

function ensureJournalMap() {
  const target = $("#journalMapReference") || $("#journalMap");
  if (!target || journalMap) { journalMap?.resize(); return; }
  if (!window.maplibregl) {
    if (!mapReadyListenerBound) { mapReadyListenerBound = true; window.addEventListener("bigplus:maplibre-ready", ensureJournalMap, { once: true }); }
    return;
  }
  journalMap = new window.maplibregl.Map({ container: target, style: journalMapStyle(), center: [18.66, 59.27], zoom: 10.2, attributionControl: false, dragRotate: false, pitchWithRotate: false });
  journalMap.on("load", () => { $(".journal-reference-map-panel")?.classList.add("is-map-ready"); createJournalMarkers(); updateJournalRouteMode(); fitJournalRoute(); journalMap.once("idle", () => window.setTimeout(updateCalculatedTransportRoute, 180)); });
  journalMap.on("click", (event) => {
    $("#journalMapReferenceHint")?.classList.add("is-dismissed");
    if (!journalAddDestinationMode) { showPlannerStatus("Aktivera Lagg till destination for att skapa ett stopp"); return; }
    journalPendingDestination = event.lngLat.toArray();
    const dialog = $("#journalDestinationDialog");
    if (dialog) { dialog.hidden = false; $("#journalDialogName")?.focus(); }
  });
}

function updateMarkerState() { journalMarkers.forEach((marker, index) => marker.getElement().classList.toggle("is-active", index === plannerState.activeSpot)); }

function renderChecklist(index) {
  const target = $("#journalSpotChecklist");
  const spot = SPOTS[index];
  if (!target || !spot) return;
  const values = Array.isArray(plannerState.checks[index]) ? plannerState.checks[index] : (DEFAULT_CHECKS[index] || [false, false, false, false, false]);
  target.innerHTML = spot.checklist.map((item, itemIndex) => `<label><input type="checkbox" data-journal-check="${itemIndex}"${values[itemIndex] ? " checked" : ""}> ${escapeHtml(item)}</label>`).join("");
  setText("#journalChecklistCount", `${values.filter(Boolean).length} av ${spot.checklist.length} klara`);
}

function renderSpot() {
  const index = Math.min(SPOTS.length - 1, Math.max(0, plannerState.activeSpot));
  plannerState.activeSpot = index;
  const spot = SPOTS[index];
  [["#journalSpotPosition", `Spot ${index + 1} av ${SPOTS.length}`], ["#journalSpotName", spot.name], ["#journalSpotArea", spot.area], ["#journalSpotCoordinates", spot.coordinates], ["#journalSpotTime", spot.time], ["#journalSpotPriority", spot.priority], ["#journalSpotMethod", spot.method], ["#journalSpotWind", spot.wind], ["#journalSpotDepth", spot.depth], ["#journalSpotNotes", spot.notes], ["#journalNextStopName", SPOTS[(index + 1) % SPOTS.length].name]].forEach(([selector, value]) => setText(selector, value));
  const image = $("#journalSpotImage");
  if (image) image.src = spot.image;
  $("#journalTimeline")?.querySelectorAll("[data-journal-spot-index]").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.journalSpotIndex) === index));
  $("#journalFavoriteSpot")?.classList.toggle("is-active", plannerState.favorites.includes(index));
  renderChecklist(index);
  updateMarkerState();
  renderReferencePlan();
}

function renderReferencePlan() {
  const planTarget = $("#journalReferencePlanStops");
  const timelineTarget = $("#journalReferenceTimeline");
  const timeLabels = SPOTS.map((spot, index) => spot.shortTime || `${String(8 + index * 2).padStart(2, "0")}:00`);
  if (planTarget) {
    planTarget.innerHTML = SPOTS.map((spot, index) => { const typeLabel = spot.type === "fishing" ? "Fiske" : spot.type ? escapeHtml(spot.type) : index === 0 ? "Startpunkt" : "Fiske"; const duration = spot.durationMinutes || [90, 75, 75, 60][index] || 45; return `<article class="journal-plan-stop${index === plannerState.activeSpot ? " is-active" : ""}" data-journal-reference-spot="${index}"><b>${index + 1}</b><span class="journal-plan-stop-copy"><strong>${escapeHtml(spot.name)}</strong><small>${typeLabel} &nbsp; · &nbsp; ${duration} min</small></span><span class="journal-plan-stop-actions"><strong>${timeLabels[index]}</strong><button type="button" data-journal-plan-move="up" data-journal-plan-index="${index}" aria-label="Flytta upp"${index === 0 ? " disabled" : ""}>&uarr;</button><button type="button" data-journal-plan-move="down" data-journal-plan-index="${index}" aria-label="Flytta ner"${index === SPOTS.length - 1 ? " disabled" : ""}>&darr;</button><button type="button" data-journal-plan-edit="${index}" aria-label="Redigera ${escapeHtml(spot.name)}">&#9998;</button><button type="button" data-journal-plan-delete="${index}" aria-label="Ta bort ${escapeHtml(spot.name)}">&#128465;</button></span></article>`; }).join("");
  }
  if (timelineTarget) {
    timelineTarget.innerHTML = SPOTS.map((spot, index) => `<button type="button" class="${index === plannerState.activeSpot ? "is-active" : ""}" data-journal-spot-index="${index}"><b>${index + 1}</b><span><strong>${timeLabels[index]}</strong><small>${index === 0 ? "Björkviks brygga" : index === 1 ? "Körtid till Krokviken" : index === 2 ? "Landholmsviken" : "Södra grundet"}</small></span><em>${index === 0 ? "1 h 30 min" : index === 1 ? "1 h 15 min" : index === 2 ? "1 h 15 min" : "1 h"}</em></button>`).join("");
  }
}

function selectSpot(index, moveMap = false) {
  plannerState.activeSpot = Math.min(SPOTS.length - 1, Math.max(0, Number(index) || 0));
  persistPlannerState();
  renderSpot();
  if (moveMap && journalMap) journalMap.easeTo({ center: SPOTS[plannerState.activeSpot].lngLat, zoom: 12, duration: 450 });
}

function activateAddDestinationMode() {
  journalAddDestinationMode = true;
  $("#journalMapReferenceHint")?.classList.add("is-add-mode");
  showPlannerStatus("Klicka pa kartan for att lagga till destination");
}

function closeDestinationDialog() {
  journalPendingDestination = null;
  journalAddDestinationMode = false;
  const dialog = $("#journalDestinationDialog");
  if (dialog) dialog.hidden = true;
  $("#journalMapReferenceHint")?.classList.remove("is-add-mode");
}

function addDestinationFromDialog(event) {
  event.preventDefault();
  if (!journalPendingDestination) return;
  const name = $("#journalDialogName")?.value.trim() || "Ny fiskespot";
  const type = $("#journalDialogType")?.value || "fishing";
  const durationMinutes = Number($("#journalDialogDuration")?.value || 45);
  const [lng, lat] = journalPendingDestination;
  SPOTS.push({ name, area: "Vald pa kartan", coordinates: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lngLat: [lng, lat], time: `${durationMinutes} min`, shortTime: "Ny", priority: "Medel", method: "Planeras", wind: "-", depth: "-", notes: "Ny destination tillagd fran kartan.", image: "/bigplus/assets/catch-page/scene-9.png", type, durationMinutes, checklist: ["Bekrafta plats", "Kontrollera vader", "Valj metod", "Foto och logga resultat", "Notera resultat"] });
  plannerState.activeSpot = SPOTS.length - 1;
  plannerState.checks[plannerState.activeSpot] = [false, false, false, false, false];
  persistPlannerStops();
  closeDestinationDialog();
  rebuildJournalMarkers();
  renderSpot();
  updateCalculatedTransportRoute();
  showPlannerStatus(`${name} ar tillagd i planen`);
}

function movePlannerStop(index, direction) {
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= SPOTS.length) return;
  [SPOTS[index], SPOTS[nextIndex]] = [SPOTS[nextIndex], SPOTS[index]];
  plannerState.activeSpot = nextIndex;
  persistPlannerStops();
  rebuildJournalMarkers();
  renderSpot();
  updateCalculatedTransportRoute();
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
}

function plannerSummary() {
  return ["BIGPLUS - Min tur i N\u00e4md\u00f6fj\u00e4rden", "Datum: 24 maj 2025", "Resl\u00e4ngd: 42 km | Total tid: ca 7 h 15 min", "", ...SPOTS.map((spot, index) => `${index + 1}. ${spot.name} - ${spot.time} - ${spot.method}`), "", `Anteckningar: ${plannerState.notes || "Inga anteckningar"}`].join("\n");
}

function savePlanSnapshot() {
  const wasCreating = journalMode === "create";
  const trip = { id: "journal-namdo-plan", title: "Min tur i Namdo-fjarden", date: "2025-05-24", time: "08:30", location: "Namdo-fjarden, Varmdo", species: "Gadda, Abborre, Gos", bait: "Jigging, drop shot och spinnfiske", weather: "16 grader, 7 m/s V", notes: plannerState.notes, createdAt: new Date().toISOString() };
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
  setText("#journalDestinationActionLabel", creating ? "L\u00e4gg till f\u00f6rsta stopp" : "L\u00e4gg till destination");
  const planTitle = $("#journalReferencePlanTitle");
  if (planTitle) planTitle.innerHTML = `${creating ? "&#10022; Ny plan" : "&#9876; Din plan"}`;
  if (announce) showPlannerStatus(creating ? "Skapa l\u00e4ge \u00e4r aktivt" : "Redigera l\u00e4ge \u00e4r aktivt");
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
  document.querySelectorAll("[data-journal-mode]").forEach((button) => button.addEventListener("click", () => setJournalMode(button.dataset.journalMode)));
  $("#journalTimeline")?.addEventListener("click", (event) => { const button = event.target.closest("[data-journal-spot-index]"); if (button) selectSpot(Number(button.dataset.journalSpotIndex), true); });
  $("#journalReferenceTimeline")?.addEventListener("click", (event) => { const button = event.target.closest("[data-journal-spot-index]"); if (button) selectSpot(Number(button.dataset.journalSpotIndex), true); });
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
      persistPlannerStops(); rebuildJournalMarkers(); renderSpot(); updateCalculatedTransportRoute(); showPlannerStatus(`${removed?.name || "Stoppet"} ar borttagen`); return;
    }
    if (event.target.closest("[data-journal-plan-edit]")) { const input = $("#journalDestinationInput"); if (input) { input.value = SPOTS[index].name; input.focus(); } selectSpot(index, false); showPlannerStatus(`Redigerar ${SPOTS[index].name}`); return; }
    selectSpot(index, true);
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
  $("#journalReferenceAddStop")?.addEventListener("click", activateAddDestinationMode);
  $("#journalAddDestinationButton")?.addEventListener("click", activateAddDestinationMode);
  $("#journalDestinationDialog")?.addEventListener("submit", addDestinationFromDialog);
  $("#journalDestinationDialogClose")?.addEventListener("click", closeDestinationDialog);
  $("#journalDestinationDialogCancel")?.addEventListener("click", closeDestinationDialog);
  $(".journal-notes-actions")?.addEventListener("click", (event) => { const button = event.target.closest("[data-journal-note-action]"); if (button) showPlannerStatus("Funktionen ar redo for din plan"); });
  $("#journalNextStopButton")?.addEventListener("click", () => selectSpot((plannerState.activeSpot + 1) % SPOTS.length, true));
  document.querySelectorAll("[data-journal-transport]").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll("[data-journal-transport]").forEach((item) => item.classList.toggle("active", item === button)); journalTransport = button.dataset.journalTransport === "car" ? "car" : "boat"; plannerState.fields.transport = journalTransport; persistPlannerState(); updateJournalRouteMode(); updateCalculatedTransportRoute(); fitJournalRoute(); showPlannerStatus(journalTransport === "boat" ? "Batrutten foljer vatten" : "Bilrutten foljer vagar"); }));
  document.querySelectorAll("[data-journal-priority]").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll("[data-journal-priority]").forEach((item) => item.classList.toggle("active", item === button)); }));
}

export function renderJournal() {
  bindPlannerUi();
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
  window.requestAnimationFrame(() => ensureJournalMap());
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
