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
const WEATHER_MAX_ALLOWED_ZOOM = WEATHER_MAX_ZOOM - 9;
const WEATHER_DEFAULT_ZOOM = WEATHER_MAX_ZOOM - 12;
const MIN_DISPLAY_RADAR_LEVEL = 0;
const RAIN_DISPLAY_MIN_ZOOM = 4.8;
const RAIN_VIEW_BUFFER_RATIO = 0.38;
const RAIN_CLOUD_PIN_OFFSET = [0, 0];
const WATER_FEATURE_LAYERS = ["water", "waterway", "water-names"];
// SMHI's Sweden composite PNG uses SWEREF99 TM corner coordinates.
// These official corners are transformed to WGS84 for MapLibre.
const RADAR_BOUNDS = [[5.28496, 69.78109], [29.799664, 69.419691], [23.727184, 53.685564], [9.319164, 53.869605]];
const WEATHER_ICON_ASSETS = Array.from({ length: 10 }, (_, index) => `/bigplus/assets/weather/weather-${index + 1}.png`);

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
      { id: "background", type: "background", paint: { "background-color": "#06294a" } },
      { id: "landcover-wood", type: "fill", source: "openmaptiles", "source-layer": "landcover", filter: ["match", ["get", "class"], ["wood", "forest", "grass", "scrub"], true, false], paint: { "fill-color": "#123a60", "fill-opacity": 0.94 } },
      { id: "landuse-soft", type: "fill", source: "openmaptiles", "source-layer": "landuse", paint: { "fill-color": "#194d73", "fill-opacity": 0.84 } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#073b74", "fill-opacity": 1 } },
      { id: "water-shadow", type: "line", source: "openmaptiles", "source-layer": "water", paint: { "line-color": "#0f79c2", "line-opacity": 0.76, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 10, 1.8] } },
      { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": "#1c8bd0", "line-opacity": 0.98, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.8, 12, 2.7] } },
      { id: "roads-major", type: "line", source: "openmaptiles", "source-layer": "transportation", filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false], paint: { "line-color": "#8fc9e8", "line-opacity": 0.38, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 12, 2.2] } },
      { id: "buildings", type: "fill", source: "openmaptiles", "source-layer": "building", minzoom: 12, paint: { "fill-color": "#4b88ad", "fill-opacity": 0.34 } },
      { id: "water-names", type: "symbol", source: "openmaptiles", "source-layer": "water_name", minzoom: 5, layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 10, 16], "text-font": ["Noto Sans Italic"], "symbol-placement": "point" }, paint: { "text-color": "#c5eeff", "text-halo-color": "rgba(3, 35, 69, .9)", "text-halo-width": 1.5 } },
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
  let weatherLocationMarker = null;
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
      const corners = cell.polygon[0].map(([lon, lat]) => map.project([lon, lat]));
      if (corners.length < 4) continue;
      const topLeft = corners[0];
      const topRight = corners[1];
      const bottomRight = corners[2];
      const bottomLeft = corners[3];
      const top = { x: (topLeft.x + topRight.x) / 2, y: (topLeft.y + topRight.y) / 2 };
      const bottom = { x: (bottomLeft.x + bottomRight.x) / 2, y: (bottomLeft.y + bottomRight.y) / 2 };
      if (top.x < -30 || top.x > width + 30 || top.y < -30 || top.y > height + 30) continue;
      const count = Number(cell.level) >= 2 ? 6 : cell.coverage > 0.25 ? 4 : 3;
      context.strokeStyle = rainAnimationColor(cell.level);
      context.lineWidth = Number(cell.level) >= 2 ? 1.45 : 1.1;
      context.lineCap = "round";
      context.shadowColor = context.strokeStyle;
      context.shadowBlur = 3;
      const projectedHeight = Math.max(12, Math.abs(bottom.y - top.y));
      const groundDirection = bottom.y >= top.y ? 1 : -1;
      const groundTravel = Math.min(160, Math.max(28, projectedHeight * 0.78));
      for (let index = 0; index < count; index += 1) {
        const seed = Math.abs((cell.x || 0) * 13 + (cell.y || 0) * 7 + index * 29) % 97 / 97;
        const fall = (seconds * (0.72 + Number(cell.level || 0) * 0.08) + seed) % 1;
        const across = (seed * 0.72 + index * 0.18) % 1;
        const startX = top.x + (bottom.x - top.x) * (0.12 + across * 0.76);
        const startY = top.y + (bottom.y - top.y) * 0.08 + groundDirection * fall * groundTravel;
        const length = Math.min(26, Math.max(9, projectedHeight * 0.16)) + Number(cell.level || 0) * 2;
        context.globalAlpha = tiltFactor * Math.min(0.9, 0.32 + (Number(cell.coverage) || 0) * 0.58);
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(startX + 3, startY + groundDirection * length);
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
    const easting = 126648 + (x / Math.max(1, width - 1)) * (1075693 - 126648);
    const northing = 7771252 - (y / Math.max(1, height - 1)) * (7771252 - 5983984);
    return sweref99TmToWgs84(easting, northing);
  }

  function radarCellPolygon(x, y, size, width, height) {
    const right = Math.min(width - 1, x + size);
    const bottom = Math.min(height - 1, y + size);
    return [
      [radarPixelToLngLat(x, y, width, height), radarPixelToLngLat(right, y, width, height), radarPixelToLngLat(right, bottom, width, height), radarPixelToLngLat(x, bottom, width, height), radarPixelToLngLat(x, y, width, height)]
        .map(({ lon, lat }) => [lon, lat])
    ];
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
    return Math.min(1.18, Math.max(0.74, 0.86 * (2 ** ((map.getZoom() - WEATHER_DEFAULT_ZOOM) * 0.18))));
  }

  function rainCloudFeatureCollection() {
    const clouds = rainCloudsForViewport();
    return {
      type: "FeatureCollection",
      features: clouds.map((cloud) => ({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: cloud.polygon },
        properties: {
          level: cloud.level,
          coverage: cloud.coverage,
          intensity: Number(cloud.level) === 0
            ? Math.min(1, 0.18 + (Number(cloud.coverage) || 0) * 0.42)
            : Math.min(1, (Number(cloud.level) || 0) / 3 * 0.78 + (Number(cloud.coverage) || 0) * 0.22)
        }
      }))
    };
  }

  function rainPointFeatureCollection() {
    const clouds = rainCloudsForViewport();
    const features = [];
    const featureLimit = 12000;
    for (const cloud of clouds) {
      if (features.length >= featureLimit) break;
      const level = Number(cloud.level) || 0;
      const coverage = Number(cloud.coverage) || 0;
      const baseWeight = Math.min(1, 0.38 + level * 0.24 + coverage * 0.62);
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
          properties: { level, coverage, heatWeight: Math.min(1, baseWeight * intensityJitter) }
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
    ["weather-rain-heatmap-soft", "weather-rain-heatmap", "weather-rain-glow", "weather-rain-3d"].forEach((layerId) => {
      if (map?.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    });
    if (map?.getLayer("weather-rain-grid")) map.setLayoutProperty("weather-rain-grid", "visibility", "none");
    if (map?.getLayer("smhi-radar")) map.setLayoutProperty("smhi-radar", "visibility", visible ? "visible" : "none");
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
    const clouds = rainCloudFeatureCollection();
    const points = rainPointFeatureCollection();
    map?.getSource("weather-rain-clouds")?.setData(clouds);
    map?.getSource("weather-rain-points")?.setData(points);
  }

  function updateWeatherLocationMarker() {
    if (!map || !window.maplibregl || !Number.isFinite(Number(activePoint.lat)) || !Number.isFinite(Number(activePoint.lon))) return;
    if (!map.loaded()) return;
    if (!weatherLocationMarker) {
      const element = document.createElement("span");
      element.className = "weather-current-location-pin";
      element.setAttribute("aria-hidden", "true");
      element.innerHTML = "<span></span>";
      weatherLocationMarker = new window.maplibregl.Marker({ element, anchor: "bottom", offset: [0, 0], draggable: false, pitchAlignment: "map", rotationAlignment: "map" });
    }
    weatherLocationMarker.setLngLat([activePoint.lon, activePoint.lat]);
    if (!weatherLocationMarker._map) weatherLocationMarker.addTo(map);
  }

  function updateRainMapScale() {
    const scale = rainMapScale();
    document.querySelectorAll("#weatherMap [data-weather-cloud]").forEach((element) => {
      const baseScale = Number(element.dataset.cloudScale) || 1;
      element.style.setProperty("--rain-cloud-render-scale", String(baseScale * scale));
    });
    document.querySelectorAll("#weatherMap .weather-rain-cloud-marker").forEach((element) => {
      element.style.setProperty("--rain-map-scale", String(scale));
    });
  }

  function mountRainMapMarkers() {
    if (!map || activeLayer !== "rain" || !radar?.imageUrl) return;
    const createMarker = (element, coordinates, anchor, offset = [0, 0]) => {
      const marker = new window.maplibregl.Marker({
        element,
        anchor,
        offset,
        pitchAlignment: "viewport",
        rotationAlignment: "viewport"
      }).setLngLat(coordinates).addTo(map);
      rainMapMarkers.push(marker);
      return marker;
    };
    rainMarkers.forEach((rainMarker, index) => {
      const element = document.createElement("span");
      const label = rainMarker.level >= 3 ? "Kraftigt regn" : rainMarker.level === 2 ? "Regn" : "Lätt regn";
      element.className = `weather-rain-location-marker weather-rain-cloud-level-${rainMarker.level}`;
      element.dataset.weatherRainMarker = "";
      element.dataset.markerLat = String(rainMarker.lat);
      element.dataset.markerLon = String(rainMarker.lon);
      element.style.setProperty("--marker-delay", String(index % 5));
      element.innerHTML = `<i></i><b>${label}</b>`;
      createMarker(element, [rainMarker.lon, rainMarker.lat], "center");
    });
    rainCloudMarkerCells().forEach((cloud, index) => {
      const wrapper = document.createElement("span");
      const element = document.createElement("span");
      wrapper.className = `weather-rain-cloud-marker weather-rain-cloud-level-${cloud.level}`;
      element.className = `weather-rain-cloud weather-rain-cloud-level-${cloud.level}`;
      element.dataset.weatherCloud = "";
      element.dataset.cloudLat = String(cloud.lat);
      element.dataset.cloudLon = String(cloud.lon);
      element.dataset.cloudScale = String(cloud.scale);
      element.style.setProperty("--cloud-delay", String(index % 7));
      element.style.setProperty("--cloud-scale", String(cloud.scale));
      const shapePhase = rainShapeSeed + (cloud.x || 0) * 0.11 + (cloud.y || 0) * 0.07 + index * 1.91;
      element.style.setProperty("--cloud-shape-width", (0.9 + ((Math.sin(shapePhase) + 1) / 2) * 0.18).toFixed(2));
      element.style.setProperty("--cloud-shape-tilt", `${(-6 + ((Math.sin(shapePhase * 1.7) + 1) / 2) * 12).toFixed(1)}deg`);
      element.style.setProperty("--cloud-puff-left", `${(28 + ((Math.sin(shapePhase * 1.2) + 1) / 2) * 12).toFixed(0)}%`);
      element.style.setProperty("--cloud-puff-right", `${(56 + ((Math.sin(shapePhase * 1.45) + 1) / 2) * 18).toFixed(0)}%`);
      element.innerHTML = `<span class="weather-rain-cloud-body"><i class="weather-rain-puff weather-rain-puff-left"></i><i class="weather-rain-puff weather-rain-puff-center"></i><i class="weather-rain-puff weather-rain-puff-right"></i><span class="weather-rain-cloud-base"></span></span><span class="weather-rain-drops"><i></i><i></i><i></i><i></i><i></i></span>`;
      wrapper.appendChild(element);
      const cloudMarker = createMarker(wrapper, [cloud.lon, cloud.lat], "bottom", RAIN_CLOUD_PIN_OFFSET);
      rainCloudMapMarkers.push(cloudMarker);
    });
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
        // Use a denser sampling grid so close zooms do not expose the radar
        // pixels as isolated dots between the heatmap points.
        const cellSize = 8;
        const samplesPerCell = Math.ceil(cellSize / 2) ** 2;
        const cells = [];
        for (let y = 0; y < canvas.height; y += cellSize) {
          for (let x = 0; x < canvas.width; x += cellSize) {
            if (x < 120 && y < 80) continue;
            let colored = 0;
            let strongest = 0;
            for (let sampleY = y; sampleY < Math.min(canvas.height, y + cellSize); sampleY += 2) {
              for (let sampleX = x; sampleX < Math.min(canvas.width, x + cellSize); sampleX += 2) {
                const offset = (sampleY * canvas.width + sampleX) * 4;
                if (pixels[offset + 3] < 70) continue;
                const level = radarCellLevel(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
                if (level == null || level < MIN_DISPLAY_RADAR_LEVEL) continue;
                colored += 1;
                strongest = Math.max(strongest, level);
              }
            }
            if (colored < 1) continue;
            const point = radarPixelToLngLat(x + cellSize / 2, y + cellSize / 2, canvas.width, canvas.height);
            const coverage = colored / samplesPerCell;
            cells.push({ ...point, polygon: radarCellPolygon(x, y, cellSize, canvas.width, canvas.height), level: strongest, coverage, score: strongest * 0.4 + coverage, scale: Math.min(1.05, 0.58 + coverage * 0.55 + strongest * 0.05), x, y });
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
      map.on("load", updateWeatherLocationMarker);
      map.on("zoom", () => { updateRainMapScale(); scheduleRainViewportUpdate(); scheduleRainAnimation(); });
      map.on("resize", () => { updateRainMapScale(); scheduleRainViewportUpdate(); scheduleRainAnimation(); });
      map.on("move", () => { scheduleRainViewportUpdate(); scheduleRainAnimation(); });
      map.on("moveend", () => { updateWeatherLocationMarker(); updateRainMotionSource(); refreshRainMapMarkers(); });
      map.on("zoomend", () => { updateWeatherLocationMarker(); updateRainMotionSource(); refreshRainMapMarkers(); });
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
    window.setTimeout(() => map?.resize(), 60);
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
    if (!map.getSource("weather-rain-points")) map.addSource("weather-rain-points", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
    if (!map.getLayer("weather-rain-heatmap-soft")) map.addLayer({
      id: "weather-rain-heatmap-soft",
      type: "heatmap",
      source: "weather-rain-points",
      layout: { visibility: "none" },
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "heatWeight"], 0, 0, 0.25, 0.24, 0.55, 0.62, 1, 0.9],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.42, 5, 0.62, 8, 0.8, 13, 1.08],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 34, 5, 56, 8, 86, 13, 126],
        "heatmap-opacity": 0.62,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.04, "#0b6fd8", 0.12, "#2bb7ff", 0.26, "#24d8ed", 0.44, "#4ddd65", 0.64, "#e6df2b", 0.82, "#ff9223", 0.94, "#ff4539", 1, "#dc163d"]
      }
    });
    if (!map.getLayer("weather-rain-heatmap")) map.addLayer({
      id: "weather-rain-heatmap",
      type: "heatmap",
      source: "weather-rain-points",
      layout: { visibility: "none" },
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "heatWeight"], 0, 0, 0.25, 0.3, 0.55, 0.72, 1, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.58, 5, 0.78, 8, 1.08, 10, 1.35, 13, 1.58],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 28, 5, 48, 8, 76, 10, 102, 13, 136],
        "heatmap-opacity": 0.92,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.03, "#0b7ce6", 0.12, "#3bc4ff", 0.26, "#2ee0ee", 0.44, "#57e363", 0.64, "#f0e02b", 0.82, "#ff9622", 0.94, "#ff4238", 1, "#df153e"]
      }
    });
    if (!map.getLayer("weather-rain-grid")) map.addLayer({
      id: "weather-rain-grid",
      type: "fill",
      source: "weather-rain-clouds",
      layout: { visibility: "none" },
      paint: {
        "fill-antialias": false,
        "fill-color": ["match", ["get", "level"], 3, "#ef3939", 2, "#f3d229", 1, "#32c84d", "#1676cf"],
        "fill-opacity": ["interpolate", ["linear"], ["get", "coverage"], 0, 0.42, 0.25, 0.58, 0.6, 0.78, 1, 0.92]
      }
    });
    if (!map.getLayer("weather-rain-glow")) map.addLayer({
      id: "weather-rain-glow",
      type: "circle",
      source: "weather-rain-points",
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 22, 5, 32, 8, 48, 10, 64, 13, 88],
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
    ["weather-rain-heatmap-soft", "weather-rain-heatmap", "weather-rain-glow", "weather-rain-3d", "weather-rain-motion-line", "weather-rain-motion-head", "weather-rain-motion-label"].forEach((layerId) => {
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
    map.setPaintProperty("smhi-radar", "raster-opacity", visible ? (smhiRadarOnTop ? 0.58 : 0.78) : 0);
    if (visible && smhiRadarOnTop) map.moveLayer("smhi-radar");
    else if (map.getLayer("weather-area")) map.moveLayer("smhi-radar", "weather-area");
  }

  function setRadarLayer() {
    if (!map || !map.isStyleLoaded()) return;
    if (!radar?.imageUrl) {
      if (map.getLayer("smhi-radar")) {
        map.setPaintProperty("smhi-radar", "raster-opacity", 0);
        map.setLayoutProperty("smhi-radar", "visibility", "none");
      }
      ["weather-rain-heatmap-soft", "weather-rain-heatmap", "weather-rain-glow", "weather-rain-grid", "weather-rain-3d"].forEach((layerId) => {
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
      map.addLayer({ id: "smhi-radar", type: "raster", source: "smhi-radar", paint: { "raster-opacity": 0.78, "raster-saturation": 0.45, "raster-contrast": 0.2, "raster-brightness-min": 0, "raster-brightness-max": 1, "raster-fade-duration": 0, "raster-resampling": "linear" } }, "weather-area");
    }
    updateSmhiRadarPresentation();
    updateRainLayerVisibility();
    renderRainCloudOverlay();
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
    target.innerHTML = forecastSlots15().map((item, index) => {
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
    if (radar?.imageUrl) {
      const radarUrl = radar.imageUrl.startsWith("/") ? `${API_ROOT}${radar.imageUrl}` : radar.imageUrl;
      loadRainClouds(radarUrl);
    } else {
      renderRainCloudOverlay();
    }
    updateMapLayers();
  }

  async function loadRadar(time = currentItem()?.time) {
    const requestId = ++radarRequestId;
    let result = null;
    try {
      result = await getWeatherRadar(time);
    } catch {
      // A requested timestamp may be between SMHI radar frames.
    }
    const requestedMs = time ? new Date(time).getTime() : NaN;
    const isNearCurrentTime = !Number.isFinite(requestedMs) || Math.abs(requestedMs - Date.now()) <= 15 * 60 * 1000;
    // The latest SMHI composite is the reliable source for the current view.
    // A forecast timestamp can fall between radar frames and return no image,
    // even though a fresh radar image is available for the same moment.
    if (!result?.imageUrl && isNearCurrentTime && time) {
      try {
        const latest = await getWeatherRadar();
        if (latest?.imageUrl) result = latest;
      } catch {
        // Keep the radar unavailable when the provider has no current image.
      }
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
