// /plock page adapter — normaliserar meddelanden från tillägget
// Läser både wrapped {type:'PLOCK_STATS', data:{...}} och flat {type:'PLOCK_STATS', count:...}
// och uppdaterar element på sidan om de finns.
(function () {
  function q(sel){ return document.querySelector(sel); }
  function setText(el, v){ if(el) el.textContent = String(v); }

  function render(stats) {
    const c  = Number(stats.count || 0);
    const ek = Number(stats.errorCount || 0);
    const tr = !!stats.tracking;
    const g  = Number(stats.goal || 165);

    const statusLine = `Tracking: ${tr ? 'PÅ' : 'AV'} — Plock: ${c}`;

    // Vanliga selektorer – uppdatera de fält som finns på din sida
    setText(q('#status .value'), statusLine);
    setText(q('#trackingStatus'), statusLine);
    setText(q('.tracking-status'), statusLine);

    const targets = ['#plockCount', '.plock-count', '[data-plock-count]', '#plockTotal', '#count'];
    for (const sel of targets) setText(q(sel), c);

    setText(q('#errorCount'), ek);

    const leftOrPlus = (c >= g) ? `+${c}` : String(g - c);
    setText(q('#badgeValue'), leftOrPlus);

    // Eget normaliserat event för valfri sidlogik
    try { window.dispatchEvent(new CustomEvent('PLOCK_STATS_NORMALIZED', { detail: { ...stats, leftOrPlus } })); } catch {}
  }

  function handleMessage(ev) {
    const m = ev.data || {};
    if (m.type !== 'PLOCK_STATS') return;
    const stats = m.data ? m.data : m; // wrapped eller flat
    render(stats);
  }

  // Lyssna på events från extensionens bridge
  window.addEventListener('message', handleMessage);

  // Signalera att sidan är redo (frivilligt – kan användas av sidlogik om den vill)
  try { window.postMessage({ type: 'PLOCK_PAGE_READY' }, '*'); } catch {}
})();
