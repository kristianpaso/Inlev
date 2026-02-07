// public/trav/js/ui-coupon-combine.js
// Kombinera 2–8 kuponger till en ny kupong som innehåller ALLA hästar (union) per avdelning.
// UI: 8 "slots" med +, välj kupong från lista, live-förhandsvisning till höger.

import { createCoupon } from './api.js';

function getGame(){
  return window.game || (typeof window.__travGetGame === 'function' ? window.__travGetGame() : null);
}
function getGameId(){
  const g = getGame();
  return (g && (g._id || g.id)) || null;
}
function getCoupons(){
  if (typeof window.__travGetCoupons === 'function') return window.__travGetCoupons() || [];
  const g = getGame();
  return (g?.coupons || []).slice();
}

function divCount(){
  const g = getGame();
  if (g && Array.isArray(g.divisions) && g.divisions.length) return g.divisions.length;
  // fallback
  let mx = 0;
  getCoupons().forEach(c => (c.selections||[]).forEach(s => { mx = Math.max(mx, Number(s.divisionIndex||0)); }));
  return mx || 0;
}

function uniqSorted(nums){
  const s = new Set();
  (nums||[]).forEach(n => {
    const x = Number(n);
    if (Number.isFinite(x)) s.add(x);
  });
  return Array.from(s).sort((a,b)=>a-b);
}

function computeUnion(selectedCoupons){
  const nDiv = divCount();
  const out = [];
  for (let i=1;i<=nDiv;i++){
    const all = [];
    for (const c of selectedCoupons){
      const sel = (c.selections||[]).find(s => Number(s.divisionIndex) === i);
      if (sel && Array.isArray(sel.horses)) all.push(...sel.horses);
    }
    out.push({ divisionIndex: i, horses: uniqSorted(all) });
  }
  return out;
}

function couponSummary(c){
  const nDiv = divCount();
  let picks = 0;
  for (let i=1;i<=nDiv;i++){
    const sel = (c.selections||[]).find(s => Number(s.divisionIndex) === i);
    picks += (sel?.horses?.length || 0);
  }
  return `${nDiv} avd • ${picks} val`;
}

function ensureModal(){
  let modal = document.getElementById('combine-coupons-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'combine-coupons-modal';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.zIndex = '9999';
  modal.style.display = 'none';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.background = 'rgba(0,0,0,.55)';

  modal.innerHTML = `
    <div style="width:min(1100px,92vw);height:min(720px,86vh);background:rgba(10,14,22,.92);border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.10);">
        <div>
          <div style="font-weight:700;font-size:18px;">Kombinera kuponger</div>
          <div style="opacity:.75;font-size:12px;margin-top:2px;">Fyll 2–8 rutor med kuponger. Förhandsvisningen visar <b>alla</b> hästar (union) per avdelning.</div>
        </div>
        <button id="cc-close" class="btn small" style="border-radius:12px;">✕</button>
      </div>

      <div style="flex:1;display:grid;grid-template-columns: 420px 1fr;gap:16px;padding:16px;min-height:0;">
        <div style="display:flex;flex-direction:column;gap:10px;min-height:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-weight:700;opacity:.95;">Välj upp till 8 kuponger</div>
            <div id="cc-hint" style="font-size:12px;opacity:.75;"></div>
          </div>

          <div id="cc-slots" style="display:flex;flex-direction:column;gap:10px;overflow:auto;padding-right:6px;"></div>

          <div id="cc-picker" style="display:none;margin-top:8px;border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:10px;background:rgba(255,255,255,.04);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div style="font-weight:700;font-size:13px;opacity:.92;">Välj kupong</div>
              <button id="cc-picker-close" class="btn small" style="border-radius:10px;">Stäng</button>
            </div>
            <div id="cc-picker-list" style="display:flex;flex-direction:column;gap:8px;max-height:210px;overflow:auto;"></div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;min-height:0;">
          <div style="font-weight:700;opacity:.95;margin-bottom:10px;">Förhandsvisning</div>
          <div id="cc-preview" style="flex:1;overflow:auto;border:1px solid rgba(255,255,255,.10);border-radius:16px;background:rgba(255,255,255,.03);padding:12px;min-height:0;"></div>
        </div>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;padding:14px 16px;border-top:1px solid rgba(255,255,255,.10);">
        <button id="cc-cancel" class="btn">Avbryt</button>
        <button id="cc-create" class="btn primary">Skapa kombinerad kupong</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

function openModal(){
  const modal = ensureModal();
  const btnClose = modal.querySelector('#cc-close');
  const btnCancel = modal.querySelector('#cc-cancel');
  const btnCreate = modal.querySelector('#cc-create');
  const hint = modal.querySelector('#cc-hint');
  const slotsEl = modal.querySelector('#cc-slots');
  const picker = modal.querySelector('#cc-picker');
  const pickerList = modal.querySelector('#cc-picker-list');
  const pickerClose = modal.querySelector('#cc-picker-close');
  const previewEl = modal.querySelector('#cc-preview');

  const coupons = getCoupons();
  const chosen = new Array(8).fill(null);
  let activeSlot = -1;

  function selectedCoupons(){
    return chosen.filter(Boolean);
  }

  function renderSlots(){
    slotsEl.innerHTML = '';
    for (let i=0;i<8;i++){
      const c = chosen[i];
      const slot = document.createElement('div');
      slot.style.border = '1px solid rgba(255,255,255,.10)';
      slot.style.borderRadius = '16px';
      slot.style.padding = '12px';
      slot.style.background = activeSlot===i ? 'rgba(90,140,255,.12)' : 'rgba(255,255,255,.04)';
      slot.style.display = 'flex';
      slot.style.alignItems = 'center';
      slot.style.justifyContent = 'space-between';
      slot.style.cursor = 'pointer';

      if (!c){
        slot.innerHTML = `<div style="opacity:.7;">Ruta ${i+1}</div><div style="font-size:22px;font-weight:800;opacity:.85;">+</div>`;
      } else {
        slot.innerHTML = `
          <div>
            <div style="font-weight:800;">${escapeHtml(c.name || 'Kupong')}</div>
            <div style="font-size:12px;opacity:.75;margin-top:2px;">${couponSummary(c)}</div>
          </div>
          <button data-slot="${i}" class="btn small" style="border-radius:12px;">✕</button>
        `;
      }

      slot.addEventListener('click', (ev) => {
        const t = ev.target;
        if (t && t.matches && t.matches('button[data-slot]')) return; // handled below
        activeSlot = i;
        renderSlots();
        openPicker();
      });

      const rm = slot.querySelector('button[data-slot]');
      if (rm){
        rm.addEventListener('click', (ev) => {
          ev.stopPropagation();
          chosen[i] = null;
          if (activeSlot === i) activeSlot = -1;
          renderSlots();
          renderPreview();
        });
      }

      slotsEl.appendChild(slot);
    }
  }

  function openPicker(){
    if (activeSlot < 0) return;
    picker.style.display = 'block';
    pickerList.innerHTML = '';

    const already = new Set(selectedCoupons().map(c => c._id || c.id));
    coupons.forEach((c) => {
      const id = c._id || c.id;
      if (!id) return;

      const row = document.createElement('div');
      row.style.border = '1px solid rgba(255,255,255,.10)';
      row.style.borderRadius = '14px';
      row.style.padding = '10px';
      row.style.background = already.has(id) ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.06)';
      row.style.cursor = already.has(id) ? 'not-allowed' : 'pointer';
      row.style.opacity = already.has(id) ? '.55' : '1';

      row.innerHTML = `
        <div style="font-weight:800;">${escapeHtml(c.name || 'Kupong')}</div>
        <div style="font-size:12px;opacity:.75;margin-top:2px;">${couponSummary(c)}</div>
      `;

      row.addEventListener('click', () => {
        if (already.has(id)) return;
        chosen[activeSlot] = c;
        activeSlot = -1;
        picker.style.display = 'none';
        renderSlots();
        renderPreview();
      });

      pickerList.appendChild(row);
    });
  }

  function renderPreview(){
    const selected = selectedCoupons();
    const n = selected.length;

    if (n < 2){
      previewEl.innerHTML = `<div style="opacity:.75;">Välj minst 2 kuponger för att se förhandsvisning.</div>`;
      hint.textContent = '';
      btnCreate.disabled = true;
      return;
    }

    if (n > 8){
      hint.textContent = 'Max 8 kuponger.';
      btnCreate.disabled = true;
      return;
    }

    btnCreate.disabled = false;
    hint.textContent = `${n} valda`;

    const union = computeUnion(selected);
    let html = `<div style="opacity:.8;margin-bottom:10px;">Alla hästar från ${n} kuponger (union).</div>`;
    union.forEach(sel => {
      const horses = sel.horses || [];
      html += `
        <div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px dashed rgba(255,255,255,.10);">
          <div style="width:60px;opacity:.85;"><b>Avd ${sel.divisionIndex}</b></div>
          <div style="flex:1;opacity:${horses.length?1:.55};">${horses.length ? horses.join(' ') : '— inga val —'}</div>
        </div>
      `;
    });
    previewEl.innerHTML = html;
  }

  async function createCombined(){
    const gameId = getGameId();
    if (!gameId){
      alert('Spelet laddas fortfarande – prova igen om någon sekund.');
      return;
    }

    const selected = selectedCoupons();
    if (selected.length < 2){
      alert('Välj minst 2 kuponger.');
      return;
    }

    const selections = computeUnion(selected);
    const name = `Kombinerad (${selected.length} st)`;

    const payload = {
      source: 'combined',
      name,
      stakeLevel: selected[0]?.stakeLevel || 'original',
      status: 'waiting',
      selections
    };

    btnCreate.disabled = true;
    btnCreate.textContent = 'Skapar...';

    try{
      await createCoupon(gameId, payload);
      if (typeof window.__travRefreshGame === 'function') {
        await window.__travRefreshGame();
      }
      if (typeof window.showToast === 'function') window.showToast('Kombinerad kupong skapad!', 'success');
      closeModal();
    } catch (e){
      console.error(e);
      alert(e?.message || 'Kunde inte skapa kombinerad kupong.');
    } finally {
      btnCreate.disabled = false;
      btnCreate.textContent = 'Skapa kombinerad kupong';
    }
  }

  function onKey(e){
    if (e.key === 'Escape') closeModal();
  }

  function closeModal(){
    modal.style.display = 'none';
    document.removeEventListener('keydown', onKey);
  }

  btnClose.onclick = closeModal;
  btnCancel.onclick = closeModal;
  pickerClose.onclick = () => { picker.style.display = 'none'; activeSlot = -1; renderSlots(); };
  btnCreate.onclick = createCombined;

  document.addEventListener('keydown', onKey);

  renderSlots();
  renderPreview();
  modal.style.display = 'flex';
}

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

export function initCouponCombineUI(){
  const btn = document.getElementById('btn-combine-coupons');
  if (!btn) return;
  btn.addEventListener('click', openModal);
}

// auto-init
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initCouponCombineUI);
} else {
  initCouponCombineUI();
}
