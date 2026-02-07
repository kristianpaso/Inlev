// public/trav/js/overview.js



// var innan: import { getGame } from './api.js';

import { getGame, createCoupon, deleteCoupon, getTracks, getAtgLinks, saveAtgLink, updateCouponActive, updateCouponStatus, fetchWinners, fetchStallsnack, updateCouponContent, getAnalyses } from './api.js';

// race-sim.js is loaded as a classic script to avoid module parsing issues in some environments.
// It exposes initRaceSim on window.
const initRaceSim = (typeof window !== 'undefined') ? window.initRaceSim : null;


let game = null;
let currentGameId = null;
let analysesCache = [];
let allTracks = [];  
let currentTrackMatch = null;  
let manualWinners = {};  // { '1': 3, '2': 11, ... } manuella vinnare per avdelning
function normStr(s){ return String(s||'').trim().toLowerCase(); }

function extractGroupFromGame(game){
  const t = (game?.horseText || '') + '\n' + (game?.title || '');
  const m = t.match(/STL\s*Klass\s*[IVX0-9]+/i);
  return m ? m[0] : '';
}
function extractTrackTypeFromGame(game){
  const t = (game?.horseText || '') + '\n' + (game?.title || '');
  const m = t.match(/(Lätt\s+bana|Tung\s+bana|Normal\s+bana|Medel\s+bana|Fast\s+bana)/i);
  return m ? m[0] : '';
}
function extractDistanceFromGame(game){
  const t = (game?.horseText || '');
  const m = t.match(/\b(1\d{3}|2\d{3}|3\d{3})\s*m\b/i); // "2640 m"
  if (m) return Number(m[1]);
  return 0;
}

// Poängbaserad matchning (bäst = högst score)
function findBestAnalysis(ctx, list){
  const wantTrack = normStr(ctx?.track);
  const wantType = normStr(ctx?.trackType);
  const wantGroup = normStr(ctx?.group);
  const wantStart = normStr(ctx?.start);
  const wantDist = Number(ctx?.distance || 0);

  let best = null;
  let bestScore = -1;

  for (const a of (list||[])){
    let score = 0;
    const aTrack = normStr(a.track);
    const aType = normStr(a.trackType);
    const aGroup = normStr(a.group);
    const aStart = normStr(a.start);
    const aDist = Number(a.distance || 0);

    if (wantTrack && aTrack){
      if (aTrack === wantTrack) score += 50;
      else if (aTrack.includes(wantTrack) || wantTrack.includes(aTrack)) score += 25;
      else continue; // bana måste matcha för att vi ska använda analysen
    }

    if (wantType && aType){
      if (aType === wantType) score += 18;
      else if (aType.includes(wantType) || wantType.includes(aType)) score += 10;
    }

    if (wantStart && aStart){
      if (aStart === wantStart) score += 16;
      else if ((aStart.includes('volt') && wantStart.includes('volt')) || (aStart.includes('auto') && wantStart.includes('auto'))) score += 8;
    }

    if (wantGroup && aGroup){
      if (aGroup === wantGroup) score += 12;
      else if (aGroup.includes(wantGroup) || wantGroup.includes(aGroup)) score += 6;
    }

    if (wantDist && aDist){
      const diff = Math.abs(aDist - wantDist);
      if (diff === 0) score += 8;
      else if (diff <= 20) score += 6;
      else if (diff <= 100) score += 3;
    }

    // liten bonus för nyare analyser
    const created = a.createdAt ? Date.parse(a.createdAt) : 0;
    if (created) score += Math.max(0, Math.min(4, (created / 1e12)));

    if (score > bestScore){
      bestScore = score;
      best = a;
    }
  }

  return best ? { analysis: best, score: bestScore } : { analysis: null, score: 0 };
}


// ------------------
// Manuella vinnare (fallback om backend/Netlify strular)
// ------------------
function storageKeyManualWinners(gameId) {
  return `trav_manual_winners_${String(gameId || '').trim()}`;
}
function loadManualWinners(gameId) {
  try {
    const key = storageKeyManualWinners(gameId);
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) {
    return {};
  }
}
function saveManualWinners(gameId, map) {
  try {
    const key = storageKeyManualWinners(gameId);
    localStorage.setItem(key, JSON.stringify(map || {}));
  } catch (e) {}
}
function setManualWinner(avdIndex, horseNum) {
  const a = String(Number(avdIndex));
  const n = Number(horseNum);
  if (!Number.isFinite(Number(a)) || Number(a) <= 0) return;
  if (!Number.isFinite(n) || n <= 0) {
    // clear
    delete manualWinners[a];
  } else {
    manualWinners[a] = n;
  }
  saveManualWinners(currentGameId, manualWinners);
  // uppdatera UI direkt
  try { updateWinnerSummaryUI(); } catch (e) {}
  try { renderCouponList(); } catch (e) {}
  try { renderDivisionTable && renderDivisionTable(); } catch (e) {}
}
function getWinnerNumber(avdIndex) {
  const a = String(Number(avdIndex));
  const m = manualWinners && manualWinners[a];
  if (Number.isFinite(Number(m)) && Number(m) > 0) return Number(m);
  if (game && game.results) {
    const r = game.results[a] ?? game.results[Number(a)];
    const n = Number(r);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}



let divisions = [];
let currentIndex = 0;
let headerColumns = [];
let divisionSquares = [];
let divisionCountEls = [];
let coupons = [];                 // sparade kuponger för spelet
let isBuildingCoupon = false;
let couponSelections = {};        // { divisionIndex: Set([...]) }
let stakeLevel = 'original'; // 'original' | '70' | '50' | '30'

// ---- Redigera / kopiera kuponger till Idéfältet ("Min kupong") ----
let editingIdeaCouponId = null;
let editingIdeaCouponName = '';
let editingIdeaCouponStatus = null;

// ---- Omvänd kupong-läge ----
let reverseMode = false;              // om vi är i "Omvänd kupong"-läget
let selectedReverseCoupon = null;     // kupongen vi har markerat
let reverseSupersInputEl = null;

// DOM-referenser för reverse-panelen
let reversePanelEl = null;
let reverseNameInputEl = null;
let reversePriceInputEl = null;
let reverseSpikesInputEl = null;
let isCreatingReverseCoupon = false; // ⬅ lägg till

// ---- Fyll på kupong-läge ----
let fillMode = false;
let selectedFillCoupon = null;


// ---- Skala kupong-läge ----
let scaleMode = false;
let selectedScaleCoupon = null;

// ---- Inte spelad kupong-läge ----
let notPlayedMode = false;
let selectedNotPlayedCoupon = null;
let notPlayedExitFloatingEl = null;

function ensureNotPlayedExitButton() {
  if (notPlayedExitFloatingEl && document.body.contains(notPlayedExitFloatingEl)) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'notplayed-exit-floating';
  btn.className = 'btn small notplayed-exit-floating';
  btn.textContent = 'Avsluta Inte spelad (Esc)';
  btn.addEventListener('click', () => exitNotPlayedMode());
  document.body.appendChild(btn);
  notPlayedExitFloatingEl = btn;
}

function exitNotPlayedMode() {
  notPlayedMode = false;
  selectedNotPlayedCoupon = null;
  document.body.classList.remove('notplayed-mode-active');
  document.querySelectorAll('.coupon-card.selected-for-notplayed')
    .forEach(c => c.classList.remove('selected-for-notplayed'));
  if (notPlayedExitFloatingEl) notPlayedExitFloatingEl.hidden = true;
  try { renderCouponList(); } catch {}
}


// DOM refs
let fillPanelEl = null;
let fillSelectedInfoEl = null;
let fillPriceEl = null;
let fillCountEl = null;
let fillSpikesEl = null;
let fillSpikesDisplayEl = null;
let fillProfileEl = null;
let fillProfileDisplayEl = null;

// ---- Fyll på kupong: UI helpers ----
let fillAnchorCardEl = null;
let fillExitFloatingEl = null;

function ensureFillExitButton() {
  if (fillExitFloatingEl && document.body.contains(fillExitFloatingEl)) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'fill-exit-floating';
  btn.className = 'btn small fill-exit-floating';
  btn.textContent = 'Avsluta fyll-läge (Esc)';
  btn.addEventListener('click', () => exitFillMode());
  document.body.appendChild(btn);
  fillExitFloatingEl = btn;
}

function exitFillMode() {
  fillMode = false;
  selectedFillCoupon = null;
  fillAnchorCardEl = null;
  document.body.classList.remove('fill-mode-active');
  if (fillPanelEl) {
    fillPanelEl.hidden = true;
    // återställ ev. inline positionering
    fillPanelEl.style.left = '';
    fillPanelEl.style.top = '';
    fillPanelEl.style.right = '';
    fillPanelEl.style.bottom = '';
    fillPanelEl.style.maxHeight = '';
  }
  document.querySelectorAll('.coupon-card.selected-for-fill')
    .forEach(c => c.classList.remove('selected-for-fill'));

  if (fillExitFloatingEl) fillExitFloatingEl.hidden = true;

  // rendera om så korten slutar vara klickbara
  try { renderCouponList(); } catch {}
}

function isMobileFillLayout() {
  return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
}

function positionFillPanelNearCard(cardEl) {
  if (!fillPanelEl || !cardEl) return;

  // På mobil styrs layout helt av CSS (panel i nedre halvan)
  if (isMobileFillLayout()) {
    fillPanelEl.style.left = '';
    fillPanelEl.style.top = '';
    fillPanelEl.style.right = '';
    fillPanelEl.style.bottom = '';
    fillPanelEl.style.maxHeight = '';
    return;
  }

  // Desktop: lägg panelen bredvid kortet, men håll inom viewport
  const rect = cardEl.getBoundingClientRect();

  // Gör panelen synlig innan vi mäter
  fillPanelEl.hidden = false;
  fillPanelEl.style.position = 'fixed';
  fillPanelEl.style.maxHeight = 'calc(100vh - 140px)';

  const gap = 16;
  const panelW = fillPanelEl.offsetWidth || 320;
  const panelH = fillPanelEl.offsetHeight || 480;

  let left = rect.right + gap;
  // om den hamnar utanför till höger, försök till vänster
  if (left + panelW > window.innerWidth - 12) {
    left = rect.left - gap - panelW;
  }
  // fallback: kläm inom viewport
  left = Math.max(12, Math.min(left, window.innerWidth - panelW - 12));

  // Vertikalt: försök aligna med kortets top, men håll inom viewport
  let top = rect.top;
  if (top + panelH > window.innerHeight - 12) {
    top = Math.max(12, window.innerHeight - panelH - 12);
  }
  top = Math.max(12, top);

  fillPanelEl.style.left = `${Math.round(left)}px`;
  fillPanelEl.style.top = `${Math.round(top)}px`;
}

// Esc ska alltid kunna lämna fyll-läget
window.addEventListener('keydown', (e) => {
  if (!fillMode) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    exitFillMode();
  }
});

// Esc ska kunna lämna Inte-spelad-läget och stänga kupongmenyn
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // stäng sidemeny om öppen
  if (document.body.classList.contains('coupon-menu-open')) {
    e.preventDefault();
    document.body.classList.remove('coupon-menu-open');
    return;
  }
  if (!notPlayedMode) return;
  e.preventDefault();
  exitNotPlayedMode();
});







// ---- Kupong sidemeny (desktop: fast vänster, mobil: hopfällbar) ----
function setupCouponSidemenu() {
  const toggle = document.getElementById('btn-coupon-menu-toggle');
  const closeBtn = document.getElementById('btn-coupon-menu-close');
  const backdrop = document.getElementById('coupon-sidemenu-backdrop');
  if (backdrop) backdrop.hidden = true;

  const open = () => {
    document.body.classList.add('coupon-menu-open');
    if (backdrop) backdrop.hidden = false;
  };
  const close = () => {
    document.body.classList.remove('coupon-menu-open');
    if (backdrop) backdrop.hidden = true;
  };

  if (toggle) toggle.addEventListener('click', () => {
    const isOpen = document.body.classList.contains('coupon-menu-open');
    if (isOpen) close();
    else open();
  });
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);

  // stäng om man byter till desktop
  const mq = window.matchMedia ? window.matchMedia('(min-width: 901px)') : null;
  if (mq) {
    const onChange = () => { if (mq.matches) close(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}

// markerade idé-hästar per avdelning (Set med nummer)
let selectedIdeaNumbersByDivIndex = {};

// Ladda om spelet från API och rendera om vyerna (utan att duplicera event listeners)
async function refreshGame() {
  if (!currentGameId) return;
  const fresh = await getGame(currentGameId);
  if (!fresh) return;

  game = fresh;
  window.game = game;
  window.__travRefreshGame = refreshGame;

  // Håll coupons i samma format som setupOverview
  coupons = (game.coupons || []).map(c => {
    const status = normalizeStatus(c.status, c.active);
    return {
      ...c,
      status,
      active: status === COUPON_STATUS.ACTIVE
    };
  });

  try { if (window.game) window.game.coupons = coupons; } catch (_) {}
  try { window.__travGetCoupons = () => coupons; } catch (_) {}


  try { renderCouponList(); } catch (_) {}
  try { renderCurrentDivision(); } catch (_) {}
}

// visningsläge: "simple", "detailed" eller "icons"
let listMode = 'simple';

// ---- Status-rad (används bl.a. av Stallsnack-knappen) ----
// Tidigare patchar refererade till setStatus(), men funktionen saknades.
// Den här implementationen är "fail-safe":
//  - Om ingen status-yta finns skapas en liten text bredvid knappen.
//  - Om knappen inte finns loggas texten till console.
function setStatus(message) {
  try {
    let el = document.getElementById('ov-status');

    // Skapa status-element bredvid Stallsnack-knappen om den saknas
    if (!el) {
      const btn = document.getElementById('btn-fetch-stallsnack');
      if (btn && btn.parentElement) {
        el = document.createElement('span');
        el.id = 'ov-status';
        el.style.marginLeft = '10px';
        el.style.fontSize = '12px';
        el.style.opacity = '0.85';
        el.style.color = '#cbd5e1';
        el.style.whiteSpace = 'nowrap';
        btn.parentElement.appendChild(el);
      }
    }

    if (el) {
      el.textContent = message || '';
    } else {
      // Fallback: ingen lämplig plats i DOM
      console.log('[status]', message);
    }
  } catch (e) {
    console.log('[status]', message);
  }
}

// 🔹 Ikon-definitioner (tolkas från TIPSKOMMENTAR)
const ICON_DEFS = [
  { id: 'spetsfavorit', label: 'Spetsfavorit',           emoji: '🏁', match: 'spetsfavorit' },
  { id: 'form',         label: 'Form',                   emoji: '🔥', match: 'fin form' },
  { id: 'jobb',         label: 'Tål att göra jobb',      emoji: '💪', match: 'tål att göra jobb' },
  { id: 'skrall',       label: 'Skräll',                 emoji: '💣', match: 'skräll' },
  { id: 'fidus',        label: 'Skräll, fina pengar',    emoji: '💰', match: 'fidus' },
  { id: 'stark',        label: 'Stark som snabb',        emoji: '🚀', match: 'stark som snabb' },
  { id: 'forsta',       label: 'Första starten',         emoji: '✨', match: 'första starten' },
  { id: 'fast',         label: 'Suttit fast',            emoji: '📦', match: 'suttit fast' },
  { id: 'nyregi',       label: 'Ny regi',                emoji: '🔄', match: 'ny regi' },
];


// För omvänd-kupong-sliders
const REVERSE_PRICE_PRESETS = [1, 25, 50, 80, 100, 120, 150, 200, 'egen'];

let reversePriceSliderEl = null;
let reversePriceDisplayEl = null;
let reverseSpikesDisplayEl = null;
let reverseSupersDisplayEl = null;

// alla ikoner är påslagna från början
let iconVisibility = {};
ICON_DEFS.forEach((def) => {
  iconVisibility[def.id] = true;
});


const IDEAS_STORAGE_PREFIX = 'trav_ideas_v1_';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get('id');

  const backBtn = document.getElementById('btn-back');
  backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  initListModeFromStorage();
  setupListModeUI();

  if (!gameId) {
    alert('Inget spel-id angivet.');
    return;
  }

try {
    const [gameData, tracks, analyses] = await Promise.all([
      getGame(gameId),
      getTracks().catch(() => []), // om ban-API failar vill vi ändå visa spelet
      getAnalyses().catch(() => []),
    ]);

    analysesCache = Array.isArray(analyses) ? analyses : [];
    window.__TRAV_ANALYSES_CACHE__ = analysesCache;

    game = gameData;
    allTracks = Array.isArray(tracks) ? tracks : [];
    currentGameId = game._id;

    // 🔹 Ladda manuella vinnare (fallback)
    manualWinners = loadManualWinners(currentGameId);


    loadIdeaSelections(currentGameId);
    setupOverview(game);
    setupCouponSidemenu();
    renderTrackInfo();            // 🔹 visa banblocket
      initStakePanel();
      ensureManualWinnerButton();

    // Simulering (ovalbana)
    if (typeof initRaceSim !== 'function') {
      console.error('initRaceSim saknas. Kontrollera att ./js/race-sim.js laddas korrekt.');
    } else initRaceSim({
      getBestAnalysis: (ctx) => findBestAnalysis(ctx, analysesCache),
      getDivision: () => divisions[currentIndex],
      getDivisions: () => divisions,
      getHeaderColumns: () => headerColumns,
      getTrack: () => currentTrackMatch,
      getGame: () => game,
      setCurrentIndex: (i) => { currentIndex = i; },
      getStakeLevel: () => stakeLevel,
      createCouponFromSim: async (simCoupon) => {
        try {
          if (!currentGameId) throw new Error('Inget spel öppet.');

          const isV85 = String(game?.gameType || '').toUpperCase() === 'V85';

          const selections = (simCoupon?.selections || []).map((s) => ({
            divisionIndex: Number(s.divisionIndex),
            horses: (typeof normalizeHorseNumberList === 'function')
              ? normalizeHorseNumberList(s.horses)
              : Array.from(new Set((s.horses || []).map(Number))).filter((n) => Number.isFinite(n)).sort((a,b)=>a-b),
          }));

          const payload = {
            status: (typeof getNewCouponStatus === 'function') ? getNewCouponStatus() : 'Preliminär',
            name: String(simCoupon?.name || 'Sim Kupong'),
            source: 'sim',
            stakeLevel: isV85 ? (simCoupon?.stakeLevel || stakeLevel || 'original') : 'original',
            selections,
          };

          const saved = await createCoupon(currentGameId, payload);
          saved.source = 'sim';
          coupons.push(saved);

          try { renderCouponList(); } catch {}
          if (typeof showToast === 'function') showToast('Sim-kupong skapad!', 'success');
        } catch (e) {
          console.error(e);
          alert(e?.message || 'Kunde inte skapa Sim Kupong.');
        }
      },
      rerenderDivision: () => {}
    });   
  

// Sim embed toggle (under hästinfo)
const btnSimEmbedToggle = document.getElementById('btn-sim-embed-toggle');
const simOverlay = document.getElementById('sim-overlay');
if (btnSimEmbedToggle && simOverlay){
  const KEY = 'trav_sim_embed_hidden_v1';

  // Default: visa simuleringen
  const saved = localStorage.getItem(KEY);
  if (saved === '1'){
    simOverlay.hidden = true;
    btnSimEmbedToggle.textContent = 'Visa simulering';
  } else {
    simOverlay.hidden = false;
    btnSimEmbedToggle.textContent = 'Dölj simulering';
  }

  btnSimEmbedToggle.addEventListener('click', ()=>{
    const willHide = !simOverlay.hidden; // if currently shown -> hide
    simOverlay.hidden = willHide;
    localStorage.setItem(KEY, willHide ? '1' : '0');
    btnSimEmbedToggle.textContent = willHide ? 'Visa simulering' : 'Dölj simulering';
    if (!willHide){
      try{ simOverlay.scrollIntoView({ behavior:'smooth', block:'start' }); }catch{}
    }
  });
}

} catch (err) {
    console.error(err);
    alert('Kunde inte hämta spelet.');
  }

  //  Kör om alignment när fönstret ändrar storlek (t.ex. text bryts om)
  setupResponsiveSync();
});


 // Hämta datum från spelet 
function getGameDateFromMeta() {
  const el = document.getElementById('ov-meta');
  const txt = (el?.textContent || '').trim(); // "2025-12-17 • Halmstad"
  const m = txt.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

 // Byter datum i ATG länken
function replaceDateInAtgUrl(url, yyyyMmDd) {
  // byter _YYYY-MM-DD_ i länken
  return String(url).replace(/_\d{4}-\d{2}-\d{2}_/g, `_${yyyyMmDd}_`);
}



function applyGameDateToAtgUrl(url) {
  const gameDate = getGameDateFromMeta(); // t.ex. "2025-12-17"
  if (!gameDate) return url;

  let out = String(url);

  // Om länken är sparad som template med {DATE}
  out = out.replace('{DATE}', gameDate);

  // Om länken redan har _YYYY-MM-DD_ i sig
  out = replaceDateInAtgUrl(out, gameDate);

  return out;
}

//
// ---- Visningsläge (Enkel / Detaljerad) ----
//

function initListModeFromStorage() {
  const saved = localStorage.getItem('trav_list_mode');
  if (saved === 'detailed' || saved === 'simple' || saved === 'icons') {
    listMode = saved;
  } else {
    listMode = 'simple';
  }
}




function setupListModeUI() {
  const buttons = document.querySelectorAll('.list-mode-btn');
  const validModes = ['simple', 'detailed', 'icons'];

  buttons.forEach((btn) => {
    const mode = btn.dataset.mode;
    btn.classList.toggle('active', mode === listMode);

    btn.addEventListener('click', () => {
      const clickedMode = btn.dataset.mode;
      if (!validModes.includes(clickedMode)) return;
      if (listMode === clickedMode) return;

      listMode = clickedMode;
      localStorage.setItem('trav_list_mode', listMode);

      buttons.forEach((b) =>
        b.classList.toggle('active', b.dataset.mode === listMode)
      );

      if (divisions.length) {
        renderCurrentDivision();
      }

      setLegendVisibleFromMode();
      setupIconLegendUI();
    });
  });

  setLegendVisibleFromMode();
  setupIconLegendUI();
}

function setLegendVisibleFromMode() {
  const legend = document.getElementById('icon-legend');
  if (!legend) return;
  legend.classList.toggle('hidden', listMode !== 'icons');
}

function setupIconLegendUI() {
  const legend = document.getElementById('icon-legend');
  if (!legend) return;

  legend.innerHTML = '';

  ICON_DEFS.forEach((icon) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-legend-item';
    if (!iconVisibility[icon.id]) {
      btn.classList.add('off');
    }

    btn.innerHTML = `
      <span class="icon-symbol">${icon.emoji}</span>
      <span class="icon-label">${icon.label}</span>
    `;

    btn.addEventListener('click', () => {
      iconVisibility[icon.id] = !iconVisibility[icon.id];
      btn.classList.toggle('off', !iconVisibility[icon.id]);

      if (divisions.length) {
        renderCurrentDivision();
      }
    });

    legend.appendChild(btn);
  });
}



const btnUpdateWinners = document.getElementById('btn-update-winners');

if (btnUpdateWinners) {
  btnUpdateWinners.addEventListener('click', async () => {
    if (!currentGameId) {
      alert('Hittar inget gameId (currentGameId).');
      return;
    }

    const ok = confirm('Hämta vinnare från ATG och uppdatera spelet?');
    if (!ok) return;

    try {
      btnUpdateWinners.disabled = true;

     // plocka date + track från meta-raden: "2025-12-23 • Örebro"
const meta = document.getElementById('ov-meta')?.textContent || '';
const [datePart, trackPart] = meta.split('•').map(s => s.trim());

const title = document.getElementById('ov-title')?.textContent || '';
const gameType = title.split(' ')[0];

// slug
let trackSlug =
  document.getElementById('track-slug')?.value?.trim() ||
  trackPart
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');


const payload = {
  status: getNewCouponStatus(),
      status: getNewCouponStatus(),
  date: datePart,
  gameType,
  trackSlug,
};

const data = await fetchWinners(currentGameId, payload);

      // data: { results: { "1": 2, "2": 12, ... }, resultsUpdatedAt: ... }

      // Spara i din state (du använder "game", inte "currentGame")
      if (game) game.results = data.results || {};

      // Rendera om så markeringar syns direkt (du har dessa i filen)
      renderCurrentDivision?.();
      renderCouponList?.();
      updateWinnerSummaryUI?.();

      alert('Vinnare uppdaterade!');
    } catch (e) {
      console.error(e);
      alert(e.message || 'Kunde inte hämta vinnare.');
    } finally {
      btnUpdateWinners.disabled = false;
    }
  });
}

// --- Vinnarprognos (lokal modell baserad på odds/statistik/tipskommentar) ---
const btnOpenPredictions = document.getElementById('btn-open-predictions');
const predictPanel = document.getElementById('predict-panel');
const btnPredictRefresh = document.getElementById('btn-predict-refresh');
const btnPredictClose = document.getElementById('btn-predict-close');
const predictOutput = document.getElementById('predict-output');

function openPredictionsPanel() {
  if (!predictPanel) return;
  predictPanel.hidden = false;
  // Bygg alltid om när man öppnar så man ser senaste hästdata
  renderWinnerPredictions();
}

function closePredictionsPanel() {
  if (!predictPanel) return;
  predictPanel.hidden = true;
}

btnOpenPredictions?.addEventListener('click', openPredictionsPanel);
btnPredictRefresh?.addEventListener('click', renderWinnerPredictions);
btnPredictClose?.addEventListener('click', closePredictionsPanel);


// ---------------------------------------------------------------------------
// Stallsnack / intervjuer (via knapp)
// ---------------------------------------------------------------------------

let btnFetchStallsnack = document.getElementById('btn-fetch-stallsnack');

  if (!btnFetchStallsnack) {
    const host = document.querySelector('.coupon-idea-actions') || document.querySelector('.header-actions') || document.body;
    btnFetchStallsnack = document.createElement('button');
    btnFetchStallsnack.className = 'btn small';
    btnFetchStallsnack.id = 'btn-fetch-stallsnack';
    btnFetchStallsnack.textContent = 'Hämta stallsnack';
    host.appendChild(btnFetchStallsnack);
  }

if (btnFetchStallsnack) {
  btnFetchStallsnack.addEventListener('click', async () => {
    if (!currentGameId) {
      alert('Hittar inget gameId (currentGameId).');
      return;
    }

    // Förifyll senaste url
    const lastUrl =
      (game && game.stallsnack && game.stallsnack.url) ||
      localStorage.getItem('trav_last_stallsnack_url') ||
      'https://www.atg.se/V85/tips/251229-stallsnack-v85-skive';

    const url = prompt('Klistra in ATG-länk till Stallsnack/Intervju:', lastUrl);
    if (!url) return;

    localStorage.setItem('trav_last_stallsnack_url', url);

    try {
      btnFetchStallsnack.disabled = true;
      setStatus('Hämtar stallsnack från ATG…');

      const data = await fetchStallsnack(currentGameId, url);
      if (data?.game) game = data.game;

      setStatus('Stallsnack hämtat och sparat ✅');
      renderCurrentDivision?.();
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Kunde inte hämta stallsnack.');
      setStatus('Kunde inte hämta stallsnack ❌');
    } finally {
      btnFetchStallsnack.disabled = false;
    }
  });
}


//
// ---- Lagring av markeringar per spel ----
//

function loadIdeaSelections(gameId) {
  selectedIdeaNumbersByDivIndex = {};
  const raw = localStorage.getItem(IDEAS_STORAGE_PREFIX + gameId);
  if (!raw) return;

  try {
    const obj = JSON.parse(raw);
    Object.entries(obj).forEach(([key, arr]) => {
      selectedIdeaNumbersByDivIndex[key] = new Set(arr);
    });
  } catch (err) {
    console.warn('Kunde inte läsa sparade idémarkeringar:', err);
  }
}

function saveIdeaSelections() {
  if (!currentGameId) return;
  const obj = {};
  Object.entries(selectedIdeaNumbersByDivIndex).forEach(([key, set]) => {
    obj[key] = Array.from(set);
  });
  localStorage.setItem(IDEAS_STORAGE_PREFIX + currentGameId, JSON.stringify(obj));
}

//

const COUPON_STATUS = {
  ACTIVE: 'active',
  WAITING: 'waiting',
  INACTIVE: 'inactive'
};

function normalizeStatus(status, activeFlag) {
  const v = String(status || '').toLowerCase().trim();
  if (v === COUPON_STATUS.ACTIVE || v === COUPON_STATUS.WAITING || v === COUPON_STATUS.INACTIVE) return v;
  // fallback på gamla fältet active
  return (activeFlag !== false) ? COUPON_STATUS.ACTIVE : COUPON_STATUS.INACTIVE;
}

function getNewCouponStatus() {
  const el = document.getElementById('new-coupon-status');
  const v = String(el?.value || '').toLowerCase().trim();
  if (v === COUPON_STATUS.ACTIVE || v === COUPON_STATUS.WAITING || v === COUPON_STATUS.INACTIVE) return v;
  return COUPON_STATUS.WAITING;
}

function ensureNewCouponStatusPicker() {
  if (document.getElementById('new-coupon-status')) return;

  const listEl = document.getElementById('coupon-list');
  if (!listEl || !listEl.parentElement) return;

  const bar = document.createElement('div');
  bar.id = 'new-coupon-status-bar';
  bar.className = 'coupon-status-bar';

  const label = document.createElement('div');
  label.className = 'coupon-status-bar-label';
  label.textContent = 'Nya kuponger skapas som:';

  const select = document.createElement('select');
  select.id = 'new-coupon-status';
  select.className = 'input coupon-status-select';
  select.innerHTML = `
    <option value="waiting" selected>Vänteläge</option>
    <option value="active">Aktiv</option>
    <option value="inactive">Inaktiv</option>
  `;

  // spara val per spel
  const key = `trav_new_coupon_status_${currentGameId || 'global'}`;
  const saved = localStorage.getItem(key);
  if (saved) select.value = saved;
  select.addEventListener('change', () => {
    localStorage.setItem(key, select.value);
  });

  bar.appendChild(label);
  bar.appendChild(select);

  listEl.parentElement.insertBefore(bar, listEl);
}

function getActiveCoupons() {
  return (coupons || []).filter(c => normalizeStatus(c.status, c.active) === COUPON_STATUS.ACTIVE);
}


// --- Min kupong: redigera/kopiera från sparade kuponger ---
let _isApplyingIdea = false;

function hasAnyIdeaSelections() {
  return Object.values(selectedIdeaNumbersByDivIndex || {}).some((set) => set && set.size > 0);
}

function clearAllIdeaSelections() {
  Object.keys(selectedIdeaNumbersByDivIndex || {}).forEach((k) => {
    selectedIdeaNumbersByDivIndex[k] = new Set();
  });
}

function applyCouponSelectionsToIdea(coupon) {
  if (!coupon) return;
  _isApplyingIdea = true;

  clearAllIdeaSelections();

  // Lägg in val per avdelning
  (coupon.selections || []).forEach((sel) => {
    const key = String(sel.divisionIndex ?? '0');
    const nums = (sel.horses || []).filter((n) => typeof n === 'number');
    selectedIdeaNumbersByDivIndex[key] = new Set(nums);
  });

  // Uppdatera räknare
  divisions.forEach((div, idx) => {
    const k = getDivisionKey(div);
    const set = selectedIdeaNumbersByDivIndex[k] || new Set();
    updateDivisionCount(idx, set.size);
  });

  saveIdeaSelections();
  computeAndRenderPrice();
  renderCurrentDivision();

  _isApplyingIdea = false;
}

function setIdeaEditingState(couponOrNull) {
  if (couponOrNull && couponOrNull._id) {
    editingIdeaCouponId = couponOrNull._id;
    editingIdeaCouponName = couponOrNull.name || 'Min kupong';
    editingIdeaCouponStatus = normalizeStatus(couponOrNull.status, couponOrNull.active);
  } else {
    editingIdeaCouponId = null;
    editingIdeaCouponName = '';
    editingIdeaCouponStatus = null;
  }

  const btn = document.getElementById('btn-save-idea-coupon');
  if (btn) {
    btn.classList.toggle('editing', Boolean(editingIdeaCouponId));
    btn.textContent = editingIdeaCouponId ? 'Spara Min kupong (redigerar)' : 'Spara Min kupong';
  }
}

function nextDraftName() {
  // Pågående kupong 1,2,3...
  let maxN = 0;
  (coupons || []).forEach((c) => {
    const nm = String(c?.name || '');
    const m = nm.match(/Pågående kupong\s+(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) maxN = Math.max(maxN, n);
    }
  });
  return `Pågående kupong ${maxN + 1}`;
}

async function saveIdeaAsDraftIfNeeded() {
  if (!currentGameId) return null;
  if (!hasAnyIdeaSelections()) return null;

  const payload = buildCouponPayloadFromIdea();
  if (!payload.selections || !payload.selections.length) return null;

  const body = {
    ...payload,
    source: 'draft',
    name: nextDraftName(),
    status: COUPON_STATUS.WAITING,
  };

  const up = String(game?.gameType || '').toUpperCase();
  if (up === 'V85') {
    body.stakeLevel = stakeLevel;
  }

  try {
    const draft = await createCoupon(currentGameId, body);
    coupons.push(draft);
    return draft;
  } catch (err) {
    console.error(err);
    // vi vill inte stoppa flödet bara för att draft-save failar
    return null;
  }
}


// ---- Setup av överblick ----
//

function setupOverview(game) {
  // Exponera så andra moduler (t.ex. kombinerings-modal) kan läsa spelet.
  try { window.game = game; } catch (_) {}
  try { window.__travGetGame = () => game; } catch (_) {}
  const titleEl = document.getElementById('ov-title');
  const metaEl = document.getElementById('ov-meta');
  const typeEl = document.getElementById('ov-game-type');

  titleEl.textContent = game.title || 'Överblick';

  const date = new Date(game.date || game.createdAt);
  const dateStr = isNaN(date.getTime())
    ? (game.date || '')
    : date.toLocaleDateString('sv-SE');

  metaEl.textContent = [dateStr, game.track].filter(Boolean).join(' • ');
  typeEl.textContent = game.gameType || '';

  const parsed = game.parsedHorseInfo || {};
  const header = parsed.header || '';
  headerColumns = parseHeaderColumns(header);

  // Gör alla divisions-index till 1-baserade siffror (1,2,3...)
  // Viktigt: vissa parser-flöden kan ge index "0" för första avdelningen.
  // Det förstör logik som matchar kupong-selections (som alltid är 1-baserade).
  divisions = (parsed.divisions || []).map((d, idx) => {
    const raw = d?.index;
    const n = Number(raw);
    const indexNum = Number.isFinite(n) && n >= 1 ? n : (idx + 1);

    return {
      ...d,
      index: indexNum,
    };
  });

coupons = (game.coupons || []).map(c => {
  const status = normalizeStatus(c.status, c.active);
  return {
    ...c,
    status,
    // hålla active i sync för gamla beräkningar
    active: status === COUPON_STATUS.ACTIVE
  };
});
  // Håll window.game.coupons i synk + getter för UI-moduler
  try { if (window.game) window.game.coupons = coupons; } catch (_) {}
  try { window.__travGetCoupons = () => coupons; } catch (_) {}



  const divisionRowEl = document.getElementById('division-number-row');
  divisionRowEl.innerHTML = '';
  divisionSquares = [];
  divisionCountEls = [];

  if (!divisions.length) {
    const container = document.getElementById('horse-table-container');
    container.textContent = 'Ingen hästinformation hittades för detta spel.';
    return;
  }

  // "Totalen": fyrkant + räknare under
  divisions.forEach((div, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'division-square-wrapper';

    const square = document.createElement('button');
    square.className = 'division-square';
    square.textContent = div.index ?? idx + 1;

    square.addEventListener('click', () => {
      currentIndex = idx;
      renderCurrentDivision();
    });

    const countEl = document.createElement('div');
    countEl.className = 'division-square-count';

    const divKey = getDivisionKey(div);
    if (!selectedIdeaNumbersByDivIndex[divKey]) {
      selectedIdeaNumbersByDivIndex[divKey] = new Set();
    }
    const selectedSet = selectedIdeaNumbersByDivIndex[divKey];

    // alltid en siffra, även 0
    countEl.textContent = String(selectedSet.size || 0);

    wrap.appendChild(square);
    wrap.appendChild(countEl);

    divisionRowEl.appendChild(wrap);
    divisionSquares.push(square);
    divisionCountEls.push(countEl);
  });

 currentIndex = 0;
  renderCurrentDivision();
  computeAndRenderPrice();
  initCouponUI();
  try { initCouponGroupToggleButtons(); } catch {}

  // Skala kupong events (hämta DOM här så det funkar även innan skala-UI initieras)
  {
    const btnOpenScaleEl = document.getElementById('btn-open-scale');
    const btnScaleCancelEl = document.getElementById('btn-scale-cancel');
    const btnScaleDoEl = document.getElementById('btn-scale-do');

    if (btnOpenScaleEl) btnOpenScaleEl.addEventListener('click', () => openScaleMode());
    if (btnScaleCancelEl) btnScaleCancelEl.addEventListener('click', () => closeScaleMode());
    if (btnScaleDoEl) btnScaleDoEl.addEventListener('click', () => doScaleCoupon());
  }


  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCouponPlusMenu(); });
  initSaveIdeaCouponButton();
  initClearIdeaButton();
  ensureNewCouponStatusPicker();
  renderCouponList();
  updateWinnerSummaryUI?.();
  setupSwipeNavigation(); 


}
function initStakePanel() {
  const panel = document.getElementById('stake-panel');
  if (!panel) return;

  const gameType = String(game?.gameType || '').toUpperCase();

  // bara V85 ska ha panelen
  if (gameType !== 'V85') {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  // läs ev. sparad nivå per spel
  const key = `trav_stake_${currentGameId}`;
  const saved = localStorage.getItem(key);
  if (saved === '30' || saved === '50' || saved === '70' || saved === 'original') {
    stakeLevel = saved;
  } else {
    stakeLevel = 'original';
  }

  const buttons = panel.querySelectorAll('.stake-option');

  const applyActive = () => {
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.stake === stakeLevel);
    });
  };

  applyActive();

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const level = btn.dataset.stake;
      if (!level) return;
      stakeLevel = level;
      localStorage.setItem(key, stakeLevel);
      applyActive();
      computeAndRenderPrice(); // uppdatera priset i totalen
    });
  });
  
}
function pickSplitSpikes(popularStats, totalNeeded) {
  // popularStats[divisionIndex][horseNumber] = { count, spikes }
  const candidates = [];

  for (const [divKey, horses] of Object.entries(popularStats)) {
    const divIndex = Number(divKey);
    for (const [numStr, stat] of Object.entries(horses)) {
      candidates.push({
        division: divIndex,
        number: Number(numStr),
        count: stat.count || 0,
      });
    }
  }

  // sortera efter högst count, sen tidig avdelning
  candidates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.division !== b.division) return a.division - b.division;
    return a.number - b.number;
  });

  const chosen = [];
  const usedDivisions = new Set();

  for (const c of candidates) {
    if (chosen.length >= totalNeeded) break;
    if (usedDivisions.has(c.division)) continue; // max 1 spik per avdelning
    chosen.push(c);
    usedDivisions.add(c.division);
  }

  return chosen;
}


function renderTrackInfo() {
  const section = document.getElementById('track-info-section');
  const box = document.getElementById('track-info-box');
  if (!section || !box) return;

  box.innerHTML = '';

  if (!game || !game.track) {
    section.style.display = 'none';
    return;
  }

  const trackName = (game.track || '').trim();
  if (!trackName) {
    section.style.display = 'none';
    return;
  }

  // Försök matcha mot ban-listan (namn först, fall back på kod)
  const match =
    (allTracks || []).find(
      (t) =>
        (t.name &&
          t.name.toLowerCase() === trackName.toLowerCase()) ||
        (t.code &&
          t.code.toLowerCase() === trackName.toLowerCase())
    ) || null;

  section.style.display = '';

currentTrackMatch = match || null;



if (!match) {
  const p = document.createElement('p');
  p.className = 'track-info-text';
  p.textContent = trackName;
  box.appendChild(p);

  // Ingen matchad bana → ingen position → göm väder
  const weatherBox = document.getElementById('track-weather-box');
  if (weatherBox) weatherBox.style.display = 'none';

  return;
}

  // Titel, t.ex. "Solvalla (S)"
  const title = document.createElement('div');
  title.className = 'track-info-title';
  title.textContent = `${match.name} (${match.code})`;
  box.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'track-info-list';

  const addRow = (label, value) => {
    if (!value) return;
    const li = document.createElement('li');
    const spanLabel = document.createElement('span');
    spanLabel.textContent = label;

    const spanValue = document.createElement('span');
    spanValue.textContent = value;

    li.appendChild(spanLabel);
    li.appendChild(spanValue);
    list.appendChild(li);
  };

  addRow('Längd', match.length);
  addRow('Bredd', match.width);
  addRow('Upplopp', match.homeStretch);
  addRow('Open stretch', match.openStretch);
  addRow('Vinklad vinge', match.angledGate);

  box.appendChild(list);
    // 🔹 hämta & visa väder för denna bana
  renderTrackWeather(match);
}
function getWeatherSymbol(code) {
  const c = Number(code);

  if (c === 0) return { icon: '☀️', label: 'Klart' };
  if (c === 1 || c === 2) return { icon: '🌤️', label: 'Mest klart' };
  if (c === 3) return { icon: '☁️', label: 'Mulet' };
  if (c >= 45 && c <= 48) return { icon: '🌫️', label: 'Dimma' };

  if ((c >= 51 && c <= 57) || (c >= 61 && c <= 67)) {
    return { icon: '🌧️', label: 'Regn' };
  }

  if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) {
    return { icon: '🌨️', label: 'Snö' };
  }

  if (c >= 80 && c <= 82) return { icon: '🌦️', label: 'Skurar' };

  if (c >= 95 && c <= 99) return { icon: '⛈️', label: 'Åska' };

  return { icon: '❓', label: 'Okänt väder' };
}

// ------------------
// Resa: beräkna avstånd hemmabana -> aktuell bana
// ------------------
function normalizeTrackKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function findTrackByNameOrCode(value) {
  const key = normalizeTrackKey(value);
  if (!key) return null;
  return (allTracks || []).find((t) => {
    const nameKey = normalizeTrackKey(t?.name);
    const codeKey = normalizeTrackKey(t?.code);
    const slugKey = normalizeTrackKey(t?.slug);
    return key === nameKey || key === codeKey || key === slugKey;
  }) || null;
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function computeTravelDistanceKm(homeTrackValue) {
  if (!currentTrackMatch || !Number.isFinite(Number(currentTrackMatch.lat)) || !Number.isFinite(Number(currentTrackMatch.lon))) return null;
  const home = findTrackByNameOrCode(homeTrackValue);
  if (!home || !Number.isFinite(Number(home.lat)) || !Number.isFinite(Number(home.lon))) return null;
  const km = haversineKm(Number(home.lat), Number(home.lon), Number(currentTrackMatch.lat), Number(currentTrackMatch.lon));
  return Number.isFinite(km) ? km : null;
}



async function renderTrackWeather(track) {
  const box = document.getElementById('track-weather-box');
  if (!box) return;

  box.innerHTML = '';

  if (!track || track.lat == null || track.lon == null) {
    box.style.display = 'none';
    return;
  }

  box.style.display = '';

  const title = document.createElement('div');
  title.className = 'track-weather-title';
  title.textContent = 'Väder (nu & kommande timmar)';
  box.appendChild(title);

  const status = document.createElement('div');
  status.className = 'track-weather-status';
  status.textContent = 'Hämtar väder...';
  box.appendChild(status);

  try {
    const lat = track.lat;
    const lon = track.lon;
    const url =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${lat}&longitude=${lon}` +
  `&current_weather=true` +
  `&hourly=temperature_2m,precipitation_probability,weathercode` +
  `&forecast_days=1` +
  `&timezone=auto`;


    const res = await fetch(url);
    if (!res.ok) throw new Error('Kunde inte hämta väder.');
    const data = await res.json();

    // Rensa “hämtar...”
    status.remove();

   const current = data.current_weather;
if (current) {
  const cur = document.createElement('div');
  cur.className = 'track-weather-current';

  const { icon, label } = getWeatherSymbol(current.weathercode);

  cur.textContent = `Nu: ${icon} ${label} – ${current.temperature}°C, vind ${
    current.windspeed
  } m/s`;

  box.appendChild(cur);
}


    // Hitta index för “nu” i hourly
   const hourly = data.hourly || {};
const times = hourly.time || [];
const temps = hourly.temperature_2m || [];
const pops = hourly.precipitation_probability || [];
const codes = hourly.weathercode || [];


    if (times.length) {
      const nowIso = current ? current.time : times[0];
      const startIndex = Math.max(
        times.findIndex((t) => t >= nowIso),
        0
      );

      const list = document.createElement('ul');
      list.className = 'track-weather-list';

      // Visa ca 6 kommande timmar (inkl ev. nu)
     for (let i = startIndex; i < Math.min(startIndex + 6, times.length); i++) {
  const li = document.createElement('li');

  const time = new Date(times[i]);
  const hh = time.getHours().toString().padStart(2, '0');
  const temp = temps[i];
  const pop = pops[i];
  const code = codes[i];

  const { icon, label } = getWeatherSymbol(code);

  li.textContent =
    `${hh}:00 – ${icon} ${label}, ${temp}°C` +
    (typeof pop === 'number' ? `, nederbörd: ${pop}%` : '');

  list.appendChild(li);
}


      box.appendChild(list);
    }
  } catch (err) {
    console.error(err);
    status.textContent = 'Kunde inte hämta väder.';
  }
}


function renderCurrentDivision() {
  const division = divisions[currentIndex];
  const total = divisions.length;

  updateDivisionHeader(currentIndex, total);

  const popularity = computePopularityForDivision(division);
  buildHorseView(division, currentIndex, popularity);
}


function updateDivisionHeader(index, total) {
  const centerDivIndexEl = document.getElementById('center-division-index');
  const centerDivDistanceEl = document.getElementById('center-division-distance');

  if (!total) {
    if (centerDivIndexEl) centerDivIndexEl.textContent = '-';
    if (centerDivDistanceEl) centerDivDistanceEl.textContent = '';
  } else {
    const division = divisions[index];
    const humanIndex = division?.index || index + 1;

    if (centerDivIndexEl) centerDivIndexEl.textContent = humanIndex;

    const distance = getDivisionDistance(division);
    if (centerDivDistanceEl) {
      centerDivDistanceEl.textContent = distance
        ? ` : ${distance} meter`
        : '';
    }
  }

  divisionSquares.forEach((sq, i) => {
    sq.classList.toggle('active', i === index);
  });
}


//
// ---- Parsing helpers ----
//

function parseHeaderColumns(headerStr) {
  if (!headerStr) return [];

  if (headerStr.includes('\t')) {
    return headerStr
      .split('\t')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return headerStr
    .split(/\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseLineColumns(lineStr) {
  if (!lineStr) return [];

  if (lineStr.includes('\t')) {
    return lineStr
      .split('\t')
      .map((s) => s.trim());
  }

  return lineStr
    .split(/\s{2,}/)
    .map((s) => s.trim());
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractHorseNameFromRawLine(rawLine) {
  if (!rawLine) return '';
  const cols = parseLineColumns(rawLine);
  if (!cols.length) return '';
  const first = cols[0];
  const m = first.match(/^(\d+)\s+(.*)$/);
  if (m) return m[2];
  return first;
}

function extractHorseNumberFromRawLine(rawLine) {
  if (!rawLine) return null;
  const m = String(rawLine).trim().match(/^\s*(\d{1,2})\s+/);
  return m ? m[1] : null;
}




// Normalisera hästnummer (förhindrar t.ex. "1" + 1 => [1,1])
function normalizeHorseNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  const s = String(value).trim();
  if (!s) return null;
  // Om värdet är typ "11 Knud* (DK)" eller "11"
  const m = s.match(/^(\d{1,2})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function normalizeHorseNumberList(list) {
  const arr = Array.isArray(list) ? list : (list == null ? [] : [list]);
  const nums = [];
  for (const v of arr) {
    const n = normalizeHorseNumber(v);
    if (Number.isFinite(n)) nums.push(n);
  }
  // Dedupe EFTER konvertering till Number
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function findDivisionByIndex(divisionIndex) {
  const wanted = Number(divisionIndex);
  return divisions.find((d, i) => {
    const idx = d.index != null ? Number(d.index) : i + 1;
    return idx === wanted;
  });
}



function getHorseName(divisionIndex, horseNumber) {
 const div = findDivisionByIndex(divisionIndex);
  if (!div || !div.horses) return '';
  const horse = div.horses.find((h) => h.number === horseNumber);
  if (!horse) return '';
  return extractHorseNameFromRawLine(horse.rawLine || '');
}

function getStallsnackForHorse(divisionIndex, horseNumber) {
  const divKey = String(divisionIndex);
  const horseKey = String(horseNumber);
  return (
    game?.stallsnack?.divisions?.[divKey]?.horses?.[horseKey] || null
  );
}



function buildStallsnackQuickSummaryTrav(text) {
  const t = String(text || '').toLowerCase();

  const posWords = [
    'bra', 'bättre', 'fin', 'stark', 'form', 'topp', 'kapacitet', 'lätt', 'vass',
    'uppåt', 'spännande', 'tipsetta', 'segerraktuell', 'jättefavorit', 'favorit',
    'gillar', 'passande', 'perfekt', 'känns'
  ];
  const negWords = [
    'dålig', 'sämre', 'svårt', 'galopp', 'strul', 'problem', 'skada', 'sjuk',
    'orolig', 'minus', 'paus', 'inte riktigt', 'risk', 'tungt', 'stumnar'
  ];

  let score = 0;
  for (const w of posWords) if (t.includes(w)) score += 1;
  for (const w of negWords) if (t.includes(w)) score -= 1;

  const tone = score >= 2 ? 'positive' : score <= -2 ? 'negative' : 'neutral';

  const tags = [];
  const add = (tag, cond) => { if (cond && !tags.includes(tag)) tags.push(tag); };

  // Ton-tag först
  add(tone === 'positive' ? 'Plus' : tone === 'negative' ? 'Minus' : 'Neutral', true);

  // Trav-taggar
  add('Formplus', /\bform\b|uppåt|bättre|fin|känns/.test(t));
  add('Formminus', /inte riktigt|sämre|svag|dålig form|tappat|paus/.test(t));
  add('Segerläge', /vinst|seger|segerraktuell|favorit|jättefavorit|tipsetta/.test(t));
  add('Platsläge', /plats|platsbud|platschans|platsarbud/.test(t));
  add('Spetsläge', /spets|ledning|snabb ut|öppna|tar ledningen/.test(t));
  add('Rygglopp', /rygg|rygglopp|smyg|invändig resa|spara till slut/.test(t));
  add('Galopprisk', /galopp|travosäker|risk|felsteg|osäker/.test(t));
  add('Utrustningsplus', /barfota|bike|jänkar|amerikansk|sulky|skor/.test(t));
  add('Distansplus', /\b3140\b|stayer|lång distans|gillar distansen|distans/.test(t));
  add('Kort distans', /\b1640\b|sprinter|kort distans/.test(t));

  // Begränsa så det blir lätt att läsa snabbt
  const out = [];
  for (const tag of tags) {
    out.push(tag);
    if (out.length >= 5) break; // max 5 inkl ton
  }

  return { tone, tags: out };
}
function getDivisionDistance(division) {
  if (!division || !division.horses || !division.horses.length) return null;

  // hitta kolumnindex för DISTANS & SPÅR / DISTANS
  const distIndex = headerColumns.findIndex((name) =>
    name.toUpperCase().startsWith('DISTANS')
  );
  if (distIndex === -1) return null;

  // ta första icke-strukna häst som har ett värde i den kolumnen
  for (const horse of division.horses) {
    if (!horse || horse.scratched) continue;
    const cols = parseLineColumns(horse.rawLine || '');
    const val = cols[distIndex];
    if (!val) continue;

    // format "2140 : 4" → ta siffrorna före kolon
    const m = String(val).match(/^(\d+)\s*:/);
    if (m) {
      return m[1]; // "2140"
    }
  }

  return null;
}


function computePopularityForDivision(division) {
  if (!division || !coupons || !coupons.length) {
    return { counts: {}, spiked: {}, maxCount: 0 };
  }

  const divIndex = division.index ?? 0;
  const counts = {};
  const spiked = {};

  getActiveCoupons().forEach((coupon) => {
    (coupon.selections || []).forEach((sel) => {
      if (sel.divisionIndex !== divIndex) return;

      const horses = sel.horses || [];
      // räkna förekomster
      horses.forEach((num) => {
        counts[num] = (counts[num] || 0) + 1;
      });

     // spik = exakt en häst i denna avdelning på kupongen
    if (horses.length === 1) {
      const num = horses[0];
      spiked[num] = (spiked[num] || 0) + 1; // 🔹 räkna antal spikar
    }
    });
  });

  let maxCount = 0;
  Object.values(counts).forEach((c) => {
    if (c > maxCount) maxCount = c;
  });

  return { counts, spiked, maxCount };
}


function getDivisionKey(division) {
  if (!division) return '0';
  return String(division.index ?? 0);
}

function createNumberSquare(num, { clickable = false } = {}) {
  const div = document.createElement('div');
  div.className = 'num-square';
  if (clickable) div.classList.add('clickable');
  div.textContent = num ?? '';
  return div;
}


function getMainPercentIndex() {
  if (!headerColumns || !headerColumns.length) return -1;

  for (let i = 0; i < headerColumns.length; i++) {
    const up = headerColumns[i].trim().toUpperCase();
    // t.ex. V64%, V65%, V86%, GS75% osv
    // Stöd både V-spel (V75, V86 ...) och GS-spel (GS75)
    if (/^(V\d+|GS\d+)%$/.test(up)) {
      return i;
    }
  }
  return -1;
}


function getTipsCommentIndex() {
  if (!headerColumns || !headerColumns.length) return -1;

  for (let i = 0; i < headerColumns.length; i++) {
    const up = headerColumns[i].toUpperCase();
    if (up.includes('TIPS') || up.includes('KOMMENTAR')) {
      return i; // "TIPSKOMMENTAR", "Tipskommentar" etc
    }
  }
  return -1;
}

// ----- Hjälpare för procent / favorit / superskräll -----

// Hämta V86%-procent för en viss häst
function getHorsePercent(divisionIndex, horseNumber) {
  const division = findDivisionByIndex(divisionIndex);
  if (!division || !division.horses) return null;

  const horse = division.horses.find((h) => h.number === horseNumber);
  if (!horse || horse.scratched || !horse.rawLine) return null;

  const mainIdx = getMainPercentIndex();
  if (mainIdx === -1) return null;

  const cols = parseLineColumns(horse.rawLine || '');
  const val = cols[mainIdx] || '';
  const m = String(val).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;

  const pct = parseFloat(m[1].replace(',', '.'));
  if (Number.isNaN(pct)) return null;
  return pct;
}


// Sortera alla hästar i en avdelning efter procent (högst först)
function resolveDivisionForPercentSort(divIndex) {
  const n = Number(divIndex);

  // 1-baserat index (avd-nummer) – vanligast i UI
  if (Number.isFinite(n) && n >= 1) {
    const found = findDivisionByIndex(n);
    if (found) return found;
  }

  // 0-baserat index (array-index) – används internt i en del logik
  if (Number.isFinite(n) && n >= 0 && Number.isInteger(n) && divisions[n]) {
    return divisions[n];
  }

  return null;
}


// Sortera alla hästar i en avdelning efter procent (högst först)
// Sortera alla hästar i en avdelning efter procent (högst först)
// OBS: divIndex kan vara både 1-baserat (avd-nummer) och 0-baserat (array-index).
function getDivisionHorsesSortedByPercent(divIndex) {
  const division = resolveDivisionForPercentSort(divIndex);
  const horses = division?.horses || [];
  if (!Array.isArray(horses) || horses.length === 0) return [];

  const parsed = horses.map(horse => {
    const rawLine = horse?.rawLine || '';

    // Viktigt: favoriten ska baseras på högst V85%.
    const pctRaw =
      horse?.v85Percent ?? horse?.v85Pct ?? horse?.v85 ?? horse?.percent ?? horse?.['V85%'] ?? horse?.['V85'] ?? '';

    let pct = null;
    if (typeof pctRaw === 'number') {
      pct = pctRaw;
    } else {
      const p = parseFloat(String(pctRaw).replace('%', '').replace(',', '.'));
      pct = Number.isFinite(p) ? p : null;
    }

    // Fallback: om procent saknas i objektet – plocka från rawLine med rätt kolumnindex
    if (pct == null) {
      const mainIdx = getMainPercentIndex();
      if (mainIdx !== -1) {
        const cols = parseLineColumns(rawLine || '');
        const val = cols[mainIdx] || '';
        const m = String(val).match(/(\d+(?:[.,]\d+)?)/);
        if (m) {
          const p2 = parseFloat(m[1].replace(',', '.'));
          if (Number.isFinite(p2)) pct = p2;
        }
      }
    }

    if (pct == null) pct = 0;

    const vOddsRaw = horse?.vOdds ?? horse?.v_odds ?? horse?.vOddsStr ?? horse?.vOddsValue ?? '';
    const vOdds = (typeof vOddsRaw === 'number')
      ? vOddsRaw
      : (() => {
          const v = parseFloat(String(vOddsRaw).replace(',', '.'));
          return Number.isFinite(v) ? v : null;
        })();

    const numberStr =
      (horse?.number != null ? String(horse.number) : '') ||
      extractHorseNumberFromRawLine(rawLine) ||
      '';

    const number = (() => {
      const n2 = parseInt(String(numberStr).match(/\d+/)?.[0] || '', 10);
      return Number.isFinite(n2) ? n2 : numberStr;
    })();

    const numForSort = Number.isFinite(Number(number)) ? Number(number) : 999;

    const name = horse?.name || extractHorseNameFromRawLine(rawLine) || '';

    return { horse, pct, number, name, vOdds, rawLine, _num: numForSort };
  });

  parsed.sort((a, b) =>
    (b.pct - a.pct) ||
    ((a.vOdds ?? 999) - (b.vOdds ?? 999)) ||
    (a._num - b._num)
  );

  return parsed;
}

// Favoriten i en avdelning (högst procent)
function getDivisionFavouriteNumber(divisionIndex) {
  const sorted = getDivisionHorsesSortedByPercent(divisionIndex);
  return sorted.length ? Number(sorted[0].number) : null;
}

// Superskräll = under 6% spelad
function isSuperskrall(divisionIndex, horseNumber) {
  const pct = getHorsePercent(divisionIndex, horseNumber);
  return pct != null && pct < 6;
}


function getFillProfileWeights(step) {
  const s = Number(step || 1);

  // OBS: nyckeln måste heta "supers" (inte "super")
  // Steg enligt din spec:
  // 1: 80% second, 15% mid, 5% super
  // 2: 80% second, 15% mid, 5% super
  // 3: 60% second, 30% mid, 10% super
  // 4: 50% second, 25% mid, 25% super
  // 5: 30% second, 30% mid, 40% super
  // 6: 15% second, 20% mid, 65% super
  // 7: 5% second, 15% mid, 80% super
  if (s === 1) return { second: 0.80, mid: 0.15, supers: 0.05 };
  if (s === 2) return { second: 0.80, mid: 0.15, supers: 0.05 };
  if (s === 3) return { second: 0.60, mid: 0.30, supers: 0.10 };
  if (s === 4) return { second: 0.50, mid: 0.25, supers: 0.25 };
  if (s === 5) return { second: 0.30, mid: 0.30, supers: 0.40 };
  if (s === 6) return { second: 0.15, mid: 0.20, supers: 0.65 };
  return { second: 0.05, mid: 0.15, supers: 0.80 }; // steg 7
}


function getFillPoolsForDivision(divIndex) {
  const sorted = getDivisionHorsesSortedByPercent(divIndex) || [];
  if (!sorted.length) return null;

  const fav = sorted[0]?.number ?? null;
  const favPct = Number(sorted[0]?.pct || 0);

  const second = sorted[1] || null;
  const secondNum = second?.number ?? null;
  const secondPct = Number(second?.pct || 0);

  const lower = 6;
  const upper = Math.max(15, secondPct || favPct || 15); // “mid” upp till 2:a
  const allNums = sorted.map(x => x.number).filter(n => n != null);

  const supers = [];
  const mid = [];
  const rest = [];

  for (const n of allNums) {
    if (n === fav) continue;

    const pct = getHorsePercent(divIndex, n);
    if (pct == null) {
      rest.push(n);
      continue;
    }

    if (pct < lower) supers.push(n);
    else if (pct >= lower && pct <= upper) mid.push(n);
    else rest.push(n);
  }

  return { fav, favPct, secondNum, secondPct, supers, mid, rest };
}

function pickByWeights({ second, mid, supers }, pools, alreadySet) {
  const roll = Math.random();
  let bucket = 'mid';

  if (roll < supers) bucket = 'super';
  else if (roll < supers + mid) bucket = 'mid';
  else bucket = 'second';

  // bygg kandidatlista för valt bucket
  let candidates = [];

  if (bucket === 'second') {
    if (pools.secondNum != null) candidates = [pools.secondNum];
    else candidates = pools.mid; // fallback
  } else if (bucket === 'super') {
    candidates = pools.supers;
  } else {
    candidates = pools.mid;
  }

  // fallback om tomt
  if (!candidates.length) candidates = [...pools.supers, ...pools.mid, ...pools.rest];
  if (!candidates.length) return null;

  // slumpa lite så kuponger inte blir lika
  const arr = candidates.slice();
  shuffleInPlace(arr);

  return arr.find(n => !alreadySet.has(n)) ?? null;
}


function chanceSecondFavProbability(favPct, secPct) {
  const f = Number(favPct || 0);
  const s = Number(secPct || 0);

  // Säkerhet
  if (!Number.isFinite(f) || !Number.isFinite(s) || f <= 0 || s <= 0) return 0;

  const gap = Math.abs(f - s);

  // 1) Bas på gap: mindre gap -> högre chans
  // (ger precis ditt exempel: 45–25 högre än 70–20)
  let base;
  if (gap <= 2) base = 0.95;
  else if (gap <= 5) base = 0.80;
  else if (gap <= 10) base = 0.55;
  else if (gap <= 20) base = 0.25;
  else base = 0.10;

  // 2) Modifiera med favoritens storlek:
  // Stor favorit (t.ex. 70%) -> lägre chans att ta med 2:a
  // Mindre favorit (t.ex. 45%) -> högre chans
  //
  // Vi skalar mellan ~0.6 (mycket stor fav) och ~1.25 (mindre fav)
  // 70% -> ~0.60
  // 45% -> ~0.95
  // 35% -> ~1.05
  // 25% -> ~1.20
  const favFactor = Math.min(1.25, Math.max(0.60, 1.20 - (f / 100)));

  // Slutlig chans
  let p = base * favFactor;

  // Klipp inom rimliga gränser
  p = Math.min(0.95, Math.max(0.05, p));
  return p;
}

// Se till att favoriten alltid är med i varje avdelning där vi har val
function ensureFavouriteInEachDivision(selections, lockedSpikeDivSet) {
  if (!Array.isArray(selections)) return;

  const byDiv = new Map(
    selections.map((sel) => [sel.divisionIndex, sel])
  );

  divisions.forEach((div) => {
    const idx = div.index ?? 0;
    const sel = byDiv.get(idx);
    if (!sel) return;

    // Om avdelningen är en "låst" spik i fyllda kuponger får vi inte lägga till fler hästar
    if (lockedSpikeDivSet && lockedSpikeDivSet.has(idx)) return;

    const fav = getDivisionFavouriteNumber(idx);
    if (fav == null) return;

    const set = new Set(sel.horses || []);
    if (!set.has(fav)) {
      set.add(fav);
      sel.horses = Array.from(set).sort((a, b) => a - b);
    }
  });
}

// Räkna hur många superskrällar kupongen har totalt
function countSuperskrallInSelections(selections) {
  let count = 0;
  selections.forEach((sel) => {
    const divIndex = sel.divisionIndex;
    (sel.horses || []).forEach((num) => {
      if (isSuperskrall(divIndex, num)) count++;
    });
  });
  return count;
}

// Tvinga kupongen att ha EXAKT targetSuperskrall superskrällar
// utan att röra spikar eller favoriter
function enforceSuperskrallCount(
  selections,
  spikeDivSet,
  targetSuperskrall
) {
  if (!Array.isArray(selections) || targetSuperskrall == null) return;

  // 1) Bygg listor
  const supers = [];
  const nonSupersCandidates = [];
  const supersAddCandidates = [];

  selections.forEach((sel) => {
    const divIndex = sel.divisionIndex;
    const horses = sel.horses || [];
    const isSpike = horses.length === 1;

    horses.forEach((num) => {
      if (isSuperskrall(divIndex, num)) {
        supers.push({ divIndex, num, sel });
      } else {
        nonSupersCandidates.push({ divIndex, num, sel });
      }
    });

    // Avdelningar där vi KAN lägga till superskräll:
    // inte spik-avdelning (spikDivSet) och minst 1 häst
    if (!spikeDivSet.has(divIndex) && horses.length >= 1) {
      supersAddCandidates.push(sel);
    }
  });

  let current = supers.length;

  // 2) Om vi har FÖR MÅNGA superskrällar → ta bort några (men bara där vi har >1 häst)
  if (current > targetSuperskrall) {
    const removable = supers.filter(
      ({ sel }) => (sel.horses || []).length > 1
    );

    // slumpa ordningen
    for (let i = removable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [removable[i], removable[j]] = [removable[j], removable[i]];
    }

    for (const { divIndex, num, sel } of removable) {
      if (current <= targetSuperskrall) break;
      const fav = getDivisionFavouriteNumber(divIndex);
      // ta inte bort favoriten om den råkar vara superskräll
      if (fav === num) continue;

      const list = sel.horses || [];
      if (list.length <= 1) continue;
      const idx = list.indexOf(num);
      if (idx === -1) continue;
      list.splice(idx, 1);
      sel.horses = list;
      current--;
    }
  }

  // 3) Om vi har FÖR FÅ superskrällar → lägg till några
  if (current < targetSuperskrall) {
    // Bygg kandidater (division, häst) som är superskräll men inte redan med
    const addCandidates = [];
    divisions.forEach((div) => {
      const idx = div.index ?? 0;
      const sel = selections.find((s) => s.divisionIndex === idx);
      if (!sel) return;

      const isSpikeDiv = spikeDivSet.has(idx);
      const currentSet = new Set(sel.horses || []);

      (div.horses || []).forEach((h) => {
        if (!h || h.scratched || !h.rawLine) return;
        const num = h.number;
        if (currentSet.has(num)) return;
        if (!isSuperskrall(idx, num)) return;
        if (isSpikeDiv) return; // rör inte spik-avdelningar

        addCandidates.push({ divIndex: idx, num, sel });
      });
    });

    // slumpa ordningen
    for (let i = addCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [addCandidates[i], addCandidates[j]] = [
        addCandidates[j],
        addCandidates[i],
      ];
    }

    for (const { divIndex, num, sel } of addCandidates) {
      if (current >= targetSuperskrall) break;
      const list = sel.horses || [];
      list.push(num);
      sel.horses = Array.from(new Set(list)).sort((a, b) => a - b);
      current++;
    }
  }
}


//
// ---- Tabell + sidokolumner ----
//



function buildHorseView(division, divIndex, popularity) {
  const { counts = {}, spiked = {}, maxCount = 0 } = popularity || {};
  const mainPercentIndex = getMainPercentIndex();
  const tipsIndex = getTipsCommentIndex();

    // Riktig avdelnings-index (1-baserat) – används för V%-beräkningar
  const realDivisionIndex =
    division && division.index != null ? division.index : divIndex + 1;

  // Hästnumret som är storfavorit (högst V% i avdelningen)
  const favouriteNumber = getDivisionFavouriteNumber
    ? getDivisionFavouriteNumber(realDivisionIndex)
    : null;

  
  const container = document.getElementById('horse-table-container');
  const popularList = document.getElementById('popular-number-list');
  const ideaList = document.getElementById('idea-number-list');

  container.innerHTML = '';
  popularList.innerHTML = '';
  ideaList.innerHTML = '';

  if (!division || !division.horses || !division.horses.length) {
    container.textContent = 'Inga hästar i denna avdelning.';
    return;
  }

  const divKey = getDivisionKey(division);
  if (!selectedIdeaNumbersByDivIndex[divKey]) {
    selectedIdeaNumbersByDivIndex[divKey] = new Set();
  }
  const selectedSet = selectedIdeaNumbersByDivIndex[divKey];

  const allColumns = (headerColumns || []).map((name, index) => ({ name, index }));
  const up = (s) => String(s || '').toUpperCase();

  // Bas: gamla logiken
  let visibleColumns = getVisibleColumns(headerColumns, listMode);
  let detailColumns = [];

  const isOddsCol = (c) => /(P-?ODDS|V-?ODDS|\bODDS\b)/i.test(String(c?.name || ''));

  // Detaljerad vy: visa en smal tabell och lägg resten i en dropdown under hästen
  if (listMode === 'detailed') {
    const horseCol = allColumns.find((c) => up(c.name).startsWith('HÄST'));
    const mainIdx = getMainPercentIndex(headerColumns);
    const mainCol = allColumns.find((c) => c.index === mainIdx);
    // ODDS (P-ODDS / V-ODDS) ska ligga i detaljpanelen för smalare rader
    const oddsCol = allColumns.find((c) => isOddsCol(c));
    const valueCol = allColumns.find((c) => /VÄRDE|VINSTPENGAR|UTDELNING|PRIS/.test(up(c.name)));

    // Smal rad: Häst + huvud-% (t.ex. V85%). Övrigt (inkl odds) i detaljpanelen.
    const summary = [horseCol, mainCol]
      .filter(Boolean)
      .filter((c, i, a) => a.findIndex((x) => x.index === c.index) === i);

    const shown = new Set(summary.map((c) => c.index));
    visibleColumns = summary;

    detailColumns = allColumns.filter((c) => {
      const u = up(c.name);
      if (shown.has(c.index)) return false;
      if (u.startsWith('KUSK')) return false;
      if (u.startsWith('HÄST')) return false;
      return true;
    });
  }

  // 🔹 För alla lägen: visa aldrig ODDS-kolumnen i själva listan.
  // Den ska istället ligga i detaljpanelen (som du kan klicka fram på varje rad).
  visibleColumns = (visibleColumns || []).filter((c) => !isOddsCol(c));

  // Om vi inte är i detailed-läge, bygg detailColumns här så att detaljpanelen ändå kan visas.
  if (!detailColumns.length) {
    const shown = new Set((visibleColumns || []).map((c) => c.index));
    detailColumns = allColumns.filter((c) => {
      const u = up(c.name);
      if (shown.has(c.index)) return false;
      if (u.startsWith('KUSK')) return false;
      if (u.startsWith('HÄST')) return false;
      return true;
    });
  }

  const table = document.createElement('table');
  
  table.id = 'horse-table';
  table.className = 'horse-table';

  const isMobile = window.innerWidth <= 900;

  // ----- THEAD -----
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  visibleColumns.forEach(({ name }) => {
    const th = document.createElement('th');
    th.textContent = name.toUpperCase().startsWith('HÄST') ? 'Häst' : name;
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  table.appendChild(thead);

  // ----- TBODY -----
  const tbody = document.createElement('tbody');

  const sortedHorses = division.horses
    .slice()
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  const kuskIndex = headerColumns.findIndex((h) =>
    h.toUpperCase().startsWith('KUSK')
  );

  sortedHorses.forEach((horse) => {
    const tr = document.createElement('tr');
    tr.classList.add('horse-row');
     // 🔹 markera favoritens rad
    if (Number(horse.number) === Number(favouriteNumber)) {
      tr.classList.add('horse-row-favourite');
    }

    if (horse.scratched) {
      tr.classList.add('scratched');
    }

    let cols = [];
    if (horse.rawLine) {
      cols = parseLineColumns(horse.rawLine);
    }

    // vilka ikoner gäller denna häst? (från TIPSKOMMENTAR)
    const iconIds = [];
    if (tipsIndex >= 0 && cols[tipsIndex]) {
      const lower = String(cols[tipsIndex]).toLowerCase();
      ICON_DEFS.forEach((def) => {
        if (lower.includes(def.match)) {
          iconIds.push(def.id);
        }
      });
    }

    // Extra-info (visas i detaljpanelen under hästen – i ALLA lägen)
    let extraData = [];
    if (horse.rawLine) {
      extraData = detailColumns.map(({ name, index }) => ({
        label: name,
        value: cols[index] ?? '',
      }));
    }
// 🔹 Resa (hemmabana -> aktuell bana)
const allColsForTravel = [].concat(visibleColumns || [], detailColumns || []);
const homeCol = allColsForTravel.find((c) => /HEMMA\s*BANA|HEMMABANA|HEMBANA|HOME\s*TRACK|HOMETRACK/i.test(String(c?.name || '')));
const homeVal = homeCol ? (cols[homeCol.index] ?? '') : '';
const km = computeTravelDistanceKm(homeVal);
if (km != null) {
  const rounded = Math.round(km);
  extraData.push({ label: 'Resa till bana', value: `${rounded} km` });
}

    // ----- cellerna -----
    visibleColumns.forEach(({ name, index }) => {
      const td = document.createElement('td');
      const upper = name.toUpperCase();

      if (!horse.rawLine) {
        // Struken häst utan rawLine: bygg samma "två-raders" höjd som övriga hästar
        // så strukna inte blir lägre än resten (och siffrorna i sidokolumnerna linjerar).
        if (upper.startsWith('HÄST')) {
          const nameRow = document.createElement('div');
          nameRow.className = 'horse-name-row';

          const nameEl = document.createElement('div');
          nameEl.className = 'horse-name';
          nameEl.textContent = 'Struken';
          nameRow.appendChild(nameEl);
          td.appendChild(nameRow);

          // tom "kusk-rad" för att matcha höjden
          const driverEl = document.createElement('div');
          driverEl.className = 'horse-driver';
          driverEl.innerHTML = '&nbsp;';
          td.appendChild(driverEl);
        } else {
          td.textContent = '';
        }
      } else if (upper.startsWith('HÄST')) {
        // HÄST + kusk under
        let horseText = cols[index] ?? '';
        const m = horseText.match(/^(\d+)\s+(.*)$/);
        if (m) {
          horseText = m[2];
        }

        let kuskName = '';
        if (kuskIndex >= 0 && cols[kuskIndex]) {
          kuskName = cols[kuskIndex];
        }


        // spara för detaljer-raden
        tr._horseTitle = horseText;
        tr._horseDriver = kuskName;

        // Bygg DOM så vi kan lägga ikoner till höger om hästnamnet
        const nameRow = document.createElement('div');
        nameRow.className = 'horse-name-row';

        const nameEl = document.createElement('div');
        nameEl.className = 'horse-name';
        nameEl.textContent = horseText;
        nameRow.appendChild(nameEl);

	        // ✅ Stallsnack/intervju-indikator (liten ikon på hästraden)
	        try {
	          const snack = getStallsnackForHorse(divIndex + 1, horse.number);
	          const arr = (snack && (snack.sentences || snack.lines)) || [];
	          if (Array.isArray(arr) && arr.length) {
	            const snackSpan = document.createElement('span');
	            snackSpan.className = 'horse-snack-indicator';
	            snackSpan.title = 'Stallsnack / intervju finns';
	            snackSpan.textContent = '💬';
	            nameRow.appendChild(snackSpan);
	          }
	        } catch (e) {
	          // tyst
	        }

        // Ikoner (från tipskommentar) – visas till höger om hästnamnet
        if (iconIds && iconIds.length) {
          const iconBar = document.createElement('span');
          iconBar.className = 'horse-icon-bar horse-icon-bar-name';
          iconIds.forEach((id) => {
            if (!iconVisibility[id]) return;
            const def = ICON_DEFS.find((d) => d.id === id);
            if (!def) return;
            const span = document.createElement('span');
            span.className = 'horse-icon';
            span.textContent = def.emoji;
            iconBar.appendChild(span);
          });
          if (iconBar.childNodes.length) nameRow.appendChild(iconBar);
        }

        td.appendChild(nameRow);

        if (kuskName) {
          const driverEl = document.createElement('div');
          driverEl.className = 'horse-driver';
          driverEl.textContent = kuskName;
          td.appendChild(driverEl);
        }


      } else {
        // övriga kolumner
        const cellValue = horse.rawLine ? cols[index] ?? '' : '';

        // ikon-läge: bara huvudprocent + ikoner
        if (listMode === 'icons' && index === mainPercentIndex) {
          const pctSpan = document.createElement('span');
          pctSpan.textContent = cellValue || '';
          td.appendChild(pctSpan);

          const iconBar = document.createElement('span');
          iconBar.className = 'horse-icon-bar';

          iconIds.forEach((id) => {
            if (!iconVisibility[id]) return;
            const def = ICON_DEFS.find((d) => d.id === id);
            if (!def) return;

            const span = document.createElement('span');
            span.className = 'horse-icon';
            span.textContent = def.emoji;
            iconBar.appendChild(span);
          });

          td.appendChild(iconBar);
        } else {
          td.textContent = cellValue;
        }
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);


    // Tipskommentar-rad (visas under hästen)
    const tipsEntry = extraData.find(d => String(d?.label || '').toUpperCase().includes('TIPSKOMMENTAR'));
    const tipsText = (tipsEntry && String(tipsEntry.value || '').trim()) || '';
    // För strukna (utan tips) skapar vi ändå en tom tipsrad för att rad-höjden ska matcha övriga.
    if (tipsText || (horse && horse.scratched)) {
      const tipsTr = document.createElement('tr');
      tipsTr.className = 'horse-tips-row';
      if (!tipsText) tipsTr.classList.add('is-empty');

      const tipsTd = document.createElement('td');
      tipsTd.colSpan = visibleColumns.length;

      const tipsBox = document.createElement('div');
      tipsBox.className = 'horse-tips-box';
      if (!tipsText) tipsBox.classList.add('is-empty');

      const tipsTextEl = document.createElement('div');
      tipsTextEl.className = 'horse-tips-text';
      tipsTextEl.textContent = tipsText || '';
      if (!tipsText) tipsTextEl.innerHTML = '&nbsp;';

      tipsBox.appendChild(tipsTextEl);
      tipsTd.appendChild(tipsBox);
      tipsTr.appendChild(tipsTd);

      tbody.appendChild(tipsTr);
      tr._tipsRow = tipsTr;
    }


    // Bygg en egen rad UNDER hästen för detaljer (spänner över alla kolumner)
    const snack = getStallsnackForHorse(divIndex + 1, horse.number);
    const snackSourceUrl = game?.stallsnack?.url ? String(game.stallsnack.url) : '';
    const snackLinesRaw = Array.isArray(snack?.sentences) ? snack.sentences : [];
    const cleanStallsnackLine = (t) =>
      String(t || '')
        .replace(/\u00A0/g, ' ')
        .replace(/^\s*[-–•·.]+\s*/g, '')
        .trim();
    const isNoiseSnackLine = (t) => {
      const s = String(t || '').trim();
      if (!s) return false;
      if (/\buppsnack\b/i.test(s)) return false;
      if (/nan:nan/i.test(s)) return false;
      if (/^\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s*\/\s*/.test(s)) return false;
      return true;
    };
    const snackLines = snackLinesRaw.map(cleanStallsnackLine).filter(isNoiseSnackLine);

    if (horse.rawLine && ((extraData && extraData.length) || snackLines.length)) {
      const detailsTr = document.createElement('tr');
      detailsTr.className = 'horse-details-row';
      detailsTr.style.display = 'none';

      const detailsTd = document.createElement('td');
      detailsTd.colSpan = visibleColumns.length;

      const panel = document.createElement('div');
      panel.className = 'horse-details-panel';

      // (Header i detaljpanelen borttagen enligt ny design)

      // Grid med kort
      const grid = document.createElement('div');
      grid.className = 'horse-details-grid';

      extraData.forEach(({ label, value }) => {
        const v = String(value || '').replace(/ /g, ' ').trim();
        if (!v) return;
        const uLabel = String(label || '').toUpperCase();
        if (uLabel.includes('TIPSKOMMENTAR')) return; // visas istället som egen rad under hästen

        const card = document.createElement('div');
        card.className = 'horse-extra-card';
        if (uLabel.includes('STATISTIKKOMMENTAR')) card.classList.add('wide');

        const lab = document.createElement('div');
        lab.className = 'horse-extra-label';
        lab.textContent = label;

        const val = document.createElement('div');
        val.className = 'horse-extra-value';
        val.textContent = v;

        card.appendChild(lab);
        card.appendChild(val);
        grid.appendChild(card);
      });

      // Stallsnack / intervjuer (meningar) - ska alltid ligga överst i detaljpanelen.
      // Om det saknas data visar vi en liten text istället för att "försvinna".
      {
        const card = document.createElement('div');
        card.className = 'horse-extra-card wide';
        card.classList.add('horse-extra-stallsnack');

        const lab = document.createElement('div');
        lab.className = 'horse-extra-label';
        lab.textContent = 'Stallsnack / intervju';

        const val = document.createElement('div');
        val.className = 'horse-extra-value';

        if (snackLines.length) {
          // Snabböverblick (trav-taggar) ovanför texten
          const summary = buildStallsnackQuickSummaryTrav(snackLines.join(' '));
          if (summary && summary.tags && summary.tags.length) {
            const sum = document.createElement('div');
            sum.className = `stallsnack-summary ${summary.tone || 'neutral'}`;
            summary.tags.forEach((tag) => {
              const b = document.createElement('span');
              b.className = 'stallsnack-tag';
              b.textContent = tag;
              sum.appendChild(b);
            });
            val.appendChild(sum);
          }

          const ul = document.createElement('ul');
          ul.className = 'stallsnack-list';

          const foldSnack = (val) => String(val || '')
            .toLowerCase()
            .replace(/[^a-z0-9åäöéèüøæ]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const seenSnack = new Set();
          const deduped = [];
          snackLines.forEach((s) => {
            const t = String(s || '').trim();
            const key = foldSnack(t);
            if (!key || seenSnack.has(key)) return;
            seenSnack.add(key);
            deduped.push(t);
          });

          deduped.forEach((t) => {
            const li = document.createElement('li');
            li.textContent = t;
            ul.appendChild(li);
          });

          val.appendChild(ul);
        } else {
          const empty = document.createElement('div');
          empty.className = 'stallsnack-empty';
          empty.textContent = 'Inget stallsnack hittades för den här hästen.';
          val.appendChild(empty);
        }

        if (snackSourceUrl) {
          const src = document.createElement('div');
          src.className = 'stallsnack-source';
          const a = document.createElement('a');
          a.href = snackSourceUrl;
          a.target = '_blank';
          a.rel = 'noreferrer';
          a.textContent = 'Källa: ATG';
          src.appendChild(a);
          val.appendChild(src);
        }

        card.appendChild(lab);
        card.appendChild(val);
        grid.insertBefore(card, grid.firstChild);
      }

      if (grid.childNodes.length) {
        panel.appendChild(grid);
        detailsTd.appendChild(panel);
        detailsTr.appendChild(detailsTd);
        tbody.appendChild(detailsTr);
        tr._detailsRow = detailsTr;
      }
    }

    // klick för att fälla ut detaljer-raden (PC + mobil)
    if (tr._detailsRow) {
      tr.classList.add('horse-row');

      tr.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('a,button,input,label,select,textarea')) return;

        const wasOpen = tr.classList.contains('expanded');

        // stäng alla
        tbody.querySelectorAll('tr.horse-row.expanded').forEach((row) => row.classList.remove('expanded'));
        tbody.querySelectorAll('tr.horse-details-row').forEach((row) => (row.style.display = 'none'));

        if (!wasOpen) {
          tr.classList.add('expanded');
          tr._detailsRow.style.display = '';
        }

        requestAnimationFrame(syncNumberPositions);
      });
    }

    // antal kuponger där hästen är med (aktiva kuponger)
    const count = counts[horse.number] || 0;
    // Skapa sidoblock (vänster/höger) för denna häst
    const leftSquare = document.createElement('div');
    leftSquare.className = 'num-square left-square';
    leftSquare.dataset.horseNumber = String(horse.number ?? '');
    const leftNum = document.createElement('span');
    leftNum.className = 'num';
    leftNum.textContent = String(horse.number ?? '');
    leftSquare.appendChild(leftNum);

        const rightSquare = document.createElement('div');
        // "Min kupong" (högerkolumnen) ska ha samma blå markering som tidigare.
        // CSS:en stylar .num-square.clickable.selected, så vi måste ha "clickable" här.
        rightSquare.className = 'num-square right-square clickable';
    rightSquare.dataset.horseNumber = String(horse.number ?? '');
    const rightNum = document.createElement('span');
    rightNum.className = 'num';
    rightNum.textContent = String(horse.number ?? '');
    rightSquare.appendChild(rightNum);


    // ----- vänsterkolumn: populärfält -----
    
    leftSquare.classList.add('left-square');

    // favorit = gul markering även i vänsterkolumnen
    if (Number.isFinite(Number(favouriteNumber)) && Number(horse.number) === Number(favouriteNumber)) {
      leftSquare.classList.add('favourite-number');
    }

    if (horse.scratched) {
      leftSquare.classList.add('scratched');
    }

    // inte spelad på någon kupong → röd
    const activeCoupons = getActiveCoupons();
if (activeCoupons && activeCoupons.length > 0 && !horse.scratched && count === 0) {
  leftSquare.classList.add('not-played');
}


    if (maxCount > 0 && count === maxCount) {
      leftSquare.classList.add('popular-most');
    }

    // spik-ram (stjärnor)
    const spikeCount = spiked[horse.number] || 0;
    if (spikeCount > 0) {
      leftSquare.classList.add('has-spike');

      const size = 5;
      const borderPositions = [];

      // överkant
      for (let c = 0; c < size; c++) borderPositions.push([0, c]);
      // högerkant utan hörn
      for (let r = 1; r < size - 1; r++) borderPositions.push([r, size - 1]);
      // nederkant
      for (let c = size - 1; c >= 0; c--) borderPositions.push([size - 1, c]);
      // vänsterkant utan hörn
      for (let r = size - 2; r > 0; r--) borderPositions.push([r, 0]);

      const maxStarsInFrame = borderPositions.length;
      const usedStars = Math.min(spikeCount, maxStarsInFrame);

      const frameEl = document.createElement('div');
      frameEl.className = 'star-frame';

      for (let i = 0; i < usedStars; i++) {
        const [r, c] = borderPositions[i];
        const star = document.createElement('span');
        star.className = 'star-cell';
        star.textContent = '★';
        star.style.gridRowStart = r + 1;
        star.style.gridColumnStart = c + 1;
        frameEl.appendChild(star);
      }

      leftSquare.appendChild(frameEl);
    }

    popularList.appendChild(leftSquare);

    // ----- högerkolumn: Idéfält -----
    
    rightSquare.classList.add('right-square');

    if (horse.scratched) {
      rightSquare.classList.add('scratched');
      rightSquare.style.cursor = 'default';
    } else {
      if (selectedSet.has(horse.number)) {
        rightSquare.classList.add('selected');
      }

      rightSquare.addEventListener('click', () => {
        if (selectedSet.has(horse.number)) {
          selectedSet.delete(horse.number);
          rightSquare.classList.remove('selected');
        } else {
          selectedSet.add(horse.number);
          rightSquare.classList.add('selected');
        }

        selectedIdeaNumbersByDivIndex[divKey] = selectedSet;
        updateDivisionCount(divIndex, selectedSet.size);
        saveIdeaSelections();
        computeAndRenderPrice();
      });
    }

    ideaList.appendChild(rightSquare);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  updateDivisionCount(divIndex, selectedSet.size);
  computeAndRenderPrice();

  // align sidokolumnerna efter att layouten är klar
  requestAnimationFrame(syncNumberPositions);
}



function updateDivisionCount(divIndex, count) {
  const el = divisionCountEls[divIndex];
  if (!el) return;
  el.textContent = String(count || 0);
}




//
// ---- Kolumnval beroende på listMode ----
//


function getVisibleColumns(allColumns, mode) {
  const cols = allColumns || headerColumns || [];
  if (!cols.length) return [];

  // Ikonläge: bara HÄST + huvudprocent (V85%, V64%, V86%, GS75% …)
  if (mode === 'icons') {
    const mainIdx = getMainPercentIndex(cols);

    return cols
      .map((name, index) => ({ name, index }))
      .filter(({ name, index }) => {
        const up = String(name).toUpperCase();
        if (up.startsWith('HÄST')) return true;
        if (up.startsWith('KUSK')) return false; // kusk ligger under hästnamnet
        if (index === mainIdx) return true;      // t.ex. V85%
        return false;                            // göm SEGER%, PLATS%, TREND% osv
      });
  }

  // Detaljerad lista: alla kolumner utom KUSK som egen kolumn
  if (mode === 'detailed') {
    return cols
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => !name.toUpperCase().startsWith('KUSK'));
  }

  // Enkel lista: HÄST + alla %-kolumner (V85%, TREND%, SEGER%, PLATS%)
  return cols
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => {
      const up = String(name).toUpperCase();
      if (up.startsWith('HÄST')) return true;
      if (up.startsWith('KUSK')) return false;
      if (up.endsWith('%')) return true;
      return false;
    });
}



//
// ---- Pris-beräkning ----
//

function computeAndRenderPrice() {
  const priceEl = document.getElementById('price-info');
  if (!priceEl || !divisions.length) return;

  // antal markerade per avdelning
  const counts = divisions.map((div) => {
    const key = getDivisionKey(div);
    const set = selectedIdeaNumbersByDivIndex[key];
    return set ? set.size : 0;
  });

  const baseRadPris = getRadPris(game?.gameType);     // t.ex. 0.50 på V85
const radPris = getEffectiveRadPris();              // tar hänsyn till stakeLevel
const radPrisFormatted = formatMoney(radPris);


  if (!counts.length) {
    priceEl.innerHTML = `
      <div class="price-info-main">Pris: 0,00 kr</div>
      <div class="price-info-sub">Inga val.</div>
    `;
    return;
  }

  const maxCount = Math.max(...counts);
  let rows = 0;

  if (maxCount === 0) {
    // helt tom kupong
    rows = 0;
  } else {
    // minst en avdelning har val → räkna 0 som 1
    const countsForProduct = counts.map((c) => (c === 0 ? 1 : c));
    rows = countsForProduct.reduce((p, c) => p * c, 1);
  }

   const total = rows * radPris;
  const countsExpr = counts.join('x'); // t.ex. 3x5x3x1x1x5

  const main = `Pris: ${formatMoney(total)} kr`;
  let sub;

  if (rows > 0) {
    let stakeText = '';
    const up = String(game?.gameType || '').toUpperCase();
    if (up === 'V85') {
      const map = {
        original: '100% insats',
        '70': '70% insats',
        '50': '50% insats',
        '30': '30% insats',
      };
      stakeText = ` • ${map[stakeLevel] || ''}`;
    }

    sub =
      `${countsExpr} = ${rows} rader • ` +
      `Radpris: ${radPrisFormatted} kr${stakeText}`;
  } else {
    sub = 'Inga val.';
  }

  priceEl.innerHTML = `
    <div class="price-info-main">${main}</div>
    <div class="price-info-sub">${sub}</div>
  `;
}

function computeCouponPrice(coupon) {
  const radPris = getEffectiveRadPrisForCoupon(coupon);


  if (!divisions.length || !coupon || !Array.isArray(coupon.selections)) {
    return {
      rows: 0,
      total: 0,
      countsExpr: '',
      radPris,
    };
  }

  // Mappa divisionIndex -> position i divisions-arrayen
  const indexToPos = {};
  divisions.forEach((div, i) => {
    const idx = div.index ?? i + 1;
    indexToPos[idx] = i;
  });

  // Starta med 0 val i alla avdelningar
  const counts = new Array(divisions.length).fill(0);

  coupon.selections.forEach((sel) => {
    const pos = indexToPos[sel.divisionIndex];
    if (pos === undefined) return;

    const n = Array.isArray(sel.horses) ? sel.horses.length : 0;
    counts[pos] = n;
  });

  const hasAny = counts.some((c) => c > 0);
  let rows = 0;

  if (hasAny) {
    // Samma logik som egen kupong: 0 räknas som 1 när minst en avdelning har val
    const countsForProduct = counts.map((c) => (c === 0 ? 1 : c));
    rows = countsForProduct.reduce((p, c) => p * c, 1);
  }

  const total = rows * radPris;
  const countsExpr = counts.join('x'); // t.ex. "3x5x3x1x1x5"

  return {
    rows,
    total,
    countsExpr,
    radPris,
  };
}


function getRadPris(gameType) {
  if (!gameType) return 1;
  const up = String(gameType).toUpperCase();
  if (up === 'V85') return 0.5;
  return 1.0;
}

function formatMoney(value) {
  return value.toFixed(2).replace('.', ',');
}


function getEffectiveRadPris() {
  const base = getRadPris(game?.gameType);

  const up = String(game?.gameType || '').toUpperCase();
  if (up !== 'V85') {
    // andra spelformer bryr sig inte om stakeLevel
    return base;
  }

  switch (stakeLevel) {
    case '30':
      return 0.15;
    case '50':
      return 0.25;
    case '70':
      return 0.35;
    case 'original':
    default:
      return 0.5; // ordinarie V85
  }
}

function getEffectiveRadPrisForCoupon(coupon) {
  const base = getRadPris(game?.gameType);
  const up = String(game?.gameType || '').toUpperCase();

  // Bara V85 har sänkt insats
  if (up !== 'V85') return base;

  const level = coupon?.stakeLevel || 'original';

  switch (level) {
    case '30':
      return 0.15;
    case '50':
      return 0.25;
    case '70':
      return 0.35;
    case 'original':
    default:
      return 0.5; // ordinarie V85
  }
}



//
// ---- Autofix: align sidokolumner med tabellrader ----
//

function syncNumberPositions() {
  const table = document.getElementById('horse-table');
  if (!table) return;

  const horseRows = table.querySelectorAll('tbody tr.horse-row');
  let leftSquares = document.querySelectorAll('.left-square');
  let rightSquares = document.querySelectorAll('.right-square');

  // 🔹 Justera sidokolumnernas top-offset så siffrorna linjerar med tabellens första hästrad
  try {
    const thead = table.querySelector('thead');
    const headH = thead && window.getComputedStyle(thead).display !== 'none'
      ? Math.round(thead.getBoundingClientRect().height)
      : 0;

    const popularList = document.getElementById('popular-number-list');
    const ideaList = document.getElementById('idea-number-list');
    if (popularList) popularList.style.marginTop = headH ? `${headH}px` : '0px';
    if (ideaList) ideaList.style.marginTop = headH ? `${headH}px` : '0px';
  } catch (e) {
    // tyst
  }

  // Fallback om klasserna saknas (äldre render)
  if (!leftSquares.length) leftSquares = document.querySelectorAll('#popular-number-list .num-square');
  if (!rightSquares.length) rightSquares = document.querySelectorAll('#idea-number-list .num-square');

  const n = Math.min(horseRows.length, leftSquares.length, rightSquares.length);

  for (let i = 0; i < n; i++) {
    const row = horseRows[i];

    let height = row.getBoundingClientRect().height;

    // Tipsrad (visas alltid, om den finns)
    let next = row.nextElementSibling;
    if (next && next.classList.contains('horse-tips-row')) {
      height += next.getBoundingClientRect().height;
      next = next.nextElementSibling;
    }

    // Detaljrad (kan vara öppen/stängd)
    if (next && next.classList.contains('horse-details-row')) {
      const dh = next.getBoundingClientRect().height;
      if (dh > 0) height += dh;
    }

    // Runda för att undvika att små decimaler ger "drift" längst ned
    const hPx = Math.max(0, Math.round(height));
    const px = `${hPx}px`;
    leftSquares[i].style.height = px;
    rightSquares[i].style.height = px;
  }
}





function setupResponsiveSync() {
  let rafId = null;

  const schedule = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      syncNumberPositions();
    });
  };

  // Desktop + när man roterar mobilen
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);

  // Mobil-special: när man scrollar (adressfält upp/ner)
 /* window.addEventListener(
    'scroll',
    () => {
      if (window.innerWidth <= 900) {
        schedule();
      }
    },
    { passive: true }
  );*/
}

//
// ---- Kupongbyggare ----
//

function initCouponUI() {
  const btnAdd = document.getElementById('btn-add-coupon');
  const panel = document.getElementById('coupon-add-panel');
  const builder = document.getElementById('coupon-builder');
  const btnSave = document.getElementById('btn-save-coupon');
  const btnCancel = document.getElementById('btn-cancel-coupon');

const btnOpenSplit = document.getElementById('btn-open-split');
const splitPanel = document.getElementById('split-panel');
const splitNameInput = document.getElementById('split-name');
const splitCountInput = document.getElementById('split-count');
const splitMaxPriceInput = document.getElementById('split-max-price');
const splitSpikesInput = document.getElementById('split-spikes');
const splitPatternInput = document.getElementById('split-pattern');
const splitSuggestionsBox = document.getElementById('split-pattern-suggestions');
const btnSplitDo = document.getElementById('btn-split-do');
const btnSplitCancel = document.getElementById('btn-split-cancel');
const splitUsePopularInput = document.getElementById('split-use-popular');

  // ---- Omvänd kupong UI ----
  const btnOpenReverse = document.getElementById('btn-open-reverse');
  const reversePanel = document.getElementById('reverse-panel');
  const reverseNameInput = document.getElementById('reverse-name');
  const reversePriceInput = document.getElementById('reverse-price');
  const reverseSpikesInput = document.getElementById('reverse-spikes');
  const btnReverseCreate = document.getElementById('btn-create-reverse');
  const btnReverseCancel = document.getElementById('btn-cancel-reverse');

const reverseSupersInput = document.getElementById('reverse-supers'); //

// Sliders + visningstext för omvänd-panelen
const reversePriceSlider = document.getElementById('reverse-price-slider');
const reversePriceDisplay = document.getElementById('reverse-price-display');
const reverseSpikesDisplay = document.getElementById('reverse-spikes-display');
const reverseSupersDisplay = document.getElementById('reverse-supers-display');

 // ---- chance kupong UI ----
const btnOpenChance = document.getElementById('btn-open-chance');
const chancePanel = document.getElementById('chance-panel');
const chanceNameInput = document.getElementById('chance-name');
const chanceCountInput = document.getElementById('chance-count');
const chanceMaxPriceInput = document.getElementById('chance-max-price');
const chanceLevelInput = document.getElementById('chance-level');
const chanceLevelDisplay = document.getElementById('chance-level-display');
const chancePreferUnplayedInput = document.getElementById('chance-prefer-unplayed');
const btnChanceDo = document.getElementById('btn-chance-do');
const btnChanceCancel = document.getElementById('btn-chance-cancel');

// Bästa raden UI
const btnOpenBestRow = document.getElementById('btn-open-best-row');
const bestRowPanel = document.getElementById('best-row-panel');
const btnCloseBestRow = document.getElementById('btn-close-best-row');
const btnGenerateBestRows = document.getElementById('btn-generate-best-rows');
const bestRowMaxPriceInput = document.getElementById('best-row-max-price');
const bestRowMaxPerDivisionInput = document.getElementById('best-row-max-per-division');
const bestRowSkrallLevelInput = document.getElementById('best-row-skrall-level');
const bestRowSkrallLevelDisplay = document.getElementById('best-row-skrall-level-display');
const chanceIncludeSecondFavInput = document.getElementById('chance-include-secondfav');
const chanceSpikesInput = document.getElementById('chance-spikes');
const chanceSpikesDisplay = document.getElementById('chance-spikes-display');
// ---- Jackpot kupong UI ----
const btnOpenJackpot = document.getElementById('btn-open-jackpot');
const jackpotPanel = document.getElementById('jackpot-panel');
const jackpotNameInput = document.getElementById('jackpot-name');
const jackpotCountInput = document.getElementById('jackpot-count');
const jackpotMaxPriceInput = document.getElementById('jackpot-max-price');
const jackpotSpikesInput = document.getElementById('jackpot-spikes');
const btnJackpotDo = document.getElementById('btn-jackpot-do');
const btnJackpotCancel = document.getElementById('btn-jackpot-cancel');


// ---- Fill kupong UI ----
const btnOpenFill = document.getElementById('btn-open-fill');
const fillPanel = document.getElementById('fill-panel');
const fillSelectedInfo = document.getElementById('fill-selected-info');
const fillPrice = document.getElementById('fill-price');
const fillCount = document.getElementById('fill-count');
const fillSpikes = document.getElementById('fill-spikes');
const fillSpikesDisplay = document.getElementById('fill-spikes-display');
const fillProfile = document.getElementById('fill-profile');
const fillProfileDisplay = document.getElementById('fill-profile-display');
const btnFillDo = document.getElementById('btn-fill-do');
const btnFillCancel = document.getElementById('btn-fill-cancel');

// spara refs globalt
fillPanelEl = fillPanel;
fillSelectedInfoEl = fillSelectedInfo;
fillPriceEl = fillPrice;
fillCountEl = fillCount;
fillSpikesEl = fillSpikes;
fillSpikesDisplayEl = fillSpikesDisplay;
fillProfileEl = fillProfile;
fillProfileDisplayEl = fillProfileDisplay;


if (fillSpikesEl && fillSpikesDisplayEl) {
  const sync = () => fillSpikesDisplayEl.textContent = String(fillSpikesEl.value || '0');
  fillSpikesEl.addEventListener('input', sync);
  sync();
}

if (fillProfileEl && fillProfileDisplayEl) {
  const sync = () => fillProfileDisplayEl.textContent = String(fillProfileEl.value || '1');
  fillProfileEl.addEventListener('input', sync);
  sync();
}


if (btnOpenFill && fillPanelEl) {
  btnOpenFill.addEventListener('click', () => {
    if (!currentGameId) return alert('Öppna ett spel först.');
    if (!coupons.length) return alert('Det finns inga kuponger att fylla på.');

    // toggle
    if (fillMode) {
      exitFillMode();
      return;
    }

    fillMode = true;
    selectedFillCoupon = null;
    document.body.classList.add('fill-mode-active');

    // panel öppnas först när man klickat en kupong
    fillPanelEl.hidden = true;
    if (fillSelectedInfoEl) fillSelectedInfoEl.textContent = 'Välj en kupong i listan…';

    // Exit-knapp + synlig
    ensureFillExitButton();
    if (fillExitFloatingEl) fillExitFloatingEl.hidden = false;

    renderCouponList(); // så korten blir klickbara i fillMode
  });
}



// ---- Skala kupong UI ----
const btnOpenScale = document.getElementById('btn-open-scale');
const scalePanel = document.getElementById('scale-panel');
const scaleSelectedInfo = document.getElementById('scale-selected-info');
const scaleMethod = document.getElementById('scale-method');
const scalePercentWrap = document.getElementById('scale-percent-wrap');
const scalePercent = document.getElementById('scale-percent');
const scalePercentDisplay = document.getElementById('scale-percent-display');
const scalePriceWrap = document.getElementById('scale-price-wrap');
const scaleTargetPrice = document.getElementById('scale-target-price');
const btnScaleDo = document.getElementById('btn-scale-do');
const btnScaleCancel = document.getElementById('btn-scale-cancel');
// ---- Inte spelad kupong ----
const btnOpenNotPlayed = document.getElementById('btn-open-notplayed');
if (btnOpenNotPlayed) {
  btnOpenNotPlayed.addEventListener('click', () => {
    if (!currentGameId) return alert('Öppna ett spel först.');
    if (!coupons.length) return alert('Det finns inga kuponger att utgå ifrån.');

    // toggle
    if (notPlayedMode) {
      exitNotPlayedMode();
      return;
    }

    // stäng andra lägen
    if (fillMode) {
      try { exitFillMode(); } catch {}
    }
    if (reverseMode) {
      reverseMode = false;
      selectedReverseCoupon = null;
      if (reversePanelEl) {
        reversePanelEl.hidden = true;
        reversePanelEl.classList.remove('open');
      }
      document.body.classList.remove('reverse-mode-active');
      document
        .querySelectorAll('.coupon-card.selected-for-reverse')
        .forEach((c) => c.classList.remove('selected-for-reverse'));
    }

    notPlayedMode = true;
    selectedNotPlayedCoupon = null;
    document.body.classList.add('notplayed-mode-active');

    ensureNotPlayedExitButton();
    if (notPlayedExitFloatingEl) notPlayedExitFloatingEl.hidden = false;

    renderCouponList();
  });
}


if (btnFillCancel && fillPanelEl) {
  btnFillCancel.addEventListener('click', () => {
    exitFillMode();
  });
}


// Spara globala referenser så vi kan använda dem i openReversePanelForCoupon
reversePriceSliderEl = reversePriceSlider;
reversePriceDisplayEl = reversePriceDisplay;
reverseSpikesDisplayEl = reverseSpikesDisplay;
reverseSupersDisplayEl = reverseSupersDisplay;

// Befintliga globala refs (som du redan har)
reversePanelEl = reversePanel;
reverseNameInputEl = reverseNameInput;
reversePriceInputEl = reversePriceInput;
reverseSpikesInputEl = reverseSpikesInput;
reverseSupersInputEl = reverseSupersInput;



 
// --- ATG IMPORT + PRESETS ---
const btnOpenImportAtg = document.getElementById('btn-open-import-atg');
const importAtgPanel   = document.getElementById('import-atg-panel');
const importAtgUrl     = document.getElementById('import-atg-url');
const btnImportAtgDo   = document.getElementById('btn-import-atg-do');
const btnImportAtgCancel = document.getElementById('btn-import-atg-cancel');

const importAtgPreset  = document.getElementById('import-atg-preset');
const importAtgSaveName = document.getElementById('import-atg-save-name');
const btnImportAtgSave  = document.getElementById('btn-import-atg-save');

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function applyDateToTemplate(templateUrl) {
  return String(templateUrl).replace('{DATE}', todayYYYYMMDD());
}

async function refreshAtgPresetDropdown() {
  if (!importAtgPreset) return;
  const links = await getAtgLinks();
  importAtgPreset.innerHTML = '<option value="">— Välj —</option>';
  links.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l._id;
    opt.textContent = l.name;
    opt.dataset.templateUrl = l.templateUrl;
    importAtgPreset.appendChild(opt);
  });
}

if (btnOpenImportAtg && importAtgPanel) {
  btnOpenImportAtg.addEventListener('click', async () => {
    // ✅ RÄTT: panelen styrs av hidden-attribut (inte class "hidden")
    importAtgPanel.hidden = false;
    if (importAtgUrl) importAtgUrl.value = '';

    // ✅ Ladda presets från DB när panelen öppnas
    try {
      await refreshAtgPresetDropdown();
    } catch (e) {
      console.error(e);
      alert('Kunde inte ladda sparade ATG-länkar');
    }
  });
}

if (importAtgPreset && importAtgUrl) {
  importAtgPreset.addEventListener('change', () => {
    const opt = importAtgPreset.selectedOptions[0];
    if (!opt || !opt.dataset.templateUrl) return;
    importAtgUrl.value = applyGameDateToAtgUrl(opt.dataset.templateUrl);

    if (importAtgSaveName) importAtgSaveName.value = opt.textContent || '';
  });
}

if (btnImportAtgSave && importAtgSaveName && importAtgUrl) {
  btnImportAtgSave.addEventListener('click', async () => {
    const name = (importAtgSaveName.value || '').trim();
    const url  = (importAtgUrl.value || '').trim();
    if (!name) return alert('Skriv ett namn.');
    if (!url)  return alert('Klistra in en ATG-länk.');

    // Gör om url till templateUrl med {DATE}
    const templateUrl = url.replace(/_\d{4}-\d{2}-\d{2}_/g, '_{DATE}_');
    if (!templateUrl.includes('{DATE}')) {
      return alert('Länken måste innehålla datum i format _YYYY-MM-DD_.');
    }

    await saveAtgLink({ name, templateUrl });
    await refreshAtgPresetDropdown();
    alert('Sparad!');
  });
}

if (btnImportAtgCancel && importAtgPanel) {
  btnImportAtgCancel.addEventListener('click', () => {
    importAtgPanel.hidden = true;
  });
}

if (btnImportAtgDo) {
  btnImportAtgDo.addEventListener('click', async () => {
    const rawUrl = (importAtgUrl?.value || '').trim();
    if (!rawUrl) return alert('Klistra in en ATG-länk.');

    // ✅ Viktigt: tvinga alltid spelets datum i länken
    const url = applyGameDateToAtgUrl(rawUrl);

    try {
      const created = await importAtgCoupon(currentGameId, url, getNewCouponStatus());
      if (!created || !created.selections || !created.selections.length) {
        throw new Error('Importen gav ingen kupong.');
      }
      created.source = 'atg';
      coupons.push(created);
      renderCouponList();
      renderCurrentDivision();
      // Rensa Min kupong efter sparning
      try { document.getElementById('btn-clear-idea')?.click(); } catch (e) {}
      if (importAtgPanel) importAtgPanel.hidden = true;
    } catch (e) {
      console.error(e);
      alert(e.message || 'Import misslyckades');
    }
  });
}

// --- KListra kupong ---
const btnOpenPasteCoupon = document.getElementById('btn-open-paste-coupon');
const pasteCouponPanel = document.getElementById('paste-coupon-panel');
const pasteCouponText = document.getElementById('paste-coupon-text');
const btnPasteCouponCreate = document.getElementById('btn-paste-coupon-create');
const btnPasteCouponCancel = document.getElementById('btn-paste-coupon-cancel');

if (btnOpenPasteCoupon && pasteCouponPanel) {
  btnOpenPasteCoupon.addEventListener('click', () => {
    pasteCouponPanel.hidden = false;
    if (pasteCouponText) pasteCouponText.value = '';
  });
}

if (btnPasteCouponCancel && pasteCouponPanel) {
  btnPasteCouponCancel.addEventListener('click', () => {
    pasteCouponPanel.hidden = true;
  });
}

if (btnPasteCouponCreate) {
  btnPasteCouponCreate.addEventListener('click', async () => {
    const raw = (pasteCouponText?.value || '').trim();
    if (!raw) return alert('Klistra in kupongtext först.');

    let parsed;
    try {
      parsed = parsePastedCouponText(raw);
    } catch (e) {
      console.error(e);
      return alert(e.message || 'Kunde inte tolka kupongtexten.');
    }

    try {
      const created = await createCoupon(currentGameId, {
        status: getNewCouponStatus(),
        name: parsed.name,
        selections: parsed.selections,
        source: 'paste',
        stakeLevel: 'original'
      });

      coupons.push(created);
      renderCouponList();
      renderCurrentDivision();

      if (pasteCouponPanel) pasteCouponPanel.hidden = true;
    } catch (e) {
      console.error(e);
      alert(e.message || 'Kunde inte skapa kupongen.');
    }
  });
}


// --- Hjälpfunktioner för sliders i omvänd-panelen ---


function syncReversePriceFromSlider() {
  if (!reversePriceSlider || !reversePriceInput || !reversePriceDisplay) return;

  const idx = Number(reversePriceSlider.value || 0);
  const preset = REVERSE_PRICE_PRESETS[idx] ?? 1;

  if (preset === 'egen') {
    reversePriceDisplay.textContent = 'Eget pris';
    reversePriceInput.disabled = false;
    // lämna värdet användaren skriver
  } else {
    reversePriceDisplay.textContent = `${preset} kr`;
    reversePriceInput.value = String(preset);
    reversePriceInput.disabled = true;
  }
}

function syncReverseSpikesDisplay() {
  if (reverseSpikesDisplay && reverseSpikesInput) {
    reverseSpikesDisplay.textContent = reverseSpikesInput.value || '0';
  }
}

function syncReverseSupersDisplay() {
  if (reverseSupersDisplay && reverseSupersInput) {
    reverseSupersDisplay.textContent = reverseSupersInput.value || '0';
  }
}

// Koppla event
if (reversePriceSlider) {
  reversePriceSlider.addEventListener('input', syncReversePriceFromSlider);
  syncReversePriceFromSlider(); // init
}
if (reverseSpikesInput) {
  reverseSpikesInput.addEventListener('input', syncReverseSpikesDisplay);
  syncReverseSpikesDisplay();
}
if (reverseSupersInput) {
  reverseSupersInput.addEventListener('input', syncReverseSupersDisplay);
  syncReverseSupersDisplay();
}


function handleSplitInputsChanged() {
  updateSplitPatternSuggestions({
    spikes: Number(splitSpikesInput.value || 0),
    maxPrice: Number(splitMaxPriceInput.value || 0),
    suggestionsBox: splitSuggestionsBox,
  });
}

if (splitSpikesInput && splitMaxPriceInput && splitSuggestionsBox) {
  splitSpikesInput.addEventListener('input', handleSplitInputsChanged);
  splitMaxPriceInput.addEventListener('input', handleSplitInputsChanged);
}


  if (!btnAdd || !panel || !builder || !btnSave || !btnCancel) return;

  btnAdd.onclick = () => {
    if (isBuildingCoupon) return;
    isBuildingCoupon = true;
    couponSelections = {};
    panel.hidden = false;
    buildCouponBuilderUI(builder);
  };

  btnCancel.onclick = () => {
    isBuildingCoupon = false;
    panel.hidden = true;
    builder.innerHTML = '';
  };

  btnSave.onclick = async () => {
    try {
      const payload = buildCouponPayload();
      payload.status = getNewCouponStatus();
      const newCoupon = await createCoupon(currentGameId, payload);
      coupons.push(newCoupon);
      renderCouponList();
renderCurrentDivision(); // 🔹 uppdatera populärfältet
      isBuildingCoupon = false;
      panel.hidden = true;
      builder.innerHTML = '';
    } catch (err) {
      console.error(err);
      alert(err.message || 'Kunde inte spara kupongen.');
    }
  };

  // --- Split kupong: öppna/stäng panelen ---
  if (btnOpenSplit && splitPanel) {
    btnOpenSplit.addEventListener('click', () => {
      if (!currentGameId) {
        alert('Öppna ett spel först innan du splittar kuponger.');
        return;
      }

      // rimliga defaultvärden
      splitNameInput.value = 'Split';
      splitCountInput.value = '2';
      splitMaxPriceInput.value = '70';
      splitSpikesInput.value = '2';

      splitPanel.hidden = false;
    });
  }
  // --- chance ---
if (chanceLevelInput && chanceLevelDisplay) {
  const syncChanceLevel = () => {
    chanceLevelDisplay.textContent = String(chanceLevelInput.value || '1');
  };
  chanceLevelInput.addEventListener('input', syncChanceLevel);
  syncChanceLevel();
}

if (chanceSpikesInput && chanceSpikesDisplay) {
  const syncChanceSpikes = () => {
    chanceSpikesDisplay.textContent = String(chanceSpikesInput.value || '0');
  };
  chanceSpikesInput.addEventListener('input', syncChanceSpikes);
  syncChanceSpikes();
}



if (btnOpenChance && chancePanel) {
  btnOpenChance.addEventListener('click', () => {
    if (!currentGameId) {
      alert('Öppna ett spel först innan du skapar Chans kupong.');
      return;
    }
    chanceNameInput.value = 'Chans';
    chanceCountInput.value = '2';
    chanceMaxPriceInput.value = '100';
    chanceLevelInput.value = '4';
    if (chanceLevelDisplay) chanceLevelDisplay.textContent = '4';
    if (chancePreferUnplayedInput) chancePreferUnplayedInput.checked = true;
    if (chanceSpikesInput) chanceSpikesInput.value = '2';
if (chanceSpikesDisplay) chanceSpikesDisplay.textContent = '2';
    chancePanel.hidden = false;
  });
}

if (btnChanceCancel && chancePanel) {
  btnChanceCancel.addEventListener('click', () => {
    chancePanel.hidden = true;
  });
}

// ---- Bästa raden panel toggles ----
if (btnOpenBestRow && bestRowPanel) {
  btnOpenBestRow.onclick = () => {
    if (!currentGameId) {
      alert('Öppna ett spel först innan du räknar ut bästa raden.');
      return;
    }
    // Default-värden
    const radPris = getEffectiveRadPris();
    if (bestRowMaxPriceInput && (!bestRowMaxPriceInput.value || Number(bestRowMaxPriceInput.value) <= 0)) {
      bestRowMaxPriceInput.value = String(Math.round(200));
    }
    bestRowPanel.hidden = false;
  };
}

if (btnCloseBestRow && bestRowPanel) {
  btnCloseBestRow.onclick = () => {
    bestRowPanel.hidden = true;
  };
}

if (btnGenerateBestRows) {
  btnGenerateBestRows.onclick = () => {
    const maxPrice = Number(bestRowMaxPriceInput?.value || 200);
    const maxPerDiv = Number(bestRowMaxPerDivisionInput?.value || 6);
    const suggestions = computeBestRows({ maxPriceKr: maxPrice, count: 5, maxPerDivision: maxPerDiv });
    renderBestRowSuggestions(suggestions);
  };
}

const bestRowResultsEl = document.getElementById("best-row-results");
if (bestRowResultsEl) {
  bestRowResultsEl.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.(".btn-create-best-row");
    if (!btn) return;
    try {
      const ksAttr = btn.getAttribute("data-ks") || "";
      const ks = ksAttr ? JSON.parse(decodeURIComponent(ksAttr)) : null;
      const idx = Number(btn.getAttribute("data-idx") || 0);
      await handleCreateBestRowCoupon(ks, idx);
    } catch (e) {
      console.error("Bad best-row payload", e);
      showToast("Kunde inte skapa kupong", "error");
    }
  });
}




// ---- Jackpot panel toggles ----
if (btnOpenJackpot && jackpotPanel) {
  btnOpenJackpot.onclick = () => {
    if (!currentGameId) {
      alert('Öppna ett spel först innan du skapar Jackpot kupong.');
      return;
    }
    if (jackpotNameInput) jackpotNameInput.value = 'Jackpot';
    if (jackpotCountInput) jackpotCountInput.value = '1';
    if (jackpotMaxPriceInput) jackpotMaxPriceInput.value = '200';
    if (jackpotSpikesInput) jackpotSpikesInput.value = '0';
    jackpotPanel.hidden = false;
  };
}

if (btnJackpotCancel && jackpotPanel) {
  btnJackpotCancel.onclick = () => {
    jackpotPanel.hidden = true;
  };
}

if (btnJackpotDo) {
  btnJackpotDo.onclick = async () => {
    const baseName = (jackpotNameInput?.value || '').trim() || 'Jackpot';
    const count = Math.max(1, Number(jackpotCountInput?.value) || 1);
    const maxPrice = Math.max(1, Number(jackpotMaxPriceInput?.value) || 1);
    const spikesWanted = Math.max(0, Number(jackpotSpikesInput?.value) || 0);

    try {
      await createJackpotCoupons({ baseName, count, maxPrice, spikesWanted });
      jackpotPanel.hidden = true;
    } catch (e) {
      console.error(e);
      alert('Kunde inte skapa jackpot kupong.');
    }
  };
}

if (btnChanceDo && chancePanel) {
  btnChanceDo.addEventListener('click', async () => {
    const baseName = (chanceNameInput.value || '').trim() || 'Chans';
    const count = Math.max(1, Number(chanceCountInput.value) || 1);
    const maxPrice = Math.max(1, Number(chanceMaxPriceInput.value) || 1);
    const level = Math.max(1, Math.min(5, Number(chanceLevelInput.value) || 1));
 const preferUnplayed = !!(chancePreferUnplayedInput && chancePreferUnplayedInput.checked);
const includeSecondFav = !!(chanceIncludeSecondFavInput && chanceIncludeSecondFavInput.checked);
const spikesWanted = Math.max(0, Number(chanceSpikesInput?.value || 0));


try {
  await createChanceCoupons({
    baseName,
    count,
    maxPrice,
    level,
    preferUnplayed,
    includeSecondFav, 
    spikesWanted, 
  });

      chancePanel.hidden = true;
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Kunde inte skapa chans-kuponger.');
    }
  });
}

if (btnFillDo) {
  btnFillDo.addEventListener('click', async () => {
    if (!selectedFillCoupon) return alert('Välj först en kupong att fylla på.');

    const targetPrice = Math.max(1, Number(fillPriceEl?.value || 0));
    const count = Math.max(1, Number(fillCountEl?.value || 1));
    const spikesWanted = Math.max(0, Number(fillSpikesEl?.value || 0));
    const step = Math.max(1, Math.min(7, Number(fillProfileEl?.value || 1)));

    try {
      await createFilledCouponsFromBase({
        baseCoupon: selectedFillCoupon,
        targetPrice,
        count,
        spikesWanted,
        step
      });

      // stäng läget
      exitFillMode();
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Kunde inte skapa fyllda kuponger.');
    }
  });
}


  // --- Omvänd kupong: slå på/av läget ---
 if (btnOpenReverse && reversePanel) {
  btnOpenReverse.addEventListener('click', () => {
    if (!currentGameId) {
      alert('Öppna ett spel först innan du skapar omvänd kupong.');
      return;
    }

    if (!coupons.length) {
      alert('Det finns inga kuponger att utgå ifrån.');
      return;
    }

    // toggla läget
    reverseMode = !reverseMode;
    selectedReverseCoupon = null;

    if (!reverseMode) {
      // stäng läget
      if (reversePanelEl) {
        reversePanelEl.hidden = true;
        reversePanelEl.classList.remove('open');
      }
      document.body.classList.remove('reverse-mode-active');
      document
        .querySelectorAll('.coupon-card.selected-for-reverse')
        .forEach((c) => c.classList.remove('selected-for-reverse'));
    } else {
      // slå på läget
      if (reversePanelEl) {
        reversePanelEl.hidden = true;
        reversePanelEl.classList.remove('open');
      }
      document.body.classList.add('reverse-mode-active');
    }

    // uppdatera kupongkorten (selectable-klass etc.)
    renderCouponList();
  });
}


  // Avbryt i panelen för omvänd kupong
  if (btnReverseCancel && reversePanel) {
    btnReverseCancel.addEventListener('click', () => {
      reverseMode = false;
      selectedReverseCoupon = null;

      if (reversePanelEl) {
        reversePanelEl.hidden = true;
        reversePanelEl.classList.remove('open');
      }

      document.body.classList.remove('reverse-mode-active');
      renderCouponList();
    });
  }










 if (btnReverseCreate && reversePanel) {
  btnReverseCreate.addEventListener('click', async () => {
    if (!selectedReverseCoupon || !currentGameId) return;

    const base = selectedReverseCoupon;

    // --- 1. Läs inställningar från formuläret ---
    const basePriceInfo = computeCouponPrice(base);
    const baseTotal = basePriceInfo.total;

    const desiredTotalInput = reversePriceInputEl.value.trim();
    const desiredTotalParsed = Number(
      desiredTotalInput.replace(',', '.')
    );
    const desiredTotal =
      !Number.isFinite(desiredTotalParsed) || desiredTotalParsed <= 0
        ? baseTotal
        : desiredTotalParsed;

    const desiredSpikesParsed = Number(reverseSpikesInputEl.value || '');
    let targetSpikeCount = Number.isFinite(desiredSpikesParsed)
      ? Math.max(0, desiredSpikesParsed)
      : 0;

    const desiredSupersParsed = Number(
      reverseSupersInputEl ? reverseSupersInputEl.value || '' : '0'
    );
    const targetSuperskrall = Number.isFinite(desiredSupersParsed)
      ? Math.max(0, desiredSupersParsed)
      : 0;

    // --- 2. Kopiera originalselektionerna ---
    const selections = (base.selections || []).map((sel) => ({
      divisionIndex: sel.divisionIndex,
      horses: Array.from(sel.horses || []),
    }));
    if (!selections.length) return;

    const selByDiv = new Map(
      selections.map((sel) => [sel.divisionIndex, sel])
    );

    // --- 3. Originalspikar & icke-spik-avdelningar ---
    const originalSpikeDivSet = new Set();
    const nonSpikeDivs = [];

    selections.forEach((sel) => {
      const divIndex = sel.divisionIndex;
      const len = (sel.horses || []).length;
      if (len === 1) {
        originalSpikeDivSet.add(divIndex);
      } else if (len > 1) {
        nonSpikeDivs.push(divIndex);
      }
    });

    // vi kan bara ha spikar i avdelningar som inte var spik innan
    targetSpikeCount = Math.min(targetSpikeCount, nonSpikeDivs.length);

      // --- 4. Välj vilka avdelningar som ska bli nya spikar (bland icke-spik) ---
    //       Prioritera avdelningar där favoriten har ≥ 35%
    const strongCandidates = [];
    const weakCandidates = [];

    nonSpikeDivs.forEach((divIndex) => {
      const favNum = getDivisionFavouriteNumber
        ? getDivisionFavouriteNumber(divIndex)
        : null;
      let favPercent = 0;
      if (favNum != null && typeof getHorsePercent === 'function') {
        const p = getHorsePercent(divIndex, favNum);
        if (Number.isFinite(p)) favPercent = p;
      }
      if (favPercent >= 35) {
        strongCandidates.push(divIndex);
      } else {
        weakCandidates.push(divIndex);
      }
    });

    // slumpa inom respektive grupp
    const shuffleInPlace = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    shuffleInPlace(strongCandidates);
    shuffleInPlace(weakCandidates);

    const orderedDivs = strongCandidates.concat(weakCandidates);
    const newSpikeDivs = new Set(
      orderedDivs.slice(0, targetSpikeCount)
    );


    // --- 5. Bygg upp strukturen:
    //  - Nya spikar: bara favoriten
    //  - Gamla spikar: se till att de INTE är spik längre (lägg till en extra häst)
    selections.forEach((sel) => {
      const divIndex = sel.divisionIndex;
      const fav = getDivisionFavouriteNumber(divIndex);
      if (!fav) return;

      const horses = new Set(sel.horses || []);

      if (newSpikeDivs.has(divIndex)) {
        // ny spik-avdelning → bara favoriten
        sel.horses = [fav];
      } else {
        // inte spik i omvänd kupong
        // om det var spik i originalet: lägg till en extra häst så att det inte är spik längre
        if (originalSpikeDivSet.has(divIndex) && horses.size === 1) {
          const sorted = getDivisionHorsesSortedByPercent(divIndex);
          for (const h of sorted) {
            if (!horses.has(h.number)) {
              horses.add(h.number);
              break;
            }
          }
        }
        sel.horses = Array.from(horses).sort((a, b) => a - b);
      }
    });

    // --- 6. Favoriten måste finnas med i varje avdelning ---
    ensureFavouriteInEachDivision(selections);

    // --- 7. Superskrällar: exakt targetSuperskrall totalt ---
    enforceSuperskrallCount(selections, newSpikeDivs, targetSuperskrall);

    // --- 8. (Valfritt, enkel tuning uppåt mot önskat pris) ---
    const radPris = getEffectiveRadPrisForCoupon(base);
    const rowsNow = computeCouponPrice({ selections, stakeLevel: base.stakeLevel }).rows;
    let totalNow = rowsNow * radPris;

    let guard = 0;
    while (totalNow < desiredTotal && guard < 50) {
      guard++;

      // försök lägga till en högprocentare i en icke-spik-avdelning
      let changed = false;
      for (const sel of selections) {
        const divIndex = sel.divisionIndex;
        if (newSpikeDivs.has(divIndex)) continue; // rör inte spikarna
        const horses = new Set(sel.horses || []);
        const sorted = getDivisionHorsesSortedByPercent(divIndex);
        for (const h of sorted) {
          const num = h.number;
          if (horses.has(num)) continue;
          if (isSuperskrall(divIndex, num)) continue; // lägg inte fler superskrällar här
          horses.add(num);
          sel.horses = Array.from(horses).sort((a, b) => a - b);
          changed = true;
          break;
        }
        if (changed) break;
      }

      if (!changed) break;

      const info = computeCouponPrice({ selections, stakeLevel: base.stakeLevel });
      totalNow = info.total;
    }

    // --- 9. Namn + payload ---
    let name =
      reverseNameInputEl.value.trim() ||
      `Omvänd ${base.name || 'Kupong'}`;
    name = ensureUniqueCouponName(name);
    reverseNameInputEl.value = name;

    const payload = {
      status: getNewCouponStatus(),
      name,
      source: 'reverse',
      stakeLevel: base.stakeLevel || 'original',
      selections: selections.map((sel) => ({
        divisionIndex: sel.divisionIndex,
        horses: Array.from(sel.horses || []).sort((a, b) => a - b),
      })),
    };

    try {
      const saved = await createCoupon(currentGameId, payload);
      saved.source = 'reverse';
      coupons.push(saved);
      renderCouponList();
      renderCurrentDivision();

      reverseMode = false;
      selectedReverseCoupon = null;
      document.body.classList.remove('reverse-mode-active');
      if (reversePanelEl) {
        reversePanelEl.hidden = true;
        reversePanelEl.classList.remove('open');
      }
    } catch (err) {
      console.error('Failed to create reverse coupon', err);
    }
  });
}


 if (btnSplitDo && splitPanel) {
  btnSplitDo.addEventListener('click', async () => {
    const baseName = (splitNameInput.value || '').trim() || 'Split';
    const count = Math.max(1, Number(splitCountInput.value) || 1);
    const maxPrice = Math.max(1, Number(splitMaxPriceInput.value) || 1);
    const spikesPerCoupon = Math.max(0, Number(splitSpikesInput.value) || 0);

    const patternStr =
      (document.getElementById('split-pattern')?.value || '').trim();

    const supersInput = document.getElementById('split-supers');
    const supersPerCoupon = supersInput ? Number(supersInput.value) || 0 : 0;

    // 🔹 NYTT: läs om vi ska bygga från populärfält (kuponger) eller V85
    const usePopular =
      splitUsePopularInput ? !!splitUsePopularInput.checked : true;

    try {
      await createSplitCouponsFromExisting({
        baseName,
        count,
        maxPrice,
        spikesPerCoupon,
        patternStr,
        supersPerCoupon,
        usePopular,            // <– NYTT
      });
      splitPanel.hidden = true;
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Kunde inte skapa split-kuponger.');
    }
  });
}


}


// Hjälpare: klona selections (djup kopia)
function cloneSelectionsForReverse(selections) {
  return selections.map((sel) => ({
    divisionIndex: sel.divisionIndex,
    horses: Array.isArray(sel.horses) ? [...sel.horses] : [],
  }));
}

// Hjälpare: räkna rader baserat på selections + divisions
function calcRowsFromSelections(selections) {
  if (!divisions || !divisions.length) return 0;

  const countsByIndex = {};
  selections.forEach((sel) => {
    countsByIndex[sel.divisionIndex] = (sel.horses || []).length;
  });

  const counts = divisions.map((div) => {
    const idx = div.index ?? 0;
    return countsByIndex[idx] || 0;
  });

  const hasAny = counts.some((c) => c > 0);
  if (!hasAny) return 0;

  const countsForProduct = counts.map((c) => (c === 0 ? 1 : c));
  return countsForProduct.reduce((p, c) => p * c, 1);
}

// Slumpa om en array (Fisher–Yates)
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Hjälpare: välj slumpmässigt element från en lista
function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

// Lägg till en slumpad häst i någon avdelning som fortfarande har kandidater kvar
function addRandomHorseSomewhere(selections, opts = {}) {
  if (!divisions.length) return false;

  const blockedDivSet = opts.blockedDivSet instanceof Set ? opts.blockedDivSet : null;

  // Bygg lookup: divisionIndex -> selection
  const selByIndex = {};
  selections.forEach((sel) => {
    selByIndex[sel.divisionIndex] = sel;
  });

  // Lista möjliga avdelningar där det finns fler hästar att lägga till
  const candidateDivisions = divisions.filter((division) => {
    const divIndex = division.index ?? 0;
    if (blockedDivSet && blockedDivSet.has(Number(divIndex))) return false;
    const sel = selByIndex[divIndex];
    const already = new Set(sel?.horses || []);
    const allHorses = (division.horses || []).filter((h) => !h.scratched);
    const stillPossible = allHorses.some(
      (h) => !already.has(Number(h.number || h.nr || h.horseNumber || 0))
    );
    return stillPossible;
  });

  if (!candidateDivisions.length) return false;

  // Välj en slumpad avdelning
  const targetDiv = pickRandom(candidateDivisions);
  const divIndex = targetDiv.index ?? 0;
  let sel = selByIndex[divIndex];
  if (!sel) {
    sel = { divisionIndex: divIndex, horses: [] };
    selections.push(sel);
    selByIndex[divIndex] = sel;
  }

  const already = new Set(sel.horses || []);
  const allHorses = (targetDiv.horses || []).filter((h) => !h.scratched);

  // Sortera efter V85% men med lite random i toppen,
  // så att det inte blir exakt samma kombination varje gång
  const mainPercentIdx = getMainPercentIndex(headerColumns);
  const enriched = allHorses
    .map((h) => {
      const cols = parseLineColumns(h.rawLine || '');
      const pStr = cols[mainPercentIdx] || '0';
      const p = parseFloat(String(pStr).replace('%', '').replace(',', '.')) || 0;
      return { h, p };
    })
    .filter(({ h }) => !already.has(Number(h.number || h.nr || h.horseNumber || 0)));

  if (!enriched.length) return false;

  enriched.sort((a, b) => b.p - a.p);

  // Ta top 3–5 favoriter och välj en slumpmässigt därifrån
  const topN = Math.min(5, enriched.length);
  const topCandidates = enriched.slice(0, topN);
  const chosen = pickRandom(topCandidates);
  const num = Number(chosen.h.number || chosen.h.nr || chosen.h.horseNumber || 0);
  if (!sel.horses.includes(num)) sel.horses.push(num);

  // sortera hästnumren snyggt
  sel.horses.sort((a, b) => a - b);
  return true;
}

// Ta bort EN slumpad häst från någon avdelning som har fler än 1 häst
function removeRandomHorseSomewhere(selections) {
  if (!selections.length) return false;

  // Vi vill aldrig ta bort själva favoriten i en avdelning
  const removable = selections.filter((sel) => {
    const horses = sel.horses || [];
    if (horses.length <= 1) return false;

    const fav =
      typeof getDivisionFavouriteNumber === 'function'
        ? getDivisionFavouriteNumber(sel.divisionIndex)
        : null;

    // det måste finnas minst en icke-favorit att ta bort
    return fav == null || horses.some((h) => h !== fav);
  });

  if (!removable.length) return false;

  const sel = pickRandom(removable);
  const fav =
    typeof getDivisionFavouriteNumber === 'function'
      ? getDivisionFavouriteNumber(sel.divisionIndex)
      : null;

  const candidateIdx = sel.horses
    .map((h, idx) => ({ h, idx }))
    .filter(({ h }) => fav == null || h !== fav);

  if (!candidateIdx.length) return false;

  const picked = pickRandom(candidateIdx);
  sel.horses.splice(picked.idx, 1);
  return true;
}


// 🔹 NY: finjustera så att priset på omvänd kupong hamnar nära önskat pris
//   - går inte över desiredTotal + 10 kr
//   - försöker hålla sig inom ±10 kr
function tuneReverseSelectionsToPrice(
  selections,
  desiredTotal,
  radPris,
  tolerance = 10,
  maxIterations = 250

) {
  if (!Array.isArray(selections) || !selections.length) return;
  if (!radPris || radPris <= 0) return;

  const best = {
    selections: cloneSelectionsForReverse(selections),
    total: calcRowsFromSelections(selections) * radPris,
  };

  function tryUpdateBest(currSelections) {
    const rows = calcRowsFromSelections(currSelections);
    const total = rows * radPris;
    if (!rows) return;
    if (total > desiredTotal + tolerance) return; // för dyrt → kasta

    if (
      Math.abs(total - desiredTotal) <
      Math.abs(best.total - desiredTotal)
    ) {
      best.total = total;
      best.selections = cloneSelectionsForReverse(currSelections);
    }
  }

  for (let i = 0; i < maxIterations; i++) {
    const rows = calcRowsFromSelections(selections);
    const total = rows * radPris;

    tryUpdateBest(selections);

    // redan inom tolerans → klart
    if (Math.abs(total - desiredTotal) <= tolerance) {
      break;
    }

    if (total < desiredTotal - tolerance) {
      // för billigt → lägg till hästar (ökar rader)
      if (!addRandomHorseSomewhere(selections)) break;
    } else if (total > desiredTotal + tolerance) {
      // för dyrt → ta bort hästar (minskar rader)
      if (!removeRandomHorseSomewhere(selections)) break;
    } else {
      break;
    }
  }

  // Lägg tillbaka bästa varianten vi hittade
  selections.length = 0;
  best.selections.forEach((sel) => selections.push(sel));
}






function initSaveIdeaCouponButton() {
  const btn = document.getElementById('btn-save-idea-coupon');
  if (!btn) return;

  // sätt korrekt label vid init
  setIdeaEditingState(null);

  btn.addEventListener('click', async () => {
    if (!currentGameId) return alert('Öppna ett spel först.');

    const payload = buildCouponPayloadFromIdea();
    if (!payload.selections.length) {
      alert('Du måste välja minst en häst i något lopp för att spara kupongen.');
      return;
    }

    // default-namn
    const existingIdeaCount = coupons.filter((c) => c.source === 'idea').length;
    const defaultName = editingIdeaCouponId
      ? (editingIdeaCouponName || `Min kupong ${existingIdeaCount + 1}`)
      : `Min kupong ${existingIdeaCount + 1}`;

    const nameInput = prompt('Ange namn på kupongen:', defaultName);
    if (nameInput === null) return;
    const name = nameInput.trim() || defaultName;

    // bygg body
    const body = {
      ...payload,
      source: 'idea',
      name,
    };

    const up = String(game?.gameType || '').toUpperCase();
    if (up === 'V85') {
      body.stakeLevel = stakeLevel;
    }

    try {
      if (editingIdeaCouponId) {
        const ok = window.confirm(
          `Du redigerar \"${editingIdeaCouponName || 'Min kupong'}\".\n\nOK = Uppdatera befintlig kupong\nAvbryt = Skapa en ny`
        );

        if (ok) {
          // behåll kupongens status om möjligt
          body.status = editingIdeaCouponStatus || getNewCouponStatus();

          const updated = await updateCouponContent(currentGameId, editingIdeaCouponId, body);

          const idx = coupons.findIndex((c) => String(c._id) === String(editingIdeaCouponId));
          if (idx >= 0) coupons[idx] = updated;

          setIdeaEditingState(null);
          renderCouponList();
          renderCurrentDivision();
          // Rensa Min kupong efter sparning
          try { document.getElementById('btn-clear-idea')?.click(); } catch (e) {}
          return;
        }

        // skapa ny istället
        setIdeaEditingState(null);
      }

      body.status = getNewCouponStatus();
      const newCoupon = await createCoupon(currentGameId, body);
      coupons.push(newCoupon);
      renderCouponList();
      renderCurrentDivision();
    } catch (err) {
      console.error(err);
      alert('Kunde inte spara kupongen.');
    }
  });
}

function initClearIdeaButton() {
  const btn = document.getElementById('btn-clear-idea');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!divisions.length) return;

    // Finns det ens något att rensa?
    const anySelected = Object.values(selectedIdeaNumbersByDivIndex || {}).some(
      (set) => set && set.size > 0
    );
    if (!anySelected) return;

    const ok = window.confirm(
      'Vill du rensa alla markeringar i idéfältet för ALLA avdelningar i detta spel?'
    );
    if (!ok) return;

    setIdeaEditingState(null);

    // 1) Töm ALLA avdelningars idé-val
    Object.keys(selectedIdeaNumbersByDivIndex).forEach((key) => {
      selectedIdeaNumbersByDivIndex[key] = new Set();
    });

    // 2) Ta bort markeringsklass i nuvarande högerspalt
    const ideaList = document.getElementById('idea-number-list');
    if (ideaList) {
      ideaList
        .querySelectorAll('.num-square.selected')
        .forEach((el) => el.classList.remove('selected'));
    }

    // 3) Sätt markeringar i Totalen till 0 för alla avdelningar
    divisions.forEach((_, idx) => {
      updateDivisionCount(idx, 0);
    });

    // 4) Spara + räkna om priset (nu blir det 0 rader)
    saveIdeaSelections();
    computeAndRenderPrice();
  });
}


function buildCouponBuilderUI(builder) {
  builder.innerHTML = '';

  divisions.forEach((div) => {
    const divIndex = div.index ?? 0;
    const row = document.createElement('div');
    row.className = 'coupon-division-row';

    const label = document.createElement('div');
    label.className = 'coupon-division-label';
    label.textContent = `Avd ${divIndex}`;
    row.appendChild(label);

    const numRow = document.createElement('div');
    numRow.className = 'coupon-number-row';

    // alla icke-strukna hästar i denna avdelning
    const horses = (div.horses || [])
      .filter((h) => !h.scratched)
      .map((h) => h.number)
      .filter((n) => typeof n === 'number')
      .sort((a, b) => a - b);

    horses.forEach((num) => {
      const btn = document.createElement('div');
      btn.className = 'coupon-number';
      btn.textContent = num;

      const key = String(divIndex);
      if (!couponSelections[key]) couponSelections[key] = new Set();

      btn.addEventListener('click', () => {
        const set = couponSelections[key];
        if (set.has(num)) {
          set.delete(num);
          btn.classList.remove('selected');
        } else {
          set.add(num);
          btn.classList.add('selected');
        }
      });

      numRow.appendChild(btn);
    });

    row.appendChild(numRow);
    builder.appendChild(row);
  });
}

function buildCouponPayload() {
  const selections = [];

  divisions.forEach((div) => {
    const divIndex = div.index ?? 0;
    const key = String(divIndex);
    const set = couponSelections[key];

    if (set && set.size > 0) {
      selections.push({
        divisionIndex: divIndex,
        horses: Array.from(set).sort((a, b) => a - b),
      });
    }
  });

  return { selections };
}

// Tolkar "1x1x2x3" -> [1,1,2,3]. Returnerar null om det inte matchar antalet avdelningar.
function parseSplitPattern(patternStr, divisionCount) {
  if (!patternStr) return null;

  const parts = patternStr
    .split('x')
    .map((p) => Number(p.trim()))
    .filter((n) => !Number.isNaN(n) && n >= 0);

  if (!parts.length) return null;
  if (parts.length !== divisionCount) {
    // Om det inte finns ett tal per avdelning ignorerar vi mönstret
    return null;
  }
  return parts;
}

function isSuperSkrall(divisionIndex, horseNumber) {
  const mainIdx = getMainPercentIndex();
  if (mainIdx === -1) return false;

  const division = divisions.find(
    (d) => (d.index ?? 0) === divisionIndex
  );
  if (!division || !division.horses) return false;

  const horse = division.horses.find((h) => h.number === horseNumber);
  if (!horse || !horse.rawLine) return false;

  const cols = parseLineColumns(horse.rawLine);
  const val = cols[mainIdx];
  if (!val) return false;

  const m = String(val).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return false;

  const pct = parseFloat(m[1].replace(',', '.'));
  return pct < 5; // < 5% = superskräll
}

function getDivisionFavourite(divisionIndex) {
  const mainIdx = getMainPercentIndex();
  if (mainIdx === -1) return null;

  const division = divisions.find(
    (d) => (d.index ?? 0) === divisionIndex
  );
  if (!division || !division.horses) return null;

  let bestNum = null;
  let bestPct = -1;

  for (const horse of division.horses) {
    if (!horse || horse.scratched || !horse.rawLine) continue;
    const cols = parseLineColumns(horse.rawLine);
    const val = cols[mainIdx];
    if (!val) continue;

    const m = String(val).match(/(\d+(?:[.,]\d+)?)/);
    if (!m) continue;

    const pct = parseFloat(m[1].replace(',', '.'));
    if (!Number.isNaN(pct) && pct > bestPct) {
      bestPct = pct;
      bestNum = horse.number;
    }
  }

  return bestNum;
}

// ----- Hjälpare för Omvänd kupong -----

// Global statistik: hur ofta hästar spelats / spikats i inlagda kuponger
function buildGlobalSpikeStatsForReverse() {
  const stats = {};
  if (!coupons || !coupons.length) return stats;

  getActiveCoupons().forEach((coupon) => {

    // Vi vill jämföra mot “vanliga” kuponger, inte split/omvänd
    if (coupon.source === 'split' || coupon.source === 'reverse') return;

    (coupon.selections || []).forEach((sel) => {
      const divIndex = sel.divisionIndex;
      if (divIndex == null) return;

      const horses = sel.horses || [];
      const isSpike = horses.length === 1;

      horses.forEach((num) => {
        const perDiv = (stats[divIndex] ||= {});
        const key = String(num);
        const rec = (perDiv[key] ||= { count: 0, spikes: 0 });
        rec.count += 1;
        if (isSpike) rec.spikes += 1;
      });
    });
  });

  return stats;
}

// Plocka ut V85% (eller motsvarande huvud-procentkolumn) för en specifik häst
function getHorseMainPercent(divisionIndex, horseNumber) {
  const mainIdx = getMainPercentIndex();
  if (mainIdx === -1) return null;

  const division = divisions.find(
    (d) => (d.index ?? 0) === divisionIndex
  );
  if (!division || !division.horses) return null;

  const horse = division.horses.find((h) => h.number === horseNumber);
  if (!horse || horse.scratched || !horse.rawLine) return null;

  const cols = parseLineColumns(horse.rawLine);
  const val = cols[mainIdx];
  if (!val) return null;

  const m = String(val).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;

  const pct = parseFloat(m[1].replace(',', '.'));
  if (Number.isNaN(pct)) return null;
  return pct;
}

// Välj “omvänd spik” i en avdelning:
//  - måste finnas i kandidatlistan
//  - undvik samma spik som på originalkupongen
//  - helst häst som spikats få gånger (stats.spikes liten)
//  - bland dem, ta högst V85%
function chooseReverseSpikeNumber(divIndex, candidateNums, stats, forbiddenNum) {
  const perDiv = stats[divIndex] || {};
  const scored = [];

  candidateNums.forEach((num) => {
    if (num === forbiddenNum) return; // aldrig exakt samma spik som originalet

    const key = String(num);
    const rec = perDiv[key] || { count: 0, spikes: 0 };
    const spikes = rec.spikes || 0;
    const count = rec.count || 0;
    const pct = getHorseMainPercent(divIndex, num) ?? 0;

    scored.push({ num, spikes, count, pct });
  });

  if (!scored.length) {
    // fallback: ta första som inte är forbidden, annars första
    const fallback =
      candidateNums.find((n) => n !== forbiddenNum) ?? candidateNums[0];
    return fallback;
  }

  scored.sort((a, b) => {
    if (a.spikes !== b.spikes) return a.spikes - b.spikes; // minst spikad först
    if (a.count !== b.count) return a.count - b.count;     // minst spelad först
    return b.pct - a.pct;                                  // högst V85% sist som tiebreaker
  });

  return scored[0].num;
}

// Om en avdelning VAR spik i originalet men inte ska vara spik i omvänd kupong,
// så lägger vi till en extra häst (så att den inte längre är spik).
function pickAlternativeHorseForDivision(divisionIndex, forbiddenNum) {
  const division = divisions.find(
    (d) => (d.index ?? 0) === divisionIndex
  );
  if (!division || !division.horses) return null;

  const mainIdx = getMainPercentIndex();

  const candidates = [];
  for (const horse of division.horses) {
    if (!horse || horse.scratched || !horse.rawLine) continue;
    const num = horse.number;
    if (num === forbiddenNum) continue;

    let pct = 0;
    if (mainIdx !== -1) {
      const cols = parseLineColumns(horse.rawLine);
      const val = cols[mainIdx];
      if (val) {
        const m = String(val).match(/(\d+(?:[.,]\d+)?)/);
        if (m) {
          const p = parseFloat(m[1].replace(',', '.'));
          if (!Number.isNaN(p)) pct = p;
        }
      }
    }

    candidates.push({ num, pct });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.pct - a.pct); // ta högsta procent som extra häst
  return candidates[0].num;
}

// Räkna hur många spikar (avdelningar med exakt 1 häst) det finns
function countSpikesInSelections(selections) {
  if (!Array.isArray(selections)) return 0;
  return selections.reduce((acc, sel) => {
    const n = Array.isArray(sel.horses) ? sel.horses.length : 0;
    return acc + (n === 1 ? 1 : 0);
  }, 0);
}


// Gör så att kupongen får EXAKT targetSpikeCount spikar
function enforceExactSpikeCount(selections, targetSpikeCount) {
  if (!Array.isArray(selections)) return;

  let current = countSpikesInSelections(selections);

  // 1) För många spikar ⇒ ta bort spikar genom att lägga till en extra häst
  if (current > targetSpikeCount) {
    const spikeSelections = selections.filter(
      (sel) => Array.isArray(sel.horses) && sel.horses.length === 1
    );
    // slumpa ordningen så det inte blir samma hela tiden
    for (let i = spikeSelections.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spikeSelections[i], spikeSelections[j]] = [
        spikeSelections[j],
        spikeSelections[i],
      ];
    }

    for (const sel of spikeSelections) {
      if (current <= targetSpikeCount) break;
      breakSpikeInDivision(sel.divisionIndex, sel);
      current = countSpikesInSelections(selections);
    }
  }

  // 2) För få spikar ⇒ välj slumpade avdelningar med flera hästar och gör dem till spik
  while (current < targetSpikeCount) {
    const multiSelections = selections.filter(
      (sel) => Array.isArray(sel.horses) && sel.horses.length > 1
    );
    if (!multiSelections.length) break;

    const sel =
      multiSelections[Math.floor(Math.random() * multiSelections.length)];
    const horses = sel.horses || [];
    const chosen = horses[Math.floor(Math.random() * horses.length)];
    sel.horses = [chosen]; // nu spik
    current = countSpikesInSelections(selections);
  }
}


// Räkna antal rader från ett selections-array (samma logik som computeCouponPrice)
function computeRowsFromSelections(selections) {
  if (!divisions.length || !Array.isArray(selections)) return 0;

  const indexToPos = {};
  divisions.forEach((div, i) => {
    const idx = div.index ?? i + 1;
    indexToPos[idx] = i;
  });

  const counts = new Array(divisions.length).fill(0);

  selections.forEach((sel) => {
    const pos = indexToPos[sel.divisionIndex];
    if (pos === undefined) return;
    const n = Array.isArray(sel.horses) ? sel.horses.length : 0;
    counts[pos] = n;
  });

  const hasAny = counts.some((c) => c > 0);
  if (!hasAny) return 0;

  const countsForProduct = counts.map((c) => (c === 0 ? 1 : c));
  return countsForProduct.reduce((p, c) => p * c, 1);
}

// Lägg till EN extra häst i en viss avdelning, med fokus på hög V85%
function addOneHorseToSelection(divIndex, selection) {
  const division = divisions.find((d) => (d.index ?? 0) === divIndex);
  if (!division || !division.horses) return false;

  const mainIdx = getMainPercentIndex();
  const existing = new Set(selection.horses || []);
  const candidates = [];

  for (const horse of division.horses) {
    if (!horse || horse.scratched || !horse.rawLine) continue;
    const num = horse.number;
    if (existing.has(num)) continue;

    let pct = 0;
    if (mainIdx !== -1) {
      const cols = parseLineColumns(horse.rawLine);
      const val = cols[mainIdx];
      if (val) {
        const m = String(val).match(/(\d+(?:[.,]\d+)?)/);
        if (m) {
          const p = parseFloat(m[1].replace(',', '.'));
          if (!Number.isNaN(p)) pct = p;
        }
      }
    }

    candidates.push({ num, pct });
  }

  if (!candidates.length) return false;

  // Välj högsta procent
  candidates.sort((a, b) => b.pct - a.pct);
  const chosen = candidates[0].num;
  existing.add(chosen);
  selection.horses = Array.from(existing).sort((a, b) => a - b);
  return true;
}

// Försök justera kupongen uppåt i pris genom att lägga till hästar
// i icke-spik-avdelningar tills vi är nära önskat pris.
function tuneSelectionsToTargetPrice(selections, targetTotal, radPris) {
  if (!selections || !selections.length) return;
  if (!radPris || radPris <= 0) return;

  const targetRows = Math.max(1, Math.round(targetTotal / radPris));
  let rows = computeRowsFromSelections(selections);
  if (!rows) return;

  // Vi fokuserar på fallet där kupongen är billigare än målet (som i 81 -> 16)
  if (rows >= targetRows) return;

  let safety = 0;
  while (rows < targetRows && safety < 50) {
    safety++;

    // Hitta en avdelning där vi kan lägga till häst utan att förstöra spikar
    let bestSel = null;
    let bestDivIndex = null;
    let bestRoom = 0;

    for (const sel of selections) {
      const divIndex = sel.divisionIndex;
      const horses = sel.horses || [];

      // rör inte riktiga spikar (1 häst)
      if (horses.length <= 1) continue;

      const division = divisions.find((d) => (d.index ?? 0) === divIndex);
      if (!division || !division.horses) continue;

      const totalCandidates = division.horses.filter(
        (h) => h && !h.scratched && h.rawLine
      ).length;

      const room = totalCandidates - horses.length;
      if (room <= 0) continue;

      if (room > bestRoom) {
        bestRoom = room;
        bestSel = sel;
        bestDivIndex = divIndex;
      }
    }

    if (!bestSel || !bestDivIndex) break;

    const changed = addOneHorseToSelection(bestDivIndex, bestSel);
    if (!changed) break;

    const newRows = computeRowsFromSelections(selections);
    if (newRows === rows) break;
    rows = newRows;

    if (rows >= targetRows) break;
  }
}

// Säkerställ att split-kupongen har rätt spikar:
// - endas de avdelningar som finns i spikeDivSet får vara spik
// - spiken i dessa avdelningar ska vara favoriten (högst V%)
// - alla andra avdelningar ska ha minst 2 hästar (om det är möjligt)
function fixSplitSpikesAfterTuning(selections, spikeDivSet) {
  if (!Array.isArray(selections)) return;
  const spikeDivs = new Set(spikeDivSet || []);

  selections.forEach((sel) => {
    const divIndex = sel.divisionIndex;
    if (divIndex == null) return;

    const fav = getDivisionFavouriteNumber
      ? getDivisionFavouriteNumber(divIndex)
      : null;

    let horsesSet = new Set(sel.horses || []);

    if (spikeDivs.has(divIndex)) {
      // Den här avdelningen SKA vara spik → bara favoriten
      if (fav != null) {
        horsesSet = new Set([fav]);
      } else if (horsesSet.size > 1) {
        // fallback om vi inte hittar favorit: behåll minsta numret som spik
        const only = Math.min(...horsesSet);
        horsesSet = new Set([only]);
      }
    } else {
      // Den här avdelningen får inte vara spik
      if (fav != null) {
        horsesSet.add(fav); // favoriten ska alltid vara med
      }

      // minst 2 hästar om det går
      if (horsesSet.size < 2) {
        const sorted = getDivisionHorsesSortedByPercent
          ? getDivisionHorsesSortedByPercent(divIndex)
          : [];
        for (const h of sorted) {
          if (!horsesSet.has(h.number)) {
            horsesSet.add(h.number);
            if (horsesSet.size >= 2) break;
          }
        }
      }
    }

    sel.horses = Array.from(horsesSet).sort((a, b) => a - b);
  });
}

async function createFilledCouponsFromBase({ baseCoupon, targetPrice, count, spikesWanted, step }) {
  if (!currentGameId) throw new Error('Öppna ett spel först.');
  if (!baseCoupon || !Array.isArray(baseCoupon.selections)) {
    throw new Error('Ogiltig baskupong.');
  }

  // targetPrice är ett MAX-pris (inte "måste nå")
  const maxPrice = Math.max(1, Number(targetPrice) || 1);
  const wantCount = Math.max(1, Number(count) || 1);
  const wantSpikes = Math.max(0, Number(spikesWanted) || 0);

  // --- Favorit/andrahands-stöd (viktigt för Jackpot-fyll) ---
  function getDivisionByIndex(divIndex){
    return divisions.find(d => Number(d.index ?? 0) === Number(divIndex));
  }

  function pickFavsForDivision(divIndex){
    const div = getDivisionByIndex(divIndex);
    const hs = (div?.horses || []).slice().filter(h => Number.isFinite(Number(h.number)));
    if (!hs.length) return { fav: null, second: null, byNum: {} };

    // bygg lookup för värden
    const byNum = {};
    hs.forEach(h => {
      const n = Number(h.number);
      byNum[n] = {
        v: Number(h.vPct ?? h.v85Pct ?? h.v64Pct ?? h.v75Pct ?? h.v86Pct ?? NaN),
        win: Number(h.winPct ?? NaN),
        odds: Number(h.odds ?? NaN),
      };
    });

    hs.sort((a,b) => {
      const av = Number(byNum[Number(a.number)]?.v);
      const bv = Number(byNum[Number(b.number)]?.v);
      if (Number.isFinite(av) && Number.isFinite(bv) && bv !== av) return bv - av;
      const ao = Number(byNum[Number(a.number)]?.odds);
      const bo = Number(byNum[Number(b.number)]?.odds);
      if (Number.isFinite(ao) && Number.isFinite(bo) && bo !== ao) return ao - bo; // lägre odds först
      const aw = Number(byNum[Number(a.number)]?.win);
      const bw = Number(byNum[Number(b.number)]?.win);
      if (Number.isFinite(aw) && Number.isFinite(bw) && bw !== aw) return bw - aw;
      return Number(a.number) - Number(b.number);
    });

    const fav = hs[0] ? Number(hs[0].number) : null;
    const second = hs[1] ? Number(hs[1].number) : null;
    return { fav, second, byNum };
  }

  function ensureFavoritesInSelections(selections){
    // Tvinga in favorit utan att öka radantalet: ersätt "sämsta" hästen om favorit saknas.
    for (const sel of selections){
      const divIndex = Number(sel.divisionIndex);
      const { fav, byNum } = pickFavsForDivision(divIndex);
      if (!fav) continue;

      if (!Array.isArray(sel.horses)) sel.horses = [];
      const list = sel.horses.map(Number).filter(Number.isFinite);

      if (!list.length){
        sel.horses = [fav];
        continue;
      }

      if (list.includes(fav)){
        sel.horses = list;
        continue;
      }

      // hitta "sämsta" (lägst v%, annars högst odds)
      let worst = list[0];
      for (const n of list){
        const nv = byNum[n]?.v;
        const wv = byNum[worst]?.v;
        if (Number.isFinite(nv) && Number.isFinite(wv)){
          if (nv < wv) worst = n;
          continue;
        }
        const no = byNum[n]?.odds;
        const wo = byNum[worst]?.odds;
        if (Number.isFinite(no) && Number.isFinite(wo)){
          if (no > wo) worst = n;
          continue;
        }
      }

      sel.horses = list.map(n => (n === worst ? fav : n));
    }
    return selections;
  }


  const baseInfo = computeCouponPrice(baseCoupon);
  const baseTotal = Math.round(Number(baseInfo.total || 0));

  if (baseTotal > maxPrice) {
    throw new Error(
      `Baskupongen kostar ${baseTotal} kr och kan inte fyllas inom ${maxPrice} kr. Välj en annan kupong eller höj priset.`
    );
  }

  // Viktprofiler (hög% → låg%)
  const profile = {
    1: [0.80, 0.15, 0.05],
    2: [0.80, 0.15, 0.05],
    3: [0.60, 0.30, 0.10],
    4: [0.50, 0.25, 0.25],
    5: [0.30, 0.30, 0.40],
    6: [0.15, 0.20, 0.65],
    7: [0.05, 0.15, 0.80]
  }[Math.max(1, Math.min(7, Number(step) || 3))] || [0.60, 0.30, 0.10];

  const pickTier = (horse) => {
    const p = Number(horse?.v85Percent ?? horse?.percent ?? 0) || 0;
    if (p >= 25) return 0;   // hög
    if (p >= 10) return 1;   // mellan
    return 2;                // låg
  };

  const weightedPick = (candidates) => {
    if (!candidates.length) return null;
    // dela upp i tier
    const tiers = [[], [], []];
    for (const h of candidates) tiers[pickTier(h)].push(h);

    // välj tier enligt profile men med fallback om en tier är tom
    const r = Math.random();
    let tier = r < profile[0] ? 0 : (r < profile[0] + profile[1] ? 1 : 2);

    for (let k = 0; k < 3; k++) {
      const t = (tier + k) % 3;
      if (tiers[t].length) {
        const arr = tiers[t];
        return arr[Math.floor(Math.random() * arr.length)];
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const signatureOf = (coupon) => {
    const parts = (coupon?.selections || [])
      .slice()
      .sort((a, b) => (a.divisionIndex ?? 0) - (b.divisionIndex ?? 0))
      .map(sel => {
        const hs = Array.isArray(sel.horses) ? sel.horses.slice().sort((x, y) => x - y) : [];
        return `${sel.divisionIndex}:${hs.join(',')}`;
      });
    return parts.join('|');
  };

  const created = [];
  const createdSigs = new Set();

  // För varje ny kupong: generera tills vi får en unik variant (inom rimligt antal försök)
  for (let i = 0; i < wantCount; i++) {
    let bestCandidate = null;
    let bestSig = null;

    for (let attempt = 0; attempt < 40; attempt++) {
      const newSelections = ensureFavoritesInSelections((baseCoupon.selections || []).map(sel => ({
        divisionIndex: sel.divisionIndex,
        horses: Array.isArray(sel.horses) ? sel.horses.slice() : []
      })));

      // ordning som vi fyller (slumpad) så utfallet varierar
      const fillOrder = newSelections.map(s => s.divisionIndex);
      for (let k = fillOrder.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [fillOrder[k], fillOrder[j]] = [fillOrder[j], fillOrder[k]];
      }

      const divByIndex = new Map();
      for (const d of divisions || []) divByIndex.set(d.index ?? 0, d);

      const tryAddHorse = (divIndex) => {
        const div = divByIndex.get(divIndex);
        if (!div || !Array.isArray(div.horses)) return false;

        const sel = newSelections.find(s => (s.divisionIndex ?? 0) === divIndex);
        if (!sel) return false;

        const existing = new Set(sel.horses || []);
        const candidates = (div.horses || []).filter(h => h && !h.scratched && !existing.has(h.number));
        if (!candidates.length) return false;

        const chosen = weightedPick(candidates);
        if (!chosen) return false;

        // prova om det ryms
        const next = sel.horses.concat([chosen.number]).sort((a, b) => a - b);
        sel.horses = next;
        const info = computeCouponPrice({ selections: newSelections });
        const total = Number(info.total || 0) || 0;
        if (total > maxPrice + 1e-9) {
          // ångra
          sel.horses = sel.horses.filter(n => n !== chosen.number);
          return false;
        }
        return true;
      };

      // Fyll på i flera varv tills vi inte kan lägga till mer utan att spräcka max
      let progressed = true;
      let guard = 0;
      while (progressed && guard++ < 250) {
        progressed = false;
        for (const divIndex of fillOrder) {
          if (tryAddHorse(divIndex)) progressed = true;
        }
      }

      // Försök få exakt antal spikar om användaren ställt in det
      // (Om det inte går utan att spräcka max så backar vi på just den justeringen.)
      if (wantSpikes >= 0) {
        const currentSpikes = countSpikesInSelections(newSelections);
        if (currentSpikes > wantSpikes) {
          // bryt slumpade spikar
          const spikeSels = newSelections.filter(s => (s.horses || []).length === 1);
          for (let k = spikeSels.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1));
            [spikeSels[k], spikeSels[j]] = [spikeSels[j], spikeSels[k]];
          }
          for (const sel of spikeSels) {
            if (countSpikesInSelections(newSelections) <= wantSpikes) break;
            const before = sel.horses.slice();
            breakSpikeInDivision(sel.divisionIndex, sel);
            const info = computeCouponPrice({ selections: newSelections });
            if ((Number(info.total || 0) || 0) > maxPrice + 1e-9) {
              sel.horses = before; // ångra
            }
          }
        } else if (currentSpikes < wantSpikes) {
          // gör slumpade multi till spik (men bara om det inte spräcker max – priset minskar oftast här)
          const multi = newSelections.filter(s => (s.horses || []).length > 1);
          for (let k = multi.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1));
            [multi[k], multi[j]] = [multi[j], multi[k]];
          }
          for (const sel of multi) {
            if (countSpikesInSelections(newSelections) >= wantSpikes) break;
            const horses = sel.horses || [];
            if (!horses.length) continue;
            const chosen = horses[Math.floor(Math.random() * horses.length)];
            sel.horses = [chosen];
          }
        }
      }

      // final check
      const finalInfo = computeCouponPrice({ selections: newSelections });
      const finalTotal = Number(finalInfo.total || 0) || 0;
      if (finalTotal > maxPrice + 1e-9) {
        continue; // prova igen
      }

      const sig = signatureOf({ selections: newSelections });
      if (createdSigs.has(sig)) {
        // duplicat – prova igen
        // men spara bästa (närmast max) som fallback
        if (!bestCandidate || finalTotal > bestCandidate.total) {
          bestCandidate = { selections: newSelections, total: finalTotal };
          bestSig = sig;
        }
        continue;
      }

      // unik – kör
      bestCandidate = { selections: newSelections, total: finalTotal };
      bestSig = sig;
      break;
    }

    if (!bestCandidate) continue;

    // Om vi ändå bara hittade dublettvarianter: acceptera den som är närmast max
    if (createdSigs.has(bestSig)) {
      // försök hitta en variant som är "nära" max men inte identisk genom att justera ett random val
      // (om det inte går: acceptera men vi försöker undvika detta i praktiken)
    }

    createdSigs.add(bestSig);

    const baseName = baseCoupon.name || 'Kupong';
    const name = ensureUniqueCouponName(`Fylld ${baseName}`);

    const payload = {
      name,
      selections: bestCandidate.selections
        .slice()
        .sort((a, b) => (a.divisionIndex ?? 0) - (b.divisionIndex ?? 0)),
      status: COUPON_STATUS.ACTIVE,
      active: true,
      createdAt: new Date().toISOString(),
      meta: {
        type: 'filled',
        baseId: baseCoupon.id || null,
        maxPrice,
        step: Number(step) || 3
      }
    };

    // Spara via backend precis som övriga kupong-typer.
    // Tidigare patch råkade anropa saveCoupons() (finns inte i projektet).
    const saved = await createCoupon(currentGameId, {
      status: payload.status,
      name: payload.name,
      source: 'fill',
      stakeLevel: baseCoupon?.stakeLevel || 'original',
      selections: (payload.selections || []).map(s => ({
        divisionIndex: Number(s.divisionIndex),
        horses: normalizeHorseNumberList(s.horses),
      })),
      // Behåll extra meta om backend ignorerar okända fält
      active: true,
      meta: payload.meta || null,
    });
    saved.source = 'fill';
    coupons.push(saved);
    created.push(saved);
  }

  if (!created.length) {
    throw new Error(`Kunde inte skapa några varianter inom ${maxPrice} kr från den valda kupongen.`);
  }

  // Alla kuponger är redan sparade via createCoupon ovan
  renderCouponList();
  renderCurrentDivision();
}



// Välj vilka spikar som ska "låsa" i fyllda kuponger.
// OBS: gamla funktionen används inte längre för fyll-läget.

function addOneWeightedHorse(selections, weights) {
  // välj slumpad ordning av avdelningar så kupongerna blir olika
  const divs = divisions.slice();
  shuffleInPlace(divs);

  for (const div of divs) {
    const divIndex = Number(div.index ?? 0);

    const sel = selections.find(s => Number(s.divisionIndex) === divIndex);
    if (!sel) continue;

    // rör inte spik-avdelning (1 häst)
    if ((sel.horses || []).length === 1) continue;

    const pools = getFillPoolsForDivision(divIndex);
    if (!pools) continue;

    const set = new Set(sel.horses || []);

    // favorit ska alltid vara med
    if (pools.fav != null) set.add(pools.fav);

  let next = pickByWeights(weights, pools, set);

// 🔧 fallback: om viktningen inte hittar något, ta valfri häst som inte redan är med
if (next == null) {
  const all = [...(pools.supers || []), ...(pools.mid || []), ...(pools.rest || [])];
  shuffleInPlace(all);
  next = all.find(n => !set.has(n)) ?? null;
}

if (next == null) continue;

set.add(next);

    sel.horses = Array.from(set).sort((a,b) => a-b);
    return true;
  }

  return false;
}

function pickSpikeDivsForFill(selections, spikesWanted) {
  const wanted = Math.max(0, Math.min(Number(spikesWanted || 0), divisions.length));
  if (!wanted) return new Set();

  // vilka är redan spik i basen? (exakt 1 häst)
  const alreadySpikes = new Set(
    (selections || [])
      .filter(s => (s.horses || []).length === 1)
      .map(s => Number(s.divisionIndex))
  );

  // om basen redan har fler spikar än vi vill ha, trimma ner slumpmässigt
  if (alreadySpikes.size > wanted) {
    const arr = Array.from(alreadySpikes);
    shuffleInPlace(arr);
    return new Set(arr.slice(0, wanted));
  }

  // annars behöver vi lägga till fler spik-avdelningar
  const need = wanted - alreadySpikes.size;
  if (need <= 0) return alreadySpikes;

  // bygg info om alla avdelningar
  const divInfo = divisions.map((div, idx) => {
    const divIndex = Number(div.index ?? (idx + 1));
    const sel = (selections || []).find(s => Number(s.divisionIndex) === divIndex);
    const count = (sel?.horses || []).length;

    const sorted = getDivisionHorsesSortedByPercent(divIndex) || [];
    const favPct = sorted.length ? Number(sorted[0].pct || 0) : 0;

    return { divIndex, count, favPct };
  });

  // kandidater (exkludera de som redan är spik)
  const candidates = divInfo.filter(d => !alreadySpikes.has(d.divIndex));

  // 1) tomma först (det är här din “random på tomma” ska hända)
  const empty = candidates.filter(d => d.count === 0);

  // 2) om tomma inte räcker, ta även andra (men undvik att förstöra redan val)
  const nonEmpty = candidates.filter(d => d.count > 0);

  // slumpa ordning inom grupperna så samma tomma inte alltid väljs
  shuffleInPlace(empty);
  shuffleInPlace(nonEmpty);

  // (valfritt) om du fortfarande vill att det ska luta mot starka favoriter:
  // sortera lätt efter favPct men behåll randomness: vi tar topp N efter shuffle
  empty.sort((a, b) => b.favPct - a.favPct);      // men empty var redan shufflad
  nonEmpty.sort((a, b) => b.favPct - a.favPct);

  const chosen = [];
  for (const e of empty) {
    if (chosen.length >= need) break;
    chosen.push(e.divIndex);
  }
  for (const n of nonEmpty) {
    if (chosen.length >= need) break;
    chosen.push(n.divIndex);
  }

  for (const divIndex of chosen) alreadySpikes.add(divIndex);
  return alreadySpikes;
}


function ensureMinTwoInNonSpike(selections, spikeDivSet, weights, lockedByDiv) {
  const byDiv = new Map(selections.map(s => [Number(s.divisionIndex), s]));

  divisions.forEach((div, idx) => {
    const divIndex = Number(div.index ?? (idx + 1));
    const sel = byDiv.get(divIndex);
    if (!sel) return;

    const locked = lockedByDiv && lockedByDiv.get(divIndex) ? lockedByDiv.get(divIndex) : null;

    // spik-avd: exakt 1
    // I "Fyll på" är spikar alltid baserade på en bas-spik (låst). Vi behåller därför
    // exakt basens spikhäst, och lägger inte till/byter.
    if (spikeDivSet.has(divIndex)) {
      if (locked && locked.size === 1) {
        sel.horses = Array.from(locked).map(Number);
      } else {
        // fallback: behåll första hästen om något blivit fel
        const uniq = normalizeHorseNumberList(sel.horses);
        sel.horses = uniq.length ? [uniq[0]] : [];
      }
      return;
    }

    // icke-spik: minst 2 (favoriten + en till)
    // (men utan att ta bort basens hästar)
    sel.horses = normalizeHorseNumberList(sel.horses);
    if (locked && locked.size) {
      locked.forEach((n) => {
        if (!sel.horses.includes(n)) sel.horses.push(n);
      });
    }

    const fav = getDivisionFavouriteNumber(divIndex);
    if (fav != null && !sel.horses.includes(fav)) sel.horses.push(fav);

    while ((sel.horses || []).length < 2) {
      // försök lägga viktad häst i just denna avdelning
      const pools = getFillPoolsForDivision(divIndex);
      const set = new Set(sel.horses || []);
      let next = pools ? pickByWeights(weights, pools, set) : null;

      if (next == null) {
        // fallback: ta valfri (ej redan vald)
        const sorted = getDivisionHorsesSortedByPercent(divIndex) || [];
        const cand = sorted.map(x => x.number).find(n => !set.has(n));
        next = cand ?? null;
      }

      if (next == null) break;
      set.add(next);
      sel.horses = Array.from(set).sort((a,b)=>a-b);
    }

    sel.horses = (sel.horses || []).sort((a,b)=>a-b);
  });
}

function removeRandomHorseSomewhereRespectMin(selections, spikeDivSet, minNonSpike = 2, lockedByDiv) {
  const removable = selections.filter(sel => {
    const divIndex = Number(sel.divisionIndex);
    const horses = sel.horses || [];
    if (spikeDivSet.has(divIndex)) return false;        // rör inte spik-avd
    if (horses.length <= minNonSpike) return false;     // gå aldrig under 2
    // rör inte enbart låsta hästar
    const locked = lockedByDiv && lockedByDiv.get(divIndex) ? lockedByDiv.get(divIndex) : null;
    if (locked && locked.size) {
      const canRemove = horses.some((h) => !locked.has(Number(h)));
      if (!canRemove) return false;
    }
    return true;
  });

  if (!removable.length) return false;

  const sel = removable[Math.floor(Math.random() * removable.length)];
  const divIndex = Number(sel.divisionIndex);
  const fav = getDivisionFavouriteNumber(divIndex);
  const locked = lockedByDiv && lockedByDiv.get(divIndex) ? lockedByDiv.get(divIndex) : null;
  const candidates = (sel.horses || []).filter((h) => {
    const num = Number(h);
    if (!Number.isFinite(num)) return false;
    if (fav != null && num === fav) return false;
    if (locked && locked.has(num)) return false;
    return true;
  });
  if (!candidates.length) return false;

  const num = candidates[Math.floor(Math.random() * candidates.length)];
  sel.horses = (sel.horses || []).filter(h => h !== num);
  return true;
}



async function createChanceCoupons({ baseName, count, maxPrice, level, preferUnplayed, includeSecondFav, spikesWanted }) {






  if (!currentGameId || !divisions.length) {
    alert('Inget spel öppet.');
    return;
  }

  // 1) Bygg karta: vilka hästar som redan spelats på i befintliga kuponger (per avdelning)
  const playedMap = {};
  if (preferUnplayed && Array.isArray(coupons) && coupons.length) {
    getActiveCoupons().forEach((c) => { 

      (c.selections || []).forEach((sel) => {
        const d = Number(sel.divisionIndex);
        const set = (playedMap[d] ||= new Set());
        (sel.horses || []).forEach((n) => set.add(Number(n)));
      });
    });
  }

  // 2) Chansnivå -> hur många extra hästar vi försöker lägga till per avdelning som start
  // nivå 1 = försiktig, nivå 5 = aggressiv
  const extraPerDiv = [0, 1, 2, 3, 4, 5][level] ?? 3;

// Spik-val: välj avdelningar där favoriten är starkast (högst %)
const wanted = Math.max(0, Math.min(Number(spikesWanted || 0), divisions.length));

function getFavPct(divIndex) {
  const sorted = getDivisionHorsesSortedByPercent(divIndex) || [];
  return sorted.length ? Number(sorted[0].pct || 0) : 0;
}

const divStrength = divisions.map((div, idx) => {
  const divIndex = Number(div.index ?? (idx + 1));
  return { divIndex, pct: getFavPct(divIndex) };
});

// starkast favorit först
divStrength.sort((a, b) => b.pct - a.pct);



  // Hjälpare: välj "bästa" skrällkandidat-lista (lägst procent först)
  function getChanceCandidates(divIndex) {
  const sortedHighToLow = getDivisionHorsesSortedByPercent(divIndex) || [];
  const fav = sortedHighToLow[0]?.number ?? null;
  const favPct = Number(sortedHighToLow[0]?.pct || 0);

  const second = sortedHighToLow[1] || null;
  const secondNum = second?.number ?? null;
  const secondPct = Number(second?.pct || 0);

  // Vi definierar “mellan-zon” som: från 6% upp till andrahandsfavoritens procent (ex: 6%..35%)
  // Om secondPct saknas → använd favPct som tak (men minst 15 så det finns ett intervall)
  const upper = Math.max(15, secondPct || favPct || 15);
  const lower = 6;

  // Gör lista i låg->hög ordning (chans = mer lågprocent generellt)
  const sortedLowToHigh = sortedHighToLow.slice().reverse();

  // Plocka ut nummer, exkludera favorit (favorit läggs alltid separat)
  let list = sortedLowToHigh
    .map(h => h.number)
    .filter(n => n != null && n !== fav);

  // Om preferUnplayed: flytta ospelade först
  if (preferUnplayed) {
    const played = playedMap[divIndex] || new Set();
    list = [
      ...list.filter(n => !played.has(n)),
      ...list.filter(n => played.has(n)),
    ];
  }

  // Dela upp i grupper baserat på procent:
  const supers = [];
  const mid = [];
  const high = [];

  for (const n of list) {
    const pct = getHorsePercent(divIndex, n);
    if (pct == null) {
      high.push(n);
      continue;
    }

    if (pct < lower) supers.push(n);
    else if (pct >= lower && pct <= upper) mid.push(n);
    else high.push(n);
  }

  // Vi vill fortfarande ha “chans” → supers tidigt, men NU har vi en mid-grupp vi kan kvotera in
  return { fav, secondNum, secondPct, favPct, upper, supers, mid, high };
}


  // 3) Skapa N kuponger
  const created = [];

  const seenSignatures = new Set();

  for (let i = 0; i < count; i++) {
    const selections = [];

// ✅ Slumpa spik-avdelningar per kupong (men viktat mot starka favoriter)
const topPoolSize = Math.min(divStrength.length, Math.max(wanted * 2, wanted)); 
const topPool = divStrength.slice(0, topPoolSize).map(x => x.divIndex);

// shuffle topPool så urvalet varierar mellan kuponger
shuffleInPlace(topPool);

// välj wanted st spikavdelningar från topPool
const spikeDivSet = new Set(topPool.slice(0, wanted));



    // 3a) Start: favorit + ett antal skrällar per avd (styrt av level)
    divisions.forEach((div, idx) => {
      const divIndex = Number(div.index ?? (idx + 1));
      const fav = getDivisionFavouriteNumber(divIndex);
if (fav == null) return;

const chosen = new Set([fav]);

// ✅ Om denna avdelning ska vara spik: lås till endast favoriten
if (spikeDivSet.has(divIndex)) {
  selections.push({
    divisionIndex: divIndex,
    horses: [fav],
  });
  return; // fortsätt nästa avdelning
}

// (resten är samma som innan – här får du fylla på med second fav + skrällar)


// ✅ NYTT: ibland ta med andrahandfavorit (om checkbox är på)
// - större chans om favoriten är "mindre favorit" (t.ex. 45%)
// - mindre chans om favoriten är jättestor (t.ex. 70%)
// - större chans om gapet är litet
if (includeSecondFav) {
  const sorted = getDivisionHorsesSortedByPercent(divIndex) || [];
  const favObj = sorted.length > 0 ? sorted[0] : null;
  const second = sorted.length > 1 ? sorted[1] : null;

  if (favObj && second && second.number != null) {
    const favPct = Number(favObj.pct || 0);
    const secPct = Number(second.pct || 0);

    const p = chanceSecondFavProbability(favPct, secPct);

    // Ta bara med second om vi faktiskt ska fylla fler än 1 häst i avdelningen
    const shouldFillMore = extraPerDiv > 0;
    if (shouldFillMore && Math.random() < p) {
      chosen.add(second.number);
    }
  }
}


// plocka skrällar/minst spelade
const pack = getChanceCandidates(divIndex);
const { supers, mid, high } = pack;

// Hur många “extra” vill vi ha i denna avdelning?
// (Du kan också slumpa lite för variation)
const jitter = (Math.random() < 0.20 ? -1 : 0) + (Math.random() < 0.45 ? 1 : 0);
const targetSize = Math.max(2, 1 + extraPerDiv + jitter);

// 30% av extra-platserna ska komma från mid-zonen
const extraSlots = Math.max(0, targetSize - chosen.size);
const midSlotsTarget = Math.max(0, Math.round(extraSlots * 0.30));

// Hjälpare: blanda listor för att inte få exakt samma kupong
const shuffled = (arr) => {
  const a = arr.slice();
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
};

const supersSh = shuffled(supers);
const midSh = shuffled(mid);
const highSh = shuffled(high);

// 1) Lägg in “mid” upp till kvoten
let midAdded = 0;
for (const n of midSh) {
  if (chosen.size >= targetSize) break;
  if (midAdded >= midSlotsTarget) break;
  chosen.add(n);
  midAdded++;
}

// 2) Fyll resten: supers först (chans), sen mid, sen high
const fillOrder = [...supersSh, ...midSh, ...highSh];
for (const n of fillOrder) {
  if (chosen.size >= targetSize) break;
  chosen.add(n);
}

// 3) säkerhet: om vi råkar hamna på 1 häst (inte spik-avd) → lägg en till
if (chosen.size < 2) {
  const fallback = fillOrder.find(n => !chosen.has(n));
  if (fallback != null) chosen.add(fallback);
}




   

      selections.push({
        divisionIndex: divIndex,
        horses: Array.from(chosen).sort((a, b) => a - b),
      });
    });

    // 3b) Favoriten ska ALLTID vara med (säkerhet)
    ensureFavouriteInEachDivision(selections);

    // 3c) Pristrim: försök närma maxPrice utan att gå över.
    // Vi vill fylla på med “chans-hästar” (låga %, gärna unplayed), inte topp-favoriter.
    const radPris = getEffectiveRadPris();
    let info = computeCouponPrice({ selections });
    let total = info.total;

    // Om för dyr: ta bort hästar (men removeRandomHorseSomewhere tar inte bort favoriten i din fil)
    let guard = 0;
    while (total > maxPrice && guard < 120) {
      guard++;
      if (!removeRandomHorseSomewhere(selections)) break;
      ensureFavouriteInEachDivision(selections);
      info = computeCouponPrice({ selections });
      total = info.total;
    }

    // Om för billig: lägg till mer chans-hästar där det finns plats
    // (vi använder egen “addChance” så vi inte fyller med topphästar)
    function addChanceHorseSomewhere() {
  // hitta avdelningar där vi kan lägga till en kandidat
  const divOrder = divisions.slice();
  shuffleInPlace(divOrder);

  for (const div of divOrder) {
    const divIndex = Number(div.index ?? 0);
    if (spikeDivSet.has(divIndex)) continue;

    const sel = selections.find((s) => Number(s.divisionIndex) === divIndex);
    if (!sel) continue;

    const set = new Set(sel.horses || []);

    const pack = getChanceCandidates(divIndex);
    const supers = pack?.supers || [];
    const mid = pack?.mid || [];
    const high = pack?.high || [];

    // 🔹 Viktigt: vi vill ha “mid-hästar” med ~30% chans när vi fyller på
    // Viktning: supers 50%, mid 30%, high 20%
    const roll = Math.random();
    let pool =
      roll < 0.50 ? supers :
      roll < 0.80 ? mid :
                   high;

    // om poolen är tom → fallback
    if (!pool.length) pool = [...supers, ...mid, ...high];
    if (!pool.length) continue;

    // slumpa poolen för variation
    const shuffledPool = pool.slice();
    shuffleInPlace(shuffledPool);

    const next = shuffledPool.find((n) => !set.has(n));
    if (next == null) continue;

    set.add(next);
    sel.horses = Array.from(set).sort((a, b) => a - b);
    return true;
  }

  return false;
}


    guard = 0;
    const minAcceptable = Math.max(1, maxPrice * 0.85); // chans-kupong ska ligga nära max
    while (total < minAcceptable && guard < 160) {
      guard++;
      const changed = addChanceHorseSomewhere();
      if (!changed) break;

      ensureFavouriteInEachDivision(selections);
      info = computeCouponPrice({ selections });
      total = info.total;

      if (total > maxPrice) {
        // gick över -> backa genom att ta bort nåt
        removeRandomHorseSomewhere(selections);
        ensureFavouriteInEachDivision(selections);
        info = computeCouponPrice({ selections });
        total = info.total;
        break;
      }
    }

    // 3d) Spara
  const payload = {
  status: getNewCouponStatus(),
  name: ensureUniqueCouponName(`${baseName} ${i + 1}`),
  stakeLevel: 'original',           // ✅ behövs för backend
  selections: selections.map(s => ({
    divisionIndex: Number(s.divisionIndex),
    horses: (s.horses || []).map(Number),
  })),
  source: 'chance',                 // (ok om backend ignorerar extra)
  // chanceMeta: { ... }             // 🔻 kommentera bort tillfälligt om 500 kvarstår
};

const saved = await createCoupon(currentGameId, payload);

    saved.source = 'chance';
    coupons.push(saved);
    created.push(saved);
  }

  if (!created.length) {
    alert('Kunde inte skapa chans-kuponger.');
    return;
  }

  renderCouponList();
  renderCurrentDivision();
}





// ------------------------------------------------------------
// Jackpot kupong (v1)
// Mål: skapa "unikare" kuponger baserat på V%-popularitet + V-ODDS.
// Skapade kuponger hamnar alltid i Vänteläge.
// ------------------------------------------------------------

function parsePercentValue(txt) {
  const s = String(txt || '').replace(/\s/g, '').replace('%', '');
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function parseOddsValue(txt) {
  const s = String(txt || '').replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function getJackpotHorseStats(horse) {
  if (!horse || !horse.rawLine) return null;

  const cols = parseLineColumns(horse.rawLine);

  const percentIdx = getMainPercentIndex(headerColumns);
  const oddsIdx = (headerColumns || []).findIndex((h) => /V-?ODDS|ODDS/i.test(String(h || '')));

  const percent = percentIdx >= 0 ? parsePercentValue(cols[percentIdx]) : 0;
  const odds = oddsIdx >= 0 ? parseOddsValue(cols[oddsIdx]) : 0;

  // Implied probability from odds (rough)
  const implied = odds > 0 ? (1 / odds) : 0;

  return {
    number: Number(horse.number) || 0,
    percent,          // 0..100
    pop: percent / 100,
    odds,
    implied,          // 0..1
  };
}

function buildJackpotSelections({ maxPrice, spikesWanted, rng }) {
  rng = (typeof rng === "function") ? rng : Math.random;
  if (!divisions || !divisions.length) return [];

  const isV85 = String(game?.gameType || '').toUpperCase() === 'V85';
  const tmpCouponBase = { stakeLevel: isV85 ? stakeLevel : 'original' };

  // Kandidater per avdelning
  const divCandidates = divisions.map((div, pos) => {
    const divIndex = div?.index ?? (pos + 1);

    const candidates = (div?.horses || [])
      .map(getJackpotHorseStats)
      .filter((x) => x && x.number > 0);

    candidates.forEach((c) => {
      const pop = Math.max(0.005, c.pop);
      const valueRatio = c.implied > 0 ? (c.implied / pop) : (1 / pop);
      c._baseScore = (Math.pow(valueRatio, 0.6) * 0.75) + (Math.pow(1 - c.pop, 1.2) * 0.25);
      c._backupScore = (c.implied * 0.8) + ((1 - c.pop) * 0.2);
    });

    // Välj “primary” lite slumpmässigt bland toppkandidater för att jackpot-kuponger inte blir identiska
    const inBand = candidates.filter((c) => c.pop >= 0.05 && c.pop <= 0.35);
    const primaryPool = (inBand.length ? inBand : candidates)
      .slice()
      .sort((a, b) => (b._baseScore || 0) - (a._baseScore || 0));

    const pickWeightedIndex = (arr, wFn) => {
      if (!arr.length) return -1;
      let sum = 0;
      const ws = arr.map((x) => {
        const w = Math.max(0, Number(wFn(x)) || 0);
        sum += w;
        return w;
      });
      if (sum <= 0) return Math.floor(rng() * arr.length);
      let r = rng() * sum;
      for (let i = 0; i < ws.length; i++) {
        r -= ws[i];
        if (r <= 0) return i;
      }
      return ws.length - 1;
    };

    const topN = Math.min(3, primaryPool.length);
    const top = primaryPool.slice(0, topN);
    const primaryIdx = pickWeightedIndex(top, (c) => (c._baseScore || 0.000001));
    const primary = primaryIdx >= 0 ? top[primaryIdx] : primaryPool[0];

    // Backups: behåll kvalitet men variera ordningen lite (slumpa om toppdelen)
    let backups = candidates
      .slice()
      .sort((a, b) => (b._backupScore || 0) - (a._backupScore || 0))
      .filter((c) => c.number !== primary?.number);

    const shuffleTop = Math.min(10, backups.length);
    if (shuffleTop > 1) {
      const head = backups.slice(0, shuffleTop);
      for (let i = head.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = head[i]; head[i] = head[j]; head[j] = tmp;
      }
      backups = head.concat(backups.slice(shuffleTop));
    }

    return { divIndex, primary, backups };
  });

  const autoSpikes = spikesWanted > 0 ? spikesWanted : 2;

  // Välj spik-avdelningar med lite variation så flera jackpot-kuponger inte blir identiska
  const rankedForSpikes = divCandidates
    .slice()
    .sort((a, b) => {
      const ao = a.primary?.odds || 999;
      const bo = b.primary?.odds || 999;
      const ap = a.primary?.pop || 0;
      const bp = b.primary?.pop || 0;
      if (ao !== bo) return ao - bo;
      return bp - ap;
    });

  const spikeDivs = new Set();
  const wantSpikes = Math.min(autoSpikes, divCandidates.length);

  // välj från en liten topp-pool (t.ex. wantSpikes + 3) för att få variation men ändå “rimliga” spikar
  const poolSize = Math.min(divCandidates.length, wantSpikes + 3);
  const spikePool = rankedForSpikes.slice(0, poolSize);

  const pickIdx = (arr) => {
    if (!arr.length) return -1;
    const weights = arr.map((d) => {
      const odds = Number(d.primary?.odds || 999);
      const pop = Number(d.primary?.pop || 0);
      // lite vikt mot låg odds + hög spelprocent
      return (1 / Math.max(1, odds)) * 0.7 + pop * 0.3 + 0.000001;
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = rng() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  };

  while (spikeDivs.size < wantSpikes && spikePool.length) {
    const i = pickIdx(spikePool);
    if (i < 0) break;
    const chosen = spikePool.splice(i, 1)[0];
    if (chosen?.divIndex != null) spikeDivs.add(chosen.divIndex);
  }

  // fallback: fyll upp om poolen blev tom av någon anledning
  for (const d of rankedForSpikes) {
    if (spikeDivs.size >= wantSpikes) break;
    spikeDivs.add(d.divIndex);
  }

  const selectionsMap = new Map();
  divCandidates.forEach((d) => {
    const set = new Set();
    if (d.primary?.number) set.add(d.primary.number);
    selectionsMap.set(d.divIndex, set);
  });

  function currentSelectionsArray() {
    const out = [];
    selectionsMap.forEach((set, divIndex) => {
      out.push({ divisionIndex: Number(divIndex), horses: Array.from(set).sort((a, b) => a - b) });
    });
    return out.sort((a, b) => a.divisionIndex - b.divisionIndex);
  }

  function currentTotalPrice() {
    const tmp = { ...tmpCouponBase, selections: currentSelectionsArray() };
    return computeCouponPrice(tmp).total || 0;
  }

  const maxPerDiv = 3;
  const pointers = Object.create(null);

  if (currentTotalPrice() > maxPrice) return currentSelectionsArray();

  for (let guard = 0; guard < 200; guard++) {
    let best = null;

    for (const d of divCandidates) {
      const divIndex = d.divIndex;

      if (spikeDivs.has(divIndex)) continue;

      const set = selectionsMap.get(divIndex);
      if (!set) continue;
      if (set.size >= maxPerDiv) continue;

      const p = pointers[divIndex] || 0;
      const cand = d.backups[p];
      if (!cand) continue;

      if (cand.pop >= 0.55) {
        pointers[divIndex] = p + 1;
        continue;
      }

      const newSet = new Set(set);
      newSet.add(cand.number);

      const tmpArr = [];
      selectionsMap.forEach((s, idx) => {
        const use = (idx === divIndex) ? newSet : s;
        tmpArr.push({ divisionIndex: Number(idx), horses: Array.from(use).sort((a, b) => a - b) });
      });
      tmpArr.sort((a, b) => a.divisionIndex - b.divisionIndex);

      const tmp = { ...tmpCouponBase, selections: tmpArr };
      const newTotal = computeCouponPrice(tmp).total || 0;

      if (newTotal > maxPrice) continue;

      const score = (cand._backupScore || 0) + (rng() * 1e-6);
      if (!best || score > best.score) {
        best = { divIndex, number: cand.number, score, newTotal, nextPointer: p + 1 };
      }
    }

    if (!best) break;

    selectionsMap.get(best.divIndex).add(best.number);
    pointers[best.divIndex] = best.nextPointer;
  }

  return currentSelectionsArray();
}



// ===============================
// BÄSTA RADEN (5 förslag)
// Mål: lägre pris, fler hästar, färre spikar (med rimlig chans)
// ===============================

function getTopHorsesInDivisionByPercent(divisionIndex, count) {
  const sorted = getDivisionHorsesSortedByPercent(divisionIndex);
  const picked = sorted.slice(0, Math.max(1, count)).map((x) => {
    const horse = x.horse || {};
    const rawLine = horse.rawLine || "";
    const name = extractHorseNameFromRawLine(rawLine) || (horse.name || "");
    return { number: horse.number, name, pct: x.pct || 0, rawLine };
  });
  return picked;
}

function buildBestRowBudgets(maxRows, count) {
  const maxR = Math.max(1, Math.floor(Number(maxRows) || 1));
  const n = Math.max(1, Math.floor(Number(count) || 5));
  if (n === 1) return [maxR];

  // Vi vill ligga "nära maxpriset" (t.ex. 500 -> 500, 475, 450, 425, 400)
  const step = Math.max(1, Math.round(maxR * 0.05)); // 5%
  const budgets = [];
  for (let i = 0; i < n; i++) budgets.push(Math.max(1, maxR - i * step));

  // Säkerställ unika och sortera fallande
  const uniq = [...new Set(budgets)].sort((a, b) => b - a);

  // Fyll på om det blev för få unika (små maxR)
  let probe = uniq[uniq.length - 1];
  while (uniq.length < n && probe > 1) {
    probe = Math.max(1, probe - 1);
    if (!uniq.includes(probe)) uniq.push(probe);
  }

  return uniq.slice(0, n);
}

function computeBestRows({ maxPriceKr = 200, count = 5, maxPerDivision = 6, skrallLevel = 60 } = {}) {
  const baseStake = 1; // 1 kr / rad
  const s = Math.min(100, Math.max(0, Number(skrallLevel) || 0)) / 100;

  const maxRows = Math.max(1, Math.floor((Number(maxPriceKr) || 0) / baseStake));
  const budgets = buildBestRowBudgets(maxRows, count);

  const divCount = Array.isArray(divisions) ? divisions.length : 0;
  if (!divCount) return [];

  // Hjälpare
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const safeProb = p => clamp(Number(p) || 0, 0, 0.99);

  // Precompute per avdelning: ranking + coverage för k=1..K
  const divInfo = [];
  for (let di = 0; di < divCount; di++) {
    const sorted = getDivisionHorsesSortedByPercent(di);
    const K = Math.max(1, Math.min(Number(maxPerDivision) || 6, sorted.length || 1));

    // odds-prob (normaliserad) om vi har vOdds
    const oddsInv = sorted.map(x => (x.vOdds && x.vOdds > 0 ? 1 / x.vOdds : 0));
    const oddsSum = oddsInv.reduce((a, b) => a + b, 0) || 1;
    const oddsProb = oddsInv.map(v => v / oddsSum);

    const horses = sorted.map((x, idx) => {
      const v85 = clamp((x.pct || 0) / 100, 0, 1);
      const winProb = safeProb(0.7 * v85 + 0.3 * oddsProb[idx]); // enkel mix
      const skrallScore = (1 - v85) * Math.sqrt(winProb);        // skräll men med chans
      const combined = (1 - s) * winProb + s * skrallScore;

      return {
        number: x.number || extractHorseNumberFromRawLine(x.rawLine) || '',
        name: x.name || extractHorseNameFromRawLine(x.rawLine) || '',
        v85,
        winProb,
        combined
      };
    });

    // Sortera efter combined (skrällnivå styr), tie-breaker: winProb
    const ranked = horses.slice().sort((a, b) => (b.combined - a.combined) || (b.winProb - a.winProb) || String(a.number).localeCompare(String(b.number)));

    // "Upptäck skrällpotential": om stor favorit -> lägre potential
    const fav = horses.slice().sort((a, b) => b.winProb - a.winProb)[0];
    const upsetPotential = clamp(1 - (fav?.v85 ?? 0), 0, 1);

    // selectionsByK / coverageByK
    const selectionsByK = { 0: [] };
    const coverageByK = { 0: 0 };
    for (let k = 1; k <= K; k++) {
      const picks = ranked.slice(0, k);
      selectionsByK[k] = picks;
      coverageByK[k] = safeProb(picks.reduce((acc, h) => acc + h.winProb, 0));
    }

    divInfo.push({ K, ranked, selectionsByK, coverageByK, upsetPotential });
  }

  // Greedy optimering av radCounts så vi hamnar nära budgetRows (<=)
  function optimizeCountsForBudget(budgetRows, seed) {
    const rand = (() => {
      // tiny deterministic-ish rng
      let x = (seed * 2654435761) >>> 0;
      return () => {
        x ^= x << 13; x >>>= 0;
        x ^= x >> 17; x >>>= 0;
        x ^= x << 5;  x >>>= 0;
        return (x >>> 0) / 4294967296;
      };
    })();

    const counts = new Array(divCount).fill(1);
    let rows = 1;

    // För hög skrällnivå: undvik spikar mer aggressivt
    const wCov   = (1 - s) * 2.2 + s * 1.2;
    const wHors  = (1 - s) * 0.25 + s * 0.55;
    const wSpike = (1 - s) * 0.15 + s * 0.90;
    const wUpset = (1 - s) * 0.10 + s * 0.70;

    while (true) {
      let best = null;

      for (let di = 0; di < divCount; di++) {
        const info = divInfo[di];
        const curK = counts[di];
        if (!info || curK >= info.K) continue;

        const newK = curK + 1;
        const newRows = (rows / curK) * newK;
        if (newRows > budgetRows + 1e-9) continue;

        const oldCov = info.coverageByK[curK] ?? 0;
        const newCov = info.coverageByK[newK] ?? oldCov;
        const dCov = Math.max(0, newCov - oldCov);

        const dHorses = 1;
        const dSpikes = (curK === 1 ? -1 : 0);

        const gain =
          wCov * dCov +
          wHors * dHorses +
          wSpike * (-dSpikes) +           // ta bort spik = bra
          wUpset * info.upsetPotential;

        const costFactor = newRows / rows; // 1.xx
        const score = gain / costFactor + rand() * 1e-6;

        if (!best || score > best.score) {
          best = { di, score, newRows };
        }
      }

      if (!best) break;
      const curK = counts[best.di];
      counts[best.di] = curK + 1;
      rows = best.newRows;
    }

    return { counts, rows };
  }

  // Skapa förslag
  const suggestions = [];
  const seen = new Set();

  for (let i = 0; i < budgets.length; i++) {
    const budgetRows = budgets[i];

    // lite olika seed för variation
    const { counts, rows } = optimizeCountsForBudget(budgetRows, 1337 + i * 101);

    const picksByDivision = {};
    let horsesTotal = 0;
    let spikes = 0;
    let chanceEst = 1;
    let skrallAccum = 0;

    for (let di = 0; di < divCount; di++) {
      const k = counts[di] || 1;
      horsesTotal += k;
      if (k === 1) spikes++;

      const info = divInfo[di];
      const picks = info?.selectionsByK[k] || [];
      picksByDivision[di] = picks.map(h => ({ number: h.number, name: h.name }));

      chanceEst *= (info?.coverageByK[k] ?? 0);

      // skräll-index: låg V85 på valda hästar => högre index
      const avgV85 = picks.length ? picks.reduce((a, h) => a + (h.v85 || 0), 0) / picks.length : 0;
      skrallAccum += (1 - avgV85);
    }

    const priceKr = rows * baseStake;
    const formula = counts.join('x');

    const skrallIndex = (skrallAccum / divCount) * 100;

    const key = formula + '|' + Math.round(priceKr);
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      formula,
      rows: Math.round(rows),
      horsesTotal,
      spikes,
      chanceEst: Math.max(0, Math.min(1, chanceEst)),
      skrallIndex,
      priceKr,
      ks: { radCounts: counts, picksByDivision, meta: { maxPriceKr, skrallLevel: Math.round(s * 100) } }
    });
  }

  // Sortera: närmast maxPriceKr först, sedan fler hästar, sedan färre spikar
  const target = Number(maxPriceKr) || 0;
  suggestions.sort((a, b) => {
    const da = Math.abs(target - a.priceKr);
    const db = Math.abs(target - b.priceKr);
    if (da !== db) return da - db;
    if (b.horsesTotal !== a.horsesTotal) return b.horsesTotal - a.horsesTotal;
    if (a.spikes !== b.spikes) return a.spikes - b.spikes;
    return b.chanceEst - a.chanceEst;
  });

  return suggestions.slice(0, count);
}

function renderBestRowSuggestions(suggestions, maxPriceKr) {
  const wrap = document.getElementById('best-row-suggestions');
  if (!wrap) return;

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    wrap.innerHTML = `<div class="muted">Inga förslag hittades (kontrollera att hästlistor är importerade).</div>`;
    return;
  }

  const fmtKr = v => (Number(v) || 0).toFixed(2).replace('.', ',');

  wrap.innerHTML = suggestions.map((s, idx) => {
    const ksEnc = encodeURIComponent(JSON.stringify(s.ks || {}));

    const details = Object.keys(s.ks?.picksByDivision || {})
      .map(k => Number(k))
      .sort((a, b) => a - b)
      .map(di => {
        const picks = s.ks.picksByDivision[di] || [];
        const label = picks.length ? picks.map(p => `${p.number} ${p.name}`.trim()).join(', ') : '-';
        return `<div class="small"><strong>Avd ${di + 1}:</strong> ${escapeHtml(label)}</div>`;
      }).join('');

    return `
      <div class="best-row-card">
        <div class="best-row-head">
          <div><strong>#${idx + 1} Rad:</strong> ${escapeHtml(s.formula)}</div>
          <div class="best-row-price">${fmtKr(s.priceKr)}</div>
        </div>

        <div class="best-row-meta small">
          Rader: ${s.rows} &nbsp;|&nbsp;
          Hästar: ${s.horsesTotal} &nbsp;|&nbsp;
          Spikar: ${s.spikes} &nbsp;|&nbsp;
          Chans (est): ${(s.chanceEst * 100).toFixed(2)}% &nbsp;|&nbsp;
          Skrällnivå (index): ${Math.round(s.skrallIndex)}%
        </div>

        <details class="best-row-details">
          <summary>Visa valda hästar</summary>
          <div class="best-row-details-body">${details}</div>
        </details>

        <button class="btn small btn-create-best-row" data-idx="${idx}" data-ks="${ksEnc}">Skapa kupong</button>
      </div>
    `;
  }).join('');
}

async function handleCreateBestRowCoupon(ks, idx) {
  if (!currentGameId) return;
  if (!Array.isArray(ks) || !ks.length) return;

  const D = (divisions || []).length;
  const selectionsByDivision = {};
  for (let i = 1; i <= D; i++) {
    const picks = getTopHorsesInDivisionByPercent(i, ks[i - 1]);
    selectionsByDivision[i] = picks.map((p) => p.number).filter((n) => n !== undefined && n !== null);
  }

  const radPris = getEffectiveRadPris();
  const rows = ks.reduce((p, k) => p * k, 1);
  const price = rows * radPris;
  const spikes = ks.filter((k) => k === 1).length;

  const payload = {
    name: `Bästa raden #${(idx || 0) + 1}`,
    selectionsByDivision,
    notes: `Auto: Bästa raden. Rad: ${ks.join("x")} | Rader: ${rows} | Pris: ${formatMoney(price)} | Spikar: ${spikes}`
  };

  try {
    await createCoupon(currentGameId, payload);
    await loadGame(currentGameId);
    showToast("Kupong skapad!", "success");
  } catch (e) {
    console.error("Failed to create best-row coupon", e);
    showToast("Kunde inte skapa kupong", "error");
  }
}

async function createJackpotCoupons({ baseName, count, maxPrice, spikesWanted }) {
  if (!currentGameId || !divisions.length) {
    alert('Inget spel öppet.');
    return;
  }

  // Unikhet per "Skapa X jackpot-kuponger"-körning
  const seenSignatures = new Set();

  const created = [];

  for (let i = 0; i < count; i++) {
    // Försök generera unika jackpot-kuponger när man skapar flera samtidigt
    let selections = null;
    let sig = '';
    for (let tries = 0; tries < 12; tries++) {
      const candidate = buildJackpotSelections({ maxPrice, spikesWanted, rng: Math.random });
      const signature = (candidate || [])
        .slice()
        .sort((a, b) => Number(a.divisionIndex) - Number(b.divisionIndex))
        .map((s) => `${Number(s.divisionIndex)}:${(s.horses || []).slice().map(Number).sort((a,b)=>a-b).join(',')}`)
        .join('|');

      if (!seenSignatures.has(signature)) {
        selections = candidate;
        sig = signature;
        break;
      }
      // annars prova igen
      selections = candidate;
      sig = signature;
    }
    if (sig) seenSignatures.add(sig);

    const payload = {
      status: COUPON_STATUS.WAITING,
      name: ensureUniqueCouponName(count > 1 ? `${baseName} ${i + 1}` : baseName),
      selections: (selections || []).map((s) => ({
        divisionIndex: Number(s.divisionIndex),
        horses: (s.horses || []).map(Number),
      })),
      source: 'jackpot',
    };

    if (String(game?.gameType || '').toUpperCase() === 'V85') {
      payload.stakeLevel = stakeLevel || 'original';
    }

    const saved = await createCoupon(currentGameId, payload);
    saved.source = 'jackpot';
    coupons.push(saved);
    created.push(saved);
  }

  if (!created.length) {
    alert('Kunde inte skapa jackpot-kuponger.');
    return;
  }

  renderCouponList();
  renderCurrentDivision();
}

async function createSplitCouponsFromExisting(options) {
  const {
    baseName,
    count,
    maxPrice,
    spikesPerCoupon,
    patternStr,
    supersPerCoupon,
    usePopular = true,
  } = options;

  if (!currentGameId || !divisions.length) {
    alert('Inget spel öppet att splitta.');
    return;
  }

  // Om vi bygger från kuponger måste det finnas kuponger
  if (usePopular && !coupons.length) {
    alert('Det finns inga kuponger att splitta ännu.');
    return;
  }

  // 1. Hitta favorit i varje avdelning + procent + om den är superskräll
  const favPerDivision = [];
  divisions.forEach((div, idx) => {
  const divIndex = Number(div.index ?? (idx + 1));
    const favNum = getDivisionFavouriteNumber
      ? getDivisionFavouriteNumber(divIndex)
      : null;
    if (favNum == null) return;

    let percent = 0;
    if (typeof getHorsePercent === 'function') {
      const p = getHorsePercent(divIndex, favNum);
      if (Number.isFinite(p)) percent = p;
    }

    const isSuper =
      typeof isSuperskrall === 'function'
        ? isSuperskrall(divIndex, favNum)
        : false;

  favPerDivision.push({
  division: Number(divIndex),
  number: favNum,
  percent,
  isSuper,
});
  });

  if (!favPerDivision.length) {
    alert('Hittade inga favoriter att använda som spikar.');
    return;
  }

  const neededSpikes = count * spikesPerCoupon;

// Sortera favoriter i prioriteringsordning
const strong = favPerDivision.filter(
  (f) => !f.isSuper && f.percent >= 35
);
const mid = favPerDivision.filter(
  (f) => !f.isSuper && f.percent >= 20 && f.percent < 35
);
const weak = favPerDivision.filter(
  (f) => !f.isSuper && f.percent < 20
);
const superFavs = favPerDivision.filter((f) => f.isSuper);

const orderedFavs = [
  ...strong,
  ...mid,
  ...weak,
  ...superFavs, // bara om vi måste
];

// Bygg en global spikplan: unika avdelningar tills vi når neededSpikes
const spikePlan = [];
const usedDivsGlobal = new Set();

for (const f of orderedFavs) {
  if (spikePlan.length >= neededSpikes) break;

  const d = Number(f.division);
  if (usedDivsGlobal.has(d)) continue;

  spikePlan.push({ ...f, division: d });
  usedDivsGlobal.add(d);
}

if (spikePlan.length < neededSpikes) {
  alert(
    'Det finns inte tillräckligt många avdelningar att spika i ' +
      `(behöver ${neededSpikes}, hittade ${spikePlan.length}). ` +
      'Minska antal kuponger eller antal spikar per kupong.'
  );
  return;
}


  // Hjälpare: slumpa array (Fisher–Yates, in-place)
  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

 


  // 2. Kandidat-hästar per avdelning
  const allHorsesPerDiv = {};

  if (usePopular) {
    // från befintliga kuponger (populärfält)
    getActiveCoupons().forEach((coupon) => {

      (coupon.selections || []).forEach((sel) => {
        const d = sel.divisionIndex;
        const set = (allHorsesPerDiv[d] ||= new Set());
        (sel.horses || []).forEach((n) => set.add(n));
      });
    });
  }

  // komplettera ALLTID med alla icke-strukna hästar i spelet
  divisions.forEach((div, idx) => {
  const divIndex = Number(div.index ?? (idx + 1));
    const set = (allHorsesPerDiv[divIndex] ||= new Set());
    (div.horses || [])
      .filter((h) => !h.scratched && typeof h.number === 'number')
      .forEach((h) => set.add(h.number));
  });

  // 3. Tolka mönster: antal hästar i ICKE-spik-avdelningar
  const divisionCount = divisions.length;
  const basePattern = parseSplitPattern(patternStr, divisionCount);

  let multiCountsBase = null;
  if (basePattern) {
    const ones = basePattern.filter((n) => n === 1).length;
    if (ones === spikesPerCoupon) {
      multiCountsBase = basePattern.filter((n) => n > 1);
    } else {
      console.warn(
        'split-pattern: antal 1:or matchar inte antal spikar – ignorerar mönstret',
        basePattern
      );
    }
  }

  const created = [];

const uniq = new Set(spikePlan.map(s => Number(s.division)));
if (uniq.size !== spikePlan.length) {
  console.error('spikePlan dubletter:', spikePlan.map(s => s.division));
  alert('Internt fel: spikplan fick dubletter. Ladda om och testa igen.');
  return;
}
  
    for (let i = 0; i < count; i++) {
  // Spikar för den här kupongen: ta ett segment ur spikePlan
  const start = i * spikesPerCoupon;
  const end = start + spikesPerCoupon;
  const spikesForThis = spikePlan.slice(start, end);

  if (spikesForThis.length < spikesPerCoupon) {
    console.warn('Fick för få spikar för kupong', i + 1, spikesForThis);
    continue;
  }

  const spikeDivSet = new Set(spikesForThis.map((s) => Number(s.division)));
const LOCKED_SPIKE_DIVS = new Set(spikeDivSet);

    // 5. Ordning för multi-antal (blanda)
    let patternForThis = null;
    if (multiCountsBase && multiCountsBase.length) {
      patternForThis = multiCountsBase.slice();
      shuffleInPlace(patternForThis);
    }

    const selections = [];
    let targetSupers = Math.max(0, supersPerCoupon || 0);
    let multiIdx = 0;

    // 6. Bygg upp alla avdelningar
   divisions.forEach((div, idxDiv) => {
  const divIndex = Number(div.index ?? (idxDiv + 1));
  const isSpikeDiv = spikeDivSet.has(divIndex);

      let targetCount;
      if (isSpikeDiv) {
        targetCount = 1; // spik = exakt 1 häst
      } else if (patternForThis && multiIdx < patternForThis.length) {
        targetCount = Math.max(2, patternForThis[multiIdx++]);
      } else {
        targetCount = 2; // fallback
      }

      let candidateNums = Array.from(allHorsesPerDiv[divIndex] || []);
      if (!candidateNums.length) return;

      const chosen = new Set();

      // favoriten alltid med
      const fav = getDivisionFavouriteNumber
        ? getDivisionFavouriteNumber(divIndex)
        : null;
      if (fav != null) {
        chosen.add(fav);
      }

      const nums = candidateNums.slice();
      shuffleInPlace(nums);

      for (const num of nums) {
        if (chosen.size >= targetCount) break;
        if (chosen.has(num)) continue;

        const isSuper =
          typeof isSuperskrall === 'function'
            ? isSuperskrall(divIndex, num)
            : false;

        if (isSuper) {
          if (targetSupers <= 0) continue;
          targetSupers--;
        }

        chosen.add(num);
      }

      // Fyll upp om vi inte nått targetCount
      if (chosen.size < targetCount) {
        for (const num of nums) {
          if (chosen.size >= targetCount) break;
          if (chosen.has(num)) continue;
          chosen.add(num);
        }
      }

      selections.push({
        divisionIndex: divIndex,
        horses: Array.from(chosen).sort((a, b) => a - b),
      });
    });

    // 7. Se till att favorit finns med, och att spik-avdelningar är rena favoriter
    ensureFavouriteInEachDivision(selections);
    fixSplitSpikesAfterTuning(selections, spikeDivSet);

    // 8. Justera superskrällar
    enforceSuperskrallCount(selections, spikeDivSet, supersPerCoupon || 0);

    // 9. Trimma priset mot maxpris (aldrig över, undvik för billigt)
    const radPris = getEffectiveRadPris();
    tuneReverseSelectionsToPrice(selections, maxPrice, radPris, 0, 200);

    let info = computeCouponPrice({ selections });
    let total = info.total;

    const maxAttempts = 80;
    const minAcceptable = Math.max(1, maxPrice * 0.7); // t.ex. 70% av målet
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      if (total > maxPrice) {
        // för dyr → ta bort hästar någonstans
        if (!removeRandomHorseSomewhere(selections)) break;
      } else if (total < minAcceptable) {
        // för billig → försök lägga till häst
        if (!addRandomHorseSomewhere(selections)) break;
        info = computeCouponPrice({ selections });
        if (info.total > maxPrice) {
          // råkade gå över → ångra sista ändringen genom att bryta
          break;
        }
      } else {
        // inom intervallet [minAcceptable, maxPrice]
        break;
      }

      // reparera spikmönstret efter varje ändring
      fixSplitSpikesAfterTuning(selections, spikeDivSet);
      info = computeCouponPrice({ selections });
      total = info.total;
    }

    // 10. Spara kupong
    const payload = {
    status: getNewCouponStatus(),
      name: `${baseName} ${i + 1}`,
      source: 'split',
      selections,
      splitMeta: {
        maxPrice,
        spikesPerCoupon,
        patternStr,
        supersPerCoupon,
        usePopular,
      },
    };

    const saved = await createCoupon(currentGameId, payload);
    saved.source = 'split';
    coupons.push(saved);
    created.push(saved);
  }

  if (!created.length) {
    alert('Kunde inte skapa några split-kuponger inom maxpriset.');
    return;
  }

  renderCouponList();
  renderCurrentDivision();
}





function updateSplitPatternSuggestions({ spikes, maxPrice, suggestionsBox }) {
  if (!suggestionsBox) return;

  suggestionsBox.innerHTML = '';

  const divCount = divisions.length || 0;
  if (!divCount || !spikes || !maxPrice) return;
  if (spikes > divCount) return;

  const radPris = getEffectiveRadPris(); // använder V85-insatsnivån
  const rest = divCount - spikes;
  const maxHorsesPerDiv = 15;            // rimlig övre gräns

  const patterns = [];

    function backtrack(pos, last, factors) {
    // vi kan fortfarande ha ett tak, men det är bara för prestanda
    if (patterns.length >= 100) return;

    if (pos === rest) {
      const counts = new Array(divCount).fill(1);
      // stoppa in våra “icke-spik”-tal efter spikarna
      for (let i = 0; i < rest; i++) {
        counts[spikes + i] = factors[i];
      }

      const rows = counts.reduce((p, c) => p * c, 1);
      const total = rows * radPris;

      if (total <= maxPrice) {
        patterns.push({ counts, rows, total });
      }
      return;
    }

    // 🔹 NYTT: icke-spik-avdelningar ska alltid ha minst 2 hästar
    const min = Math.max(2, last);
    for (let n = min; n <= maxHorsesPerDiv; n++) {
      const nextFactors = factors.concat(n);
      const approxRows =
        nextFactors.reduce((p, c) => p * c, 1) * Math.pow(1, spikes);
      const approxTotal = approxRows * radPris;
      if (approxTotal > maxPrice) break;

      backtrack(pos + 1, n, nextFactors);
    }
  }

  backtrack(0, 1, []);


  if (!patterns.length) {
    suggestionsBox.textContent = 'Inga förslag för vald insats/spikar.';
    return;
  }

  // 🔹 NYTT: visa dyraste först (så nära maxPrice som möjligt)
  patterns.sort((a, b) => b.total - a.total);

  // 🔹 NYTT: visa bara 10 förslag
  const top = patterns.slice(0, 10);

  for (const p of top) {
    const patternStr = p.counts.join('x');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pattern-suggestion';
    btn.textContent = `${patternStr} ≈ ${p.rows} rader (${formatMoney(
      p.total
    )} kr)`;
    btn.addEventListener('click', () => {
      const input = document.getElementById('split-pattern');
      if (input) input.value = patternStr;
    });
    suggestionsBox.appendChild(btn);
  }
}


//
// ---- Kuponglista ----
//


function getCouponGroupVisibilityKey() {
  return `trav_coupon_group_visibility_${currentGameId || 'global'}`;
}

function getCouponGroupVisibility() {
  try {
    const raw = localStorage.getItem(getCouponGroupVisibilityKey());
    if (raw) return JSON.parse(raw);
  } catch {}
  return { showWaiting: true, showInactive: true };
}

function setCouponGroupVisibility(next) {
  try { localStorage.setItem(getCouponGroupVisibilityKey(), JSON.stringify(next)); } catch {}
}

function syncCouponGroupToggleButtons() {
  const vis = getCouponGroupVisibility();
  const btnW = document.getElementById('btn-toggle-waiting-group');
  const btnI = document.getElementById('btn-toggle-inactive-group');
  if (btnW) {
    btnW.classList.toggle('primary', !!vis.showWaiting);
    btnW.textContent = vis.showWaiting ? 'Vänteläge: På' : 'Vänteläge: Av';
  }
  if (btnI) {
    btnI.classList.toggle('primary', !!vis.showInactive);
    btnI.textContent = vis.showInactive ? 'Inaktiva: På' : 'Inaktiva: Av';
  }
}

function initCouponGroupToggleButtons() {
  const btnW = document.getElementById('btn-toggle-waiting-group');
  const btnI = document.getElementById('btn-toggle-inactive-group');
  if (btnW && !btnW._bound) {
    btnW._bound = true;
    btnW.addEventListener('click', () => {
      const vis = getCouponGroupVisibility();
      vis.showWaiting = !vis.showWaiting;
      setCouponGroupVisibility(vis);
      syncCouponGroupToggleButtons();
      renderCouponList();
    });
  }
  if (btnI && !btnI._bound) {
    btnI._bound = true;
    btnI.addEventListener('click', () => {
      const vis = getCouponGroupVisibility();
      vis.showInactive = !vis.showInactive;
      setCouponGroupVisibility(vis);
      syncCouponGroupToggleButtons();
      renderCouponList();
    });
  }
  syncCouponGroupToggleButtons();
}

// ===== Plus-menyn =====
let _couponPlusMenu = null;
let _couponPlusBackdrop = null;

function closeCouponPlusMenu() {
  if (_couponPlusMenu) _couponPlusMenu.remove();
  if (_couponPlusBackdrop) _couponPlusBackdrop.remove();
  _couponPlusMenu = null;
  _couponPlusBackdrop = null;
}

function openCouponPlusMenu(anchorRect) {
  closeCouponPlusMenu();

  const backdrop = document.createElement('div');
  backdrop.className = 'coupon-plus-menu-backdrop';
  backdrop.addEventListener('click', closeCouponPlusMenu);

  const menu = document.createElement('div');
  menu.className = 'coupon-plus-menu';

  const head = document.createElement('div');
  head.className = 'cpm-head';
  head.innerHTML = `<span>Vad vill du göra?</span><span style="opacity:.7;cursor:pointer" aria-label="Stäng">x</span>`;
  head.querySelector('span:last-child').addEventListener('click', closeCouponPlusMenu);

  const list = document.createElement('div');
  list.className = 'cpm-list';

  const addItem = (ico, label, onClick) => {
    const item = document.createElement('div');
    item.className = 'cpm-item';
    item.innerHTML = `<span class="cpm-ico">${ico}</span><span>${label}</span>`;
    item.addEventListener('click', () => {
      closeCouponPlusMenu();
      onClick();
    });
    list.appendChild(item);
  };

  const sep = () => {
    const s = document.createElement('div');
    s.className = 'cpm-sep';
    list.appendChild(s);
  };

  const clickBtn = (id) => () => document.getElementById(id)?.click();

  // Snabbåtgärder
  addItem('🏁', 'Uppdatera vinnare', clickBtn('btn-update-winners'));
  addItem('🗨️', 'Hämta stallsnack', clickBtn('btn-fetch-stallsnack'));
  addItem('ℹ️', 'Info kupong', clickBtn('btn-info-coupon'));
  sep();

  // Skapa/ändra
  addItem('➕', 'Ny kupong', clickBtn('btn-add-coupon'));
  addItem('🧮', 'Skala kupong', () => openScaleMode());
  sep();

  addItem('🟦', 'Chans kupong', clickBtn('btn-open-chance'));
  addItem('🏆', 'Bästa raden', clickBtn('btn-open-best-row'));
  addItem('🪙', 'Jackpot kupong', clickBtn('btn-open-jackpot'));
  addItem('🧩', 'Split kupong', clickBtn('btn-open-split'));
  addItem('🔁', 'Omvänd kupong', clickBtn('btn-open-reverse'));
  sep();

  addItem('🧱', 'Fyll på kupong', clickBtn('btn-open-fill'));
  addItem('✅', 'Inte spelad kupong', clickBtn('btn-open-notplayed'));
  addItem('📋', 'Klistra kupong', clickBtn('btn-open-paste-coupon'));
  addItem('⬇️', 'Importera ATG', clickBtn('btn-open-import-atg'));
  addItem('🔗', 'Kombinera kuponger', clickBtn('btn-combine-coupons'));

  menu.appendChild(head);
  menu.appendChild(list);

  document.body.appendChild(backdrop);
  document.body.appendChild(menu);

  // position near anchor
  const pad = 10;
  let left = (anchorRect?.left ?? 0) + (anchorRect?.width ?? 0) + 12;
  let top = (anchorRect?.top ?? 0);

  // clamp
  const maxLeft = window.innerWidth - menu.offsetWidth - pad;
  const maxTop = window.innerHeight - menu.offsetHeight - pad;
  left = Math.max(pad, Math.min(left, maxLeft));
  top = Math.max(pad, Math.min(top, maxTop));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  _couponPlusMenu = menu;
  _couponPlusBackdrop = backdrop;
}

function renderCouponList() {
  const listEl = document.getElementById('coupon-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  // Plus-tile (Skapa/ändra)
  const plusTile = document.createElement('div');
  plusTile.className = 'coupon-plus-tile';
  plusTile.innerHTML = `
    <div class="coupon-plus-inner">
      <div class="coupon-plus-icon">＋</div>
      <div class="coupon-plus-sub">Skapa / ändra</div>
    </div>
  `;
  plusTile.addEventListener('click', (ev) => {
    const r = plusTile.getBoundingClientRect();
    openCouponPlusMenu(r);
  });
  listEl.appendChild(plusTile);
  try { syncCouponGroupToggleButtons(); } catch {}

  if (!coupons.length) {
    const p = document.createElement('p');
    p.className = 'coupon-hint';
    p.textContent = 'Inga kuponger inlagda ännu.';
    listEl.appendChild(p);
    return;
  }

  const groups = {
    pinned: [],
    active: [],
    waiting: [],
    inactive: [],
  };

  coupons.forEach((c) => {
    const st = normalizeStatus(c.status, c.active);
    const src = String(c.source || '').toLowerCase();
    const isPinned = (src === 'paste' || src === 'atg');

    if (isPinned) {
      groups.pinned.push(c);
      return;
    }

    if (st === COUPON_STATUS.ACTIVE) groups.active.push(c);
    else if (st === COUPON_STATUS.WAITING) groups.waiting.push(c);
    else groups.inactive.push(c);
  });

  // ordning: inklistrade/importerade först, aktiva sen, vänteläge, inaktiva sist
  const vis = getCouponGroupVisibility();

  const orderedGroups = [
    { key: 'pinned', title: 'Inklistrade & importerade' },
    { key: 'active', title: 'Aktiva kuponger' },
    { key: 'waiting', title: 'Vänteläge' },
    { key: 'inactive', title: 'Inaktiva kuponger' },
  ];

  let runningIndex = 0;

  orderedGroups.forEach(({ key, title }) => {
    const arr = groups[key] || [];
    if (!arr.length) return;

    if (key === 'waiting' && !vis.showWaiting) return;
    if (key === 'inactive' && !vis.showInactive) return;

    const header = document.createElement('div');
    header.className = 'coupon-group-title';
    header.textContent = title;
    listEl.appendChild(header);

    const wrap = document.createElement('div');
    wrap.className = `coupon-group coupon-group-${key}`;
    listEl.appendChild(wrap);

    arr.forEach((coupon) => {
      const idx = runningIndex++;

    const isIdea = coupon.source === 'idea';

    const card = document.createElement('div');
    card.className = 'coupon-card';

    // Importerade ATG-kuponger får egen stil
    const _srcLower = String(coupon.source || '').toLowerCase();
    if (_srcLower === 'atg') {
      card.classList.add('imported-atg');
    }
    // Inklistrade kuponger får egen stil
    if (_srcLower === 'paste') {
      card.classList.add('pasted-coupon-card');
    }

const couponStatus = normalizeStatus(coupon.status, coupon.active);
if (couponStatus === COUPON_STATUS.INACTIVE) {
  card.classList.add('inactive');
} else if (couponStatus === COUPON_STATUS.WAITING) {
  card.classList.add('waiting');
}

    
    // markera split-kuponger med extra klass
    if (coupon.source === 'split') {
      card.classList.add('split-coupon-card');
    }

    // Jackpot-kuponger – egen bakgrund
    if (coupon.source === 'jackpot') {
      card.classList.add('jackpot-coupon-card');
    }

    // Fyllda kuponger ("Fyll på") – egen bakgrund
    if (coupon.source === 'fill') {
      card.classList.add('filled-coupon-card');
    }

    // framtida omvända kuponger
   if (coupon.source === 'reverse') {
  card.classList.add('reverse-coupon-card');
}


    if (isIdea) {
      card.classList.add('my-coupon-card'); // "Min kupong"
    }

    // Omvänd-läge: gör kortet klickbart
    if (reverseMode) {
      card.classList.add('selectable');
    }


const header = document.createElement('div');
header.className = 'coupon-card-header';

const baseName = isIdea ? 'Min kupong' : 'Kupong';
const defaultTitle = `${baseName} ${idx + 1}`;

const title = document.createElement('div');
title.className = 'coupon-card-title';
title.textContent = coupon.name || defaultTitle;

    const leftHeader = document.createElement('div');
    leftHeader.appendChild(title);

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn tiny danger';
    btnDelete.classList.add('icon-btn');
    btnDelete.title = 'Ta bort';
    btnDelete.setAttribute('aria-label', 'Ta bort');
    btnDelete.textContent = '🗑';

    btnDelete.addEventListener('click', async () => {
      const ok = window.confirm(
        'Är du säker på att du vill ta bort denna kupong?'
      );
      if (!ok) return;

      try {
        await deleteCoupon(currentGameId, coupon._id);
        coupons = coupons.filter((c) => c._id !== coupon._id);
        renderCouponList();
        renderCurrentDivision(); // 🔹 uppdatera populärfältet
      } catch (err) {
        console.error(err);
        alert('Kunde inte ta bort kupongen.');
      }
    });

    const actions = document.createElement('div');
    actions.className = 'coupon-card-actions';

    // Redigera (Min kupong) eller Kopiera (övriga kuponger)
    if (isIdea) {
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn tiny';
      btnEdit.classList.add('icon-btn');
        btnEdit.title = 'Redigera';
        btnEdit.setAttribute('aria-label', 'Redigera');
        btnEdit.textContent = '✏️';
      btnEdit.addEventListener('click', async (e) => {
        e.stopPropagation();
        const draft = await saveIdeaAsDraftIfNeeded();
        if (draft) {
          renderCouponList();
        }
        applyCouponSelectionsToIdea(coupon);
        setIdeaEditingState(coupon);
        // liten hint till användaren
        try {
          const ideaBox = document.getElementById('idea-number-list');
          ideaBox?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {}
      });
      actions.appendChild(btnEdit);
    } else {
      const btnCopy = document.createElement('button');
      btnCopy.className = 'btn tiny';
      btnCopy.classList.add('icon-btn');
        btnCopy.title = 'Kopiera';
        btnCopy.setAttribute('aria-label', 'Kopiera');
        btnCopy.textContent = '📋';
      btnCopy.addEventListener('click', async (e) => {
        e.stopPropagation();
        const draft = await saveIdeaAsDraftIfNeeded();
        if (draft) {
          renderCouponList();
        }
        setIdeaEditingState(null);
        applyCouponSelectionsToIdea(coupon);
        try {
          const ideaBox = document.getElementById('idea-number-list');
          ideaBox?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {}
      });
      actions.appendChild(btnCopy);
    }

    actions.appendChild(btnDelete);

    header.appendChild(leftHeader);
    header.appendChild(actions);
    card.appendChild(header);

    // Bygg tabell: Avd / Hästar
    const table = document.createElement('table');
    table.className = 'coupon-card-table';

    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    const thAvd = document.createElement('th');
    thAvd.textContent = 'Avd';
    const thHorses = document.createElement('th');
    thHorses.textContent = 'Hästar';
    hrow.appendChild(thAvd);
    hrow.appendChild(thHorses);
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const byDiv = {};
    (coupon.selections || []).forEach((sel) => {
      byDiv[sel.divisionIndex] = (sel.horses || []).slice().sort((a, b) => a - b);
    });

    const allDivIndices = divisions
      .map((d) => d.index ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);

    allDivIndices.forEach((divIndex) => {
      const tr = document.createElement('tr');
      const tdAvd = document.createElement('td');
      tdAvd.textContent = String(divIndex);

      const tdHorses = document.createElement('td');
const nums = byDiv[divIndex];

const winnerNum = getWinnerNumber(divIndex);
const hasWinnerOnCoupon = Number.isFinite(winnerNum) && winnerNum > 0 && Array.isArray(nums) && nums.includes(winnerNum);


if (nums && nums.length) {
  // plocka ut favorit + andrahandsfavorit i just den här avdelningen
  let favNum = null;
  let secondFavNum = null;

  if (typeof getDivisionHorsesSortedByPercent === 'function') {
    const sorted = getDivisionHorsesSortedByPercent(divIndex) || [];
    if (sorted.length > 0) {
      favNum = sorted[0].number;
    }
    if (sorted.length > 1) {
      secondFavNum = sorted[1].number;
    }
  } else if (typeof getDivisionFavouriteNumber === 'function') {
    favNum = getDivisionFavouriteNumber(divIndex);
  }


  if (nums.length === 1) {
    // Spik – visa nummer + hästnamn
    const num = nums[0];
    const name = getHorseName(divIndex, num);

    const spanNum = document.createElement('span');
    spanNum.textContent = String(num);

    if (hasWinnerOnCoupon && winnerNum === num) {
      spanNum.classList.add('winner-on-coupon');
    }

     // superskräll?
    if (isSuperskrall(divIndex, num)) {
      spanNum.classList.add('superskrall-number');
    }

    // favorit / andrahandsfavorit i loppet?
    if (favNum != null && favNum === num) {
      spanNum.classList.add('favourite-number-coupon');
    } else if (secondFavNum != null && secondFavNum === num) {
      spanNum.classList.add('second-favourite-number');
    }


    tdHorses.appendChild(spanNum);

    if (name) {
      const spanName = document.createElement('span');
      spanName.textContent = ` ${name}`;
      tdHorses.appendChild(spanName);
    }
    } else {
    // Flera hästar – en span per nummer så vi kan markera superskräll / favorit / andrahandsfavorit
    nums.forEach((num, index) => {
      const span = document.createElement('span');
      span.textContent = String(num);

      if (hasWinnerOnCoupon && winnerNum === num) {
        span.classList.add('winner-on-coupon');
      }

      if (isSuperskrall(divIndex, num)) {
        span.classList.add('superskrall-number');
      }

      if (favNum != null && favNum === num) {
        span.classList.add('favourite-number-coupon');
      } else if (secondFavNum != null && secondFavNum === num) {
        span.classList.add('second-favourite-number');
      }


      tdHorses.appendChild(span);

      if (index < nums.length - 1) {
        tdHorses.appendChild(document.createTextNode(' '));
      }
    });
  }
} else {
  tdHorses.textContent = '';
}



      tr.appendChild(tdAvd);
      tr.appendChild(tdHorses);
      tbody.appendChild(tr);
    });

      table.appendChild(tbody);
    card.appendChild(table);

        // 🔹 Räkna ut priset för den här kupongen
    const price = computeCouponPrice(coupon);
    const priceWrap = document.createElement('div');
    priceWrap.className = 'coupon-price';

    const main = document.createElement('div');
    main.className = 'coupon-price-main';
    main.textContent = `Pris: ${formatMoney(price.total)} kr`;

    const priceSub = document.createElement('div');
    priceSub.className = 'coupon-price-sub';

    if (price.rows > 0) {
      priceSub.textContent =
        `${price.countsExpr} = ${price.rows} rader ` +
        `• Radpris: ${formatMoney(price.radPris)} kr`;
    } else {
      priceSub.textContent = 'Inga val i kupongen.';
    }

      priceWrap.appendChild(main);
    priceWrap.appendChild(priceSub);

    // Skapad-datum (endast datum + tid) längst ner till vänster
    const createdAtRaw = coupon.createdAt || coupon.created_at || coupon.created || coupon.updatedAt || coupon.updated_at || null;
    const date = createdAtRaw ? new Date(createdAtRaw) : null;
    const hasValidDate = !!(date && !Number.isNaN(date.getTime()));
    if (hasValidDate) {
      const created = document.createElement('div');
      created.className = 'coupon-created-at';
      created.textContent = date.toLocaleString('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      priceWrap.appendChild(created);
    }

    card.appendChild(priceWrap);

// --- Footer: kupongläge (Aktiv / Vänteläge / Inaktiv) ---
const footer = document.createElement('div');
footer.className = 'coupon-card-footer';

const stateWrap = document.createElement('div');
stateWrap.className = 'coupon-state-switch';

const makeBtn = (state, label) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn tiny coupon-state-btn';
  b.dataset.state = state;
  b.textContent = label;
  return b;
};

const btnA = makeBtn(COUPON_STATUS.ACTIVE, '+');
const btnW = makeBtn(COUPON_STATUS.WAITING, '?');
const btnI = makeBtn(COUPON_STATUS.INACTIVE, '−');

stateWrap.appendChild(btnA);
stateWrap.appendChild(btnW);
stateWrap.appendChild(btnI);

const applyStateUI = () => {
  const st = normalizeStatus(coupon.status, coupon.active);
  btnA.classList.toggle('on', st === COUPON_STATUS.ACTIVE);
  btnW.classList.toggle('on', st === COUPON_STATUS.WAITING);
  btnI.classList.toggle('on', st === COUPON_STATUS.INACTIVE);

  card.classList.toggle('inactive', st === COUPON_STATUS.INACTIVE);
  card.classList.toggle('waiting', st === COUPON_STATUS.WAITING);
};

applyStateUI();

async function setCouponState(next) {
  const current = normalizeStatus(coupon.status, coupon.active);
  if (next === current) return;

  try {
    const updated = await updateCouponStatus(currentGameId, coupon._id, next);
    coupon.status = normalizeStatus(updated?.status, updated?.active);
    coupon.active = coupon.status === COUPON_STATUS.ACTIVE;

    renderCouponList();
    renderCurrentDivision();
  } catch (err) {
    console.error(err);
    alert('Kunde inte uppdatera kupongläge.');
  }
}

[btnA, btnW, btnI].forEach((b) => {
  b.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setCouponState(b.dataset.state);
  });
});

footer.appendChild(stateWrap);
card.appendChild(footer);

// Klick på kupongen i normalläge: Vänteläge -> Aktiv
if (!reverseMode && !fillMode && !notPlayedMode) {
  card.addEventListener('click', (ev) => {
    const target = ev.target;
    if (target.closest && target.closest('button')) return;

    const st = normalizeStatus(coupon.status, coupon.active);
    if (st === COUPON_STATUS.WAITING) {
      setCouponState(COUPON_STATUS.ACTIVE);
    }
  });
}



    // Klick på kupongen i "Omvänd kupong"-läge
    if (reverseMode) {
      card.addEventListener('click', (ev) => {
        // ignorera klick på knappar (t.ex. Ta bort)
        const target = ev.target;
        if (target.closest && target.closest('button')) {
          return;
        }

        selectedReverseCoupon = coupon;

        // ta bort markering från andra kort
        document
          .querySelectorAll('.coupon-card.selected-for-reverse')
          .forEach((c) => c.classList.remove('selected-for-reverse'));

        card.classList.add('selected-for-reverse');

        // öppna panelen och fyll i fälten
           openReversePanelForCoupon(coupon, idx, card);

      });
    }

    // Klick på kupongen i "Fyll på kupong"-läge
if (fillMode) {
  card.classList.add('selectable');

  card.addEventListener('click', (ev) => {
    const target = ev.target;
    if (target.closest && target.closest('button')) return; // ignorera knappar

    selectedFillCoupon = coupon;

    document.querySelectorAll('.coupon-card.selected-for-fill')
      .forEach((c) => c.classList.remove('selected-for-fill'));
    card.classList.add('selected-for-fill');

    openFillPanelForCoupon(coupon, idx, card);
  });
}


    


// Klick på kupongen i "Skala kupong"-läge
if (scaleMode) {
  card.classList.add('selectable');

  card.addEventListener('click', (ev) => {
    const target = ev.target;
    if (target.closest && target.closest('button')) return;

    selectedScaleCoupon = coupon;

    document.querySelectorAll('.coupon-card.selected-for-scale')
      .forEach((c) => c.classList.remove('selected-for-scale'));
    card.classList.add('selected-for-scale');

    const price = computeCouponPrice(coupon).total || 0;
    if (scaleSelectedInfo) scaleSelectedInfo.textContent = `Vald kupong: ${coupon.name || '—'} (${price} kr)`;
  });
}

// Klick på kupongen i "Inte spelad kupong"-läge
if (notPlayedMode) {
  card.classList.add('selectable');

  card.addEventListener('click', async (ev) => {
    const target = ev.target;
    if (target.closest && target.closest('button')) return;

    // markera vald
    selectedNotPlayedCoupon = coupon;
    document.querySelectorAll('.coupon-card.selected-for-notplayed')
      .forEach((c) => c.classList.remove('selected-for-notplayed'));
    card.classList.add('selected-for-notplayed');

    try {
      const isV85 = String(game?.gameType || '').toUpperCase() === 'V85';
      const divCount = Array.isArray(divisions) ? divisions.length : 0;
      if (!divCount) throw new Error('Inga avdelningar hittades.');

      const outSelections = [];
      for (let di = 0; di < divCount; di++) {
        const allNums = (divisions[di]?.horses || [])
          .map(h => Number(h?.number ?? h?.num))
          .filter(n => Number.isFinite(n));

        const picked = (coupon?.selections?.[di]?.horses || [])
          .map(n => Number(n))
          .filter(n => Number.isFinite(n));

        const pickedSet = new Set(picked);
        const rest = allNums.filter(n => !pickedSet.has(n));

        const normRest = (typeof normalizeHorseNumberList === 'function')
          ? normalizeHorseNumberList(rest)
          : Array.from(new Set(rest)).sort((a,b) => a-b);

        outSelections.push({ divisionIndex: di, horses: normRest });
      }

      const payload = {
        status: (typeof getNewCouponStatus === 'function') ? getNewCouponStatus() : 'Preliminär',
        name: `Inte spelad • ${coupon?.name || 'Kupong'}`,
        source: 'notplayed',
        stakeLevel: isV85 ? (stakeLevel || 'original') : 'original',
        selections: outSelections,
      };

      const saved = await createCoupon(currentGameId, payload);
      saved.source = 'notplayed';
      coupons.push(saved);

      try { renderCouponList(); } catch {}
      if (typeof showToast === 'function') showToast('Inte spelad kupong skapad!', 'success');
      exitNotPlayedMode();
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Kunde inte skapa Inte spelad kupong.');
    }
  });
}

    wrap.appendChild(card);
    });
  });
}


function countSpikesInCoupon(coupon) {
  if (!coupon || !Array.isArray(coupon.selections)) return 0;
  let spikes = 0;

  coupon.selections.forEach((sel) => {
    const horses = sel.horses || [];
    if (horses.length === 1) spikes++;
  });

  return spikes;
}

function parsePastedCouponText(text) {
  const clean = String(text || '').replace(/\r/g, '');
  const lines = clean
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  // GameType: ofta första raden "V64"
  const gameType = (lines[0] || '').match(/^(V\d{2}|GS75|V75|V86|V85|V64|V65)$/i)?.[1] || '';

  // Datum: första YYYY-MM-DD vi hittar
  const date = (clean.match(/\b(\d{4}-\d{2}-\d{2})\b/) || [])[1] || '';

  const selections = [];

  for (const line of lines) {
    // matchar "1: ...."
    const m = line.match(/^(\d+)\s*:\s*(.+)$/);
    if (!m) continue;

    const divisionIndex = Number(m[1]);
    if (!Number.isFinite(divisionIndex) || divisionIndex <= 0) continue;

    let rest = m[2];

    // ta bort reserver i parentes "(6, 4)" osv
    rest = rest.replace(/\(.*?\)\s*$/, '').trim();

    // plocka alla tal (hästnummer)
    const nums = Array.from(rest.matchAll(/\b(\d{1,2})\b/g))
      .map(x => Number(x[1]))
      .filter(n => Number.isFinite(n) && n > 0);

    const horses = Array.from(new Set(nums)).sort((a, b) => a - b);
    if (!horses.length) continue;

    selections.push({ divisionIndex, horses });
  }

  selections.sort((a, b) => a.divisionIndex - b.divisionIndex);

  if (!selections.length) {
    throw new Error('Kunde inte hitta avdelningar. Format ska vara "1: ...", "2: ..." osv.');
  }

  const nameParts = [];
  if (gameType) nameParts.push(gameType.toUpperCase());
  if (date) nameParts.push(date);
  nameParts.push('Klistrad');

  return { name: nameParts.join(' '), selections };
}



// Lägg till en extra häst i en viss avdelning så den slutar vara spik
function breakSpikeInDivision(divIndex, selection) {
  const division = divisions.find((d) => (d.index ?? 0) === divIndex);
  if (!division || !division.horses) return;

  const existing = new Set(selection.horses || []);
  const candidates = (division.horses || []).filter(
    (h) => h && !h.scratched && !existing.has(h.number)
  );
  if (!candidates.length) return;

  const chosen =
    candidates[Math.floor(Math.random() * candidates.length)];
  existing.add(chosen.number);
  selection.horses = Array.from(existing).sort((a, b) => a - b);
}

// Gör slutgiltigt så att kupongen har EXAKT targetSpikeCount spikar,
// och inga spikar i divisions som fanns i originalSpikeDivSet.
function finalizeReverseSpikes(
  selections,
  originalSpikeDivSet,
  targetSpikeCount
) {
  if (!Array.isArray(selections)) return;

  // 1) Ta bort spikar i avdelningar som var spik i originalet
  selections.forEach((sel) => {
    if (
      originalSpikeDivSet.has(sel.divisionIndex) &&
      Array.isArray(sel.horses) &&
      sel.horses.length === 1
    ) {
      breakSpikeInDivision(sel.divisionIndex, sel);
    }
  });

  let current = countSpikesInSelections(selections);

  // 2) Om vi har fler spikar än önskat → bryt slumpade spikar
  if (current > targetSpikeCount) {
    const spikeSelections = selections.filter(
      (sel) =>
        Array.isArray(sel.horses) &&
        sel.horses.length === 1 &&
        !originalSpikeDivSet.has(sel.divisionIndex)
    );

    // slumpa ordning
    for (let i = spikeSelections.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spikeSelections[i], spikeSelections[j]] = [
        spikeSelections[j],
        spikeSelections[i],
      ];
    }

    for (const sel of spikeSelections) {
      if (current <= targetSpikeCount) break;
      breakSpikeInDivision(sel.divisionIndex, sel);
      current = countSpikesInSelections(selections);
    }
  }

  // 3) Om vi har för få spikar → gör slumpat några multi-avdelningar till spik
  while (current < targetSpikeCount) {
    const multiSelections = selections.filter(
      (sel) =>
        Array.isArray(sel.horses) &&
        sel.horses.length > 1 &&
        !originalSpikeDivSet.has(sel.divisionIndex)
    );
    if (!multiSelections.length) break;

    const sel =
      multiSelections[Math.floor(Math.random() * multiSelections.length)];
    const horses = sel.horses || [];
    const chosen = horses[Math.floor(Math.random() * horses.length)];
    sel.horses = [chosen]; // nu spik
    current = countSpikesInSelections(selections);
  }
}


function ensureUniqueCouponName(name) {
  const existing = new Set((coupons || []).map((c) => c.name || ''));

  if (!existing.has(name)) return name;

  // Plocka ut bas + ev. redan befintlig siffra i slutet
  const m = name.match(/^(.*?)(?:\s+(\d+))?$/);
  const base = (m && m[1] ? m[1] : name).trim();
  let n = m && m[2] ? parseInt(m[2], 10) : 1;

  let candidate = name;
  while (existing.has(candidate)) {
    n += 1;
    candidate = `${base} ${n}`;
  }
  return candidate;
}


function openReversePanelForCoupon(coupon, idx, cardEl) {
  if (
    !reversePanelEl ||
    !reverseNameInputEl ||
    !reversePriceInputEl ||
    !reverseSpikesInputEl
  ) {
    return;
  }

  // Basnamn + rubrik i formuläret
  const baseName = coupon.name || `Kupong ${idx + 1}`;
  const reverseTitle = `Omvänd ${baseName}`;

  // Sätt fältvärden
  reverseNameInputEl.value = reverseTitle;

 const price = computeCouponPrice(coupon);
const baseTotal = Math.round(price.total || 0);





// Försök hitta närmaste preset till originalpriset
if (reversePriceSliderEl && reversePriceInputEl) {
  let bestIdx = REVERSE_PRICE_PRESETS.length - 1; // default "egen"
  let bestDiff = Infinity;

  for (let i = 0; i < REVERSE_PRICE_PRESETS.length; i++) {
    const p = REVERSE_PRICE_PRESETS[i];
    if (p === 'egen') continue;
    const diff = Math.abs(p - baseTotal);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  reversePriceSliderEl.value = String(bestIdx);
  reversePriceInputEl.value =
    REVERSE_PRICE_PRESETS[bestIdx] === 'egen'
      ? String(baseTotal)
      : String(REVERSE_PRICE_PRESETS[bestIdx]);

  // uppdatera label + disabled-state
  if (typeof syncReversePriceFromSlider === 'function') {
    syncReversePriceFromSlider();
  }
}

// Spikar från originalet → sätt slider + text
const spikes = countSpikesInCoupon(coupon);
if (reverseSpikesInputEl) {
  reverseSpikesInputEl.value = String(spikes);
  if (reverseSpikesDisplayEl) {
    reverseSpikesDisplayEl.textContent = String(spikes);
  }
}

// Superskrällar startar på 0
if (reverseSupersInputEl) {
  reverseSupersInputEl.value = '0';
  if (reverseSupersDisplayEl) {
    reverseSupersDisplayEl.textContent = '0';
  }
}


  // Nollställ superskrällar varje gång panelen öppnas
  if (reverseSupersInputEl) {
    reverseSupersInputEl.value = '0';
  }

  // Visa panelen – position styrs helt av CSS (#reverse-panel i trav.css)
  reversePanelEl.hidden = false;
  reversePanelEl.classList.add('open');
}






function buildCouponPayloadFromIdea() {
  const selections = [];

  divisions.forEach((div) => {
    const divIndex = div.index ?? 0;
    const key = getDivisionKey(div); // samma nyckel som vi använder i övrigt

    const set = selectedIdeaNumbersByDivIndex[key];
    if (set && set.size > 0) {
      selections.push({
        divisionIndex: divIndex,
        horses: Array.from(set).sort((a, b) => a - b),
      });
    }
  });

  return { selections };
}

function goToDivision(newIndex) {
  if (newIndex < 0 || newIndex >= divisions.length) return;
  currentIndex = newIndex;
  renderCurrentDivision();
}

function setupSwipeNavigation() {
  const swipeArea = document.querySelector('.big-block');
  if (!swipeArea) return;

  let touchStartX = 0;
  let touchStartY = 0;

  swipeArea.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    },
    { passive: true }
  );

  swipeArea.addEventListener(
    'touchend',
    (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;

      // Bara horisontella swipes, minst 50px
      if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) {
        return;
      }

      if (dx < 0) {
        // swipe vänster → nästa avdelning
        goToDivision(currentIndex + 1);
      } else {
        // swipe höger → föregående avdelning
        goToDivision(currentIndex - 1);
      }
    },
    { passive: true }
  );
}


function openFillPanelForCoupon(coupon, idx, cardEl) {
  if (!fillPanelEl) return;

  fillAnchorCardEl = cardEl || null;

  const baseName = coupon.name || `Kupong ${idx + 1}`;
  if (fillSelectedInfoEl) {
    fillSelectedInfoEl.textContent = `Vald kupong: ${baseName}`;
  }

  // Rimliga defaultvärden (om användaren inte skrivit något)
  const basePrice = computeCouponPrice(coupon)?.total || 0;
  if (fillPriceEl && (!fillPriceEl.value || Number(fillPriceEl.value) <= 0)) {
    // default: lite över grundkupongen, men minst 200
    fillPriceEl.value = String(Math.max(200, Math.ceil(basePrice)));
  }
  if (fillCountEl && (!fillCountEl.value || Number(fillCountEl.value) <= 0)) fillCountEl.value = '5';

  fillPanelEl.hidden = false;

  // Positionera panelen nära kortet på desktop
  requestAnimationFrame(() => {
    try { positionFillPanelNearCard(fillAnchorCardEl); } catch {}
  });
}

function openScaleMode() {
  scaleMode = true;
  reverseMode = false;
  fillMode = false;
  notPlayedMode = false;

  selectedScaleCoupon = null;
  document.querySelectorAll('.coupon-card.selected-for-scale')
    .forEach((c) => c.classList.remove('selected-for-scale'));

  // visa panel
  if (scalePanel) scalePanel.hidden = false;

  // uppdatera info
  if (scaleSelectedInfo) scaleSelectedInfo.textContent = 'Välj en kupong i listan…';

  // sync metod
  const syncMethod = () => {
    const v = String(scaleMethod?.value || 'percent');
    if (scalePercentWrap) scalePercentWrap.hidden = (v !== 'percent');
    if (scalePriceWrap) scalePriceWrap.hidden = (v !== 'price');
  };
  if (scaleMethod && !scaleMethod._bound) {
    scaleMethod._bound = true;
    scaleMethod.addEventListener('change', syncMethod);
  }
  if (scalePercent && scalePercentDisplay && !scalePercent._bound) {
    scalePercent._bound = true;
    const sync = () => { scalePercentDisplay.textContent = `${scalePercent.value}%`; };
    scalePercent.addEventListener('input', sync);
    sync();
  }
  syncMethod();
}

function closeScaleMode() {
  scaleMode = false;
  selectedScaleCoupon = null;
  if (scalePanel) scalePanel.hidden = true;
  document.querySelectorAll('.coupon-card.selected-for-scale')
    .forEach((c) => c.classList.remove('selected-for-scale'));
}

function getHorseScore(divisionIndex, horseNumber) {
  const div = findDivisionByIndex(divisionIndex);
  const horse = div?.horses?.find((h) => h.number === horseNumber);
  if (!horse) return 0;

  const vp = (horse.vPercent != null ? Number(horse.vPercent) :
            (horse.v85Percent != null ? Number(horse.v85Percent) : null));
  if (Number.isFinite(vp)) return vp;

  const vod = horse.vOdds != null ? Number(horse.vOdds) : null;
  if (Number.isFinite(vod) && vod > 0) return 100 / vod;

  const pod = horse.pOdds != null ? Number(horse.pOdds) : null;
  if (Number.isFinite(pod) && pod > 0) return 80 / pod;

  return 0;
}

function cloneSelections(selections) {
  return (selections || []).map((s) => ({
    divisionIndex: s.divisionIndex,
    horses: Array.isArray(s.horses) ? s.horses.slice() : [],
  }));
}

function buildScaledCoupon(baseCoupon, targetTotal) {
  const work = {
    ...baseCoupon,
    selections: cloneSelections(baseCoupon.selections),
  };

  const orig = computeCouponPrice(baseCoupon).total || 0;
  const radPris = getEffectiveRadPrisForCoupon(baseCoupon);
  const clampTarget = Math.max(radPris || 1, Number(targetTotal) || 1);

  let best = computeCouponPrice(work).total || 0;
  let guard = 0;

  const recompute = () => (computeCouponPrice(work).total || 0);

  // SCALE DOWN
  if (best > clampTarget) {
    while (best > clampTarget && guard++ < 800) {
      let bestCandidate = null;

      for (let i = 0; i < work.selections.length; i++) {
        const sel = work.selections[i];
        if (!sel || !Array.isArray(sel.horses) || sel.horses.length <= 1) continue;

        // ta bort "sämsta" hästen i denna avdelning
        const sorted = sel.horses.slice().sort((a,b) => getHorseScore(sel.divisionIndex, a) - getHorseScore(sel.divisionIndex, b));
        const removeNum = sorted[0];

        const nextSel = cloneSelections(work.selections);
        nextSel[i].horses = nextSel[i].horses.filter((n) => n !== removeNum);

        const temp = { ...work, selections: nextSel };
        const tempTotal = computeCouponPrice(temp).total || 0;

        if (tempTotal >= clampTarget) {
          // bästa kandidat = närmast target men fortfarande >=
          if (!bestCandidate || tempTotal < bestCandidate.total) {
            bestCandidate = { i, horses: nextSel[i].horses, total: tempTotal };
          }
        } else {
          // om ingen kan stanna över target, välj som största men under
          if (!bestCandidate) bestCandidate = { i, horses: nextSel[i].horses, total: tempTotal, under: true };
          else if (bestCandidate.under && tempTotal > bestCandidate.total) bestCandidate = { i, horses: nextSel[i].horses, total: tempTotal, under: true };
        }
      }

      if (!bestCandidate) break;

      work.selections[bestCandidate.i].horses = bestCandidate.horses;
      best = recompute();

      if (best <= clampTarget) break;
    }
  }

  // SCALE UP (för percent > 100 / target större)
  if (best < clampTarget) {
    guard = 0;
    while (best < clampTarget && guard++ < 800) {
      let bestCandidate = null;

      for (let i = 0; i < work.selections.length; i++) {
        const sel = work.selections[i];
        const div = findDivisionByIndex(sel.divisionIndex);
        if (!div?.horses) continue;

        const selected = new Set(sel.horses || []);
        const candidates = div.horses
          .map((h) => h.number)
          .filter((n) => typeof n === 'number' && !selected.has(n));

        if (!candidates.length) continue;

        // lägg till bästa kandidat
        candidates.sort((a,b) => getHorseScore(sel.divisionIndex, b) - getHorseScore(sel.divisionIndex, a));
        const addNum = candidates[0];

        const nextSel = cloneSelections(work.selections);
        nextSel[i].horses = nextSel[i].horses.concat([addNum]);

        const temp = { ...work, selections: nextSel };
        const tempTotal = computeCouponPrice(temp).total || 0;

        // välj närmast över target, annars största under
        if (tempTotal <= clampTarget) {
          if (!bestCandidate || tempTotal > bestCandidate.total) bestCandidate = { i, horses: nextSel[i].horses, total: tempTotal, under: true };
        } else {
          if (!bestCandidate || (bestCandidate.under ? true : tempTotal < bestCandidate.total)) {
            bestCandidate = { i, horses: nextSel[i].horses, total: tempTotal, under: false };
          }
        }
      }

      if (!bestCandidate) break;

      work.selections[bestCandidate.i].horses = bestCandidate.horses;
      best = recompute();

      if (best >= clampTarget) break;
    }
  }

  return work;
}

async function doScaleCoupon() {
  if (!selectedScaleCoupon) {
    alert('Välj en kupong att skala (klicka på en kupong i listan).');
    return;
  }

  const base = selectedScaleCoupon;
  const basePrice = computeCouponPrice(base).total || 0;

  const method = String(scaleMethod?.value || 'percent');
  let target = basePrice;

  if (method === 'price') {
    target = Number(scaleTargetPrice?.value || 0) || basePrice;
  } else {
    const pct = Number(scalePercent?.value || 100) || 100;
    target = Math.max(1, Math.round((basePrice * pct) / 100));
  }

  const scaled = buildScaledCoupon(base, target);
  const scaledPrice = computeCouponPrice(scaled).total || 0;

  const status = (typeof getNewCouponStatus === 'function') ? getNewCouponStatus() : 'waiting';
  const pctLabel = method === 'price' ? `${target}kr` : `${scalePercent?.value || 100}%`;

  const payload = {
    name: `${base.name || 'Kupong'} (Skalad ${pctLabel})`,
    status,
    source: 'scale',
    selections: scaled.selections,
  };

  try {
    const saved = await createCoupon(currentGameId, payload);
    coupons.push(saved);
    renderCouponList();
    closeScaleMode();
    if (typeof showToast === 'function') showToast(`Skalad kupong skapad: ${scaledPrice} kr`, 'ok');
  } catch (err) {
    console.error(err);
    alert('Kunde inte skapa skalad kupong.');
  }
}





// =====================
// Manuell vinnare-knapp i topp-raden (så du alltid hittar den)
// =====================
function ensureManualWinnerButton() {
  try {
    const host = document.querySelector('.coupon-idea-actions');
    if (!host) return;

    if (document.getElementById('btn-winner-manual')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-winner-manual';
    btn.className = 'btn small';
    btn.textContent = 'Vinnare manuellt';
    btn.addEventListener('click', () => {
      const section = ensureWinnerSummarySection();
      section.hidden = false;

      const ed = document.getElementById('winner-edit');
      if (ed) {
        const isHidden = ed.hasAttribute('hidden');
        if (isHidden) {
          ed.removeAttribute('hidden');
          try { renderWinnerEditor(); } catch {}
        } else {
          ed.setAttribute('hidden', '');
        }
      }

      try { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
    });

    // lägg efter "Uppdatera vinnare" om den finns, annars sist
    const after = document.getElementById('btn-update-winners');
    if (after && after.parentElement === host) {
      after.insertAdjacentElement('afterend', btn);
    } else {
      host.appendChild(btn);
    }
  } catch (e) {
    // ignore
  }
}
// =====================
// 🏆 Vinnare-block (ovanför kupongerna)
// =====================
function ensureWinnerSummarySection() {
  let section = document.getElementById('winner-summary');
  if (section) return section;

  // skapa sektion dynamiskt (så vi inte är beroende av overview.html)
  section = document.createElement('section');
  section.id = 'winner-summary';
  section.className = 'winner-summary';
  section.hidden = false;

  const inner = document.createElement('div');
  inner.className = 'winner-summary-inner';

  const titleRow = document.createElement('div');
titleRow.className = 'winner-summary-title-row';

const title = document.createElement('div');
title.className = 'winner-summary-title';
title.textContent = 'Vinnare';

const editBtn = document.createElement('button');
editBtn.type = 'button';
editBtn.className = 'winner-edit-toggle';
editBtn.textContent = 'Ändra';
editBtn.addEventListener('click', () => {
  const ed = document.getElementById('winner-edit');
  if (!ed) return;
  const isHidden = ed.hasAttribute('hidden');
  if (isHidden) {
    ed.removeAttribute('hidden');
    try { renderWinnerEditor(); } catch(e) {}
  } else {
    ed.setAttribute('hidden','');
  }
});

titleRow.appendChild(title);
titleRow.appendChild(editBtn);

const list = document.createElement('div');
list.id = 'winner-summary-list';
list.className = 'winner-summary-list';

const edit = document.createElement('div');
edit.id = 'winner-edit';
edit.className = 'winner-edit';
edit.setAttribute('hidden','');

inner.appendChild(titleRow);
inner.appendChild(list);
inner.appendChild(edit);
  section.appendChild(inner);

  const bigBlock = document.querySelector('.big-block');
  const couponList = document.getElementById('coupon-list');
  if (bigBlock && bigBlock.parentElement) {
    // lägg direkt efter hästinfo-blocket
    bigBlock.insertAdjacentElement('afterend', section);
  } else if (couponList && couponList.parentElement) {
    couponList.parentElement.insertBefore(section, couponList);
  } else {
    document.body.appendChild(section);
  }

  return section;
}

function renderWinnerEditor() {
  const wrap = document.getElementById('winner-edit');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!divisions || !divisions.length) {
    const p = document.createElement('div');
    p.className = 'winner-edit-empty';
    p.textContent = 'Inget lopp laddat ännu.';
    wrap.appendChild(p);
    return;
  }

  divisions.forEach((div) => {
    const avd = Number(div.index);
    if (!Number.isFinite(avd) || avd <= 0) return;

    const row = document.createElement('div');
    row.className = 'winner-edit-row';

    const lab = document.createElement('div');
    lab.className = 'winner-edit-label';
    lab.textContent = `Avd ${avd}`;

    const sel = document.createElement('select');
    sel.className = 'winner-edit-select';

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '—';
    sel.appendChild(opt0);

    const horses = Array.isArray(div.horses) ? div.horses : [];
    const nums = horses
      .map((h) => Number(h.number))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    nums.forEach((n) => {
      const o = document.createElement('option');
      o.value = String(n);
      const nm = (horses.find((h) => Number(h.number) === n)?.name) || '';
      o.textContent = nm ? `${n} ${nm}` : String(n);
      sel.appendChild(o);
    });

    const cur = manualWinners && manualWinners[String(avd)] ? Number(manualWinners[String(avd)]) : NaN;
    if (Number.isFinite(cur) && cur > 0) sel.value = String(cur);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'winner-edit-save';
    btn.textContent = 'Spara';
    btn.addEventListener('click', () => {
      const v = sel.value;
      setManualWinner(avd, v ? Number(v) : NaN);
    });

    const clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'winner-edit-clear';
    clr.textContent = 'Rensa';
    clr.addEventListener('click', () => {
      sel.value = '';
      setManualWinner(avd, NaN);
    });

    row.appendChild(lab);
    row.appendChild(sel);
    row.appendChild(btn);
    row.appendChild(clr);
    wrap.appendChild(row);
  });

  const hint = document.createElement('div');
  hint.className = 'winner-edit-hint';
  hint.textContent = 'Tips: Manuella vinnare sparas i webbläsaren (localStorage) för just detta spel.';
  wrap.appendChild(hint);
}

function updateWinnerSummaryUI() {
  const section = ensureWinnerSummarySection();
  const list = document.getElementById('winner-summary-list');
  if (!list) return;

  // kombinera backend-vinnare med manuella vinnare (manuell vinner över backend)
const results = (game && game.results) ? game.results : null;
const combined = {};
if (results && typeof results === 'object') {
  Object.keys(results).forEach((k) => { combined[String(k)] = Number(results[k]); });
}
if (manualWinners && typeof manualWinners === 'object') {
  Object.keys(manualWinners).forEach((k) => { combined[String(k)] = Number(manualWinners[k]); });
}
const keys = Object.keys(combined);
const hasAny = keys.some((k) => Number(combined[k]) > 0);

  if (!hasAny) {
    section.hidden = false;
    list.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'winner-empty';
    empty.textContent = 'Inga vinnare hämtade ännu. Du kan lägga in manuellt.';
    list.appendChild(empty);
    return;
  }

  // sortera avdelningar 1..N
  const avds = keys
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  list.innerHTML = '';

  
avds.forEach((avd) => {
    const winnerNum = getWinnerNumber(avd);
    if (!Number.isFinite(winnerNum) || winnerNum <= 0) return;

    let horseName = '';
    const div = findDivisionByIndex(avd);
    if (div && Array.isArray(div.horses)) {
      const found = div.horses.find((h) => Number(h.number) === winnerNum);
      if (found) horseName = found.name || '';
    }

    const chip = document.createElement('div');
    chip.className = 'winner-chip';
    chip.textContent = `Avd ${avd}  🏆  ${winnerNum}${horseName ? ' ' + horseName : ''}`;
    list.appendChild(chip);
  });

  section.hidden = list.children.length === 0;
}

// ------------------
// Vinnarprognos
// ------------------

function renderWinnerPredictions() {
  if (!predictOutput) return;

  if (!Array.isArray(divisions) || divisions.length === 0) {
    predictOutput.innerHTML = '<div class="predict-empty">Ingen speldata laddad.</div>';
    return;
  }

  // Försök hitta centrala kolumner från headern (finns när man klistrat in hästtabellen)
  const col = buildHeaderIndexMap(headerColumns || []);

  const rows = [];
  for (const div of divisions) {
    if (!div || !Array.isArray(div.horses) || div.horses.length === 0) continue;

    const preds = predictDivisionWinners(div, col);
    rows.push(renderPredictionDivision(div, preds));
  }

  if (rows.length === 0) {
    predictOutput.innerHTML = '<div class="predict-empty">Inga avdelningar med hästar hittades.</div>';
    return;
  }

  predictOutput.innerHTML = rows.join('');
}

function renderPredictionDivision(div, preds) {
  const avdLabel = `Avd ${div.index}`;
  if (!preds || preds.length === 0) {
    return `
      <div class="predict-division">
        <div class="predict-division-header">${escapeHtml(avdLabel)}</div>
        <div class="predict-empty">Kunde inte räkna ut prognos (saknar data).</div>
      </div>
    `;
  }

  const top = preds[0];
  const top3 = preds.slice(0, 3);

  const reasons = top.reasons && top.reasons.length
    ? top.reasons.map((r) => `<span class="predict-pill">${escapeHtml(r)}</span>`).join('')
    : '';

  const top3Html = top3
    .map((p, i) => {
      const pct = Math.round(p.prob * 100);
      return `<div>${i + 1}) <strong>${escapeHtml(p.label)}</strong> <span class="predict-prob">${pct}%</span></div>`;
    })
    .join('');

  const topPct = Math.round(top.prob * 100);

  return `
    <div class="predict-division">
      <div class="predict-division-header">${escapeHtml(avdLabel)}</div>
      <div class="predict-winner">
        <div class="predict-winner-name">${escapeHtml(top.label)}</div>
        <div class="predict-winner-sub">Prognos: <strong>${topPct}%</strong></div>
        ${reasons ? `<div class="predict-reasons">${reasons}</div>` : ''}
      </div>
      <div class="predict-top3">${top3Html}</div>
    </div>
  `;
}

function predictDivisionWinners(div, colIndex) {
  const horses = div.horses || [];

  // filtrera bort strukna om de förekommer i texten
  const usable = horses.filter((h) => {
    const t = String(h.tipComment || h.statsComment || h.rawLine || '').toLowerCase();
    return !t.includes('struken');
  });
  if (usable.length === 0) return [];

  // För scaling inom avdelningen
  const points = usable
    .map((h) => getNumericFromHorse(h, colIndex, ['poäng', 'poang', 'poäng']))
    .filter((n) => Number.isFinite(n));
  const maxPoints = points.length ? Math.max(...points) : null;
  const minPoints = points.length ? Math.min(...points) : null;

  const maxSp = Math.max(usable.length, ...usable.map((h) => Number(h.number) || 0));

  const scored = usable.map((horse) => {
    const feat = extractHorseFeaturesForPrediction(horse, colIndex);

    // normaliserade komponenter (0..1)
    const market = Number.isFinite(feat.impliedProb) ? clamp(feat.impliedProb, 0, 1) : 0;
    const pop = Number.isFinite(feat.vPct) ? clamp(feat.vPct / 100, 0, 1) : 0;
    const win = Number.isFinite(feat.winPct) ? clamp(feat.winPct / 100, 0, 1) : 0;
    const place = Number.isFinite(feat.placePct) ? clamp(feat.placePct / 100, 0, 1) : 0;
    const sp = Number.isFinite(feat.spår) ? feat.spår : null;
    const pos = sp ? clamp((maxSp - sp + 1) / maxSp, 0, 1) : 0.5;

    let pointsScaled = 0;
    if (Number.isFinite(feat.points) && Number.isFinite(maxPoints) && Number.isFinite(minPoints) && maxPoints !== minPoints) {
      pointsScaled = clamp((feat.points - minPoints) / (maxPoints - minPoints), 0, 1);
    } else if (Number.isFinite(feat.points) && Number.isFinite(maxPoints) && maxPoints > 0) {
      pointsScaled = clamp(feat.points / maxPoints, 0, 1);
    }

    const tip = clamp((feat.tipScore + 2) / 4, 0, 1); // tipScore i [-2..2]
    const trend = Number.isFinite(feat.trend) ? clamp(feat.trend / 5 + 0.5, 0, 1) : 0.5;

    // viktning (enkelt, men stabilt)
    const w_market = 3.0;
    const w_pop = 1.4;
    const w_win = 0.8;
    const w_place = 0.4;
    const w_points = 0.6;
    const w_pos = 0.4;
    const w_tip = 0.7;
    const w_trend = 0.2;

    const score =
      w_market * market +
      w_pop * Math.sqrt(pop) +
      w_win * win +
      w_place * place +
      w_points * pointsScaled +
      w_pos * pos +
      w_tip * tip +
      w_trend * trend;

    const reasons = buildPredictionReasons(feat);

    return {
      horse,
      label: feat.label,
      score,
      reasons,
    };
  });

  // softmax till sannolikheter
  const probs = softmax(scored.map((s) => s.score));
  scored.forEach((s, i) => (s.prob = probs[i]));

  scored.sort((a, b) => b.prob - a.prob);
  return scored;
}

function extractHorseFeaturesForPrediction(horse, colIndex) {
  // label
  const name = horse.name || '';
  const driver = horse.driver || '';
  const num = Number(horse.number) || NaN;
  const label = `${Number.isFinite(num) ? num + ' ' : ''}${name}${driver ? ' – ' + driver : ''}`.trim();

  // odds/percent
  const vPct = getNumericFromHorse(horse, colIndex, ['v85%', 'v%', 'v86%', 'v75%', 'v64%']);
  const vOdds = getNumericFromHorse(horse, colIndex, ['v-odds', 'v odds', 'vodds']);
  const pOdds = getNumericFromHorse(horse, colIndex, ['p-odds', 'p odds', 'podds']);

  const impliedProb = Number.isFinite(vOdds) && vOdds > 0
    ? 1 / vOdds
    : (Number.isFinite(pOdds) && pOdds > 0 ? 1 / pOdds : NaN);

  const winPct = getNumericFromHorse(horse, colIndex, ['seger%', 'seger %', 'segerprocent']);
  const placePct = getNumericFromHorse(horse, colIndex, ['plats%', 'plats %', 'platsprocent']);
  const points = getNumericFromHorse(horse, colIndex, ['poäng', 'poang', 'poäng ']);
  const trend = getNumericFromHorse(horse, colIndex, ['trend%', 'trend %', 'trend']);

  // spår
  let spår = NaN;
  const distSp = getTextFromHorse(horse, colIndex, ['distans & spår', 'distans', 'spår']);
  if (distSp) {
    const m = String(distSp).match(/:\s*(\d+)/);
    if (m) spår = Number(m[1]);
  }

  // tips/stats comment score
  const tipText = String(horse.tipComment || getTextFromHorse(horse, colIndex, ['tipskommentar']) || '');
  const statsText = String(horse.statsComment || getTextFromHorse(horse, colIndex, ['statistikkommentar']) || '');
  const combined = `${tipText} ${statsText}`.trim();
  const tipScore = scoreTipText(combined);

  return {
    label,
    vPct,
    vOdds,
    impliedProb,
    winPct,
    placePct,
    points,
    trend,
    spår,
    tipScore,
    tipText,
    statsText,
  };
}

function buildPredictionReasons(feat) {
  const reasons = [];

  if (Number.isFinite(feat.vPct)) reasons.push(`V% ${fmtPct(feat.vPct)}`);
  if (Number.isFinite(feat.vOdds)) reasons.push(`V-odds ${fmtNum(feat.vOdds)}`);
  if (Number.isFinite(feat.winPct)) reasons.push(`Seger% ${fmtPct(feat.winPct)}`);
  if (Number.isFinite(feat.placePct)) reasons.push(`Plats% ${fmtPct(feat.placePct)}`);
  if (Number.isFinite(feat.spår)) reasons.push(`Spår ${feat.spår}`);
  if (feat.tipScore >= 1.3) reasons.push('Positiv tipstext');
  if (feat.tipScore <= -1.3) reasons.push('Negativ tipstext');

  return reasons.slice(0, 6);
}

function scoreTipText(txt) {
  const t = String(txt || '').toLowerCase();
  if (!t) return 0;

  let s = 0;

  // positiva
  const pos = [
    'tipsetta',
    'bra chans',
    'trolig',
    'segerbud',
    'spetsbud',
    'tippas kunna nå ledning',
    'snabb ut',
    'startsnabb',
    'leder runt om',
    'vann väldigt enkelt',
    'högkapabel',
    'toppform',
    'stark',
    'bör räknas',
    'givet',
    'intressant',
    'utmanar',
  ];
  const neg = [
    'galopp',
    'osäker',
    'bortlottad',
    'svårt läge',
    'tufft',
    'vinner sällan',
    'behöver loppet',
    'inte som bäst',
    'inte helt borta',
    'bara om',
    'plats i första hand',
    'svårt',
    'nja',
  ];

  for (const p of pos) {
    if (t.includes(p)) s += 0.35;
  }
  for (const n of neg) {
    if (t.includes(n)) s -= 0.35;
  }

  // mild clamps
  return clamp(s, -2, 2);
}

function buildHeaderIndexMap(cols) {
  const map = {};
  for (let i = 0; i < cols.length; i++) {
    const raw = String(cols[i] || '');
    const key = normalizeHeaderLabel(raw);
    if (key && map[key] === undefined) map[key] = i;
  }
  return map;
}

function normalizeHeaderLabel(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\u00e5/g, 'a')
    .replace(/\u00e4/g, 'a')
    .replace(/\u00f6/g, 'o')
    .trim();
}

function getTextFromHorse(horse, colIndex, keys) {
  const line = horse.rawLine;
  if (!line || !Array.isArray(headerColumns) || headerColumns.length === 0) return '';
  const cols = parseLineColumns(line, headerColumns.length);
  for (const k of keys) {
    const idx = colIndex[normalizeHeaderLabel(k)];
    if (idx !== undefined && idx >= 0 && idx < cols.length) {
      const v = cols[idx];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return '';
}

function getNumericFromHorse(horse, colIndex, keys) {
  const txt = getTextFromHorse(horse, colIndex, keys);
  if (!txt) return NaN;
  return parseLooseNumber(txt);
}

function parseLooseNumber(v) {
  const s = String(v || '')
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/%/g, '')
    .trim();

  // om det finns bokstav (M/K) i rekord etc, försök hämta första numret
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return NaN;
  return Number(m[0]);
}

function softmax(arr) {
  if (!arr || arr.length === 0) return [];
  const max = Math.max(...arr);
  const exps = arr.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return '-';
  return `${Math.round(n)}%`;
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return '-';
  const x = Math.round(n * 100) / 100;
  return String(x).replace(/\./g, ',');
}
