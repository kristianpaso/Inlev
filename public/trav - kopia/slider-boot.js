/*!
 * slider-boot.js
 * Monterar TravSlider i spelvyn. Körs varje gång route() växlar till ?game=...
 */

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Skapa host om saknas och städa gammal sektion
  function ensureHostInGame() {
    $$("#view-game .section").forEach(x => x.remove());
    let host = $("#trav-slider-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "trav-slider-host";
      const vg = $("#view-game");
      if (vg) vg.append(host);
    }
    return host;
  }

  function getGameMeta() {
    const params = new URLSearchParams(location.search);
    const gameId = params.get("game");
    if (!gameId) return null;

    let avd = 6;
    try {
      if (window.currentGame && window.currentGame.avd) avd = window.currentGame.avd;
    } catch {}

    const t = $("#gameTitle")?.textContent || "";
    const m = t.match(/\((\d+)\s*avd\)/i);
    if (m) avd = parseInt(m[1], 10) || avd;

    return { gameId, avdCount: avd };
  }

  function mountIfGame() {
    const meta = getGameMeta();
    if (!meta) return; // överblick – gör inget

    const host = ensureHostInGame();
    if (!window.TravSlider || typeof window.TravSlider.mount !== "function") return;

    if (!host.childElementCount) {
      window.TravSlider.mount(host, {
        gameId: meta.gameId,
        avdCount: meta.avdCount,
        onChange: ({ avd, price }) => {
          const avdTitle = document.querySelector("#avdTitle");
          if (avdTitle) avdTitle.textContent = `Avdelning ${avd} / ${meta.avdCount}`;
          const priceLabel = document.querySelector("#priceLabel");
          if (priceLabel) priceLabel.textContent = `Pris: ${price} kr`;
          document.dispatchEvent(new CustomEvent("trav:avd-change", { detail: { gameId: meta.gameId, avd } }));
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", mountIfGame);
  window.addEventListener("popstate", mountIfGame);
  window.addEventListener("hashchange", mountIfGame);
  const once = setTimeout(() => {
    mountIfGame();
    clearTimeout(once);
  }, 300);
})();