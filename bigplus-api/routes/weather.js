const express = require("express");

const router = express.Router();

const MET_USER_AGENT = process.env.BIGPLUS_WEATHER_USER_AGENT
  || "BIGPLUS/0.1 weather-proxy contact: support@bigplus.local";
const DEFAULT_CACHE_SECONDS = 300;
const RADAR_CACHE_SECONDS = 600;
const MAP_CACHE_SECONDS = 86400;
const MAX_CACHE_ENTRIES = 80;
const cache = new Map();
const binaryCache = new Map();

function roundCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(4)) : null;
}

function cacheKey(prefix, params) {
  return `${prefix}:${Object.entries(params).map(([key, value]) => `${key}=${value}`).join("&")}`;
}

function remember(key, entry) {
  cache.set(key, entry);
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

function rememberBinary(key, entry) {
  binaryCache.set(key, entry);
  if (binaryCache.size > 240) binaryCache.delete(binaryCache.keys().next().value);
}

function cacheHeaders(maxAgeSeconds) {
  return {
    "Cache-Control": `public, max-age=${maxAgeSeconds}`,
    "X-Bigplus-Weather-Cache": "1"
  };
}

function parseCacheTime(response, fallbackSeconds) {
  const expires = Date.parse(response.headers.get("expires") || "");
  return Number.isFinite(expires) ? expires : Date.now() + fallbackSeconds * 1000;
}

async function fetchCachedJson(key, url, options = {}) {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return { ...cached, hit: true };

  const headers = {
    Accept: "application/json",
    ...(options.identify ? { "User-Agent": MET_USER_AGENT } : {}),
    ...(cached?.lastModified ? { "If-Modified-Since": cached.lastModified } : {})
  };
  const response = await fetch(url, { headers });
  if (response.status === 304 && cached) {
    cached.expiresAt = parseCacheTime(response, options.fallbackSeconds || DEFAULT_CACHE_SECONDS);
    remember(key, cached);
    return { ...cached, hit: true };
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(detail || `Väderkällan svarade ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const entry = {
    data,
    fetchedAt: new Date().toISOString(),
    lastModified: response.headers.get("last-modified"),
    expiresAt: parseCacheTime(response, options.fallbackSeconds || DEFAULT_CACHE_SECONDS),
    sourceUrl: url
  };
  remember(key, entry);
  return { ...entry, hit: false };
}

async function fetchCachedBinary(key, url, options = {}) {
  const now = Date.now();
  const cached = binaryCache.get(key);
  if (cached && cached.expiresAt > now) return { ...cached, hit: true };

  const response = await fetch(url, {
    headers: {
      "User-Agent": MET_USER_AGENT,
      Accept: options.accept || "*/*"
    }
  });
  if (!response.ok) {
    const error = new Error(`Extern resurs svarade ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const entry = {
    buffer,
    contentType: response.headers.get("content-type") || options.contentType || "application/octet-stream",
    expiresAt: Date.now() + (options.maxAgeSeconds || MAP_CACHE_SECONDS) * 1000
  };
  rememberBinary(key, entry);
  return { ...entry, hit: false };
}

async function openFreeMapTileTemplate() {
  const result = await fetchCachedJson("openfreemap:tilejson:planet", "https://tiles.openfreemap.org/planet", {
    fallbackSeconds: MAP_CACHE_SECONDS
  });
  const template = Array.isArray(result.data?.tiles) ? result.data.tiles[0] : "";
  if (!template || !template.includes("{z}") || !template.includes("{x}") || !template.includes("{y}")) {
    throw new Error("OpenFreeMap tile-template saknas.");
  }
  return template;
}

function metUrl(product, lat, lon) {
  const endpoint = product === "nowcast" ? "complete" : "compact";
  const url = new URL(`https://api.met.no/weatherapi/${product}/2.0/${endpoint}`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  return url;
}

function normalizeSeries(source, product, maxHours) {
  const timeseries = source?.properties?.timeseries || [];
  const now = Date.now();
  const maxTime = now + maxHours * 60 * 60 * 1000;
  return timeseries
    .map((item) => {
      const instant = item.data?.instant?.details || {};
      const nextHour = item.data?.next_1_hours?.details || {};
      const nextSix = item.data?.next_6_hours?.details || {};
      const timeMs = Date.parse(item.time);
      return {
        time: item.time,
        sourceType: product,
        temperatureC: instant.air_temperature ?? null,
        windSpeedMs: instant.wind_speed ?? null,
        windGustMs: instant.wind_speed_of_gust ?? null,
        windDirectionDeg: instant.wind_from_direction ?? null,
        cloudCoverPercent: instant.cloud_area_fraction ?? null,
        pressureHpa: instant.air_pressure_at_sea_level ?? null,
        humidityPercent: instant.relative_humidity ?? null,
        dewPointC: instant.dew_point_temperature ?? null,
        visibilityKm: instant.visibility == null ? null : Number(instant.visibility) / 1000,
        precipitationMm: nextHour.precipitation_amount ?? nextSix.precipitation_amount ?? null,
        symbolCode: item.data?.next_1_hours?.summary?.symbol_code || item.data?.next_6_hours?.summary?.symbol_code || null,
        isFuture: Number.isFinite(timeMs) ? timeMs >= now : true
      };
    })
    .filter((item) => {
      const timeMs = Date.parse(item.time);
      return Number.isFinite(timeMs) && timeMs <= maxTime;
    });
}

function mergeTimeline(nowcast, forecast) {
  const byTime = new Map();
  normalizeSeries(forecast, "prognos", 72).forEach((item) => byTime.set(item.time, item));
  normalizeSeries(nowcast, "nowcast", 2).forEach((item) => byTime.set(item.time, item));
  return [...byTime.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function latestRadarPng(dayPayload) {
  const files = Array.isArray(dayPayload?.files) ? dayPayload.files : [];
  return [...files].reverse().find((file) => {
    const formats = Array.isArray(file.formats) ? file.formats : [];
    return formats.some((format) => format.key === "png" && format.link);
  }) || null;
}

function radarFileTime(file) {
  for (const value of [file?.valid, file?.updated, file?.time]) {
    const parsed = Date.parse(String(value || ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  const match = String(file?.key || "").match(/radar_(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/i);
  if (!match) return null;
  return Date.UTC(2000 + Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

function radarResult(file, png, fetchedAt, requestedTime, available = true) {
  return {
    available,
    imageUrl: available ? `/weather/radar/image?url=${encodeURIComponent(png?.link || "")}` : null,
    externalImageUrl: available ? png.link : null,
    time: file?.valid || file?.updated || file?.key || requestedTime || null,
    sourceType: "radar",
    source: "SMHI Open Data Radar",
    attribution: "SMHI Open Data",
    updatedAt: fetchedAt,
    requestedTime: requestedTime || null,
    reason: available ? null : "SMHI radar är observationer och finns inte för framtida prognostider."
  };
}

async function fetchRadarForTime(requestedTime) {
  const requestedMs = Date.parse(String(requestedTime || ""));
  if (!Number.isFinite(requestedMs)) return fetchLatestRadar();
  if (requestedMs > Date.now() + 10 * 60 * 1000) return radarResult(null, null, new Date().toISOString(), requestedTime, false);
  const base = "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp";
  const target = new Date(requestedMs);
  const years = await fetchCachedJson("smhi:radar:years", base, { fallbackSeconds: RADAR_CACHE_SECONDS });
  const year = years.data?.years?.find((item) => String(item.key) === String(target.getUTCFullYear()));
  if (!year?.link) return radarResult(null, null, years.fetchedAt, requestedTime, false);
  const months = await fetchCachedJson(`smhi:radar:months:${year.key}`, year.link, { fallbackSeconds: RADAR_CACHE_SECONDS });
  const month = months.data?.months?.find((item) => String(item.key).padStart(2, "0") === String(target.getUTCMonth() + 1).padStart(2, "0"));
  if (!month?.link) return radarResult(null, null, months.fetchedAt, requestedTime, false);
  const days = await fetchCachedJson(`smhi:radar:days:${year.key}:${month.key}`, month.link, { fallbackSeconds: RADAR_CACHE_SECONDS });
  const day = days.data?.days?.find((item) => String(item.key).padStart(2, "0") === String(target.getUTCDate()).padStart(2, "0"));
  if (!day?.link) return radarResult(null, null, days.fetchedAt, requestedTime, false);
  const files = await fetchCachedJson(`smhi:radar:files:${year.key}:${month.key}:${day.key}`, day.link, { fallbackSeconds: RADAR_CACHE_SECONDS });
  const pngFiles = (Array.isArray(files.data?.files) ? files.data.files : [])
    .map((file) => ({ file, png: file.formats?.find((format) => format.key === "png" && format.link), time: radarFileTime(file) }))
    .filter((item) => item.png && Number.isFinite(item.time));
  if (!pngFiles.length) return radarResult(null, null, files.fetchedAt, requestedTime, false);
  const availableBeforeTime = pngFiles.filter((item) => item.time <= requestedMs).sort((a, b) => b.time - a.time);
  const closest = availableBeforeTime[0];
  if (!closest) return radarResult(null, null, files.fetchedAt, requestedTime, false);
  return radarResult(closest.file, closest.png, files.fetchedAt, requestedTime, true);
}

async function fetchLatestRadar() {
  const base = "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp";
  const years = await fetchCachedJson("smhi:radar:years", base, { fallbackSeconds: RADAR_CACHE_SECONDS });
  const year = years.data?.years?.at?.(-1);
  if (!year?.link) return null;
  const months = await fetchCachedJson(`smhi:radar:months:${year.key}`, year.link, { fallbackSeconds: RADAR_CACHE_SECONDS });
  const month = months.data?.months?.at?.(-1);
  if (!month?.link) return null;
  const days = await fetchCachedJson(`smhi:radar:days:${year.key}:${month.key}`, month.link, { fallbackSeconds: RADAR_CACHE_SECONDS });
  const day = days.data?.days?.at?.(-1);
  if (!day?.link) return null;
  const files = await fetchCachedJson(`smhi:radar:files:${year.key}:${month.key}:${day.key}`, day.link, { fallbackSeconds: RADAR_CACHE_SECONDS });
  const file = latestRadarPng(files.data);
  const png = file?.formats?.find((format) => format.key === "png" && format.link);
  if (!file || !png) return null;
  return radarResult(file, png, files.fetchedAt, null, true);
}

router.get("/weather/point", async (req, res, next) => {
  try {
    const lat = roundCoordinate(req.query.lat);
    const lon = roundCoordinate(req.query.lon);
    if (lat == null || lon == null) return res.status(400).json({ error: "lat/lon saknas eller är fel." });

    const nowcastKey = cacheKey("met:nowcast", { lat, lon });
    const forecastKey = cacheKey("met:locationforecast", { lat, lon });
    const [nowcastResult, forecastResult] = await Promise.allSettled([
      fetchCachedJson(nowcastKey, metUrl("nowcast", lat, lon), { identify: true, fallbackSeconds: 300 }),
      fetchCachedJson(forecastKey, metUrl("locationforecast", lat, lon), { identify: true, fallbackSeconds: 1800 })
    ]);

    const nowcast = nowcastResult.status === "fulfilled" ? nowcastResult.value : null;
    const forecast = forecastResult.status === "fulfilled" ? forecastResult.value : null;
    if (!nowcast && !forecast) throw nowcastResult.reason || forecastResult.reason || new Error("Väderdata kunde inte hämtas.");

    res.set(cacheHeaders(DEFAULT_CACHE_SECONDS)).json({
      location: { lat, lon },
      updatedAt: new Date().toISOString(),
      sources: [
        nowcast && { name: "MET Norway Nowcast", type: "nowcast", updatedAt: nowcast.fetchedAt, expiresAt: new Date(nowcast.expiresAt).toISOString(), cache: nowcast.hit ? "hit" : "miss" },
        forecast && { name: "MET Norway Locationforecast", type: "prognos", updatedAt: forecast.fetchedAt, expiresAt: new Date(forecast.expiresAt).toISOString(), cache: forecast.hit ? "hit" : "miss" }
      ].filter(Boolean),
      timeline: mergeTimeline(nowcast?.data, forecast?.data),
      unavailable: [
        !nowcast && { source: "MET Norway Nowcast", reason: nowcastResult.reason?.message || "Inte tillgänglig för platsen" },
        !forecast && { source: "MET Norway Locationforecast", reason: forecastResult.reason?.message || "Inte tillgänglig" }
      ].filter(Boolean)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/weather/geocode", async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim().slice(0, 100);
    if (query.length < 2) return res.status(400).json({ error: "Skriv minst två tecken för att söka plats." });
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "se");
    url.searchParams.set("q", query);
    const result = await fetchCachedJson(cacheKey("nominatim", { q: query.toLowerCase() }), url, { identify: true, fallbackSeconds: 86400 });
    const locations = (Array.isArray(result.data) ? result.data : []).map((item) => ({
      lat: roundCoordinate(item.lat),
      lon: roundCoordinate(item.lon),
      label: item.display_name || item.name || query,
      type: item.type || "plats"
    })).filter((item) => item.lat != null && item.lon != null);
    res.set(cacheHeaders(86400)).json({ source: "OpenStreetMap Nominatim", updatedAt: result.fetchedAt, locations });
  } catch (error) {
    next(error);
  }
});

router.get("/weather/map/route", async (req, res, next) => {
  try {
    const mode = req.query.mode === "walking" ? "walking" : "driving";
    const rawCoordinates = String(req.query.coordinates || "");
    const coordinates = rawCoordinates.split(";").map((pair) => {
      const [longitude, latitude] = pair.split(",").map(Number);
      return Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90
        ? [longitude, latitude]
        : null;
    });
    if (coordinates.length < 2 || coordinates.length > 10 || coordinates.some((coordinate) => !coordinate)) return res.status(400).json({ error: "Ogiltiga ruttkoordinater." });
    const profile = mode === "walking" ? "https://routing.openstreetmap.de/routed-foot/route/v1/driving" : "https://router.project-osrm.org/route/v1/driving";
    const url = `${profile}/${coordinates.map(([longitude, latitude]) => `${longitude},${latitude}`).join(";")}?overview=full&geometries=geojson&steps=false&continue_straight=false&alternatives=true`;
    const result = await fetchCachedJson(cacheKey("map-route-v2", { mode, coordinates: rawCoordinates }), url, { identify: true, fallbackSeconds: 900 });
    const routes = (Array.isArray(result.data?.routes) ? result.data.routes : [])
      .filter((candidate) => candidate?.geometry?.coordinates?.length)
      .sort((first, second) => Number(first.distance || Infinity) - Number(second.distance || Infinity));
    const route = routes[0];
    if (!route?.geometry?.coordinates?.length) return res.status(404).json({ error: "Ingen körbar väg hittades." });
    const alternatives = routes.slice(0, 3).map((candidate, index) => ({ index, distance: candidate.distance, duration: candidate.duration, coordinates: candidate.geometry.coordinates }));
    res.set(cacheHeaders(900)).json({
      source: mode === "walking" ? "OpenStreetMap routing, gång" : "OpenStreetMap routing, bil",
      mode,
      distance: route.distance,
      duration: route.duration,
      coordinates: route.geometry.coordinates,
      alternatives
    });
  } catch (error) {
    next(error);
  }
});

router.get("/weather/radar", async (req, res, next) => {
  try {
    const radar = req.query.time ? await fetchRadarForTime(req.query.time) : await fetchLatestRadar();
    if (!radar) return res.status(404).json({ error: "Ingen SMHI-radarbild hittades just nu." });
    res.set(cacheHeaders(RADAR_CACHE_SECONDS)).json(radar);
  } catch (error) {
    next(error);
  }
});

router.get("/weather/radar/image", async (req, res, next) => {
  try {
    const url = new URL(String(req.query.url || ""));
    if (url.hostname !== "opendata-download-radar.smhi.se") return res.status(400).json({ error: "Ogiltig radarresurs." });
    const result = await fetchCachedBinary(`smhi:radar:image:${url.href}`, url.href, {
      accept: "image/png,image/*",
      contentType: "image/png",
      maxAgeSeconds: RADAR_CACHE_SECONDS
    });
    res.set({
      "Content-Type": result.contentType,
      "Cache-Control": `public, max-age=${RADAR_CACHE_SECONDS}`,
      "X-Bigplus-Weather-Cache": result.hit ? "hit" : "miss"
    });
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
});

router.get("/weather/map/planet", async (req, res, next) => {
  try {
    const result = await fetchCachedJson("openfreemap:tilejson:planet", "https://tiles.openfreemap.org/planet", {
      fallbackSeconds: MAP_CACHE_SECONDS
    });
    const origin = `${req.protocol}://${req.get("host")}`;
    const tileJson = {
      ...result.data,
      tiles: [`${origin}/api/bigplus/weather/map/tiles/{z}/{x}/{y}.pbf?v=20260806-weather-3`]
    };
    res.set({
      "Cache-Control": `public, max-age=${MAP_CACHE_SECONDS}`,
      "X-Bigplus-Weather-Cache": result.hit ? "hit" : "miss"
    }).json(tileJson);
  } catch (error) {
    next(error);
  }
});

router.get("/weather/map/tiles/:z/:x/:y.pbf", async (req, res, next) => {
  try {
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    if (![z, x, y].every(Number.isInteger) || z < 0 || z > 14 || x < 0 || y < 0) return res.status(400).json({ error: "Ogiltig kartplatta." });
    const template = await openFreeMapTileTemplate();
    const url = template
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
    const result = await fetchCachedBinary(`openfreemap:tile:${z}:${x}:${y}`, url, {
      accept: "application/x-protobuf",
      contentType: "application/x-protobuf",
      maxAgeSeconds: MAP_CACHE_SECONDS
    });
    res.set({
      "Content-Type": result.contentType,
      "Cache-Control": `public, max-age=${MAP_CACHE_SECONDS}`,
      "X-Bigplus-Weather-Cache": result.hit ? "hit" : "miss"
    });
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
});

router.get("/weather/map/fonts/:fontstack/:range.pbf", async (req, res, next) => {
  try {
    const fontstack = encodeURIComponent(req.params.fontstack);
    const range = String(req.params.range || "").replace(/[^0-9-]/g, "");
    if (!range) return res.status(400).json({ error: "Ogiltigt fontintervall." });
    const url = `https://tiles.openfreemap.org/fonts/${fontstack}/${range}.pbf`;
    const result = await fetchCachedBinary(`openfreemap:glyph:${fontstack}:${range}`, url, {
      accept: "application/x-protobuf",
      contentType: "application/x-protobuf",
      maxAgeSeconds: MAP_CACHE_SECONDS
    });
    res.set({
      "Content-Type": result.contentType,
      "Cache-Control": `public, max-age=${MAP_CACHE_SECONDS}`,
      "X-Bigplus-Weather-Cache": result.hit ? "hit" : "miss"
    });
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
