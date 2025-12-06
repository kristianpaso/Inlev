// public/trav/js/overview.js

// var innan: import { getGame } from './api.js';
import { getGame, createCoupon, deleteCoupon, getTracks } from './api.js';

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

  // 🔹 Kör om alignment när fönstret ändrar storlek (t.ex. text bryts om)
  setupResponsiveSync();
});

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

  coupons = game.coupons || [];


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

  coupons.forEach((coupon) => {
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
    if (/^V\d+%$/.test(up)) return i;
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
    if (
      coupons &&
      coupons.length > 0 &&
      !horse.scratched &&
      count === 0
    ) {
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

  let marginTop;

if (window.innerWidth <= 900) {
  // 🔹 MOBIL: justera efter första hästraden relativt vänsterspalten
  const firstRow = rows[0];
  const firstRowRect = firstRow.getBoundingClientRect();
  const leftRect = leftCol.getBoundingClientRect();

  // Vi vill att toppen på första sifferrutan ska hamna vid toppen av första hästraden
  marginTop = firstRowRect.top - leftRect.top;
} else {
  // 🔹 DESKTOP: behåll ditt gamla "header + offset 51"
  const headerHeight = headerRow
    ? headerRow.getBoundingClientRect().height
    : 0;

  // liten offset så siffer-rutorna hamnar mitt i hästraden
  const offset = 0;
  marginTop = headerHeight + offset;
}


  leftCol.style.marginTop = `${marginTop}px`;
  rightCol.style.marginTop = `${marginTop}px`;

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
  window.addEventListener(
    'scroll',
    () => {
      if (window.innerWidth <= 900) {
        schedule();
      }
    },
    { passive: true }
  );
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


  // Spara referenser globalt så renderCouponList()/helpers kan använda dem
  reversePanelEl = reversePanel;
  reverseNameInputEl = reverseNameInput;
  reversePriceInputEl = reversePriceInput;
  reverseSpikesInputEl = reverseSpikesInput;
reverseSupersInputEl = reverseSupersInput;
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
    const shuffledNonSpike = [...nonSpikeDivs];
    for (let i = shuffledNonSpike.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledNonSpike[i], shuffledNonSpike[j]] = [
        shuffledNonSpike[j],
        shuffledNonSpike[i],
      ];
    }
    const newSpikeDivs = new Set(
      shuffledNonSpike.slice(0, targetSpikeCount)
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

  const removable = selections.filter((sel) => (sel.horses || []).length > 1);
  if (!removable.length) return false;

  const sel = pickRandom(removable);
  const idx = Math.floor(Math.random() * sel.horses.length);
  sel.horses.splice(idx, 1);
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

  coupons.forEach((coupon) => {
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

  // ✅ Bara om vi använder populärfältet (kuponger) ska vi kräva kuponger
  if (usePopular && !coupons.length) {
    alert('Det finns inga kuponger att splitta ännu.');
    return;
  }


   // 1. Plocka fram storfavoriten (högst V%) i varje avdelning
  const favouriteSpikes = [];
  divisions.forEach((div, idx) => {
    const divIndex = div.index ?? idx + 1;
    const favNum = getDivisionFavouriteNumber(divIndex);
    if (favNum != null) {
      favouriteSpikes.push({ division: divIndex, number: favNum });
    }
  });

  if (!favouriteSpikes.length) {
    alert('Hittade inga favoriter att använda som spikar.');
    return;
  }

  // 2. Bygg kandidat-hästar per avdelning (som tidigare)
  const allHorsesPerDiv = {};
  const superHorsesPerDiv = {};
  const normalHorsesPerDiv = {};


  if (usePopular) {
    // Bygg från befintliga kuponger (populärfältet)
    coupons.forEach((coupon) => {
      (coupon.selections || []).forEach((sel) => {
        const d = sel.divisionIndex;
        const set = (allHorsesPerDiv[d] ||= new Set());
        (sel.horses || []).forEach((n) => set.add(n));
      });
    });
  } else {
    // Bygg direkt från V-listan (alla icke strukna)
    divisions.forEach((div, idx) => {
      const divIndex = div.index ?? idx + 1;
      const set = (allHorsesPerDiv[divIndex] = new Set());
      (div.horses || []).forEach((h) => {
        if (h.scratched) return;
        if (typeof h.number !== 'number') return;
        set.add(h.number);
      });
    });
  }

  const divisionCount = divisions.length;
  const basePattern = parseSplitPattern(patternStr, divisionCount);

  const created = [];

  // enkel Fisher–Yates
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  for (let i = 0; i < count; i++) {
    // Spikar för just denna kupong
       const start = i * spikesPerCoupon;
    const slice = favouriteSpikes.slice(
      start,
      start + spikesPerCoupon
    );

    if (!slice.length) break;

    const spikeMap = new Map();
    slice.forEach(({ division, number }) => {
      spikeMap.set(division, number);
    });

    // Mönster för denna kupong (antal hästar per avdelning)
    let patternForThis = null;
    if (basePattern) {
      patternForThis = basePattern.slice(); // kopia
    }

    const selections = [];
    let targetSupers = Math.max(0, supersPerCoupon || 0);

    // 3. Bygg upp alla avdelningar
    divisions.forEach((div, idx) => {
      const divIndex = div.index ?? idx + 1;

            // Är den här avdelningen en spik-avdelning i den här split-kupongen?
      const isSpikeDiv = slice.some((s) => s.division === divIndex);


           // så många hästar vill vi ha här (minst 1)
      let targetCount = patternForThis
        ? Math.max(1, patternForThis[idx])
        : 1;

      // Om den här avdelningen är en spik-avdelning:
      // exakt 1 häst = spik (storfavoriten, se blocket nedan)
      if (isSpikeDiv) {
        targetCount = 1;
      } else if (targetCount === 1) {
        // Alla andra avdelningar ska ha MINST 2 hästar
        // så att de inte blir spik av misstag
        targetCount = 2;
      }


      // kandidater: antingen från populärfältet eller från V-listan
      let candidateNums = Array.from(allHorsesPerDiv[divIndex] || []);
      if (!candidateNums.length) {
        candidateNums = (div.horses || [])
          .filter((h) => !h.scratched && typeof h.number === 'number')
          .map((h) => h.number);
      }
      if (!candidateNums.length) return;

      const chosen = new Set();

    
   // 3.1. Spik: alltid storfavoriten i loppet (högst V%),
  // även om den inte finns i candidateNums sedan tidigare
  const fav = getDivisionFavouriteNumber(divIndex);
  if (fav != null) {
    chosen.add(fav);
  }


      // 3.2. Fyll upp med slumpade hästar
      const shuffled = shuffle(candidateNums.slice());
      for (const num of shuffled) {
        if (chosen.size >= targetCount) break;
        if (chosen.has(num)) continue;

        const isSuper = isSuperskrall(divIndex, num);
        if (isSuper) {
          if (targetSupers <= 0) continue; // ta inte fler supers än vi vill ha just nu
          targetSupers--;
        }
        chosen.add(num);
      }

      // Om vi fortfarande inte nått targetCount, fyll på utan supers-begränsning
      if (chosen.size < targetCount) {
        for (const num of shuffled) {
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

       // 4. Säkerställ favorit i varje avdelning
    ensureFavouriteInEachDivision(selections);

    // 5. Vilka avdelningar SKA vara spik i den här split-kupongen?
    const spikeDivSet = new Set(slice.map((s) => s.division));

    //    Se till att:
    //    - i spike-avdelningar: exakt 1 häst och det är favoriten
    //    - i övriga avdelningar: minst 2 hästar (om det går)
    fixSplitSpikesAfterTuning(selections, spikeDivSet);

    // 6. Justera exakt antal superskrällar (så gott det går)
    enforceSuperskrallCount(selections, spikeDivSet, supersPerCoupon || 0);

    // 7. Justera priset så att det hamnar så nära maxPrice som möjligt
    const radPris = getEffectiveRadPris();

    tuneReverseSelectionsToPrice(
      selections,
      maxPrice,
      radPris,
      0,    // får aldrig gå över maxPrice
      200
    );

    // 8. Pris-trimningen kan ha förstört spikmönstret → reparera igen
    fixSplitSpikesAfterTuning(selections, spikeDivSet);

    // 9. Bygg temporär kupong för pris-raden
    let tmpCoupon = { selections };
    let price = computeCouponPrice(tmpCoupon);



    // 7. Spara via API – med source: 'split' så färgen överlever reload
    const payload = {
      name: `${baseName} ${i + 1}`,
      source: 'split',
      selections: tmpCoupon.selections,
      splitMeta: {
        maxPrice,
        spikesPerCoupon,
        patternStr,
        supersPerCoupon,
        usePopular,
      },
    };

    const saved = await createCoupon(currentGameId, payload);
    saved.source = 'split'; // säkerställ på klienten också
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

    for (let n = last; n <= maxHorsesPerDiv; n++) {
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
  // plocka ut favoritnumret i just den här avdelningen
  const favNum = getDivisionFavouriteNumber
    ? getDivisionFavouriteNumber(divIndex)
    : null;

  if (nums.length === 1) {
    // Spik – visa nummer + hästnamn
    const num = nums[0];
    const name = getHorseName(divIndex, num);

    const spanNum = document.createElement('span');
    spanNum.textContent = String(num);

    // superskräll? (under 6 %)
    if (isSuperskrall(divIndex, num)) {
      spanNum.classList.add('superskrall-number');
    }

    // favorit i loppet?
    if (favNum != null && favNum === num) {
      spanNum.classList.add('favourite-number');
    }

    tdHorses.appendChild(spanNum);

    if (name) {
      const spanName = document.createElement('span');
      spanName.textContent = ` ${name}`;
      tdHorses.appendChild(spanName);
    }
  } else {
    // Flera hästar – en span per nummer så vi kan markera superskräll & favorit
    nums.forEach((num, index) => {
      const span = document.createElement('span');
      span.textContent = String(num);

      if (isSuperskrall(divIndex, num)) {
        span.classList.add('superskrall-number');
      }

      if (favNum != null && favNum === num) {
        span.classList.add('favourite-number');
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
