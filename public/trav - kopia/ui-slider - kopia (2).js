/*!
 * ui-slider.js
 * Trav – divisionsslider + prisräknare + mobil-swipe
 * Självförsörjande modul som monterar UI i #trav-slider-host (skapar vid behov).
 * Visas enbart i spelvyn – ingen kod körs i överblicken.
 */

(function () {
  // ====== Små utils ======
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  const cls = (el, name, onoff) => el && el.classList.toggle(name, !!onoff);

  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "style") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const k of kids.flat(Infinity)) {
      if (k == null) continue;
      el.append(k.nodeType ? k : document.createTextNode(k));
    }
    return el;
  };

  // ====== Pris ======
  function calcPriceFromSummary(avdCount) {
    // Letar “summary”-rutorna under slidern. Varje ruta har ett tal (antal hästar) för avdelning i
    // ordning 1..N. Om någon är 0 -> pris 0. Annars produkt av alla.
    const cells = $$(".ts-sum .ts-sum-cell");
    if (!cells.length) return 0;
    const nums = cells
      .slice(0, avdCount)
      .map(c => {
        const n = parseInt(c.textContent.trim(), 10);
        return Number.isFinite(n) ? n : 0;
      });
    if (nums.some(n => n === 0)) return 0;
    return nums.reduce((a, b) => a * b, 1);
  }

  // ====== Per-spel lagringsnyckel (inte blandas mellan spel) ======
  const KEY = {
    game: id => `trav.game.${id}`,                // metadata om spelet (om du vill spara)
    coupons: id => `trav.coupons.${id}`,          // kuponger för spelet
    pickCounts: id => `trav.pickcounts.${id}`,    // summering per avdelning för spelet
    ui: id => `trav.ui.${id}`,                    // t.ex. senast visad avd
  };

  // ====== Slider klass ======
  class TravSlider {
    constructor(host, opts) {
      this.host = host;
      this.gameId = opts.gameId;
      this.avdCount = Math.max(1, Math.min(15, parseInt(opts.avdCount || 6, 10)));
      this.onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};
      this.state = {
        avd: 1,
        price: 0
      };
      // försök läsa senast visad avd för spelet
      try {
        const cache = JSON.parse(localStorage.getItem(KEY.ui(this.gameId)) || "{}");
        if (cache.avd && cache.avd >= 1 && cache.avd <= this.avdCount) this.state.avd = cache.avd;
      } catch {}
    }

    mount() {
      // Döda gamla “Avdelningar”-sektioner om de finns kvar
      $$("#view-game .section").forEach(sec => sec.remove());

      // Rensa host
      this.host.innerHTML = "";

      // Bygg UI
      const wrapper = h("div", { class: "ts-wrapper" });

      const bar = this.#renderBar();
      const sum = this.#renderSummary();

      wrapper.append(bar, sum);
      this.host.append(wrapper);

      // Aktivera aktuell avd
      this.#applyActive();

      // Setup swipe
      this.#setupSwipe(bar);

      // Init-price
      this.updatePrice();

      // Första event
      this.onChange({ avd: this.state.avd, price: this.state.price });

      // Var 500 ms: kolla om summeringen ändrats (om någon annan modul skriver)
      this._sumPoll = setInterval(() => this.updatePrice(), 500);
    }

    unmount() {
      clearInterval(this._sumPoll);
      this.host.innerHTML = "";
    }

    #renderBar() {
      const bar = h("div", { class: "ts-bar" });

      const headerRow = h("div", { class: "ts-bar-row ts-bar-row--tabs" });
      for (let i = 1; i <= this.avdCount; i++) {
        const btn = h(
          "button",
          {
            class: "ts-sq",
            "data-avd": String(i),
            onclick: () => this.setAvd(i),
          },
          String(i)
        );
        headerRow.append(btn);
      }

      const countsRow = h("div", { class: "ts-bar-row ts-bar-row--counts" });
      for (let i = 1; i <= this.avdCount; i++) {
        // initialt läs count från lagring (om finns)
        let n = 0;
        try {
          const saved = JSON.parse(localStorage.getItem(KEY.pickCounts(this.gameId)) || "{}");
          if (saved && typeof saved[i] === "number") n = saved[i];
        } catch {}
        const cell = h("div", { class: "ts-sq ts-sq--count", "data-avd": String(i) }, String(n));
        countsRow.append(cell);
      }

      bar.append(
        h("div", { class: "ts-bar-head" },
          h("div", { class: "ts-badge" }, "Avdelning"),
          h("div", { id: "priceLabel", class: "ts-price" }, "Pris: 0 kr")
        ),
        headerRow,
        countsRow
      );
      return bar;
    }

    #renderSummary() {
      // Summering – en rad med lika många celler som avdelningar
      const sumRow = h("div", { class: "ts-sum" });
      for (let i = 1; i <= this.avdCount; i++) {
        let n = 0;
        try {
          const saved = JSON.parse(localStorage.getItem(KEY.pickCounts(this.gameId)) || "{}");
          if (saved && typeof saved[i] === "number") n = saved[i];
        } catch {}
        sumRow.append(h("div", { class: "ts-sum-cell", "data-avd": String(i) }, String(n)));
      }
      return sumRow;
    }

    #setupSwipe(bar) {
      let startX = 0;
      let dx = 0;
      const threshold = 40;

      on(bar, "touchstart", (e) => {
        if (!e.touches || !e.touches.length) return;
        startX = e.touches[0].clientX;
        dx = 0;
      }, { passive: true });

      on(bar, "touchmove", (e) => {
        if (!e.touches || !e.touches.length) return;
        dx = e.touches[0].clientX - startX;
      }, { passive: true });

      on(bar, "touchend", () => {
        if (Math.abs(dx) > threshold) {
          if (dx < 0 && this.state.avd < this.avdCount) this.setAvd(this.state.avd + 1);
          if (dx > 0 && this.state.avd > 1) this.setAvd(this.state.avd - 1);
        }
      });
    }

    #applyActive() {
      // Markera aktiv tab
      $$(".ts-bar-row--tabs .ts-sq", this.host).forEach(btn => {
        const avd = parseInt(btn.getAttribute("data-avd"), 10);
        cls(btn, "active", avd === this.state.avd);
      });
    }

    setAvd(n) {
      if (n < 1 || n > this.avdCount) return;
      this.state.avd = n;
      this.#applyActive();
      try {
        localStorage.setItem(KEY.ui(this.gameId), JSON.stringify({ avd: n }));
      } catch {}
      // Ping ut
      this.onChange({ avd: n, price: this.state.price });
      // Låt andra delar veta att avd byttes
      document.dispatchEvent(new CustomEvent("trav:avd-change", { detail: { gameId: this.gameId, avd: n } }));
    }

    // Extern uppdatering av counts (t.ex. när “Min kupong” kryssas)
    setCount(avd, n) {
      // uppdatera count i barens counts-rad
      const countCell = $(`.ts-bar-row--counts .ts-sq--count[data-avd="${avd}"]`, this.host);
      if (countCell) countCell.textContent = String(n);

      // uppdatera summary-cellen
      const sumCell = $(`.ts-sum .ts-sum-cell[data-avd="${avd}"]`, this.host);
      if (sumCell) sumCell.textContent = String(n);

      // spara per spel
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(KEY.pickCounts(this.gameId)) || "{}") } catch {}
      saved[avd] = n;
      try { localStorage.setItem(KEY.pickCounts(this.gameId), JSON.stringify(saved)); } catch {}

      this.updatePrice();
    }

    updatePrice() {
      const p = calcPriceFromSummary(this.avdCount);
      this.state.price = p;
      const label = $("#priceLabel", this.host) || $("#priceLabel");
      if (label) label.textContent = `Pris: ${p} kr`;
      this.onChange({ avd: this.state.avd, price: p });
    }
  }

  // ====== Globalt mount-API ======
  window.TravSlider = {
    /**
     * Mounta slidern i en host (CSS-selector eller element)
     * @param {string|Element} where
     * @param {{gameId:string,avdCount:number,onChange?:Function}} opts
     */
    mount(where, opts) {
      const host = (typeof where === "string") ? $(where) : where;
      if (!host) return null;
      // se till att hosten ligger i spelvyn
      const vg = $("#view-game");
      if (vg && !vg.contains(host)) vg.append(host);

      const slider = new TravSlider(host, opts || {});
      slider.mount();

      // Koppla lyssnare så att andra komponenter kan pusha in ny “Min kupong”-count.
      // Exempel: document.dispatchEvent(new CustomEvent("trav:pickcount", { detail:{gameId,avd,count} }));
      on(document, "trav:pickcount", (e) => {
        const d = e.detail || {};
        if (d.gameId !== slider.gameId) return;
        if (!Number.isFinite(d.avd) || !Number.isFinite(d.count)) return;
        slider.setCount(d.avd, d.count);
      });

      return slider;
    }
  };

  // ====== Bas-styles (ingår här för enkel distribution) ======
  const BASE_CSS = `
#trav-slider-host { margin-top: 8px; }
.ts-wrapper { background:#0e1722; border-radius:12px; padding:10px; border:1px solid #223146; }
.ts-bar-head{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
.ts-badge{ font-weight:700; font-size:14px; color:#e6edf3; opacity:.75; }
.ts-price{ font-weight:700; font-size:14px; color:#fff; background:#2aa198; padding:4px 10px; border-radius:999px; }
.ts-bar-row{ display:flex; gap:8px; }
.ts-bar-row--tabs{ margin-bottom:6px; }
.ts-sq{ min-width:36px; height:32px; border-radius:8px; border:none; outline:none; cursor:pointer;
       background:#d9902f; color:#fff; font-weight:800; font-size:16px; display:flex; align-items:center; justify-content:center; }
.ts-sq.active{ background:#2f77ff; }
.ts-sq--count{ background:#784719; font-size:14px; }
.ts-sum{ display:flex; gap:8px; margin-top:10px; }
.ts-sum-cell{ min-width:36px; height:28px; border-radius:8px; background:#0b1320; color:#e6edf3; display:flex; align-items:center; justify-content:center; font-weight:700; border:1px dashed #223146; }
@media (max-width: 680px){
  .ts-sq{ min-width:32px; height:30px; font-size:15px; }
  .ts-sq--count{ min-width:32px; height:28px; font-size:13px; }
  .ts-sum-cell{ min-width:32px; height:26px; font-size:13px; }
  .ts-price{ font-size:13px; }
}
  `;
  const style = document.createElement("style");
  style.textContent = BASE_CSS;
  document.head.appendChild(style);
})();
