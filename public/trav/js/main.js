import { initAnalysisUI } from './ui-analysis.js';
// public/trav/js/main.js

import {
  getGames,
  createGame,
  deleteGame,
  discoverActiveGames,
  getApiMode,
  updateGame,
  getTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  getAnalyses,
  createAnalysis,
  updateAnalysis,
  deleteAnalysis,
} from './api.js';

import { initGameForm } from './ui-game-form.js';
import { renderGameList } from './ui-game-list.js';

let games = [];
let gameFormApi = null;

function rerenderList() {
  renderGameList(games, {
    onDelete: handleDeleteGame,
    onOverview: handleOverviewGame,
    onEdit: handleEditGame,
  });
}

function setDiscoverStatus(message, tone = '') {
  const el = document.getElementById('discover-games-status');
  if (!el) return;
  el.textContent = message || '';
  el.dataset.tone = tone || '';
}

function initApiModeIndicator() {
  const wrap = document.getElementById('api-mode-indicator');
  if (!wrap) return;

  const mode = getApiMode();
  const isDev = mode.mode === 'dev';
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('api', isDev ? 'render' : 'local');

  const render = () => {
    const fallbackUsed = Boolean(window.__travApiFallbackUsed);
    wrap.className = `api-mode-indicator ${isDev ? 'dev' : 'prod'} ${fallbackUsed ? 'fallback' : ''}`;
    wrap.innerHTML = `
      <span class="api-mode-dot" aria-hidden="true"></span>
      <span class="api-mode-main">${mode.label}</span>
      <span class="api-mode-detail">${
        isDev
          ? fallbackUsed
            ? 'Lokal backend saknas · läser från Render'
            : 'Lokal backend'
          : 'Render / publicerad backend'
      }</span>
      <a class="api-mode-link" href="${nextUrl.pathname}${nextUrl.search}">${
        isDev ? 'Byt till PROD' : 'Byt till DEV'
      }</a>
    `;
  };

  render();
  window.addEventListener('trav-api-fallback', render);
}

async function loadGames() {
  try {
    games = await getGames();
    rerenderList();
  } catch (err) {
    console.error(err);
    alert('Kunde inte hämta spel från servern. Kontrollera att Trav API är igång.');
  }
}

// onSubmit från formuläret – både skapa & redigera
async function handleDiscoverActiveGames() {
  const btn = document.getElementById('btn-discover-active-games');
  if (!btn) return;

  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Letar...';
  setDiscoverStatus('Hämtar aktiva spel och hästinfo från ATG...', 'loading');

  try {
    const result = await discoverActiveGames();
    games = await getGames();
    rerenderList();

    const horseInfoStatus = result.horseImport?.requested
      ? ` · hästinfo ${result.horseImport.imported || 0} hämtade${
          result.horseImport.failed ? ` (${result.horseImport.failed} misslyckades)` : ''
        }`
      : '';

    if (result.horseImport?.failed) {
      console.warn('Hästinfo kunde inte hämtas för alla spel:', result.horseImport.games);
    }

    setDiscoverStatus(
      `${result.found || 0} hittade · ${result.created || 0} nya · ${result.updated || 0} uppdaterade${horseInfoStatus}${
        result.diagnostics?.method ? ` · ${result.diagnostics.method}` : ''
      }`,
      'ok'
    );
  } catch (err) {
    console.error(err);
    setDiscoverStatus(err.message || 'Kunde inte uppdatera spel från ATG.', 'error');
    alert(err.message || 'Kunde inte uppdatera spel från ATG.');
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function handleSubmitFromForm(gameData, mode, existingGame) {
  if (mode === 'create') {
    const created = await createGame(gameData);
    games.unshift(created); // lägg högst upp
  } else if (mode === 'edit' && existingGame) {
    const updated = await updateGame(existingGame._id, gameData);
    games = games.map((g) => (g._id === updated._id ? updated : g));
  }

  rerenderList();
}

function slugifyTrack(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tar bort åäö-accenter
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}



async function handleDeleteGame(game) {
  try {
    await deleteGame(game._id);
    games = games.filter((g) => g._id !== game._id);
    rerenderList();
  } catch (err) {
    console.error(err);
    alert('Kunde inte ta bort spelet.');
  }
}

function handleOverviewGame(game) {
  // Gå till överblickssidan med spel-id i querystring
  window.location.href = `overview.html?id=${encodeURIComponent(game._id)}`;
}

function handleEditGame(game) {
  if (!gameFormApi) return;
  gameFormApi.openEditForm(game);
}

document.addEventListener('DOMContentLoaded', () => {
  initApiModeIndicator();

  gameFormApi = initGameForm({
    onSubmit: handleSubmitFromForm,
    onCancel: () => {},
  });
 
 

  loadGames();
  document
    .getElementById('btn-discover-active-games')
    ?.addEventListener('click', handleDiscoverActiveGames);
  initTrackPanel();
  initAnalysisUI({
    getAnalyses,
    createAnalysis,
    updateAnalysis,
    deleteAnalysis,
  });

  const trackAnalysisModal = initTrackAnalysisModal({
    updateTrack,
    onUpdated: (updated) => {
      // uppdatera cache och UI
      const idx = allTracks.findIndex(x => x._id === updated?._id);
      if (idx >= 0) allTracks[idx] = updated;
      else allTracks.push(updated);
      renderTrackList();
      populateTrackSelect();
    }
  });

  window.__openTrackAnalysis = (trackId) => {
    const t = allTracks.find(x => x._id === trackId);
    if (t) trackAnalysisModal.open(t);
  };
});


// ---- Banor ----

let allTracks = [];
let editingTrackId = null; // null = läge "skapa ny", annars "redigera bana"

async function initTrackPanel() {
  const btnToggle = document.getElementById('btn-toggle-track-panel'); // 👈 samma id
  const panel = document.getElementById('track-panel');
  const form = document.getElementById('track-form');

  await loadTracks();

  if (btnToggle && panel) {
    btnToggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
    });
  
  }

    if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

     const payload = {
  name: document.getElementById('track-name').value.trim(),
  code: document.getElementById('track-code').value.trim(),
  length: document.getElementById('track-length').value.trim(),
  width: document.getElementById('track-width').value.trim(),
  slug: document.getElementById('track-slug').value.trim(),
  homeStretch: document.getElementById('track-homeStretch').value.trim(),
  openStretch: document.getElementById('track-openStretch').value.trim(),
  angledGate: document.getElementById('track-angledGate').value.trim(),
  lat: parseFloat(
    document.getElementById('track-lat').value.replace(',', '.')
  ),
  lon: parseFloat(
    document.getElementById('track-lon').value.replace(',', '.')
  ),
};

if (Number.isNaN(payload.lat)) payload.lat = null;
if (Number.isNaN(payload.lon)) payload.lon = null;

      if (!payload.name || !payload.code) {
        alert('Namn och banförkortning krävs.');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');

      try {
        if (editingTrackId) {
          // 🔹 Uppdatera befintlig bana
          await updateTrack(editingTrackId, payload);
        } else {
          // 🔹 Skapa ny bana
          await createTrack(payload);
        }

        form.reset();
        editingTrackId = null;
        if (submitBtn) submitBtn.textContent = 'Spara bana';

        await loadTracks(); // uppdatera listan + dropdown
      } catch (err) {
        console.error(err);
        alert(err.message || 'Kunde inte spara bana.');
      }
    });
  }

}

async function loadTracks() {
  try {
    allTracks = await getTracks();
  } catch (err) {
    console.error(err);
    allTracks = [];
  }

  renderTrackList();
  populateTrackSelect();
}

function renderTrackList() {
  const list = document.getElementById('track-list');
  const badge = document.getElementById('track-count');
  if (!list) return;

  list.innerHTML = '';

  if (!allTracks.length) {
    const li = document.createElement('li');
    li.className = 'track-list-item';
    li.textContent = 'Inga banor inlagda ännu.';
    list.appendChild(li);
    } else {
    allTracks.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'track-list-item';

      const title = document.createElement('div');
      title.className = 'track-list-item-title';
      title.textContent = `${t.name} (${t.code})`;

      const meta = document.createElement('div');
      meta.className = 'track-list-item-meta';
      meta.textContent = [
        t.length && `Längd: ${t.length}`,
        t.width && `Bredd: ${t.width}`,
        t.homeStretch && `Upplopp: ${t.homeStretch}`,
         t.slug && `Url: ${t.slug}`,
        t.openStretch && `Open stretch: ${t.openStretch}`,
        t.angledGate && `Vinklad vinge: ${t.angledGate}`,
      ]
        .filter(Boolean)
        .join(' • ');

      li.appendChild(title);
      if (meta.textContent) li.appendChild(meta);

      // 🔹 Actions-rad: Redigera / Ta bort
      const actions = document.createElement('div');
      actions.className = 'track-list-item-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn small';
      editBtn.textContent = 'Redigera';

      const analysisBtn = document.createElement('button');
      analysisBtn.type = 'button';
      analysisBtn.className = 'btn small';
      analysisBtn.textContent = 'Analys';


      editBtn.addEventListener('click', () => {
  const panel = document.getElementById('track-panel');
  const form = document.getElementById('track-form');
  if (!form) return;

  editingTrackId = t._id;

  document.getElementById('track-name').value = t.name || '';
  document.getElementById('track-code').value = t.code || '';
  document.getElementById('track-length').value = t.length || '';
  document.getElementById('track-width').value = t.width || '';
  document.getElementById('track-homeStretch').value = t.homeStretch || '';
  document.getElementById('track-openStretch').value = t.openStretch || '';
  document.getElementById('track-angledGate').value = t.angledGate || '';
  document.getElementById('track-slug').value = t.slug || '';

  // 🔹 NYTT – fyll i lat/lon i formuläret
  document.getElementById('track-lat').value =
    t.lat != null ? String(t.lat) : '';
  document.getElementById('track-lon').value =
    t.lon != null ? String(t.lon) : '';

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Uppdatera bana';

  if (panel && panel.hidden) panel.hidden = false;
});


      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn small danger';
      deleteBtn.textContent = 'Ta bort';

      deleteBtn.addEventListener('click', async () => {
        const ok = confirm(
          `Är du säker på att du vill ta bort banan "${t.name}"?`
        );
        if (!ok) return;

        try {
          await deleteTrack(t._id);

          // Om vi stod och redigerade denna – nollställ formuläret
          if (editingTrackId === t._id) {
            editingTrackId = null;
            const form = document.getElementById('track-form');
            if (form) {
              form.reset();
              const submitBtn = form.querySelector('button[type="submit"]');
              if (submitBtn) submitBtn.textContent = 'Spara bana';
            }
          }

          await loadTracks();
        } catch (err) {
          console.error(err);
          alert(err.message || 'Kunde inte ta bort bana.');
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(analysisBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(actions);
      list.appendChild(li);
    });
  }


  if (badge) {
    badge.textContent = `${allTracks.length} banor`;
  }
}

document.getElementById('btn-update-results')?.addEventListener('click', async () => {
  const ok = confirm('Vill du uppdatera vinnare för alla spel?');
  if (!ok) return;

  try {
    await fetch('/api/results/update', { method: 'POST' });
    alert('Resultat uppdaterade');
  } catch (err) {
    console.error(err);
    alert('Kunde inte uppdatera resultat');
  }
});


function populateTrackSelect() {
  const select = document.getElementById('game-track');
  const info = document.getElementById('game-track-info');
  if (!select) return;

  const prevValue = select.value;

  select.innerHTML = '<option value="">Välj bana...</option>';

  allTracks.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.name; // 🔹 spelets "Bana"-fält = ban-namnet
    opt.dataset.code = t.code;
    opt.dataset.length = t.length || '';
    opt.dataset.width = t.width || '';
    opt.dataset.homeStretch = t.homeStretch || '';
    opt.dataset.openStretch = t.openStretch || '';
    opt.dataset.angledGate = t.angledGate || '';
    opt.textContent = `${t.name} (${t.code})`;
    select.appendChild(opt);
  });

  if (prevValue) {
    select.value = prevValue;
  }

  const updateHint = () => {
    const opt = select.selectedOptions[0];
    if (!opt || !info) {
      if (info) info.textContent = '';
      return;
    }

    const parts = [];
    if (opt.dataset.length) parts.push(`Längd: ${opt.dataset.length}`);
    if (opt.dataset.width) parts.push(`Bredd: ${opt.dataset.width}`);
    if (opt.dataset.homeStretch)
      parts.push(`Upplopp: ${opt.dataset.homeStretch}`);
    if (opt.dataset.openStretch)
      parts.push(`Open stretch: ${opt.dataset.openStretch}`);
    if (opt.dataset.angledGate)
      parts.push(`Vinklad vinge: ${opt.dataset.angledGate}`);

    info.textContent = parts.join(' • ');
  };

  select.addEventListener('change', updateHint);
  updateHint();
}
