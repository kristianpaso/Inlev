import { $ } from "./dom.js";
import { photoSource } from "./format.js";

const MAP_ATTRIBUTION = 'Satellite: <a href="https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" target="_blank" rel="noopener">NASA GIBS</a>';
const OPENFREEMAP_STYLES = {
  bigplus: () => fishingLightStyle(false),
  simple: () => fishingLightStyle(true),
  depth: () => fishingLightStyle(false, true)
};
const SATELLITE_STYLE = {
  version: 8,
  name: "BIGPLUS Satellite",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    "nasa-gibs": {
      type: "raster",
      tiles: [
        "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=VIIRS_SNPP_CorrectedReflectance_TrueColor&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=GoogleMapsCompatible_Level9&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
      ],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 9,
      attribution: ""
    }
  },
  layers: [
    { id: "satellite", type: "raster", source: "nasa-gibs", paint: { "raster-saturation": -0.1, "raster-contrast": 0.05 } },
    { id: "satellite-water-soften", type: "background", paint: { "background-color": "rgba(228, 244, 255, 0)" } }
  ]
};
const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };
const SWEDEN_CENTER = [15.5, 62.0];

function fishingLightStyle(simpleMode, depthMode = false) {
  const roadOpacity = simpleMode ? 0.72 : 0.38;
  const labelVisibility = simpleMode ? "visible" : "none";
  const waterColor = depthMode
    ? ["match", ["get", "class"], "river", "#48b8d5", "lake", "#176f9a", "pond", "#2d88a5", "#227793"]
    : simpleMode ? "#72cbe5" : "#46b9d7";
  const waterEdgeColor = depthMode ? "#6ed5e5" : "#2298bd";
  const landColor = simpleMode ? "#a7d89f" : "#77bd80";
  const landUseColor = simpleMode ? "#c5e9b7" : "#a9d99d";
  return {
    version: 8,
    name: depthMode ? "BIGPLUS Fishing Depth" : simpleMode ? "BIGPLUS Fishing Simple" : "BIGPLUS Fishing Light",
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      openmaptiles: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": simpleMode ? "#e1f0df" : "#d4ead9" } },
      { id: "landcover-wood", type: "fill", source: "openmaptiles", "source-layer": "landcover", filter: ["match", ["get", "class"], ["wood", "forest", "grass", "scrub"], true, false], paint: { "fill-color": landColor, "fill-opacity": simpleMode ? 0.62 : 0.82 } },
      { id: "landuse-soft", type: "fill", source: "openmaptiles", "source-layer": "landuse", paint: { "fill-color": landUseColor, "fill-opacity": simpleMode ? 0.54 : 0.68 } },
      { id: "park-soft", type: "fill", source: "openmaptiles", "source-layer": "park", paint: { "fill-color": simpleMode ? "#a8d99e" : "#78c388", "fill-opacity": simpleMode ? 0.62 : 0.84 } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": waterColor, "fill-opacity": 1, "fill-outline-color": waterEdgeColor } },
      { id: "water-depth-shade", type: "fill", source: "openmaptiles", "source-layer": "water", minzoom: 5, paint: { "fill-color": "#073d67", "fill-opacity": depthMode ? ["interpolate", ["linear"], ["zoom"], 5, 0.08, 9, 0.19, 14, 0.31] : 0.08 } },
      { id: "water-depth-contour", type: "line", source: "openmaptiles", "source-layer": "water", minzoom: 6, paint: { "line-color": "#b8f2f6", "line-opacity": depthMode ? 0.34 : 0, "line-blur": 1.2, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 14, 2.2] } },
      { id: "water-shadow", type: "line", source: "openmaptiles", "source-layer": "water", paint: { "line-color": waterEdgeColor, "line-opacity": depthMode ? 0.64 : simpleMode ? 0.42 : 0.68, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.45, 10, 1.8] } },
      { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": depthMode ? "#3fb4d6" : "#2e9fc7", "line-opacity": simpleMode ? 0.74 : 0.96, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.8, 12, 2.8] } },
      { id: "boundaries", type: "line", source: "openmaptiles", "source-layer": "boundary", paint: { "line-color": "#8fa3b3", "line-opacity": simpleMode ? 0.62 : 0.4, "line-dasharray": [2, 2], "line-width": 0.8 } },
      { id: "roads-minor", type: "line", source: "openmaptiles", "source-layer": "transportation", filter: ["match", ["get", "class"], ["minor", "service", "track"], true, false], paint: { "line-color": "#a6b5c3", "line-opacity": roadOpacity * 0.7, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.35, 13, 1.25] } },
      { id: "roads-major", type: "line", source: "openmaptiles", "source-layer": "transportation", filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false], paint: { "line-color": simpleMode ? "#889ba9" : "#98acba", "line-opacity": roadOpacity, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 12, 2.3] } },
      { id: "buildings", type: "fill", source: "openmaptiles", "source-layer": "building", minzoom: 12, paint: { "fill-color": "#b7c2ca", "fill-opacity": simpleMode ? 0.34 : 0.2 } },
      { id: "water-names", type: "symbol", source: "openmaptiles", "source-layer": "water_name", minzoom: 5, layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 12, 10, 17], "text-font": ["Noto Sans Italic"], "symbol-placement": "point" }, paint: { "text-color": "#064c73", "text-halo-color": "rgba(202, 242, 248, .96)", "text-halo-width": 1.7 } },
      { id: "place-names", type: "symbol", source: "openmaptiles", "source-layer": "place", minzoom: 4, layout: { "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]], "text-size": ["match", ["get", "class"], "city", 14, "town", 12, 10], "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#2b4056", "text-halo-color": "rgba(255, 255, 255, .92)", "text-halo-width": 1.15 } },
      { id: "road-names", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", minzoom: 12, layout: { "visibility": labelVisibility, "symbol-placement": "line", "text-field": ["get", "name"], "text-size": 10, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#526779", "text-halo-color": "#ffffff", "text-halo-width": 1 } }
    ]
  };
}

function measurementOf(item) {
  return item.measurement || item || {};
}

function speciesNameOf(item) {
  const measurement = measurementOf(item);
  return measurement.speciesName || measurement.species || "F\u00e5ngst";
}

function numberOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function featureCollection(features) {
  return { type: "FeatureCollection", features: features.filter(Boolean) };
}

function readLocalJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function locationFrom(value) {
  const latitude = numberOrNull(value?.latitude ?? value?.lat ?? value?.location?.latitude ?? value?.location?.lat);
  const longitude = numberOrNull(value?.longitude ?? value?.lng ?? value?.lon ?? value?.location?.longitude ?? value?.location?.lng ?? value?.location?.lon);
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

function catchFeature(item, currentAccount) {
  const location = locationFrom(item);
  if (!location) return null;
  const measurement = measurementOf(item);
  const catchId = String(item.id || item._id || "");
  const length = numberOrNull(measurement.lengthCm);
  const shared = String(item.ownerId || item.userId || "") !== String(currentAccount()?.id || "");
  return {
    type: "Feature",
    id: catchId || `${location.latitude}:${location.longitude}`,
    geometry: { type: "Point", coordinates: [location.longitude, location.latitude] },
    properties: {
      catchId,
      title: speciesNameOf(item),
      detail: `${length ? `${length.toFixed(1)} cm` : "M\u00e5tt saknas"} \u00b7 ${shared ? `Delad av ${item.ownerName || "v\u00e4n"}` : "Din f\u00e5ngst"}`,
      length: length || 0,
      shared,
      bigplus: measurement.status === "BIGPLUS" || measurement.isBigplus
    }
  };
}

function bestFeaturesFrom(list, isBigplusCatch, currentAccount) {
  const bestBySpecies = new Map();
  list.forEach((item) => {
    const location = locationFrom(item);
    if (!location) return;
    const measurement = measurementOf(item);
    const length = numberOrNull(measurement.lengthCm) || 0;
    if (!length || !isBigplusCatch(item)) return;
    const species = speciesNameOf(item);
    const previous = bestBySpecies.get(species);
    if (!previous || length > previous.length) {
      bestBySpecies.set(species, { item, length, location });
    }
  });
  return [...bestBySpecies.entries()].map(([species, entry]) => ({
    type: "Feature",
    id: `best-${species}`,
    geometry: { type: "Point", coordinates: [entry.location.longitude, entry.location.latitude] },
    properties: {
      catchId: String(entry.item.id || entry.item._id || ""),
      title: species,
      detail: `Personb\u00e4sta ${entry.length.toFixed(1)} cm`,
      owner: String(entry.item.ownerId || entry.item.userId || "") === String(currentAccount()?.id || "") ? "Du" : entry.item.ownerName || "V\u00e4n"
    }
  }));
}

function favoritePlaceFeatures(accountId) {
  const keys = [`bigplus_favorite_places:${accountId || ""}`, "bigplus_favorite_places"].filter(Boolean);
  const places = keys.flatMap((key) => readLocalJson(key, []));
  return places.map((place, index) => {
    const location = locationFrom(place);
    if (!location) return null;
    return {
      type: "Feature",
      id: `favorite-${place.id || index}`,
      geometry: { type: "Point", coordinates: [location.longitude, location.latitude] },
      properties: {
        title: place.name || place.title || "Favoritplats",
        detail: place.note || place.description || "Sparad fiskeplats"
      }
    };
  }).filter(Boolean);
}

function plannerStopFeatures() {
  return readLocalJson("bigplus_fishing_trips", []).map((trip, index) => {
    const location = locationFrom(trip);
    if (!location) return null;
    return {
      type: "Feature",
      id: `planner-${trip.id || index}`,
      geometry: { type: "Point", coordinates: [location.longitude, location.latitude] },
      properties: {
        title: trip.title || "Planner-stopp",
        detail: [trip.location, trip.date, trip.species].filter(Boolean).join(" \u00b7 ") || "Planerad fisketur"
      }
    };
  }).filter(Boolean);
}

function fitBoundsForFeatures(map, features) {
  if (!features.length) {
    map.jumpTo({ center: SWEDEN_CENTER, zoom: 4.2 });
    return;
  }
  const lngs = features.map((feature) => feature.geometry.coordinates[0]);
  const lats = features.map((feature) => feature.geometry.coordinates[1]);
  map.fitBounds([
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)]
  ], { padding: 44, maxZoom: 13, duration: 500 });
}

export function createCatchViewController({
  calculateBigplusRank,
  catchRecordById,
  catches,
  completedAchievementCount,
  currentAccount,
  formatCatch,
  getMapCatchRecords,
  getRemoteMapZones,
  isBigplusCatch,
  openDeleteCatchDialog,
  recentWindowDelta,
  renderHomeAchievements,
  renderHomeActivity,
  renderHomeCompetitionRank,
  renderHomeFriendsOnline,
  renderHomeNextBadge,
  renderProfileLevelDashboard,
  renderPersonalBestLists,
  setStatChange,
  updateHomeCatchView,
  userCatches
}) {
  let catchMapInstance = null;
  let currentMapMode = "bigplus";
  let currentLayerFilter = "all";
  let currentLocationFeature = EMPTY_FEATURE_COLLECTION;
  let catchMapLayerEventsBound = false;
  let lastCatchFeatureCollection = EMPTY_FEATURE_COLLECTION;
  let latestLocatedRecords = [];
  let catchMapStyleReady = false;

  function syncCatchMapBackdropSize() {
    const catchesView = $("#catchesView");
    const extras = $("#catchesExtras");
    if (!catchesView || !extras || catchesView.hidden || extras.hidden) return;
    window.requestAnimationFrame(() => {
      const extrasRect = extras.getBoundingClientRect();
      const lastBlock = extras.querySelector(".catches-personal-best-showcase") || extras.querySelector(".catches-content-grid") || extras.lastElementChild;
      const lastBlockBottom = lastBlock?.getBoundingClientRect?.().bottom || extrasRect.bottom;
      const contentHeight = lastBlockBottom - extrasRect.top;
      if (!contentHeight) return;
      const visibleHeight = window.matchMedia("(max-width: 680px)").matches ? 360 : 390;
      const underlap = window.matchMedia("(max-width: 680px)").matches ? 8 : 6;
      const mapTop = $("#catchMapPanel")?.getBoundingClientRect?.().top || 0;
      const viewportFillOverlap = Math.max(0, Math.ceil(window.innerHeight - mapTop - visibleHeight + 1));
      const overlapHeight = Math.max(contentHeight + underlap, viewportFillOverlap);
      const bottomMargin = 12;
      const targetContentBottom = window.innerHeight - bottomMargin;
      const blockOverlapOffset = Math.min(
        overlapHeight,
        Math.max(0, mapTop + visibleHeight + overlapHeight + contentHeight - targetContentBottom)
      );
      catchesView.style.setProperty("--catch-map-visible-height", `${visibleHeight}px`);
      catchesView.style.setProperty("--catch-map-overlap-height", `${overlapHeight}px`);
      extras.style.marginTop = `-${blockOverlapOffset}px`;
      window.setTimeout(() => catchMapInstance?.resize(), 30);
    });
  }

  window.addEventListener("resize", syncCatchMapBackdropSize);

  function renderCatchDetail(catchId, options = {}) {
    const list = getMapCatchRecords();
    const item = catchRecordById(catchId) || list[Number(String(catchId).replace("catch-", ""))];
    const detail = $("#catchDetail");
    if (!item || !detail) return;
    detail.dataset.catchId = String(item.id || item._id || catchId);
    const measurement = item.measurement || item;
    const photo = photoSource(item.photoDataUrl || item.photo);
    const detailImage = $("#catchDetailImage");
    if (detailImage) detailImage.src = photo;
    const weight = measurement.weightKg?.mid ?? measurement.weightKg ?? measurement.weight;
    const isBigplus = measurement.status === "BIGPLUS" || measurement.isBigplus;
    const detailLength = $("#catchDetailLength");
    const detailWeight = $("#catchDetailWeight");
    const detailStatus = $("#catchDetailStatus");
    const detailStatusTitle = $("#catchDetailStatus strong");
    const detailStatusText = $("#catchDetailStatus small");
    const detailTitle = $("#catchDetailTitle");
    const detailMeta = $("#catchDetailMeta");
    if (detailLength) detailLength.textContent = `${Number(measurement.lengthCm || 0).toFixed(1)} cm`;
    if (detailWeight) detailWeight.textContent = weight ? `${Number(weight).toFixed(1)} kg` : "-- kg";
    if (detailStatus) detailStatus.classList.toggle("is-approved", Boolean(isBigplus));
    if (detailStatusTitle) detailStatusTitle.textContent = isBigplus ? "BIGPLUS" : "M\u00c4TNING KLAR";
    if (detailStatusText) detailStatusText.textContent = isBigplus ? "Godk\u00e4nd f\u00e5ngst" : "Resultat fr\u00e5n din m\u00e4tning";
    if (detailTitle) detailTitle.textContent = measurement.speciesName || measurement.species || "F\u00e5ngst";
    if (detailMeta) detailMeta.textContent = `${Number(measurement.lengthCm || 0).toFixed(1)} cm \u00b7 ${measurement.status || "M\u00e4tt"}`;
    const coordinateButton = $("#shareCatchCoordinates");
    const shareStatus = $("#catchShareStatus");
    const detailActions = detail.querySelector(".catch-detail-actions");
    let deleteDetailButton = $("#deleteCatchFromDetail");
    if (!deleteDetailButton && detailActions) {
      deleteDetailButton = document.createElement("button");
      deleteDetailButton.id = "deleteCatchFromDetail";
      deleteDetailButton.type = "button";
      deleteDetailButton.className = "danger-button compact-button";
      deleteDetailButton.textContent = "Ta bort f\u00e5ngsten";
      detailActions.insertBefore(deleteDetailButton, detailActions.querySelector("small"));
      deleteDetailButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openDeleteCatchDialog(event.currentTarget.dataset.deleteCatch);
      });
    }
    const itemId = String(item.id || item._id || catchId);
    const canDelete = String(itemId).startsWith("local-") || String(item.userId || "") === String(currentAccount()?.id || "");
    if (deleteDetailButton) {
      deleteDetailButton.hidden = !canDelete;
      deleteDetailButton.dataset.deleteCatch = itemId;
    }
    const hasCoordinates = Number.isFinite(Number(item.location?.latitude)) && Number.isFinite(Number(item.location?.longitude));
    if (coordinateButton) coordinateButton.hidden = !hasCoordinates;
    if (shareStatus) shareStatus.textContent = hasCoordinates ? "" : "Ingen plats sparad f\u00f6r f\u00e5ngsten.";
    const allCatchList = $("#allCatchList");
    const latestCard = $("#catchPageLatestList")?.closest(".catches-latest-card");
    const row = allCatchList
      ? [...allCatchList.querySelectorAll(".catch-row[data-catch-id]")].find((entry) => String(entry.dataset.catchId) === String(catchId))
      : null;
    if (options.overlay && latestCard) {
      detail.dataset.overlay = "true";
      detail.classList.add("catch-detail-overlay");
      latestCard.append(detail);
    } else if (row) {
      detail.dataset.overlay = "false";
      detail.classList.remove("catch-detail-overlay");
      allCatchList.querySelector(".catch-row.is-selected")?.classList.remove("is-selected");
      row.classList.add("is-selected");
      row.insertAdjacentElement("afterend", detail);
    }
    detail.classList.remove("is-open");
    detail.hidden = false;
    detail.classList.add("is-open");
    if (!options.overlay) detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeCatchDetailPanel() {
    const detail = $("#catchDetail");
    if (!detail) return;
    detail.hidden = true;
    if (detail.dataset.overlay === "true") {
      detail.dataset.overlay = "false";
      detail.classList.remove("catch-detail-overlay");
      $(".catches-results-section")?.append(detail);
    }
    $("#allCatchList .catch-row.is-selected")?.classList.remove("is-selected");
    zoomOutAfterCatchDetail();
  }

  function mapStyleForMode(mode = currentMapMode) {
    if (mode === "satellite") return SATELLITE_STYLE;
    const styleFactory = OPENFREEMAP_STYLES[mode] || OPENFREEMAP_STYLES.bigplus;
    return styleFactory();
  }

  function tuneFishingLightStyle() {
    const map = catchMapInstance;
    if (!map || currentMapMode === "satellite") return;
    const depthMode = currentMapMode === "depth";
    const style = map.getStyle();
    if (!style?.layers) return;
    style.layers.forEach((layer) => {
      const id = String(layer.id || "").toLowerCase();
      const sourceLayer = String(layer["source-layer"] || "").toLowerCase();
      try {
        if (sourceLayer.includes("water") || id.includes("water")) {
          if (layer.type === "fill" && id === "water") map.setPaintProperty(layer.id, "fill-color", depthMode ? ["match", ["get", "class"], "river", "#48b8d5", "lake", "#176f9a", "pond", "#2d88a5", "#227793"] : currentMapMode === "simple" ? "#72cbe5" : "#46b9d7");
          if (layer.type === "fill" && id === "water-depth-shade") map.setPaintProperty(layer.id, "fill-opacity", depthMode ? ["interpolate", ["linear"], ["zoom"], 5, 0.05, 9, 0.15, 14, 0.25] : 0);
          if (layer.type === "line") {
            map.setPaintProperty(layer.id, "line-color", depthMode ? "#86e5f2" : "#42afd2");
            if (id === "water-depth-contour") map.setPaintProperty(layer.id, "line-opacity", depthMode ? 0.34 : 0);
          }
          if (layer.type === "symbol") {
            map.setPaintProperty(layer.id, "text-color", "#014f78");
            map.setPaintProperty(layer.id, "text-halo-color", "rgba(237, 249, 255, .96)");
            map.setPaintProperty(layer.id, "text-halo-width", 1.5);
          }
        }
        if (sourceLayer.includes("transportation") || id.includes("road") || id.includes("transport")) {
          if (layer.type === "line") {
            map.setPaintProperty(layer.id, "line-color", currentMapMode === "simple" ? "#889ba9" : "#98acba");
            map.setPaintProperty(layer.id, "line-opacity", currentMapMode === "simple" ? 0.72 : 0.38);
          }
          if (layer.type === "symbol") map.setLayoutProperty(layer.id, "visibility", currentMapMode === "simple" ? "visible" : "none");
        }
        if (sourceLayer.includes("building") || id.includes("building")) {
          if (layer.type === "fill") {
            map.setPaintProperty(layer.id, "fill-color", "#b7c2ca");
            map.setPaintProperty(layer.id, "fill-opacity", currentMapMode === "simple" ? 0.34 : 0.2);
          }
        }
        if (sourceLayer.includes("landcover") || sourceLayer.includes("landuse") || id.includes("park") || id.includes("forest")) {
          if (layer.type === "fill") map.setPaintProperty(layer.id, "fill-color", currentMapMode === "simple" ? "#a7d89f" : id.includes("park") ? "#78c388" : "#77bd80");
          if (layer.type === "fill") map.setPaintProperty(layer.id, "fill-opacity", currentMapMode === "simple" ? 0.62 : id.includes("park") ? 0.84 : 0.82);
        }
        if ((sourceLayer.includes("place") || id.includes("place")) && layer.type === "symbol") {
          map.setPaintProperty(layer.id, "text-color", "#2b4056");
          map.setPaintProperty(layer.id, "text-halo-color", "rgba(255, 255, 255, .92)");
          map.setPaintProperty(layer.id, "text-halo-width", 1.15);
        }
      } catch {
        // OpenFreeMap styles can change layer names; missing paint/layout keys are harmless.
      }
    });
  }

  function source(id) {
    return catchMapInstance?.getSource(id);
  }

  function addGeoJsonSource(id, data, options = {}) {
    if (!catchMapInstance.getSource(id)) {
      catchMapInstance.addSource(id, { type: "geojson", data, ...options });
    }
  }

  function addLayer(layer) {
    if (!catchMapInstance.getLayer(layer.id)) catchMapInstance.addLayer(layer);
  }

  function setVisibility(layerIds, visible) {
    layerIds.forEach((id) => {
      if (catchMapInstance?.getLayer(id)) catchMapInstance.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    });
  }

  function applyLayerFilter() {
    if (!catchMapInstance || !catchMapStyleReady) return;
    const clusterLayers = ["bigplus-catch-clusters", "bigplus-catch-cluster-count"];
    const catchLayers = ["bigplus-catches-point", "bigplus-catches-label"];
    const bestLayers = ["bigplus-personal-bests-halo", "bigplus-personal-bests-point", "bigplus-personal-bests-label"];
    const placeLayers = ["bigplus-favorite-places-point", "bigplus-favorite-places-label"];
    const plannerLayers = ["bigplus-planner-stops-point", "bigplus-planner-stops-label"];
    const all = currentLayerFilter === "all" || currentLayerFilter === "species" || currentLayerFilter === "date";
    setVisibility(clusterLayers, all || currentLayerFilter === "clusters");
    setVisibility(catchLayers, all);
    setVisibility(bestLayers, all || currentLayerFilter === "best");
    setVisibility(placeLayers, all || currentLayerFilter === "places");
    setVisibility(plannerLayers, all || currentLayerFilter === "places");
  }

  function showPointPopup(event) {
    const feature = event.features?.[0];
    if (!feature) return;
    const coordinates = feature.geometry.coordinates.slice();
    new window.maplibregl.Popup({ closeButton: false, offset: 12 })
      .setLngLat(coordinates)
      .setHTML(`<strong>${feature.properties.title || "BIGPLUS"}</strong><small>${feature.properties.detail || ""}</small>`)
      .addTo(catchMapInstance);
    if (feature.properties.catchId) {
      renderCatchDetail(feature.properties.catchId);
    }
  }

  function bindMapLayerEvents() {
    if (catchMapLayerEventsBound || !catchMapInstance) return;
    catchMapLayerEventsBound = true;
    ["bigplus-catches-point", "bigplus-personal-bests-point", "bigplus-favorite-places-point", "bigplus-planner-stops-point"].forEach((layerId) => {
      catchMapInstance.on("click", layerId, showPointPopup);
      catchMapInstance.on("mouseenter", layerId, () => { catchMapInstance.getCanvas().style.cursor = "pointer"; });
      catchMapInstance.on("mouseleave", layerId, () => { catchMapInstance.getCanvas().style.cursor = ""; });
    });
    catchMapInstance.on("click", "bigplus-catch-clusters", async (event) => {
      const features = catchMapInstance.queryRenderedFeatures(event.point, { layers: ["bigplus-catch-clusters"] });
      const clusterId = features[0]?.properties?.cluster_id;
      const catchSource = source("bigplus-catches");
      if (clusterId == null || !catchSource?.getClusterExpansionZoom) return;
      const zoom = await catchSource.getClusterExpansionZoom(clusterId);
      catchMapInstance.easeTo({ center: features[0].geometry.coordinates, zoom, duration: 450 });
    });
  }

  function ensureFishingLayers() {
    if (!catchMapInstance || !catchMapStyleReady) return;
    tuneFishingLightStyle();
    addGeoJsonSource("bigplus-catches", lastCatchFeatureCollection, { cluster: true, clusterMaxZoom: 12, clusterRadius: 42 });
    addGeoJsonSource("bigplus-personal-bests", EMPTY_FEATURE_COLLECTION);
    addGeoJsonSource("bigplus-favorite-places", EMPTY_FEATURE_COLLECTION);
    addGeoJsonSource("bigplus-planner-stops", EMPTY_FEATURE_COLLECTION);
    addGeoJsonSource("bigplus-current-location", currentLocationFeature);

    addLayer({ id: "bigplus-catch-clusters", type: "circle", source: "bigplus-catches", filter: ["has", "point_count"], paint: { "circle-color": "#1769e0", "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 32], "circle-stroke-color": "#ffffff", "circle-stroke-width": 3, "circle-opacity": 0.94 } });
    addLayer({ id: "bigplus-catch-cluster-count", type: "symbol", source: "bigplus-catches", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#ffffff" } });
    addLayer({ id: "bigplus-catches-point", type: "circle", source: "bigplus-catches", filter: ["!", ["has", "point_count"]], paint: { "circle-color": ["case", ["get", "bigplus"], "#1769e0", ["get", "shared"], "#f97316", "#22c55e"], "circle-radius": 8, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } });
    addLayer({ id: "bigplus-catches-label", type: "symbol", source: "bigplus-catches", filter: ["!", ["has", "point_count"]], minzoom: 9, layout: { "text-field": ["get", "title"], "text-size": 11, "text-offset": [0, 1.35], "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#12335d", "text-halo-color": "#ffffff", "text-halo-width": 1.2 } });
    addLayer({ id: "bigplus-personal-bests-halo", type: "circle", source: "bigplus-personal-bests", paint: { "circle-radius": 14, "circle-color": "rgba(251, 191, 36, .24)", "circle-stroke-color": "#f59e0b", "circle-stroke-width": 1 } });
    addLayer({ id: "bigplus-personal-bests-point", type: "circle", source: "bigplus-personal-bests", paint: { "circle-radius": 7, "circle-color": "#f59e0b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
    addLayer({ id: "bigplus-personal-bests-label", type: "symbol", source: "bigplus-personal-bests", layout: { "text-field": "\u2605", "text-size": 12, "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#ffffff" } });
    addLayer({ id: "bigplus-favorite-places-point", type: "circle", source: "bigplus-favorite-places", paint: { "circle-radius": 8, "circle-color": "#7c3aed", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
    addLayer({ id: "bigplus-favorite-places-label", type: "symbol", source: "bigplus-favorite-places", minzoom: 8, layout: { "text-field": ["get", "title"], "text-size": 11, "text-offset": [0, 1.3], "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#3b0764", "text-halo-color": "#ffffff", "text-halo-width": 1 } });
    addLayer({ id: "bigplus-planner-stops-point", type: "circle", source: "bigplus-planner-stops", paint: { "circle-radius": 8, "circle-color": "#0ea5e9", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
    addLayer({ id: "bigplus-planner-stops-label", type: "symbol", source: "bigplus-planner-stops", minzoom: 8, layout: { "text-field": "P", "text-size": 11, "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#ffffff" } });
    addLayer({ id: "bigplus-current-location-point", type: "circle", source: "bigplus-current-location", paint: { "circle-radius": 10, "circle-color": "#1769e0", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
    bindMapLayerEvents();
    applyLayerFilter();
  }

  function updateMapSources(located) {
    const accountId = currentAccount()?.id;
    const catchFeatures = located.map((item) => catchFeature(item, currentAccount)).filter(Boolean);
    const zonePlaces = (getRemoteMapZones?.() || []).map((zone, index) => {
      const location = locationFrom(zone);
      if (!location) return null;
      return {
        type: "Feature",
        id: `zone-${zone.id || index}`,
        geometry: { type: "Point", coordinates: [location.longitude, location.latitude] },
        properties: { title: zone.name || "Delad zon", detail: "Delad fiskezon" }
      };
    }).filter(Boolean);
    lastCatchFeatureCollection = featureCollection(catchFeatures);
    const bestFeatures = bestFeaturesFrom(located, isBigplusCatch, currentAccount);
    const plannerFeatures = plannerStopFeatures();
    const panel = $("#catchMapPanel");
    if (panel) {
      panel.dataset.locatedRecords = String(located.length);
      panel.dataset.catchFeatures = String(lastCatchFeatureCollection.features.length);
      panel.dataset.bestFeatures = String(bestFeatures.length);
      panel.dataset.favoriteFeatures = String(favoritePlaceFeatures(accountId).length + zonePlaces.length);
      panel.dataset.plannerFeatures = String(plannerFeatures.length);
      panel.dataset.mapMode = currentMapMode;
    }
    if (!catchMapInstance || !catchMapStyleReady) return;
    source("bigplus-catches")?.setData(lastCatchFeatureCollection);
    source("bigplus-personal-bests")?.setData(featureCollection(bestFeatures));
    source("bigplus-favorite-places")?.setData(featureCollection([...favoritePlaceFeatures(accountId), ...zonePlaces]));
    source("bigplus-planner-stops")?.setData(featureCollection(plannerFeatures));
    source("bigplus-current-location")?.setData(currentLocationFeature);
  }

  function renderCatchMap() {
    const panel = $("#catchMapPanel");
    const target = $("#catchMap");
    const empty = $("#catchMapEmpty");
    const catchesView = $("#catchesView");
    if (!panel || !target || panel.hidden || catchesView?.hidden) return;
    const located = getMapCatchRecords().filter((item) => locationFrom(item));
    latestLocatedRecords = located;
    if (!window.maplibregl) {
      if (empty) { empty.hidden = false; empty.textContent = "Kartan kunde inte laddas just nu."; }
      return;
    }
    if (!catchMapInstance) {
      catchMapInstance = new window.maplibregl.Map({
        container: target,
        style: mapStyleForMode(),
        center: SWEDEN_CENTER,
        zoom: 4.2,
        attributionControl: false,
        cooperativeGestures: false,
        scrollZoom: true,
        dragRotate: false
      });
      catchMapInstance.scrollZoom.enable();
      catchMapInstance.scrollZoom.setWheelZoomRate(1 / 420);
      catchMapInstance.scrollZoom.setZoomRate(1 / 90);
      catchMapInstance.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-left");
      catchMapInstance.addControl(new window.maplibregl.AttributionControl({ compact: true, customAttribution: MAP_ATTRIBUTION }), "bottom-right");
      catchMapInstance.on("style.load", () => {
        catchMapStyleReady = true;
        ensureFishingLayers();
        updateMapSources(latestLocatedRecords);
        fitBoundsForFeatures(catchMapInstance, lastCatchFeatureCollection.features);
      });
    }
    if (empty) empty.hidden = located.length > 0;
    if (catchMapStyleReady) {
      ensureFishingLayers();
      updateMapSources(located);
      fitBoundsForFeatures(catchMapInstance, lastCatchFeatureCollection.features);
    }
    syncCatchMapBackdropSize();
    window.setTimeout(() => catchMapInstance?.resize(), 50);
  }

  function setCatchMapMode(mode) {
    if (!OPENFREEMAP_STYLES[mode] && mode !== "satellite") return;
    currentMapMode = mode;
    if (!catchMapInstance) {
      renderCatchMap();
      return;
    }
    catchMapStyleReady = false;
    catchMapInstance.setStyle(mapStyleForMode(mode));
  }

  function setCatchMapLayer(layer) {
    currentLayerFilter = layer || "all";
    applyLayerFilter();
  }

  function zoomToCatchOnMap(catchId) {
    const item = catchRecordById(catchId);
    const location = locationFrom(item);
    if (!catchMapInstance || !location) return;
    catchMapInstance.easeTo({ center: [location.longitude, location.latitude], zoom: Math.max(catchMapInstance.getZoom(), 15), duration: 450 });
  }

  function zoomOutAfterCatchDetail() {
    if (!catchMapInstance) return;
    catchMapInstance.easeTo({ zoom: Math.max(4, catchMapInstance.getZoom() - 5), duration: 350 });
  }

  function showCurrentLocationOnMap() {
    const status = $("#mapShareStatus");
    if (!navigator.geolocation) {
      if (status) status.textContent = "Din webbl\u00e4sare kan inte h\u00e4mta plats.";
      return;
    }
    $("#catchMapPanel").hidden = false;
    renderCatchMap();
    if (status) status.textContent = "H\u00e4mtar din plats...";
    navigator.geolocation.getCurrentPosition((position) => {
      const latitude = Number(position.coords.latitude);
      const longitude = Number(position.coords.longitude);
      if (!catchMapInstance || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      currentLocationFeature = featureCollection([{
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: { title: "Din plats", detail: "Nuvarande position" }
      }]);
      source("bigplus-current-location")?.setData(currentLocationFeature);
      catchMapInstance.easeTo({ center: [longitude, latitude], zoom: 14, duration: 500 });
      if (status) status.textContent = "Visar din plats.";
    }, () => {
      if (status) status.textContent = "Kunde inte h\u00e4mta din plats.";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function renderCatchLists() {
    const list = userCatches().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };
    const measurementFor = (item) => item.measurement || item;
    const speciesNameFor = (item) => measurementFor(item).speciesName || measurementFor(item).species || "Ok\u00e4nd art";
    const species = [...new Set(list.map(speciesNameFor))];
    const longest = list.reduce((current, item) => Math.max(current, Number(measurementFor(item).lengthCm) || 0), 0);
    const weekCutoff = Date.now() - (7 * 86400000);
    const weekCount = list.filter((item) => new Date(item.createdAt || 0).getTime() >= weekCutoff).length;
    setText("#catchPageTotal", list.length);
    setText("#catchPageBigplus", list.filter(isBigplusCatch).length);
    setText("#catchPageSpecies", species.length);
    setText("#catchPageLongest", longest ? `${longest.toFixed(1)} cm` : "--");
    setText("#catchWeekCount", `${Math.min(3, weekCount)}/3`);
    const weekProgress = $("#catchWeekProgress");
    if (weekProgress) weekProgress.style.width = `${Math.min(100, (weekCount / 3) * 100)}%`;
    const latestPage = $("#catchPageLatestList");
    if (latestPage) latestPage.innerHTML = list.slice(0, 4).map((item, index) => formatCatch(item, false, index)).join("");
    const speciesPage = $("#catchPageSpeciesList");
    if (speciesPage) {
      speciesPage.replaceChildren();
      ["Abborre", "G\u00e4dda", "G\u00f6s", "M\u00f6rt"].forEach((name) => {
        const item = document.createElement("div");
        const icon = document.createElement("b");
        icon.textContent = "\u{1F41F}";
        const label = document.createElement("span");
        label.textContent = name;
        item.append(icon, label);
        speciesPage.append(item);
      });
    }
    const html = list.length ? list.slice(0, 4).map((item, index) => formatCatch(item, true, index)).join("") : `<div class="empty-list"><strong>Inga sparade f\u00e5ngster \u00e4nnu</strong><span>M\u00e4t din f\u00f6rsta fisk f\u00f6r att se den h\u00e4r.</span></div>`;
    const home = $("#homeCatchList");
    const all = $("#allCatchList");
    if (home) home.innerHTML = html;
    updateHomeCatchView();
    if (all) all.innerHTML = list.length ? list.map((item, index) => formatCatch(item, false, index)).join("") : html;
    renderCatchMap();
    renderPersonalBestLists(list);
    syncCatchMapBackdropSize();
    renderHomeActivity(list);
    renderHomeFriendsOnline();
    renderHomeAchievements(list);
    renderHomeNextBadge(list);
    renderProfileLevelDashboard?.(list);
    renderHomeCompetitionRank();
    const bigplusCount = list.filter(isBigplusCatch).length;
    const competitionWins = list.filter((item) => (item.measurement || item).competitionWon).length;
    [$("#statCatches"), $("#profileCatchCount")].forEach((el) => { if (el) el.textContent = list.length; });
    [$("#statBigplus"), $("#profileBigplusCount")].forEach((el) => { if (el) el.textContent = bigplusCount; });
    if ($("#statAchievements")) $("#statAchievements").textContent = completedAchievementCount(list);
    const rank = calculateBigplusRank(catches());
    if ($("#statRank")) $("#statRank").textContent = rank ? `#${rank}` : "--";
    setStatChange("statCatchesChange", recentWindowDelta(list, () => true));
    setStatChange("statBigplusChange", recentWindowDelta(list, isBigplusCatch));
    setStatChange("statAchievementsChange", Math.max(0, completedAchievementCount(list) - completedAchievementCount(list.filter((item) => new Date(item.createdAt || 0).getTime() < Date.now() - (7 * 86400000)))));
    const rankCutoff = Date.now() - (7 * 86400000);
    const previousRank = calculateBigplusRank(catches().filter((item) => new Date(item.createdAt || 0).getTime() < rankCutoff));
    setStatChange("statRankChange", rank && previousRank && previousRank > rank ? previousRank - rank : 0, "platser denna vecka");
    if ($("#competitionWins")) $("#competitionWins").textContent = competitionWins;
    if ($("#profileCompetitionCount")) $("#profileCompetitionCount").textContent = competitionWins;
  }

  return {
    closeCatchDetailPanel,
    renderCatchDetail,
    renderCatchLists,
    renderCatchMap,
    setCatchMapLayer,
    setCatchMapMode,
    showCurrentLocationOnMap,
    zoomOutAfterCatchDetail,
    zoomToCatchOnMap
  };
}
