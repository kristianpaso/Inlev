// public/trav/js/overview.js



// var innan: import { getGame } from './api.js';
import { getGame, createCoupon, deleteCoupon, getTracks, importAtgCoupon, getAtgLinks, saveAtgLink, updateCouponActive } from './api.js';


let game = null;
let currentGameId = null;
let allTracks = [];  
let divisions = [];
let currentIndex = 0;
let headerColumns = [];
let divisionSquares = [];
let divisionCountEls = [];
let coupons = [];                 // sparade kuponger för spelet
let isBuildingCoupon = false;
let couponSelections = {};        // { divisionIndex: Set([...]) }
let stakeLevel = 'original'; // 'original' | '70' | '50' | '30'

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

// DOM refs
let fillPanelEl = null;
let fillSelectedInfoEl = null;
let fillPriceEl = null;
let fillCountEl = null;
let fillSpikesEl = null;
let fillSpikesDisplayEl = null;
let fillProfileEl = null;
let fillProfileDisplayEl = null;





// markerade idé-hästar per avdelning (Set med nummer)
let selectedIdeaNumbersByDivIndex = {};

// visningsläge: "simple", "detailed" eller "icons"
let listMode = 'simple';

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
    const [gameData, tracks] = await Promise.all([
      getGame(gameId),
      getTracks().catch(() => []), // om ban-API failar vill vi ändå visa spelet
    ]);

    game = gameData;
    allTracks = Array.isArray(tracks) ? tracks : [];
    currentGameId = game._id;

    loadIdeaSelections(currentGameId);
    setupOverview(game);
    renderTrackInfo();            // 🔹 visa banblocket
      initStakePanel();   
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

function getActiveCoupons() {
  return (coupons || []).filter(c => c.active !== false);
}


// ---- Setup av överblick ----
//

function setupOverview(game) {
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

  // Gör alla divisions-index till siffror och sätt fallback (1,2,3...)
  divisions = (parsed.divisions || []).map((d, idx) => {
    const indexNum =
      d.index != null && d.index !== ''
        ? Number(d.index)
        : idx + 1;

    return {
      ...d,
      index: indexNum
    };
  });

coupons = (game.coupons || []).map(c => ({
  ...c,
  active: (c.active !== false) // default TRUE om fältet saknas
}));


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
  initSaveIdeaCouponButton();
  initClearIdeaButton();
  renderCouponList();
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
function getDivisionHorsesSortedByPercent(divisionIndex) {
  const division = findDivisionByIndex(divisionIndex);
  if (!division || !division.horses) return [];

  const mainIdx = getMainPercentIndex();
  if (mainIdx === -1) return [];

  return division.horses
    .filter((h) => h && !h.scratched && h.rawLine)
    .map((h) => {
      const cols = parseLineColumns(h.rawLine || '');
      const val = cols[mainIdx] || '';
      const m = String(val).match(/(\d+(?:[.,]\d+)?)/);
      const pct = m ? parseFloat(m[1].replace(',', '.')) || 0 : 0;
      return { number: h.number, pct };
    })
    .sort((a, b) => b.pct - a.pct); // högst först
}

// Favoriten i en avdelning (högst procent)
function getDivisionFavouriteNumber(divisionIndex) {
  const sorted = getDivisionHorsesSortedByPercent(divisionIndex);
  return sorted.length ? sorted[0].number : null;
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
function ensureFavouriteInEachDivision(selections) {
  if (!Array.isArray(selections)) return;

  const byDiv = new Map(
    selections.map((sel) => [sel.divisionIndex, sel])
  );

  divisions.forEach((div) => {
    const idx = div.index ?? 0;
    const sel = byDiv.get(idx);
    if (!sel) return;

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

  const visibleColumns = getVisibleColumns(headerColumns, listMode);

  const table = document.createElement('table');
  table.className = 'horse-table';

  const isMobile = window.innerWidth <= 900;
  const isMobileDetailed = isMobile && listMode === 'detailed';
  if (isMobileDetailed) {
    table.classList.add('mobile-detailed');
  }

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
     // 🔹 markera favoritens rad
    if (horse.number === favouriteNumber) {
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

    // extra-info till mobil-detaljerad vy
    let extraData = [];
    if (isMobileDetailed && horse.rawLine) {
      extraData = headerColumns
        .map((name, index) => ({ name, index }))
        .filter(({ name }) => {
          const up = name.toUpperCase();
          if (up.startsWith('HÄST')) return false;
          if (up.startsWith('KUSK')) return false;
          return true;
        })
        .map(({ name, index }) => ({
          label: name,
          value: cols[index] ?? '',
        }));
    }

    // ----- cellerna -----
    visibleColumns.forEach(({ name, index }) => {
      const td = document.createElement('td');
      const upper = name.toUpperCase();

      if (!horse.rawLine) {
        // struken häst utan rawLine → bara “Struken” i HÄST-kolumnen
        if (upper.startsWith('HÄST')) {
          td.textContent = 'Struken';
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

        if (kuskName) {
          td.innerHTML = `
            <div class="horse-name">${escapeHtml(horseText)}</div>
            <div class="horse-driver">${escapeHtml(kuskName)}</div>
          `;
        } else {
          td.innerHTML = `
            <div class="horse-name">${escapeHtml(horseText)}</div>
          `;
        }

        // extra-info under raden i mobil-detaljläge
        if (isMobileDetailed && extraData.length) {
          const extraDiv = document.createElement('div');
          extraDiv.className = 'horse-extra';

          extraData.forEach(({ label, value }) => {
            if (!value) return;
            const rowDiv = document.createElement('div');
            rowDiv.className = 'horse-extra-item';
            rowDiv.innerHTML = `
              <span>${escapeHtml(label)}:</span>
              <span>${escapeHtml(value)}</span>
            `;
            extraDiv.appendChild(rowDiv);
          });

          td.appendChild(extraDiv);
          tr._extraDiv = extraDiv;
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

    // mobil: klick för att fälla ut extra-info
    if (isMobileDetailed) {
      tr.classList.add('mobile-collapsible-row');
      const extraDiv = tr._extraDiv || null;

      tr.addEventListener('click', () => {
        tr.classList.toggle('expanded');

        // direkt efter klick
        requestAnimationFrame(syncNumberPositions);

        // efter ev. transition
        if (extraDiv) {
          const handler = () => {
            extraDiv.removeEventListener('transitionend', handler);
            syncNumberPositions();
          };
          extraDiv.addEventListener('transitionend', handler);
        }
      });
    }

    // ----- vänsterkolumn: populärfält -----
    const leftSquare = createNumberSquare(horse.number);

   // 🔹 favorit = gul markering även i vänsterkolumnen
    if (horse.number === favouriteNumber) {
      leftSquare.classList.add('favourite-number');
    }

    if (horse.scratched) {
      leftSquare.classList.add('scratched');
    }

    const count = counts[horse.number] || 0;

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
    const rightSquare = createNumberSquare(horse.number, { clickable: true });

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
  const table = document.querySelector('.horse-table');
  if (!table) return;

  const headerRow = table.querySelector('thead tr');
  const rows = table.querySelectorAll('tbody tr');
  const leftCol = document.getElementById('popular-number-list');
  const rightCol = document.getElementById('idea-number-list');

  if (!leftCol || !rightCol || !rows.length) return;

  // 🔹 På mobil: låt bara CSS styra margin-top
  if (window.innerWidth <= 901) {
    leftCol.style.marginTop = '';
    rightCol.style.marginTop = '';
  } else {
    // 🔹 På desktop: använd headerhöjden
    const headerHeight = headerRow
      ? headerRow.getBoundingClientRect().height
      : 0;

    const offset = 0;
    const marginTop = headerHeight + offset;

    leftCol.style.marginTop = `${marginTop}px`;
    rightCol.style.marginTop = `${marginTop}px`;
  }

  const leftSquares = leftCol.querySelectorAll('.num-square');
  const rightSquares = rightCol.querySelectorAll('.num-square');

  // 1) mät alla raders höjd
  const rowHeights = Array.from(rows).map((row) =>
    row.getBoundingClientRect().height
  );
  const maxHeight = Math.max(...rowHeights, 40); // minst 40px

  // 2) sätt höjd – strukna rader får minst maxHeight
  rows.forEach((row, i) => {
    let h = rowHeights[i];

    if (row.classList.contains('scratched') && h < maxHeight) {
      h = maxHeight;
      row.style.height = `${maxHeight}px`; // lyft upp struken rad
    } else {
      row.style.height = ''; // låt "normala" rader bestämmas av innehållet
    }

    if (leftSquares[i]) leftSquares[i].style.height = `${h}px`;
    if (rightSquares[i]) rightSquares[i].style.height = `${h}px`;
  });
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
const chanceIncludeSecondFavInput = document.getElementById('chance-include-secondfav');
const chanceSpikesInput = document.getElementById('chance-spikes');
const chanceSpikesDisplay = document.getElementById('chance-spikes-display');

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

    fillMode = !fillMode;
    selectedFillCoupon = null;

    if (!fillMode) {
      document.body.classList.remove('fill-mode-active');
      fillPanelEl.hidden = true;
      document.querySelectorAll('.coupon-card.selected-for-fill')
        .forEach(c => c.classList.remove('selected-for-fill'));
    } else {
      document.body.classList.add('fill-mode-active');
      fillPanelEl.hidden = true; // panel öppnas först när man klickat en kupong
      if (fillSelectedInfoEl) fillSelectedInfoEl.textContent = 'Välj en kupong i listan…';
    }

    renderCouponList(); // så korten blir klickbara i fillMode
  });
}

if (btnFillCancel && fillPanelEl) {
  btnFillCancel.addEventListener('click', () => {
    fillMode = false;
    selectedFillCoupon = null;
    document.body.classList.remove('fill-mode-active');
    fillPanelEl.hidden = true;
    renderCouponList();
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
      const created = await importAtgCoupon(currentGameId, url);
      if (!created || !created.selections || !created.selections.length) {
        throw new Error('Importen gav ingen kupong.');
      }
      created.source = 'atg';
      coupons.push(created);
      renderCouponList();
      renderCurrentDivision();
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
      fillMode = false;
      selectedFillCoupon = null;
      document.body.classList.remove('fill-mode-active');
      if (fillPanelEl) fillPanelEl.hidden = true;
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
function addRandomHorseSomewhere(selections) {
  if (!divisions.length) return false;

  // Bygg lookup: divisionIndex -> selection
  const selByIndex = {};
  selections.forEach((sel) => {
    selByIndex[sel.divisionIndex] = sel;
  });

  // Lista möjliga avdelningar där det finns fler hästar att lägga till
  const candidateDivisions = divisions.filter((division) => {
    const divIndex = division.index ?? 0;
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

  btn.addEventListener('click', async () => {
    const payload = buildCouponPayloadFromIdea();

    if (!payload.selections.length) {
      alert('Du måste välja minst en häst i något lopp för att spara kupongen.');
      return;
    }

    // hur många "Min kupong" finns redan?
    const existingIdeaCount = coupons.filter((c) => c.source === 'idea').length;
    const defaultName = `Min kupong ${existingIdeaCount + 1}`;

    const nameInput = prompt('Ange namn på kupongen:', defaultName);
    if (nameInput === null) {
      // användaren tryckte Avbryt
      return;
    }
    const name = nameInput.trim() || defaultName;

    try {
  // bygg upp body till API:t
  const body = {
    ...payload,
    source: 'idea',
    name,
  };

  // Om spelet är V85 – skicka med aktuell insatsnivå
  const up = String(game?.gameType || '').toUpperCase();
  if (up === 'V85') {
    body.stakeLevel = stakeLevel; // samma stakeLevel som totalen använder
  }

  const newCoupon = await createCoupon(currentGameId, body);

  coupons.push(newCoupon);
  renderCouponList();
  renderCurrentDivision(); // uppdatera populärfältet med nya counts
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
  if (!currentGameId || !divisions.length) throw new Error('Inget spel öppet.');

  const weights = getFillProfileWeights(step);
  const created = [];

  // radpris baserat på spelets insats (och ev stakeLevel på baseCoupon)
  const radPris = getEffectiveRadPrisForCoupon(baseCoupon);

  for (let i = 0; i < count; i++) {
    // 1) börja från base-coupon selections
    const selections = (baseCoupon.selections || []).map(sel => ({
      divisionIndex: Number(sel.divisionIndex),
      horses: Array.from(sel.horses || []).map(Number),
    }));

    // 2) se till att alla avdelningar finns representerade
    divisions.forEach((div, idx) => {
      const divIndex = Number(div.index ?? (idx + 1));
      if (!selections.find(s => Number(s.divisionIndex) === divIndex)) {
        selections.push({ divisionIndex: divIndex, horses: [] });
      }
    });

    // 3) Storfavorit alltid med (och “tomma” avdelningar får favoriten)
    ensureFavouriteInEachDivision(selections);

 const spikeDivSet = pickStrongestFavSpikeDivs(spikesWanted);

// gör spik-avdelningar = exakt favorit,
// och icke-spik = minst 2 hästar direkt från start
ensureMinTwoInNonSpike(selections, spikeDivSet, weights);


    // 5) Trimma mot targetPrice (försök ligga nära, men aldrig långt under)
//    - vi accepterar att hamna lite under (tolerance), men INTE 81kr när du vill ha 300kr
const tolerance = Math.max(5, Math.round(targetPrice * 0.03)); // ca 3% eller minst 5 kr
const minAcceptable = Math.max(1, targetPrice - tolerance);

const maxIter = 600;
for (let guard = 0; guard < maxIter; guard++) {
  const info = computeCouponPrice({ selections, stakeLevel: baseCoupon.stakeLevel || 'original' });
  const total = info.total;

  // ✅ tillräckligt nära
  if (total >= minAcceptable && total <= targetPrice) break;

if (total > targetPrice) {
  if (!removeRandomHorseSomewhereRespectMin(selections, spikeDivSet, 2)) break;
  ensureMinTwoInNonSpike(selections, spikeDivSet, weights);
  continue;
}


  // total < minAcceptable -> vi måste upp
  // 1) försök viktad häst (2:a/mid/super)
  let changed = addOneWeightedHorse(selections, weights);

  // 2) om viktad inte går → fallback: lägg vilken som helst (men fortfarande inte i spik-avd)
  if (!changed) {
    changed = addRandomHorseSomewhere(selections);
  }

  if (!changed) break;

ensureMinTwoInNonSpike(selections, spikeDivSet, weights);

}

// 🔴 VIKTIGT: Om vi fortfarande är långt under target, spara INTE kupongen
{
  const finalInfo = computeCouponPrice({ selections, stakeLevel: baseCoupon.stakeLevel || 'original' });
  if (finalInfo.total < minAcceptable) {
    throw new Error(
      `Kunde inte nå priset ${targetPrice} kr (fastnade på ${formatMoney(finalInfo.total)} kr). ` +
      `Prova lägre antal spik eller lägre pris.`
    );
  }
}


    // 6) Namn + spara
    const baseName = baseCoupon.name || 'Kupong';
    const name = ensureUniqueCouponName(`Fylld ${baseName} ${i + 1}`);

    const payload = {
      name,
      source: 'fill',
      stakeLevel: baseCoupon.stakeLevel || 'original',
      selections: selections.map(s => ({
        divisionIndex: Number(s.divisionIndex),
        horses: Array.from(new Set(s.horses || [])).map(Number).sort((a,b) => a-b),
      })),
    };

    const saved = await createCoupon(currentGameId, payload);
    saved.source = 'fill';
    coupons.push(saved);
    created.push(saved);
  }

  renderCouponList();
  renderCurrentDivision();

  if (!created.length) throw new Error('Inga kuponger skapades.');
}

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

function pickStrongestFavSpikeDivs(spikesWanted) {
  const wanted = Math.max(0, Math.min(Number(spikesWanted || 0), divisions.length));
  if (!wanted) return new Set();

  // sortera avdelningar efter favoritens % (starkast först)
  const divStrength = divisions.map((div, idx) => {
    const divIndex = Number(div.index ?? (idx + 1));
    const sorted = getDivisionHorsesSortedByPercent(divIndex) || [];
    const favPct = sorted.length ? Number(sorted[0].pct || 0) : 0;
    return { divIndex, favPct };
  });

  divStrength.sort((a, b) => b.favPct - a.favPct);

  return new Set(divStrength.slice(0, wanted).map(x => x.divIndex));
}

function ensureMinTwoInNonSpike(selections, spikeDivSet, weights) {
  const byDiv = new Map(selections.map(s => [Number(s.divisionIndex), s]));

  divisions.forEach((div, idx) => {
    const divIndex = Number(div.index ?? (idx + 1));
    const sel = byDiv.get(divIndex);
    if (!sel) return;

    // spik-avd: exakt 1 (favoriten)
    if (spikeDivSet.has(divIndex)) {
      const fav = getDivisionFavouriteNumber(divIndex);
      sel.horses = fav != null ? [fav] : (sel.horses || []).slice(0, 1);
      return;
    }

    // icke-spik: minst 2 (favoriten + en till)
    sel.horses = Array.from(new Set(sel.horses || [])).map(Number);

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

function removeRandomHorseSomewhereRespectMin(selections, spikeDivSet, minNonSpike = 2) {
  const removable = selections.filter(sel => {
    const divIndex = Number(sel.divisionIndex);
    const horses = sel.horses || [];
    if (spikeDivSet.has(divIndex)) return false;        // rör inte spik-avd
    if (horses.length <= minNonSpike) return false;     // gå aldrig under 2
    return true;
  });

  if (!removable.length) return false;

  const sel = removable[Math.floor(Math.random() * removable.length)];
  const fav = getDivisionFavouriteNumber(Number(sel.divisionIndex));
  const candidates = (sel.horses || []).filter(h => fav == null || h !== fav);
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

function renderCouponList() {
  const listEl = document.getElementById('coupon-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (!coupons.length) {
    const p = document.createElement('p');
    p.className = 'coupon-hint';
    p.textContent = 'Inga kuponger inlagda ännu.';
    listEl.appendChild(p);
    return;
  }

  coupons.forEach((coupon, idx) => {
    const isIdea = coupon.source === 'idea';

    const card = document.createElement('div');
    card.className = 'coupon-card';

if (coupon.active === false) {
  card.classList.add('inactive');
}

    
    // markera split-kuponger med extra klass
    if (coupon.source === 'split') {
      card.classList.add('split-coupon-card');
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





    const sub = document.createElement('div');
    sub.className = 'coupon-card-sub';
    const date = coupon.createdAt ? new Date(coupon.createdAt) : null;
    sub.textContent = date
      ? `Skapad: ${date.toLocaleString('sv-SE')}`
      : '';

    const leftHeader = document.createElement('div');
    leftHeader.appendChild(title);
    if (sub.textContent) {
      leftHeader.appendChild(sub);
    }

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn tiny danger';
    btnDelete.textContent = 'Ta bort';

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

    header.appendChild(leftHeader);
    header.appendChild(btnDelete);
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
    card.appendChild(priceWrap);

// --- Footer: aktiv/inaktiv toggle ---
const footer = document.createElement('div');
footer.className = 'coupon-card-footer';

const btnToggle = document.createElement('button');
btnToggle.type = 'button';
btnToggle.className = 'btn tiny btn-toggle-active';

const isActive = (coupon.active !== false);
card.classList.toggle('inactive', !isActive);

btnToggle.innerHTML = `
  <span class="dot"></span>
  <span>${isActive ? 'Aktiv' : 'Inaktiv'}</span>
`;

btnToggle.addEventListener('click', async (ev) => {
  ev.preventDefault();
  ev.stopPropagation(); // viktigt så vi inte triggar reverse-mode klick etc

  const nextActive = !(coupon.active !== false);
  const ok = window.confirm(
    nextActive
      ? 'Är du säker på att du vill AKTIVERA kupongen?'
      : 'Är du säker på att du vill INAKTIVERA kupongen?'
  );
  if (!ok) return;

  try {
    // ✅ sparar i DB
    const updated = await updateCouponActive(currentGameId, coupon._id, nextActive);
console.log('Updated coupon from server:', updated);
    // ✅ uppdatera lokalt
    coupon.active = (updated?.active !== false);

    // ✅ rita om (populärfält + not-played mm måste räknas om)
    renderCouponList();
    renderCurrentDivision();
  } catch (err) {
    console.error(err);
    alert('Kunde inte uppdatera aktiv/inaktiv.');
  }
});

footer.appendChild(btnToggle);
card.appendChild(footer);


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

    openFillPanelForCoupon(coupon, idx);
  });
}


    listEl.appendChild(card);
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

function openFillPanelForCoupon(coupon, idx) {
  if (!fillPanelEl) return;

  const baseName = coupon.name || `Kupong ${idx + 1}`;
  if (fillSelectedInfoEl) {
    fillSelectedInfoEl.textContent = `Vald kupong: ${baseName}`;
  }

  // rimliga defaultvärden
  if (fillPriceEl && !fillPriceEl.value) fillPriceEl.value = '200';
  if (fillCountEl && !fillCountEl.value) fillCountEl.value = '5';

  fillPanelEl.hidden = false;
}

