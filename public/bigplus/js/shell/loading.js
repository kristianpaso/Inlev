import { $ } from "./dom.js";

let loadingTimerId = 0;
let loadingStartedAt = 0;

function updateLoadingTimer() {
  const timer = $("#appLoadingTimer");
  if (!timer || !loadingStartedAt) return;
  const elapsed = (performance.now() - loadingStartedAt) / 1000;
  timer.textContent = `${elapsed.toFixed(1).replace(".", ",")} s`;
}

export function setAppLoading(active, message = "Laddar...") {
  const screen = $("#appLoadingScreen");
  if (!screen) return;
  screen.hidden = !active;
  screen.setAttribute("aria-hidden", String(!active));
  const label = $("#appLoadingMessage");
  if (label) label.textContent = message;
  if (active) {
    if (!loadingStartedAt) loadingStartedAt = performance.now();
    window.clearInterval(loadingTimerId);
    updateLoadingTimer();
    loadingTimerId = window.setInterval(updateLoadingTimer, 100);
  } else {
    window.clearInterval(loadingTimerId);
    loadingTimerId = 0;
    updateLoadingTimer();
    loadingStartedAt = 0;
  }
  document.body.classList.toggle("is-app-loading", active);
}

export function exposeAppLoading() {
  window.bigplusLoading = {
    show: (message) => setAppLoading(true, message),
    hide: () => setAppLoading(false)
  };
}
