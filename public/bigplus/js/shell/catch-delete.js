import { $ } from "./dom.js";
import { CATCH_KEY, readJson } from "./storage.js";
import { AUTH_API_ROOT } from "./api-root.js";

function makeCatchDeleteCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 5 }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function removeLocalCatch(catchId) {
  const stored = readJson(CATCH_KEY, []);
  if (!Array.isArray(stored)) return;
  localStorage.setItem(CATCH_KEY, JSON.stringify(stored.filter((item) => String(item?.id || item?._id || "") !== String(catchId))));
}

export function createCatchDeleteController({ getCatchRecordById, getRemoteCatches, setRemoteCatches, renderCatchLists }) {
  let pendingCatchDeleteId = "";
  let pendingCatchDeleteCode = "";

  function openDeleteCatchDialog(catchId) {
    const item = getCatchRecordById(catchId);
    const modal = $("#deleteCatchModal");
    const code = $("#deleteCatchCode");
    const input = $("#deleteCatchCodeInput");
    const message = $("#deleteCatchMessage");
    const confirm = $("#confirmDeleteCatch");
    if (!item || !modal || !code || !input || !confirm) return;
    pendingCatchDeleteId = String(item.id || item._id || catchId);
    pendingCatchDeleteCode = makeCatchDeleteCode();
    code.textContent = pendingCatchDeleteCode;
    input.value = "";
    input.setAttribute("aria-label", `Skriv koden ${pendingCatchDeleteCode}`);
    confirm.disabled = true;
    if (message) message.textContent = "";
    modal.hidden = false;
    window.setTimeout(() => input.focus(), 0);
  }

  function closeDeleteCatchDialog() {
    const modal = $("#deleteCatchModal");
    if (modal) modal.hidden = true;
    pendingCatchDeleteId = "";
    pendingCatchDeleteCode = "";
  }

  async function confirmDeleteCatch() {
    const input = $("#deleteCatchCodeInput");
    const message = $("#deleteCatchMessage");
    const value = String(input?.value || "").trim().toUpperCase();
    if (!pendingCatchDeleteId || value !== pendingCatchDeleteCode) {
      if (message) message.textContent = "Koden stämmer inte. Försök igen.";
      return;
    }

    const catchId = pendingCatchDeleteId;
    const confirm = $("#confirmDeleteCatch");
    if (confirm) { confirm.disabled = true; confirm.textContent = "Tar bort..."; }
    try {
      if (!String(catchId).startsWith("local-")) {
        const response = await fetch(`${AUTH_API_ROOT}/catches/${encodeURIComponent(catchId)}`, { method: "DELETE", credentials: "include" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Kunde inte ta bort fångsten.");
      }
      removeLocalCatch(catchId);
      const remoteCatches = getRemoteCatches();
      if (Array.isArray(remoteCatches)) setRemoteCatches(remoteCatches.filter((item) => String(item.id || item._id || "") !== String(catchId)));
      closeDeleteCatchDialog();
      const detail = $("#catchDetail");
      if (detail) detail.hidden = true;
      renderCatchLists();
    } catch (error) {
      if (message) message.textContent = error.message || "Kunde inte ta bort fångsten.";
      if (confirm) { confirm.disabled = false; confirm.textContent = "Ta bort fångsten"; }
    }
  }

  return { openDeleteCatchDialog, closeDeleteCatchDialog, confirmDeleteCatch };
}
