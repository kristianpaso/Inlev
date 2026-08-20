import { $, $$ } from "./dom.js";
import { HOME_CATCH_VIEW_KEY } from "./storage.js";

export function homeCatchView() {
  return localStorage.getItem(HOME_CATCH_VIEW_KEY) === "grid" ? "grid" : "list";
}

export function updateHomeCatchView(mode = homeCatchView()) {
  const home = $("#homeCatchList");
  if (home) home.classList.toggle("is-grid-view", mode === "grid");
  $$('[data-catch-view]').forEach((button) => {
    const active = button.dataset.catchView === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

export function setHomeCatchView(mode) {
  const nextMode = mode === "grid" ? "grid" : "list";
  localStorage.setItem(HOME_CATCH_VIEW_KEY, nextMode);
  updateHomeCatchView(nextMode);
}
