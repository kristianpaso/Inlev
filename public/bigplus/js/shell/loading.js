import { $ } from "./dom.js";

export function setAppLoading(active, message = "Laddar...") {
  const screen = $("#appLoadingScreen");
  if (!screen) return;
  screen.hidden = !active;
  screen.setAttribute("aria-hidden", String(!active));
  const label = $("#appLoadingMessage");
  if (label) label.textContent = message;
  document.body.classList.toggle("is-app-loading", active);
}

export function exposeAppLoading() {
  window.bigplusLoading = {
    show: (message) => setAppLoading(true, message),
    hide: () => setAppLoading(false)
  };
}
