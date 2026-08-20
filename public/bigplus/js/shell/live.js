import { LIVE_CHANNEL_KEY, LIVE_KEY } from "./storage.js";
import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";

export function liveUntil(accountId) {
  const raw = Number(localStorage.getItem(`${LIVE_KEY}:${accountId}:until`) || 0);
  return Number.isFinite(raw) ? raw : 0;
}

export function hasLiveFlag(accountId) {
  return Boolean(accountId && localStorage.getItem(`${LIVE_KEY}:${accountId}`) === "true");
}

export function isLive(accountId) {
  if (!hasLiveFlag(accountId)) return false;
  let until = liveUntil(accountId);
  if (!until) {
    until = Date.now() + 60 * 60 * 1000;
    localStorage.setItem(`${LIVE_KEY}:${accountId}:until`, String(until));
  }
  if (until && until <= Date.now()) {
    setLive(accountId, false);
    return false;
  }
  return true;
}

export function setLive(accountId, value, durationMinutes = 60) {
  if (!accountId) return;
  if (!value) {
    localStorage.removeItem(`${LIVE_KEY}:${accountId}`);
    localStorage.removeItem(`${LIVE_KEY}:${accountId}:until`);
    return;
  }
  localStorage.setItem(`${LIVE_KEY}:${accountId}`, "true");
  localStorage.setItem(
    `${LIVE_KEY}:${accountId}:until`,
    String(Date.now() + Math.max(1, Number(durationMinutes) || 60) * 60 * 1000)
  );
}

export function normalizeLiveChannel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function liveChannel(accountId) {
  return accountId ? localStorage.getItem(`${LIVE_CHANNEL_KEY}:${accountId}`) || "" : "";
}

export function setLiveChannel(accountId, value) {
  if (!accountId) return;
  const channel = normalizeLiveChannel(value);
  if (channel) localStorage.setItem(`${LIVE_CHANNEL_KEY}:${accountId}`, channel);
  else localStorage.removeItem(`${LIVE_CHANNEL_KEY}:${accountId}`);
}

export function liveRemainingMinutes(accountId) {
  if (!isLive(accountId)) return 0;
  return Math.max(1, Math.ceil((liveUntil(accountId) - Date.now()) / 60000));
}

export function renderLiveStatus(account) {
  const liveButton = $("#liveStatusButton");
  if (!liveButton || !account) return;
  const active = isLive(account.id);
  const remaining = liveRemainingMinutes(account.id);
  liveButton.classList.toggle("is-live", active);
  liveButton.setAttribute("aria-pressed", String(active));
  const label = $("#liveStatusLabel");
  if (label) label.textContent = active ? `LIVE \u00b7 ${remaining} min kvar` : "Aktivera LIVE";
  const channel = liveChannel(account.id);
  const channelTarget = $("#profileLiveChannel");
  if (channelTarget) {
    channelTarget.hidden = !active || !channel;
    channelTarget.innerHTML = channel ? `<a class="live-channel-link" href="${escapeHtml(channel)}" target="_blank" rel="noopener">Titta p\u00e5 min stream</a>` : "";
  }
}
