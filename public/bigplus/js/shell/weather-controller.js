import { getWeatherPoint, getWeatherRadar, searchWeatherPlaces } from "../api/weather.js";
import { API_ROOT } from "../api/config.js";
import { $ } from "./dom.js";
import { escapeHtml, displayValue } from "./format.js";
import { journalTrips } from "./journal.js";

const SWEDEN_CENTER = [15.5, 62.0];
const DEFAULT_POINT = { lat: 58.39, lon: 15.62, label: "Roxen, Linköping" };
const WEATHER_PLACE_KEY = "bigplus_weather_place";
const WEATHER_RECENT_PLACES_KEY = "bigplus_weather_recent_places";
const WEATHER_LOCK_KEY = "bigplus_weather_location_locked";
const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };
const WEATHER_MAX_ZOOM = 22;
// Keep the map geographically useful at city level while leaving a small
// buffer before the tile provider's maximum zoom.
const WEATHER_MAX_ALLOWED_ZOOM = WEATHER_MAX_ZOOM - 6;
const WEATHER_DEFAULT_ZOOM = WEATHER_MAX_ZOOM - 12;
// Keep the useful Sweden/Norden overview reachable, but stop after 34 normal
// wheel steps out from the local start view.
const WEATHER_MAX_ZOOM_OUT_STEPS = 34;
const WEATHER_WHEEL_ZOOM_STEP = 0.2;
const WEATHER_MIN_ALLOWED_ZOOM = Math.max(0, WEATHER_DEFAULT_ZOOM - (WEATHER_MAX_ZOOM_OUT_STEPS * WEATHER_WHEEL_ZOOM_STEP));
const MIN_DISPLAY_RADAR_LEVEL = 0;
const RAIN_DISPLAY_MIN_ZOOM = 4.8;
const RAIN_VIEW_BUFFER_RATIO = 0.28;
const RAIN_CLOUD_PIN_OFFSET = [0, 0];
const WATER_FEATURE_LAYERS = ["water", "waterway", "water-names"];
const RAIN_STRENGTH_ICON_ASSETS = {
  "rain-strength-1": "/bigplus/assets/weather/bigplus-regn-1.png",
  "rain-strength-2": "/bigplus/assets/weather/bigplus-regn-2.png",
  "rain-strength-3": "/bigplus/assets/weather/bigplus-regn-3.png",
  "rain-strength-4": "/bigplus/assets/weather/bigplus-regn-4.png",
  "rain-strength-5": "/bigplus/assets/weather/bigplus-regn-5.png"
};
// WGS84 corners used by the SMHI Sweden composite image source. The same
// quadrilateral is used when converting decoded raster pixels to hexagons.
const RADAR_BOUNDS = [[5.28496, 69.78109], [29.799664, 69.419691], [23.727184, 53.685564], [9.319164, 53.869605]];
// The honeycomb is generated in the radar image's pixel space. This keeps
// every hexagon anchored to the same SMHI pixel even when MapLibre pitches,
// rotates, pans, or zooms the map.
const RADAR_HEX_RADIUS_PX = 2.45;
const RADAR_CELL_SIZE = 3;
const WEATHER_ICON_ASSETS = Array.from({ length: 10 }, (_, index) => `/bigplus/assets/weather/weather-${index + 1}.png`);

const PIKE_WEATHER_RULES = [
  { name: "Mulet + frisk vind", wind: [5, 9], clouds: [65, 100], rating: "🔥", score: 4, spot: "Vindutsatt vik, vasskant, udde", depth: "1–4 m", lure: "Shad/paddletail", color: "Motoroil, abborre" },
  { name: "Lätt regn + vind", wind: [4, 8], rain: [0.1, 5], rating: "🔥", score: 4, spot: "Grundvik, inlopp, vass", depth: "1–3 m", lure: "Shad", color: "Firetiger, chartreuse" },
  { name: "Skymning + mulet", wind: [2, 6], clouds: [60, 100], time: "dusk", rating: "🔥", score: 4, spot: "Grundflak, gräs, vass", depth: "0,5–3 m", lure: "Jigg/jerkbait", color: "Svart, mörkgrön" },
  { name: "Gryning + svag vind", wind: [1, 4], time: "dawn", rating: "🟢", score: 3, spot: "Grunt nära vegetation", depth: "0,5–2,5 m", lure: "Jigg/jerkbait", color: "Naturfärg" },
  { name: "Kallare efter väderomslag", wind: [3, 7], temp: [-5, 10], rating: "🟢", score: 3, spot: "Brant nära grundområde", depth: "3–7 m", lure: "Stor shad", color: "Mört, brun/grön" },
  { name: "Stabilt mulet", wind: [3, 6], clouds: [65, 100], rating: "🟢", score: 3, spot: "Uddar, sund, vegetationskanter", depth: "2–5 m", lure: "Swimbait/jigg", color: "Naturfärg" },
  { name: "Soligt + blåst", wind: [5, 9], clouds: [0, 40], temp: [12, 35], rating: "🟢", score: 3, spot: "Vindutsatt strand/udde", depth: "2–5 m", lure: "Shad/spinnerbait", color: "Silver, vitt" },
  { name: "Soligt + vindstilla", wind: [0, 2], clouds: [0, 35], temp: [10, 35], rating: "🟡", score: 2, spot: "Skugga, djup vegetation", depth: "4–8 m", lure: "Softbait", color: "Diskret naturfärg" },
  { name: "Varm högsommar", wind: [1, 4], temp: [20, 40], rating: "🟡", score: 2, spot: "Djupkant, pelagiskt, djup vegetation", depth: "5–10+ m", lure: "Tung jigg/shad", color: "Mört, sik" },
  { name: "Kraftigt regn", wind: [4, 10], rain: [5, 60], rating: "🟡", score: 2, spot: "Inlopp, lävikar, grumligt vatten", depth: "1–5 m", lure: "Vibrerande shad", color: "Chartreuse/orange" },
  { name: "Hård vind", wind: [9, 13], rating: "🟠", score: 1, spot: "Skyddade områden", depth: "2–6 m", lure: "Tung shad", color: "Kontrastfärg" },
  { name: "Het + klar + vindstilla", wind: [0, 2], clouds: [0, 25], temp: [24, 40], rating: "🔴/🟡", score: 2, spot: "Djup, skuggzoner", depth: "6–12+ m", lure: "Tung softbait", color: "Naturfärg" }
];

const layerLabels = {
  rain: "Regn",
  wind: "Vind",
  gust: "Byvind",
  temp: "Temperatur",
  clouds: "Moln"
};

function fishingLightStyle() {
  return {
    version: 8,
    name: "BIGPLUS Fishing Light",
    glyphs: `${API_ROOT}/weather/map/fonts/{fontstack}/{range}.pbf`,
    sources: {
      openmaptiles: {
        type: "vector",
        url: `${API_ROOT}/weather/map/planet?v=20260806-weather-3`,
        attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#062b35" } },
      { id: "landcover-wood", type: "fill", source: "openmaptiles", "source-layer": "landcover", filter: ["match", ["get", "class"], ["wood", "forest", "grass", "scrub"], true, false], paint: { "fill-color": "#0b3431", "fill-opacity": 0.96 } },
      { id: "landcover-rough", type: "fill", source: "openmaptiles", "source-layer": "landcover", filter: ["match", ["get", "class"], ["rock", "heath", "tundra", "sand", "glacier"], true, false], paint: { "fill-color": "#18433d", "fill-opacity": 0.9 } },
      { id: "landuse-soft", type: "fill", source: "openmaptiles", "source-layer": "landuse", paint: { "fill-color": "#103a39", "fill-opacity": 0.88 } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#073b74", "fill-opacity": 1 } },
      { id: "water-shadow", type: "line", source: "openmaptiles", "source-layer": "water", paint: { "line-color": "#0f79c2", "line-opacity": 0.76, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 10, 1.8] } },
      { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": "#1c8bd0", "line-opacity": 0.98, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.8, 12, 2.7] } },
      { id: "roads-major", type: "line", source: "openmaptiles", "source-layer": "transportation", filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false], paint: { "line-color": "#8fc9e8", "line-opacity": 0.38, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 12, 2.2] } },
      { id: "buildings", type: "fill", source: "openmaptiles", "source-layer": "building", minzoom: 12, paint: { "fill-color": "#4b88ad", "fill-opacity": 0.34 } },
      { id: "water-names", type: "symbol", source: "openmaptiles", "source-layer": "water_name", minzoom: 5, layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 10, 16], "text-font": ["Noto Sans Italic"], "symbol-placement": "point" }, paint: { "text-color": "#c5eeff", "text-halo-color": "rgba(3, 35, 69, .9)", "text-halo-width": 1.5 } },
      { id: "mountain-peaks", type: "symbol", source: "openmaptiles", "source-layer": "mountain_peak", minzoom: 6, layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"], "▲"], "text-size": ["interpolate", ["linear"], ["zoom"], 6, 9, 11, 14], "text-font": ["Noto Sans Regular"], "text-anchor": "bottom" }, paint: { "text-color": "#b8d2a5", "text-halo-color": "rgba(3, 32, 24, .92)", "text-halo-width": 1.2 } },
      { id: "place-names", type: "symbol", source: "openmaptiles", "source-layer": "place", minzoom: 4, layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": ["match", ["get", "class"], "city", 13, "town", 11, 9], "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#eef8ff", "text-halo-color": "rgba(3, 35, 69, .9)", "text-halo-width": 1 } }
    ]
  };
}

function readSavedPoint() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEATHER_PLACE_KEY) || "null");
    if (Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lon)) return parsed;
  } catch {}
  return DEFAULT_POINT;
}

function savePoint(point) {
  const savedPoint = { ...point, userSelected: true };
  localStorage.setItem(WEATHER_PLACE_KEY, JSON.stringify(savedPoint));
  try {
    const existing = JSON.parse(localStorage.getItem(WEATHER_RECENT_PLACES_KEY) || "[]");
    const next = [savedPoint, ...(Array.isArray(existing) ? existing : [])].filter((item, index, list) => Number.isFinite(item?.lat) && Number.isFinite(item?.lon) && list.findIndex((candidate) => candidate.lat === item.lat && candidate.lon === item.lon) === index).slice(0, 8);
    localStorage.setItem(WEATHER_RECENT_PLACES_KEY, JSON.stringify(next));
  } catch {}
}

function readRecentPlaces() {
  try {
    const places = JSON.parse(localStorage.getItem(WEATHER_RECENT_PLACES_KEY) || "[]");
    return Array.isArray(places) ? places.filter((place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lon)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function readLocationLock() {
  return localStorage.getItem(WEATHER_LOCK_KEY) === "true";
}

function locationFrom(item) {
  const measurement = item?.measurement || {};
  const location = item?.location || measurement.location || item?.coordinates || measurement.coordinates || {};
  const lat = Number(location.lat ?? location.latitude ?? item?.lat ?? item?.latitude ?? measurement.lat ?? measurement.latitude);
  const lon = Number(location.lon ?? location.lng ?? location.longitude ?? item?.lon ?? item?.lng ?? item?.longitude ?? measurement.lon ?? measurement.lng ?? measurement.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function formatHour(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("sv-SE", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatUpdated(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "okänd tid";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function degreesToCompass(value) {
  const deg = Number(value);
  if (!Number.isFinite(deg)) return "--";
  const names = ["N", "NO", "O", "SO", "S", "SV", "V", "NV"];
  return names[Math.round(deg / 45) % 8];
}

function finiteWeatherNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inRange(value, range) {
  return value != null && (!range || (value >= range[0] && value <= range[1]));
}

function pikeWeatherAssessment(item = {}) {
  const wind = finiteWeatherNumber(item.windSpeedMs);
  const rain = finiteWeatherNumber(item.precipitationMm);
  const clouds = finiteWeatherNumber(item.cloudCoverPercent);
  const temp = finiteWeatherNumber(item.temperatureC);
  const hour = new Date(item.time || Date.now()).getHours();
  const timeMatches = (period) => period === "dawn" ? hour >= 4 && hour <= 8 : hour >= 19 || hour <= 5;
  const candidates = PIKE_WEATHER_RULES.map((rule) => {
    const checks = [
      rule.wind && inRange(wind, rule.wind),
      rule.rain && inRange(rain, rule.rain),
      rule.clouds && inRange(clouds, rule.clouds),
      rule.temp && inRange(temp, rule.temp),
      rule.time && timeMatches(rule.time)
    ].filter(Boolean).length;
    const available = [rule.wind, rule.rain, rule.clouds, rule.temp, rule.time].filter(Boolean).length;
    return { ...rule, checks, available, match: checks === available && available > 0 };
  }).sort((a, b) => (b.match - a.match) || (b.checks * b.score - a.checks * a.score));
  const best = candidates[0];
  if (!best || best.checks < 1 || (!best.match && best.checks < 2)) return null;
  return { ...best, confidence: Math.round((best.checks / best.available) * 100), wind, rain, clouds, temp };
}

function weatherSummary(item = {}) {
  const tempValue = finiteWeatherNumber(item.temperatureC);
  const windValue = finiteWeatherNumber(item.windSpeedMs);
  const gustValue = finiteWeatherNumber(item.windGustMs);
  const rainValue = finiteWeatherNumber(item.precipitationMm);
  const cloudValue = finiteWeatherNumber(item.cloudCoverPercent);
  const pressureValue = finiteWeatherNumber(item.pressureHpa);
  const humidityValue = finiteWeatherNumber(item.humidityPercent);
  const dewPointValue = finiteWeatherNumber(item.dewPointC);
  const visibilityValue = finiteWeatherNumber(item.visibilityKm);
  const temp = tempValue == null ? "--" : `${Math.round(tempValue)}°`;
  const wind = windValue == null ? "--" : `${windValue.toFixed(1)} m/s`;
  const gust = gustValue == null ? "--" : `${gustValue.toFixed(1)} m/s`;
  const rain = rainValue == null ? "--" : `${rainValue.toFixed(1)} mm`;
  const clouds = cloudValue == null ? "--" : `${Math.round(cloudValue)}%`;
  const pressure = pressureValue == null ? "--" : `${Math.round(pressureValue)} hPa`;
  const humidity = humidityValue == null ? "--" : `${Math.round(humidityValue)}%`;
  const dewPoint = dewPointValue == null ? "--" : `${Math.round(dewPointValue)}°`;
  const visibility = visibilityValue == null ? "--" : `${visibilityValue.toFixed(0)} km`;
  return { temp, wind, gust, rain, clouds, pressure, humidity, dewPoint, visibility };
}

  function layerPaint(layer, item = {}) {
  const value = Number({
    rain: item.precipitationMm,
    wind: item.windSpeedMs,
    gust: item.windGustMs,
    temp: item.temperatureC,
    clouds: item.cloudCoverPercent
  }[layer] ?? 0);
  if (layer === "rain") return { color: value > 2 ? "#0f5ed7" : value > 0.3 ? "#2494f2" : "#8fd6ff", radius: value > 2 ? 34 : value > 0.3 ? 26 : 18, opacity: value > 0 ? 0.52 : 0.18 };
  if (layer === "temp") return { color: value >= 18 ? "#f97316" : value >= 8 ? "#facc15" : "#38bdf8", radius: 38, opacity: 0.64 };
  if (layer === "clouds") return { color: value > 75 ? "#64748b" : value > 35 ? "#94a3b8" : "#dbeafe", radius: 44, opacity: value > 20 ? 0.58 : 0.3 };
  if (layer === "gust") return { color: value > 12 ? "#ef4444" : value > 7 ? "#f59e0b" : "#22c55e", radius: 42, opacity: 0.72 };
    return { color: value > 8 ? "#1d4ed8" : "#0ea5e9", radius: 38, opacity: 0.68 };
  }

  function chartMetric(item, layer) {
    const values = { rain: item?.precipitationMm, wind: item?.windSpeedMs, gust: item?.windGustMs, temp: item?.temperatureC, clouds: item?.cloudCoverPercent };
    return finiteWeatherNumber(values[layer]);
  }

  function chartUnit(layer) {
    return layer === "temp" ? "°C" : layer === "clouds" ? "%" : layer === "rain" ? "mm" : "m/s";
  }

export function createWeatherController({ userCatches }) {
  let map = null;
  let radar = null;
  let data = null;
  let activePoint = readSavedPoint();
  let activeIndex = 0;
  let activeLayer = "rain";
  let smhiRadarOnTop = false;
  let locationLocked = readLocationLock();
  let fishingNow = false;
  let radarRequestId = 0;
  let radarImageUrl = null;
  let radarCoordinatesKey = "";
  let radarTimer = null;
  let searchLocations = [];
  let initialLocationAttempted = false;
  let rainClouds = [];
  let rainMarkers = [];
  let rainMapMarkers = [];
  let rainCloudMapMarkers = [];
  let rainCloudImageUrl = "";
  let rainCloudRequestId = 0;
let rainAnimationCanvas = null;
let rainAnimationRaf = 0;
let rainViewportRaf = 0;
let rainStrengthIconsPromise = null;
  let weatherLocationMarker = null;
  let pikeWeatherMarker = null;
  const rainShapeSeed = Math.random() * 1000;
  let mapIsTilted = false;

  async function loadInitialPoint() {
    if (initialLocationAttempted) return loadPoint(activePoint);
    initialLocationAttempted = true;
    const shouldUseCurrentLocation = !locationLocked && !activePoint.userSelected && navigator.geolocation;
    if (!shouldUseCurrentLocation) return loadPoint(activePoint);
    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => loadPoint({ lat: position.coords.latitude, lon: position.coords.longitude, label: "Min plats" }).finally(resolve),
        () => loadPoint(activePoint).finally(resolve),
        { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 }
      );
    });
  }

  function ensureRainCloudOverlay() {
    const mapTarget = $("#weatherMap");
    const overlay = $("#weatherRainCloudOverlay");
    if (!mapTarget || !overlay) return null;
    if (overlay.parentElement !== mapTarget) mapTarget.appendChild(overlay);
    return overlay;
  }

  function ensureRainAnimationCanvas() {
    const mapTarget = $("#weatherMap");
    if (!mapTarget) return null;
    if (!rainAnimationCanvas || rainAnimationCanvas.parentElement !== mapTarget) {
      rainAnimationCanvas?.remove();
      rainAnimationCanvas = document.createElement("canvas");
      rainAnimationCanvas.className = "weather-rain-animation";
      rainAnimationCanvas.setAttribute("aria-hidden", "true");
      mapTarget.appendChild(rainAnimationCanvas);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, mapTarget.clientWidth);
    const height = Math.max(1, mapTarget.clientHeight);
    if (rainAnimationCanvas.width !== Math.round(width * dpr) || rainAnimationCanvas.height !== Math.round(height * dpr)) {
      rainAnimationCanvas.width = Math.round(width * dpr);
      rainAnimationCanvas.height = Math.round(height * dpr);
      rainAnimationCanvas.style.width = `${width}px`;
      rainAnimationCanvas.style.height = `${height}px`;
    }
    return { canvas: rainAnimationCanvas, dpr, width, height };
  }

  function rainAnimationColor(level) {
    return Number(level) >= 3 ? "#ff6b4a" : Number(level) >= 2 ? "#ffe044" : Number(level) >= 1 ? "#4de29b" : "#75e7ff";
  }

  function renderRainAnimationFrame(timestamp = performance.now()) {
    const setup = ensureRainAnimationCanvas();
    if (!setup) return;
    const { canvas, dpr, width, height } = setup;
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!rainViewportVisible() || !rainClouds.length) return;
    const tiltFactor = Math.min(1, Math.max(0, (map.getPitch() - 8) / 34));
    if (tiltFactor <= 0) return;
    const bounds = map.getBounds?.();
    if (!bounds) return;
    const seconds = timestamp / 1000;
    const clouds = rainCloudsForViewport();
    let drawn = 0;
    for (const cell of clouds) {
      if (drawn >= 520 || !bounds.contains([cell.lon, cell.lat]) || !cell.polygon?.[0]) continue;
      const corners = radarHoneycombPolygon(cell)?.[0]?.map(([lon, lat]) => map.project([lon, lat])) || [];
      if (corners.length < 6) continue;
      const topIndex = corners.reduce((best, point, index) => point.y < corners[best].y ? index : best, 0);
      const top = corners[topIndex];
      const leftTop = corners[(topIndex + 5) % 6];
      const rightTop = corners[(topIndex + 1) % 6];
      const minX = Math.min(...corners.map((point) => point.x));
      const maxX = Math.max(...corners.map((point) => point.x));
      const maxY = Math.max(...corners.map((point) => point.y));
      if (maxX < -30 || minX > width + 30 || maxY < -30 || top.y > height + 30) continue;
      const count = Number(cell.level) >= 2 ? 6 : cell.coverage > 0.25 ? 4 : 3;
      context.strokeStyle = rainAnimationColor(cell.level);
      context.lineWidth = Number(cell.level) >= 2 ? 1.45 : 1.1;
      context.lineCap = "round";
      context.shadowColor = context.strokeStyle;
      context.shadowBlur = 3;
      const projectedHeight = Math.max(12, maxY - top.y);
      // Start every drop on the upper hexagon frame and always fall toward the
      // screen's ground direction. The old square-cell midpoint made rain
      // collapse onto one line and reverse when the map was rotated.
      const groundTravel = Math.min(72, Math.max(20, projectedHeight * 0.58));
      for (let index = 0; index < count; index += 1) {
        const seed = Math.abs((cell.x || 0) * 13 + (cell.y || 0) * 7 + index * 29) % 97 / 97;
        const fall = (seconds * (0.72 + Number(cell.level || 0) * 0.08) + seed) % 1;
        const across = (seed * 0.72 + index * 0.18) % 1;
        const edgePoint = across < 0.5
          ? { x: leftTop.x + (top.x - leftTop.x) * (across * 2), y: leftTop.y + (top.y - leftTop.y) * (across * 2) }
          : { x: top.x + (rightTop.x - top.x) * ((across - 0.5) * 2), y: top.y + (rightTop.y - top.y) * ((across - 0.5) * 2) };
        const startX = edgePoint.x;
        const startY = edgePoint.y + fall * groundTravel;
        const length = Math.min(26, Math.max(9, projectedHeight * 0.16)) + Number(cell.level || 0) * 2;
        context.globalAlpha = tiltFactor * Math.min(0.9, 0.32 + (Number(cell.coverage) || 0) * 0.58);
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(startX + 3, startY + length);
        context.stroke();
        drawn += 1;
      }
    }
    context.shadowBlur = 0;
    context.globalAlpha = 1;
  }

  function updateRain3DPresentation() {
    if (!map || !map.getLayer("weather-rain-3d")) return;
    const tiltFactor = Math.min(1, Math.max(0, (map.getPitch() - 8) / 34));
    map.setPaintProperty("weather-rain-3d", "fill-extrusion-opacity", 0.2 * tiltFactor);
  }

  function scheduleRainAnimation() {
    if (rainAnimationRaf) return;
    const tick = (timestamp) => {
      rainAnimationRaf = 0;
      renderRainAnimationFrame(timestamp);
      if (rainViewportVisible() && rainClouds.length) rainAnimationRaf = window.requestAnimationFrame(tick);
    };
    rainAnimationRaf = window.requestAnimationFrame(tick);
  }

  function sweref99TmToWgs84(easting, northing) {
    const a = 6378137;
    const flattening = 1 / 298.257222101;
    const eccentricitySquared = flattening * (2 - flattening);
    const secondEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
    const scale = 0.9996;
    const centralMeridian = 15 * Math.PI / 180;
    const meridional = northing / scale;
    const mu = meridional / (a * (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256));
    const e1 = (1 - Math.sqrt(1 - eccentricitySquared)) / (1 + Math.sqrt(1 - eccentricitySquared));
    const phi1 = mu
      + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
      + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
      + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const sinPhi = Math.sin(phi1);
    const cosPhi = Math.cos(phi1);
    const tanPhi = Math.tan(phi1);
    const radiusNorth = a / Math.sqrt(1 - eccentricitySquared * sinPhi ** 2);
    const tangentSquared = tanPhi ** 2;
    const cosSquared = secondEccentricitySquared * cosPhi ** 2;
    const radiusMeridian = a * (1 - eccentricitySquared) / (1 - eccentricitySquared * sinPhi ** 2) ** 1.5;
    const delta = (easting - 500000) / (radiusNorth * scale);
    const latitude = phi1 - (radiusNorth * tanPhi / radiusMeridian) * (delta ** 2 / 2 - (5 + 3 * tangentSquared + 10 * cosSquared - 4 * cosSquared ** 2 - 9 * secondEccentricitySquared) * delta ** 4 / 24 + (61 + 90 * tangentSquared + 298 * cosSquared + 45 * tangentSquared ** 2 - 252 * secondEccentricitySquared - 3 * cosSquared ** 2) * delta ** 6 / 720);
    const longitude = centralMeridian + (delta - (1 + 2 * tangentSquared + cosSquared) * delta ** 3 / 6 + (5 - 2 * cosSquared + 28 * tangentSquared - 3 * cosSquared ** 2 + 8 * secondEccentricitySquared + 24 * tangentSquared ** 2) * delta ** 5 / 120) / cosPhi;
    return { lon: longitude * 180 / Math.PI, lat: latitude * 180 / Math.PI };
  }

  function radarPixelToLngLat(x, y, width, height) {
    // Use the exact same quadrilateral as the MapLibre SMHI image source.
    // This keeps every derived hexagon on top of the raster pixel it came
    // from instead of mixing two different projections.
    // MapLibre positions the image bounds at the outer pixel edges. Using
    // width/height here keeps cell edges and raster pixels on the same line.
    const horizontal = Math.min(1, Math.max(0, x / Math.max(1, width)));
    const vertical = Math.min(1, Math.max(0, y / Math.max(1, height)));
    const toMercator = ([longitude, latitude]) => {
      const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
      const radians = clampedLatitude * Math.PI / 180;
      const sine = Math.sin(radians);
      return { x: (longitude + 180) / 360, y: 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI) };
    };
    const fromMercator = (point) => ({
      lon: point.x * 360 - 180,
      lat: Math.atan(Math.sinh(Math.PI - 2 * Math.PI * point.y)) * 180 / Math.PI
    });
    const topLeft = toMercator(RADAR_BOUNDS[0]);
    const topRight = toMercator(RADAR_BOUNDS[1]);
    const bottomRight = toMercator(RADAR_BOUNDS[2]);
    const bottomLeft = toMercator(RADAR_BOUNDS[3]);
    const top = [
      topLeft.x + (topRight.x - topLeft.x) * horizontal,
      topLeft.y + (topRight.y - topLeft.y) * horizontal
    ];
    const bottom = [
      bottomLeft.x + (bottomRight.x - bottomLeft.x) * horizontal,
      bottomLeft.y + (bottomRight.y - bottomLeft.y) * horizontal
    ];
    return fromMercator({
      x: top[0] + (bottom[0] - top[0]) * vertical,
      y: top[1] + (bottom[1] - top[1]) * vertical
    });
  }

  function radarCellPolygon(x, y, size, width, height) {
    const right = Math.min(width - 1, x + size);
    const bottom = Math.min(height - 1, y + size);
    return [
      [radarPixelToLngLat(x, y, width, height), radarPixelToLngLat(right, y, width, height), radarPixelToLngLat(right, bottom, width, height), radarPixelToLngLat(x, bottom, width, height), radarPixelToLngLat(x, y, width, height)]
        .map(({ lon, lat }) => [lon, lat])
    ];
  }

  // Pointy-top hexagons use the exact honeycomb spacing in radar pixels. The
  // source raster remains the authority for location; the shape is only a
  // visual sampling window around that pixel, so it cannot drift away from
  // the SMHI footprint at another zoom or map angle.
  function radarHoneycombPolygon(cloud, scale = 1) {
    const width = Number(cloud?.radarWidth) || 0;
    const height = Number(cloud?.radarHeight) || 0;
    const radius = Number(cloud?.hexRadiusPx) || RADAR_HEX_RADIUS_PX;
    if (!width || !height) return cloud?.polygon?.[0] || [];
    const centerX = Number(cloud?.centerX ?? cloud?.x) || 0;
    const centerY = Number(cloud?.centerY ?? cloud?.y) || 0;
    const points = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + index * (Math.PI / 3);
      const { lon, lat } = radarPixelToLngLat(
        centerX + Math.cos(angle) * radius * scale,
        centerY + Math.sin(angle) * radius * scale,
        width,
        height
      );
      return [lon, lat];
    });
    points.push(points[0]);
    return [points];
  }

  function radarHoneycombRingPolygon(cloud, outerScale = 1, innerScale = 0.68) {
    const outer = radarHoneycombPolygon(cloud, outerScale)[0];
    const inner = radarHoneycombPolygon(cloud, innerScale)[0].slice().reverse();
    return [outer, inner];
  }

  function radarCellLevel(red, green, blue) {
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max < 100 || max - min < 24) return null;
    if (red > 190 && green < 150) return 3;
    if (red > 170 && green > 140 && blue < 100) return 2;
    if (green > 100 && green > red * 1.12 && green > blue * 0.86) return 1;
    if (blue > 115 && blue > red * 1.2 && blue > green * 1.05) return 0;
    return null;
  }

  function clearRainMapMarkers() {
    rainMapMarkers.forEach((marker) => marker.remove());
    rainMapMarkers = [];
    rainCloudMapMarkers = [];
  }

  function rainMapScale() {
    if (!map) return 1;
    // Radar cells are geographic polygons. They must not grow with the map
    // zoom; MapLibre handles their screen size from their fixed coordinates.
    return 1;
  }

  function rainLevelRgb(level) {
    return Number(level) >= 3 ? [255, 24, 72] : Number(level) === 2 ? [255, 232, 0] : Number(level) === 1 ? [38, 255, 116] : [0, 220, 255];
  }

  function rainCloudNeighbourMap(clouds) {
    const keyFor = (cloud) => `${cloud.gridColumn}:${cloud.gridRow}`;
    const byCell = new Map(clouds.map((cloud) => [keyFor(cloud), cloud]));
    const neighboursByCell = new Map();
    for (const cloud of clouds) {
      const column = Number(cloud.gridColumn);
      const row = Number(cloud.gridRow);
      const diagonalX = row % 2 ? 1 : -1;
      const offsets = [
        [-1, 0], [1, 0],
        [0, -1], [diagonalX, -1],
        [0, 1], [diagonalX, 1]
      ];
      const neighbours = offsets
        .map(([xOffset, yOffset]) => byCell.get(`${column + xOffset}:${row + yOffset}`))
        .filter(Boolean);
      neighboursByCell.set(keyFor(cloud), neighbours);
    }
    return neighboursByCell;
  }

  function rainCloudNeighbours(cloud, clouds, neighbourMap = null) {
    const key = `${cloud.gridColumn}:${cloud.gridRow}`;
    if (neighbourMap) return neighbourMap.get(key) || [];
    return rainCloudNeighbourMap(clouds).get(key) || [];
  }

  function rainCloudBoundaryDistanceMap(clouds, neighbourMap) {
    const distances = new Map();
    const queue = [];
    for (const cloud of clouds) {
      const key = `${cloud.gridColumn}:${cloud.gridRow}`;
      const neighbours = neighbourMap.get(key) || [];
      if (neighbours.length < 6) {
        distances.set(key, 0);
        queue.push(cloud);
      }
    }
    for (let index = 0; index < queue.length; index += 1) {
      const cloud = queue[index];
      const key = `${cloud.gridColumn}:${cloud.gridRow}`;
      const nextDistance = (distances.get(key) || 0) + 1;
      for (const neighbour of neighbourMap.get(key) || []) {
        const neighbourKey = `${neighbour.gridColumn}:${neighbour.gridRow}`;
        if (distances.has(neighbourKey)) continue;
        distances.set(neighbourKey, nextDistance);
        queue.push(neighbour);
      }
    }
    return distances;
  }

  function blendedHexBorderColor(cloud, clouds, neighbours = rainCloudNeighbours(cloud, clouds)) {
    const own = rainLevelRgb(cloud.level);
    const neighbourAverage = neighbours.length
      ? neighbours.reduce((sum, candidate) => {
        const color = rainLevelRgb(candidate.level);
        return sum.map((value, index) => value + color[index]);
      }, [0, 0, 0]).map((value) => value / neighbours.length)
      : own;
    // Lift the original cell colour toward a soft highlight while retaining
    // a small amount of the neighbouring colour at shared edges.
    const mixed = own.map((value, index) => Math.min(255, Math.round(value * 0.56 + neighbourAverage[index] * 0.14 + 255 * 0.30)));
    return `rgb(${mixed.join(",")})`;
  }

  function rainHexFillOpacity(cloud, neighbours = [], boundaryDistance = 0) {
    // A closed honeycomb cell is 70% transparent. Each open side makes the
    // cell 10 percentage points less transparent, so exposed cells remain
    // legible without losing the soft map underneath.
    const openSides = Math.max(0, 6 - neighbours.length);
    const edgeFade = Math.min(0.16, 0.12 / (Math.max(0, Number(boundaryDistance) || 0) + 1));
    return Math.max(0.1, 0.7 - openSides * 0.1 - edgeFade);
  }

  function rainHexBorderOpacity(neighbours, boundaryDistance = 0) {
    // Borders use the same 0.7 baseline as fills, but lose only 5 percentage
    // points per open side. The edge-distance fade softens large clusters.
    const openSides = Math.max(0, 6 - neighbours.length);
    const edgeFade = Math.min(0.12, 0.09 / (Math.max(0, Number(boundaryDistance) || 0) + 1));
    return Math.max(0.1, 0.7 - openSides * 0.05 - edgeFade);
  }

  function rainCloudFeatureCollection(clouds = rainCloudsForViewport()) {
    const neighbourMap = rainCloudNeighbourMap(clouds);
    const boundaryDistanceMap = rainCloudBoundaryDistanceMap(clouds, neighbourMap);
    return {
      type: "FeatureCollection",
      features: clouds.map((cloud) => ({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: radarHoneycombPolygon(cloud) },
        properties: {
          level: cloud.level,
          coverage: cloud.coverage,
          fillOpacity: rainHexFillOpacity(cloud, rainCloudNeighbours(cloud, clouds, neighbourMap), boundaryDistanceMap.get(`${cloud.gridColumn}:${cloud.gridRow}`) || 0),
          borderColor: blendedHexBorderColor(cloud, clouds, rainCloudNeighbours(cloud, clouds, neighbourMap)),
          borderOpacity: rainHexBorderOpacity(rainCloudNeighbours(cloud, clouds, neighbourMap), boundaryDistanceMap.get(`${cloud.gridColumn}:${cloud.gridRow}`) || 0),
          intensity: Number(cloud.level) === 0
            ? Math.min(1, 0.18 + (Number(cloud.coverage) || 0) * 0.42)
            : Math.min(1, (Number(cloud.level) || 0) / 3 * 0.78 + (Number(cloud.coverage) || 0) * 0.22)
        }
      }))
    };
  }

  function rainCloudFillFeatureCollection(clouds, baseCollection = rainCloudFeatureCollection(clouds)) {
    return {
      type: "FeatureCollection",
      features: baseCollection.features.map((feature, index) => ({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: radarHoneycombRingPolygon(clouds[index], 1, 0.84) },
        properties: {
          level: feature.properties.level,
          fillOpacity: feature.properties.fillOpacity
        }
      }))
    };
  }

  function rainCloudFadeFeatureCollection(clouds, baseCollection = rainCloudFeatureCollection(clouds)) {
    return {
      type: "FeatureCollection",
      features: baseCollection.features.map((feature, index) => ({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: radarHoneycombRingPolygon(clouds[index], 0.84, 0.64) },
        properties: {
          level: feature.properties.level,
          fadeOpacity: Math.max(0.02, Number(feature.properties.fillOpacity) - 0.025)
        }
      }))
    };
  }

  function rainCloudCoreFeatureCollection(clouds, baseCollection = rainCloudFeatureCollection(clouds)) {
    return {
      type: "FeatureCollection",
      features: baseCollection.features.map((feature, index) => ({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: radarHoneycombPolygon(clouds[index], 0.64) },
        properties: {
          level: feature.properties.level,
          coreOpacity: Math.max(0.02, Number(feature.properties.fillOpacity) - 0.05)
        }
      }))
    };
  }

  function rainPointFeatureCollection(clouds = rainCloudsForViewport()) {
    const features = [];
    const featureLimit = 12000;
    for (const cloud of clouds) {
      if (features.length >= featureLimit) break;
      const level = Number(cloud.level) || 0;
      const coverage = Number(cloud.coverage) || 0;
      const baseWeight = Math.min(1, 0.38 + level * 0.24 + coverage * 0.62);
      const iconIndex = level >= 3 ? 5 : level === 2 ? 4 : level === 1 ? 3 : coverage > 0.45 ? 2 : 1;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [cloud.lon, cloud.lat] },
        properties: { kind: "intensity", level, coverage, rainIcon: `rain-strength-${iconIndex}` }
      });
      const ringSize = level >= 2 ? 4 : coverage > 0.35 ? 3 : 2;
      const polygon = cloud.polygon?.[0] || [];
      const lonStep = Math.max(0.008, Math.abs((polygon[1]?.[0] || cloud.lon) - (polygon[0]?.[0] || cloud.lon)));
      const latStep = Math.max(0.006, Math.abs((polygon[3]?.[1] || cloud.lat) - (polygon[0]?.[1] || cloud.lat)));
      for (let index = 0; index < ringSize && features.length < featureLimit; index += 1) {
        const phase = rainShapeSeed + (cloud.x || 0) * 0.17 + (cloud.y || 0) * 0.31 + index * 2.41;
        const angle = phase % (Math.PI * 2);
        const distance = index === 0 ? 0 : 0.2 + ((Math.sin(phase * 1.7) + 1) / 2) * 0.82;
        const intensityJitter = 0.72 + ((Math.sin(phase * 2.1) + 1) / 2) * 0.58;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [cloud.lon + Math.cos(angle) * lonStep * distance, cloud.lat + Math.sin(angle) * latStep * distance] },
          properties: { kind: "heat", level, coverage, heatWeight: Math.min(1, baseWeight * intensityJitter) }
        });
      }
    }
    return {
      type: "FeatureCollection",
      features
    };
  }

  function rainViewportVisible() {
    return Boolean(map && radar?.imageUrl && activeLayer === "rain" && map.getZoom() >= RAIN_DISPLAY_MIN_ZOOM);
  }

  function rainCloudsForViewport() {
    if (!rainViewportVisible()) return [];
    const bounds = map.getBounds?.();
    if (!bounds) return rainClouds;
    const longitudeSpan = Math.max(0.2, bounds.getEast() - bounds.getWest());
    const latitudeSpan = Math.max(0.2, bounds.getNorth() - bounds.getSouth());
    const lonPadding = Math.max(longitudeSpan * RAIN_VIEW_BUFFER_RATIO, 0.7);
    const latPadding = Math.max(latitudeSpan * RAIN_VIEW_BUFFER_RATIO, 0.45);
    const west = bounds.getWest() - lonPadding;
    const east = bounds.getEast() + lonPadding;
    const south = bounds.getSouth() - latPadding;
    const north = bounds.getNorth() + latPadding;
    return rainClouds.filter((cloud) => {
      if (cloud.lon >= west && cloud.lon <= east && cloud.lat >= south && cloud.lat <= north) return true;
      const polygon = cloud.polygon?.[0] || [];
      if (!polygon.length) return false;
      const longitudes = polygon.map(([lon]) => lon);
      const latitudes = polygon.map(([, lat]) => lat);
      return Math.max(...longitudes) >= west && Math.min(...longitudes) <= east && Math.max(...latitudes) >= south && Math.min(...latitudes) <= north;
    });
  }

  function rainCloudMarkerCells() {
    const buckets = new Map();
    for (const cloud of rainCloudsForViewport()) {
      const column = Math.floor((cloud.x || 0) / 40);
      const row = Math.floor((cloud.y || 0) / 40);
      const key = `${column}:${row}`;
      const current = buckets.get(key);
      if (!current || cloud.score > current.score) buckets.set(key, cloud);
    }
    return [...buckets.values()].sort((a, b) => b.score - a.score).slice(0, 120);
  }

  function updateRainLayerVisibility() {
    const visible = rainViewportVisible();
    ["weather-rain-heatmap-soft", "weather-rain-heatmap", "weather-rain-glow", "weather-rain-intensity-icons", "weather-rain-3d"].forEach((layerId) => {
      if (map?.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    });
    if (map?.getLayer("weather-rain-grid")) map.setLayoutProperty("weather-rain-grid", "visibility", visible ? "visible" : "none");
    if (map?.getLayer("weather-rain-cell-fade")) map.setLayoutProperty("weather-rain-cell-fade", "visibility", visible ? "visible" : "none");
    if (map?.getLayer("weather-rain-cell-core")) map.setLayoutProperty("weather-rain-cell-core", "visibility", visible ? "visible" : "none");
    if (map?.getLayer("weather-rain-grid-border")) map.setLayoutProperty("weather-rain-grid-border", "visibility", visible ? "visible" : "none");
    // SMHI is the comparison layer and must remain visible at the overview
    // zoom too; the local BIGPLUS hexagon layer still respects its own detail
    // zoom threshold above.
    if (map?.getLayer("smhi-radar")) map.setLayoutProperty("smhi-radar", "visibility", activeLayer === "rain" && Boolean(radar?.imageUrl) && smhiRadarOnTop ? "visible" : "none");
  }

  function scheduleRainViewportUpdate() {
    if (rainViewportRaf) return;
    rainViewportRaf = window.requestAnimationFrame(() => {
      rainViewportRaf = 0;
      updateRainCloudSource();
      updateRainLayerVisibility();
    });
  }

  function refreshRainMapMarkers() {
    if (!map || !map.isStyleLoaded()) return;
    clearRainMapMarkers();
    mountRainMapMarkers();
    updateRainMapScale();
  }

  function updateRainCloudSource() {
    const viewportClouds = rainCloudsForViewport();
    const clouds = rainCloudFeatureCollection(viewportClouds);
    const fills = rainCloudFillFeatureCollection(viewportClouds, clouds);
    const fade = rainCloudFadeFeatureCollection(viewportClouds, clouds);
    const core = rainCloudCoreFeatureCollection(viewportClouds, clouds);
    const points = rainPointFeatureCollection(viewportClouds);
    map?.getSource("weather-rain-clouds")?.setData(clouds);
    map?.getSource("weather-rain-fills")?.setData(fills);
    map?.getSource("weather-rain-cell-fade")?.setData(fade);
    map?.getSource("weather-rain-cell-core")?.setData(core);
    map?.getSource("weather-rain-points")?.setData(points);
  }

  function ensureRainStrengthIconLayer() {
    if (!map || !map.isStyleLoaded() || map.getLayer("weather-rain-intensity-icons")) return;
    map.addLayer({
      id: "weather-rain-intensity-icons",
      type: "symbol",
      source: "weather-rain-points",
      filter: ["==", ["get", "kind"], "intensity"],
      layout: {
        visibility: "none",
        "icon-image": ["get", "rainIcon"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.012, 5, 0.016, 8, 0.021, 10, 0.026, 13, 0.034],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "map",
        "icon-rotation-alignment": "map"
      },
      paint: {
        "icon-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.52, 5, 0.64, 8, 0.78, 13, 0.88]
      }
    });
  }

  function ensureRainStrengthIcons() {
    if (!map || !map.isStyleLoaded()) return;
    if (!rainStrengthIconsPromise) {
      rainStrengthIconsPromise = Promise.all(Object.entries(RAIN_STRENGTH_ICON_ASSETS).map(([name, url]) => new Promise((resolve) => {
        if (map.hasImage(name)) {
          resolve();
          return;
        }
        map.loadImage(url, (error, image) => {
          if (!error && image && !map.hasImage(name)) map.addImage(name, image, { pixelRatio: 2 });
          resolve();
        });
      }))).then(() => {
        ensureRainStrengthIconLayer();
        updateRainLayerVisibility();
      });
    }
  }

  function updateWeatherLocationMarker() {
    if (!map || !window.maplibregl || !Number.isFinite(Number(activePoint.lat)) || !Number.isFinite(Number(activePoint.lon))) return;
    if (!map.loaded()) return;
    if (!weatherLocationMarker) {
      const element = document.createElement("span");
      element.className = "weather-current-location-marker";
      element.setAttribute("aria-hidden", "true");
      element.innerHTML = "<span class=\"weather-current-location-pin\"><span></span></span>";
      weatherLocationMarker = new window.maplibregl.Marker({ element, anchor: "bottom", offset: [0, 0], draggable: false, pitchAlignment: "map", rotationAlignment: "map" });
    }
    weatherLocationMarker.setLngLat([activePoint.lon, activePoint.lat]);
    if (!weatherLocationMarker._map) weatherLocationMarker.addTo(map);
    updateWeatherLocationMarkerScale();
  }

  function updateWeatherLocationMarkerScale() {
    const markerElement = weatherLocationMarker?.getElement?.().querySelector(".weather-current-location-pin");
    const zoom = Number(map?.getZoom?.());
    if (!markerElement || !Number.isFinite(zoom)) return;
    const scale = Math.max(0.38, Math.min(1, 0.38 + ((zoom - 4) / 10) * 0.62));
    markerElement.style.setProperty("--location-scale", scale.toFixed(3));
  }

  function updatePikeWeatherMarker() {
    if (!map || !window.maplibregl || !map.loaded()) return;
    const assessment = pikeWeatherAssessment(currentItem() || {});
    if (!assessment || !Number.isFinite(Number(activePoint.lat)) || !Number.isFinite(Number(activePoint.lon))) {
      pikeWeatherMarker?.remove();
      return;
    }
    if (!pikeWeatherMarker) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "weather-pike-marker";
      element.setAttribute("aria-label", "Gäddprognos för vald plats");
      element.addEventListener("click", () => {
        const panel = $("#weatherPikeRecommendation");
        panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      pikeWeatherMarker = new window.maplibregl.Marker({ element, anchor: "bottom", offset: [22, 18] });
    }
    const element = pikeWeatherMarker.getElement();
    element.innerHTML = `<span aria-hidden="true">🐟</span><small>${escapeHtml(assessment.rating)}</small>`;
    element.title = `${assessment.name}: ${assessment.lure}, ${assessment.depth}`;
    pikeWeatherMarker.setLngLat([activePoint.lon, activePoint.lat]);
    if (!pikeWeatherMarker._map) pikeWeatherMarker.addTo(map);
  }

  function updateRainMapScale() {
    // Rain is rendered by geographic MapLibre layers. There are no DOM cloud
    // markers to scale when the map zooms or moves.
  }

  function mountRainMapMarkers() {
    // Legacy cloud and rain-pill markers are intentionally disabled. The
    // current renderer uses only geographic MapLibre sources and layers.
  }

  function rainMotionFeatureCollection() {
    if (!map || activeLayer !== "rain" || !radar?.imageUrl || !rainClouds.length) return EMPTY_FEATURE_COLLECTION;
    const item = currentItem() || {};
    const speed = finiteWeatherNumber(item.windSpeedMs);
    const incomingDirection = finiteWeatherNumber(item.windDirectionDeg);
    if (speed == null || incomingDirection == null || speed < 0.4) return EMPTY_FEATURE_COLLECTION;
    const minutes = Math.min(90, Math.max(30, (activeIndex + 1) * 15));
    const distanceKm = Math.min(55, Math.max(3, speed * minutes * 60 / 1000));
    // MET describes the direction the wind comes from. Rain cells usually move
    // downwind, so the visual arrow points 180 degrees onward as an estimate.
    const movementDirection = (incomingDirection + 180) % 360;
    const radians = movementDirection * Math.PI / 180;
    const latOffset = Math.cos(radians) * distanceKm / 111.32;
    const lonScale = Math.max(Math.cos(activePoint.lat * Math.PI / 180), 0.2);
    const lonOffset = Math.sin(radians) * distanceKm / (111.32 * lonScale);
    const start = [activePoint.lon, activePoint.lat];
    const end = [activePoint.lon + lonOffset, activePoint.lat + latOffset];
    return {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "LineString", coordinates: [start, end] }, properties: { kind: "motion" } },
        { type: "Feature", geometry: { type: "Point", coordinates: end }, properties: { kind: "motion-head", label: `Regnets möjliga riktning · ${Math.round(distanceKm)} km` } }
      ]
    };
  }

  function updateRainMotionSource() {
    map?.getSource("weather-rain-motion")?.setData(rainMotionFeatureCollection());
  }

  function renderRainCloudOverlay() {
    const overlay = ensureRainCloudOverlay();
    if (!overlay) return;
    clearRainMapMarkers();
    overlay.hidden = true;
    overlay.innerHTML = "";
    overlay.dataset.cloudCount = "0";
    overlay.dataset.markerCount = "0";
    updateRainCloudSource();
    updateRainLayerVisibility();
    updateRainMotionSource();
    refreshRainMapMarkers();
    scheduleRainAnimation();
  }

  function loadRainClouds(radarUrl) {
    const overlay = ensureRainCloudOverlay();
    if (!overlay || !radarUrl) return;
    overlay.dataset.rainCloudStatus = "loading";
    if (rainCloudImageUrl === radarUrl) {
      renderRainCloudOverlay();
      return;
    }
    rainCloudImageUrl = radarUrl;
    const requestId = ++rainCloudRequestId;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (requestId !== rainCloudRequestId) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        // Build a real pointy-top honeycomb in the radar image itself. The
        // old one-cell-per-square approach shifted alternate rows and made
        // the local polygons visibly diverge from the SMHI colour field.
        const hexRadius = RADAR_HEX_RADIUS_PX;
        const horizontalStep = Math.sqrt(3) * hexRadius;
        const verticalStep = 1.5 * hexRadius;
        const sampleOffsets = [
          [0, 0],
          [hexRadius * 0.52, 0],
          [-hexRadius * 0.52, 0],
          [0, hexRadius * 0.52],
          [0, -hexRadius * 0.52],
          [hexRadius * 0.3, hexRadius * 0.38],
          [-hexRadius * 0.3, -hexRadius * 0.38]
        ];
        const cells = [];
        const rowCount = Math.ceil((canvas.height - hexRadius * 2) / verticalStep);
        for (let gridRow = 0; gridRow < rowCount; gridRow += 1) {
          const centerY = hexRadius + gridRow * verticalStep;
          const rowOffset = gridRow % 2 ? horizontalStep * 0.5 : 0;
          const columnCount = Math.ceil((canvas.width - rowOffset - hexRadius) / horizontalStep);
          for (let gridColumn = 0; gridColumn < columnCount; gridColumn += 1) {
            const centerX = hexRadius + rowOffset + gridColumn * horizontalStep;
            if (centerX < 0 || centerX >= canvas.width || centerY < 0 || centerY >= canvas.height) continue;
            if (centerX < 120 && centerY < 80) continue;
            let colored = 0;
            let strongest = 0;
            for (const [offsetX, offsetY] of sampleOffsets) {
              const sampleX = Math.max(0, Math.min(canvas.width - 1, Math.round(centerX + offsetX)));
              const sampleY = Math.max(0, Math.min(canvas.height - 1, Math.round(centerY + offsetY)));
              const offset = (sampleY * canvas.width + sampleX) * 4;
              if (pixels[offset + 3] < 70) continue;
              const level = radarCellLevel(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
              if (level == null || level < MIN_DISPLAY_RADAR_LEVEL) continue;
              colored += 1;
              strongest = Math.max(strongest, level);
            }
            if (colored < 1) continue;
            const point = radarPixelToLngLat(centerX, centerY, canvas.width, canvas.height);
            const coverage = colored / sampleOffsets.length;
            const cloud = { ...point, level: strongest, coverage, score: strongest * 0.4 + coverage, scale: 1, x: centerX, y: centerY, centerX, centerY, gridColumn, gridRow, hexRadiusPx: hexRadius, radarWidth: canvas.width, radarHeight: canvas.height };
            cloud.polygon = radarHoneycombPolygon(cloud);
            cells.push(cloud);
          }
        }
        const visibleBounds = map?.getBounds?.();
        cells.sort((a, b) => {
          const aVisible = visibleBounds?.contains([a.lon, a.lat]) ? 1 : 0;
          const bVisible = visibleBounds?.contains([b.lon, b.lat]) ? 1 : 0;
          return bVisible - aVisible || b.score - a.score;
        });
        // Heatmaps need the full radar footprint; sparse representative points
        // are only useful for markers and leave rain bands visibly fragmented.
        rainClouds = cells;
        const markerBuckets = new Map();
        const bucketColumns = 4;
        const bucketRows = 4;
        for (const cell of cells) {
          const column = Math.min(bucketColumns - 1, Math.floor((cell.x / canvas.width) * bucketColumns));
          const row = Math.min(bucketRows - 1, Math.floor((cell.y / canvas.height) * bucketRows));
          const key = `${column}:${row}`;
          const current = markerBuckets.get(key);
          if (!current || cell.score > current.score) markerBuckets.set(key, cell);
        }
        rainMarkers = [...markerBuckets.values()].sort((a, b) => b.score - a.score).slice(0, 12);
        overlay.dataset.rainCloudStatus = "ready";
        renderRainCloudOverlay();
        renderWeatherFocus();
      } catch {
        overlay.dataset.rainCloudStatus = "processing-error";
        rainClouds = [];
        rainMarkers = [];
        renderRainCloudOverlay();
        renderWeatherFocus();
      }
    };
    image.onerror = () => {
      if (requestId !== rainCloudRequestId) return;
      overlay.dataset.rainCloudStatus = "image-error";
      rainClouds = [];
      rainMarkers = [];
      renderRainCloudOverlay();
      renderWeatherFocus();
    };
    image.src = radarUrl;
  }

  function timelineItemAt(index) {
    const timeline = timelineItems();
    const item = timeline[index];
    if (!item) return null;
    const filled = { ...item };
    ["temperatureC", "windSpeedMs", "windGustMs", "windDirectionDeg", "cloudCoverPercent", "precipitationMm", "pressureHpa", "humidityPercent", "dewPointC", "visibilityKm"].forEach((field) => {
      if (filled[field] != null) return;
      for (let distance = 1; distance < timeline.length; distance += 1) {
        const before = timeline[index - distance];
        const after = timeline[index + distance];
        const candidate = [before, after].find((entry) => entry && entry[field] != null);
        if (candidate) {
          filled[field] = candidate[field];
          break;
        }
      }
    });
    return filled;
  }

  function currentItem() {
    return timelineItemAt(activeIndex);
  }

  function timelineItems() {
    const timeline = data?.timeline || [];
    if (!timeline.length) return [];
    const now = Date.now();
    const firstFuture = timeline.findIndex((item) => {
      const time = Date.parse(item.time);
      return Number.isFinite(time) && time >= now - 2 * 60 * 1000;
    });
    return timeline.slice(firstFuture >= 0 ? firstFuture : Math.max(0, timeline.length - 1));
  }

  function forecastSlots15() {
    const timeline = timelineItems();
    if (!timeline.length) return [];
    const anchor = Date.parse(timeline[activeIndex]?.time || timeline[0].time);
    return Array.from({ length: 8 }, (_, slotIndex) => {
      const targetTime = anchor + slotIndex * 15 * 60 * 1000;
      const nearestIndex = timeline.reduce((best, item, index) => Math.abs(Date.parse(item.time) - targetTime) < Math.abs(Date.parse(timeline[best].time) - targetTime) ? index : best, 0);
      const item = timelineItemAt(nearestIndex) || timeline[nearestIndex];
      return { ...item, time: new Date(targetTime).toISOString(), slotIndex, actualTime: item.time };
    });
  }

  function forecastDisplaySlots() {
    const slots = forecastSlots15();
    const start = Math.max(0, Math.min(activeIndex, Math.max(0, slots.length - 1)));
    return Array.from({ length: 4 }, (_, index) => slots[Math.min(slots.length - 1, start + index * 2)])
      .filter((item, index, list) => item && list.findIndex((candidate) => candidate?.time === item.time) === index);
  }

  function weatherIconAsset(item, index) {
    const symbol = String(item?.symbolCode || "").toLowerCase();
    const rain = finiteWeatherNumber(item?.precipitationMm) || 0;
    const assetIndex = symbol.includes("thunder") ? 2 : symbol.includes("snow") ? 9 : symbol.includes("rain") || rain > 0.3 ? rain > 5 ? 5 : 4 : symbol.includes("wind") ? 8 : symbol.includes("night") ? 1 : symbol.includes("cloud") || symbol.includes("partly") ? 6 : index % WEATHER_ICON_ASSETS.length;
    return WEATHER_ICON_ASSETS[assetIndex];
  }

  function forecastFeature(item) {
    const timeline = timelineItems();
    const rainItem = item?.precipitationMm != null
      ? item
      : timeline.slice(activeIndex).find((entry) => finiteWeatherNumber(entry?.precipitationMm) != null) || item;
    const speed = finiteWeatherNumber(item?.windSpeedMs) || 0;
    const direction = finiteWeatherNumber(item?.windDirectionDeg);
    const minutes = Math.max(0, activeIndex) * 15;
    const radians = Number.isFinite(direction) ? direction * Math.PI / 180 : 0;
    const latOffset = Math.cos(radians) * speed * minutes * 60 / 111320;
    const lonScale = Math.max(Math.cos(activePoint.lat * Math.PI / 180), 0.2);
    const lonOffset = Math.sin(radians) * speed * minutes * 60 / (111320 * lonScale);
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [activePoint.lon + lonOffset, activePoint.lat + latOffset] },
      properties: { kind: "forecast", label: "MET-prognos", rain: finiteWeatherNumber(rainItem?.precipitationMm) ?? 0 }
    };
  }

  function savedPlaces() {
    const recent = readRecentPlaces().map((place) => ({ ...place, label: place.label || "Tidigare plats" }));
    const catches = (userCatches?.() || []).map((item, index) => {
      const location = locationFrom(item);
      if (!location) return null;
      const title = displayValue(item.location || item.water || item.measurement?.location, `Fångstplats ${index + 1}`);
      return { ...location, label: title };
    }).filter(Boolean);
    return [...recent, ...catches].filter((place, index, list) => list.findIndex((candidate) => candidate.lat === place.lat && candidate.lon === place.lon) === index).slice(0, 12);
  }

  function plannerPlaces() {
    return journalTrips().map((trip, index) => {
      const location = locationFrom(trip);
      return {
        lat: location?.lat,
        lon: location?.lon,
        label: trip.title || `Planerad tur ${index + 1}`,
        detail: [trip.location, trip.date].filter(Boolean).join(" · "),
        disabled: !location
      };
    }).slice(0, 8);
  }

  function ensureMap() {
    const target = $("#weatherMap");
    if (!target || !window.maplibregl) return;
    if (!map) {
      map = new window.maplibregl.Map({
        container: target,
        style: fishingLightStyle(),
        center: [activePoint.lon, activePoint.lat],
        zoom: WEATHER_DEFAULT_ZOOM,
        minZoom: WEATHER_MIN_ALLOWED_ZOOM,
        maxZoom: WEATHER_MAX_ALLOWED_ZOOM,
        attributionControl: false,
        cooperativeGestures: false,
        scrollZoom: true,
        touchZoomRotate: true,
        dragRotate: true,
        pitchWithRotate: true,
        touchPitch: true,
        preserveDrawingBuffer: true
      });
      map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-left");
      map.addControl(new window.maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("error", (event) => {
        console.warn("BIGPLUS weather map error", event.error || event);
        const status = $("#weatherStatus");
        if (status) status.textContent = "Kartan laddar väderlager, men baskartan svarar långsamt.";
      });
      map.on("style.load", () => {
        ensureWeatherLayers();
        updateMapLayers();
      });
      map.on("load", () => {
        updateWeatherLocationMarker();
        updatePikeWeatherMarker();
        updateMapLayers();
      });
      map.on("zoom", () => { updateWeatherLocationMarkerScale(); updateRainMapScale(); scheduleRainViewportUpdate(); scheduleRainAnimation(); });
      map.on("resize", () => { updateRainMapScale(); scheduleRainViewportUpdate(); scheduleRainAnimation(); });
      map.on("move", () => { scheduleRainViewportUpdate(); scheduleRainAnimation(); });
      map.on("moveend", () => { updateWeatherLocationMarker(); updateRainMotionSource(); refreshRainMapMarkers(); });
      map.on("zoomend", () => { updateWeatherLocationMarker(); updateWeatherLocationMarkerScale(); updateRainMotionSource(); refreshRainMapMarkers(); });
      map.on("rotate", scheduleRainAnimation);
      map.on("pitch", () => { updateRain3DPresentation(); scheduleRainAnimation(); });
      map.on("click", (event) => {
        if (locationLocked) {
          const status = $("#weatherStatus");
          if (status) status.textContent = "Platsen är låst. Lås upp för att välja en annan plats.";
          return;
        }
        const waterLayers = WATER_FEATURE_LAYERS.filter((layerId) => map.getLayer(layerId));
        const waterFeature = waterLayers.length
          ? map.queryRenderedFeatures(event.point, { layers: waterLayers }).find((feature) => feature.properties?.["name:sv"] || feature.properties?.name)
          : null;
        const waterName = waterFeature?.properties?.["name:sv"] || waterFeature?.properties?.name || "";
        const point = {
          lat: Number(event.lngLat.lat.toFixed(4)),
          lon: Number(event.lngLat.lng.toFixed(4)),
          label: waterName ? `${waterName} · vatten` : "Vald plats",
          waterName,
          isWater: Boolean(waterName)
        };
        loadPoint(point);
      });
    }
    const resizeWeatherMap = () => {
      if (!map) return;
      map.resize();
      if (map.isStyleLoaded?.()) {
        ensureWeatherLayers();
        updateMapLayers();
        scheduleRainViewportUpdate();
      }
    };
    // The view is switched from display:none to visible by the shell. Resize
    // again after that transition so MapLibre does not keep a zero-size canvas.
    [60, 260, 720].forEach((delay) => window.setTimeout(resizeWeatherMap, delay));
  }

  function ensureWeatherLayers() {
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getSource("weather-point")) map.addSource("weather-point", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
    if (!map.getLayer("weather-area")) map.addLayer({ id: "weather-area", type: "circle", source: "weather-point", filter: ["==", ["get", "kind"], "forecast"], paint: { "circle-color": "#2494f2", "circle-radius": 26, "circle-opacity": 0, "circle-stroke-width": 0 } });
    if (!map.getLayer("weather-point")) map.addLayer({ id: "weather-point", type: "circle", source: "weather-point", filter: ["==", ["get", "kind"], "point"], paint: { "circle-color": "#0f6fe8", "circle-radius": 8, "circle-opacity": 0, "circle-stroke-width": 0 } });
    if (!map.getLayer("weather-label")) map.addLayer({ id: "weather-label", type: "symbol", source: "weather-point", filter: ["==", ["get", "kind"], "point"], layout: { "text-field": ["get", "label"], "text-size": 12, "text-offset": [0, 1.5], "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#142c58", "text-halo-color": "#ffffff", "text-halo-width": 1.2 } });
    if (!map.getLayer("weather-water-wind-dot")) map.addLayer({ id: "weather-water-wind-dot", type: "circle", source: "weather-point", filter: ["==", ["get", "kind"], "water-wind"], paint: { "circle-color": "#16a6d9", "circle-radius": 12, "circle-opacity": 0.92, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
    if (!map.getLayer("weather-water-wind-label")) map.addLayer({ id: "weather-water-wind-label", type: "symbol", source: "weather-point", filter: ["==", ["get", "kind"], "water-wind"], layout: { "text-field": ["get", "windLabel"], "text-size": 11, "text-offset": [0, -2.1], "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#ffffff", "text-halo-color": "#073a53", "text-halo-width": 1.4 } });
    if (!map.getSource("weather-rain-motion")) map.addSource("weather-rain-motion", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
    if (!map.getLayer("weather-rain-motion-line")) map.addLayer({ id: "weather-rain-motion-line", type: "line", source: "weather-rain-motion", filter: ["==", ["get", "kind"], "motion"], layout: { visibility: "none", "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#c8f6ff", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 9, 3.5, 13, 5], "line-opacity": 0.9, "line-dasharray": [0.4, 1.25] } });
    if (!map.getLayer("weather-rain-motion-head")) map.addLayer({ id: "weather-rain-motion-head", type: "circle", source: "weather-rain-motion", filter: ["==", ["get", "kind"], "motion-head"], layout: { visibility: "none" }, paint: { "circle-color": "#35b9f4", "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 9, 6, 13, 8], "circle-opacity": 0.95, "circle-stroke-color": "#e7fbff", "circle-stroke-width": 2 } });
    if (!map.getLayer("weather-rain-motion-label")) map.addLayer({ id: "weather-rain-motion-label", type: "symbol", source: "weather-rain-motion", filter: ["==", ["get", "kind"], "motion-head"], layout: { visibility: "none", "text-field": ["get", "label"], "text-size": 10, "text-offset": [0, -1.7], "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#e9fbff", "text-halo-color": "#083149", "text-halo-width": 1.2 } });
    if (!map.getSource("weather-rain-clouds")) map.addSource("weather-rain-clouds", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
    if (!map.getSource("weather-rain-fills")) map.addSource("weather-rain-fills", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
    if (!map.getSource("weather-rain-cell-fade")) map.addSource("weather-rain-cell-fade", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
    if (!map.getSource("weather-rain-cell-core")) map.addSource("weather-rain-cell-core", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
    if (!map.getSource("weather-rain-points")) map.addSource("weather-rain-points", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
    if (!map.getLayer("weather-rain-heatmap-soft")) map.addLayer({
      id: "weather-rain-heatmap-soft",
      type: "heatmap",
      source: "weather-rain-points",
      filter: ["==", ["get", "kind"], "heat"],
      layout: { visibility: "none" },
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "heatWeight"], 0, 0, 0.25, 0.24, 0.55, 0.62, 1, 0.9],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.28, 5, 0.34, 8, 0.42, 13, 0.52],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 12, 5, 16, 8, 20, 13, 26],
        "heatmap-opacity": 0.18,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.04, "#0b6fd8", 0.12, "#2bb7ff", 0.26, "#24d8ed", 0.44, "#4ddd65", 0.64, "#e6df2b", 0.82, "#ff9223", 0.94, "#ff4539", 1, "#dc163d"]
      }
    });
    if (!map.getLayer("weather-rain-heatmap")) map.addLayer({
      id: "weather-rain-heatmap",
      type: "heatmap",
      source: "weather-rain-points",
      filter: ["==", ["get", "kind"], "heat"],
      layout: { visibility: "none" },
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "heatWeight"], 0, 0, 0.25, 0.3, 0.55, 0.72, 1, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.34, 5, 0.42, 8, 0.5, 10, 0.58, 13, 0.66],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 10, 5, 14, 8, 18, 10, 22, 13, 28],
        "heatmap-opacity": 0.24,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.03, "#0b7ce6", 0.12, "#3bc4ff", 0.26, "#2ee0ee", 0.44, "#57e363", 0.64, "#f0e02b", 0.82, "#ff9622", 0.94, "#ff4238", 1, "#df153e"]
      }
    });
    if (!map.getLayer("weather-rain-grid")) map.addLayer({
      id: "weather-rain-grid",
      type: "fill",
      source: "weather-rain-fills",
      layout: { visibility: "none" },
      paint: {
        "fill-antialias": true,
        "fill-color": ["match", ["get", "level"], 3, "#ff1848", 2, "#ffe800", 1, "#26ff74", "#00dcff"],
        "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.58],
        "fill-outline-color": "rgba(0,0,0,0)"
      }
    });
    if (!map.getLayer("weather-rain-cell-fade")) map.addLayer({
      id: "weather-rain-cell-fade",
      type: "fill",
      source: "weather-rain-cell-fade",
      layout: { visibility: "none" },
      paint: {
        "fill-antialias": true,
        "fill-color": ["match", ["get", "level"], 3, "#ff1848", 2, "#ffe800", 1, "#26ff74", "#00dcff"],
        "fill-opacity": ["coalesce", ["get", "fadeOpacity"], 0.18],
        "fill-outline-color": "rgba(0,0,0,0)"
      }
    });
    if (!map.getLayer("weather-rain-cell-core")) map.addLayer({
      id: "weather-rain-cell-core",
      type: "fill",
      source: "weather-rain-cell-core",
      layout: { visibility: "none" },
      paint: {
        "fill-antialias": true,
        "fill-color": ["match", ["get", "level"], 3, "#ff1848", 2, "#ffe800", 1, "#26ff74", "#00dcff"],
        "fill-opacity": ["coalesce", ["get", "coreOpacity"], 0.22],
        "fill-outline-color": "rgba(0,0,0,0)"
      }
    });
    if (!map.getLayer("weather-rain-grid-border")) map.addLayer({
      id: "weather-rain-grid-border",
      type: "line",
      source: "weather-rain-clouds",
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["coalesce", ["get", "borderColor"], "#244d5b"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.2, 7, 1.6, 11, 2.1, 14, 2.7],
        "line-opacity": ["*", ["coalesce", ["get", "borderOpacity"], 0.84], 0.7],
        "line-blur": 0.82
      }
    });
    if (!map.getLayer("weather-rain-glow")) map.addLayer({
      id: "weather-rain-glow",
      type: "circle",
      source: "weather-rain-points",
      filter: ["==", ["get", "kind"], "heat"],
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 8, 5, 11, 8, 14, 10, 17, 13, 20],
        "circle-color": ["match", ["get", "level"], 3, "#ef314b", 2, "#ff9d24", 1, "#5ce56c", "#31baff"],
        "circle-opacity": 0.18,
        "circle-blur": 0.92
      }
    });
    if (!map.getLayer("weather-rain-3d")) map.addLayer({
      id: "weather-rain-3d",
      type: "fill-extrusion",
      source: "weather-rain-clouds",
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": ["match", ["get", "level"], 3, "#ef5948", 2, "#f7d83d", 1, "#3bd68d", "#52c9ed"],
        "fill-extrusion-height": ["interpolate", ["linear"], ["get", "level"], 0, 160, 1, 300, 2, 480, 3, 680],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0
      }
    });
    ["weather-rain-heatmap-soft", "weather-rain-heatmap", "weather-rain-glow", "weather-rain-intensity-icons", "weather-rain-cell-fade", "weather-rain-cell-core", "weather-rain-grid-border", "weather-rain-3d", "weather-rain-motion-line", "weather-rain-motion-head", "weather-rain-motion-label"].forEach((layerId) => {
      if (map.getLayer(layerId) && map.getLayer("weather-label")) map.moveLayer(layerId, "weather-label");
    });
    updateRain3DPresentation();
  }

  function renderSmhiOverlayControl() {
    const button = $("#weatherSmhiOverlayButton");
    if (!button) return;
    if (button.dataset.smhiBound !== "true") {
      button.addEventListener("click", () => {
        smhiRadarOnTop = !smhiRadarOnTop;
        if (smhiRadarOnTop) setRadarLayer();
        updateSmhiRadarPresentation();
      });
      button.dataset.smhiBound = "true";
    }
    button.classList.toggle("is-active", smhiRadarOnTop);
    button.setAttribute("aria-pressed", String(smhiRadarOnTop));
    button.textContent = smhiRadarOnTop ? "SMHI ovanpå" : "Visa SMHI ovanpå";
  }

  function updateSmhiRadarPresentation() {
    renderSmhiOverlayControl();
    if (!map || !map.getLayer("smhi-radar")) return;
    const visible = activeLayer === "rain" && Boolean(radar?.imageUrl) && smhiRadarOnTop;
    map.setLayoutProperty("smhi-radar", "visibility", visible ? "visible" : "none");
    map.setPaintProperty("smhi-radar", "raster-opacity", visible ? 0.58 : 0);
  }

  function setRadarLayer() {
    if (!map || !map.isStyleLoaded()) return;
    if (!radar?.imageUrl) {
      if (map.getLayer("smhi-radar")) {
        map.setPaintProperty("smhi-radar", "raster-opacity", 0);
        map.setLayoutProperty("smhi-radar", "visibility", "none");
      }
      ["weather-rain-heatmap-soft", "weather-rain-heatmap", "weather-rain-glow", "weather-rain-grid", "weather-rain-grid-border", "weather-rain-intensity-icons", "weather-rain-cell-fade", "weather-rain-cell-core", "weather-rain-3d"].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
      });
      renderSmhiOverlayControl();
      renderRainCloudOverlay();
      return;
    }
    const radarUrl = radar.imageUrl?.startsWith("/") ? `${API_ROOT}${radar.imageUrl}` : radar.imageUrl;
    loadRainClouds(radarUrl);
    const coordinates = RADAR_BOUNDS;
    const coordinatesKey = JSON.stringify(coordinates);
    const radarSource = map.getSource("smhi-radar");
    if (!radarSource) {
      map.addSource("smhi-radar", { type: "image", url: radarUrl, coordinates });
    } else if ((radarImageUrl !== radarUrl || radarCoordinatesKey !== coordinatesKey) && typeof radarSource.updateImage === "function") {
      radarSource.updateImage({ url: radarUrl, coordinates });
    }
    radarImageUrl = radarUrl;
    radarCoordinatesKey = coordinatesKey;
    if (!map.getLayer("smhi-radar")) {
      map.addLayer({ id: "smhi-radar", type: "raster", source: "smhi-radar", paint: { "raster-opacity": 0.78, "raster-saturation": 0.45, "raster-contrast": 0.2, "raster-brightness-min": 0, "raster-brightness-max": 1, "raster-fade-duration": 0, "raster-resampling": "linear" } });
    }
    updateSmhiRadarPresentation();
    // Image sources can finish after the layer is created. Re-apply the
    // visibility and repaint once MapLibre has received the raster tile.
    map.once("idle", () => {
      if (!map || !map.getLayer("smhi-radar")) return;
      updateSmhiRadarPresentation();
      map.triggerRepaint();
    });
    updateRainLayerVisibility();
    renderRainCloudOverlay();
  }

  function scheduleRadarLayerSync() {
    [0, 250, 800, 1800].forEach((delay) => {
      window.setTimeout(() => {
        if (!map || !radar?.imageUrl) return;
        if (map.isStyleLoaded()) setRadarLayer();
        else map.once("idle", setRadarLayer);
      }, delay);
    });
  }

  function updateMapLayers() {
    if (!map || !map.isStyleLoaded()) return;
    ensureWeatherLayers();
    setRadarLayer();
    const item = currentItem();
    const paint = layerPaint(activeLayer, item || {});
    const gust = finiteWeatherNumber(item?.windGustMs);
    const waterWindFeature = activePoint.isWater ? {
      type: "Feature",
      geometry: { type: "Point", coordinates: [activePoint.lon, activePoint.lat] },
      properties: {
        kind: "water-wind",
        windLabel: gust == null ? "Byvind --" : `Byvind ${gust.toFixed(1)} m/s`,
        label: activePoint.waterName || activePoint.label || "Vattenpunkt"
      }
    } : null;
    map.getSource("weather-point")?.setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [activePoint.lon, activePoint.lat] },
        properties: { kind: "point", label: activePoint.label || "Väderplats" }
      }, forecastFeature(item || {}), ...(waterWindFeature ? [waterWindFeature] : [])]
    });
    updateWeatherLocationMarker();
    updateRainMotionSource();
    ["weather-rain-motion-line", "weather-rain-motion-head", "weather-rain-motion-label"].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", activeLayer === "rain" && radar?.imageUrl ? "visible" : "none");
    });
    map.setPaintProperty("weather-area", "circle-color", paint.color);
    map.setPaintProperty("weather-area", "circle-radius", paint.radius);
    map.setPaintProperty("weather-area", "circle-opacity", paint.opacity);
  }

  function renderHeatmapLegend() {
    const target = $("#weatherHeatmapLegend");
    if (!target) return;
    const configs = {
      rain: { title: "Regn", unit: "mm/h", colors: ["#0b7ce6", "#3bc4ff", "#57e363", "#f0e02b", "#ff9622", "#ff4238"], labels: ["0", "0,5", "2", "5", "10", "20+"] },
      wind: { title: "Vind", unit: "m/s", colors: ["#27c96f", "#b7d932", "#f3c52b", "#f27b26", "#d83a3a"], labels: ["0", "3", "6", "10", "15+"] },
      gust: { title: "Byvind", unit: "m/s", colors: ["#27c96f", "#b7d932", "#f3c52b", "#f27b26", "#d83a3a"], labels: ["0", "5", "8", "12", "18+"] },
      temp: { title: "Temperatur", unit: "°C", colors: ["#1676cf", "#43b9e8", "#f3d32c", "#f47a28", "#d83a3a"], labels: ["<0", "5", "10", "20", "30+"] },
      clouds: { title: "Moln", unit: "%", colors: ["#e2edf2", "#b5c7d0", "#849aa5", "#536a78", "#263b48"], labels: ["0", "25", "50", "75", "100"] }
    }[activeLayer];
    if (!configs) return;
    const sourceLabel = radar?.imageUrl && activeLayer === "rain" ? "BIGPLUS regnheatmap / SMHI radar" : activeLayer === "rain" ? "MET-prognos lokalt" : "Aktivt lager";
    target.innerHTML = `<div class="weather-legend-heading"><strong>${escapeHtml(configs.title)}</strong><small>${escapeHtml(configs.unit)}</small></div><div class="weather-legend-scale">${configs.colors.map((color, index) => `<span><i style="background:${color}"></i><small>${escapeHtml(configs.labels[index])}</small></span>`).join("")}</div><em>${escapeHtml(sourceLabel)}</em>`;
  }

  function renderMetricChart() {
    const target = $("#weatherCurrentPanel");
    if (!target) return;
    const items = forecastSlots15();
    const combinedWind = activeLayer === "wind" || activeLayer === "gust";
    const chartLayer = combinedWind ? "wind" : activeLayer;
    const unit = combinedWind ? "m/s" : chartUnit(chartLayer);
    const values = items.flatMap((entry) => combinedWind ? [chartMetric(entry, "wind"), chartMetric(entry, "gust")] : [chartMetric(entry, chartLayer)]).filter((value) => value != null);
    const max = Math.max(1, ...values);
    const bars = items.map((item, index) => {
      const primary = chartMetric(item, chartLayer);
      const secondary = combinedWind ? chartMetric(item, "gust") : null;
      const bar = (value, className) => `<i class="weather-chart-bar ${className}" style="height:${value == null ? 3 : Math.max(4, Math.round((value / max) * 100))}%" title="${value == null ? "--" : value.toFixed(1)} ${unit}"></i>`;
      const hour = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit" }).format(new Date(item.time));
      return `<span class="weather-chart-column"><span class="weather-chart-bar-group">${bar(primary, "weather-chart-primary")}${combinedWind ? bar(secondary, "weather-chart-secondary") : ""}</span><small>${index === 0 ? "Nu" : hour}</small></span>`;
    }).join("");
    const legend = combinedWind
      ? `<span><i class="weather-chart-swatch weather-chart-primary"></i>Vind</span><span><i class="weather-chart-swatch weather-chart-secondary"></i>Byvind</span>`
      : `<span><i class="weather-chart-swatch weather-chart-primary"></i>${escapeHtml(chartLayer === "rain" ? "Nederbörd" : layerLabels[chartLayer])}</span>`;
    const title = combinedWind ? "Vind + byvind" : chartLayer === "rain" ? "Nederbörd nästa timme" : layerLabels[chartLayer];
    const source = chartLayer === "rain" ? "MET Norway · prognos" : "MET Norway";
    target.insertAdjacentHTML("beforeend", `<div class="weather-metric-chart"><div class="weather-chart-header"><strong>${escapeHtml(title)}</strong><small>${unit}</small></div><div class="weather-chart-legend">${legend}<span class="weather-chart-source">${source}</span></div><div class="weather-chart-bars">${bars}</div></div>`);
  }

  function renderSources() {
    const target = $("#weatherSources");
    if (!target) return;
    const items = [
      ...(data?.sources || []),
      radar && { name: "SMHI Open Data Radar", type: "radar", updatedAt: radar.updatedAt }
    ].filter(Boolean);
    target.innerHTML = items.map((source) => `<span><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.type)} · uppdaterad ${escapeHtml(formatUpdated(source.updatedAt))}</small></span>`).join("");
    const sourceSummary = $("#weatherSourceSummary");
    if (sourceSummary) sourceSummary.textContent = `Källa: MET Norway & SMHI · uppdaterad ${formatUpdated(data?.updatedAt || radar?.updatedAt)}`;
    const radarOverlay = $("#weatherRadarOverlay");
    const radarTime = $("#weatherRadarOverlayTime");
    if (radarOverlay) radarOverlay.hidden = activeLayer !== "rain" || !radar?.imageUrl;
    if (radarTime) radarTime.textContent = radar?.imageUrl ? `SMHI radar · ${formatUpdated(radar.updatedAt)}` : radar?.reason || "Radar visas bara för aktuellt läge";
  }

  function renderPikeRecommendation() {
    const target = $("#weatherPikeRecommendation");
    if (!target) return;
    const assessment = pikeWeatherAssessment(currentItem() || {});
    if (!assessment) {
      target.innerHTML = `<div class="weather-pike-empty"><span aria-hidden="true">🐟</span><div><strong>Gäddindikator</strong><p>Fler vädervärden behövs för att bedöma gäddläget.</p></div></div>`;
      return;
    }
    target.innerHTML = `<div class="weather-pike-heading"><span class="weather-pike-icon" aria-hidden="true">🐟</span><div><small>GÄDDA · VÄDERMATCH</small><h2>${escapeHtml(assessment.name)}</h2></div><b>${escapeHtml(assessment.rating)}</b></div><p class="weather-pike-copy">Ikonen på kartan visar att väderläget passar gäddfiske här just nu.</p><div class="weather-pike-grid"><span><small>Het plats</small><strong>${escapeHtml(assessment.spot)}</strong></span><span><small>Troligt djup</small><strong>${escapeHtml(assessment.depth)}</strong></span><span><small>Drag</small><strong>${escapeHtml(assessment.lure)}</strong></span><span><small>Färg</small><strong>${escapeHtml(assessment.color)}</strong></span></div>`;
  }

  function renderTimeline() {
    const slider = $("#weatherTimeSlider");
    const label = $("#weatherTimeLabel");
    if (!slider || !label) return;
    const timeline = timelineItems();
    slider.max = String(Math.max(0, timeline.length - 1));
    slider.value = String(activeIndex);
    slider.disabled = timeline.length <= 1;
    const item = currentItem();
    label.textContent = item ? `${formatHour(item.time)} · ${item.sourceType}` : "Välj plats";
  }

  function renderNow() {
    const item = currentItem();
    const summary = weatherSummary(item || {});
    const current = $("#weatherCurrentPanel");
    if (current) {
      current.innerHTML = `<div><small>${escapeHtml(activePoint.label || "Vald plats")}</small><strong>${summary.temp}</strong><span>${escapeHtml(layerLabels[activeLayer])}: ${escapeHtml(summary[activeLayer === "gust" ? "gust" : activeLayer === "clouds" ? "clouds" : activeLayer === "rain" ? "rain" : activeLayer === "temp" ? "temp" : "wind"])}</span></div><div><b>Vind</b><strong>${summary.wind}</strong><small>${escapeHtml(degreesToCompass(item?.windDirectionDeg))}</small></div><div><b>Byvind</b><strong>${summary.gust}</strong><small>MET</small></div><div><b>Moln</b><strong>${summary.clouds}</strong><small>${escapeHtml(item?.sourceType || "prognos")}</small></div>`;
    }
    const big = $("#weatherFishingNowPanel");
    if (big) {
      big.hidden = !fishingNow;
      big.innerHTML = `<div><small>Jag fiskar nu</small><h2>${summary.temp}</h2><p>${escapeHtml(activePoint.label || "Vald plats")}</p></div><div class="weather-now-metrics"><span><b>${summary.wind}</b><small>Vind ${escapeHtml(degreesToCompass(item?.windDirectionDeg))}</small></span><span><b>${summary.gust}</b><small>Byvind</small></span><span><b>${summary.rain}</b><small>Regn</small></span><span><b>${summary.clouds}</b><small>Moln</small></span></div>`;
    }
    const sourceType = $("#weatherTypePill");
    if (sourceType) sourceType.textContent = item?.sourceType || "väder";
  }

  function renderNow() {
    const item = currentItem();
    const summary = weatherSummary(item || {});
    const placeLabel = activePoint.label || "Vald plats";
    const rainValue = finiteWeatherNumber(item?.precipitationMm);
    const windValue = finiteWeatherNumber(item?.windSpeedMs);
    const current = $("#weatherCurrentPanel");
    if (current) {
      const condition = rainValue != null && rainValue > 0.3 ? "Lätt regn" : "Mest uppehåll";
      const conditionCopy = rainValue != null && rainValue > 0.3 ? "Håll koll på nästa radarbild." : "Bra förhållanden för en fisketur.";
      current.innerHTML = `<div class="weather-now-heading"><span>JUST NU</span><small>${escapeHtml(placeLabel)}</small></div><div class="weather-now-hero"><strong>${summary.temp}</strong><span class="weather-now-symbol" aria-hidden="true">${rainValue != null && rainValue > 0.3 ? "☔" : "☁"}</span><b>${condition}</b></div><dl class="weather-now-list"><div><dt>Vind</dt><dd>${summary.wind}</dd></div><div><dt>Byvind</dt><dd>${summary.gust}</dd></div><div><dt>Riktning</dt><dd>${escapeHtml(degreesToCompass(item?.windDirectionDeg))} (${Number.isFinite(Number(item?.windDirectionDeg)) ? Math.round(Number(item.windDirectionDeg)) : "--"}°)</dd></div><div><dt>Nederbörd nästa timme</dt><dd>${summary.rain}</dd></div><div><dt>Lufttryck</dt><dd>${summary.pressure}</dd></div><div><dt>Daggpunkt</dt><dd>${summary.dewPoint}</dd></div><div><dt>Luftfuktighet</dt><dd>${summary.humidity}</dd></div><div><dt>Sikt</dt><dd>${summary.visibility}</dd></div></dl><div class="weather-condition-note"><strong>${windValue != null && windValue < 7 && (rainValue == null || rainValue <= 0.3) ? "BRA FÖRHÅLLANDEN" : "VÄDERLÄGET"}</strong><span>${conditionCopy}</span></div>`;
      renderMetricChart();
    }
    const place = $("#weatherActivePlace");
    if (place) place.textContent = placeLabel;
    const big = $("#weatherFishingNowPanel");
    if (big) {
      big.hidden = !fishingNow;
      big.innerHTML = `<div><small>Jag fiskar nu</small><h2>${summary.temp}</h2><p>${escapeHtml(placeLabel)}</p></div><div class="weather-now-metrics"><span><b>${summary.wind}</b><small>Vind ${escapeHtml(degreesToCompass(item?.windDirectionDeg))}</small></span><span><b>${summary.gust}</b><small>Byvind</small></span><span><b>${summary.rain}</b><small>Regn</small></span><span><b>${summary.clouds}</b><small>Moln</small></span></div>`;
    }
    const sourceType = $("#weatherTypePill");
    if (sourceType) sourceType.textContent = item?.sourceType || "väder";
    const best = $("#weatherBestWindow");
    if (best) best.innerHTML = `<h2>♧ BÄSTA VÄDERFÖNSTRET</h2><strong class="weather-insight-value">${windValue != null && windValue < 7 ? "Bra läge just nu" : "Välj lugnare vind"}</strong><ul><li>Svag vind och byvind</li><li>${rainValue != null && rainValue <= 0.3 ? "Låg risk för nederbörd" : "Nederbörd nära platsen"}</li><li>${summary.pressure} och ${summary.humidity} luftfuktighet</li><li>Bedömningen gäller väderförhållanden</li></ul>`;
    const sun = $("#weatherSunLight");
    if (sun) sun.innerHTML = `<h2>☀ SOL & LJUS</h2><div class="weather-sun-arc"><span>05:10</span><i></i><span>21:18</span></div><p>Dagsljus kvar</p><strong>Se prognosen för kvällens ljus</strong><small>Civil skymning 22:04</small>`;
    const pressure = $("#weatherPressure");
    if (pressure) pressure.innerHTML = `<h2>LUFTTRYCK</h2><strong class="weather-insight-value">${summary.pressure}</strong><b class="weather-good">Stabilt</b><hr><p>Förändring (3h)</p><strong>-- hPa ↗</strong><div class="weather-pressure-chart"><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
    const wind = $("#weatherWindDetails");
    if (wind) wind.innerHTML = `<h2>VINDDETALJER</h2><div class="weather-compass"><b>${escapeHtml(degreesToCompass(item?.windDirectionDeg))}</b><span>${Number.isFinite(Number(item?.windDirectionDeg)) ? Math.round(Number(item.windDirectionDeg)) : "--"}°</span></div><dl class="weather-wind-list"><div><dt>Vind</dt><dd>${summary.wind}</dd></div><div><dt>Byvind</dt><dd>${summary.gust}</dd></div><div><dt>Vind mot östra stranden</dt><dd>${windValue != null && windValue < 7 ? "Måttlig medvind" : "Kraftigare vind"}</dd></div></dl>`;
  }

  function renderLocationControls() {
    const lock = $("#weatherLocationLockButton");
    if (lock) {
      lock.textContent = locationLocked ? "Låst" : "Lås";
      lock.title = locationLocked ? "Lås upp vald plats" : "Lås vald plats";
      lock.setAttribute("aria-label", lock.title);
      lock.setAttribute("aria-pressed", String(locationLocked));
      lock.classList.toggle("is-locked", locationLocked);
    }
  }

  function renderSearchResults(locations = []) {
    const target = $("#weatherSearchResults");
    if (!target) return;
    searchLocations = locations.map((place) => ({
      ...place,
      isWater: Boolean(place.isWater || /sjo|vatten|an|alv|strom|lake|river/i.test(`${place.label || ""} ${place.type || ""}`)),
      waterName: place.waterName || (/sjo|vatten|an|alv|strom|lake|river/i.test(`${place.label || ""} ${place.type || ""}`) ? place.label : "")
    }));
    target.innerHTML = searchLocations.length
      ? searchLocations.map((place, index) => `<button type="button" data-weather-search="${index}"><strong>${escapeHtml(place.label)}</strong><small>${escapeHtml(place.type || (place.isWater ? "vatten" : "plats"))}</small></button>`).join("")
      : "<p>Ingen svensk plats hittades.</p>";
    target.hidden = false;
  }

  async function searchPlaces(query) {
    const target = $("#weatherSearchResults");
    if (!target) return;
    target.hidden = false;
    target.innerHTML = "<p>Söker plats...</p>";
    try {
      const result = await searchWeatherPlaces(query);
      renderSearchResults(result.locations || []);
    } catch (error) {
      target.innerHTML = `<p>${escapeHtml(error.message || "Kunde inte söka plats.")}</p>`;
    }
  }

  function renderPlaceLists() {
    const saved = $("#weatherSavedPlaces");
    if (saved) {
      const places = savedPlaces();
      saved.innerHTML = places.length
        ? places.map((place, index) => `<button type="button" data-weather-saved="${index}"><strong>${escapeHtml(place.label)}</strong><small>${place.lat.toFixed(3)}, ${place.lon.toFixed(3)}</small></button>`).join("")
        : `<p>Inga sparade platser med koordinater än.</p>`;
    }
    const planner = $("#weatherPlannerTrips");
    if (planner) {
      const trips = plannerPlaces();
      planner.innerHTML = trips.length
        ? trips.map((trip, index) => `<button type="button" data-weather-trip="${index}" ${trip.disabled ? "disabled" : ""}><strong>${escapeHtml(trip.label)}</strong><small>${escapeHtml(trip.disabled ? "Saknar koordinater" : trip.detail || "Planner")}</small></button>`).join("")
        : `<p>Inga Planner-resor skapade än.</p>`;
    }
  }

  function renderForecastList() {
    const target = $("#weatherForecastList");
    if (!target) return;
    target.innerHTML = timelineItems().slice(activeIndex, activeIndex + 8).map((item) => {
      const summary = weatherSummary(item);
      return `<article><time>${escapeHtml(formatHour(item.time))}</time><strong>${summary.temp}</strong><span>${summary.rain} regn</span><small>${summary.wind} · ${escapeHtml(item.sourceType)}</small></article>`;
    }).join("");
  }

  function renderForecastList() {
    const target = $("#weatherForecastList");
    if (!target) return;
    target.innerHTML = timelineItems().slice(activeIndex, activeIndex + 8).map((_, index) => {
      const item = timelineItemAt(activeIndex + index);
      const summary = weatherSummary(item);
      const rainValue = finiteWeatherNumber(item.precipitationMm);
      const icon = rainValue != null && rainValue > 0.3 ? "☔" : index > 2 ? "☀" : "☁";
      const hour = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.time));
      return `<article class="weather-hour-card${index === 0 ? " is-now" : ""}"><time>${index === 0 ? "NU" : hour}</time>${index === 0 ? `<small>${hour}</small>` : ""}<span class="weather-hour-icon" aria-hidden="true">${icon}</span><strong>${summary.temp}</strong><span class="weather-hour-metric weather-hour-wind">↗ ${summary.wind.replace(" m/s", "")}</span><span class="weather-hour-metric weather-hour-gust">↗ ${summary.gust.replace(" m/s", "")}</span><span class="weather-hour-rain">♧ ${summary.rain}</span></article>`;
    }).join("");
  }

  function renderForecastList() {
    const target = $("#weatherForecastList");
    if (!target) return;
    target.innerHTML = forecastDisplaySlots().map((item, index) => {
      const summary = weatherSummary(item);
      const rainValue = finiteWeatherNumber(item.precipitationMm);
      const hour = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.time));
      const amount = rainValue == null ? "--" : rainValue.toFixed(1);
      return `<article class="weather-hour-card${index === 0 ? " is-now" : ""}"><time>${index === 0 ? "NU" : hour}</time>${index === 0 ? `<small>${hour}</small>` : ""}<img class="weather-hour-icon" src="${weatherIconAsset(item, index)}" alt="${rainValue != null && rainValue > 0.3 ? "Regn" : "Väder"}"><strong>${summary.temp}</strong><span class="weather-hour-rain-value">${amount} mm</span><span class="weather-hour-metric weather-hour-wind">Vind ${summary.wind.replace(" m/s", "")} m/s</span><span class="weather-hour-rain">${escapeHtml(item.sourceType || "prognos")}</span></article>`;
    }).join("");
  }

  function renderLegacyRainChart() {
    const target = $("#weatherCurrentPanel");
    if (!target) return;
    const items = forecastSlots15();
    const values = items.map((item) => chartMetric(item, "rain"));
    const max = Math.max(0.5, ...values.filter((value) => value != null));
    const bars = items.map((item, index) => {
      const value = chartMetric(item, "rain");
      const height = value == null ? 4 : value === 0 ? 6 : Math.max(10, Math.round((value / max) * 100));
      const hour = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.time));
      return `<span class="weather-chart-column"><span class="weather-chart-bar-wrap"><b>${value == null ? "--" : value.toFixed(1)}</b><i class="weather-chart-bar weather-chart-primary" style="height:${height}%"></i></span><small>${index === 0 ? "Nu" : hour}</small></span>`;
    }).join("");
    target.insertAdjacentHTML("beforeend", `<div class="weather-metric-chart weather-rain-chart"><div class="weather-chart-header"><strong>Regn var 15:e minut</strong><small>mm/h</small></div><div class="weather-chart-legend"><span><i class="weather-chart-swatch weather-chart-primary"></i>Regn</span><span class="weather-chart-max">${max.toFixed(1)} mm/h</span></div><div class="weather-chart-bars">${bars}</div></div>`);
  }

  function formatClock(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function localRainSummary() {
    const bounds = map?.getBounds?.();
    const pointLat = Number(activePoint.lat) || 58.4;
    const pointLon = Number(activePoint.lon) || 15.6;
    const nearPoint = (cloud) => {
      const latDistance = (Number(cloud.lat) - pointLat) * 111.32;
      const lonDistance = (Number(cloud.lon) - pointLon) * 111.32 * Math.max(Math.cos(pointLat * Math.PI / 180), 0.2);
      return Math.hypot(latDistance, lonDistance) <= 150;
    };
    const visibleClouds = rainClouds.filter((cloud) => (!bounds || bounds.contains([cloud.lon, cloud.lat])) && nearPoint(cloud));
    const clouds = visibleClouds.length ? visibleClouds : rainClouds.filter(nearPoint);
    if (!clouds.length) return { area: "Ingen radaraktivitet", strength: "0 mm/h", note: "Ingen färgad nederbörd syns i aktuell radarbild.", hasRain: false };
    const longitudes = clouds.map((cloud) => Number(cloud.lon)).filter(Number.isFinite);
    const latitudes = clouds.map((cloud) => Number(cloud.lat)).filter(Number.isFinite);
    const latitude = pointLat;
    const widthKm = Math.max(1, (Math.max(...longitudes) - Math.min(...longitudes)) * 111.32 * Math.max(Math.cos(latitude * Math.PI / 180), 0.2));
    const heightKm = Math.max(1, (Math.max(...latitudes) - Math.min(...latitudes)) * 111.32);
    const areaKm2 = Math.max(1, Math.round(widthKm * heightKm));
    const maxLevel = Math.max(...clouds.map((cloud) => Number(cloud.level) || 0));
    const strength = maxLevel >= 3 ? "Kraftigt regn" : maxLevel === 2 ? "Regn" : "Lätt regn";
    return { area: `ca ${areaKm2} km²`, strength, note: `${clouds.length} radarområden syns nära platsen.`, hasRain: true };
  }

  function renderWeatherFocus() {
    const item = currentItem() || {};
    const slots = forecastSlots15();
    const rainSlots = slots.filter((slot) => {
      const value = finiteWeatherNumber(slot.precipitationMm);
      return value != null && value > 0.1;
    });
    const rainPanel = $("#weatherRainFocus");
    if (rainPanel) {
      const local = localRainSummary();
      const peak = rainSlots.length ? Math.max(...rainSlots.map((slot) => finiteWeatherNumber(slot.precipitationMm) || 0)) : 0;
      const until = rainSlots.length ? formatClock(rainSlots[rainSlots.length - 1].time) : "Uppehåll";
      $("#weatherRainFocusTitle").textContent = `Regn nära ${activePoint.label || "platsen"}`;
      $("#weatherRainAreaValue").textContent = local.area;
      $("#weatherRainUntilValue").textContent = until;
      $("#weatherRainPeakValue").textContent = peak ? `${peak.toFixed(1)} mm / 15 min` : local.strength;
      $("#weatherRainFocusNote").textContent = rainSlots.length
        ? `${local.note} Prognosen visar nederbörd fram till ${until}.`
        : `${local.note} Ingen nederbörd i MET Norway-prognosen de närmaste två timmarna.`;
      $("#weatherRainFocusSource").textContent = `Källa: SMHI radar · MET Norway · uppdaterad ${formatUpdated(data?.updatedAt || radar?.updatedAt)}`;
      rainPanel.classList.toggle("has-rain", Boolean(rainSlots.length || local.hasRain));
      rainPanel.classList.toggle("is-clear", !rainSlots.length && !local.hasRain);
    }
    const waterPanel = $("#weatherWaterFocus");
    if (waterPanel) {
      const water = Boolean(activePoint.isWater);
      const wind = finiteWeatherNumber(item.windSpeedMs);
      const gust = finiteWeatherNumber(item.windGustMs);
      $("#weatherWaterFocusTitle").textContent = water ? (activePoint.waterName || activePoint.label || "Vald vattenpunkt") : "Välj en sjö eller ett vattendrag";
      $("#weatherWaterWindValue").textContent = wind == null ? "--" : `${wind.toFixed(1)} m/s`;
      $("#weatherWaterGustValue").textContent = gust == null ? "--" : `${gust.toFixed(1)} m/s`;
      $("#weatherWaterDirectionValue").textContent = degreesToCompass(item.windDirectionDeg);
      $("#weatherWaterFocusNote").textContent = water ? "Vind och byvind hämtas för den klickade vattenpunkten." : "Klicka på en namngiven sjö eller å på kartan.";
      waterPanel.classList.toggle("is-selected", water);
    }
  }

  function renderAll() {
    renderTimeline();
    renderNow();
    renderLocationControls();
    renderSources();
    renderHeatmapLegend();
    renderWeatherFocus();
    renderPlaceLists();
    renderForecastList();
    renderPikeRecommendation();
    if (radar?.imageUrl) {
      const radarUrl = radar.imageUrl.startsWith("/") ? `${API_ROOT}${radar.imageUrl}` : radar.imageUrl;
      loadRainClouds(radarUrl);
    } else {
      renderRainCloudOverlay();
    }
    updateMapLayers();
    updatePikeWeatherMarker();
  }

  async function loadRadar(time = currentItem()?.time) {
    const requestId = ++radarRequestId;
    let result = null;
    try {
      result = await getWeatherRadar(time);
    } catch {
      // A requested timestamp may be between SMHI radar frames.
    }
    // SMHI radar is an observation/composite, not a forecast layer. A slider
    // time can fall between radar frames or be several hours ahead, so always
    // prefer the latest available image for the optional comparison overlay.
    // The forecast slider still controls the Bigplus weather data separately.
    try {
      const latest = await getWeatherRadar();
      if (latest?.imageUrl) result = latest;
    } catch {
      // Keep a requested-time image if the latest-image request is unavailable.
    }
    if (requestId !== radarRequestId) return;
    radar = result;
    if (radar?.imageUrl) {
      const radarUrl = radar.imageUrl.startsWith("/") ? `${API_ROOT}${radar.imageUrl}` : radar.imageUrl;
      loadRainClouds(radarUrl);
    }
    renderSources();
    renderHeatmapLegend();
    updateMapLayers();
    scheduleRadarLayerSync();
  }

  function queueRadarLoad() {
    window.clearTimeout(radarTimer);
    radarTimer = window.setTimeout(() => loadRadar(currentItem()?.time), 160);
  }

  function placeViewBounds(place) {
    const raw = place?.bbox || place?.boundingbox || place?.bounds;
    if (Array.isArray(raw) && raw.length >= 4 && raw.every((value) => Number.isFinite(Number(value)))) {
      const values = raw.map(Number);
      const looksLikeNominatim = values[0] <= values[1] && values[2] <= values[3] && Math.abs(values[0]) <= 90 && Math.abs(values[1]) <= 90;
      const south = looksLikeNominatim ? values[0] : values[1];
      const north = looksLikeNominatim ? values[1] : values[3];
      const west = looksLikeNominatim ? values[2] : values[0];
      const east = looksLikeNominatim ? values[3] : values[2];
      if (south < north && west < east) return [[west, south], [east, north]];
    }
    if (raw && Number.isFinite(Number(raw.west)) && Number.isFinite(Number(raw.south)) && Number.isFinite(Number(raw.east)) && Number.isFinite(Number(raw.north))) {
      return [[Number(raw.west), Number(raw.south)], [Number(raw.east), Number(raw.north)]];
    }
    if (!place?.isWater) return null;
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const longitudeSpan = 0.035 / Math.max(Math.cos(latitude * Math.PI / 180), 0.35);
    return [[longitude - longitudeSpan, latitude - 0.025], [longitude + longitudeSpan, latitude + 0.025]];
  }

  async function loadPoint(point = activePoint) {
    activePoint = {
      ...point,
      isWater: Boolean(point.isWater || /sjo|vatten|an|alv|strom|lake|river/i.test(`${point.label || ""} ${point.type || ""}`)),
      waterName: point.waterName || (point.isWater ? String(point.label || "").replace(/\s+vatten$/i, "") : "")
    };
    const activePlace = $("#weatherActivePlace");
    if (activePlace) activePlace.textContent = activePoint.label || "Vald plats";
    savePoint(activePoint);
    const status = $("#weatherStatus");
    if (status) status.textContent = "Hämtar väder...";
    ensureMap();
    updateWeatherLocationMarker();
    try {
      data = await getWeatherPoint(activePoint.lat, activePoint.lon);
      activeIndex = 0;
      if (status) status.textContent = "Vädret är uppdaterat.";
      const bounds = placeViewBounds(activePoint);
      if (bounds) map?.fitBounds(bounds, { padding: { top: 120, right: 64, bottom: 120, left: 64 }, maxZoom: WEATHER_MAX_ALLOWED_ZOOM, duration: 650 });
      else map?.easeTo({ center: [activePoint.lon, activePoint.lat], zoom: Math.min(WEATHER_MAX_ALLOWED_ZOOM, Math.max(map.getZoom(), WEATHER_DEFAULT_ZOOM)), duration: 450 });
    } catch (error) {
      if (status) status.textContent = error.message || "Kunde inte hämta väder.";
    }
    renderAll();
  }

  function bind() {
    $("#weatherTimeSlider")?.addEventListener("input", (event) => {
      activeIndex = Number(event.target.value) || 0;
      renderAll();
      if (activeLayer === "rain") queueRadarLoad();
    });
    $("#weatherLayerControls")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-weather-layer]");
      if (!button) return;
      activeLayer = button.dataset.weatherLayer || "rain";
      $("#weatherLayerControls")?.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
      renderAll();
      if (activeLayer === "rain") queueRadarLoad();
    });
    $("#weatherTiltButton")?.addEventListener("click", () => {
      if (!map) return;
      mapIsTilted = !mapIsTilted;
      map.easeTo({ pitch: mapIsTilted ? 48 : 0, bearing: mapIsTilted ? -12 : 0, duration: 650 });
      const button = $("#weatherTiltButton");
      if (button) {
        button.textContent = mapIsTilted ? "Vinkla tillbaka" : "Vinkla karta";
        button.classList.toggle("is-active", mapIsTilted);
      }
    });
    $("#weatherExpandButton")?.addEventListener("click", () => {
      const panel = $(".weather-map-panel");
      const shell = $(".weather-shell");
      const sidePanel = $(".weather-side-panel");
      const button = $("#weatherExpandButton");
      if (!panel) return;
      const expanded = panel.classList.toggle("is-expanded");
      shell?.classList.toggle("is-map-expanded", expanded);
      if (sidePanel) sidePanel.hidden = expanded;
      button?.setAttribute("aria-pressed", String(expanded));
      button?.setAttribute("title", expanded ? "Förminska kartan" : "Förstora kartan");
      button?.setAttribute("aria-label", expanded ? "Förminska kartan" : "Förstora kartan");
      if (button) button.textContent = expanded ? "×" : "⛶";
      window.setTimeout(() => map?.resize(), 80);
    });
    $("#weatherFishingNowButton")?.addEventListener("click", () => {
      fishingNow = !fishingNow;
      $("#weatherFishingNowButton")?.classList.toggle("is-active", fishingNow);
      renderAll();
    });
    $("#weatherMyLocationButton")?.addEventListener("click", () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((position) => {
        loadPoint({ lat: position.coords.latitude, lon: position.coords.longitude, label: "Min plats" });
      });
    });
    $("#weatherUseMyLocationButton")?.addEventListener("click", () => {
      if (!navigator.geolocation) return;
      const status = $("#weatherStatus");
      if (status) status.textContent = "Hämtar din plats...";
      navigator.geolocation.getCurrentPosition(
        (position) => loadPoint({ lat: position.coords.latitude, lon: position.coords.longitude, label: "Min plats" }),
        () => { if (status) status.textContent = "Kunde inte läsa din plats. Sök efter en ort i stället."; }
      );
    });
    $("#weatherLocationLockButton")?.addEventListener("click", () => {
      locationLocked = !locationLocked;
      localStorage.setItem(WEATHER_LOCK_KEY, String(locationLocked));
      renderLocationControls();
      const status = $("#weatherStatus");
      if (status) status.textContent = locationLocked ? "Platsen är låst." : "Platsen är upplåst.";
    });
    $("#weatherPlaceSearchForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = $("#weatherPlaceSearchInput")?.value.trim();
      if (query) searchPlaces(query);
    });
    $("#weatherSearchResults")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-weather-search]");
      if (!button) return;
      const place = searchLocations[Number(button.dataset.weatherSearch)];
      if (!place) return;
      $("#weatherSearchResults").hidden = true;
      loadPoint(place);
    });
    $("#weatherSavedPlaces")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-weather-saved]");
      if (!button) return;
      const place = savedPlaces()[Number(button.dataset.weatherSaved)];
      if (place) loadPoint(place);
    });
    $("#weatherPlannerTrips")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-weather-trip]");
      if (!button || button.disabled) return;
      const trip = plannerPlaces()[Number(button.dataset.weatherTrip)];
      if (trip) loadPoint({ lat: trip.lat, lon: trip.lon, label: trip.label });
    });
  }

  async function renderWeather() {
    activeLayer = "rain";
    renderSmhiOverlayControl();
    $("#weatherLayerControls")?.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.weatherLayer === "rain"));
    ensureMap();
    renderPlaceLists();
    if (!data) {
      await loadInitialPoint();
      await loadRadar(currentItem()?.time);
    } else {
      renderAll();
      loadRadar();
    }
  }

  return { bind, renderWeather };
}
