import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";
import { AUTH_API_ROOT } from "./api-root.js";

export function createCatchShareController({
  currentAccount,
  openAuth,
  catchRecordById,
  loadRemoteFriends,
  remoteFriends,
  acceptedFriendIds,
  accounts,
  remoteMapZones,
  setRemoteMapZones,
  renderMapSharePanel,
  updateMapShareControls
}) {
  function catchShareFriendRecords(accountId = currentAccount()?.id) {
    const remote = Array.isArray(remoteFriends()?.friends) ? remoteFriends().friends : [];
    if (remote.length) return remote;
    return acceptedFriendIds(accountId)
      .map((id) => accounts().find((account) => String(account.id) === String(id)))
      .filter(Boolean);
  }

  function renderCatchShareFriends() {
    const target = $("#catchShareFriendChoices");
    if (!target) return;
    const account = currentAccount();
    const friends = account ? catchShareFriendRecords(account.id) : [];
    if (!friends.length) {
      target.innerHTML = '<p class="catch-share-empty">Lägg till och acceptera en vän först.</p>';
      return;
    }
    target.innerHTML = friends.map((friend) => {
      const id = String(friend.id || friend._id || "");
      const name = escapeHtml(friend.name || friend.displayName || friend.email || "Vän");
      return `<label class="catch-share-choice"><input type="checkbox" name="catchShareRecipientIds" value="${escapeHtml(id)}"><span><strong>${name}</strong></span></label>`;
    }).join("");
  }

  function closeCatchShareModal() {
    const modal = $("#catchShareModal");
    if (modal) modal.hidden = true;
  }

  async function submitCatchCoordinateShare(event) {
    event.preventDefault();
    const account = currentAccount();
    const modal = $("#catchShareModal");
    const status = $("#catchShareFormStatus");
    const itemId = modal?.dataset.catchId;
    const recipientIds = [...document.querySelectorAll("input[name='catchShareRecipientIds']:checked")].map((input) => input.value);
    if (!account || !itemId) { if (status) status.textContent = "Logga in och öppna fångsten igen."; return; }
    if (!recipientIds.length) { if (status) status.textContent = "Välj minst en vän."; return; }
    try {
      const response = await fetch(`${AUTH_API_ROOT}/sharing/catches/${encodeURIComponent(itemId)}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunde inte dela koordinaterna.");
      let sharedZone = {
        id: `local-catch-share-${Date.now()}`,
        name: "Delad fångst",
        catchIds: [String(itemId)],
        recipientIds: recipientIds.map(String),
        createdAt: new Date().toISOString()
      };
      try {
        const zoneResponse = await fetch(`${AUTH_API_ROOT}/sharing/zones`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Delad fångst", catchIds: [String(itemId)], recipientIds })
        });
        const zoneData = await zoneResponse.json().catch(() => ({}));
        if (zoneResponse.ok && zoneData && (zoneData.id || zoneData._id)) sharedZone = zoneData;
      } catch {
        // Keep a local entry visible even when the optional zone endpoint is unavailable.
      }
      const zones = [sharedZone, ...remoteMapZones()];
      setRemoteMapZones(zones);
      localStorage.setItem(`bigplus_map_zones:${account.id}`, JSON.stringify(zones));
      renderMapSharePanel();
      updateMapShareControls();
      const count = Array.isArray(data.recipientIds) ? data.recipientIds.length : recipientIds.length;
      const catchStatus = $("#catchShareStatus");
      if (catchStatus) catchStatus.textContent = `Koordinaterna delas i appen med ${count} vän${count === 1 ? "" : "ner"}.`;
      closeCatchShareModal();
    } catch (error) {
      if (status) status.textContent = error.message || "Kunde inte dela koordinaterna.";
    }
  }

  function ensureCatchShareModal() {
    let modal = $("#catchShareModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "catchShareModal";
    modal.className = "catch-share-modal";
    modal.hidden = true;
    modal.innerHTML = `<div class="catch-share-dialog" role="dialog" aria-modal="true" aria-labelledby="catchShareTitle"><button class="text-button catch-detail-close" id="closeCatchShareModal" type="button">Stäng</button><p class="catch-detail-label">DELA I APPEN</p><h2 id="catchShareTitle">Dela fångstplats</h2><p>Välj vilka accepterade vänner som får se koordinaterna i Bigplus.</p><form id="catchShareForm"><div id="catchShareFriendChoices" class="catch-share-friend-choices"></div><p id="catchShareFormStatus" role="status"></p><div class="catch-share-actions"><button class="secondary-button" id="cancelCatchShare" type="button">Avbryt</button><button class="primary-button" type="submit">Dela med valda vänner</button></div></form></div>`;
    document.body.appendChild(modal);
    $("#catchShareForm")?.addEventListener("submit", submitCatchCoordinateShare);
    $("#closeCatchShareModal")?.addEventListener("click", closeCatchShareModal);
    $("#cancelCatchShare")?.addEventListener("click", closeCatchShareModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeCatchShareModal();
    });
    return modal;
  }

  async function shareCatchCoordinates() {
    const account = currentAccount();
    if (!account) { openAuth("login"); return; }
    const detail = $("#catchDetail");
    const item = catchRecordById(detail?.dataset.catchId);
    const status = $("#catchShareStatus");
    const latitude = Number(item?.location?.latitude);
    const longitude = Number(item?.location?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) { if (status) status.textContent = "Fångsten saknar sparade koordinater."; return; }
    const modal = ensureCatchShareModal();
    modal.hidden = false;
    modal.dataset.catchId = String(item.id || item._id || detail?.dataset.catchId || "");
    const formStatus = $("#catchShareFormStatus");
    if (formStatus) formStatus.textContent = "Välj accepterade vänner som ska se platsen i appen.";
    renderCatchShareFriends();
    await loadRemoteFriends();
    renderCatchShareFriends();
  }

  return { shareCatchCoordinates, closeCatchShareModal };
}
