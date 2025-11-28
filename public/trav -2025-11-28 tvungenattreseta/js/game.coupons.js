import { el } from './trav.dom.js';
import { TravStore } from './trav.storage.js';

const priceOf = parts => parts.reduce((acc, arr) => acc * Math.max(1, arr.length), 1);

/** Render listan över importerade/manuella kuponger + “Lägg kupong manuellt”  */
export function renderCoupons(gameId, host, onChange) {
  host.innerHTML = '';
  const state = TravStore.load(gameId);

  const grid = el('div', { class: 'kuponger' });

  state.coupons.forEach((c, idx) => {
    const body = c.parts
      .map((arr, i) => `Avd ${i + 1}: ${arr.length ? arr.slice().sort((a, b) => a - b).join(' ') : '—'}`)
      .join('<br/>');

    const card = el('div', { class: 'kcard' },
      el('h4', {}, `Kupong ${idx + 1}`),
      el('div', { class: 'notice', innerHTML: body }),
      el('div', { class: 'notice', style: 'margin-top:6px' }, `Pris: ${priceOf(c.parts)} kr`),
      el('button', {
        class: 'rm',
        onclick: () => {
          state.coupons.splice(idx, 1);
          TravStore.save(gameId, { coupons: state.coupons });
          onChange?.();
        }
      }, 'Ta bort')
    );
    grid.append(card);
  });

  const addManual = el('button', {
    class: 'rm',
    style: 'background:#19351b;color:#baf7ba;border-color:#2a5b2a;margin-top:8px'
  }, 'Lägg kupong manuellt');

  addManual.addEventListener('click', () => {
    const txt = prompt('Klistra in kupong. En rad per avdelning, t.ex: "1 3 5"');
    if (!txt) return;
    const parts = txt.trim()
      .split(/\n+/)
      .map(r => r.trim().split(/\s+/).map(n => parseInt(n, 10)).filter(Boolean));
    state.coupons.push({ id: Date.now(), parts });
    TravStore.save(gameId, { coupons: state.coupons });
    onChange?.();
  });

  const addOCR = el('button', {
    class: 'rm',
    style: 'background:#1b2a35;color:#b3e6ff;border-color:#1d415a;margin-left:8px'
  }, 'Läs kupong (OCR)');
  addOCR.addEventListener('click', () => {
    alert('OCR: stub här – koppla din tidigare OCR-funktion.');
  });

  host.append(grid, el('div', {}, addManual, addOCR));
}

/** Beräkna stjärnor (spikar) från kuponger för nuvarande avdelning */
export function spikeStarsFromCoupons(gameId, avd) {
  const { coupons } = TravStore.load(gameId);
  const spikes = new Map(); // horseNum => count
  coupons.forEach(c => {
    const part = c.parts[avd - 1];
    if (!part) return;
    if (part.length === 1) {
      spikes.set(part[0], (spikes.get(part[0]) || 0) + 1);
    }
  });
  return spikes;
}
