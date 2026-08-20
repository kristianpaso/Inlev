import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";
import { AUTH_API_ROOT } from "./api-root.js";
import { readJson } from "./storage.js";

export function createMapSharingController({
  currentAccount,
  openAuth,
  userCatches,
  acceptedFriendIds,
  accounts,
  remoteFriends,
  renderCatchMap
}) {
  let mapSharingEnabled = false;
  let remoteSharedCatches = [];
  let remoteMapZones = [];

  function mapSharingLocalKey(accountId = currentAccount()?.id) {
    return accountId ? `bigplus_map_sharing:${accountId}` : "";
  }

  function mapSharingLocal() {
    const key = mapSharingLocalKey();
    return key ? Boolean(readJson(key, false)) : false;
  }

  function getMapCatchRecords() {
    return [...userCatches(), ...(Array.isArray(remoteSharedCatches) ? remoteSharedCatches : [])];
  }

  function getRemoteMapZones() {
    return remoteMapZones;
  }

  function setRemoteMapZones(next) {
    remoteMapZones = Array.isArray(next) ? next : [];
  }

  function clearSharedCatches() {
    remoteSharedCatches = [];
    mapSharingEnabled = false;
    updateMapShareControls();
  }

  function updateMapShareControls() {
    const button = $("#shareMapWithFriends");
    const status = $("#mapShareStatus");
    if (!button) return;
    button.textContent = "Dela karta med v\u00e4nner";
    button.classList.toggle("is-active", remoteMapZones.length > 0 || mapSharingEnabled);
    if (status) status.textContent = remoteMapZones.length ? `${remoteMapZones.length} delad${remoteMapZones.length === 1 ? " zon" : "e zoner"}.` : "V\u00e4lj f\u00e5ngster och v\u00e4nner i delningspanelen.";
  }

  async function loadSharedMapData() {
    if (!currentAccount()) {
      remoteSharedCatches = [];
      mapSharingEnabled = false;
      updateMapShareControls();
      return;
    }
    try {
      const [shareResponse, mapResponse, zonesResponse] = await Promise.all([
        fetch(`${AUTH_API_ROOT}/sharing/map`, { credentials: "include" }),
        fetch(`${AUTH_API_ROOT}/sharing/maps`, { credentials: "include" }),
        fetch(`${AUTH_API_ROOT}/sharing/zones`, { credentials: "include" })
      ]);
      const share = await shareResponse.json().catch(() => ({}));
      const shared = await mapResponse.json().catch(() => []);
      const zones = await zonesResponse.json().catch(() => []);
      mapSharingEnabled = Boolean(share.enabled);
      remoteSharedCatches = Array.isArray(shared) ? shared : [];
      const localZones = readJson(`bigplus_map_zones:${currentAccount()?.id}`, []);
      const serverZones = Array.isArray(zones) ? zones : [];
      const serverIds = new Set(serverZones.map((zone) => String(zone.id || zone._id || "")));
      remoteMapZones = [...serverZones, ...(Array.isArray(localZones) ? localZones.filter((zone) => !serverIds.has(String(zone.id || zone._id || ""))) : [])];
    } catch {
      mapSharingEnabled = mapSharingLocal();
      remoteSharedCatches = [];
      remoteMapZones = readJson(`bigplus_map_zones:${currentAccount()?.id}`, []);
    }
    updateMapShareControls();
    renderCatchMap();
    renderMapSharePanel();
  }

  function renderMapSharePanel() {
    const panel = $("#mapSharePanel");
    const account = currentAccount();
    if (!panel || !account) return;
    const catchTarget = $("#mapShareCatchChoices");
    const friendTarget = $("#mapShareFriendChoices");
    const located = userCatches().filter((item) => Number.isFinite(Number(item.location?.latitude)) && Number.isFinite(Number(item.location?.longitude)));
    const friends = remoteFriends()?.friends || acceptedFriendIds(account.id).map((id) => accounts().find((item) => item.id === id)).filter(Boolean);
    if (catchTarget) catchTarget.innerHTML = located.length ? located.map((item) => {
      const measurement = item.measurement || item;
      const species = measurement.speciesName || measurement.species || "Fångst";
      const length = Number(measurement.lengthCm || 0);
      return `<label class="map-share-choice"><input type="checkbox" name="catchIds" value="${escapeHtml(String(item.id || item._id))}"><span><strong>${escapeHtml(species)}</strong><small>${length ? `${length.toFixed(1)} cm` : "Mått saknas"}</small></span></label>`;
    }).join("") : `<p class="map-share-empty">Inga fångster med sparad plats ännu.</p>`;
    if (friendTarget) friendTarget.innerHTML = friends.length ? friends.map((friend) => `<label class="map-share-choice"><input type="checkbox" name="recipientIds" value="${escapeHtml(String(friend.id || friend._id))}"><span><strong>${escapeHtml(friend.name || "Fiskare")}</strong><small>${escapeHtml(friend.memberCode || "Accepterad vän")}</small></span></label>`).join("") : `<p class="map-share-empty">Lägg till och acceptera en vän först.</p>`;
    const zones = $("#mapShareZoneList");
    if (zones) zones.innerHTML = remoteMapZones.length ? `<h3>Dina delade zoner</h3>${remoteMapZones.map((zone) => `<div class="map-share-zone-row"><span><strong>${escapeHtml(zone.name)}</strong><small>${zone.catchIds.length} fångst${zone.catchIds.length === 1 ? "" : "er"} · ${zone.recipientIds.length} vän${zone.recipientIds.length === 1 ? "" : "ner"}</small></span><button type="button" class="text-button" data-delete-map-zone="${escapeHtml(zone.id)}">Ta bort</button></div>`).join("")}` : "";
  }

  async function createMapShareZone(event) {
    event.preventDefault();
    const account = currentAccount();
    const status = $("#mapShareFormStatus");
    if (!account) return openAuth("login");
    const form = event.currentTarget;
    const catchIds = [...form.querySelectorAll("input[name='catchIds']:checked")].map((input) => input.value);
    const recipientIds = [...form.querySelectorAll("input[name='recipientIds']:checked")].map((input) => input.value);
    if (!catchIds.length) { if (status) status.textContent = "Välj minst en fångst med plats."; return; }
    if (!recipientIds.length) { if (status) status.textContent = "Välj minst en accepterad vän."; return; }
    const body = { name: $("#mapShareZoneName")?.value || "Delad zon", catchIds, recipientIds };
    try {
      const response = await fetch(`${AUTH_API_ROOT}/sharing/zones`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Kunde inte dela zonen (HTTP ${response.status}).`);
      remoteMapZones = [data, ...remoteMapZones];
      localStorage.setItem(`bigplus_map_zones:${account.id}`, JSON.stringify(remoteMapZones));
      form.reset();
      renderMapSharePanel();
      updateMapShareControls();
      if (status) status.textContent = "Zonen delas nu med valda vänner.";
    } catch (error) {
      if (status) status.textContent = error.message || "Kunde inte dela zonen.";
    }
  }

  async function deleteMapShareZone(zoneId) {
    try {
      const response = await fetch(`${AUTH_API_ROOT}/sharing/zones/${encodeURIComponent(zoneId)}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Kunde inte ta bort zonen.");
      remoteMapZones = remoteMapZones.filter((zone) => String(zone.id) !== String(zoneId));
      renderMapSharePanel();
      updateMapShareControls();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function toggleMapSharing() {
    const account = currentAccount();
    if (!account) { openAuth("login"); return; }
    const recipientIds = acceptedFriendIds(account.id);
    if (!recipientIds.length) { window.alert("Lägg till minst en accepterad vän först."); return; }
    const enabled = !mapSharingEnabled;
    try {
      const response = await fetch(`${AUTH_API_ROOT}/sharing/map`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, recipientIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera kartdelning.");
      mapSharingEnabled = Boolean(data.enabled);
      localStorage.setItem(mapSharingLocalKey(account.id), JSON.stringify(mapSharingEnabled));
      updateMapShareControls();
    } catch (error) {
      window.alert(error.message || "Kunde inte uppdatera kartdelning.");
    }
  }

  return {
    clearSharedCatches,
    createMapShareZone,
    deleteMapShareZone,
    getMapCatchRecords,
    getRemoteMapZones,
    loadSharedMapData,
    renderMapSharePanel,
    setRemoteMapZones,
    toggleMapSharing,
    updateMapShareControls
  };
}
