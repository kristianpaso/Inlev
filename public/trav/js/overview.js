// public/trav/js/overview.js

// var innan: import { getGame } from './api.js';
import { getGame, createCoupon, deleteCoupon } from './api.js';

let game = null;
let currentGameId = null;

let divisions = [];
let currentIndex = 0;
let headerColumns = [];
let divisionSquares = [];
let divisionCountEls = [];
let coupons = [];                 // sparade kuponger för spelet
let isBuildingCoupon = false;
let couponSelections = {};        // { divisionIndex: Set([...]) }


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
    game = await getGame(gameId);
    currentGameId = game._id;
    loadIdeaSelections(currentGameId);        // 🔹 läs markeringar från localStorage
    setupOverview(game);
  } catch (err) {
    console.error(err);
    alert('Kunde inte hämta spelet.');
  }

  // 🔹 Kör om alignment när fönstret ändrar storlek (t.ex. text bryts om)
  window.addEventListener('resize', syncNumberPositions);
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
  computeAndRenderPrice();   // startpris (utifrån sparade markeringar)
  initCouponUI();
renderCouponList();

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

  if (!total) {
    centerDivIndexEl.textContent = '-';
  } else {
    const humanIndex = divisions[index]?.index || index + 1;
    centerDivIndexEl.textContent = humanIndex;
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
if (maxCount > 0 && count === maxCount) {
  // mest spelade hästen i denna avdelning
  leftSquare.classList.add('popular-most');
}

const spikeCount = spiked[horse.number] || 0;
if (spikeCount > 0) {
  leftSquare.classList.add('has-spike');

  // Bygg stjärnor 2 och 2 per rad
  const rows = [];
  let remaining = spikeCount;
  while (remaining > 0) {
    const thisRow = Math.min(2, remaining);
    rows.push('★'.repeat(thisRow));
    remaining -= thisRow;
  }

  const stars = rows.join('\n'); // t.ex. "★★\n★★\n★"
  leftSquare.setAttribute('data-stars', stars);
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

  const radPris = getRadPris(game?.gameType);
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
    sub = `${countsExpr} = ${rows} rader • Radpris: ${radPrisFormatted} kr`;
  } else {
    sub = 'Inga val.';
  }

  priceEl.innerHTML = `
    <div class="price-info-main">${main}</div>
    <div class="price-info-sub">${sub}</div>
  `;
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
  const offset = 38;

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
    const card = document.createElement('div');
    card.className = 'coupon-card';

    const header = document.createElement('div');
    header.className = 'coupon-card-header';

    const title = document.createElement('div');
    title.className = 'coupon-card-title';
    title.textContent = `Kupong ${idx + 1}`;

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

    listEl.appendChild(card);
  });
}


