const GAME_DIVISIONS = { V64: 6, V65: 6, V85: 8, V86: 8, GS75: 7 };
const LOCAL_API_ROOT = 'http://localhost:4000/api/trav';
const RENDER_API_ROOT = 'https://trav-api.onrender.com/api/trav';
const query = new URLSearchParams(window.location.search);
const forcedApi = query.get('api');
const API_ROOTS = forcedApi === 'local' ? [LOCAL_API_ROOT] : forcedApi === 'render' ? [RENDER_API_ROOT] : [LOCAL_API_ROOT, RENDER_API_ROOT];
let activeApiRoot = API_ROOTS[0];
const state = { games: [], round: null, coupons: [], savedCoupons: [], locks: new Set(), combinationLocks: new Set(), lockedCombinationPatterns: new Map(), selectedPlanIndexes: [], combinationOptions: [], couponCount: 3, spikeCount: 2, editingRound: false, seed: 1, shuffleSeed: 0, countPlanCache: new Map(), regenerateTimer: null, refreshImportTimer: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function apiFetch(endpoint, options = {}) {
  const path = String(endpoint).replace(LOCAL_API_ROOT, '').replace(RENDER_API_ROOT, '');
  const { timeoutMs = 3500, ...fetchOptions } = options;
  let lastError = null;
  for (const root of [...new Set([activeApiRoot, ...API_ROOTS])]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${root}${path}`, { ...fetchOptions, signal: fetchOptions.signal || controller.signal });
      if (response.ok || response.status < 500 || root === RENDER_API_ROOT || forcedApi === 'local') {
        activeApiRoot = root;
        return response;
      }
      lastError = new Error(`Trav API svarade med ${response.status}`);
    } catch (error) { lastError = error; }
    finally { clearTimeout(timer); }
  }
  throw lastError || new Error('Trav API kunde inte nås');
}

function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function money(value) { return `${Math.round(Number(value) || 0).toLocaleString('sv-SE')} kr`; }
function number(value, fallback = null) { const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.').trim()); return Number.isFinite(parsed) ? parsed : fallback; }
function fmtPercent(value) { const parsed = number(value); return parsed === null ? '–' : `${parsed % 1 ? parsed.toFixed(1) : parsed}%`; }
function fmtTrendValue(value) { const parsed = number(value); return parsed === null ? '–' : `${parsed % 1 ? parsed.toFixed(2) : parsed}`; }
function winningTrendPercent(horse) { const winPercent = number(horse?.winPercent, null); const trendPercent = number(horse?.trendPercent, null); return winPercent === null || trendPercent === null ? null : winPercent - trendPercent; }
function today() { return new Date().toISOString().slice(0, 10); }
function dateLabel(value) { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }); }
function trackSlug(value) { return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-'); }
function divisionCount(type) { return GAME_DIVISIONS[String(type || '').toUpperCase()] || 0; }
function atgUrls({ date, gameType, track }) { const slug = trackSlug(track); return Array.from({ length: divisionCount(gameType) }, (_, i) => `https://www.atg.se/spel/${date}/${gameType}/${slug}/avd/${i + 1}`); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200); }

function parseHorse(raw, index = 0) {
  if (raw && typeof raw === 'object' && (raw.name || raw.rawLine)) {
    const line = String(raw.rawLine || '');
    const cells = line.split('\t');
    const match = String(raw.name || cells[1] || '').match(/^\s*(\d+)\s+(.+)$/);
    return { id: raw.id || `${raw.number || index}-${raw.name || 'horse'}`, number: number(raw.number, match ? Number(match[1]) : number(cells[0], index + 1)), name: raw.name || (match ? match[2] : cells[1] || line), sexAge: raw.sexAge || cells[2] || '', driver: raw.driver || cells[3] || '', winPercent: number(raw.winPercent, number(cells[4])), startTrendPercent: number(raw.startTrendPercent, number(cells[5])), trendPercent: number(raw.trendPercent, number(cells[5])), winOdds: number(raw.winOdds, number(cells[6])), trainer: raw.trainer || cells[7] || '', sulky: raw.sulky || cells[8] || '', scratched: Boolean(raw.scratched), manualScore: number(raw.manualScore, 0), note: raw.note || '' };
  }
  const line = String(raw || '').trim();
  const parts = line.split('\t');
  const match = line.match(/^(\d+)\s+(.+)$/);
  return { id: `${index}-${line}`, number: match ? Number(match[1]) : number(parts[0], index + 1), name: match ? match[2] : parts[1] || line, sexAge: parts[2] || '', driver: parts[3] || '', winPercent: number(parts[4]), startTrendPercent: number(parts[5]), trendPercent: number(parts[5]), winOdds: number(parts[6]), trainer: parts[7] || '', sulky: parts[8] || '', scratched: false, manualScore: 0, note: '' };
}

function normalizeGame(game) {
  const parsed = game?.parsedHorseInfo || {};
  const source = Array.isArray(parsed.divisions) ? parsed.divisions : [];
  const races = source.map((division, index) => ({ division: Number(division.index || division.division || index + 1), sourceUrl: division.sourceUrl || '', horses: (division.horses || []).map((horse, horseIndex) => { const parsedHorse = parseHorse(horse, horseIndex); if (parsedHorse.startTrendPercent === null || parsedHorse.startTrendPercent === 0) parsedHorse.startTrendPercent = winningTrendPercent(parsedHorse); return parsedHorse; }).filter((horse) => horse.name || horse.number) })).filter((race) => race.horses.length);
  const expected = divisionCount(game?.gameType) || Number(parsed.expectedDivisions) || 0;
  return { id: String(game?._id || game?.id || ''), name: game?.title || `${game?.gameType || 'Trav'} ${game?.track || ''}`.trim(), date: game?.date || today(), gameType: String(game?.gameType || 'V64').toUpperCase(), track: game?.track || '', trackSlug: game?.trackSlug || trackSlug(game?.track), divisionCount: expected || races.length, rowPrice: 1, source: 'database', races };
}

function renderDatabaseStatus(message, mode = '') { const el = $('#db-status'); el.textContent = message; el.className = `status-pill ${mode}`; }
function renderHome() {
  const list = $('#round-list');
  const games = state.games.slice(0, 18);
  list.innerHTML = games.map((game) => { const round = normalizeGame(game); const horses = round.races.reduce((sum, race) => sum + race.horses.length, 0); const typeClass = `game-type-${String(round.gameType || '').toLowerCase()}`; return `<article class="round-card ${typeClass}" data-game-id="${esc(round.id)}"><span class="type">${esc(round.gameType)}</span><button class="delete-game-button" data-delete-game="${esc(round.id)}" title="Ta bort omgång">Ta bort</button><h3>${esc(round.track || round.name)}</h3><p>${esc(dateLabel(round.date))} · ${round.divisionCount || '–'} avdelningar · ${horses || '–'} hästar</p><span class="arrow">→</span></article>`; }).join('');
  $('#empty-rounds').hidden = games.length > 0;
}

async function loadGames() {
  renderDatabaseStatus('Hämtar databasen…');
  try {
    const response = await apiFetch('/games');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.games = await response.json();
    if (Array.isArray(state.games) && state.games.length === 0 && activeApiRoot === LOCAL_API_ROOT && forcedApi !== 'local') {
      const renderResponse = await fetch(`${RENDER_API_ROOT}/games`);
      if (renderResponse.ok) {
        state.games = await renderResponse.json();
        activeApiRoot = RENDER_API_ROOT;
      }
    }
    renderDatabaseStatus(`Databasdata · ${activeApiRoot === RENDER_API_ROOT ? 'Render' : 'lokal'}`, 'ok');
    renderHome();
  } catch (error) {
    state.games = [];
    renderDatabaseStatus('Databasen kunde inte nås', 'offline');
    renderHome();
    showToast('Kunde inte läsa Trav-data. Starta Trav API eller kontrollera Render.');
    console.error(error);
  }
}

function showView(name) {
  const isRound = name === 'round' && state.round;
  const isCoupons = name === 'coupons';
  const isResults = name === 'results';
  $$('.view').forEach((view) => { const active = view.id === (isRound ? 'round-view' : isCoupons ? 'coupons-view' : isResults ? 'results-view' : name === 'home' ? 'home-view' : 'placeholder-view'); view.hidden = !active; view.classList.toggle('active-view', active); });
  $$('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === (isRound ? 'round' : name)));
}

function savedCouponEntries() {
  return (state.games || []).flatMap((game) => (Array.isArray(game.coupons) ? game.coupons : []).map((coupon) => ({ game, coupon })));
}

function savedCouponGroups() {
  const groups = new Map();
  const legacyGroups = [];
  for (const entry of savedCouponEntries()) {
    const { game, coupon } = entry;
    let group;
    if (coupon.packageId) {
      const key = `${game._id}:${coupon.packageId}`;
      if (!groups.has(key)) groups.set(key, { key, game, coupons: [], createdAt: coupon.packageCreatedAt || coupon.createdAt || null });
      group = groups.get(key);
    } else if (coupon.source === 'tillsammans') {
      const created = new Date(coupon.createdAt || 0).getTime();
      group = legacyGroups.find((candidate) => candidate.game._id === game._id && Math.abs(created - new Date(candidate.createdAt || 0).getTime()) <= 15000);
      if (!group) {
        group = { key: `${game._id}:legacy:${created}:${legacyGroups.length}`, game, coupons: [], createdAt: coupon.createdAt || null };
        legacyGroups.push(group);
        groups.set(group.key, group);
      }
    } else {
      const key = `${game._id}:legacy:${coupon._id}`;
      group = { key, game, coupons: [], createdAt: coupon.createdAt || null };
      groups.set(key, group);
    }
    group.coupons.push(coupon);
    if (!group.createdAt || new Date(coupon.createdAt || 0) < new Date(group.createdAt || 0)) group.createdAt = coupon.createdAt;
  }
  return Array.from(groups.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function savedCouponRuntime(coupon, round) {
  const selections = (round.races || []).map((race) => coupon.selections?.find((selection) => Number(selection.divisionIndex) === Number(race.division))?.horses || []);
  const rows = Number.isFinite(Number(coupon.rows)) ? Number(coupon.rows) : selections.reduce((total, picks) => total * Math.max(1, picks.length), 1);
  return { ...coupon, selections, rows, cost: Number.isFinite(Number(coupon.cost)) ? Number(coupon.cost) : rows * (round.rowPrice || 1), spikeCount: coupon.spikeCount ?? selections.filter((selection) => selection.length === 1).length, variation: coupon.variation ?? 0 };
}

function renderSavedCouponCard(coupon, round, couponIndex) {
  const runtime = savedCouponRuntime(coupon, round);
  return `<article class="coupon-card saved-coupon-design"><div class="coupon-top"><span>KUPONG ${couponIndex + 1} · ${esc(String(coupon.name || '').replace(/^Tillsammans\s*·\s*/i, ''))}</span><span class="coupon-cost">${money(runtime.cost)}</span></div><p class="strategy-note">Sparad kupong</p>${(round.races || []).map((race, raceIndex) => `<div class="coupon-race saved-coupon-race"><span class="race-label">${race.division}</span>${couponPicksMarkup(runtime, race, raceIndex)}</div>`).join('')}<div class="coupon-footer"><span>${runtime.rows.toLocaleString('sv-SE')} rader · ${runtime.spikeCount} spikar</span><button class="delete-coupon-button" data-delete-saved-coupon="${esc(coupon._id)}" data-delete-game="${esc(round.id)}" title="Ta bort kupong">Ta bort</button></div></article>`;
}

function renderSavedCoupons() {
  const list = $('#saved-coupons-list');
  const status = $('#saved-coupons-status');
  if (!list || !status) return;
  const groups = savedCouponGroups();
  const totalCoupons = groups.reduce((total, group) => total + group.coupons.length, 0);
  status.textContent = `${totalCoupons} sparade kuponger · ${groups.length} paket`;
  if (!groups.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">▣</div><h3>Inga sparade kuponger</h3><p>Spara ett kupongpaket från en omgång så visas kupongerna här.</p></div>'; return; }
  list.innerHTML = groups.map((group) => { const round = normalizeGame(group.game); const groupDate = group.createdAt ? new Date(group.createdAt).toLocaleString('sv-SE') : 'Sparat paket'; const title = group.coupons[0]?.packageName || `${round.gameType} ${round.track}`; return `<section class="saved-coupon-group"><div class="saved-coupon-group-header"><div><span class="eyebrow">KUPONGPAKET</span><h3>${esc(title)}</h3><p>${esc(dateLabel(round.date))} · ${esc(round.track)} · ${esc(groupDate)}</p></div><span class="status-pill ok">${group.coupons.length} kuponger</span></div><div class="saved-coupon-group-grid">${group.coupons.map((coupon, index) => renderSavedCouponCard(coupon, round, index)).join('')}</div></section>`; }).join('');
}

async function loadSavedCoupons() {
  try {
    const response = await apiFetch('/games');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.games = await response.json();
    const current = state.round ? state.games.find((game) => String(game._id) === String(state.round.id)) : null;
    state.savedCoupons = Array.isArray(current?.coupons) ? current.coupons : [];
  } catch (error) {
    showToast('Kunde inte läsa sparade kuponger');
    console.error(error);
  }
  renderSavedCoupons();
}

function resultDetailsFor(game) {
  const details = game?.resultDetails;
  return details && typeof details === 'object' ? details : { divisions: {}, payouts: {} };
}

function resultMoney(value, fallback = '–') {
  const parsed = number(value, null);
  return parsed === null ? fallback : money(parsed);
}

function resultCouponSelections(coupon, round) {
  return (round.races || []).map((race) => {
    const entry = (coupon.selections || []).find((item) => Number(item.divisionIndex) === Number(race.division));
    const raw = entry?.horses ?? [];
    return (Array.isArray(raw) ? raw : String(raw).split(/[\s,;]+/)).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  });
}

function renderSavedCouponResult(coupon, round, winnerMap, couponIndex) {
  const selections = resultCouponSelections(coupon, round);
  const rows = selections.map((picks, index) => {
    const division = round.races[index]?.division || index + 1;
    const winner = winnerMap.get(String(division));
    const hit = Number.isFinite(winner) && picks.includes(winner);
    return `<div class="result-coupon-row ${hit ? 'result-coupon-row-hit' : ''}"><span class="result-coupon-division">${esc(division)}</span><span class="result-coupon-picks">${picks.map((horseNumber) => `<span class="result-coupon-number ${horseNumber === winner ? 'result-coupon-number-hit' : ''}">${esc(horseNumber)}</span>`).join('') || '–'}</span><span class="result-coupon-check">${hit ? '✓' : ''}</span></div>`;
  });
  const hitCount = rows.filter((row) => row.includes('result-coupon-row-hit')).length;
  const name = String(coupon.name || `Kupong ${couponIndex + 1}`).replace(/^Tillsammans\s*·\s*/i, '');
  return `<article class="result-saved-coupon"><div class="result-saved-coupon-head"><strong>Kupong ${couponIndex + 1} · ${esc(name)}</strong><span>${hitCount} av ${rows.length} rätt</span></div><div class="result-coupon-rows">${rows.join('')}</div></article>`;
}

function renderResultCard(game) {
  const details = resultDetailsFor(game);
  const divisions = details.divisions || {};
  const resultMap = game.results || {};
  const hasResults = Object.keys(divisions).length || Object.keys(resultMap).length;
  const round = normalizeGame(game);
  const winners = Array.from({ length: round.divisionCount || Object.keys(resultMap).length }, (_, index) => {
    const division = String(index + 1);
    const detail = divisions[division] || {};
    const winnerNumber = Number.isFinite(Number(detail.horseNumber)) ? Number(detail.horseNumber) : Number(resultMap[division]);
    const race = round.races.find((item) => Number(item.division) === Number(division));
    const horse = race?.horses?.find((item) => Number(item.number) === winnerNumber);
    return { division, detail, winnerNumber, horse };
  }).filter((item) => Number.isFinite(item.winnerNumber) || item.detail.horseText);
  const winnerMap = new Map(winners.map((item) => [String(item.division), item.winnerNumber]));
  const payouts = Object.entries(details.payouts || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
  const updated = game.resultsUpdatedAt ? new Date(game.resultsUpdatedAt).toLocaleString('sv-SE') : '';
  return `<article class="result-card" data-result-game="${esc(game._id)}"><div class="result-card-header"><div><span class="eyebrow">${esc(game.gameType)} · RESULTAT</span><h3>${esc(game.track)}</h3><p>${esc(dateLabel(game.date))} · ${round.divisionCount || '–'} avdelningar</p></div><button class="ghost-button result-fetch-button" data-fetch-results="${esc(game._id)}">${hasResults ? '↻ Uppdatera resultat' : 'Hämta resultat'}</button></div>${hasResults ? `<div class="result-winner-grid">${winners.map((item) => `<div class="result-winner-row"><span class="result-division">${esc(item.division)}</span><div><strong>${item.winnerNumber ? `${esc(item.winnerNumber)} ` : ''}${esc(item.horse?.name || item.detail.horseName || item.detail.horseText || 'Vinnare')}</strong>${item.horse?.driver ? `<small>${esc(item.horse.driver)}</small>` : ''}</div><span class="result-value">${resultMoney(item.detail.value, item.detail.valueText || '–')}</span></div>`).join('')}</div><div class="result-summary">${payouts.length ? payouts.map(([count, payout]) => `<div><span>Utdelning ${esc(count)} rätt</span><strong>${esc(payout.label || resultMoney(payout.amount))}</strong></div>`).join('') : '<div><span>Utdelning</span><strong>Ej hämtad</strong></div>'}${details.turnover ? `<div><span>Omsättning</span><strong>${esc(details.turnover.label || resultMoney(details.turnover.amount))}</strong></div>` : ''}${details.systemCount ? `<div><span>Antal system</span><strong>${esc(details.systemCount.label || resultMoney(details.systemCount.amount))}</strong></div>` : ''}</div>${Array.isArray(game.coupons) && game.coupons.length ? `<section class="result-saved-coupons"><div class="result-saved-heading"><span class="eyebrow">KUPONGKONTROLL</span><strong>Sparade kuponger mot resultatet</strong></div>${game.coupons.map((coupon, couponIndex) => renderSavedCouponResult(coupon, round, winnerMap, couponIndex)).join('')}</section>` : ''}<p class="result-updated">Senast uppdaterad ${esc(updated)}</p>` : '<div class="result-empty"><span>◎</span><p>Resultat är inte hämtat för den här omgången.</p></div>'}</article>`;
}

function renderResults() {
  const list = $('#results-list');
  const status = $('#results-status');
  if (!list || !status) return;
  const games = Array.isArray(state.games) ? state.games : [];
  const withResults = games.filter((game) => Object.keys(game.results || {}).length || Object.keys(game.resultDetails?.divisions || {}).length).length;
  status.textContent = `${withResults} av ${games.length} omgångar har sparade resultat`;
  list.innerHTML = games.length ? games.map(renderResultCard).join('') : '<div class="empty-state"><div class="empty-icon">▥</div><h3>Inga skapade omgångar</h3><p>Skapa en omgång först så kan resultat sparas här.</p></div>';
}

async function loadResults() {
  if (!state.games.length) await loadGames();
  renderResults();
}

async function fetchGameResults(gameId) {
  const game = state.games.find((item) => String(item._id) === String(gameId));
  const button = document.querySelector(`[data-fetch-results="${CSS.escape(String(gameId))}"]`);
  if (!game) return;
  if (button) { button.disabled = true; button.textContent = 'Hämtar resultat…'; }
  try {
    const response = await apiFetch(`/games/${encodeURIComponent(gameId)}/results/fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: game.date, gameType: game.gameType, trackSlug: game.trackSlug || trackSlug(game.track) }), timeoutMs: 120000 });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Resultathämtningen svarade ${response.status}`);
    game.results = payload.results || {};
    game.resultDetails = payload.resultDetails || {};
    game.resultsUpdatedAt = payload.resultsUpdatedAt || new Date().toISOString();
    renderResults();
    showToast('Resultatet sparades under Resultat');
  } catch (error) {
    showToast(error.message);
    if (button) { button.disabled = false; button.textContent = 'Hämta resultat'; }
  }
}

async function deleteSavedCoupon(gameId, couponId) {
  if (!couponId || !window.confirm('Vill du ta bort kupongen?')) return;
  try {
    const response = await apiFetch(`/games/${encodeURIComponent(gameId)}/coupons/${encodeURIComponent(couponId)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await response.text() || 'Kunde inte ta bort kupongen');
    const game = state.games.find((item) => String(item._id) === String(gameId));
    if (game) game.coupons = (game.coupons || []).filter((coupon) => String(coupon._id) !== String(couponId));
    renderSavedCoupons();
    showToast('Kupongen togs bort');
  } catch (error) { showToast(error.message); }
}

async function deleteGame(gameId) {
  const game = state.games.find((item) => String(item._id) === String(gameId));
  if (!game || !window.confirm(`Vill du ta bort omgången ${game.gameType || ''} ${game.track || ''}? Kuponger och sparade resultat försvinner också.`)) return;
  try {
    const response = await apiFetch(`/games/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await response.text() || 'Kunde inte ta bort omgången');
    state.games = state.games.filter((item) => String(item._id) !== String(gameId));
    if (String(state.round?.id) === String(gameId)) {
      state.round = null;
      state.savedCoupons = [];
      showView('home');
    }
    renderHome();
    showToast('Omgången togs bort');
  } catch (error) { showToast(error.message); }
}

function renderPreview() {
  const date = $('#round-date').value; const type = $('#round-type').value; const track = $('#round-track').value.trim(); const preview = $('#round-preview');
  if (!date || !type || !track) { preview.innerHTML = '<span>Fyll i datum, spelform och bana</span>'; return; }
  const urls = atgUrls({ date, gameType: type, track });
  preview.innerHTML = `<strong>ATG-omgång</strong><br>${esc(type)} ${esc(track)} · ${dateLabel(date)} · ${urls.length} avdelningar<code>${esc(urls[0])}</code><small>+ ${urls.length - 1} avdelningslänkar byggs automatiskt</small>`;
}

function renderImportStatus(items, message = '') { const box = $('#import-status'); box.hidden = false; box.innerHTML = `${message ? `<strong>${esc(message)}</strong>` : ''}${items.map((item) => `<div class="import-line ${item.status}"><span>${item.status === 'done' ? '✓' : item.status === 'error' ? '!' : item.status === 'loading' ? '⟳' : '○'} Avd ${item.division}</span><span>${item.status === 'done' ? `${item.count} hästar` : item.status === 'error' ? esc(item.message || 'kunde inte hämtas') : item.status === 'loading' ? 'hämtar…' : ''}</span></div>`).join('')}`; }
function setCreateBusy(busy) { $('#import-round').disabled = busy; $('#manual-round').disabled = busy; $('#import-round').innerHTML = busy ? 'Hämtar startlista…' : 'Hämta startlista <span>→</span>'; }

function setRefreshImportOverlay(config, mode = 'loading', message = '') {
  const overlay = $('#refresh-import-overlay');
  if (!overlay) return;
  const title = $('#refresh-import-title');
  const detail = $('#refresh-import-detail');
  const phase = $('#refresh-import-phase');
  const bar = $('#refresh-import-progress');
  const percent = $('#refresh-import-percent');
  const eta = $('#refresh-import-eta');
  if (mode === 'loading') {
    overlay.hidden = false;
    overlay.classList.remove('is-error', 'is-complete');
    title.textContent = `Uppdaterar ${config.gameType} ${config.track}`;
    detail.textContent = 'ATG-data hämtas och jämförs med den sparade startlistan.';
    phase.textContent = 'Förbereder importen…';
    bar.value = 4;
    percent.textContent = '4%';
    eta.textContent = 'Beräknar återstående tid…';
    const startedAt = performance.now();
    const estimateMs = Math.max(9000, divisionCount(config.gameType) * 2200);
    clearInterval(state.refreshImportTimer);
    state.refreshImportTimer = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(92, Math.round(4 + (elapsed / estimateMs) * 88));
      const remaining = Math.max(1, Math.ceil((estimateMs - elapsed) / 1000));
      bar.value = progress;
      percent.textContent = `${progress}%`;
      eta.textContent = `Cirka ${remaining} sek kvar (uppskattning)`;
      phase.textContent = progress < 30 ? 'Ansluter till Trav API…' : progress < 70 ? 'Hämtar startlistor från ATG…' : progress < 90 ? 'Läser kusk, vinnarprocent, odds och trend…' : 'Sparar och jämför uppdateringen…';
    }, 250);
    return;
  }
  clearInterval(state.refreshImportTimer);
  state.refreshImportTimer = null;
  overlay.classList.toggle('is-error', mode === 'error');
  overlay.classList.toggle('is-complete', mode === 'complete');
  title.textContent = mode === 'complete' ? 'Importen är klar' : 'Importen kunde inte slutföras';
  detail.textContent = message || (mode === 'complete' ? 'Startlistan är uppdaterad och ändrade värden markeras grönt.' : 'Kontrollera Trav API eller Render och försök igen.');
  phase.textContent = mode === 'complete' ? '✓ Uppdateringen sparades' : '! Importen avbröts';
  bar.value = mode === 'complete' ? 100 : 0;
  percent.textContent = mode === 'complete' ? '100%' : '0%';
  eta.textContent = '';
}

function hideRefreshImportOverlay() {
  clearInterval(state.refreshImportTimer);
  state.refreshImportTimer = null;
  const overlay = $('#refresh-import-overlay');
  if (overlay) overlay.hidden = true;
}

async function createDatabaseGame(config) {
  const response = await apiFetch('/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `${config.gameType} ${config.track}`, date: config.date, track: config.track, trackSlug: trackSlug(config.track), gameType: config.gameType, horseText: '' }) });
  if (!response.ok) throw new Error(await response.text() || 'Kunde inte skapa omgång');
  return response.json();
}

async function importRound(config, gameId, manual = false) {
  const urls = atgUrls(config); const statuses = urls.map((_, i) => ({ division: i + 1, status: 'pending' }));
  renderImportStatus(statuses, manual ? 'Skapar en tom omgång för manuell redigering' : `Hämtar ${config.gameType} ${config.track}…`);
  if (manual) return normalizeGame({ _id: gameId, title: `${config.gameType} ${config.track}`, ...config, parsedHorseInfo: { expectedDivisions: urls.length, divisions: [] } });
  statuses[0].status = 'loading'; renderImportStatus(statuses, `Hämtar ${config.gameType} ${config.track}…`);
  const response = await apiFetch('/rounds/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, ...config }), timeoutMs: 120000 });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 207) throw new Error(payload.error || `ATG-importen svarade ${response.status}`);
  const errors = payload.errors || [];
  statuses.forEach((item) => { const error = errors.find((entry) => entry.division === item.division); item.status = error ? 'error' : 'done'; item.count = payload.round?.races?.find((race) => race.division === item.division)?.horses?.length || 0; item.message = error?.message; });
  renderImportStatus(statuses, errors.length ? 'Omgång delvis importerad' : '✓ Omgång importerad');
  return payload.round ? payload.round : normalizeGame({ _id: gameId, ...config, parsedHorseInfo: { divisions: [] } });
}

async function submitCreate(event, manual = false) {
  event?.preventDefault();
  const config = { date: $('#round-date').value, gameType: $('#round-type').value, track: $('#round-track').value.trim() };
  if (!config.date || !config.gameType || !config.track) return;
  setCreateBusy(!manual);
  try {
    const game = await createDatabaseGame(config);
    const round = await importRound(config, game._id, manual);
    state.round = round.id ? round : { ...round, id: String(game._id) };
    if (!state.round.races) state.round = normalizeGame({ ...game, parsedHorseInfo: { expectedDivisions: divisionCount(config.gameType), divisions: [] } });
    $('#create-modal').hidden = true; resetCombinationState(); state.seed += 1; generateCoupons(); renderRound(); showView('round'); await loadGames();
  } catch (error) { renderImportStatus([{ division: '–', status: 'error', message: error.message }], 'Importen kunde inte slutföras'); showToast(error.message); console.error(error); }
  finally { setCreateBusy(false); }
}

function renderRoundHeader() { const round = state.round; $('#round-header').innerHTML = `<div class="round-header"><div class="round-title"><div class="track-orb">⌁</div><div><div class="eyebrow">AKTUELL OMGÅNG</div><h1>${esc(round.gameType)} – ${esc(round.track || 'Bana saknas')}</h1><p>${esc(dateLabel(round.date))} · ${round.divisionCount} avdelningar · Radpris ${money(round.rowPrice)}</p></div></div><div class="header-actions"><button class="primary-button" id="header-edit">✎ Redigera omgång</button><a class="ghost-button" href="${esc(atgUrls(round)[0] || '#')}" target="_blank" rel="noreferrer">Öppna ATG ↗</a></div></div>`; }

function raceFavorite(race) { return [...(race.horses || [])].filter((horse) => !horse.scratched).sort((a, b) => (b.winPercent ?? -1) - (a.winPercent ?? -1))[0]; }
function renderRacesLegacyOriginal() {
  const races = state.round?.races || []; const count = state.round?.divisionCount || 0;
  if (!races.length) { $('#races-list').innerHTML = `<div class="empty-state"><div class="empty-icon">◎</div><h3>Ingen startlista i denna omgång</h3><p>ATG-importen kan ha misslyckats eller så är omgången skapad manuellt. Redigera omgången för att lägga in hästar.</p><button class="secondary-button" id="empty-edit">Redigera omgång</button></div>`; return; }
  $('#races-list').innerHTML = races.map((race) => { const favorite = raceFavorite(race); const horses = [...race.horses].sort((a, b) => (a.number || 0) - (b.number || 0)); return `<article class="race-card" data-division="${race.division}"><div class="race-summary"><div class="race-number">${race.division}</div><div><h3>Avd ${race.division}</h3><p>${horses.length} hästar · ${favorite ? `Favorit ${favorite.number} ${esc(favorite.name)}` : 'ingen favorit'}</p></div><div class="race-favorite">Favorit<strong>${favorite ? `${favorite.number} · ${fmtPercent(favorite.winPercent)}` : '–'}</strong></div></div><div class="race-body"><div class="horse-row header-row"><span>#</span><span>Häst</span><span>Kusk</span><span>%</span><span>Odds</span></div>${horses.slice(0, 30).map((horse) => `<div class="horse-row ${favorite?.number === horse.number ? 'favorite-row' : ''}"><span class="horse-num">${favorite?.number === horse.number ? '<span class="star">★</span>' : ''}${esc(horse.number)}</span><span class="horse-name">${esc(horse.name)}${horse.scratched ? ' · struken' : ''}</span><span class="horse-meta">${esc(horse.driver || horse.trainer || '–')}</span><span class="horse-percent">${fmtPercent(horse.winPercent)}</span><span class="horse-odds">${horse.winOdds ?? '–'}</span></div>`).join('')}</div></article>`; }).join('') + (races.length < count ? `<div class="partial-note">${races.length} av ${count} avdelningar importerade · använd Redigera för att komplettera.</div>` : ''); }

function rowsFor(coupon) { return coupon.selections.reduce((total, picks) => total * Math.max(1, picks.length), 1); }
function budget() { return Math.max(1, Number($('#share-price')?.value || 20)) * Math.max(1, Number($('#share-count')?.value || 50)); }
function requestedSpikes() { const selected = $('#spike-count')?.querySelector('.selected'); const value = Number(selected?.dataset.spikes ?? state.spikeCount ?? 2); return Math.max(0, Math.min(5, Number.isFinite(value) ? value : 2)); }
function strategies(count) { return count === 2 ? [{ name: 'Favorit', note: 'Favoriter och starka chanser' }, { name: 'Mellan', note: 'Balanserad med bredd' }] : count === 4 ? [{ name: 'Favorit', note: 'Favoriter och starka chanser' }, { name: 'Mellan A', note: 'Balanserad med variation' }, { name: 'Mellan B', note: 'Alternativa utfall' }, { name: 'Skräll', note: 'Högre risk – högre utdelning' }] : [{ name: 'Favorit', note: 'Favoriter och starka chanser' }, { name: 'Mellan', note: 'Balanserad med bredd' }, { name: 'Skräll', note: 'Högre risk – högre utdelning' }]; }
function randomValue(seed) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
function generateCouponsLegacy() {
  const races = state.round?.races || []; const target = budget(); const names = strategies(state.couponCount); const usedSpikes = new Set();
  state.coupons = names.map((strategy, couponIndex) => { const selections = races.map((race, raceIndex) => { const sorted = [...race.horses].filter((horse) => !horse.scratched).sort((a, b) => (b.winPercent ?? 0) - (a.winPercent ?? 0)); if (!sorted.length) return []; let rank = couponIndex === 0 ? 0 : couponIndex === 1 ? 1 : couponIndex === 2 ? 2 : Math.min(3, sorted.length - 1); if (couponIndex > 0 && sorted[rank] && usedSpikes.has(`${race.division}:${sorted[rank].number}`)) rank = Math.min(rank + 1, sorted.length - 1); const selected = [sorted[rank]?.number].filter(Boolean); if (selected.length === 1) usedSpikes.add(`${race.division}:${selected[0]}`); return selected; });
    let rows = selections.reduce((total, picks) => total * Math.max(1, picks.length), 1); let cursor = 0; const maxRows = Math.max(1, Math.floor(target / (state.round.rowPrice || 1)));
    while (rows < Math.floor(maxRows * .93) && cursor < races.length * 20) { const raceIndex = (cursor + couponIndex) % Math.max(1, races.length); const race = races[raceIndex]; const candidates = [...(race?.horses || [])].filter((horse) => !horse.scratched).sort((a, b) => ((b.winPercent ?? 0) - (a.winPercent ?? 0)) || (randomValue(state.seed + cursor) - .5)); const next = candidates.find((horse) => !selections[raceIndex].includes(horse.number)); if (next) { const proposed = rows * Math.max(1, selections[raceIndex].length + 1); if (proposed <= maxRows) { selections[raceIndex].push(next.number); rows = proposed; } } cursor += 1; if (!races.length) break; }
    return { name: strategy.name, note: strategy.note, selections, rows, cost: rows * (state.round?.rowPrice || 1), variation: 0 };
  });
  state.coupons.forEach((coupon, index) => { coupon.variation = variationFor(index); });
}
function variationFor(index) { const all = state.coupons || []; if (all.length < 2 || !state.round?.races?.length) return 0; let total = 0; let count = 0; for (const race of state.round.races) { const a = new Set(all[index]?.selections?.[count] || []); const b = new Set(all.filter((_, other) => other !== index).flatMap((coupon) => coupon.selections[count] || [])); const union = new Set([...a, ...b]); total += union.size ? 100 - (intersection(a, b).size / union.size) * 100 : 0; count += 1; } return Math.round(total / Math.max(1, count)); }
function intersection(a, b) { return new Set([...a].filter((value) => b.has(value))); }

function renderCouponsLegacy() {
  const target = budget(); $('#budget-each').textContent = money(target); $('#budget-total').textContent = money(target * state.couponCount); $$('#coupon-count button').forEach((button) => button.classList.toggle('selected', Number(button.dataset.count) === state.couponCount));
  $('#coupon-list').innerHTML = state.coupons.map((coupon, couponIndex) => `<article class="coupon-card"><div class="coupon-top"><span>KUPONG ${couponIndex + 1} · ${esc(coupon.name)}</span><span class="coupon-cost">${money(coupon.cost)}</span></div><p class="strategy-note">${esc(coupon.note)}</p>${(state.round?.races || []).map((race, raceIndex) => `<div class="coupon-race" data-edit-coupon="${couponIndex}" data-edit-division="${raceIndex}"><strong>${race.division}</strong><span class="picks">${coupon.selections[raceIndex]?.length ? coupon.selections[raceIndex].join(' · ') : '–'}</span><button class="lock ${state.locks.has(`${couponIndex}:${raceIndex}`) ? 'locked' : ''}" data-lock-coupon="${couponIndex}" data-lock-division="${raceIndex}" title="Lås avdelning">${state.locks.has(`${couponIndex}:${raceIndex}`) ? '🔒' : '🔓'}</button></div>`).join('')}<div class="coupon-footer"><span>${coupon.rows.toLocaleString('sv-SE')} rader</span><span>Variation ${coupon.variation}%</span></div></article>`).join('');
  const allSelections = state.coupons.flatMap((coupon) => coupon.selections.map((picks, i) => `${i}:${picks.join(',')}`)); const unique = new Set(allSelections).size; $('#package-summary').innerHTML = `<strong>${state.couponCount} kuponger</strong> · ${money(state.coupons.reduce((sum, coupon) => sum + coupon.cost, 0))} totalt<br><span class="summary-check">✓ Favoriter prioriterade &nbsp; ✓ ${unique === allSelections.length ? 'Inga identiska upplägg' : 'Variation skapad'} &nbsp; ✓ Låsningar bevaras vid slumpning</span>`;
}
function pickCountsForBudget(races, target, desiredSpikes = null, fixedCounts = {}) {
  const maxRows = Math.max(1, Math.floor(target / (state.round?.rowPrice || 1)));
  const limits = races.map((race) => Math.min(10, Math.max(1, race.horses.filter((horse) => !horse.scratched).length)));
  function search(spikeRequirement) {
    let best = null;
    const visited = new Set();
    function visit(index, product, counts) {
      if (index >= races.length) {
        const singles = counts.filter((count) => count === 1).length;
        if (spikeRequirement !== null && singles !== spikeRequirement) return;
        const tie = planShuffleScore(counts);
        const coverage = countPlanCoverage(counts);
        if (!best || product > best.product || (product === best.product && (coverage > best.coverage || (coverage === best.coverage && tie > best.tie)))) best = { product, coverage, tie, counts: [...counts] };
        return;
      }
      const singlesSoFar = counts.slice(0, index).filter((count) => count === 1).length;
      const key = `${index}:${product}:${singlesSoFar}`;
      if (visited.has(key)) return;
      visited.add(key);
      const allowedCounts = Number.isFinite(fixedCounts[index]) ? [Math.max(1, Math.min(limits[index], Number(fixedCounts[index])))] : Array.from({ length: limits[index] }, (_, offset) => ((offset + (state.shuffleSeed + index) % limits[index]) % limits[index]) + 1);
      for (const count of allowedCounts) {
        const next = product * count;
        if (next > maxRows) continue;
        counts[index] = count;
        visit(index + 1, next, counts);
      }
    }
    visit(0, 1, races.map(() => 1));
    return best;
  }
  return (search(desiredSpikes) || search(null) || { counts: races.map(() => 1) }).counts;
}

function countPlanProduct(counts) {
  return counts.reduce((total, count) => total * Math.max(1, count), 1);
}

function countPlanCoverage(counts) {
  return counts.reduce((total, count) => total + Math.max(1, count), 0);
}

function planShuffleScore(counts) {
  return counts.reduce((score, count, index) => score + randomValue((state.shuffleSeed + 1) * 1009 + index * 97 + count * 13) * (count === 1 ? 2 : 1), 0);
}

function findComplementaryCountPlan(races, targetRows, avoidSingles, previousPlans = [], desiredSpikes = null, fixedCounts = {}, minRows = targetRows, maxRows = targetRows) {
  const limits = races.map((race) => Math.min(10, Math.max(1, race.horses.filter((horse) => !horse.scratched).length)));
  const options = limits.map((limit, index) => Number.isFinite(fixedCounts[index]) ? [Math.max(1, Math.min(limit, Number(fixedCounts[index])))] : Array.from({ length: limit }, (_, offset) => ((offset + (state.shuffleSeed + index) % limit) % limit) + 1));
  let best = null;
  let bestScore = -Infinity;
  function visit(index, product, counts) {
    if (index >= limits.length) {
      if (product < minRows || product > maxRows) return;
      const signature = countPlanSignature(counts);
      if (previousPlans.some((previous) => countPlanSignature(previous) === signature)) return;
      const conflicts = counts.reduce((total, count, raceIndex) => total + (count === 1 && avoidSingles.has(raceIndex) ? 1 : 0), 0);
      const patternDifference = previousPlans.reduce((total, previous) => total + previous.reduce((sum, count, raceIndex) => sum + Math.abs(count - counts[raceIndex]), 0), 0);
      const singles = counts.filter((count) => count === 1).length;
      if (desiredSpikes !== null && singles !== desiredSpikes) return;
      const coverage = countPlanCoverage(counts);
      const distance = Math.abs(product - targetRows);
      const score = (conflicts * -1000000) + (patternDifference * 10000) + (coverage * 100) - (distance * 10) + singles + (planShuffleScore(counts) * 20);
      if (score > bestScore) { bestScore = score; best = [...counts]; }
      return;
    }
    for (const count of options[index]) {
      const next = product * count;
      if (next > maxRows) continue;
      counts[index] = count;
      visit(index + 1, next, counts);
    }
  }
  visit(0, 1, races.map(() => 1));
  return best;
}

function sameCountPlan(first, second) {
  return Array.isArray(first) && Array.isArray(second) && first.length === second.length && first.every((value, index) => Number(value) === Number(second[index]));
}

function countPlanDistance(first, second) {
  return first.reduce((total, value, index) => total + Math.abs(Number(value || 1) - Number(second[index] || 1)), 0);
}

function findNearBudgetPlans(races, targetRows, desiredSpikes, currentPlan, couponIndex, rowPrice) {
  const minRows = Math.max(1, targetRows - Math.floor(500 / Math.max(1, rowPrice)));
  const maxRows = Math.max(minRows, targetRows + Math.floor(500 / Math.max(1, rowPrice)));
  const limits = races.map((race) => Math.min(10, Math.max(1, race.horses.filter((horse) => !horse.scratched).length)));
  const suffixMax = Array(limits.length + 1).fill(1);
  for (let index = limits.length - 1; index >= 0; index -= 1) suffixMax[index] = suffixMax[index + 1] * limits[index];
  const candidates = [];
  const seen = new Set();
  let nodes = 0;
  const visit = (index, product, singles, counts) => {
    if (++nodes > 220000) return;
    const remaining = limits.length - index;
    if (desiredSpikes !== null && (singles > desiredSpikes || singles + remaining < desiredSpikes)) return;
    if (product > maxRows || product * suffixMax[index] < minRows) return;
    if (index >= limits.length) {
      if (product < minRows || product > maxRows || (desiredSpikes !== null && singles !== desiredSpikes)) return;
      const key = counts.join('x');
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({ counts: [...counts], rows: product, distance: Math.abs(product - targetRows), difference: countPlanDistance(counts, currentPlan) });
      }
      return;
    }
    const order = Array.from({ length: limits[index] }, (_, offset) => ((offset + state.shuffleSeed + couponIndex * 3 + index) % limits[index]) + 1);
    for (const count of order) {
      counts[index] = count;
      visit(index + 1, product * count, singles + (count === 1 ? 1 : 0), counts);
      if (nodes > 220000) return;
    }
  };
  visit(0, 1, 0, []);
  if (!candidates.length) return [{ counts: [...currentPlan], rows: countPlanProduct(currentPlan) }];
  candidates.sort((a, b) => a.distance - b.distance || b.difference - a.difference);
  const selected = [];
  const addCandidate = (candidate) => {
    if (!selected.some((item) => sameCountPlan(item.counts, candidate.counts))) selected.push(candidate);
  };
  addCandidate({ counts: [...currentPlan], rows: countPlanProduct(currentPlan), distance: Math.abs(countPlanProduct(currentPlan) - targetRows), difference: 0 });
  while (selected.length < Math.min(6, candidates.length)) {
    const next = candidates
      .filter((candidate) => !selected.some((item) => sameCountPlan(item.counts, candidate.counts)))
      .sort((a, b) => {
        const aDiversity = Math.min(...selected.map((item) => countPlanDistance(item.counts, a.counts)));
        const bDiversity = Math.min(...selected.map((item) => countPlanDistance(item.counts, b.counts)));
        return (bDiversity * 40 - b.distance) - (aDiversity * 40 - a.distance);
      })[0];
    if (!next) break;
    addCandidate(next);
  }
  return selected;
}

function resetCombinationState() {
  state.combinationLocks = new Set();
  state.lockedCombinationPatterns = new Map();
  state.selectedPlanIndexes = [];
  state.combinationOptions = [];
}

function resetUnlockedCombinationChoices() {
  state.selectedPlanIndexes = state.selectedPlanIndexes.map((value, index) => state.combinationLocks.has(index) ? value : null);
}

function countPlanSignature(counts) {
  return [...counts].map((value) => Number(value || 1)).sort((a, b) => a - b).join('x');
}

function permuteCountPlanForRaces(races, signature, seed = 0, avoidPlan = []) {
  const values = String(signature || '').split('x').map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const limits = races.map((race) => Math.min(10, Math.max(1, race.horses.filter((horse) => !horse.scratched).length)));
  const plans = [];
  const visit = (index, remaining, plan) => {
    if (plans.length >= 80) return;
    if (index >= limits.length) {
      if (!remaining.length && countPlanSignature(plan) === signature) plans.push([...plan]);
      return;
    }
    const candidates = [...new Set(remaining.filter((value) => value <= limits[index]))].sort((a, b) => ((a + index + seed) % 11) - ((b + index + seed) % 11));
    for (const value of candidates) {
      const position = remaining.indexOf(value);
      visit(index + 1, [...remaining.slice(0, position), ...remaining.slice(position + 1)], [...plan, value]);
      if (plans.length >= 80) return;
    }
  };
  visit(0, values, []);
  const different = plans.filter((plan) => !sameCountPlan(plan, avoidPlan));
  return different[Math.abs(Math.floor(seed)) % Math.max(1, different.length)] || plans[0] || [...avoidPlan];
}

function chooseCouponHorses(race, count, couponIndex) {
  const ranked = [...race.horses].filter((horse) => !horse.scratched).sort((a, b) => (b.winPercent ?? 0) - (a.winPercent ?? 0));
  if (!ranked.length || count < 1) return [];
  const couponTotal = Math.max(1, state.couponCount || 1);
  const coveragePool = ranked.slice(0, Math.min(ranked.length, Math.max(3, couponTotal)));
  const lowest = [...ranked].sort((a, b) => (a.winPercent ?? 0) - (b.winPercent ?? 0));
  const selected = [];
  const add = (horse) => {
    if (horse && !selected.some((item) => item.number === horse.number)) selected.push(horse);
  };

  // En spik ska inte kopieras till alla kuponger. Kupong 1 tar favoriten,
  // nästa kupong täcker andrahandsfavoriten och följande kuponger roterar
  // genom topphästarna så att kupongerna kompletterar varandra.
  if (count === 1) {
    add(raceFavorite(race) || coveragePool[0]);
  } else {
    const offset = (couponIndex + (state.shuffleSeed || 0)) % coveragePool.length;
    add(raceFavorite(race) || coveragePool[0]);
    if (selected.length < count) add(coveragePool[offset]);
    if (selected.length < count) add(coveragePool[(offset + 1) % coveragePool.length]);

    // Sprid de fyra lägst spelade hästarna över kupongerna när det finns plats.
    // På så sätt får skrällkupongen verklig täckning utan att alla kuponger blir identiska.
    const lowStart = (couponIndex + (state.shuffleSeed || 0)) % Math.max(1, Math.min(4, lowest.length));
    for (let index = 0; index < Math.min(4, lowest.length); index += 1) {
      if (selected.length >= count) break;
      add(lowest[(lowStart + index) % lowest.length]);
    }
  }
  for (const horse of ranked) {
    if (selected.length >= count) break;
    add(horse);
  }
  return selected.map((horse) => horse.number).sort((a, b) => a - b);
}

function generateCoupons(preservedSelections = null) {
  const races = state.round?.races || [];
  const target = budget();
  const names = strategies(state.couponCount);
  const desiredSpikes = requestedSpikes();
  state.spikeCount = desiredSpikes;
  const fixedCounts = names.map((_, couponIndex) => {
    const fixed = {};
    races.forEach((_, raceIndex) => {
      const key = `${couponIndex}:${raceIndex}`;
      const previous = preservedSelections?.[couponIndex]?.[raceIndex];
      if (state.locks.has(key) && Array.isArray(previous) && previous.length) fixed[raceIndex] = previous.length;
    });
    return fixed;
  });
  const originalRows = Math.max(1, Math.floor(target / (state.round?.rowPrice || 1)));
  const minRows = Math.max(1, Math.ceil((target - 300) / (state.round?.rowPrice || 1)));
  const maxRows = Math.max(minRows, Math.floor((target + 300) / (state.round?.rowPrice || 1)));
  const targetRows = originalRows;
  const raceSignature = races.map((race) => `${race.division}:${race.horses.filter((horse) => !horse.scratched).length}`).join('|');
  const planCacheKey = JSON.stringify([state.round?.id || '', target, desiredSpikes, state.couponCount, state.shuffleSeed, raceSignature, fixedCounts]);
  let countPlans = state.countPlanCache.get(planCacheKey)?.map((plan) => [...plan]);
  if (!countPlans) {
    const baseCounts = pickCountsForBudget(races, target, desiredSpikes, fixedCounts[0]);
    countPlans = [baseCounts];
    const usedPlanSignatures = new Set([countPlanSignature(baseCounts)]);
    const usedSpikeDivisions = new Set(baseCounts.map((count, index) => count === 1 ? index : null).filter((index) => index !== null));
    for (let index = 1; index < names.length; index += 1) {
      let plan = findComplementaryCountPlan(races, targetRows, usedSpikeDivisions, countPlans, desiredSpikes, fixedCounts[index], minRows, maxRows) || pickCountsForBudget(races, target, desiredSpikes, fixedCounts[index]) || [...baseCounts];
      if (usedPlanSignatures.has(countPlanSignature(plan))) {
        const alternative = findNearBudgetPlans(races, targetRows, desiredSpikes, plan, index, state.round?.rowPrice || 1).find((candidate) => !usedPlanSignatures.has(countPlanSignature(candidate.counts)));
        if (alternative) plan = alternative.counts;
      }
      countPlans.push(plan);
      usedPlanSignatures.add(countPlanSignature(plan));
      plan.forEach((count, raceIndex) => { if (count === 1) usedSpikeDivisions.add(raceIndex); });
    }
    state.countPlanCache.set(planCacheKey, countPlans.map((plan) => [...plan]));
    if (state.countPlanCache.size > 40) state.countPlanCache.delete(state.countPlanCache.keys().next().value);
  }
  countPlans = countPlans.map((plan, couponIndex) => {
    const selectedIndex = state.selectedPlanIndexes[couponIndex];
    const option = state.combinationOptions[couponIndex]?.[selectedIndex];
    const lockedSignature = state.lockedCombinationPatterns.get(couponIndex);
    if (state.combinationLocks.has(couponIndex) && lockedSignature) {
      const current = state.combinationOptions[couponIndex]?.[0]?.counts || plan;
      return permuteCountPlanForRaces(races, lockedSignature, state.shuffleSeed + couponIndex, current);
    }
    return option?.counts ? [...option.counts] : [...plan];
  });
  const baseCounts = countPlans[0] || races.map(() => 1);
  state.coupons = names.map((strategy, couponIndex) => {
    const plan = countPlans[couponIndex] || baseCounts;
    const selections = races.map((race, raceIndex) => chooseCouponHorses(race, plan[raceIndex] || 1, couponIndex));
    const rows = selections.reduce((total, picks) => total * Math.max(1, picks.length), 1);
    return { name: strategy.name, note: strategy.note, selections, rows, cost: rows * (state.round?.rowPrice || 1), spikeCount: plan.filter((count) => count === 1).length, variation: 0 };
  });
  if (preservedSelections) {
    state.coupons.forEach((coupon, couponIndex) => coupon.selections.forEach((selection, raceIndex) => {
      const key = `${couponIndex}:${raceIndex}`;
      const previous = preservedSelections[couponIndex]?.[raceIndex];
      if (state.locks.has(key) && Array.isArray(previous) && previous.length === selection.length) coupon.selections[raceIndex] = [...previous];
    }));
    state.coupons.forEach((coupon) => { coupon.rows = rowsFor(coupon); coupon.cost = coupon.rows * (state.round.rowPrice || 1); coupon.spikeCount = coupon.selections.filter((selection) => selection.length === 1).length; });
  }
  state.coupons.forEach((coupon, index) => { coupon.variation = variationFor(index); });
  const rowPrice = state.round?.rowPrice || 1;
  state.combinationOptions = state.coupons.map((coupon, couponIndex) => findNearBudgetPlans(races, targetRows, desiredSpikes, coupon.selections.map((picks) => picks.length || 1), couponIndex, rowPrice));
  state.selectedPlanIndexes = state.combinationOptions.map(() => 0);
}

function raceSecondFavorite(race) {
  return [...(race.horses || [])].filter((horse) => !horse.scratched).sort((a, b) => (b.winPercent ?? -1) - (a.winPercent ?? -1))[1];
}

function horseBadgeClass(race, horse) {
  const percent = number(horse.winPercent);
  const classes = [];
  if (raceFavorite(race)?.number === horse.number) classes.push('favorite-chip');
  if (percent !== null && percent < 5) classes.push('low-win-chip');
  else if (raceSecondFavorite(race)?.number === horse.number) classes.push('second-favorite-chip');
  if (trendIsSignificant(horse)) classes.push('trend-hot-chip');
  return classes.join(' ');
}

function couponPicksMarkup(coupon, race, raceIndex) {
  const picks = coupon.selections[raceIndex] || [];
  const horses = picks.map((numberValue) => race.horses.find((horse) => horse.number === numberValue)).filter(Boolean);
  if (horses.length === 1) {
    const horse = horses[0];
    return `<span class="spike-pick"><span class="number-ball ${horseBadgeClass(race, horse)}">${esc(horse.number)}</span><span class="spike-name">${esc(horse.name)}</span><strong>${fmtPercent(horse.winPercent)}</strong></span>`;
  }
  return `<span class="pick-list">${horses.map((horse) => `<span class="number-chip ${horseBadgeClass(race, horse)}">${esc(horse.number)}</span>`).join('')}</span>`;
}

function renderCombinationOptions() {
  const box = $('#combination-options');
  if (!box) return;
  const target = budget();
  const rowPrice = state.round?.rowPrice || 1;
  box.innerHTML = state.combinationOptions.map((options, couponIndex) => {
    if (!options?.length) return '';
    const locked = state.combinationLocks.has(couponIndex);
    return `<section class="combination-picker"><div class="combination-picker-head"><div><span class="eyebrow">KUPONG ${couponIndex + 1}</span><strong>Välj radkombination</strong></div><span class="combination-range">±500 kr från ${money(target)}</span></div><div class="combination-slider" data-combination-slider="${couponIndex}"><button type="button" class="combination-arrow" data-combination-prev="${couponIndex}" aria-label="Föregående kombination">‹</button><div class="combination-slide-window">${options.map((option, optionIndex) => { const cost = option.rows * rowPrice; const delta = cost - target; const deltaLabel = delta === 0 ? 'Pris' : `${delta > 0 ? '+' : ''}${money(delta)}`; return `<button type="button" class="combination-option combination-slide" data-combination-coupon="${couponIndex}" data-combination-index="${optionIndex}"><span class="combination-pattern">${option.counts.join('×')}</span><strong>${money(cost)}</strong><small>${deltaLabel}</small></button>`; }).join('')}</div><button type="button" class="combination-arrow" data-combination-next="${couponIndex}" aria-label="Nästa kombination">›</button></div><div class="combination-slide-status"><span data-combination-position="${couponIndex}"></span><button type="button" class="combination-lock ${locked ? 'locked' : ''}" data-lock-combination="${couponIndex}">${locked ? '🔒 Kombination låst' : '🔓 Lås kombinationen'}</button></div></section>`;
  }).join('');
  box.querySelectorAll('.combination-option').forEach((button) => {
    const couponIndex = Number(button.dataset.combinationCoupon);
    const selectedIndex = state.selectedPlanIndexes[couponIndex] ?? 0;
    button.classList.toggle('selected', Number(button.dataset.combinationIndex) === selectedIndex);
  });
  box.querySelectorAll('[data-combination-position]').forEach((label) => { const couponIndex = Number(label.dataset.combinationPosition); const total = state.combinationOptions[couponIndex]?.length || 0; const current = (state.selectedPlanIndexes[couponIndex] ?? 0) + 1; label.textContent = `${current} / ${total}`; });
}

function renderCoupons() {
  const target = budget();
  $('#budget-each').textContent = money(target);
  $('#budget-total').textContent = money(target * state.couponCount);
  $$('#coupon-count button').forEach((button) => button.classList.toggle('selected', Number(button.dataset.count) === state.couponCount));
  $$('#spike-count button').forEach((button) => button.classList.toggle('selected', Number(button.dataset.spikes) === state.spikeCount));
  const couponCards = state.coupons.map((coupon, couponIndex) => `<article class="coupon-card"><div class="coupon-top"><span>KUPONG ${couponIndex + 1} · ${esc(coupon.name)}</span><span class="coupon-cost">${money(coupon.cost)}</span></div><p class="strategy-note">${esc(coupon.note)}</p>${(state.round?.races || []).map((race, raceIndex) => `<div class="coupon-race" data-edit-coupon="${couponIndex}" data-edit-division="${raceIndex}"><span class="race-label">${race.division}</span>${couponPicksMarkup(coupon, race, raceIndex)}<button class="lock ${state.locks.has(`${couponIndex}:${raceIndex}`) ? 'locked' : ''}" data-lock-coupon="${couponIndex}" data-lock-division="${raceIndex}" title="Lås avdelning">${state.locks.has(`${couponIndex}:${raceIndex}`) ? '🔒' : '🔓'}</button></div>`).join('')}<div class="coupon-footer"><span>${coupon.rows.toLocaleString('sv-SE')} rader · ${coupon.spikeCount ?? 0} spikar</span><span>Variation ${coupon.variation}%</span></div></article>`).join('');
  const missingSlots = state.couponCount < 4 ? Array.from({ length: Math.max(0, 3 - state.couponCount) }, () => '<article class="coupon-slot-placeholder" aria-hidden="true"></article>').join('') : '';
  const inlineShuffle = state.couponCount < 4 ? '<article class="inline-shuffle-card"><span class="eyebrow">TILLSAMMANS</span><strong>Vill du skapa nya kombinationer?</strong><button type="button" data-shuffle-inline>⤨ Slumpa kuponger</button></article>' : '';
  $('#coupon-list').innerHTML = `${couponCards}${missingSlots}${inlineShuffle}`;
  renderCombinationOptions();
  const allSelections = state.coupons.flatMap((coupon) => coupon.selections.map((picks, index) => `${index}:${picks.join(',')}`));
  const unique = new Set(allSelections).size;
  $('#package-summary').innerHTML = `<strong>${state.couponCount} kuponger</strong> · ${money(state.coupons.reduce((sum, coupon) => sum + coupon.cost, 0))} totalt<br><span class="summary-check">✓ Favorit och andrahandsfavorit prioriteras &nbsp; ✓ ${unique === allSelections.length ? 'Varierade upplägg' : 'Gemensamma lopp'} &nbsp; ✓ Låsningar bevaras</span>`;
}

function renderBudgetLabels() {
  const target = budget();
  if ($('#budget-each')) $('#budget-each').textContent = money(target);
  if ($('#budget-total')) $('#budget-total').textContent = money(target * state.couponCount);
}

function scheduleCouponRegeneration() {
  renderBudgetLabels();
  resetUnlockedCombinationChoices();
  $('#coupon-list')?.classList.add('recalculating');
  clearTimeout(state.regenerateTimer);
  state.regenerateTimer = setTimeout(() => { generateCoupons(); renderCoupons(); $('#coupon-list')?.classList.remove('recalculating'); }, 180);
}

function renderRacesLegacy() {
  const races = state.round?.races || []; const count = state.round?.divisionCount || 0;
  if (!races.length) { $('#races-list').innerHTML = `<div class="empty-state"><div class="empty-icon">◎</div><h3>Ingen startlista i denna omgång</h3><p>ATG-importen kan ha misslyckats eller så är omgången skapad manuellt. Redigera omgången för att lägga in hästar.</p><button class="secondary-button" id="empty-edit">Redigera omgång</button></div>`; return; }
  $('#races-list').innerHTML = races.map((race) => { const favorite = raceFavorite(race); const horses = [...race.horses].sort((a, b) => (a.number || 0) - (b.number || 0)); return `<article class="race-card" data-division="${race.division}"><div class="race-summary"><div class="race-number">${race.division}</div><div><h3>Avd ${race.division}</h3><p>${horses.length} hästar · ${favorite ? `Favorit ${favorite.number} ${esc(favorite.name)}` : 'ingen favorit'}</p></div><div class="race-favorite">Favorit<strong>${favorite ? `${favorite.number} · ${fmtPercent(favorite.winPercent)}` : '–'}</strong></div></div><div class="race-body"><div class="horse-row header-row"><span>#</span><span>Häst</span><span>Kusk</span><span>%</span><span>Odds</span></div>${horses.slice(0, 30).map((horse) => `<div class="horse-row ${favorite?.number === horse.number ? 'favorite-row' : ''}"><span class="horse-num">${favorite?.number === horse.number ? '<span class="star">★</span>' : ''}${esc(horse.number)}</span><span class="horse-name">${esc(horse.name)}${horse.scratched ? ' · struken' : ''}</span><span class="horse-meta ${horse.updatedFields?.includes('driver') ? 'updated-field' : ''}">${esc(horse.driver || horse.trainer || '–')}</span><span class="horse-percent ${horse.updatedFields?.includes('winPercent') ? 'updated-field' : ''}">${fmtPercent(horse.winPercent)}</span><span class="horse-odds ${horse.updatedFields?.includes('winOdds') ? 'updated-field' : ''}">${horse.winOdds ?? '–'}</span></div>`).join('')}</div></article>`; }).join('') + (races.length < count ? `<div class="partial-note">${races.length} av ${count} avdelningar importerade · använd Redigera för att komplettera.</div>` : '');
}

function trendDelta(horse) {
  const start = number(horse.startTrendPercent, null);
  const current = winningTrendPercent(horse);
  return start === null || current === null ? null : current - start;
}

function trendIsSignificant(horse) {
  const delta = trendDelta(horse);
  return delta !== null && delta >= 10;
}

function formatTrendDelta(delta) {
  if (delta === null || delta === 0) return '';
  return ` (${delta > 0 ? '+' : ''}${delta % 1 ? delta.toFixed(1) : delta})`;
}

function renderRaces() {
  const races = state.round?.races || []; const count = state.round?.divisionCount || 0;
  if (!races.length) { $('#races-list').innerHTML = `<div class="empty-state"><div class="empty-icon">◎</div><h3>Ingen startlista i denna omgång</h3><p>ATG-importen kan ha misslyckats eller så är omgången skapad manuellt. Redigera omgången för att lägga in hästar.</p><button class="secondary-button" id="empty-edit">Redigera omgång</button></div>`; return; }
  $('#races-list').innerHTML = races.map((race) => { const favorite = raceFavorite(race); const horses = [...race.horses].sort((a, b) => (a.number || 0) - (b.number || 0)); return `<article class="race-card" data-division="${race.division}"><div class="race-summary"><div class="race-number">${race.division}</div><div><h3>Avd ${race.division}</h3><p>${horses.length} hästar · ${favorite ? `Favorit ${favorite.number} ${esc(favorite.name)}` : 'ingen favorit'}</p></div><div class="race-favorite">Favorit<strong>${favorite ? `${favorite.number} · ${fmtPercent(favorite.winPercent)}` : '–'}</strong></div></div><div class="race-body"><div class="horse-row header-row"><span>#</span><span>Häst</span><span>Kusk</span><span>%</span><span>Start trend%</span><span>Trend%</span><span>Odds</span></div>${horses.slice(0, 30).map((horse) => { const delta = trendDelta(horse); const significant = trendIsSignificant(horse); return `<div class="horse-row ${favorite?.number === horse.number ? 'favorite-row' : ''} ${significant ? 'trend-significant' : ''}"><span class="horse-num">${favorite?.number === horse.number ? '<span class="star">★</span>' : ''}${esc(horse.number)}</span><span class="horse-name">${esc(horse.name)}${horse.scratched ? ' · struken' : ''}</span><span class="horse-meta ${horse.updatedFields?.includes('driver') ? 'updated-field' : ''}">${esc(horse.driver || horse.trainer || '–')}</span><span class="horse-percent ${horse.updatedFields?.includes('winPercent') ? 'updated-field' : ''}">${fmtPercent(horse.winPercent)}</span><span class="horse-start-trend">${fmtPercent(horse.startTrendPercent ?? winningTrendPercent(horse))}</span><span class="horse-trend ${significant || horse.updatedFields?.includes('trendPercent') ? 'updated-field' : ''}">${fmtTrendValue(horse.trendPercent)}</span><span class="horse-odds ${horse.updatedFields?.includes('winOdds') ? 'updated-field' : ''}">${horse.winOdds ?? '–'}</span></div>`; }).join('')}</div></article>`; }).join('') + (races.length < count ? `<div class="partial-note">${races.length} av ${count} avdelningar importerade · använd Redigera för att komplettera.</div>` : '');
}

function renderRound() { if (!state.round) return; renderRoundHeader(); renderRaces(); renderCoupons(); }

function openRoundEditor() {
  const races = state.round?.races || []; $('#editor-content').innerHTML = `<div class="eyebrow">OMGÅNGSDATA</div><h2 class="editor-title">Redigera ${esc(state.round?.name || 'omgång')}</h2><p class="editor-intro">Ändra startlistan utan att påverka den gamla /trav-sidan. Manuella ändringar sparas i samma TravGame-dokument.</p>${races.length ? `<form id="round-editor-form">${races.map((race) => `<h3>Avd ${race.division}</h3><table class="editor-table"><thead><tr><th>#</th><th>Häst</th><th>Kusk</th><th>%</th><th>Odds</th></tr></thead><tbody>${race.horses.map((horse, index) => `<tr data-race="${race.division}" data-horse="${index}"><td><input data-field="number" value="${esc(horse.number)}"></td><td><input data-field="name" value="${esc(horse.name)}"></td><td><input data-field="driver" value="${esc(horse.driver)}"></td><td><input data-field="winPercent" value="${esc(horse.winPercent ?? '')}"></td><td><input data-field="winOdds" value="${esc(horse.winOdds ?? '')}"></td></tr>`).join('')}</tbody></table>`).join('')}<div class="modal-actions"><button type="submit" class="primary-button">Spara ändringar</button></div></form>` : `<div class="empty-state"><p>Den här omgången saknar hästar. Hämta startlista igen eller använd Skapa utan import och lägg in data via API:t.</p></div>`}`; $('#editor-modal').hidden = false;
}
async function saveRoundEditor(event) { event.preventDefault(); const form = event.currentTarget; form.querySelectorAll('tr[data-race]').forEach((row) => { const race = state.round.races.find((item) => item.division === Number(row.dataset.race)); const horse = race?.horses?.[Number(row.dataset.horse)]; if (!horse) return; row.querySelectorAll('[data-field]').forEach((input) => { const field = input.dataset.field; horse[field] = ['number', 'winPercent', 'winOdds'].includes(field) ? number(input.value) : input.value; }); }); try { const response = await apiFetch(`/rounds/${encodeURIComponent(state.round.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ round: state.round }) }); if (!response.ok) throw new Error(await response.text() || 'Kunde inte spara'); state.round = await response.json(); $('#editor-modal').hidden = true; generateCoupons(); renderRound(); showToast('Omgången sparades'); } catch (error) { showToast(error.message); } }

function openCouponEditor(couponIndex, raceIndex) { const race = state.round.races[raceIndex]; const selected = new Set(state.coupons[couponIndex].selections[raceIndex] || []); $('#editor-content').innerHTML = `<div class="eyebrow">KUPONG ${couponIndex + 1}</div><h2 class="editor-title">Avd ${race.division} – välj hästar</h2><p class="editor-intro">Ändra valen manuellt. Kostnad och rader räknas om direkt när du sparar.</p><form id="coupon-editor-form"><div class="horse-picker">${race.horses.map((horse) => `<label class="picker-row"><input type="checkbox" name="horse" value="${esc(horse.number)}" ${selected.has(horse.number) ? 'checked' : ''}><strong>${esc(horse.number)}</strong><span>${esc(horse.name)}</span><small>${fmtPercent(horse.winPercent)} · ${esc(horse.driver || '–')}</small></label>`).join('')}</div><div class="modal-actions"><button type="button" class="secondary-button" id="make-spike">Gör till spik</button><button type="submit" class="primary-button">Klar</button></div></form>`; $('#editor-modal').hidden = false; $('#coupon-editor-form').dataset.coupon = couponIndex; $('#coupon-editor-form').dataset.race = raceIndex; }
function saveCouponEditor(event) { event.preventDefault(); const form = event.currentTarget; const coupon = state.coupons[Number(form.dataset.coupon)]; const race = Number(form.dataset.race); const selected = Array.from(form.querySelectorAll('input[name="horse"]:checked')).map((input) => Number(input.value)); if (!selected.length) return showToast('Välj minst en häst'); coupon.selections[race] = selected; coupon.rows = rowsFor(coupon); coupon.cost = coupon.rows * (state.round.rowPrice || 1); coupon.spikeCount = coupon.selections.filter((selection) => selection.length === 1).length; $('#editor-modal').hidden = true; renderCoupons(); showToast('Avdelningen sparades på kupongen'); }

async function refreshFromAtgLegacy() { if (!state.round) return; const config = { date: state.round.date, gameType: state.round.gameType, track: state.round.track }; $('#refresh-round').disabled = true; try { const fresh = await importRound(config, state.round.id); state.round = fresh; generateCoupons(); renderRound(); showToast('Startlistan uppdaterades från ATG'); } catch (error) { showToast(error.message); } finally { $('#refresh-round').disabled = false; } }
function markUpdatedFields(previous, fresh) {
  for (const race of fresh.races || []) {
    const oldRace = (previous.races || []).find((item) => item.division === race.division);
    for (const horse of race.horses || []) {
      const oldHorse = oldRace?.horses?.find((item) => item.number === horse.number);
      if (!oldHorse) continue;
      const storedStart = number(oldHorse.startTrendPercent, null);
      const oldRawTrend = number(oldHorse.trendPercent, null);
      horse.startTrendPercent = storedStart !== null && storedStart !== 0 && storedStart !== oldRawTrend ? storedStart : winningTrendPercent(oldHorse) ?? winningTrendPercent(horse);
      horse.updatedFields = ['driver', 'winPercent', 'trendPercent', 'winOdds', 'trainer', 'sulky'].filter((field) => String(oldHorse[field] ?? '') !== String(horse[field] ?? ''));
    }
  }
}

function shuffleCoupons() { const old = state.coupons.map((coupon) => coupon.selections.map((picks) => [...picks])); resetUnlockedCombinationChoices(); state.seed += 1; state.shuffleSeed += 1; generateCoupons(old); renderCoupons(); showToast('Kupongerna slumpades – låsta kombinationer, avdelningar och spikregeln behölls'); }

async function savePackage() { if (!state.round?.id) return showToast('Skapa eller öppna en omgång först'); const automaticName = `${state.round.gameType} ${state.round.track} · ${dateLabel(state.round.date)}`; const enteredName = window.prompt('Rubrik för kupongpaketet (valfritt):', ''); const packageName = enteredName?.trim() || automaticName; const packageId = (window.crypto?.randomUUID?.() || `package-${Date.now()}-${state.seed}`); const packageCreatedAt = new Date().toISOString(); try { for (const coupon of state.coupons) { const response = await apiFetch(`/games/${encodeURIComponent(state.round.id)}/coupons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Tillsammans · ${coupon.name}`, source: 'tillsammans', packageId, packageName, packageCreatedAt, rows: coupon.rows, cost: coupon.cost, spikeCount: coupon.spikeCount, variation: coupon.variation, stakeLevel: 'original', selections: coupon.selections.map((horses, index) => ({ divisionIndex: state.round.races[index]?.division || index + 1, horses })) }) }); if (!response.ok) throw new Error(await response.text() || 'Kunde inte spara paket'); } await loadGames(); state.savedCoupons = state.games.find((game) => String(game._id) === String(state.round.id))?.coupons || []; renderSavedCoupons(); showToast('Kupongerna sparades som ett paket under Kuponger'); } catch (error) { showToast(error.message); } }

async function refreshFromAtg() { if (!state.round) return; const previous = state.round; const config = { date: state.round.date, gameType: state.round.gameType, track: state.round.track }; $('#refresh-round').disabled = true; setRefreshImportOverlay(config); try { const fresh = await importRound(config, state.round.id); markUpdatedFields(previous, fresh); state.round = fresh; resetUnlockedCombinationChoices(); generateCoupons(); renderRound(); setRefreshImportOverlay(config, 'complete'); showToast('Startlistan uppdaterades – gröna värden är ändrade'); setTimeout(hideRefreshImportOverlay, 900); } catch (error) { setRefreshImportOverlay(config, 'error', error.message); showToast(error.message); setTimeout(hideRefreshImportOverlay, 1800); } finally { $('#refresh-round').disabled = false; } }

function bindEvents() {
  $$('#open-create,#empty-create').forEach((button) => button.addEventListener('click', () => { $('#round-date').value = $('#round-date').value || today(); $('#create-modal').hidden = false; renderPreview(); }));
  $$('#round-date,#round-type,#round-track').forEach((field) => field.addEventListener('input', renderPreview));
  $('#create-form').addEventListener('submit', (event) => submitCreate(event, false)); $('#manual-round').addEventListener('click', () => submitCreate(null, true));
  $$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => { $(`#${button.dataset.closeModal}`).hidden = true; }));
  document.addEventListener('click', (event) => { const view = event.target.closest('[data-view]'); if (view) { if (view.dataset.view === 'round' && !state.round) { showToast('Öppna eller skapa en omgång först'); return; } showView(view.dataset.view); if (view.dataset.view === 'coupons') loadSavedCoupons(); if (view.dataset.view === 'results') loadResults(); } const inlineShuffle = event.target.closest('[data-shuffle-inline]'); if (inlineShuffle) { event.stopPropagation(); shuffleCoupons(); return; } const sliderArrow = event.target.closest('[data-combination-prev],[data-combination-next]'); if (sliderArrow) { event.stopPropagation(); const couponIndex = Number(sliderArrow.dataset.combinationPrev ?? sliderArrow.dataset.combinationNext); const options = state.combinationOptions[couponIndex] || []; if (options.length) { const direction = sliderArrow.hasAttribute('data-combination-next') ? 1 : -1; const current = state.selectedPlanIndexes[couponIndex] ?? 0; const next = (current + direction + options.length) % options.length; state.selectedPlanIndexes[couponIndex] = next; if (state.combinationLocks.has(couponIndex)) state.lockedCombinationPatterns.set(couponIndex, countPlanSignature(options[next].counts)); generateCoupons(); renderCoupons(); } return; } const combinationOption = event.target.closest('[data-combination-coupon]'); if (combinationOption) { event.stopPropagation(); const couponIndex = Number(combinationOption.dataset.combinationCoupon); const optionIndex = Number(combinationOption.dataset.combinationIndex); state.selectedPlanIndexes[couponIndex] = optionIndex; if (state.combinationLocks.has(couponIndex)) state.lockedCombinationPatterns.set(couponIndex, countPlanSignature(state.combinationOptions[couponIndex]?.[optionIndex]?.counts || [])); generateCoupons(); renderCoupons(); showToast(`Ny kombination vald för kupong ${couponIndex + 1}`); return; } const combinationLock = event.target.closest('[data-lock-combination]'); if (combinationLock) { event.stopPropagation(); const couponIndex = Number(combinationLock.dataset.lockCombination); if (state.combinationLocks.has(couponIndex)) { state.combinationLocks.delete(couponIndex); state.lockedCombinationPatterns.delete(couponIndex); } else { const option = state.combinationOptions[couponIndex]?.[state.selectedPlanIndexes[couponIndex] ?? 0]; state.combinationLocks.add(couponIndex); if (option) state.lockedCombinationPatterns.set(couponIndex, countPlanSignature(option.counts)); } renderCoupons(); showToast(state.combinationLocks.has(couponIndex) ? `Kombinationen för kupong ${couponIndex + 1} är låst` : `Kombinationen för kupong ${couponIndex + 1} är upplåst`); return; } const resultButton = event.target.closest('[data-fetch-results]'); if (resultButton) { event.stopPropagation(); fetchGameResults(resultButton.dataset.fetchResults); return; } const deleteButton = event.target.closest('[data-delete-saved-coupon]'); if (deleteButton) { event.stopPropagation(); deleteSavedCoupon(deleteButton.dataset.deleteGame, deleteButton.dataset.deleteSavedCoupon); return; } const deleteGameButton = event.target.closest('[data-delete-game]'); if (deleteGameButton) { event.stopPropagation(); deleteGame(deleteGameButton.dataset.deleteGame); return; } const card = event.target.closest('[data-game-id]'); if (card) { const game = state.games.find((item) => String(item._id) === card.dataset.gameId); if (game) { state.round = normalizeGame(game); state.savedCoupons = Array.isArray(game.coupons) ? game.coupons : []; resetCombinationState(); state.seed += 1; state.shuffleSeed = 0; generateCoupons(); renderRound(); showView('round'); } } const race = event.target.closest('.race-summary'); if (race) race.parentElement.classList.toggle('open'); const edit = event.target.closest('[data-edit-coupon]'); if (edit && !event.target.closest('[data-lock-coupon]')) openCouponEditor(Number(edit.dataset.editCoupon), Number(edit.dataset.editDivision)); const lock = event.target.closest('[data-lock-coupon]'); if (lock) { event.stopPropagation(); const key = `${lock.dataset.lockCoupon}:${lock.dataset.lockDivision}`; state.locks.has(key) ? state.locks.delete(key) : state.locks.add(key); renderCoupons(); } });
  $('#edit-round').addEventListener('click', openRoundEditor); $('#refresh-round').addEventListener('click', refreshFromAtg);   $('#round-editor-form')?.addEventListener('submit', saveRoundEditor);
  $('#coupon-count').addEventListener('click', (event) => { const button = event.target.closest('[data-count]'); if (!button) return; resetCombinationState(); state.couponCount = Number(button.dataset.count); generateCoupons(); renderCoupons(); }); $('#spike-count').addEventListener('click', (event) => { const button = event.target.closest('[data-spikes]'); if (!button) return; resetUnlockedCombinationChoices(); state.spikeCount = Number(button.dataset.spikes); $$('#spike-count button').forEach((item) => item.classList.toggle('selected', item === button)); generateCoupons(); renderCoupons(); }); $('#share-price').addEventListener('input', scheduleCouponRegeneration); $('#share-count').addEventListener('change', scheduleCouponRegeneration);
  $$('[data-step]').forEach((button) => button.addEventListener('click', () => { const input = $('#share-price'); input.value = Math.max(1, Number(input.value) + Number(button.dataset.dir)); scheduleCouponRegeneration(); })); $('#shuffle-coupons').addEventListener('click', shuffleCoupons); $('#save-package').addEventListener('click', savePackage);
  document.addEventListener('submit', (event) => { if (event.target.id === 'round-editor-form') saveRoundEditor(event); if (event.target.id === 'coupon-editor-form') saveCouponEditor(event); }); document.addEventListener('click', (event) => { if (event.target.id === 'make-spike') { const form = event.target.closest('#coupon-editor-form'); const race = state.round?.races?.[Number(form?.dataset.race)]; const favorite = raceFavorite(race || { horses: [] }); form?.querySelectorAll('input[name="horse"]').forEach((input) => { input.checked = Number(input.value) === favorite?.number; }); } });
}

$('#round-date').value = today(); bindEvents(); renderPreview(); loadGames();
document.addEventListener('click', (event) => {
  if (event.target.closest('#header-edit, #empty-edit')) openRoundEditor();
});






