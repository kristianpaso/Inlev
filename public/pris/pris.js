(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  const STORAGE_KEY = "pris_backend_url";
  const DEFAULT_BACKEND = ""; // empty => same origin (/api...)

  const PAGE_SIZE = 20;
  const DEFAULT_LIMIT = 200; // hämta fler än vi visar, frontend paginerar
  const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 dag
  const NOTIFS_KEY = "pris_notifications_v1";
  const PRICE_HISTORY_KEY = "pris_price_history_v1";
  const WINDOW_SETTINGS_KEY = "pris_window_settings_v1";

  function normalizeUrl(base) {
    if (!base) return "";
    return String(base).trim().replace(/\/+$/, "");
  }

  function fmtPrice(value, currency) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const n = Number(value);
    const formatted = n.toLocaleString("sv-SE", { maximumFractionDigits: 0 });
    return formatted + " " + (currency || "SEK");
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function nowISO() {
    return new Date().toISOString();
  }

  async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs || 20000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const ctype = (res.headers.get("content-type") || "").toLowerCase();

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("API hittades inte (404). Sätt Backend URL i ⚙️ till din Render-backend eller kör backend lokalt.");
        }
        let short = "";
        try {
          short = (await res.text()).slice(0, 120).replace(/\s+/g, " ").trim();
        } catch {}
        throw new Error("HTTP " + res.status + (short ? (": " + short) : ""));
      }

      if (!ctype.includes("application/json")) {
        let short = "";
        try {
          short = (await res.text()).slice(0, 120).replace(/\s+/g, " ").trim();
        } catch {}
        throw new Error("Svarade inte med JSON. Kontrollera backend/proxy." + (short ? (" (" + short + ")") : ""));
      }

      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // ---------------- UI pieces (no JSX to avoid transpiler) ----------------
  function Button(props) {
    const cls = "btn" + (props.ghost ? " ghost" : "");
    return React.createElement("button", { className: cls, onClick: props.onClick, disabled: props.disabled, type: props.type || "button" }, props.children);
  }

  function ProductRow({ item }) {
    const isRea = Boolean(item.isDiscounted) || (item.originalPrice != null && Number(item.originalPrice) > Number(item.price));
    const dropPct = (item.originalPrice != null && Number(item.originalPrice) > Number(item.price))
      ? Math.round(((Number(item.originalPrice) - Number(item.price)) / Number(item.originalPrice)) * 100)
      : null;

    return React.createElement(
      "div",
      { className: "item" + (isRea ? " rea" : "") },
      React.createElement("div", { className: "thumb" }, item.image ? React.createElement("img", { src: item.image, alt: "" }) : "🛒"),
      React.createElement(
        "div",
        { className: "itemMain" },
        React.createElement("div", { className: "itemTitle", title: item.title || "" }, item.title || "Okänd produkt"),
        React.createElement(
          "div",
          { className: "itemMeta" },
          React.createElement("span", null, item.brand || "—"),
          item.store ? React.createElement("span", null, "• " + item.store) : null,
          item.source ? React.createElement("span", null, "• " + item.source) : null
        ),
        isRea ? React.createElement("div", { className: "badge" }, "REA", dropPct != null ? (" −" + dropPct + "%") : "") : null,
        item.url ? React.createElement("div", { className: "small" }, React.createElement("a", { href: item.url, target: "_blank", rel: "noopener" }, "Öppna butik →")) : null
      ),
      React.createElement(
        "div",
        { className: "priceBox" },
        React.createElement("div", { className: "priceNow" }, fmtPrice(item.price, item.currency)),
        item.originalPrice != null ? React.createElement("div", { className: "priceWas" }, fmtPrice(item.originalPrice, item.currency)) : null
      )
    );
  }

  function ProductWindow({ card, onRemove, onRefresh, onIntervalChange, busy }) {
    const list = card.results || [];
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    useEffect(() => {
      setVisibleCount(PAGE_SIZE);
    }, [card.id, (card.results || []).length]);

    const metaText = list.length ? (list.length + " träffar • billigast överst") : "—";
    const shown = list.slice(0, visibleCount);

    return React.createElement(
      "div",
      { className: "card" },
      React.createElement(
        "div",
        { className: "windowHead" },
        React.createElement(
          "div",
          null,
          React.createElement("div", { className: "h1" }, card.query),
          React.createElement("div", { className: "h2" }, metaText)
        ),
        React.createElement(
          "div",
          { className: "row" },
          React.createElement("div", { className: "pill" }, "Sort: Pris (lägst → högst)"),
          React.createElement(
            "div",
            { className: "pill" },
            "Uppdatera: ",
            React.createElement(
              "select",
              {
                className: "select",
                value: String(card.intervalMs || DEFAULT_INTERVAL_MS),
                onChange: (e) => onIntervalChange && onIntervalChange(Number(e.target.value)),
                disabled: busy,
              },
              React.createElement("option", { value: String(60 * 60 * 1000) }, "Var 1 tim"),
              React.createElement("option", { value: String(6 * 60 * 60 * 1000) }, "Var 6 tim"),
              React.createElement("option", { value: String(12 * 60 * 60 * 1000) }, "Var 12 tim"),
              React.createElement("option", { value: String(24 * 60 * 60 * 1000) }, "Var 1 dag"),
              React.createElement("option", { value: String(3 * 24 * 60 * 60 * 1000) }, "Var 3 dagar"),
              React.createElement("option", { value: String(7 * 24 * 60 * 60 * 1000) }, "Var 7 dagar")
            )
          ),
          React.createElement(Button, { ghost: true, onClick: onRefresh, disabled: busy }, busy ? "Uppdaterar…" : "Uppdatera"),
          React.createElement(Button, { ghost: true, onClick: onRemove }, "Ta bort")
        )
      ),
      React.createElement(
        "div",
        { className: "list" },
        list.length
          ? React.createElement(
              React.Fragment,
              null,
              shown.map((it) => React.createElement(ProductRow, { key: it.productId || it.id || (it.store + "|" + it.url), item: it })),
              list.length > visibleCount
                ? React.createElement(
                    "div",
                    { className: "loadMore" },
                    React.createElement(Button, { onClick: () => setVisibleCount((c) => c + PAGE_SIZE) }, "Visa fler sökresultat")
                  )
                : null
            )
          : React.createElement("div", { className: "small" }, card.error ? ("Fel: " + card.error) : "Inga resultat.")
      )
    );
  }

  function NotificationsPanel({ items, onClear, onRemoveOne }) {
    if (!items || !items.length) {
      return React.createElement(
        "div",
        { className: "notifs" },
        React.createElement("div", { className: "notifsHead" }, React.createElement("div", { className: "h1" }, "Notiser")),
        React.createElement("div", { className: "small" }, "Inga prisfall ännu.")
      );
    }

    return React.createElement(
      "div",
      { className: "notifs" },
      React.createElement(
        "div",
        { className: "notifsHead" },
        React.createElement("div", { className: "h1" }, "Notiser", React.createElement("span", { className: "badge" }, String(items.length))),
        React.createElement(Button, { ghost: true, onClick: onClear }, "Rensa")
      ),
      React.createElement(
        "div",
        { className: "notifsBody" },
        items.slice(0, 50).map((n) =>
          React.createElement(
            "div",
            { key: n.id, className: "notifRow" },
            React.createElement(
              "div",
              { className: "notifMain" },
              React.createElement("div", { className: "notifTitle" }, n.name || "Prisfall"),
              React.createElement(
                "div",
                { className: "small" },
                (n.query ? ("Sökning: " + n.query + " • ") : "") +
                  (n.old != null && n.new != null ? (fmtPrice(n.old) + " → " + fmtPrice(n.new)) : "")
              )
            ),
            React.createElement(
              "div",
              { className: "notifActions" },
              n.url ? React.createElement("a", { className: "btn ghost", href: n.url, target: "_blank", rel: "noreferrer" }, "Öppna") : null,
              onRemoveOne ? React.createElement(Button, { ghost: true, onClick: () => onRemoveOne(n.id) }, "✕") : null
            )
          )
        )
      )
    );
  }

  function SettingsModal({ open, value, onChange, onClose, onSave, onReset }) {
    if (!open) return null;
    return React.createElement(
      React.Fragment,
      null,
      React.createElement("div", { className: "modalBack", onClick: onClose }),
      React.createElement(
        "div",
        { className: "modal", role: "dialog", "aria-modal": "true" },
        React.createElement(
          "div",
          { className: "modalHead" },
          React.createElement(
            "div",
            null,
            React.createElement("div", { className: "h1" }, "Inställningar"),
            React.createElement("div", { className: "h2" }, "Backend URL sparas i webbläsaren")
          ),
          React.createElement(Button, { ghost: true, onClick: onClose }, "✕")
        ),
        React.createElement(
          "div",
          { className: "modalBody" },
          React.createElement("label", { className: "label" }, "Backend URL (tomt = samma origin)"),
          React.createElement("input", { className: "input", value: value, onChange: (e) => onChange(e.target.value), placeholder: "ex: http://localhost:3001 eller https://din-service.onrender.com" }),
          React.createElement(
            "div",
            { className: "row", style: { marginTop: 12 } },
            React.createElement(Button, { onClick: onSave }, "Spara"),
            React.createElement(Button, { ghost: true, onClick: onReset }, "Återställ")
          ),
          React.createElement("div", { className: "small" }, "Endpoint: ", React.createElement("code", null, "/api/pris/search?q=…"))
        )
      )
    );
  }

  function App() {
    const [backend, setBackend] = useState(() => {
      const v = localStorage.getItem(STORAGE_KEY);
      return v == null ? DEFAULT_BACKEND : v;
    });
    const [q, setQ] = useState("");
    const [strictMatch, setStrictMatch] = useState(() => localStorage.getItem("PRIS_STRICT_MATCH") === "1");
    const [status, setStatus] = useState("");
    const [statusKind, setStatusKind] = useState("");
    const [cards, setCards] = useState([]); // {id, query, results, error, intervalMs, nextUpdate}
    const [notifications, setNotifications] = useState(() => readJSON(NOTIFS_KEY, []));
    const [busyId, setBusyId] = useState(null);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const cardsRef = useRef([]);
    const busyRef = useRef(null);
    useEffect(() => {
      cardsRef.current = cards;
    }, [cards]);
    useEffect(() => {
      busyRef.current = busyId;
    }, [busyId]);

    function setStatusMsg(msg, kind) {
      setStatus(msg || "");
      setStatusKind(kind || "");
    }

    function maybeAddPriceDropNotifs(query, results) {
      const hist = readJSON(PRICE_HISTORY_KEY, {});
      let notifs = readJSON(NOTIFS_KEY, []);
      let added = 0;
      for (const r of results || []) {
        const pid = r.productId || r.id || r.productUrl || r.url;
        const priceNum = Number(r.priceNumber ?? r.price);
        if (!pid || !Number.isFinite(priceNum)) continue;
        const prev = hist[pid];
        if (prev !== undefined && Number.isFinite(Number(prev)) && priceNum < Number(prev)) {
          notifs.unshift({
            ts: Date.now(),
            query,
            productId: pid,
            name: r.name || r.title || r.productName || "Produkt",
            oldPrice: Number(prev),
            newPrice: priceNum,
            url: r.productUrl || r.url || ""
          });
          added++;
        }
        hist[pid] = priceNum;
      }
      writeJSON(PRICE_HISTORY_KEY, hist);
      if (added > 0) {
        notifs = notifs.slice(0, 200);
        writeJSON(NOTIFS_KEY, notifs);
        setNotifications(notifs);
      }
    }

    async function searchOne(query, cardId) {
      const b = normalizeUrl(backend);
      const url = (b ? (b + "/api/pris/search?q=") : "/api/pris/search?q=")
        + encodeURIComponent(query)
        + (strictMatch ? "&strict=1" : "")
        + "&limit=" + DEFAULT_LIMIT;

      setBusyId(cardId);
      try {
        const data = await fetchJson(url, 25000);
        const results = Array.isArray(data && data.results) ? data.results.slice() : [];
        results.sort((a, b) => Number(a.priceNumber ?? a.price) - Number(b.priceNumber ?? b.price));
        maybeAddPriceDropNotifs(query, results);
        setCards((prev) => prev.map((c) => {
          if (c.id !== cardId) return c;
          const intervalMs = c.intervalMs || DEFAULT_INTERVAL_MS;
          return { ...c, results, error: "", lastUpdatedAt: Date.now(), nextUpdateAt: Date.now() + intervalMs };
        }));
        setStatusMsg("Klart! Billigaste ligger överst. Rea är markerad.", "ok");
      } catch (e) {
        setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, results: [], error: e.message } : c)));
        setStatusMsg("Fel vid sökning: " + e.message, "bad");
      } finally {
        setBusyId(null);
      }
    }

    async function addProduct() {
      const query = q.trim();
      if (!query) {
        setStatusMsg("Skriv ett produktnamn först.", "warn");
        return;
      }
      // dedupe
      const exists = cards.some((c) => c.query.toLowerCase() === query.toLowerCase());
      if (exists) {
        setStatusMsg("Den produkten finns redan som ett fönster.", "warn");
        return;
      }
      const id = "c_" + Math.random().toString(16).slice(2);
      const newCard = {
        id,
        query,
        results: [],
        error: "",
        intervalMs: DEFAULT_INTERVAL_MS,
        lastUpdatedAt: 0,
        nextUpdateAt: Date.now() + DEFAULT_INTERVAL_MS
      };
      setCards((prev) => [newCard, ...prev]);
      setQ("");
      setStatusMsg("Söker…", "");
      await searchOne(query, id);
    }

    function removeCard(id) {
      setCards((prev) => prev.filter((c) => c.id !== id));
    }

    function refreshCard(id) {
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      searchOne(card.query, id);
    }

    function setCardIntervalMs(id, ms) {
      const safeMs = Math.max(60 * 60 * 1000, Number(ms) || DEFAULT_INTERVAL_MS); // minst 1h
      setCards((prev) => prev.map((c) => (c.id === id
        ? { ...c, intervalMs: safeMs, nextUpdateAt: Date.now() + safeMs }
        : c
      )));
      setStatusMsg("Uppdateringsintervall sparat.", "ok");
    }

    // Auto-uppdatera rutor när deras nextUpdateAt passerats
    useEffect(() => {
      const t = setInterval(() => {
        if (busyRef.current) return;
        const now = Date.now();
        const due = (cardsRef.current || []).find((c) => (c.nextUpdateAt || 0) > 0 && (c.nextUpdateAt || 0) <= now);
        if (due) {
          searchOne(due.query, due.id);
        }
      }, 30_000);
      return () => clearInterval(t);
    }, []);

    function saveBackend() {
      localStorage.setItem(STORAGE_KEY, backend);
      setSettingsOpen(false);
      setStatusMsg("Sparat backend: " + (backend ? backend : "(samma origin)"), "ok");
    }

    function resetBackend() {
      localStorage.setItem(STORAGE_KEY, DEFAULT_BACKEND);
      setBackend(DEFAULT_BACKEND);
      setStatusMsg("Återställt backend.", "ok");
    }

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "header",
        { className: "topbar" },
        React.createElement(
          "div",
          { className: "brand" },
          React.createElement("div", { className: "logo" }, "%"),
          React.createElement(
            "div",
            null,
            React.createElement("div", { className: "title" }, "Pris"),
            React.createElement("div", { className: "subtitle" }, "Sök billigast – flera produkter som egna fönster")
          )
        ),
        React.createElement(Button, { ghost: true, onClick: () => setSettingsOpen(true) }, "⚙️")
      ),
      React.createElement(
        "main",
        { className: "wrap" },
        React.createElement(
          "section",
          { className: "card" },
          React.createElement(
            "div",
            { className: "row" },
            React.createElement("input", {
              className: "input grow",
              value: q,
              onChange: (e) => setQ(e.target.value),
              placeholder: "Skriv produktnamn… ex: Lowrance Elite FS 9",
              onKeyDown: (e) => { if (e.key === "Enter") addProduct(); }
            }),
            React.createElement(Button, { onClick: addProduct }, "Lägg till")
          ),
          React.createElement("div", { className: "row smallrow" },
            React.createElement("label", { className: "check" },
              React.createElement("input", {
                type: "checkbox",
                checked: strictMatch,
                onChange: (e) => {
                  const v = !!e.target.checked;
                  setStrictMatch(v);
                  localStorage.setItem("PRIS_STRICT_MATCH", v ? "1" : "0");
                }
              }),
              React.createElement("span", null, "Kräv att alla ord/fraser finns i produktnamnet (minskar tillbehör)")
            )
          ),
          React.createElement("div", { className: "hint" }, "Varje produkt du lägger till får ett eget fönster. Billigaste pris visas överst. Rea markeras med grön ram och REA-badge."),
          React.createElement("div", { className: "status " + statusKind }, status || ("Backend: " + (backend ? backend : "(samma origin)") + " – ändra via ⚙️"))
        ),
        React.createElement(
          "section",
          { className: "grid" },
          cards.length
            ? cards.map((c) =>
                React.createElement(ProductWindow, {
                  key: c.id,
                  card: c,
                  busy: busyId === c.id,
                  onRemove: () => removeCard(c.id),
                  onRefresh: () => refreshCard(c.id),
                  onIntervalChange: (ms) => setCardIntervalMs(c.id, ms)
                })
              )
            : React.createElement(
                "div",
                { className: "card" },
                React.createElement("div", { className: "h1" }, "Inga produkter ännu"),
                React.createElement("div", { className: "small" }, "Skriv ett produktnamn och klicka “Lägg till”.")
              )
        ),

        React.createElement(NotificationsPanel, {
          notifications,
          onClear: () => {
            writeJSON(NOTIFS_KEY, []);
            setNotifications([]);
          },
          onRemoveOne: (idx) => {
            const next = (notifications || []).filter((_, i) => i !== idx);
            writeJSON(NOTIFS_KEY, next);
            setNotifications(next);
          }
        })
      ),
      React.createElement(SettingsModal, {
        open: settingsOpen,
        value: backend,
        onChange: setBackend,
        onClose: () => setSettingsOpen(false),
        onSave: saveBackend,
        onReset: resetBackend
      })
    );
  }

  function boot() {
    const root = ReactDOM.createRoot(document.getElementById("app"));
    root.render(React.createElement(App));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();