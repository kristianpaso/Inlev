import { API_ROOT } from "./config.js";
import { fetchJson } from "./http.js";

export function getWeatherPoint(lat, lon) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  return fetchJson(`${API_ROOT}/weather/point?${params.toString()}`, {}, "Kunde inte hämta väder");
}

export function getWeatherRadar(time) {
  const params = time ? `?time=${encodeURIComponent(time)}` : "";
  return fetchJson(`${API_ROOT}/weather/radar${params}`, {}, "Kunde inte hämta radar");
}

export function searchWeatherPlaces(query) {
  const params = new URLSearchParams({ q: String(query || "") });
  return fetchJson(`${API_ROOT}/weather/geocode?${params.toString()}`, {}, "Kunde inte söka plats");
}
