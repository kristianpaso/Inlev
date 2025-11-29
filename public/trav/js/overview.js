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


// markerade idé-hästar per avdelning (Set med nummer)
let selectedIdeaNumbersByDivIndex = {};

// visningsläge: "simple" eller "detailed"
let listMode = 'simple';

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
  if (saved === 'detailed' || saved === 'simple') {
    listMode = saved;
  } else {
    listMode = 'simple';
  }
}

function setupListModeUI() {
  const buttons = document.querySelectorAll('.list-mode-btn');
  buttons.forEach((btn) => {
    const mode = btn.dataset.mode;
    btn.classList.toggle('active', mode === listMode);

    btn.addEventListener('click', () => {
      const clickedMode = btn.dataset.mode;
      if (clickedMode !== 'simple' && clickedMode !== 'detailed') return;
      if (listMode === clickedMode) return;

      listMode = clickedMode;
      localStorage.setItem('trav_list_mode', listMode);

      buttons.forEach((b) =>
        b.classList.toggle('active', b.dataset.mode === listMode)
      );

      if (divisions.length) {
        renderCurrentDivision();
      }
    });
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

  divisions = parsed.divisions || [];
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

function getHorseName(divisionIndex, horseNumber) {
  const div = divisions.find((d) => (d.index ?? 0) === divisionIndex);
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

//
// ---- Tabell + sidokolumner ----
//

function buildHorseView(division, divIndex, popularity) {
  const { counts = {}, spiked = {}, maxCount = 0 } = popularity || {};

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

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  // ... (resten av koden som redan finns kvar)


  // 🔹 Ingen nummer-kolumn längre, bara våra valda kolumner
  visibleColumns.forEach(({ name }) => {
    const th = document.createElement('th');
    if (name.toUpperCase().startsWith('HÄST')) {
      th.textContent = 'Häst';
    } else {
      th.textContent = name;
    }
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  const sortedHorses = division.horses
    .slice()
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  const kuskIndex = headerColumns.findIndex((h) =>
    h.toUpperCase().startsWith('KUSK')
  );

  sortedHorses.forEach((horse) => {
    const tr = document.createElement('tr');
    if (horse.scratched) {
      tr.classList.add('scratched');
    }

    if (!horse.rawLine) {
      // placeholder för struken häst
      visibleColumns.forEach(({ name }) => {
        const td = document.createElement('td');
        if (name.toUpperCase().startsWith('HÄST')) {
          td.textContent = 'Struken';
        } else {
          td.textContent = '';
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    } else {
      const cols = parseLineColumns(horse.rawLine);

      visibleColumns.forEach(({ name, index }) => {
        const td = document.createElement('td');
        const upper = name.toUpperCase();

        if (upper.startsWith('HÄST')) {
          // plocka endast namnet – siffran sitter i sidokolumnerna
          let horseName = cols[index] ?? '';
          const m = horseName.match(/^(\d+)\s+(.*)$/);
          if (m) {
            horseName = m[2];
          }

          // kusk från egen kolumn, om den finns
          let kuskName = '';
          if (kuskIndex >= 0 && cols[kuskIndex]) {
            kuskName = cols[kuskIndex];
          }

          if (kuskName) {
            td.innerHTML = `
              <div class="horse-name">${escapeHtml(horseName)}</div>
              <div class="horse-driver">${escapeHtml(kuskName)}</div>
            `;
          } else {
            td.innerHTML = `
              <div class="horse-name">${escapeHtml(horseName)}</div>
            `;
          }
        } else {
          let value = cols[index] ?? '';
          td.textContent = value;
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    }

// --- vänsterkolumn: ej klickbar + mest spelad + spik-stjärna ---
const leftSquare = createNumberSquare(horse.number);
if (horse.scratched) {
  leftSquare.classList.add('scratched');
}

const count = counts[horse.number] || 0;
// 🔹 Häst som inte finns på någon kupong → röd ruta
if (coupons && coupons.length > 0 && !horse.scratched && count === 0) {
  leftSquare.classList.add('not-played');
}
if (maxCount > 0 && count === maxCount) {
  // mest spelade hästen i denna avdelning
  leftSquare.classList.add('popular-most');
}

const spikeCount = spiked[horse.number] || 0;

// rensa ev. gammal ram först
const oldFrame = leftSquare.querySelector('.star-frame');
if (oldFrame) oldFrame.remove();

if (spikeCount > 0) {
  leftSquare.classList.add('has-spike');

  const size = 5;
  const borderPositions = [];

  // överkant: (0,0) -> (0,4)
  for (let c = 0; c < size; c++) {
    borderPositions.push([0, c]);
  }
  // högerkant (utan hörn): (1,4) -> (3,4)
  for (let r = 1; r < size - 1; r++) {
    borderPositions.push([r, size - 1]);
  }
  // nederkant: (4,4) -> (4,0)
  for (let c = size - 1; c >= 0; c--) {
    borderPositions.push([size - 1, c]);
  }
  // vänsterkant (utan hörn): (3,0) -> (1,0)
  for (let r = size - 2; r > 0; r--) {
    borderPositions.push([r, 0]);
  }

  const maxStarsInFrame = borderPositions.length; // 16
  const usedStars = Math.min(spikeCount, maxStarsInFrame);

  // skapa overlay-lagret
  const frameEl = document.createElement('div');
  frameEl.className = 'star-frame';

  for (let i = 0; i < usedStars; i++) {
    const [r, c] = borderPositions[i];

    const star = document.createElement('span');
    star.className = 'star-cell';
    star.textContent = '★';

    // grid-position (1-baserat)
    star.style.gridRowStart = r + 1;
    star.style.gridColumnStart = c + 1;

    frameEl.appendChild(star);
  }

  leftSquare.appendChild(frameEl);
}






popularList.appendChild(leftSquare);



   // --- högerkolumn: klickbar + markerbar ---
const rightSquare = createNumberSquare(horse.number, { clickable: true });

if (horse.scratched) {
  // Struken häst: grå ruta, ingen klick-funktion
  rightSquare.classList.add('scratched');
  rightSquare.style.cursor = 'default';
} else {
  // Bara icke-strukna kan vara markerade / klickas
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

  // 🔹 gör align efter att layouten är klar
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
  // Ta bort KUSK som egen kolumn i båda lägen (kusk visas under hästnamnet)
  if (mode === 'detailed') {
    return allColumns
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => !name.toUpperCase().startsWith('KUSK'));
  }

  // Enkel lista: HÄST + alla kolumner som slutar på "%", men inte KUSK
  return allColumns
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => {
      const up = name.toUpperCase();

      if (up.startsWith('HÄST')) return true;
      if (up.startsWith('KUSK')) return false;
      if (up.endsWith('%')) return true; // t.ex. V85%, TREND%
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

  const headerHeight = headerRow
    ? headerRow.getBoundingClientRect().height
    : 0;

  // liten offset så siffer-rutorna hamnar mitt i hästraden
  const offset = 51;

  leftCol.style.marginTop = `${headerHeight + offset}px`;
  rightCol.style.marginTop = `${headerHeight + offset}px`;

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
      row.style.height = `${maxHeight}px`; // 🔹 lyft upp struken rad
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
if (isIdea) {
  card.classList.add('my-coupon-card'); // 🔹 speciell bakgrund för "Min kupong"
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
  if (nums.length === 1) {
    // 🔹 spik – visa nummer + hästnamn
    const num = nums[0];
    const name = getHorseName(divIndex, num);
    tdHorses.textContent = name ? `${num} ${name}` : String(num);
  } else {
    tdHorses.textContent = nums.join(' ');
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


    listEl.appendChild(card);
  });
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
