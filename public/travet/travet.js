const GAME_DIVISIONS = { V64: 6, V65: 6, V85: 8, V86: 8, GS75: 7 };
const LOCAL_API_ROOT = 'http://127.0.0.1:4000/api/trav';
const RENDER_API_ROOT = 'https://travet-api.onrender.com/api/trav';
const isLocalApp = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) || window.location.protocol === 'file:';
// Lokal sida = lokal API/MongoDB. Render används bara när Travet körs hostat,
// till exempel från Netlify. Det ska aldrig finnas en tyst cross-over från
// localhost till Render.
const API_ROOTS = isLocalApp ? [LOCAL_API_ROOT] : [RENDER_API_ROOT];
let activeApiRoot = API_ROOTS[0];
const state = { games: [], round: null, coupons: [], savedCoupons: [], purchasedCoupons: [], shopLinks: [], lastShopCouponTitle: '', selectedPurchasedCouponId: null, reverseCoupon: null, reverseMode: 'reverse', reversePrice: 20, reverseSpikeCount: 2, reverseShareEnabled: false, reverseShareCount: 50, reverseStakePercent: 100, reverseStakePrice: null, togetherStakePercent: 100, togetherStakePrice: null, reverseSourceIds: [], reverseManualSelections: {}, reverseCombinationOptions: [], reverseCombinationCursor: 0, reverseCombinationLocked: false, reverseLockedCombinationSignature: '', reverseShufflePattern: '', downgradeSourceIds: [], downgradePrice: 1000, downgradeNewCombination: false, downgradeCoupons: [], downgradeDrafts: [], roundBuilderTab: 'together', tipsterBuzz: null, tipsterDivision: 1, tipsterHorseNumber: null, tipsterLoading: false, tipstersHasNewInfo: false, focusedTogetherPackages: {}, locks: new Set(), combinationLocks: new Set(), lockedCombinationPatterns: new Map(), selectedPlanIndexes: [], pendingCombinationIndexes: [], combinationCursors: [], combinationOptions: [], couponCount: 3, spikeCount: 2, manualSpikeCount: 2, togetherPreset: null, together2: false, editingRound: false, seed: 1, shuffleSeed: 0, countPlanCache: new Map(), combinationPlanCache: new Map(), regenerateTimer: null, refreshImportTimer: null, weeklyImportTimer: null };
const DOWNGRADE_DRAFTS_STORAGE_KEY = 'travet.downgradeDrafts.v1';
const FOCUSED_TOGETHER_STORAGE_KEY = 'travet.focusedTogether.v1';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function apiFetch(endpoint, options = {}) {
  const path = String(endpoint).replace(LOCAL_API_ROOT, '').replace(RENDER_API_ROOT, '');
  const { timeoutMs = 30000, ...fetchOptions } = options;
  let lastError = null;
  for (const root of [...new Set([activeApiRoot, ...API_ROOTS])]) {
    const controller = new AbortController();
    const rootTimeout = timeoutMs;
    const timer = setTimeout(() => controller.abort(), rootTimeout);
    try {
      const response = await fetch(`${root}${path}`, { ...fetchOptions, signal: fetchOptions.signal || controller.signal });
      activeApiRoot = root;
      return response;
    } catch (error) { lastError = error; }
    finally { clearTimeout(timer); }
  }
  throw lastError || new Error('Trav API kunde inte nås');
}

function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function rowPriceForGameType(gameType) { const type = String(gameType || '').toUpperCase(); if (type === 'V85') return 0.5; if (type === 'V86') return 0.25; return 1; }
function money(value) { const parsed = Number(value) || 0; const fraction = Math.abs(parsed - Math.round(parsed)) > 0.001; return `${parsed.toLocaleString('sv-SE', { minimumFractionDigits: fraction ? 2 : 0, maximumFractionDigits: 2 })} kr`; }
function number(value, fallback = null) { const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.').trim()); return Number.isFinite(parsed) ? parsed : fallback; }
function fmtPercent(value) { const parsed = number(value); return parsed === null ? '–' : `${parsed % 1 ? parsed.toFixed(1) : parsed}%`; }
function fmtTrendValue(value) { const parsed = number(value); return parsed === null ? '–' : `${parsed % 1 ? parsed.toFixed(2) : parsed}`; }
function winningTrendPercent(horse) { const winPercent = number(horse?.winPercent, null); const trendPercent = number(horse?.trendPercent, null); return winPercent === null || trendPercent === null ? null : winPercent - trendPercent; }
function today() { return new Date().toISOString().slice(0, 10); }
function dateLabel(value) { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }); }
function trackSlug(...values) { return values.map((value) => String(value || '').trim()).filter(Boolean).join('-').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-'); }
function trackLabel(track, track2 = '') { return [track, track2].map((value) => String(value || '').trim()).filter(Boolean).join(' – '); }
function divisionCount(type) { return GAME_DIVISIONS[String(type || '').toUpperCase()] || 0; }
function atgUrls({ date, gameType, track, track2 }) { const slug = trackSlug(track, track2); return Array.from({ length: divisionCount(gameType) }, (_, i) => `https://www.atg.se/spel/${date}/${gameType}/${slug}/avd/${i + 1}`); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200); }

function parseHorse(raw, index = 0) {
  if (raw && typeof raw === 'object' && (raw.name || raw.rawLine)) {
    const line = String(raw.rawLine || '');
    const cells = line.split('\t');
    const match = String(raw.name || cells[1] || '').match(/^\s*(\d+)\s+(.+)$/);
    const oddsValue = raw.winOdds ?? cells[6] ?? '';
    const scratched = Boolean(raw.scratched) || /^EJ$/i.test(String(oddsValue).trim());
    return { id: raw.id || `${raw.number || index}-${raw.name || 'horse'}`, number: number(raw.number, match ? Number(match[1]) : number(cells[0], index + 1)), name: raw.name || (match ? match[2] : cells[1] || line), sexAge: raw.sexAge || cells[2] || '', driver: raw.driver || cells[3] || '', winPercent: number(raw.winPercent, number(cells[4])), startTrendPercent: number(raw.startTrendPercent, number(cells[5])), trendPercent: number(raw.trendPercent, number(cells[5])), winOdds: scratched ? null : number(raw.winOdds, number(cells[6])), trainer: raw.trainer || cells[7] || '', sulky: raw.sulky || cells[8] || '', scratched, manualScore: number(raw.manualScore, 0), note: raw.note || '' };
  }
  const line = String(raw || '').trim();
  const parts = line.split('\t');
  const match = line.match(/^(\d+)\s+(.+)$/);
  const scratched = /^EJ$/i.test(String(parts[6] || '').trim());
  return { id: `${index}-${line}`, number: match ? Number(match[1]) : number(parts[0], index + 1), name: match ? match[2] : parts[1] || line, sexAge: parts[2] || '', driver: parts[3] || '', winPercent: number(parts[4]), startTrendPercent: number(parts[5]), trendPercent: number(parts[5]), winOdds: scratched ? null : number(parts[6]), trainer: parts[7] || '', sulky: parts[8] || '', scratched, manualScore: 0, note: '' };
}

function normalizeGame(game) {
  const parsed = game?.parsedHorseInfo || {};
  const source = Array.isArray(parsed.divisions) ? parsed.divisions : [];
  const races = source.map((division, index) => ({ division: Number(division.index || division.division || index + 1), sourceUrl: division.sourceUrl || '', horses: (division.horses || []).map((horse, horseIndex) => { const parsedHorse = parseHorse(horse, horseIndex); if (parsedHorse.startTrendPercent === null || parsedHorse.startTrendPercent === 0) parsedHorse.startTrendPercent = winningTrendPercent(parsedHorse); return parsedHorse; }).filter((horse) => horse.name || horse.number) })).filter((race) => race.horses.length);
  const expected = divisionCount(game?.gameType) || Number(parsed.expectedDivisions) || 0;
  return { id: String(game?._id || game?.id || ''), name: game?.title || `${game?.gameType || 'Trav'} ${trackLabel(game?.track, game?.track2)}`.trim(), date: game?.date || today(), gameType: String(game?.gameType || 'V64').toUpperCase(), track: game?.track || '', track2: game?.track2 || '', trackSlug: game?.trackSlug || trackSlug(game?.track, game?.track2), atgGameId: game?.atgGameId || '', divisionCount: expected || races.length, rowPrice: rowPriceForGameType(game?.gameType), source: 'database', races };
}

function renderDatabaseStatus(message, mode = '') { const el = $('#db-status'); el.textContent = message; el.className = `status-pill ${mode}`; }
function renderHome() {
  const list = $('#round-list');
  const card = (game) => { const round = normalizeGame(game); const horses = round.races.reduce((sum, race) => sum + race.horses.length, 0); const typeClass = `game-type-${String(round.gameType || '').toLowerCase()}`; return `<article class="round-card ${typeClass}" data-game-id="${esc(round.id)}"><span class="type">${esc(round.gameType)}</span><button class="delete-game-button" data-delete-game="${esc(round.id)}" title="Ta bort omgång">Ta bort</button><h3>${esc(trackLabel(round.track, round.track2) || round.name)}</h3><p>${esc(dateLabel(round.date))} · ${round.divisionCount || '–'} avdelningar · ${horses || '–'} hästar</p><a class="round-link" href="./?round=${encodeURIComponent(round.id)}" data-round-link="${esc(round.id)}">Öppna länk ↗</a><span class="arrow">→</span></article>`; };
  const groups = { today: [], past: [], future: [] };
  state.games.forEach((game) => { const date = normalizeGame(game).date; groups[date === today() ? 'today' : date < today() ? 'past' : 'future'].push(game); });
  groups.past.sort((a, b) => normalizeGame(b).date.localeCompare(normalizeGame(a).date));
  groups.future.sort((a, b) => normalizeGame(a).date.localeCompare(normalizeGame(b).date));
  const section = (title, items, key) => !items.length ? '' : `<section class="home-game-group home-game-group-${key}"><div class="home-game-group-heading"><h3>${title}</h3><span>${items.length} omgång${items.length === 1 ? '' : 'ar'}</span></div><div class="round-list-group">${items.map(card).join('')}</div></section>`;
  list.innerHTML = section('Dagens spel', groups.today, 'today') + section('Tidigare spel', groups.past, 'past') + section('Framtida spel', groups.future, 'future');
  $('#empty-rounds').hidden = state.games.length > 0;
}

async function loadGames() {
  renderDatabaseStatus('Hämtar databasen…');
  try {
    const response = await apiFetch('/games');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.games = await response.json();
    mergeDatabasePurchasedCoupons();
    renderDatabaseStatus(`Databasdata · ${activeApiRoot === RENDER_API_ROOT ? 'Render' : 'lokal'}`, 'ok');
    renderHome();
    openRoundFromUrl();
  } catch (error) {
    state.games = [];
    renderDatabaseStatus('Databasen kunde inte nås', 'offline');
    renderHome();
    showToast(isLocalApp
      ? 'Kunde inte läsa Trav-data lokalt. Starta D:\\Bigplus\\STARTA-BIGPLUS-AKTIV.cmd.'
      : 'Kunde inte läsa Trav-data från Render. Kontrollera att Netlify-versionen är deployad.');
    console.error(error);
  }
}

async function importWeeklyGames() {
  const button = $('#import-week-games');
  if (button) { button.disabled = true; button.textContent = '⏳ Hämtar veckans spel…'; }
  renderDatabaseStatus('Importerar veckans spel…');
  showWeeklyImportOverlay({ state: 'queued', games: [], items: [], total: 0, completed: 0, current: '' });
  try {
    const response = await apiFetch('/rounds/weekly-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      timeoutMs: 30000,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Veckans spel svarade ${response.status}`);
    const result = await waitForWeeklyImport(payload.jobId, payload);
    await loadGames();
    const importedCount = Array.isArray(result.imported) ? result.imported.length : 0;
    const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;
    showToast(errorCount ? `${importedCount} omgångar importerades · ${errorCount} kunde inte importeras` : `${importedCount} omgångar importerades från ATG`);
  } catch (error) {
    renderDatabaseStatus('Veckans spel kunde inte importeras', 'offline');
    showToast(error.message);
    console.error(error);
  } finally {
    hideWeeklyImportOverlay();
    if (button) { button.disabled = false; button.textContent = '↻ Veckans spel'; }
  }
}

function renderWeeklyImportOverlay(job) {
  const total = Number(job.total || job.games?.length || 0);
  const completed = Number(job.completed || 0);
  const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : job.state === 'queued' ? 2 : 5;
  const phase = $('#weekly-import-phase');
  const progress = $('#weekly-import-progress');
  const percentNode = $('#weekly-import-percent');
  const detail = $('#weekly-import-detail');
  const summary = $('#weekly-import-summary');
  if (phase) phase.textContent = job.state === 'complete' ? 'Importen är klar' : job.current ? `Importerar ${job.current}` : 'Hämtar spel från ATG…';
  if (progress) progress.value = percent;
  if (percentNode) percentNode.textContent = `${percent}%`;
  if (detail) detail.textContent = `${completed} av ${total || '…'} omgångar klara · endast V64, V65, V85, V86 och GS75 importeras.`;
  if (summary) summary.innerHTML = (job.items || []).map((item) => `<div class="weekly-import-row ${esc(item.status || 'pending')}"><span>${item.status === 'done' ? '✓' : item.status === 'partial' ? '!' : item.status === 'error' ? '×' : item.status === 'loading' ? '…' : '○'}</span><strong>${esc(item.gameType)} ${esc(item.track)}${item.track2 ? ` – ${esc(item.track2)}` : ''}</strong><small>${esc(item.detail || 'Väntar')}</small></div>`).join('');
}

function showWeeklyImportOverlay(job) {
  const overlay = $('#weekly-import-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  clearInterval(state.weeklyImportTimer);
  const started = Date.now();
  const tick = () => { const elapsed = Math.round((Date.now() - started) / 1000); const node = $('#weekly-import-elapsed'); if (node) node.textContent = `Tid: ${elapsed} s`; };
  state.weeklyImportTimer = setInterval(tick, 1000); tick(); renderWeeklyImportOverlay(job);
}

function hideWeeklyImportOverlay() { clearInterval(state.weeklyImportTimer); state.weeklyImportTimer = null; const overlay = $('#weekly-import-overlay'); if (overlay) overlay.hidden = true; }

async function waitForWeeklyImport(jobId, initial) {
  let job = initial;
  if (!jobId) return job;
  while (job.state !== 'complete' && job.state !== 'error') {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const response = await apiFetch(`/rounds/weekly-import/${encodeURIComponent(jobId)}`, { timeoutMs: 20000 });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Importstatus svarade ${response.status}`);
    job = payload; renderWeeklyImportOverlay(job);
  }
  renderWeeklyImportOverlay(job);
  return job;
}

function tipsterSignalFor(horse, tipsterId) { return (horse?.signals || []).find((signal) => signal.tipster?.id === tipsterId) || null; }
function tipsterClassificationLabel(value) { return String(value || 'INGEN_STARK_SIGNAL').replaceAll('_', ' '); }
function tipsterBuzzClass(buzz) { const score = Number(buzz?.score || 0); return score >= 80 ? 'strong' : score >= 55 ? 'watch' : score > 0 ? 'positive' : 'empty'; }
function tipsterBuzzText(buzz, configuredCount) { if (!buzz || !buzz.positiveCount) return 'Inga positiva signaler ännu'; return `${buzz.positiveCount} av ${configuredCount} positiva`; }

function renderTipsterBuzzPanel(horse, race, selector = '#tipster-buzz-panel') {
  const container = $(selector);
  if (!container || !horse) return;
  const configured = state.tipsterBuzz?.configuredTipsters || [];
  const buzz = horse.buzz || { score: 0, classification: 'INGEN_STARK_SIGNAL', positiveCount: 0, negativeCount: 0 };
  const source = horse.signals?.find((signal) => signal.source?.url)?.source?.url || '';
  const signalRows = configured.map((tipster) => {
    const signal = tipsterSignalFor(horse, tipster.id);
    const positive = signal?.signal?.positive;
    return `<div class="tipster-signal-row"><span class="tipster-avatar">${esc(tipster.name.split(' ').map((part) => part[0]).join('').slice(0, 2))}</span><strong>${esc(tipster.name)}</strong><span class="tipster-signal-label ${positive === false ? 'negative' : positive ? 'positive' : 'neutral'}">${positive === false ? '▼ Negativ' : positive ? '▲ Positiv' : '— Ingen signal'}</span><span class="tipster-signal-type">${signal ? esc(signal.signal.type.replaceAll('_', ' ')) : '—'}</span><strong class="tipster-signal-score">${signal ? Math.round(Number(signal.signal.score || 0) * 100) : '—'}</strong></div>`;
  }).join('');
  container.innerHTML = `<div class="tipster-buzz-heading"><div><span class="eyebrow">TIPSTER BUZZ</span><h2>${esc(horse.name)}</h2><p>${esc(horse.driver || 'Kusk saknas')} · ${fmtPercent(horse.winPercent)} · Odds ${horse.winOdds ?? '–'}</p></div><div class="tipster-buzz-score ${tipsterBuzzClass(buzz)}"><span>${buzz.score}</span><small>/ 100</small></div></div><div class="tipster-buzz-summary ${tipsterBuzzClass(buzz)}"><strong>${buzz.score ? tipsterClassificationLabel(buzz.classification) : 'Ingen stark signal'}</strong><span>${tipsterBuzzText(buzz, configured.length)}</span></div><div class="tipster-buzz-copy">${buzz.score ? 'Strukturerade signaler från publika tipsterkällor. Fulla artiklar sparas inte.' : 'När en källa har importerats visas signaltyp och styrka här utan att återpublicera hela artikeln.'}</div><div class="tipster-signal-list"><div class="tipster-signal-head"><strong>Tipsters (${configured.length} st)</strong><span>Signal</span><span>Score</span></div>${signalRows || '<p class="tipster-empty-copy">Ingen tipsterkonfiguration är aktiv.</p>'}</div>${source ? `<a class="outline-button tipster-source-link" href="${esc(source)}" target="_blank" rel="noreferrer">Öppna källa ↗</a>` : ''}`;
}

function renderTipsters() {
  const content = $('#tipsters-content');
  if (!content) return;
  if (!state.round) { content.innerHTML = '<div class="empty-state tipster-empty-state"><div class="empty-icon">★</div><h2>Öppna en spelomgång först</h2><p>Tipster Buzz kopplas till den aktuella omgångens startlista.</p><button class="secondary-button" data-view="home">Till start</button></div>'; return; }
  const races = state.round.races || [];
  if (!races.length) { content.innerHTML = '<div class="empty-state tipster-empty-state"><div class="empty-icon">★</div><h2>Startlista saknas</h2><p>Importera startlistan innan Tipsters kan matchas mot hästarna.</p></div>'; return; }
  if (state.tipsterLoading) { content.innerHTML = '<div class="tipster-loading-state" role="status" aria-live="polite"><div class="tipster-loading-spinner">⟳</div><strong>Laddar tipstersignaler…</strong><span>Hämtar publika källor och matchar signalerna mot startlistan.</span></div>'; return; }
  const raceIndex = Math.max(0, Math.min(races.length - 1, Number(state.tipsterDivision || 1) - 1));
  state.tipsterDivision = raceIndex + 1;
  const race = races[raceIndex];
  const buzzRace = state.tipsterBuzz?.races?.find((item) => Number(item.division) === Number(race.division));
  const horses = race.horses.filter((horse) => !horse.scratched);
  if (!state.tipsterHorseNumber || !horses.some((horse) => Number(horse.number) === Number(state.tipsterHorseNumber))) state.tipsterHorseNumber = horses[0]?.number || null;
  const selectedHorse = horses.find((horse) => Number(horse.number) === Number(state.tipsterHorseNumber));
  const selectedBuzzHorse = buzzRace?.horses?.find((horse) => Number(horse.number) === Number(state.tipsterHorseNumber)) || { ...selectedHorse, buzz: { score: 0, positiveCount: 0, classification: 'INGEN_STARK_SIGNAL' }, signals: [] };
  const favorite = raceFavorite(race);
  const rows = horses.map((horse) => {
    const item = buzzRace?.horses?.find((entry) => Number(entry.number) === Number(horse.number)) || { ...horse, buzz: { score: 0 }, signals: [] };
    const buzz = item.buzz || { score: 0 };
    const selected = Number(horse.number) === Number(state.tipsterHorseNumber);
    return `<button type="button" class="tipster-horse-row ${selected ? 'selected' : ''} ${favorite?.number === horse.number ? 'favorite' : ''}" data-tipster-horse="${esc(horse.number)}"><span class="tipster-horse-number">${esc(horse.number)}</span><strong>${esc(horse.name)}</strong><span>${esc(horse.driver || '–')}</span><span>${fmtPercent(horse.winPercent)}</span><span>${horse.winOdds ?? '–'}</span><span class="buzz-pill ${tipsterBuzzClass(buzz)}">${buzz.score || '–'}</span><span>${buzz.positiveCount ? `${buzz.positiveCount} positiva` : 'Ingen signal'}</span></button>`;
  }).join('');
  const together = state.coupons.slice(0, 4).map((coupon, index) => `<div class="tipster-together-column"><strong><i>${index + 1}</i>${esc(coupon.name)}</strong><span>${coupon.selections?.[raceIndex]?.join(' · ') || '–'}</span></div>`).join('');
  const sourceCount = state.tipsterBuzz?.availableTipsters || 0;
  const sourceHealth = Object.values(state.tipsterBuzz?.sourceHealth || {});
  const sourceStatus = sourceCount ? `${sourceCount} tipsters med signal` : sourceHealth.some((source) => source.status === 'degraded' || source.status === 'blocked') ? 'Källor kunde inte läsas' : 'Inga signaler för omgången';
  content.innerHTML = `<div class="tipster-page-header"><div><span class="eyebrow">AKTUELL OMGÅNG</span><h1>${esc(state.round.gameType)} – ${esc(trackLabel(state.round.track, state.round.track2))}</h1><p>${esc(dateLabel(state.round.date))} · ${state.round.divisionCount} avdelningar · Radpris ${money(state.round.rowPrice)}</p></div><div class="tipster-header-actions"><button type="button" class="primary-button" id="tipsters-refresh">↻ Uppdatera tipsters</button><button type="button" class="ghost-button" data-view="round">Öppna omgång</button></div></div><div class="tipster-layout"><section class="tipster-race-panel"><div class="tipster-race-toolbar"><button type="button" class="tipster-race-arrow" data-tipster-division="prev" aria-label="Föregående avdelning">‹</button><label>Avdelning<select id="tipster-division">${races.map((item, index) => `<option value="${index + 1}" ${index === raceIndex ? 'selected' : ''}>Avd ${item.division}</option>`).join('')}</select></label><button type="button" class="tipster-race-arrow" data-tipster-division="next" aria-label="Nästa avdelning">›</button><span>${esc(race.distance || 'Startlista')} · ${horses.length} aktiva hästar</span></div><div class="tipster-table"><div class="tipster-table-head"><span>Nr</span><span>Häst</span><span>Kusk</span><span>V%</span><span>Odds</span><span>Buzz</span><span>Kommentar</span></div>${rows}</div></section><aside id="tipster-buzz-panel" class="tipster-buzz-panel"></aside></div><section class="tipster-together-preview"><div class="tipster-together-heading"><div><span class="eyebrow">TILLSAMMANS</span><h2>Jämför kupongerna med tipstersignalerna</h2><p>Buzz är ett stöd och kan aldrig tvinga in en häst i en kupong.</p></div><span class="status-pill">${sourceStatus}</span></div><div class="tipster-together-grid"><div class="tipster-division-label"><strong>AVD ${esc(race.division)}</strong></div>${together || '<div class="tipster-together-empty">Skapa kuponger i Tillsammans för att jämföra dem här.</div>'}</div></section>`;
  renderTipsterBuzzPanel(selectedBuzzHorse, race);
}

function ensureRoundTipstersMarkup() {
  const tabs = document.querySelector('.round-builder-tabs');
  if (tabs && !tabs.querySelector('[data-round-builder-tab="tipsters"]')) {
    tabs.insertAdjacentHTML('beforeend', '<button type="button" class="round-builder-tab" data-round-builder-tab="tipsters" role="tab" aria-selected="false">TIPSTER BUZZ</button>');
  }
  const aside = document.querySelector('#round-layout .together-column');
  if (tabs && aside && tabs.parentElement !== aside) aside.insertBefore(tabs, aside.firstElementChild);
  if (aside && !$('#round-tipsters-panel')) {
    aside.insertAdjacentHTML('beforeend', '<div id="round-tipsters-panel" data-round-builder-panel="tipsters" hidden><div class="round-tipsters-heading"><div><span class="eyebrow">TIPSTERS</span><h2>Tipster Buzz</h2><p>Signalerna visas inne i den aktuella omgången.</p></div><button type="button" class="outline-button" data-round-tipsters-refresh>↻ Uppdatera</button></div><div id="round-tipsters-content"></div></div>');
  }
}

function renderRoundTipsters() {
  const content = $('#round-tipsters-content');
  if (!content) return;
  if (!state.round) { content.innerHTML = '<div class="empty-state tipster-empty-state"><h2>Öppna en omgång först</h2><p>Tipsters kopplas till startlistan i den aktuella omgången.</p></div>'; return; }
  if (state.tipsterLoading) { content.innerHTML = '<div class="tipster-loading-state compact" role="status" aria-live="polite"><div class="tipster-loading-spinner">⟳</div><strong>Laddar tipstersignaler…</strong><span>Matchar publika källor mot hästarna.</span></div>'; return; }
  const races = state.round.races || [];
  if (!races.length) { content.innerHTML = '<div class="empty-state tipster-empty-state"><h2>Startlista saknas</h2><p>Importera startlistan innan tipsters kan matchas.</p></div>'; return; }
  const raceIndex = Math.max(0, Math.min(races.length - 1, Number(state.tipsterDivision || 1) - 1));
  state.tipsterDivision = raceIndex + 1;
  const race = races[raceIndex];
  const buzzRace = state.tipsterBuzz?.races?.find((item) => Number(item.division) === Number(race.division));
  const horses = race.horses.filter((horse) => !horse.scratched);
  if (!state.tipsterHorseNumber || !horses.some((horse) => Number(horse.number) === Number(state.tipsterHorseNumber))) state.tipsterHorseNumber = horses[0]?.number || null;
  const selectedHorse = horses.find((horse) => Number(horse.number) === Number(state.tipsterHorseNumber));
  const selectedBuzzHorse = buzzRace?.horses?.find((horse) => Number(horse.number) === Number(state.tipsterHorseNumber)) || { ...selectedHorse, buzz: { score: 0, positiveCount: 0, classification: 'INGEN_STARK_SIGNAL' }, signals: [] };
  const rows = horses.map((horse) => {
    const item = buzzRace?.horses?.find((entry) => Number(entry.number) === Number(horse.number)) || { ...horse, buzz: { score: 0 }, signals: [] };
    const buzz = item.buzz || { score: 0 };
    const selected = Number(horse.number) === Number(state.tipsterHorseNumber);
    return `<button type="button" class="round-tipster-horse ${selected ? 'selected' : ''}" data-tipster-horse="${esc(horse.number)}"><span class="tipster-horse-number">${esc(horse.number)}</span><strong>${esc(horse.name)}</strong><span>${fmtPercent(horse.winPercent)}</span><span class="buzz-pill ${tipsterBuzzClass(buzz)}">${buzz.score || '–'}</span></button>`;
  }).join('');
  const configured = state.tipsterBuzz?.configuredTipsters || [];
  const sourceCount = state.tipsterBuzz?.availableTipsters || 0;
  const sourceHealth = Object.values(state.tipsterBuzz?.sourceHealth || {});
  const sourceStatus = sourceCount ? `${sourceCount} tipsters med signal` : sourceHealth.some((source) => source.status === 'degraded' || source.status === 'blocked') ? 'Källor kunde inte läsas' : 'Inga signaler för omgången';
  content.innerHTML = `<div class="round-tipster-toolbar"><button type="button" class="tipster-race-arrow" data-tipster-division="prev" aria-label="Föregående avdelning">‹</button><strong>Avdelning ${esc(race.division)}</strong><button type="button" class="tipster-race-arrow" data-tipster-division="next" aria-label="Nästa avdelning">›</button><span class="status-pill">${esc(sourceStatus)}</span></div><div class="round-tipster-list">${rows || '<p class="tipster-empty-copy">Inga aktiva hästar i avdelningen.</p>'}</div><div id="round-tipster-buzz-panel" class="tipster-buzz-panel compact-buzz-panel"></div><small class="round-tipster-footnote">${configured.length ? `Källor: ${configured.length} konfigurerade tipsters` : 'Tipsterkällor väntar på uppdatering.'}</small>`;
  renderTipsterBuzzPanel(selectedBuzzHorse, race, '#round-tipster-buzz-panel');
}

function ensureTipsterNavBadge() {
  const nav = document.querySelector('[data-view="tipsters"]');
  if (nav && !nav.querySelector('#tipsters-nav-badge')) nav.insertAdjacentHTML('beforeend', '<span id="tipsters-nav-badge" class="nav-new-badge" hidden>Ny</span>');
}

function renderTipsterNavBadge() {
  const badge = $('#tipsters-nav-badge');
  if (badge) badge.hidden = !state.tipstersHasNewInfo;
}

async function loadTipsterBuzz(refresh = false) {
  if (!state.round?.id) { renderTipsters(); return; }
  state.tipsterLoading = true;
  renderTipsters(); renderRoundTipsters();
  try {
    if (refresh) {
      const refreshResponse = await apiFetch(`/rounds/${encodeURIComponent(state.round.id)}/tipsters/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}), timeoutMs: 30000 });
      if (!refreshResponse.ok) throw new Error(`Tipsterimporten svarade ${refreshResponse.status}`);
    }
    const response = await apiFetch(`/rounds/${encodeURIComponent(state.round.id)}/tipster-buzz`);
    if (!response.ok) throw new Error(`Tipsterdata svarade ${response.status}`);
    state.tipsterBuzz = await response.json();
    const tipstersVisible = Boolean($('#tipsters-view') && !$('#tipsters-view').hidden);
    state.tipstersHasNewInfo = !tipstersVisible && state.roundBuilderTab !== 'tipsters' && Boolean(state.tipsterBuzz?.availableTipsters);
    renderTipsterNavBadge();
  } catch (error) {
    state.tipsterBuzz = null;
    console.error(error);
    showToast('Tipsterdata kunde inte hämtas');
  } finally {
    state.tipsterLoading = false;
    renderTipsters();
    renderRoundTipsters();
    // Buzz-score används även i kupongraderna. När den cachade datan har
    // lästs in måste alla vyer som visar avdelningar ritas om direkt.
    if (state.round) {
      renderCoupons();
      renderRoundSavedCoupons();
      if (state.roundBuilderTab === 'reverse') renderReverseBuilder();
      if (state.roundBuilderTab === 'downgrade') renderDowngradeBuilder();
    }
  }
}

function showView(name) {
  const isRound = name === 'round' && state.round;
  const isCoupons = name === 'coupons';
  const isResults = name === 'results';
  const isTipsters = name === 'tipsters';
  $$('.view').forEach((view) => { const active = view.id === (isRound ? 'round-view' : isCoupons ? 'coupons-view' : isResults ? 'results-view' : isTipsters ? 'tipsters-view' : name === 'home' ? 'home-view' : 'placeholder-view'); view.hidden = !active; view.classList.toggle('active-view', active); });
  $$('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === (isRound ? 'round' : name)));
  if (isTipsters) renderTipsters();
}

function setCouponsSubtab(tab = 'saved') {
  const activeTab = tab === 'import' ? 'import' : 'saved';
  state.couponsSubtab = activeTab;
  $$('#coupon-subtabs [data-coupon-subtab]').forEach((button) => {
    const selected = button.dataset.couponSubtab === activeTab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  $$('[data-coupon-subtab-panel]').forEach((panel) => { panel.hidden = panel.dataset.couponSubtabPanel !== activeTab; });
}

function ensureCouponImportTabMarkup() {
  const view = $('#coupons-view');
  const savedList = $('#saved-coupons-list');
  const reverseBuilder = view?.querySelector('.reverse-builder');
  if (!view || !savedList || !reverseBuilder || $('#coupon-subtabs')) return;
  const tabs = document.createElement('div');
  tabs.id = 'coupon-subtabs';
  tabs.className = 'coupon-subtabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Kuponger');
  tabs.innerHTML = '<button type="button" class="coupon-subtab active" data-coupon-subtab="saved" role="tab" aria-selected="true">Sparade kuponger</button><button type="button" class="coupon-subtab" data-coupon-subtab="import" role="tab" aria-selected="false">Importera kupong</button>';

  const savedPanel = document.createElement('div');
  savedPanel.id = 'saved-coupons-panel';
  savedPanel.dataset.couponSubtabPanel = 'saved';
  savedPanel.appendChild(savedList);

  const importPanel = document.createElement('div');
  importPanel.id = 'coupon-import-panel';
  importPanel.dataset.couponSubtabPanel = 'import';
  const importHeading = document.createElement('div');
  importHeading.className = 'coupon-import-heading';
  importHeading.innerHTML = '<span class="eyebrow">KUPONGIMPORT</span><h2>Importera kupong</h2><p>Hämta en butiksandel från ATG eller klistra in en kupongtext. Importerade kuponger sparas under Kuponger.</p>';
  importPanel.appendChild(importHeading);
  const shopPanel = reverseBuilder.querySelector('.shop-import-panel');
  const manualPanel = reverseBuilder.querySelector('.reverse-import-panel');
  if (shopPanel) importPanel.appendChild(shopPanel);
  if (manualPanel) importPanel.appendChild(manualPanel);

  view.insertBefore(tabs, reverseBuilder);
  view.insertBefore(savedPanel, reverseBuilder);
  view.insertBefore(importPanel, reverseBuilder);
  setCouponsSubtab(state.couponsSubtab || 'saved');
}

function setRoundUrl(roundId, replace = false) {
  const url = new URL(window.location.href);
  if (roundId) url.searchParams.set('round', roundId); else url.searchParams.delete('round');
  window.history[replace ? 'replaceState' : 'pushState']({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function openRoundById(gameId, updateUrl = true) {
  const game = state.games.find((item) => String(item._id) === String(gameId));
  if (!game) return false;
  state.round = normalizeGame(game);
  state.tipsterBuzz = null;
  state.tipsterDivision = 1;
  state.tipsterHorseNumber = null;
  state.savedCoupons = Array.isArray(game.coupons) ? game.coupons : [];
  state.roundBuilderTab = 'together';
  state.togetherCascadePreset = null;
  state.reverseSourceIds = [];
  state.reverseCoupon = null;
  state.reverseManualSelections = {};
  state.reverseCombinationOptions = [];
  state.reverseCombinationCursor = 0;
  state.reverseCombinationLocked = false;
  state.reverseLockedCombinationSignature = '';
  state.reverseShufflePattern = '';
  state.downgradeSourceIds = [];
  state.downgradeNewCombination = false;
  state.downgradeCoupons = [];
  resetCombinationState();
  state.seed += 1;
  state.shuffleSeed = 0;
  generateCoupons();
  renderRound();
  showView('round');
  if (updateUrl) setRoundUrl(state.round.id);
  // Läs endast redan sparad Tipster Buzz-data. Ny hämtning görs enbart med
  // användarens "Uppdatera tipsters"-knapp.
  void loadTipsterBuzz(false);
  return true;
}

function openRoundFromUrl() {
  const roundId = new URLSearchParams(window.location.search).get('round');
  if (roundId) openRoundById(roundId, false);
}

function setRoundBuilderTab(tab) {
  ensureRoundTipstersMarkup();
  const nextTab = ['reverse', 'downgrade', 'tipsters'].includes(tab) ? tab : 'together';
  state.roundBuilderTab = nextTab;
  if (nextTab === 'tipsters') { state.tipstersHasNewInfo = false; renderTipsterNavBadge(); }
  $$('[data-round-builder-tab]').forEach((button) => { const selected = button.dataset.roundBuilderTab === nextTab; button.classList.toggle('active', selected); button.setAttribute('aria-selected', selected ? 'true' : 'false'); });
  $$('[data-round-builder-panel]').forEach((panel) => { panel.hidden = panel.dataset.roundBuilderPanel !== nextTab; });
  if (nextTab === 'reverse') renderReverseBuilder();
  if (nextTab === 'downgrade') renderDowngradeBuilder();
  if (nextTab === 'tipsters') { renderRoundTipsters(); if (!state.tipsterBuzz) void loadTipsterBuzz(false); }
}

function savedCouponEntries() {
  return (state.games || []).flatMap((game) => (Array.isArray(game.coupons) ? game.coupons : []).map((coupon) => ({ game, coupon })));
}

function savedCouponGroups(onlyGameId = '') {
  const groups = new Map();
  const legacyGroups = [];
  for (const entry of savedCouponEntries()) {
    const { game, coupon } = entry;
    if (onlyGameId && String(game._id) !== String(onlyGameId)) continue;
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

function renderSavedCouponCard(coupon, round, couponIndex, winnerMap = new Map()) {
  const runtime = savedCouponRuntime(coupon, round);
  const hasResults = winnerMap.size > 0;
  const hitCount = (round.races || []).reduce((total, race, raceIndex) => { const winner = winnerMap.get(String(race.division)); return total + (Number.isFinite(winner) && (runtime.selections[raceIndex] || []).includes(winner) ? 1 : 0); }, 0);
  return `<article class="coupon-card unified-coupon-card saved-coupon-design"><div class="coupon-top"><span><i class="coupon-index-badge">${couponIndex + 1}</i><span class="coupon-title">${esc(String(coupon.name || '').replace(/^Tillsammans\s*·\s*/i, ''))}</span></span><span class="coupon-cost">${money(runtime.cost)}</span></div><p class="strategy-note">Sparad kupong${hasResults ? ` · ${hitCount} av ${round.races.length} rätt` : ''}</p><div class="coupon-stats"><span>▥ ${runtime.rows.toLocaleString('sv-SE')} rader</span><span>★ ${runtime.spikeCount} spikar</span></div>${(round.races || []).map((race, raceIndex) => { const winner = winnerMap.get(String(race.division)); const picks = runtime.selections[raceIndex] || []; const hit = Number.isFinite(winner) && picks.includes(winner); return `<div class="coupon-race saved-coupon-race ${hit ? 'result-coupon-row-hit' : ''}"><span class="race-label">${race.division}</span>${couponPicksMarkup(runtime, race, raceIndex, winner)}</div>`; }).join('')}<div class="coupon-footer"><span>${runtime.rows.toLocaleString('sv-SE')} rader · ${runtime.spikeCount} spikar</span><button class="delete-coupon-button" data-delete-saved-coupon="${esc(coupon._id)}" data-delete-game="${esc(round.id)}" title="Ta bort kupong">Ta bort</button></div></article>`;
}

function renderSavedCoupons() {
  const list = $('#saved-coupons-list');
  const status = $('#saved-coupons-status');
  if (!list || !status) return;
  if (!state.round) {
    status.textContent = 'Ingen omgång vald';
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">↗</div><h3>Öppna en spelomgång först</h3><p>Välj ett spel från startsidan. Kupongerna visas sedan under den aktuella spelomgången.</p></div>';
    return;
  }
  const groups = savedCouponGroups(state.round.id);
  const totalCoupons = groups.reduce((total, group) => total + group.coupons.length, 0);
  status.textContent = `${totalCoupons} sparade kuponger · ${groups.length} paket`;
  if (!groups.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">▣</div><h3>Inga sparade kuponger</h3><p>Spara ett kupongpaket från en omgång så visas kupongerna här.</p></div>'; return; }
  list.innerHTML = groups.map((group) => { const round = normalizeGame(group.game); const groupDate = group.createdAt ? new Date(group.createdAt).toLocaleString('sv-SE') : 'Sparat paket'; const roundName = `${round.gameType} ${trackLabel(round.track, round.track2)}`.trim() || round.name; const title = group.coupons[0]?.packageName || roundName; const typeClass = `game-type-${String(round.gameType || '').toLowerCase()}`; const winnerMap = resultWinnerMapFor(group.game, round); return `<section class="saved-coupon-group ${typeClass}"><div class="saved-coupon-group-header"><div><span class="eyebrow">KUPONGPAKET</span><h3>${esc(title)}</h3><p><strong>${esc(roundName)}</strong> · ${esc(dateLabel(round.date))} · ${esc(groupDate)}</p></div><span class="status-pill ok">${group.coupons.length} kuponger</span></div><div class="saved-coupon-group-grid">${group.coupons.map((coupon, index) => renderSavedCouponCard(coupon, round, index, winnerMap)).join('')}</div></section>`; }).join('');
}

function renderRoundSavedCoupons() {
  const container = $('#round-saved-coupons');
  if (!container || !state.round) return;
  const game = state.games.find((item) => String(item._id) === String(state.round.id));
  const coupons = Array.isArray(game?.coupons) ? game.coupons : state.savedCoupons;
  if (!coupons.length) { container.hidden = true; container.innerHTML = ''; return; }
  const winnerMap = resultWinnerMapFor(game || {}, state.round);
  container.hidden = false;
  container.innerHTML = `<div class="round-saved-coupons-heading"><div><span class="eyebrow">DEN HÄR OMGÅNGEN</span><h2>Sparade kuponger</h2></div><span>${coupons.length} kuponger</span></div><div class="round-saved-coupons-grid">${coupons.map((coupon, index) => renderSavedCouponCard(coupon, state.round, index, winnerMap)).join('')}</div>`;
}

async function loadSavedCoupons() {
  try {
    const response = await apiFetch('/games');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.games = await response.json();
    mergeDatabasePurchasedCoupons();
    const current = state.round ? state.games.find((game) => String(game._id) === String(state.round.id)) : null;
    state.savedCoupons = Array.isArray(current?.coupons) ? current.coupons : [];
  } catch (error) {
    showToast('Kunde inte läsa sparade kuponger');
    console.error(error);
  }
  renderSavedCoupons();
  renderRoundSavedCoupons();
  renderReverseBuilder();
  renderDowngradeBuilder();
}

const PURCHASED_COUPONS_STORAGE_KEY = 'travet.purchasedCoupons.v1';
const SHOP_LINKS_STORAGE_KEY = 'travet.shopLinks.v1';

function loadPurchasedCoupons() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PURCHASED_COUPONS_STORAGE_KEY) || '[]');
    state.purchasedCoupons = Array.isArray(stored) ? stored : [];
  } catch (error) {
    state.purchasedCoupons = [];
    console.warn('Kunde inte läsa importerade kuponger', error);
  }
}

function savePurchasedCoupons() {
  try { window.localStorage.setItem(PURCHASED_COUPONS_STORAGE_KEY, JSON.stringify(state.purchasedCoupons)); } catch (error) { console.warn('Kunde inte spara importerad kupong', error); }
}

function loadShopLinks() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SHOP_LINKS_STORAGE_KEY) || '[]');
    state.shopLinks = Array.isArray(stored) ? stored : [];
  } catch (error) { state.shopLinks = []; console.warn('Kunde inte läsa sparade andelslänkar', error); }
}

function saveShopLinks() {
  try { window.localStorage.setItem(SHOP_LINKS_STORAGE_KEY, JSON.stringify(state.shopLinks)); } catch (error) { console.warn('Kunde inte spara andelslänkar', error); }
}

function shopLinkBase(url) {
  const match = String(url || '').trim().match(/^(https?:\/\/[^/]+\/butik\/[^/]+\/spel\/\d+_)/i);
  return match ? match[1] : '';
}

function shopLinkId(url) {
  return shopLinkBase(url).match(/\/spel\/(\d+_)$/i)?.[1] || '';
}

function renderShopLinks() {
  const list = $('#shop-link-list');
  if (!list) return;
  if (!state.shopLinks.length) { list.innerHTML = '<small class="shop-link-empty">Inga sparade andelslänkar ännu.</small>'; return; }
  list.innerHTML = state.shopLinks.map((link) => `<div class="shop-link-item"><div><strong>${esc(link.title || `Andels-ID ${link.shareId}`)}</strong><small>${esc(link.shareId)} · ${esc(link.baseUrl)}</small></div><button type="button" class="secondary-button" data-import-shop-link="${esc(link.id)}">Importera</button></div>`).join('');
}

function mergeDatabasePurchasedCoupons() {
  const acceptedSources = new Set(['purchased', 'shop', 'tillsammans', 'together', 'reverse', 'downgrade']);
  const databaseCoupons = state.games.flatMap((game) => (game.coupons || []).filter((coupon) => acceptedSources.has(coupon.source)).map((coupon) => ({ game, coupon })));
  let changed = false;
  for (const { game, coupon } of databaseCoupons) {
    const round = normalizeGame(game);
    const kind = coupon.source === 'purchased' || coupon.source === 'shop' ? 'purchased' : 'saved';
    const existing = state.purchasedCoupons.find((item) => String(item.remoteCouponId || '') === String(coupon._id || ''));
    if (existing) { existing.remoteGameId = game._id; existing.remoteCouponId = coupon._id; existing.kind = kind; existing.source = coupon.source; existing.name = coupon.name || existing.name; continue; }
    const races = (round.races || []).map((race) => ({ division: race.division, picks: coupon.selections?.find((selection) => Number(selection.divisionIndex) === Number(race.division))?.horses || [], raw: '' }));
    state.purchasedCoupons.push({ id: `remote-${kind}-${coupon._id}`, remoteGameId: game._id, remoteCouponId: coupon._id, kind, source: coupon.source, name: coupon.name || (coupon.source === 'shop' ? 'Butiksandel' : 'Sparad kupong'), gameType: round.gameType, date: round.date, track: trackLabel(round.track, round.track2), rows: Number(coupon.rows) || races.reduce((total, race) => total * Math.max(1, race.picks.length), 1), cost: Number(coupon.cost) || 0, myCost: Number(coupon.myCost) || null, shareCount: Number(coupon.shareCount) || null, races, createdAt: coupon.createdAt || new Date().toISOString() });
    changed = true;
  }
  if (changed) savePurchasedCoupons();
}

function parsePurchasedCoupon(text) {
  const sourceText = String(text || '').replace(/[\u00a0\u202f]/g, ' ').replace(/\r/g, '').trim();
  if (sourceText.length < 20) throw new Error('Klistra in hela kupongtexten först.');
  const gameType = sourceText.match(/\b(V64|V65|V85|V86|GS75)\b/i)?.[1]?.toUpperCase() || '';
  const date = sourceText.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || '';
  if (!gameType || !date) throw new Error('Kunde inte hitta spelform och datum i kupongtexten.');
  const cost = number(sourceText.match(/Kostnad:\s*([\d\s.,]+)\s*kr/i)?.[1], null);
  const rowsMatch = sourceText.match(/(\d+(?:\s*x\s*\d+){2,})\s*=\s*([\d\s.,]+)\s*rader/i);
  const rows = rowsMatch ? number(rowsMatch[2], null) : null;
  const divisionStart = sourceText.search(/\bAvd\.?\s*\d+\s*:/i);
  if (divisionStart < 0) throw new Error('Kunde inte hitta avdelningarna i kupongtexten.');
  const countStart = rowsMatch ? sourceText.indexOf(rowsMatch[0], divisionStart) : -1;
  const divisionText = sourceText.slice(divisionStart).slice(0, countStart >= 0 ? countStart - divisionStart : undefined);
  const races = [];
  const divisionPattern = /(?:^|\s)(\d+)\s*:\s*([\s\S]*?)(?=\s+\d+\s*:|$)/g;
  let match;
  while ((match = divisionPattern.exec(divisionText))) {
    const content = match[2].replace(/\s+/g, ' ').trim();
    const selectedText = content.split('(')[0];
    const picks = Array.from(new Set((selectedText.match(/\b\d+\b/g) || []).map(Number)));
    if (!picks.length) continue;
    races.push({ division: Number(match[1]), picks, raw: content, spike: picks.length === 1 });
  }
  if (!races.length) throw new Error('Kunde inte läsa några valda hästar.');
  const weekdayPattern = '(?:måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)';
  const trackMatch = sourceText.match(new RegExp(`andelsspel\\s+(.+?)(?=\\s+${weekdayPattern}\\s+20\\d{2}-\\d{2}-\\d{2}|\\s+20\\d{2}-\\d{2}-\\d{2})`, 'i'));
  const track = (trackMatch?.[1] || '').replace(new RegExp(`\\b${weekdayPattern}\\b`, 'ig'), '').trim();
  const titleMatch = sourceText.match(/\b(?:Mikael[^\n]*?andelsspel|[^\n]*?andelsspel)/i);
  const name = titleMatch?.[0]?.trim() || `${gameType} köpt kupong`;
  return { id: `purchased-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind: 'purchased', name, gameType, date, track, rows: rows || races.reduce((total, race) => total * race.picks.length, 1), cost: cost ?? (rows || 0) * rowPriceForGameType(gameType), races, sourceText, createdAt: new Date().toISOString() };
}

function matchingRoundForPurchased(purchased) {
  if (!purchased) return null;
  const wantedTrack = trackSlug(purchased.track);
  return state.games.map(normalizeGame).find((round) => round.gameType === purchased.gameType && round.date === purchased.date && (!wantedTrack || trackSlug(round.track, round.track2).includes(wantedTrack) || wantedTrack.includes(trackSlug(round.track, round.track2))));
}

function renderPurchasedCouponCard(purchased, multi = false) {
  const selected = multi ? state.reverseSourceIds.includes(purchased.id) : state.selectedPurchasedCouponId === purchased.id;
  const label = purchased.source === 'shop' ? 'Butiksandel' : purchased.kind === 'saved' ? 'Min sparade kupong' : 'Köpt kupong';
  const raceSummary = (purchased.races || []).map((race) => `${race.division}: ${race.picks.join(', ')}`).join(' · ');
  const marker = multi ? `<button type="button" class="reverse-source-toggle ${selected ? 'selected' : ''}" data-reverse-source-toggle="${esc(purchased.id)}" aria-pressed="${selected}" title="Välj denna kupong som underlag">${selected ? '●' : '○'}</button>` : '';
  const action = !multi && selected ? '<div class="purchased-coupon-card-actions"><button type="button" class="gold-button" data-build-reverse-coupon>Skapa omvänd kupong</button></div>' : '';
  return `<article class="coupon-card unified-coupon-card purchased-coupon-card ${selected ? 'selected' : ''} ${multi ? 'reverse-multi-source' : ''}" data-purchased-coupon="${esc(purchased.id)}"><header><strong>${esc(label)}</strong><span>${money(purchased.cost)}</span>${marker}</header><p>${esc(purchased.gameType)} · ${esc(purchased.track || 'Bana saknas')} · ${esc(dateLabel(purchased.date))}</p><small>${esc(raceSummary)}</small>${action}</article>`;
}

function reverseCountsForPurchased(purchased, round) {
  const limits = round.races.map((race) => Math.max(1, race.horses.filter((horse) => !horse.scratched).length));
  const original = round.races.map((race) => purchased.races.find((item) => Number(item.division) === Number(race.division))?.picks.length || 1);
  const targetRows = Math.max(1, Number(purchased.rows) || original.reduce((total, count) => total * count, 1));
  const counts = original.map((count, index) => count === 1 ? Math.min(limits[index], 2) : 1);
  const minimum = original.map((count) => count === 1 ? 2 : 1);
  const product = () => counts.reduce((total, count) => total * count, 1);
  while (product() < targetRows) {
    const candidates = counts.map((count, index) => ({ index, next: Math.min(limits[index], count + 1), priority: original[index] === 1 ? 0 : 1 })).filter((item) => item.next > counts[item.index]).sort((a, b) => a.priority - b.priority || (Math.abs(targetRows - product() * b.next / counts[b.index]) - Math.abs(targetRows - product() * a.next / counts[a.index])));
    if (!candidates.length) break;
    counts[candidates[0].index] = candidates[0].next;
  }
  while (product() > targetRows) {
    const candidates = counts.map((count, index) => ({ index, next: Math.max(minimum[index], count - 1), priority: original[index] === 1 ? 1 : 0 })).filter((item) => item.next < counts[item.index]).sort((a, b) => a.priority - b.priority || b.next - a.next);
    if (!candidates.length) break;
    counts[candidates[0].index] = candidates[0].next;
  }
  return { counts, original, targetRows };
}

function reverseSourcesForRound(round = state.round) {
  if (!round) return [];
  return state.purchasedCoupons.filter((item) => {
    if (!['purchased', 'saved'].includes(item.kind)) return false;
    const match = matchingRoundForPurchased(item);
    return match && String(match.id) === String(round.id);
  });
}

function selectedReverseSources() {
  const selected = state.purchasedCoupons.filter((item) => state.reverseSourceIds.includes(item.id));
  if (selected.length) return selected.slice(0, 8);
  const legacy = state.purchasedCoupons.find((item) => item.id === state.selectedPurchasedCouponId);
  return legacy ? [legacy] : [];
}

function activeStakePrice(scope) {
  if (!isV85Round()) return null;
  const percent = scope === 'reverse' ? state.reverseStakePercent : state.togetherStakePercent;
  if (Number(percent) === 100) return null;
  const value = scope === 'reverse' ? state.reverseStakePrice : state.togetherStakePrice;
  return Number(value) > 0 ? Number(value) : null;
}

function reverseBudget() {
  const customStakePrice = activeStakePrice('reverse');
  if (customStakePrice !== null) return customStakePrice * stakeMultiplier('reverse');
  const price = Math.max(1, Number(state.reversePrice) || 20);
  const shares = state.reverseShareEnabled ? Math.max(1, Number(state.reverseShareCount) || 50) : 1;
  return price * shares;
}

function reverseCountPlan(round, sources) {
  const rowPrice = rowPriceForGameType(round.gameType);
  const targetRows = Math.max(1, Math.floor(reverseBudget() / rowPrice));
  const tolerance = Math.max(1, Math.floor(250 / rowPrice));
  const sourceSpikeDivisions = new Set();
  sources.forEach((source) => (source.races || []).forEach((race) => {
    if (race.picks?.length === 1) sourceSpikeDivisions.add(Number(race.division) - 1);
  }));
  const avoidSingles = state.reverseMode === 'reverse' ? sourceSpikeDivisions : new Set();
  const preferred = findComplementaryCountPlan(round.races, targetRows, avoidSingles, [], Math.max(0, Math.min(5, Number(state.reverseSpikeCount) || 0)), {}, Math.max(1, targetRows - tolerance), targetRows + tolerance);
  const fallback = pickCountsForBudget(round.races, reverseBudget(), Math.max(0, Math.min(5, Number(state.reverseSpikeCount) || 0)));
  let counts = preferred || fallback;
  const forcedSignature = state.reverseShufflePattern || (state.reverseCombinationLocked ? state.reverseLockedCombinationSignature : '');
  if (forcedSignature) {
    const locked = permuteCountPlanForRaces(round.races, forcedSignature, state.seed + state.reverseCombinationCursor, [], {}, counts);
    if (locked.length === round.races.length) counts = locked;
  }
  return { counts, targetRows, sourceSpikeDivisions };
}

function reverseHorseScore(horse, race, raceIndex, sources) {
  const numberValue = Number(horse.number);
  let appearances = 0;
  let spikeAppearances = 0;
  for (const source of sources) {
    const sourceRace = source.races?.find((item) => Number(item.division) === Number(race.division));
    if (sourceRace?.picks?.map(Number).includes(numberValue)) {
      appearances += 1;
      if (sourceRace.picks.length === 1) spikeAppearances += 1;
    }
  }
  const favorite = raceFavorite(race)?.number === numberValue;
  const secondFavorite = raceSecondFavorite(race)?.number === numberValue;
  const winPercent = Number(horse.winPercent) || 0;
  const shuffleNoise = randomValue((state.seed + 1) * 7919 + raceIndex * 101 + numberValue) * 8;
  if (state.reverseMode === 'favorite') return spikeAppearances * 1000 + appearances * 130 + (favorite ? 260 : 0) + (secondFavorite ? 150 : 0) + winPercent * 5 + shuffleNoise;
  return (sources.length - appearances) * 190 + (favorite ? 230 : 0) + (secondFavorite ? 150 : 0) + winPercent * 4 + shuffleNoise;
}

function reverseCombinationOptionsFor(coupon, round = state.round) {
  if (!round || !coupon) return [];
  const limits = round.races.map((race) => Math.min(10, Math.max(1, race.horses.filter((horse) => !horse.scratched).length)));
  const targetRows = Math.max(1, Number(coupon.rows) || 1);
  const rowPrice = rowPriceForGameType(round.gameType);
  const desiredSpikes = Math.max(0, Math.min(round.races.length, Number(state.reverseSpikeCount) || 0));
  const minRows = Math.max(1, targetRows - Math.floor(500 / rowPrice));
  const maxRows = Math.max(minRows, targetRows + Math.floor(250 / rowPrice));
  const candidates = [];
  const seen = new Set();
  let nodes = 0;
  const visit = (index, product, singles, counts) => {
    if (++nodes > 45000 || candidates.length > 140) return;
    const remaining = limits.length - index;
    if (singles > desiredSpikes || singles + remaining < desiredSpikes) return;
    if (index >= limits.length) {
      if (product >= minRows && product <= maxRows && singles === desiredSpikes && countPlanSignature(counts).length) {
        const signature = countPlanSignature(counts);
        if (!seen.has(signature)) { seen.add(signature); candidates.push({ counts: [...counts], rows: product, distance: Math.abs(product - targetRows) }); }
      }
      return;
    }
    const ideal = Math.max(1, targetRows / Math.max(1, product)) ** (1 / Math.max(1, limits.length - index));
    const order = Array.from({ length: limits[index] }, (_, offset) => offset + 1).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
    for (const count of order) { if (product * count > maxRows) continue; counts[index] = count; visit(index + 1, product * count, singles + (count === 1 ? 1 : 0), counts); if (nodes > 45000) return; }
  };
  visit(0, 1, 0, []);
  const current = coupon.races.map((race) => Math.max(1, race.picks.length));
  const currentKey = countPlanSignature(current);
  if (!seen.has(currentKey)) candidates.unshift({ counts: current, rows: countPlanProduct(current), distance: Math.abs(countPlanProduct(current) - targetRows) });
  candidates.sort((a, b) => a.distance - b.distance || countPlanCoverage(b.counts) - countPlanCoverage(a.counts));
  const selected = [];
  const addDiverse = (pool, amount) => {
    while (selected.length < 30 && amount > 0) {
      const available = pool.filter((candidate) => !selected.some((item) => countPlanSignature(item.counts) === countPlanSignature(candidate.counts)));
      if (!available.length) break;
      const next = selected.length ? available.sort((a, b) => Math.min(...selected.map((item) => countPlanDistance(item.counts, b.counts))) - Math.min(...selected.map((item) => countPlanDistance(item.counts, a.counts))) || a.distance - b.distance)[0] : available[0];
      selected.push(next);
      amount -= 1;
    }
  };
  addDiverse(candidates.filter((candidate) => candidate.rows <= targetRows), 20);
  addDiverse(candidates.filter((candidate) => candidate.rows > targetRows), 10);
  addDiverse(candidates, 30 - selected.length);
  return selected;
}

function buildReverseCoupon(purchasedOverride = null) {
  const fallbackSource = purchasedOverride || state.purchasedCoupons.find((item) => item.id === state.selectedPurchasedCouponId);
  const round = state.round || matchingRoundForPurchased(fallbackSource);
  const sources = selectedReverseSources().filter((source) => matchingRoundForPurchased(source)?.id === round?.id);
  if (!round || !sources.length) throw new Error('Välj minst en köpt kupong från samma omgång först.');
  const plan = reverseCountPlan(round, sources);
  const selections = round.races.map((race, raceIndex) => {
    const active = race.horses.filter((horse) => !horse.scratched);
    const manual = state.reverseManualSelections[raceIndex];
    const ranked = [...active].sort((a, b) => reverseHorseScore(b, race, raceIndex, sources) - reverseHorseScore(a, race, raceIndex, sources) || Number(a.number) - Number(b.number));
    const favorite = raceFavorite(race);
    const favoriteNumber = favorite ? Number(favorite.number) : null;
    const pickCount = Math.max(1, plan.counts[raceIndex]);
    const rankedWithFavoriteFirst = favorite
      ? [favorite, ...ranked.filter((horse) => Number(horse.number) !== favoriteNumber)]
      : ranked;
    const picks = Array.isArray(manual) && manual.length
      ? manual
      : rankedWithFavoriteFirst.slice(0, pickCount).map((horse) => Number(horse.number));
    const sourceCounts = sources.map((source) => source.races?.find((item) => Number(item.division) === Number(race.division))?.picks?.length || 0);
    return { division: race.division, picks: [...new Set(picks.map(Number))].filter((numberValue) => active.some((horse) => Number(horse.number) === numberValue)).sort((a, b) => a - b), originalCount: Math.max(...sourceCounts, 1), reason: state.reverseMode === 'favorite' ? 'Mest spelade tillsammans' : (plan.counts[raceIndex] === 1 ? 'Alternativ spik' : 'Hästar utanför källkupongerna') };
  });
  const rows = selections.reduce((total, race) => total * Math.max(1, race.picks.length), 1);
  const modeLabel = state.reverseMode === 'favorite' ? 'Favorit' : 'Omvänd';
  const coupon = { id: `reverse-${Date.now()}`, kind: 'reverse', mode: state.reverseMode, name: `${modeLabel} kupong`, gameType: round.gameType, date: round.date, track: trackLabel(round.track, round.track2), rows, cost: rows * rowPriceForGameType(round.gameType), pricePerShare: Number(state.reversePrice) || 20, shareEnabled: state.reverseShareEnabled, shareCount: Number(state.reverseShareCount) || 50, stakePercent: Number(state.reverseStakePercent) || 100, stakePrice: Number(state.reverseStakePrice) || null, spikeCount: selections.filter((race) => race.picks.length === 1).length, races: selections, sourceIds: sources.map((source) => source.id), createdAt: new Date().toISOString() };
  state.reverseCombinationOptions = reverseCombinationOptionsFor(coupon, round);
  state.reverseCombinationCursor = Math.max(0, state.reverseCombinationOptions.findIndex((option) => countPlanSignature(option.counts) === countPlanSignature(selections.map((race) => race.picks.length))));
  if (state.reverseCombinationCursor < 0) state.reverseCombinationCursor = 0;
  return coupon;
}

function reverseCouponCardMarkup(coupon, round) {
  if (!coupon || !round) return '';
  const modeLabel = coupon.mode === 'favorite' ? 'Favorit' : 'Omvänd';
  const previewCoupon = { selections: coupon.races.map((race) => race.picks) };
  const combination = reverseCombinationPickerMarkup(coupon);
  return `<article class="coupon-card unified-coupon-card reverse-generated-card"><div class="coupon-top"><span><i class="coupon-index-badge">1</i><span class="coupon-title">${modeLabel}</span></span><span class="coupon-cost">${money(coupon.cost)}</span></div><p class="strategy-note">${coupon.mode === 'favorite' ? 'Mest spelade hästar från valda kuponger' : 'Kompletterar valda kuponger med andra hästar och alternativa spikar'}</p><div class="coupon-stats"><span>▥ ${coupon.rows.toLocaleString('sv-SE')} rader</span><span>★ ${coupon.spikeCount} spikar</span></div>${round.races.map((race, raceIndex) => `<div class="coupon-race reverse-editable-race" data-reverse-edit-division="${raceIndex}"><span class="race-label">${race.division}</span>${couponPicksMarkup(previewCoupon, race, raceIndex)}<span class="reverse-edit-icon" title="Ändra hästar">✎</span></div>`).join('')}${combination}<div class="coupon-footer"><span>${coupon.rows.toLocaleString('sv-SE')} rader · ${coupon.spikeCount} spikar${coupon.shareEnabled ? ` · ${coupon.shareCount} andelar` : ''}</span><button type="button" class="gold-button" data-save-reverse-coupon>Spara kupong</button></div></article>`;
}

function reverseCombinationPickerMarkup(coupon) {
  const options = state.reverseCombinationOptions.length ? state.reverseCombinationOptions : reverseCombinationOptionsFor(coupon, state.round);
  if (!options.length) return '';
  const cursor = Math.min(Math.max(0, state.reverseCombinationCursor), options.length - 1);
  const option = options[cursor];
  const locked = state.reverseCombinationLocked;
  const signature = locked && state.reverseLockedCombinationSignature ? state.reverseLockedCombinationSignature : countPlanSignature(option.counts);
  const selected = locked || state.reverseCombinationCursor === cursor;
  return `<section class="combination-picker reverse-combination-picker${locked ? ' locked' : ''}"><div class="combination-picker-heading"><span class="eyebrow">FÖRSLAG FÖR KUPONGEN</span><span>±500 kr från ${money(reverseBudget())}</span></div><strong class="combination-picker-title">Bläddra bland radkombinationer</strong><div class="combination-slider reverse-combination-slider"><button type="button" class="combination-arrow" data-reverse-combination-prev aria-label="Föregående kombination"${locked ? ' disabled' : ''}>‹</button><div class="combination-slide-window"><div class="combination-option combination-slide${locked ? ' locked' : ''} ${selected ? 'selected' : ''}"><div class="combination-option-copy"><span class="combination-pattern">${signature}</span><strong>${money(countPlanProduct(signature.split('x').map(Number)) * (state.round?.rowPrice || rowPriceForGameType(coupon.gameType)))}</strong></div><button type="button" class="combination-select-marker ${locked ? 'selected locked' : ''}" data-reverse-combination-select aria-pressed="${locked}" title="${locked ? 'Lås upp denna kombination' : 'Lås denna kombination när du slumpar kupongen'}">${locked ? '●' : '○'}</button></div></div><button type="button" class="combination-arrow" data-reverse-combination-next aria-label="Nästa kombination"${locked ? ' disabled' : ''}>›</button></div><div class="combination-control-row"><span>${locked ? '🔒 Kombination låst' : `${cursor + 1} / ${options.length}`}</span></div></section>`;
}

function renderReversePreview() {
  const round = state.round || matchingRoundForPurchased(selectedReverseSources()[0]);
  const markup = state.reverseCoupon && round ? reverseCouponCardMarkup(state.reverseCoupon, round) : '';
  ['#reverse-coupon-preview', '#round-reverse-coupon-preview'].forEach((selector) => { const box = $(selector); if (!box) return; const isRoundPanel = selector.includes('round-'); const belongsToRound = !isRoundPanel || Boolean(round); box.hidden = !markup || !belongsToRound; box.innerHTML = box.hidden ? '' : markup; });
}

function renderReverseSettings() {
  const modeButtons = $$('[data-reverse-mode]');
  modeButtons.forEach((button) => button.classList.toggle('selected', button.dataset.reverseMode === state.reverseMode));
  const price = $('#reverse-price'); if (price && document.activeElement !== price) price.value = state.reversePrice;
  const shares = $('#reverse-share-count'); if (shares) shares.value = String(state.reverseShareCount);
  const enabled = $('#reverse-share-enabled'); if (enabled) enabled.checked = state.reverseShareEnabled;
  const shareWrap = $('#reverse-share-count-wrap'); if (shareWrap) shareWrap.hidden = !state.reverseShareEnabled;
  const stake = $('#reverse-stake-percent'); if (stake) stake.value = String(state.reverseStakePercent);
  const stakePrice = $('#reverse-stake-price'); if (stakePrice && document.activeElement !== stakePrice) stakePrice.value = state.reverseStakePrice ?? '';
  const stakePriceWrap = $('#reverse-stake-price-wrap'); if (stakePriceWrap) stakePriceWrap.hidden = Number(state.reverseStakePercent) === 100;
  $$('#reverse-spike-count button').forEach((button) => button.classList.toggle('selected', Number(button.dataset.reverseSpikes) === Number(state.reverseSpikeCount)));
}

function ensureReverseBuilderMarkup() {
  const panel = $('#round-reverse-panel');
  if (panel && !$('#reverse-price')) panel.innerHTML = `<div class="reverse-tab-heading"><span class="eyebrow">KUPONGBYGGARE</span><h2>Omvänd eller Favorit</h2><p>Välj upp till åtta kuponger som underlag och skapa en egen kompletterande kupong.</p></div><div class="reverse-settings-card"><div class="reverse-setting"><span>Typ av kupong</span><div class="reverse-mode-toggle"><button type="button" data-reverse-mode="reverse" class="selected">Omvänd</button><button type="button" data-reverse-mode="favorite">Favorit</button></div></div><label class="reverse-setting">Pris<input id="reverse-price" type="number" min="1" step="1" value="20"></label><div class="reverse-setting"><span>Antal spikar</span><div class="segmented" id="reverse-spike-count"><button type="button" data-reverse-spikes="0">0</button><button type="button" data-reverse-spikes="1">1</button><button type="button" data-reverse-spikes="2" class="selected">2</button><button type="button" data-reverse-spikes="3">3</button><button type="button" data-reverse-spikes="4">4</button><button type="button" data-reverse-spikes="5">5</button></div></div><label class="reverse-share-setting"><input id="reverse-share-enabled" type="checkbox"> Skapa andel</label><label id="reverse-share-count-wrap" class="reverse-setting" hidden>Antal andelar<select id="reverse-share-count"><option>5</option><option>10</option><option>15</option><option>20</option><option>25</option><option>30</option><option>35</option><option selected>50</option></select></label></div><div class="reverse-source-heading"><strong>Välj upp till 8 kuponger som underlag</strong><span id="reverse-source-count">0 valda</span></div><div id="round-purchased-coupon-list" class="purchased-coupon-list"></div><div class="reverse-builder-actions"><button type="button" id="reverse-shuffle" class="gold-button">⤨ Slumpa kupong</button><button type="button" id="reverse-save" class="outline-button">▣ Spara kupong</button></div><div id="round-reverse-coupon-preview" class="reverse-coupon-preview" hidden></div>`;
  if (!$('#reverse-editor-modal')) document.body.insertAdjacentHTML('beforeend', '<div id="reverse-editor-modal" class="modal-backdrop" hidden><section class="modal wide-modal" role="dialog" aria-modal="true"><button class="modal-close" data-close-modal="reverse-editor-modal">×</button><div id="reverse-editor-content"></div></section></div>');
}

function ensureReverseStakeControl() {
  const priceSetting = $('#reverse-price')?.closest('.reverse-setting');
  const shouldShow = isV85Round();
  let control = $('#reverse-stake-setting');
  if (shouldShow && priceSetting && !control) { priceSetting.insertAdjacentHTML('afterend', '<div class="reverse-setting stake-setting" id="reverse-stake-setting"><label for="reverse-stake-percent">Insats V85<select id="reverse-stake-percent"><option value="100">Normal insats</option><option value="30">30% insats</option><option value="50">50% insats</option><option value="70">70% insats</option></select></label><label class="stake-price-field" id="reverse-stake-price-wrap" for="reverse-stake-price">Normalpris per kupong<input id="reverse-stake-price" type="number" min="1" step="1" placeholder="Pris före sänkt insats"></label></div>'); control = $('#reverse-stake-setting'); }
  if (!shouldShow && control) { control.remove(); control = null; }
  if (control) { const stake = $('#reverse-stake-percent'); if (stake) stake.value = String(state.reverseStakePercent); const stakePrice = $('#reverse-stake-price'); if (stakePrice && document.activeElement !== stakePrice) stakePrice.value = state.reverseStakePrice ?? ''; const stakePriceWrap = $('#reverse-stake-price-wrap'); if (stakePriceWrap) stakePriceWrap.hidden = Number(state.reverseStakePercent) === 100; }
}

function loadDowngradeDrafts() {
  try { const stored = JSON.parse(window.localStorage.getItem(DOWNGRADE_DRAFTS_STORAGE_KEY) || '[]'); state.downgradeDrafts = Array.isArray(stored) ? stored : []; } catch (error) { state.downgradeDrafts = []; }
}

function saveDowngradeDrafts() { try { window.localStorage.setItem(DOWNGRADE_DRAFTS_STORAGE_KEY, JSON.stringify(state.downgradeDrafts.slice(0, 20))); } catch (error) { console.warn('Kunde inte spara downgrade-utkast', error); } }

function ensureDowngradeMarkup() {
  const panel = $('#round-downgrade-panel');
  if (!panel) return;
  const oldSave = $('#downgrade-save');
  if (oldSave) { oldSave.id = 'downgrade-save-later'; oldSave.textContent = '▣ Spara till senare'; }
  if (!$('#downgrade-new-combination')) {
    const settings = panel.querySelector('.downgrade-settings');
    settings?.insertAdjacentHTML('afterbegin', '<label class="downgrade-checkbox"><input id="downgrade-new-combination" type="checkbox"> <span>Ny kombination</span></label>');
  }
  if (!$('#downgrade-drafts')) panel.insertAdjacentHTML('beforeend', '<div id="downgrade-drafts" class="downgrade-drafts"></div>');
}

function downgradeSourcesForRound() { return reverseSourcesForRound().filter((item) => state.downgradeSourceIds.includes(item.id)); }

function toggleDowngradeSource(id) {
  const index = state.downgradeSourceIds.indexOf(id);
  if (index >= 0) state.downgradeSourceIds.splice(index, 1); else state.downgradeSourceIds.push(id);
  state.downgradeCoupons = [];
  renderDowngradeBuilder();
}

function downgradeCounts(source, round) {
  const original = round.races.map((race) => Math.max(1, source.races?.find((item) => Number(item.division) === Number(race.division))?.picks?.length || 1));
  const minimum = original.map((count) => count === 1 ? 1 : 2);
  const targetRows = Math.max(1, Math.floor((Number(state.downgradePrice) || 1000) / rowPriceForGameType(round.gameType)));
  const counts = [...original];
  const product = () => counts.reduce((total, count) => total * count, 1);
  while (product() > targetRows) {
    const candidates = counts.map((count, index) => ({ index, next: Math.max(minimum[index], count - 1) })).filter((item) => item.next < counts[item.index]);
    if (!candidates.length) break;
    if (state.downgradeNewCombination) candidates.sort((a, b) => randomValue((state.shuffleSeed + 1) * 97 + b.index * 31) - randomValue((state.shuffleSeed + 1) * 97 + a.index * 31));
    else candidates.sort((a, b) => Math.abs(targetRows - product() / counts[b.index] * b.next) - Math.abs(targetRows - product() / counts[a.index] * a.next));
    counts[candidates[0].index] = candidates[0].next;
  }
  if (state.downgradeNewCombination) {
    const alternatives = counts.map((count, index) => ({ index, next: count + 1 })).filter((item) => item.next <= original[item.index] && original[item.index] > 1);
    const alternative = alternatives.find((item) => counts.reduce((total, value, index) => total * (index === item.index ? item.next : value), 1) <= targetRows);
    if (alternative) counts[alternative.index] = alternative.next;
  }
  return { counts, targetRows, constrained: product() > targetRows };
}

function buildDowngradeCoupon(source, round, sourceIndex) {
  const plan = downgradeCounts(source, round);
  const selections = round.races.map((race, raceIndex) => {
    const sourceRace = source.races?.find((item) => Number(item.division) === Number(race.division));
    const originalPicks = (sourceRace?.picks || []).map(Number).filter((value) => race.horses.some((horse) => Number(horse.number) === value));
    const count = Math.min(originalPicks.length || 1, plan.counts[raceIndex]);
    if (originalPicks.length <= count) return originalPicks.sort((a, b) => a - b);
    const favorite = raceFavorite(race);
    const favoriteNumber = favorite && originalPicks.includes(Number(favorite.number)) ? Number(favorite.number) : null;
    const ranked = originalPicks.map((value) => race.horses.find((horse) => Number(horse.number) === value)).filter(Boolean).sort((a, b) => Number(b.winPercent || 0) - Number(a.winPercent || 0) || Number(a.number) - Number(b.number));
    const offset = ranked.length ? (state.shuffleSeed + sourceIndex + raceIndex) % ranked.length : 0;
    const rotated = ranked.slice(offset).concat(ranked.slice(0, offset));
    const favoriteHorse = favoriteNumber ? race.horses.find((horse) => Number(horse.number) === favoriteNumber) : null;
    const pool = favoriteHorse ? [favoriteHorse, ...rotated.filter((horse) => Number(horse.number) !== favoriteNumber)] : rotated;
    return pool.slice(0, count).map((horse) => Number(horse.number)).sort((a, b) => a - b);
  });
  const rows = selections.reduce((total, picks) => total * Math.max(1, picks.length), 1);
  return { id: `downgrade-${source.id}`, kind: 'downgrade', name: `Downgrade · ${source.name || 'kupong'}`, gameType: round.gameType, date: round.date, track: trackLabel(round.track, round.track2), rows, cost: rows * rowPriceForGameType(round.gameType), spikeCount: selections.filter((picks) => picks.length === 1).length, selections, sourceId: source.id, constrained: plan.constrained, targetRows: plan.targetRows };
}

function renderDowngradeBuilder() {
  ensureDowngradeMarkup();
  const list = $('#downgrade-source-list');
  const result = $('#downgrade-result-list');
  if (!list || !state.round) return;
  const sources = reverseSourcesForRound();
  list.innerHTML = sources.length ? sources.map((source) => { const selected = state.downgradeSourceIds.includes(source.id); const summary = (source.races || []).map((race) => `${race.division}: ${race.picks.join(',')}`).join(' · '); return `<article class="coupon-card unified-coupon-card purchased-coupon-card downgrade-source-card ${selected ? 'selected' : ''}" data-downgrade-source="${esc(source.id)}"><header><strong>${esc(source.name || 'Sparad kupong')}</strong><button type="button" class="reverse-source-toggle ${selected ? 'selected' : ''}" data-downgrade-source-toggle="${esc(source.id)}" aria-pressed="${selected}">${selected ? '●' : '○'}</button></header><p>${esc(source.gameType)} · ${esc(source.track || trackLabel(state.round.track, state.round.track2))} · ${esc(dateLabel(source.date))}</p><small>${esc(summary)}</small></article>`; }).join('') : '<div class="empty-state"><div class="empty-icon">↓</div><h3>Inga sparade kuponger för omgången</h3><p>Spara eller importera en kupong under Kuponger först.</p></div>';
  const status = $('#downgrade-status');
  if (status) status.textContent = state.downgradeSourceIds.length ? `${state.downgradeSourceIds.length} kupong${state.downgradeSourceIds.length === 1 ? '' : 'er'} vald${state.downgradeSourceIds.length === 1 ? '' : 'a'}` : 'Välj minst en sparad kupong.';
  const newCombination = $('#downgrade-new-combination');
  if (newCombination) newCombination.checked = state.downgradeNewCombination;
  if (result) result.innerHTML = state.downgradeCoupons.map((coupon, couponIndex) => `<article class="coupon-card unified-coupon-card downgrade-result-card"><div class="coupon-top"><span><i class="coupon-index-badge">${couponIndex + 1}</i><span class="coupon-title">${esc(coupon.name)}</span></span><span class="coupon-cost">${money(coupon.cost)}</span></div><p class="strategy-note">Spikarna är bevarade. Endast hästar har tagits bort.</p><div class="coupon-stats"><span>▥ ${coupon.rows.toLocaleString('sv-SE')} rader</span><span>★ ${coupon.spikeCount} spikar</span></div>${state.round.races.map((race, index) => `<div class="coupon-race"><span class="race-label">${race.division}</span>${couponPicksMarkup(coupon, race, index)}<span class="lock locked" title="Spikregeln är låst">🔒</span></div>`).join('')}<div class="coupon-footer"><span>${coupon.rows.toLocaleString('sv-SE')} rader · ${coupon.spikeCount} spikar</span><span>${coupon.constrained ? 'Minsta möjliga pris' : `Mål ${money(state.downgradePrice)}`}</span></div></article>`).join('');
  renderDowngradeDrafts();
}

function renderDowngradeDrafts() {
  const container = $('#downgrade-drafts');
  if (!container || !state.round) return;
  const drafts = state.downgradeDrafts.filter((draft) => String(draft.roundId) === String(state.round.id));
  if (!drafts.length) { container.innerHTML = ''; return; }
  const draftCoupon = (coupon, index, newCombination) => `<article class="coupon-card unified-coupon-card downgrade-draft-coupon"><div class="coupon-top"><span><i class="coupon-index-badge">${index + 1}</i><span class="coupon-title">${esc(coupon.name || 'Downgrade')}</span></span><span class="coupon-cost">${money(coupon.cost)}</span></div><p class="strategy-note">Spikarna är bevarade${newCombination ? ' · ny kombination' : ''}</p><div class="coupon-stats"><span>▥ ${Number(coupon.rows || 0).toLocaleString('sv-SE')} rader</span><span>★ ${coupon.spikeCount || 0} spikar</span></div>${state.round.races.map((race, raceIndex) => `<div class="coupon-race"><span class="race-label">${race.division}</span>${couponPicksMarkup(coupon, race, raceIndex)}<span class="lock locked" title="Spikarna är låsta">🔒</span></div>`).join('')}<div class="coupon-footer"><span>${Number(coupon.rows || 0).toLocaleString('sv-SE')} rader · ${coupon.spikeCount || 0} spikar</span></div></article>`;
  container.innerHTML = `<div class="downgrade-drafts-heading"><div><span class="eyebrow">SPARADE UTKAST</span><h3>Nedgraderingar att välja senare</h3></div><span>${drafts.length} grupper</span></div><div class="downgrade-drafts-list">${drafts.map((draft) => `<section class="downgrade-draft-group"><div class="downgrade-draft-card"><div><strong>${esc(draft.name)}</strong><small>${draft.coupons.length} kuponger · ${money(draft.price)} målpris${draft.newCombination ? ' · ny kombination' : ''}</small></div><div class="downgrade-draft-actions"><button type="button" class="gold-button" data-downgrade-apply="${esc(draft.id)}">Använd</button><button type="button" class="outline-button" data-downgrade-delete="${esc(draft.id)}">Ta bort</button></div></div><div class="downgrade-draft-coupons">${draft.coupons.map((coupon, index) => draftCoupon(coupon, index, draft.newCombination)).join('')}</div></section>`).join('')}</div>`;
}

function shuffleDowngradeCoupons() {
  const sources = downgradeSourcesForRound();
  if (!sources.length || !state.round) return showToast('Välj minst en sparad kupong först');
  state.shuffleSeed += 1;
  state.downgradeCoupons = sources.map((source, index) => buildDowngradeCoupon(source, state.round, index));
  renderDowngradeBuilder();
}

function saveDowngradeForLater() {
  if (!state.downgradeCoupons.length || !state.round?.id) return showToast('Slumpa fram nedgraderade kuponger först');
  const draft = { id: `downgrade-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, roundId: state.round.id, name: `Downgrade · ${dateLabel(state.round.date)}`, price: Number(state.downgradePrice) || 1000, newCombination: state.downgradeNewCombination, coupons: JSON.parse(JSON.stringify(state.downgradeCoupons)), createdAt: new Date().toISOString() };
  state.downgradeDrafts = [draft, ...state.downgradeDrafts].slice(0, 20);
  saveDowngradeDrafts();
  renderDowngradeBuilder();
  showToast('Kuponggruppen sparades till senare');
}

async function saveDowngradeCoupons(coupons = state.downgradeCoupons, packageName = '') {
  if (!coupons.length || !state.round?.id) { showToast('Slumpa fram nedgraderade kuponger först'); return false; }
  try {
    const packageId = `downgrade-${Date.now()}`;
    const title = packageName || `Downgrade · ${coupons[0].name.replace(/^Downgrade · /, '')}`;
    for (const coupon of coupons) { const response = await apiFetch(`/games/${encodeURIComponent(state.round.id)}/coupons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: coupon.name, source: 'downgrade', packageId, packageName: title, packageCreatedAt: new Date().toISOString(), rows: coupon.rows, cost: coupon.cost, spikeCount: coupon.spikeCount, selections: coupon.selections.map((horses, index) => ({ divisionIndex: state.round.races[index]?.division || index + 1, horses })) }) }); if (!response.ok) throw new Error('Kunde inte spara nedgraderade kuponger'); }
    await loadGames(); showToast('Kupongerna sparades under Kuponger som Downgrade'); return true;
  } catch (error) { showToast(error.message); return false; }
}

async function applyDowngradeDraft(id) {
  const draft = state.downgradeDrafts.find((item) => item.id === id);
  if (!draft) return;
  const saved = await saveDowngradeCoupons(draft.coupons, draft.name);
  if (saved) { state.downgradeDrafts = state.downgradeDrafts.filter((item) => item.id !== id); saveDowngradeDrafts(); renderDowngradeBuilder(); }
}

function renderReverseBuilder() {
  ensureReverseBuilderMarkup();
  ensureReverseStakeControl();
  renderReverseSettings();
  const status = $('#reverse-builder-status');
  const visibleCoupons = state.purchasedCoupons;
  const roundCoupons = reverseSourcesForRound();
  const emptyMessage = state.round ? 'Spara en egen kupong eller importera en köpt kupong under Kuponger för att välja den här omgången.' : 'Spara eller klistra in en kupong ovan för att kunna bygga.';
  const lists = [['#purchased-coupon-list', visibleCoupons, false], ['#round-purchased-coupon-list', roundCoupons, true]];
  lists.forEach(([selector, coupons, multi]) => { const list = $(selector); if (!list) return; list.innerHTML = coupons.length ? coupons.map((coupon) => renderPurchasedCouponCard(coupon, multi)).join('') : `<div class="empty-state"><div class="empty-icon">↔</div><h3>Inga köpta kuponger</h3><p>${emptyMessage}</p></div>`; });
  const selected = selectedReverseSources();
  renderShopLinks();
  const sourceCount = $('#reverse-source-count');
  if (sourceCount) sourceCount.textContent = `${state.reverseSourceIds.length} valda`;
  if (status) status.textContent = selected.length ? `${selected.length} kupong${selected.length === 1 ? '' : 'er'} vald${selected.length === 1 ? '' : 'a'}` : 'Ingen kupong vald';
  renderReversePreview();
}

function saveImportedPurchasedCoupon() {
  const input = $('#purchased-coupon-input');
  const message = $('#purchased-coupon-message');
  try {
    const parsed = parsePurchasedCoupon(input.value);
    state.purchasedCoupons = [parsed, ...state.purchasedCoupons.filter((item) => item.id !== parsed.id)];
    state.selectedPurchasedCouponId = parsed.id;
    state.reverseSourceIds = [parsed.id];
    state.reverseCoupon = null;
    savePurchasedCoupons();
    message.className = 'reverse-message ok';
    message.textContent = `${parsed.gameType} med ${parsed.races.length} avdelningar sparades under Kupongbyggare.`;
    renderReverseBuilder();
    const round = matchingRoundForPurchased(parsed);
    if (round) void persistPurchasedCouponToGame(parsed, round);
  } catch (error) {
    message.className = 'reverse-message error';
    message.textContent = error.message;
  }
}

async function importShopCoupon(urlOverride = '', linkOverride = null) {
  const input = $('#shop-coupon-url');
  const message = $('#shop-coupon-message');
  const button = $('#import-shop-coupon');
  const url = String(urlOverride || input?.value || '').trim();
  if (!url) { if (message) { message.className = 'reverse-message error'; message.textContent = 'Klistra in ATG-länken först.'; } return; }
  if (button) { button.disabled = true; button.textContent = 'Hämtar…'; }
  try {
    const response = await apiFetch('/games/import/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, gameId: state.round?.id || '', shopLinkId: linkOverride?.id || '' }), timeoutMs: 120000 });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Butiksimporten svarade ${response.status}`);
    state.lastShopCouponTitle = payload.importedCoupon?.name || state.lastShopCouponTitle;
    if ($('#shop-link-title') && !$('#shop-link-title').value) $('#shop-link-title').value = state.lastShopCouponTitle;
    if (message) { message.className = 'reverse-message ok'; message.textContent = `${payload.importedCoupon?.name || 'Butiksandelen'} sparades under Kuponger.`; }
    if (!linkOverride) input.value = '';
    // Uppdatera den lokala listan direkt från POST-svaret. Tidigare väntade
    // importen på en separat GET /games, vilket gjorde att kupongen syntes
    // först efter nästa render eller annan ändring på sidan.
    if (payload.game?._id) {
      const importedGame = payload.game;
      const existingIndex = state.games.findIndex((game) => String(game._id) === String(importedGame._id));
      if (existingIndex >= 0) state.games[existingIndex] = importedGame;
      else state.games = [importedGame, ...state.games];
      state.savedCoupons = Array.isArray(importedGame.coupons) ? importedGame.coupons : [];
      mergeDatabasePurchasedCoupons();
      renderHome();
      renderSavedCoupons();
      renderRoundSavedCoupons();
      renderReverseBuilder();
      renderDowngradeBuilder();
      if (state.round && String(state.round.id) === String(importedGame._id)) openRoundById(importedGame._id, false);
    } else {
      await loadGames();
    }
  } catch (error) {
    if (message) { message.className = 'reverse-message error'; message.textContent = error.message; }
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Hämta butiksandel'; }
  }
}

function saveShopLink() {
  const url = $('#shop-coupon-url')?.value.trim() || '';
  const baseUrl = shopLinkBase(url);
  const shareId = shopLinkId(url);
  const message = $('#shop-coupon-message');
  if (!baseUrl || !shareId) { if (message) { message.className = 'reverse-message error'; message.textContent = 'Länken måste innehålla ett andels-ID, till exempel 130723_.'; } return; }
  const title = $('#shop-link-title')?.value.trim() || state.lastShopCouponTitle || `Andels-ID ${shareId}`;
  const existing = state.shopLinks.find((link) => link.shareId === shareId);
  const saved = { id: existing?.id || `shop-link-${Date.now()}`, baseUrl, shareId, title, createdAt: existing?.createdAt || new Date().toISOString() };
  state.shopLinks = [saved, ...state.shopLinks.filter((link) => link.shareId !== shareId)];
  saveShopLinks();
  renderShopLinks();
  if (message) { message.className = 'reverse-message ok'; message.textContent = `${title} sparades i listan.`; }
}

function importSavedShopLink(linkId) {
  const link = state.shopLinks.find((item) => item.id === linkId);
  if (!link) return;
  const input = $('#shop-coupon-url');
  const title = $('#shop-link-title');
  if (input) input.value = link.baseUrl;
  if (title) title.value = link.title || '';
  void importShopCoupon(link.baseUrl, link);
}

async function persistPurchasedCouponToGame(purchased, round) {
  if (purchased.remoteGameId) return;
  try {
    const response = await apiFetch(`/games/${encodeURIComponent(round.id)}/coupons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: purchased.name, source: 'purchased', packageId: `purchased-${purchased.id}`, packageName: 'Köpta kuponger', packageCreatedAt: purchased.createdAt, rows: purchased.rows, cost: purchased.cost, spikeCount: purchased.races.filter((race) => race.picks.length === 1).length, selections: purchased.races.map((race) => ({ divisionIndex: race.division, horses: race.picks })) }) });
    if (response.ok) { purchased.remoteGameId = round.id; savePurchasedCoupons(); }
  } catch (error) { console.warn('Kunde inte synka köpt kupong till omgången', error); }
}

async function saveReverseCoupon() {
  if (!state.reverseCoupon) return;
  const saved = { ...state.reverseCoupon, id: `reverse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  state.purchasedCoupons = [saved, ...state.purchasedCoupons];
  state.selectedPurchasedCouponId = saved.id;
  savePurchasedCoupons();
  if (state.round?.id) {
    try {
      const response = await apiFetch(`/games/${encodeURIComponent(state.round.id)}/coupons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${saved.mode === 'favorite' ? 'Favorit' : 'Omvänd'} · ${saved.name}`, source: 'reverse', packageId: `reverse-${saved.id}`, packageName: 'Omvänd kupong', packageCreatedAt: saved.createdAt, rows: saved.rows, cost: saved.cost, spikeCount: saved.spikeCount, selections: saved.races.map((race) => ({ divisionIndex: race.division, horses: race.picks })) }) });
      if (!response.ok) console.warn('Kunde inte synka omvänd kupong till omgången');
    } catch (error) { console.warn('Kunde inte synka omvänd kupong', error); }
  }
  renderReverseBuilder();
  showToast('Kupongen sparades under Kuponger');
}

function shuffleReverseCoupon() {
  try {
    const previousPattern = state.reverseCoupon?.races ? countPlanSignature(state.reverseCoupon.races.map((race) => race.picks.length)) : '';
    state.reverseManualSelections = {};
    let candidate = null;
    let nextPattern = previousPattern;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      state.seed += 1;
      state.shuffleSeed += 1;
      const alternative = !state.reverseCombinationLocked && previousPattern
        ? state.reverseCombinationOptions.find((option) => countPlanSignature(option.counts) !== previousPattern)
        : null;
      state.reverseShufflePattern = alternative ? countPlanSignature(alternative.counts) : '';
      candidate = buildReverseCoupon();
      nextPattern = countPlanSignature(candidate.races.map((race) => race.picks.length));
      if (!previousPattern || nextPattern !== previousPattern || state.reverseCombinationLocked) break;
    }
    state.reverseShufflePattern = '';
    state.reverseCoupon = candidate;
    renderReverseBuilder();
  } catch (error) {
    state.reverseShufflePattern = '';
    const status = $('#reverse-builder-status');
    if (status) status.textContent = error.message;
    showToast(error.message);
  }
}

function openReverseEditor(raceIndex) {
  const race = state.round?.races?.[raceIndex];
  const coupon = state.reverseCoupon;
  if (!race || !coupon) return;
  const selected = new Set(coupon.races[raceIndex]?.picks || []);
  $('#reverse-editor-content').innerHTML = `<div class="eyebrow">${coupon.mode === 'favorite' ? 'FAVORIT' : 'OMVÄND'} KUPONG</div><h2 class="editor-title">Avd ${race.division} – välj hästar</h2><p class="editor-intro">Kryssa i egna hästar. Den ändrade avdelningen sparas i förslaget tills du slumpar fram ett nytt.</p><form id="reverse-editor-form" data-race="${raceIndex}"><div class="horse-picker">${race.horses.map((horse) => `<label class="picker-row ${horse.scratched ? 'scratched-row' : ''}"><input type="checkbox" name="reverse-horse" value="${esc(horse.number)}" ${selected.has(Number(horse.number)) ? 'checked' : ''} ${horse.scratched ? 'disabled' : ''}><strong>${esc(horse.number)}</strong><span>${esc(horse.name)}${horse.scratched ? ' · struken' : ''}</span><small>${horse.scratched ? 'EJ' : `${fmtPercent(horse.winPercent)} · ${esc(horse.driver || '–')}`}</small></label>`).join('')}</div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal="reverse-editor-modal">Avbryt</button><button type="submit" class="primary-button">Spara avdelning</button></div></form>`;
  $('#reverse-editor-modal').hidden = false;
  $('#reverse-editor-form')?.addEventListener('submit', saveReverseEditor);
}

function saveReverseEditor(event) {
  event.preventDefault();
  event.stopPropagation();
  const form = event.currentTarget;
  const raceIndex = Number(form.dataset.race);
  const picks = Array.from(form.querySelectorAll('input[name="reverse-horse"]:checked')).map((input) => Number(input.value)).sort((a, b) => a - b);
  if (!picks.length) return showToast('Välj minst en häst');
  state.reverseManualSelections[raceIndex] = picks;
  if (state.reverseCoupon?.races?.[raceIndex]) state.reverseCoupon.races[raceIndex].picks = picks;
  const round = state.round || matchingRoundForPurchased(selectedReverseSources()[0]);
  state.reverseCoupon.rows = state.reverseCoupon.races.reduce((total, race) => total * Math.max(1, race.picks.length), 1);
  state.reverseCoupon.cost = state.reverseCoupon.rows * rowPriceForGameType(round?.gameType || state.reverseCoupon.gameType);
  state.reverseCoupon.spikeCount = state.reverseCoupon.races.filter((race) => race.picks.length === 1).length;
  state.reverseCombinationOptions = reverseCombinationOptionsFor(state.reverseCoupon, round);
  $('#reverse-editor-modal').hidden = true;
  renderReverseBuilder();
}

function toggleReverseSource(id) {
  const index = state.reverseSourceIds.indexOf(id);
  if (index >= 0) state.reverseSourceIds.splice(index, 1);
  else if (state.reverseSourceIds.length >= 8) return showToast('Du kan välja högst 8 kuponger');
  else state.reverseSourceIds.push(id);
  state.reverseCoupon = null;
  state.reverseCombinationOptions = [];
  renderReverseBuilder();
}

function moveReverseCombination(direction) {
  if (state.reverseCombinationLocked) return;
  const options = state.reverseCombinationOptions || [];
  if (!options.length) return;
  state.reverseCombinationCursor = (state.reverseCombinationCursor + direction + options.length) % options.length;
  renderReversePreview();
}

function toggleReverseCombinationLock() {
  if (!state.reverseCoupon) return;
  if (state.reverseCombinationLocked) {
    state.reverseCombinationLocked = false;
    state.reverseLockedCombinationSignature = '';
  } else {
    const option = state.reverseCombinationOptions[state.reverseCombinationCursor];
    if (!option) return;
    state.reverseCombinationLocked = true;
    state.reverseLockedCombinationSignature = countPlanSignature(option.counts);
  }
  renderReversePreview();
}

function resultDetailsFor(game) {
  const details = game?.resultDetails;
  return details && typeof details === 'object' ? details : { divisions: {}, payouts: {} };
}

function resultWinnerMapFor(game, round) {
  const details = resultDetailsFor(game);
  const divisions = details.divisions || {};
  const resultMap = game?.results || {};
  return new Map(Array.from({ length: round.divisionCount || Object.keys(resultMap).length }, (_, index) => {
    const division = String(index + 1);
    const detail = divisions[division] || {};
    const winnerNumber = Number.isFinite(Number(detail.horseNumber)) ? Number(detail.horseNumber) : Number(resultMap[division]);
    return [division, winnerNumber];
  }).filter(([, winnerNumber]) => Number.isFinite(winnerNumber)));
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
    const race = round.races[index];
    const picksMarkup = picks.map((horseNumber) => { const horse = race?.horses.find((item) => Number(item.number) === Number(horseNumber)); const name = picks.length === 1 && horse?.name ? `<span class="result-coupon-horse-name">${esc(horse.name)}</span>` : ''; return `<span class="result-coupon-pick"><span class="result-coupon-number ${horseNumber === winner ? 'result-coupon-number-hit' : ''}">${esc(horseNumber)}</span>${name}</span>`; }).join('') || '–';
    return `<div class="result-coupon-row ${hit ? 'result-coupon-row-hit' : ''}"><span class="result-coupon-division">${esc(division)}</span><span class="result-coupon-picks">${picksMarkup}</span><span class="result-coupon-check">${hit ? '✓' : ''}</span></div>`;
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
  const payouts = Object.entries(details.payouts || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
  const updated = game.resultsUpdatedAt ? new Date(game.resultsUpdatedAt).toLocaleString('sv-SE') : '';
  return `<article class="result-card" data-result-game="${esc(game._id)}"><div class="result-card-header"><div><span class="eyebrow">${esc(game.gameType)} · RESULTAT</span><h3>${esc(trackLabel(game.track, game.track2))}</h3><p>${esc(dateLabel(game.date))} · ${round.divisionCount || '–'} avdelningar</p></div><button class="ghost-button result-fetch-button" data-fetch-results="${esc(game._id)}">${hasResults ? '↻ Uppdatera resultat' : 'Hämta resultat'}</button></div>${hasResults ? `<div class="result-winner-grid">${winners.map((item) => `<div class="result-winner-row"><span class="result-division">${esc(item.division)}</span><div><strong>${item.winnerNumber ? `${esc(item.winnerNumber)} ` : ''}${esc(item.horse?.name || item.detail.horseName || item.detail.horseText || 'Vinnare')}</strong>${item.horse?.driver ? `<small>${esc(item.horse.driver)}</small>` : ''}</div><span class="result-value">${resultMoney(item.detail.value, item.detail.valueText || '–')}</span></div>`).join('')}</div><div class="result-summary">${payouts.length ? payouts.map(([count, payout]) => `<div><span>Utdelning ${esc(count)} rätt</span><strong>${esc(payout.label || resultMoney(payout.amount))}</strong></div>`).join('') : '<div><span>Utdelning</span><strong>Ej hämtad</strong></div>'}${details.turnover ? `<div><span>Omsättning</span><strong>${esc(details.turnover.label || resultMoney(details.turnover.amount))}</strong></div>` : ''}${details.systemCount ? `<div><span>Antal system</span><strong>${esc(details.systemCount.label || resultMoney(details.systemCount.amount))}</strong></div>` : ''}</div><p class="result-updated">Senast uppdaterad ${esc(updated)}</p>` : '<div class="result-empty"><span>◎</span><p>Resultat är inte hämtat för den här omgången.</p></div>'}</article>`;
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
    const response = await apiFetch(`/games/${encodeURIComponent(gameId)}/results/fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: game.date, gameType: game.gameType, trackSlug: game.trackSlug || trackSlug(game.track, game.track2) }), timeoutMs: 120000 });
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
    renderRoundSavedCoupons();
    showToast('Kupongen togs bort');
  } catch (error) { showToast(error.message); }
}

async function deleteGame(gameId) {
  const game = state.games.find((item) => String(item._id) === String(gameId));
  if (!game || !window.confirm(`Vill du ta bort omgången ${game.gameType || ''} ${trackLabel(game.track, game.track2)}? Kuponger och sparade resultat försvinner också.`)) return;
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
  const date = $('#round-date').value; const type = $('#round-type').value; const track = $('#round-track').value.trim(); const track2 = $('#round-track2').value.trim(); const preview = $('#round-preview');
  if (!date || !type || !track) { preview.innerHTML = '<span>Fyll i datum, spelform och bana</span>'; return; }
  const urls = atgUrls({ date, gameType: type, track, track2 });
  preview.innerHTML = `<strong>ATG-omgång</strong><br>${esc(type)} ${esc(trackLabel(track, track2))} · ${dateLabel(date)} · ${urls.length} avdelningar<code>${esc(urls[0])}</code><small>+ ${urls.length - 1} avdelningslänkar byggs automatiskt</small>`;
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
    const estimateMs = Math.max(45000, divisionCount(config.gameType) * 6500);
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
  const response = await apiFetch('/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `${config.gameType} ${trackLabel(config.track, config.track2)}`, date: config.date, track: config.track, track2: config.track2, trackSlug: trackSlug(config.track, config.track2), gameType: config.gameType, horseText: '' }) });
  if (!response.ok) throw new Error(await response.text() || 'Kunde inte skapa omgång');
  return response.json();
}

async function importRound(config, gameId, manual = false) {
  const urls = atgUrls(config); const statuses = urls.map((_, i) => ({ division: i + 1, status: 'pending' }));
  renderImportStatus(statuses, manual ? 'Skapar en tom omgång för manuell redigering' : `Hämtar ${config.gameType} ${trackLabel(config.track, config.track2)}…`);
  if (manual) return normalizeGame({ _id: gameId, title: `${config.gameType} ${trackLabel(config.track, config.track2)}`, ...config, parsedHorseInfo: { expectedDivisions: urls.length, divisions: [] } });
  statuses[0].status = 'loading'; renderImportStatus(statuses, `Hämtar ${config.gameType} ${trackLabel(config.track, config.track2)}…`);
  const response = await apiFetch('/rounds/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, ...config }), timeoutMs: 120000 });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 207) {
    if (response.status === 404) {
      throw new Error(activeApiRoot === RENDER_API_ROOT
        ? 'Render kör en äldre Trav API-version utan import-routen. Kör D:\\Bigplus\\PUSHA-INLEV-NETLIFY.cmd och försök igen.'
        : 'Den lokala Trav API-versionen saknar import-routen. Starta om D:\\Bigplus\\STARTA-BIGPLUS-AKTIV.cmd.');
    }
    throw new Error(payload.error || `ATG-importen svarade ${response.status}`);
  }
  const errors = payload.errors || [];
  statuses.forEach((item) => { const error = errors.find((entry) => entry.division === item.division); item.status = error ? 'error' : 'done'; item.count = payload.round?.races?.find((race) => race.division === item.division)?.horses?.length || 0; item.message = error?.message; });
  renderImportStatus(statuses, errors.length ? 'Omgång delvis importerad' : '✓ Omgång importerad');
  return payload.round ? payload.round : normalizeGame({ _id: gameId, ...config, parsedHorseInfo: { divisions: [] } });
}

async function submitCreate(event, manual = false) {
  event?.preventDefault();
  const config = { date: $('#round-date').value, gameType: $('#round-type').value, track: $('#round-track').value.trim(), track2: $('#round-track2').value.trim() };
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

function renderRoundHeader() { const round = state.round; const primaryTrackSlug = trackSlug(round.track); const primaryTrack = trackLabel(round.track, round.track2) || 'Bana saknas'; $('#round-header').innerHTML = `<div class="round-header"><div class="round-title"><div class="track-orb">⌁</div><div><div class="eyebrow">AKTUELL OMGÅNG</div><h1>${esc(round.gameType)} – ${esc(primaryTrack)}</h1><p>${esc(dateLabel(round.date))} · ${round.divisionCount} avdelningar · Radpris ${money(round.rowPrice)}</p><div class="round-track-context"><span>BANPROFIL</span><strong>${esc(primaryTrack)}</strong><a href="./banor.html?track=${encodeURIComponent(primaryTrackSlug)}">Baninfo ↗</a></div></div></div><div class="header-actions"><button class="primary-button" id="header-edit">✎ Redigera omgång</button><button class="ghost-button" id="refresh-tipsters">↻ Uppdatera tipsters</button><a class="ghost-button" href="${esc(atgUrls(round)[0] || '#')}" target="_blank" rel="noreferrer">Öppna ATG ↗</a></div></div>`; }

function raceFavorite(race) { return [...(race.horses || [])].filter((horse) => !horse.scratched).sort((a, b) => (b.winPercent ?? -1) - (a.winPercent ?? -1))[0]; }
function renderRacesLegacyOriginal() {
  const races = state.round?.races || []; const count = state.round?.divisionCount || 0;
  if (!races.length) { $('#races-list').innerHTML = `<div class="empty-state"><div class="empty-icon">◎</div><h3>Ingen startlista i denna omgång</h3><p>ATG-importen kan ha misslyckats eller så är omgången skapad manuellt. Redigera omgången för att lägga in hästar.</p><button class="secondary-button" id="empty-edit">Redigera omgång</button></div>`; return; }
  $('#races-list').innerHTML = races.map((race) => { const favorite = raceFavorite(race); const horses = [...race.horses].sort((a, b) => (a.number || 0) - (b.number || 0)); return `<article class="race-card" data-division="${race.division}"><div class="race-summary"><div class="race-number">${race.division}</div><div><h3>Avd ${race.division}</h3><p>${horses.length} hästar · ${favorite ? `Favorit ${favorite.number} ${esc(favorite.name)}` : 'ingen favorit'}</p></div><div class="race-favorite">Favorit<strong>${favorite ? `${favorite.number} · ${fmtPercent(favorite.winPercent)}` : '–'}</strong></div></div><div class="race-body"><div class="horse-row header-row"><span>#</span><span>Häst</span><span>Kusk</span><span>%</span><span>Odds</span></div>${horses.slice(0, 30).map((horse) => `<div class="horse-row ${favorite?.number === horse.number ? 'favorite-row' : ''}"><span class="horse-num">${favorite?.number === horse.number ? '<span class="star">★</span>' : ''}${esc(horse.number)}</span><span class="horse-name">${esc(horse.name)}${horse.scratched ? ' · struken' : ''}</span><span class="horse-meta">${esc(horse.driver || horse.trainer || '–')}</span><span class="horse-percent">${fmtPercent(horse.winPercent)}</span><span class="horse-odds">${horse.winOdds ?? '–'}</span></div>`).join('')}</div></article>`; }).join('') + (races.length < count ? `<div class="partial-note">${races.length} av ${count} avdelningar importerade · använd Redigera för att komplettera.</div>` : ''); }

function rowsFor(coupon) { return coupon.selections.reduce((total, picks) => total * Math.max(1, picks.length), 1); }
function isV85Round(round = state.round) { return String(round?.gameType || '').toUpperCase() === 'V85'; }
function stakeMultiplier(scope = 'together', round = state.round) { if (!isV85Round(round)) return 1; const percent = scope === 'reverse' ? state.reverseStakePercent : state.togetherStakePercent; return Math.max(0.01, (Number(percent) || 100) / 100); }
function baseBudget() { return Math.max(1, Number($('#share-price')?.value || 20)) * Math.max(1, Number($('#share-count')?.value || 50)); }
function budget() { const customStakePrice = activeStakePrice('together'); return customStakePrice !== null ? customStakePrice * stakeMultiplier('together') : baseBudget() * stakeMultiplier('together'); }
function displayedTogetherBudget() { return budget(); }
function ensureTogetherStakeControl() {
  const priceSetting = $('#share-price')?.closest('.setting');
  const shouldShow = isV85Round();
  let control = $('#together-stake-setting');
  if (shouldShow && priceSetting && !control) { priceSetting.insertAdjacentHTML('afterend', '<div class="setting stake-setting" id="together-stake-setting"><label for="together-stake-percent">Insats V85</label><select id="together-stake-percent"><option value="100">Normal insats</option><option value="30">30% insats</option><option value="50">50% insats</option><option value="70">70% insats</option></select><label class="stake-price-field" id="together-stake-price-wrap" for="together-stake-price">Normalpris per kupong<input id="together-stake-price" type="number" min="1" step="1" placeholder="Pris före sänkt insats"></label></div>'); control = $('#together-stake-setting'); }
  if (!shouldShow && control) { control.remove(); control = null; }
  if (control) { const stake = $('#together-stake-percent'); if (stake) stake.value = String(state.togetherStakePercent); const stakePrice = $('#together-stake-price'); if (stakePrice && document.activeElement !== stakePrice) stakePrice.value = state.togetherStakePrice ?? ''; const stakePriceWrap = $('#together-stake-price-wrap'); if (stakePriceWrap) stakePriceWrap.hidden = Number(state.togetherStakePercent) === 100; }
}
function ensureTogetherCascadeButton() {
  const grid = $('#together-preset-options .together-preset-grid');
  if (!grid || grid.querySelector('[data-together-cascade]')) return;
  grid.insertAdjacentHTML('beforeend', '<button type="button" class="together-preset-option cascade-preset-option" data-together-cascade="safety" aria-pressed="false"><strong>Säkerhetsförslag</strong><small>3 kuponger · bred start eller bred avslutning</small></button>');
}
function hasTogetherPreset() { return state.togetherPreset !== null && state.togetherPreset !== undefined && Number.isFinite(Number(state.togetherPreset)); }
function requestedSpikes() { if (hasTogetherPreset()) return Math.max(1, Math.min(4, Number(state.togetherPreset))); if (state.together2) return 2; const selected = $('#spike-count')?.querySelector('.selected'); const value = Number(selected?.dataset.spikes ?? state.manualSpikeCount ?? state.spikeCount ?? 2); return Math.max(0, Math.min(5, Number.isFinite(value) ? value : 2)); }
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
    let nodes = 0;
    const nodeLimit = 50000;
    function visit(index, product, counts) {
      if (++nodes > nodeLimit) return;
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
      const allowedCounts = Number.isFinite(fixedCounts[index]) ? [Math.max(1, Math.min(limits[index], Number(fixedCounts[index])))] : Array.from({ length: limits[index] }, (_, offset) => ((offset + (state.shuffleSeed + index) % limits[index]) % limits[index]) + 1).sort((a, b) => Math.abs(Math.log(Math.max(1, maxRows / product) ** (1 / Math.max(1, races.length - index)) / a)) - Math.abs(Math.log(Math.max(1, maxRows / product) ** (1 / Math.max(1, races.length - index)) / b)));
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
  let nodes = 0;
  const nodeLimit = 50000;
  const suffixMax = Array(limits.length + 1).fill(1);
  for (let index = limits.length - 1; index >= 0; index -= 1) suffixMax[index] = suffixMax[index + 1] * limits[index];
  function visit(index, product, counts) {
    if (++nodes > nodeLimit) return;
    const remaining = limits.length - index;
    const singlesSoFar = counts.slice(0, index).filter((count) => count === 1).length;
    if (desiredSpikes !== null && (singlesSoFar > desiredSpikes || singlesSoFar + remaining < desiredSpikes)) return;
    if (product > maxRows || product * suffixMax[index] < minRows) return;
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
    const ideal = Math.max(1, targetRows / Math.max(1, product)) ** (1 / Math.max(1, remaining));
    const orderedOptions = [...options[index]].sort((a, b) => Math.abs(Math.log(a / ideal)) - Math.abs(Math.log(b / ideal)));
    for (const count of orderedOptions) {
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
  const raceSignature = races.map((race) => `${race.division}:${race.horses.filter((horse) => !horse.scratched).length}`).join('|');
  const cacheKey = JSON.stringify([state.round?.id || '', raceSignature, targetRows, desiredSpikes, currentPlan, couponIndex, rowPrice, state.shuffleSeed]);
  const cached = state.combinationPlanCache.get(cacheKey);
  if (cached) return cached.map((option) => ({ ...option, counts: [...option.counts] }));
  const minRows = Math.max(1, targetRows - Math.floor(500 / Math.max(1, rowPrice)));
  const maxRows = Math.max(minRows, targetRows + Math.floor(250 / Math.max(1, rowPrice)));
  const limits = races.map((race) => Math.min(10, Math.max(1, race.horses.filter((horse) => !horse.scratched).length)));
  const suffixMax = Array(limits.length + 1).fill(1);
  for (let index = limits.length - 1; index >= 0; index -= 1) suffixMax[index] = suffixMax[index + 1] * limits[index];
  const candidates = [];
  const seen = new Set();
  let nodes = 0;
  const nodeLimit = 50000;
  const candidateLimit = 90;
  const visit = (index, product, singles, counts) => {
    if (++nodes > nodeLimit || candidates.length >= candidateLimit) return;
    const remaining = limits.length - index;
    if (desiredSpikes !== null && (singles > desiredSpikes || singles + remaining < desiredSpikes)) return;
    if (product > maxRows || product * suffixMax[index] < minRows) return;
    if (index >= limits.length) {
      if (product < minRows || product > maxRows || (desiredSpikes !== null && singles !== desiredSpikes)) return;
      // En kombination är samma även om antalen ligger i en annan
      // avdelningsordning, till exempel 1×1×2 och 2×1×1.
      const key = countPlanSignature(counts);
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
      if (nodes > nodeLimit || candidates.length >= candidateLimit) return;
    }
  };
  visit(0, 1, 0, []);
  if (!candidates.length) {
    const fallback = [{ counts: [...currentPlan], rows: countPlanProduct(currentPlan) }];
    state.combinationPlanCache.set(cacheKey, fallback.map((option) => ({ ...option, counts: [...option.counts] })));
    return fallback;
  }
  const selected = [];
  const addCandidate = (candidate) => {
    if (!selected.some((item) => countPlanSignature(item.counts) === countPlanSignature(candidate.counts))) selected.push(candidate);
  };
  addCandidate({ counts: [...currentPlan], rows: countPlanProduct(currentPlan), distance: Math.abs(countPlanProduct(currentPlan) - targetRows), difference: 0 });
  const isSelected = (candidate) => selected.some((item) => countPlanSignature(item.counts) === countPlanSignature(candidate.counts));
  const chooseFrom = (pool, amount) => {
    while (pool.some((candidate) => !isSelected(candidate)) && amount > 0 && selected.length < 30) {
      const next = pool
        .filter((candidate) => !isSelected(candidate))
        .sort((a, b) => {
          const aDiversity = selected.length ? Math.min(...selected.map((item) => countPlanDistance(item.counts, a.counts))) : 0;
          const bDiversity = selected.length ? Math.min(...selected.map((item) => countPlanDistance(item.counts, b.counts))) : 0;
          return (bDiversity * 40 - b.distance) - (aDiversity * 40 - a.distance);
        })[0];
      if (!next) break;
      addCandidate(next);
      amount -= 1;
    }
  };
  const nearTarget = candidates.filter((candidate) => candidate.rows <= targetRows);
  const aboveTarget = candidates.filter((candidate) => candidate.rows > targetRows && candidate.rows <= maxRows);
  const nearSelected = selected.filter((candidate) => candidate.rows <= targetRows).length;
  const aboveSelected = selected.filter((candidate) => candidate.rows > targetRows).length;
  chooseFrom(nearTarget, Math.max(0, 20 - nearSelected));
  chooseFrom(aboveTarget, Math.max(0, 10 - aboveSelected));
  chooseFrom(candidates, 30 - selected.length);
  state.combinationPlanCache.set(cacheKey, selected.map((option) => ({ ...option, counts: [...option.counts] })));
  if (state.combinationPlanCache.size > 80) state.combinationPlanCache.delete(state.combinationPlanCache.keys().next().value);
  return selected;
}

function cascadeCountLimits(races) {
  return races.map((race) => Math.max(1, race.horses.filter((horse) => !horse.scratched).length));
}

function cascadeSpikeIndexes(limits, desiredSpikes, couponIndex) {
  const available = limits.map((limit, index) => ({ limit, index })).filter((item) => item.limit > 0);
  if (!desiredSpikes || !available.length) return new Set();
  const ordered = couponIndex === 1
    ? [...available].sort((a, b) => b.index - a.index)
    : couponIndex === 2
      ? [...available].sort((a, b) => a.index - b.index)
      : [...available].sort((a, b) => ((a.index + couponIndex) % 2) - ((b.index + couponIndex) % 2) || a.index - b.index);
  return new Set(ordered.slice(0, Math.min(desiredSpikes, ordered.length)).map((item) => item.index));
}

function rebalanceCascadeCounts(limits, targetRows, weights, lockedSingles = new Set(), minimums = {}) {
  const counts = limits.map((limit, index) => lockedSingles.has(index) ? 1 : Math.max(1, Math.min(limit, Math.round(1 + (limit - 1) * (weights[index] ?? 0.5)))));
  const minCounts = limits.map((limit, index) => lockedSingles.has(index) ? 1 : Math.max(1, Math.min(limit, Number(minimums[index] || 1))));
  const target = Math.max(1, Number(targetRows) || 1);
  let guard = 0;
  while (countPlanProduct(counts) < target && guard++ < 5000) {
    const candidates = limits.map((limit, index) => ({ index, next: countPlanProduct(counts) / Math.max(1, counts[index]) * (counts[index] + 1), weight: weights[index] ?? 0 })).filter((item) => counts[item.index] < limit && !lockedSingles.has(item.index));
    if (!candidates.length) break;
    candidates.sort((a, b) => {
      const aUnder = a.next <= target ? 1 : 0;
      const bUnder = b.next <= target ? 1 : 0;
      return (bUnder - aUnder) || (Math.abs(target - a.next) - Math.abs(target - b.next)) || (b.weight - a.weight);
    });
    counts[candidates[0].index] += 1;
  }
  guard = 0;
  while (countPlanProduct(counts) > target && guard++ < 5000) {
    const candidates = limits.map((limit, index) => ({ index, next: countPlanProduct(counts) / Math.max(1, counts[index]) * (counts[index] - 1), weight: weights[index] ?? 0 })).filter((item) => counts[item.index] > minCounts[item.index] && !lockedSingles.has(item.index));
    if (!candidates.length) break;
    candidates.sort((a, b) => (Math.abs(target - a.next) - Math.abs(target - b.next)) || (a.weight - b.weight));
    counts[candidates[0].index] -= 1;
  }
  return counts;
}

function buildCascadeCountPlans(races, targetRows, desiredSpikes, fixedCounts = []) {
  const limits = cascadeCountLimits(races);
  const raceCount = Math.max(1, limits.length);
  const descending = limits.map((_, index) => 1 - (index / Math.max(1, raceCount - 1)) * 0.88);
  const ascending = [...descending].reverse();
  const mixed = limits.map((_, index) => [0.78, 0.42, 0.68, 0.35, 0.62, 0.48, 0.72, 0.3][index % 8]);
  const profiles = [mixed, descending, ascending];
  return profiles.map((weights, couponIndex) => {
    const spikes = cascadeSpikeIndexes(limits, desiredSpikes, couponIndex);
    const minimums = {};
    if (couponIndex === 1 && limits.length) {
      minimums[0] = limits[0];
      if (limits.length > 1) minimums[1] = Math.min(limits[1], Math.max(2, Math.ceil(limits[1] * 0.55)));
    }
    if (couponIndex === 2 && limits.length) {
      minimums[Math.max(0, limits.length - 2)] = Math.min(limits[Math.max(0, limits.length - 2)], Math.max(2, Math.ceil(limits[Math.max(0, limits.length - 2)] * 0.7)));
      minimums[limits.length - 1] = limits[limits.length - 1];
    }
    const plan = rebalanceCascadeCounts(limits, targetRows, weights, spikes, minimums);
    Object.entries(fixedCounts[couponIndex] || {}).forEach(([raceIndex, count]) => { plan[Number(raceIndex)] = Math.max(1, Math.min(limits[Number(raceIndex)] || 1, Number(count) || 1)); });
    return plan;
  });
}

function resetCombinationState() {
  state.combinationLocks = new Set();
  state.lockedCombinationPatterns = new Map();
  state.selectedPlanIndexes = [];
  state.pendingCombinationIndexes = [];
  state.combinationCursors = [];
  state.combinationOptions = [];
  state.combinationPlanCache.clear();
}

function clearPendingCombinationChoices() {
  state.pendingCombinationIndexes = state.pendingCombinationIndexes.map(() => null);
}

function countPlanSignature(counts) {
  return [...counts].map((value) => Number(value || 1)).sort((a, b) => a - b).join('x');
}

function spikeIndexes(plan) { return plan.reduce((indexes, count, index) => { if (Number(count) === 1) indexes.push(index); return indexes; }, []); }
function spikeOverlap(first, second) { const other = new Set(spikeIndexes(second)); return spikeIndexes(first).reduce((total, index) => total + (other.has(index) ? 1 : 0), 0); }
function permuteCountPlanForRaces(races, signature, seed = 0, avoidPlans = [], fixedCounts = {}, fallbackPlan = []) {
  const values = String(signature || '').split('x').map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const limits = races.map((race) => Math.min(10, Math.max(1, race.horses.filter((horse) => !horse.scratched).length)));
  const previousPlans = Array.isArray(avoidPlans[0]) ? avoidPlans : (avoidPlans.length ? [avoidPlans] : []);
  const plans = [];
  const visit = (index, remaining, plan) => {
    if (plans.length >= 2000) return;
    if (index >= limits.length) {
      if (!remaining.length && countPlanSignature(plan) === signature) plans.push([...plan]);
      return;
    }
    const lockedCount = Number(fixedCounts[index]);
    const candidates = [...new Set(remaining.filter((value) => value <= limits[index] && (!Number.isFinite(lockedCount) || value === lockedCount)))].sort((a, b) => ((a + index + seed) % 11) - ((b + index + seed) % 11));
    for (const value of candidates) {
      const position = remaining.indexOf(value);
      visit(index + 1, [...remaining.slice(0, position), ...remaining.slice(position + 1)], [...plan, value]);
      if (plans.length >= 2000) return;
    }
  };
  visit(0, values, []);
  if (!plans.length) return [...fallbackPlan];
  const nonExact = plans.filter((plan) => !previousPlans.some((previous) => sameCountPlan(plan, previous)));
  const pool = nonExact.length ? nonExact : plans;
  const minOverlap = Math.min(...pool.map((plan) => previousPlans.length ? Math.max(...previousPlans.map((previous) => spikeOverlap(plan, previous))) : 0));
  const best = pool.filter((plan) => (previousPlans.length ? Math.max(...previousPlans.map((previous) => spikeOverlap(plan, previous))) : 0) === minOverlap);
  return best[Math.abs(Math.floor(seed)) % Math.max(1, best.length)] || pool[0] || [...fallbackPlan];
}

function tipsterHorseScore(race, horse, couponIndex = 0) {
  const buzzRace = state.tipsterBuzz?.races?.find((item) => Number(item.division) === Number(race.division));
  const buzzHorse = buzzRace?.horses?.find((item) => Number(item.number) === Number(horse.number));
  const score = Number(buzzHorse?.buzz?.score || 0);
  if (!score) return Number(horse.winPercent || 0);
  const factors = [0.4, 0.7, 1, 0.85];
  const adjustment = Math.max(-8, Math.min(8, (score - 50) / 6)) * (factors[couponIndex] ?? 0.7);
  return Number(horse.winPercent || 0) + adjustment;
}

function chooseCouponHorses(race, count, couponIndex, previousSelections = []) {
  const ranked = [...race.horses].filter((horse) => !horse.scratched).sort((a, b) => tipsterHorseScore(race, b, couponIndex) - tipsterHorseScore(race, a, couponIndex) || (b.winPercent ?? 0) - (a.winPercent ?? 0));
  if (!ranked.length || count < 1) return [];
  const couponTotal = Math.max(1, state.couponCount || 1);
  const coveragePool = ranked.slice(0, Math.min(ranked.length, Math.max(3, couponTotal)));
  const lowest = [...ranked].sort((a, b) => (a.winPercent ?? 0) - (b.winPercent ?? 0));
  const alreadyCovered = new Set(previousSelections.flat().map((value) => Number(value)));
  const selected = [];
  const add = (horse) => {
    if (horse && !selected.some((item) => item.number === horse.number)) selected.push(horse);
  };
  const addNew = (horse) => {
    if (horse && !alreadyCovered.has(Number(horse.number))) add(horse);
  };

  // En spik ska inte kopieras till alla kuponger. Kupong 1 tar favoriten,
  // nästa kupong täcker andrahandsfavoriten och följande kuponger roterar
  // genom topphästarna så att kupongerna kompletterar varandra.
  if (count === 1) {
    add(raceFavorite(race) || coveragePool[0]);
  } else {
    const offset = (couponIndex + (state.shuffleSeed || 0)) % coveragePool.length;
    add(raceFavorite(race) || coveragePool[0]);
    if (selected.length < count) addNew(coveragePool[offset]);
    if (selected.length < count) addNew(coveragePool[(offset + 1) % coveragePool.length]);

    // Sprid de fyra lägst spelade hästarna över kupongerna när det finns plats.
    // På så sätt får skrällkupongen verklig täckning utan att alla kuponger blir identiska.
    const lowStart = (couponIndex + (state.shuffleSeed || 0)) % Math.max(1, Math.min(4, lowest.length));
    for (let index = 0; index < Math.min(4, lowest.length); index += 1) {
      if (selected.length >= count) break;
      addNew(lowest[(lowStart + index) % lowest.length]);
    }
  }
  for (const horse of ranked) {
    if (selected.length >= count) break;
    addNew(horse);
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
  const cascadeActive = state.togetherCascadePreset === 'safety';
  const names = strategies(cascadeActive ? 3 : state.couponCount);
  if (cascadeActive) {
    names[0] = { ...names[0], name: 'Blandad', note: 'Blandad täckning över hela omgången' };
    names[1] = { ...names[1], name: 'Bred start', note: 'Bred start · fler hästar tidigt, svårare avslutning' };
    names[2] = { ...names[2], name: 'Bred avslutning', note: 'Bred avslutning · smalare start, fler hästar på slutet' };
  }
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
  const planCacheKey = JSON.stringify([state.round?.id || '', target, desiredSpikes, cascadeActive ? 'safety' : state.couponCount, state.shuffleSeed, raceSignature, fixedCounts]);
  let countPlans = state.countPlanCache.get(planCacheKey)?.map((plan) => [...plan]);
  if (!countPlans) {
    if (cascadeActive) {
      countPlans = buildCascadeCountPlans(races, targetRows, desiredSpikes, fixedCounts);
    } else {
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
    }
    state.countPlanCache.set(planCacheKey, countPlans.map((plan) => [...plan]));
    if (state.countPlanCache.size > 40) state.countPlanCache.delete(state.countPlanCache.keys().next().value);
  }
  const finalPlans = [];
  countPlans = countPlans.map((plan, couponIndex) => {
    const selectedIndex = state.selectedPlanIndexes[couponIndex];
    const option = state.combinationOptions[couponIndex]?.[selectedIndex];
    const lockedSignature = state.lockedCombinationPatterns.get(couponIndex);
    const candidate = state.combinationLocks.has(couponIndex) && lockedSignature ? lockedSignature : (option?.counts ? countPlanSignature(option.counts) : countPlanSignature(plan));
    const current = option?.counts ? [...option.counts] : [...plan];
    const hasChosenPattern = Boolean((state.combinationLocks.has(couponIndex) && lockedSignature) || option?.counts);
    const finalPlan = cascadeActive && !state.combinationLocks.has(couponIndex)
      ? current
      : couponIndex === 0 && !hasChosenPattern
      ? current
      : permuteCountPlanForRaces(races, candidate, state.shuffleSeed + couponIndex, finalPlans, fixedCounts[couponIndex], current);
    finalPlans.push(finalPlan);
    return finalPlan;
  });
  const baseCounts = countPlans[0] || races.map(() => 1);
  const builtSelections = [];
  state.coupons = names.map((strategy, couponIndex) => {
    const plan = finalPlans[couponIndex] || countPlans[couponIndex] || baseCounts;
    const selections = races.map((race, raceIndex) => chooseCouponHorses(race, plan[raceIndex] || 1, couponIndex, builtSelections.map((previous) => previous[raceIndex] || [])));
    builtSelections.push(selections);
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
  const previousCursors = state.combinationCursors;
  state.combinationOptions = state.coupons.map((coupon, couponIndex) => findNearBudgetPlans(races, targetRows, desiredSpikes, coupon.selections.map((picks) => picks.length || 1), couponIndex, rowPrice));
  state.combinationCursors = state.combinationOptions.map((options, couponIndex) => Math.min(Math.max(0, previousCursors[couponIndex] ?? 0), Math.max(0, options.length - 1)));
  state.pendingCombinationIndexes = state.combinationOptions.map((options, couponIndex) => {
    const pending = state.pendingCombinationIndexes[couponIndex];
    return Number.isInteger(pending) && pending >= 0 && pending < options.length ? pending : null;
  });
  state.selectedPlanIndexes = [];
}

function raceSecondFavorite(race) {
  return [...(race.horses || [])].filter((horse) => !horse.scratched).sort((a, b) => (b.winPercent ?? -1) - (a.winPercent ?? -1))[1];
}

function horseBadgeClass(race, horse, winnerNumber = null) {
  const percent = number(horse.winPercent);
  const classes = [];
  if (raceFavorite(race)?.number === horse.number) classes.push('favorite-chip');
  if (percent !== null && percent < 5) classes.push('low-win-chip');
  else if (raceSecondFavorite(race)?.number === horse.number) classes.push('second-favorite-chip');
  if (trendIsSignificant(horse)) classes.push('trend-hot-chip');
  if (Number.isFinite(winnerNumber) && Number(horse.number) === Number(winnerNumber)) classes.push('winner-chip');
  return classes.join(' ');
}

function tipsterBuzzScoreFor(race, horse) {
  const buzzRace = state.tipsterBuzz?.races?.find((item) => Number(item.division) === Number(race?.division));
  const buzzHorse = buzzRace?.horses?.find((item) => Number(item.number) === Number(horse?.number));
  const score = Number(buzzHorse?.buzz?.score || 0);
  return Number.isFinite(score) ? Math.round(score) : 0;
}

function couponPicksMarkup(coupon, race, raceIndex, winnerNumber = null) {
  const picks = coupon.selections[raceIndex] || [];
  const horses = picks.map((numberValue) => race.horses.find((horse) => Number(horse.number) === Number(numberValue))).filter(Boolean);
  if (!horses.length) return '<span class="empty-picks">–</span>';
  if (horses.length === 1) {
    const horse = horses[0];
    return `<span class="spike-pick"><span class="number-ball ${horseBadgeClass(race, horse, winnerNumber)}">${esc(horse.number)}</span><span class="spike-name">${esc(horse.name)}</span><strong>${fmtPercent(horse.winPercent)}</strong></span>`;
  }
  return `<span class="pick-list">${horses.map((horse) => `<span class="number-chip ${horseBadgeClass(race, horse, winnerNumber)}">${esc(horse.number)}</span>`).join('')}</span>`;
}

function combinationPickerMarkup(couponIndex) {
  const rowPrice = state.round?.rowPrice || 1;
  const options = state.combinationOptions[couponIndex] || [];
  if (!options.length) return '';
  const locked = state.combinationLocks.has(couponIndex);
  const lockedSignature = state.lockedCombinationPatterns.get(couponIndex);
  const lockedIndex = lockedSignature ? options.findIndex((option) => countPlanSignature(option.counts) === lockedSignature) : -1;
  const cursor = lockedIndex >= 0 ? lockedIndex : Math.min(Math.max(0, state.combinationCursors[couponIndex] ?? 0), options.length - 1);
  const pending = state.pendingCombinationIndexes[couponIndex];
  const option = options[cursor];
  const displayCounts = (locked && lockedSignature ? lockedSignature.split('x').map(Number) : option.counts).slice().sort((a, b) => a - b);
  const cost = countPlanProduct(displayCounts) * rowPrice;
  const selected = locked || pending === cursor;
  const sectionClass = locked ? ' locked' : '';
  const markerTitle = locked ? 'Lås upp denna kombination' : 'Lås denna kombination när du slumpar kupongerna';
  return `<section class="combination-picker${sectionClass}" data-combination-picker="${couponIndex}"><div class="combination-slider" data-combination-slider="${couponIndex}"><button type="button" class="combination-arrow" data-combination-prev="${couponIndex}" aria-label="Föregående kombination"${locked ? ' disabled' : ''}>‹</button><div class="combination-slide-window"><div class="combination-option combination-slide${locked ? ' locked' : ''} ${selected ? 'selected' : ''}"><div class="combination-option-copy"><span class="combination-pattern">${displayCounts.join('x')}</span><strong>${money(cost)}</strong></div><button type="button" class="combination-select-marker ${selected ? 'selected' : ''}${locked ? ' locked' : ''}" data-combination-select="${couponIndex}" aria-pressed="${locked}" title="${markerTitle}">${locked ? '●' : '○'}</button></div></div><button type="button" class="combination-arrow" data-combination-next="${couponIndex}" aria-label="Nästa kombination"${locked ? ' disabled' : ''}>›</button></div><div class="combination-control-row"><span>${locked ? 'Låst kombination' : `${cursor + 1} / ${options.length}`}</span></div></section>`;
}

function moveCombinationCursor(couponIndex, direction) {
  if (state.combinationLocks.has(couponIndex)) return;
  const options = state.combinationOptions[couponIndex] || [];
  if (!options.length) return;
  const current = state.combinationCursors[couponIndex] ?? 0;
  state.combinationCursors[couponIndex] = (current + direction + options.length) % options.length;
  renderCoupons();
}

function buildComplementCoupon(coupons) {
  const races = state.round?.races || [];
  const selections = races.map((race, raceIndex) => {
    const covered = new Set(coupons.flatMap((coupon) => coupon.selections?.[raceIndex] || []).map(Number));
    return race.horses.filter((horse) => !horse.scratched && !covered.has(Number(horse.number))).map((horse) => Number(horse.number));
  });
  const rows = selections.reduce((total, picks) => total * Math.max(1, picks.length), 1);
  return { name: 'Komplement', note: 'Hästar som inte finns på de andra kupongerna', selections, rows, cost: rows * (state.round?.rowPrice || 1), spikeCount: selections.filter((picks) => picks.length === 1).length, variation: 100, complement: true };
}

function displayedTogetherCoupons() { return [...state.coupons, ...(state.complementCoupon ? [state.complementCoupon] : [])]; }

function loadFocusedTogetherPackages() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FOCUSED_TOGETHER_STORAGE_KEY) || '{}');
    state.focusedTogetherPackages = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch (error) { state.focusedTogetherPackages = {}; }
}

function saveFocusedTogetherPackages() {
  try { window.localStorage.setItem(FOCUSED_TOGETHER_STORAGE_KEY, JSON.stringify(state.focusedTogetherPackages)); } catch (error) { console.warn('Kunde inte spara fokuspaket', error); }
}

function toggleFocusedTogether() {
  if (!state.round?.id || !state.coupons.length) return showToast('Skapa kuponger först');
  const key = String(state.round.id);
  if (state.focusedTogetherPackages[key]) {
    delete state.focusedTogetherPackages[key];
    showToast('Kupongerna togs bort från fokus');
  } else {
    state.focusedTogetherPackages[key] = { roundId: key, gameType: state.round.gameType, track: trackLabel(state.round.track, state.round.track2), date: state.round.date, savedAt: new Date().toISOString(), coupons: state.coupons.map((coupon) => ({ name: coupon.name, cost: coupon.cost, rows: coupon.rows, spikeCount: coupon.spikeCount, selections: coupon.selections.map((picks) => [...picks]) })) };
    showToast('Kupongerna sparades i fokus');
  }
  saveFocusedTogetherPackages();
  renderCoupons();
}

function removeFocusedTogether() {
  if (!state.round?.id) return;
  delete state.focusedTogetherPackages[String(state.round.id)];
  saveFocusedTogetherPackages();
  renderCoupons();
  showToast('Kupongerna togs bort från fokus');
}

function focusedTogetherMarkup() {
  const focused = state.round?.id ? state.focusedTogetherPackages[String(state.round.id)] : null;
  if (!focused) return '<button type="button" class="outline-button focus-together-button" data-focus-together>☆ Spara i fokus</button>';
  const cards = (focused.coupons || []).map((coupon, couponIndex) => `<article class="focused-coupon-card"><div><strong>Kupong ${couponIndex + 1} · ${esc(coupon.name)}</strong><span>${money(coupon.cost)} · ${Number(coupon.rows || 0).toLocaleString('sv-SE')} rader</span></div><code>${(coupon.selections || []).map((picks) => picks.join('x') || '–').join(' · ')}</code></article>`).join('');
  return `<div class="focused-together-block"><div class="focused-together-heading"><div><span class="eyebrow">I FOKUS</span><strong>${esc(focused.gameType)} · ${esc(focused.track)}</strong><small>${esc(dateLabel(focused.date))} · sparad tills du tar bort den</small></div><button type="button" class="outline-button" data-focus-remove>Ta bort</button></div><div class="focused-coupon-list">${cards}</div></div><button type="button" class="outline-button focus-together-button" data-focus-together aria-pressed="true">★ Uppdatera fokus</button>`;
}

function togetherCouponCardMarkup(coupon, couponIndex, complement = false) {
  const cardClass = complement ? ' complement-coupon-card' : '';
  const rows = Number(coupon.rows || 0).toLocaleString('sv-SE');
  const races = (state.round?.races || []).map((race, raceIndex) => `<div class="coupon-race"${complement ? '' : ` data-edit-coupon="${couponIndex}" data-edit-division="${raceIndex}"`}><span class="race-label">${race.division}</span>${couponPicksMarkup(coupon, race, raceIndex)}${complement ? '' : `<button class="lock ${state.locks.has(`${couponIndex}:${raceIndex}`) ? 'locked' : ''}" data-lock-coupon="${couponIndex}" data-lock-division="${raceIndex}" title="Lås avdelning">${state.locks.has(`${couponIndex}:${raceIndex}`) ? '🔒' : '🔓'}</button>`}</div>`).join('');
  const combination = complement ? '' : combinationPickerMarkup(couponIndex);
  return `<article class="coupon-card unified-coupon-card${cardClass}"><div class="coupon-top"><span><i class="coupon-index-badge">${couponIndex + 1}</i><span class="coupon-title">${esc(coupon.name)}</span></span><span class="coupon-cost">${money(coupon.cost)}</span></div><p class="strategy-note">${esc(coupon.note)}</p><div class="coupon-stats"><span>▥ ${rows} rader</span><span>★ ${coupon.spikeCount ?? 0} spikar</span></div>${races}${combination}<div class="coupon-footer"><span>${rows} rader · ${coupon.spikeCount ?? 0} spikar</span>${complement ? '<span>Kompletterar alla kuponger</span>' : `<span>Variation ${coupon.variation}%</span>`}</div></article>`;
}

function renderCoupons() {
  ensureTogetherStakeControl();
  ensureTogetherCascadeButton();
  state.complementCoupon = buildComplementCoupon(state.coupons);
  const visibleCoupons = displayedTogetherCoupons();
  const visibleTotal = visibleCoupons.reduce((sum, coupon) => sum + coupon.cost, 0);
  $('#budget-each').textContent = money(displayedTogetherBudget());
  $('#budget-total').textContent = money(visibleTotal);
  $$('#coupon-count button').forEach((button) => button.classList.toggle('selected', Number(button.dataset.count) === state.couponCount));
  $$('#together-preset-options [data-together-preset]').forEach((button) => { const selected = hasTogetherPreset() && Number(button.dataset.togetherPreset) === Number(state.togetherPreset); button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  const cascadeButton = $('#together-preset-options [data-together-cascade]');
  if (cascadeButton) { const selected = state.togetherCascadePreset === 'safety'; cascadeButton.classList.toggle('selected', selected); cascadeButton.setAttribute('aria-pressed', String(selected)); }
  $$('#spike-count button').forEach((button) => { button.classList.toggle('selected', Number(button.dataset.spikes) === state.spikeCount); button.disabled = hasTogetherPreset() || state.together2 || state.togetherCascadePreset === 'safety'; });
  const divisionLabels = `<div class="together-division-labels"><strong>AVDELNING</strong>${(state.round?.races || []).map((race) => `<span>Avd ${race.division}</span>`).join('')}</div>`;
  $('#coupon-list').style.setProperty('--coupon-columns', visibleCoupons.length);
  $('#coupon-list').innerHTML = `${divisionLabels}${visibleCoupons.map((coupon, couponIndex) => togetherCouponCardMarkup(coupon, couponIndex, Boolean(coupon.complement))).join('')}`;
  const allSelections = state.coupons.flatMap((coupon) => coupon.selections.map((picks, index) => `${index}:${picks.join(',')}`));
  const unique = new Set(allSelections).size;
  const presetSummary = hasTogetherPreset() ? ` &nbsp; ✓ Tillsammans ${state.togetherPreset}: ${state.togetherPreset} spik${state.togetherPreset === 1 ? '' : 'ar'} per kupong` : state.togetherCascadePreset === 'safety' ? ' &nbsp; ✓ Säkerhetsförslag: blandad · bred start · bred avslutning' : '';
  $('#package-summary').innerHTML = `<strong>${visibleCoupons.length} kuponger</strong> · ${money(visibleCoupons.reduce((sum, coupon) => sum + coupon.cost, 0))} totalt<br><span class="summary-check">✓ Komplementet visar ej valda hästar &nbsp; ✓ ${unique === allSelections.length ? 'Varierade upplägg' : 'Gemensamma lopp'} &nbsp; ✓ Låsningar bevaras${presetSummary}</span>${focusedTogetherMarkup()}`;
}

function renderBudgetLabels() {
  if ($('#budget-each')) $('#budget-each').textContent = money(displayedTogetherBudget());
  if ($('#budget-total')) $('#budget-total').textContent = money(displayedTogetherBudget() * state.couponCount + (state.complementCoupon?.cost || 0));
}

function scheduleCouponRegeneration() {
  renderBudgetLabels();
  clearPendingCombinationChoices();
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
  $('#races-list').innerHTML = races.map((race) => { const favorite = raceFavorite(race); const horses = [...race.horses].sort((a, b) => (a.number || 0) - (b.number || 0)); return `<article class="race-card" data-division="${race.division}"><div class="race-summary"><div class="race-number">${race.division}</div><div><h3>Avd ${race.division}</h3><p>${horses.length} hästar · ${favorite ? `Favorit ${favorite.number} ${esc(favorite.name)}` : 'ingen favorit'}</p></div><div class="race-favorite">Favorit<strong>${favorite ? `${favorite.number} · ${fmtPercent(favorite.winPercent)}` : '–'}</strong>${favorite && tipsterBuzzScoreFor(race, favorite) ? `<small>Buzz ${tipsterBuzzScoreFor(race, favorite)}</small>` : ''}</div></div><div class="race-body"><div class="horse-row header-row"><span>#</span><span>Häst</span><span>Kusk</span><span>%</span><span>Start trend%</span><span>Trend%</span><span>Odds</span><span>Buzz</span></div>${horses.slice(0, 30).map((horse) => { const delta = trendDelta(horse); const significant = trendIsSignificant(horse); const buzzScore = tipsterBuzzScoreFor(race, horse); return `<div class="horse-row ${favorite?.number === horse.number ? 'favorite-row' : ''} ${significant ? 'trend-significant' : ''} ${horse.scratched ? 'scratched-row' : ''}"><span class="horse-num">${favorite?.number === horse.number ? '<span class="star">★</span>' : ''}${esc(horse.number)}</span><span class="horse-name">${esc(horse.name)}${horse.scratched ? ' · struken' : ''}</span><span class="horse-meta ${horse.updatedFields?.includes('driver') ? 'updated-field' : ''}">${esc(horse.driver || horse.trainer || '–')}</span><span class="horse-percent ${horse.updatedFields?.includes('winPercent') ? 'updated-field' : ''}">${fmtPercent(horse.winPercent)}</span><span class="horse-start-trend">${fmtPercent(horse.startTrendPercent ?? winningTrendPercent(horse))}</span><span class="horse-trend ${significant || horse.updatedFields?.includes('trendPercent') ? 'updated-field' : ''}">${fmtTrendValue(horse.trendPercent)}</span><span class="horse-odds ${horse.updatedFields?.includes('winOdds') ? 'updated-field' : ''}">${horse.scratched ? 'EJ' : (horse.winOdds ?? '–')}</span><span class="horse-buzz ${buzzScore ? tipsterBuzzClass({ score: buzzScore }) : ''}">${buzzScore || '–'}</span></div>`; }).join('')}</div></article>`; }).join('') + (races.length < count ? `<div class="partial-note">${races.length} av ${count} avdelningar importerade · använd Redigera för att komplettera.</div>` : '');
}

function renderRound() { if (!state.round) return; renderRoundHeader(); renderRaces(); renderCoupons(); renderRoundSavedCoupons(); setRoundBuilderTab(state.roundBuilderTab); }

function openRoundEditor() {
  const races = state.round?.races || []; $('#editor-content').innerHTML = `<div class="eyebrow">OMGÅNGSDATA</div><h2 class="editor-title">Redigera ${esc(state.round?.name || 'omgång')}</h2><p class="editor-intro">Ändra startlistan utan att påverka den gamla /trav-sidan. Manuella ändringar sparas i samma TravGame-dokument.</p>${races.length ? `<form id="round-editor-form">${races.map((race) => `<h3>Avd ${race.division}</h3><table class="editor-table"><thead><tr><th>#</th><th>Häst</th><th>Kusk</th><th>%</th><th>Odds</th></tr></thead><tbody>${race.horses.map((horse, index) => `<tr data-race="${race.division}" data-horse="${index}"><td><input data-field="number" value="${esc(horse.number)}"></td><td><input data-field="name" value="${esc(horse.name)}"></td><td><input data-field="driver" value="${esc(horse.driver)}"></td><td><input data-field="winPercent" value="${esc(horse.winPercent ?? '')}"></td><td><input data-field="winOdds" value="${esc(horse.winOdds ?? '')}"></td></tr>`).join('')}</tbody></table>`).join('')}<div class="modal-actions"><button type="submit" class="primary-button">Spara ändringar</button></div></form>` : `<div class="empty-state"><p>Den här omgången saknar hästar. Hämta startlista igen eller använd Skapa utan import och lägg in data via API:t.</p></div>`}`; $('#editor-modal').hidden = false;
}
async function saveRoundEditor(event) { event.preventDefault(); const form = event.currentTarget; form.querySelectorAll('tr[data-race]').forEach((row) => { const race = state.round.races.find((item) => item.division === Number(row.dataset.race)); const horse = race?.horses?.[Number(row.dataset.horse)]; if (!horse) return; row.querySelectorAll('[data-field]').forEach((input) => { const field = input.dataset.field; horse[field] = ['number', 'winPercent', 'winOdds'].includes(field) ? number(input.value) : input.value; }); }); try { const response = await apiFetch(`/rounds/${encodeURIComponent(state.round.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ round: state.round }) }); if (!response.ok) throw new Error(await response.text() || 'Kunde inte spara'); state.round = await response.json(); $('#editor-modal').hidden = true; generateCoupons(); renderRound(); showToast('Omgången sparades'); } catch (error) { showToast(error.message); } }

function openCouponEditor(couponIndex, raceIndex) { const race = state.round.races[raceIndex]; const selected = new Set(state.coupons[couponIndex].selections[raceIndex] || []); $('#editor-content').innerHTML = `<div class="eyebrow">KUPONG ${couponIndex + 1}</div><h2 class="editor-title">Avd ${race.division} – välj hästar</h2><p class="editor-intro">Ändra valen manuellt. Kostnad och rader räknas om direkt när du sparar.</p><form id="coupon-editor-form"><div class="horse-picker">${race.horses.map((horse) => `<label class="picker-row ${horse.scratched ? 'scratched-row' : ''}"><input type="checkbox" name="horse" value="${esc(horse.number)}" ${selected.has(horse.number) ? 'checked' : ''} ${horse.scratched ? 'disabled' : ''}><strong>${esc(horse.number)}</strong><span>${esc(horse.name)}${horse.scratched ? ' · struken' : ''}</span><small>${horse.scratched ? 'EJ' : `${fmtPercent(horse.winPercent)} · ${esc(horse.driver || '–')}`}</small></label>`).join('')}</div><div class="modal-actions"><button type="button" class="secondary-button" id="make-spike">Gör till spik</button><button type="submit" class="primary-button">Klar</button></div></form>`; $('#editor-modal').hidden = false; const form = $('#coupon-editor-form'); form.dataset.coupon = couponIndex; form.dataset.race = raceIndex; form.addEventListener('submit', saveCouponEditor); }
function saveCouponEditor(event) { event.preventDefault(); event.stopPropagation(); const form = event.currentTarget; const coupon = state.coupons[Number(form.dataset.coupon)]; const race = Number(form.dataset.race); const selected = Array.from(form.querySelectorAll('input[name="horse"]:checked')).map((input) => Number(input.value)); if (!selected.length) return showToast('Välj minst en häst'); coupon.selections[race] = selected; coupon.rows = rowsFor(coupon); coupon.cost = coupon.rows * (state.round.rowPrice || 1); coupon.spikeCount = coupon.selections.filter((selection) => selection.length === 1).length; $('#editor-modal').hidden = true; renderCoupons(); showToast('Avdelningen sparades på kupongen'); }

async function refreshFromAtgLegacy() { if (!state.round) return; const config = { date: state.round.date, gameType: state.round.gameType, track: state.round.track, track2: state.round.track2 }; $('#refresh-round').disabled = true; try { const fresh = await importRound(config, state.round.id); state.round = fresh; generateCoupons(); renderRound(); showToast('Startlistan uppdaterades från ATG'); } catch (error) { showToast(error.message); } finally { $('#refresh-round').disabled = false; } }
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

function shuffleCoupons() {
  const old = state.coupons.map((coupon) => coupon.selections.map((picks) => [...picks]));
  const previousPatterns = state.coupons.map((coupon) => countPlanSignature(coupon.selections.map((picks) => picks.length)));
  const canChange = state.coupons.some((_, index) => !state.combinationLocks.has(index));
  state.selectedPlanIndexes = [];
  state.pendingCombinationIndexes = [];
  let attempts = 0;
  let changed = false;
  do {
    state.seed += 1;
    state.shuffleSeed += 1;
    state.selectedPlanIndexes = state.combinationOptions.map((options, index) => {
      if (state.combinationLocks.has(index) || !options?.length) return null;
      const current = state.combinationCursors[index] ?? 0;
      return (current + attempts + 1) % options.length;
    });
    generateCoupons(old);
    changed = state.coupons.some((coupon, index) => !state.combinationLocks.has(index) && countPlanSignature(coupon.selections.map((picks) => picks.length)) !== previousPatterns[index]);
    attempts += 1;
  } while (canChange && !changed && attempts < 8);
  renderCoupons();
}

async function savePackage() { if (!state.round?.id) return showToast('Skapa eller öppna en omgång först'); const automaticName = `${state.round.gameType} ${trackLabel(state.round.track, state.round.track2)} · ${dateLabel(state.round.date)}`; const enteredName = window.prompt('Rubrik för kupongpaketet (valfritt):', ''); const packageName = enteredName?.trim() || automaticName; const packageId = (window.crypto?.randomUUID?.() || `package-${Date.now()}-${state.seed}`); const packageCreatedAt = new Date().toISOString(); try { for (const coupon of displayedTogetherCoupons()) { const response = await apiFetch(`/games/${encodeURIComponent(state.round.id)}/coupons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Tillsammans · ${coupon.name}`, source: 'tillsammans', packageId, packageName, packageCreatedAt, rows: coupon.rows, cost: coupon.cost, spikeCount: coupon.spikeCount, variation: coupon.variation, stakeLevel: 'original', selections: coupon.selections.map((horses, index) => ({ divisionIndex: state.round.races[index]?.division || index + 1, horses })) }) }); if (!response.ok) throw new Error(await response.text() || 'Kunde inte spara paket'); } await loadGames(); state.savedCoupons = state.games.find((game) => String(game._id) === String(state.round.id))?.coupons || []; renderSavedCoupons(); showToast('Kupongerna sparades som ett paket under Kuponger'); } catch (error) { showToast(error.message); } }

async function refreshFromAtg() { if (!state.round) return; const previous = state.round; const config = { date: state.round.date, gameType: state.round.gameType, track: state.round.track, track2: state.round.track2 }; $('#refresh-round').disabled = true; setRefreshImportOverlay(config); try { const fresh = await importRound(config, state.round.id); markUpdatedFields(previous, fresh); state.round = fresh; clearPendingCombinationChoices(); generateCoupons(); renderRound(); setRefreshImportOverlay(config, 'complete'); showToast('Startlistan uppdaterades – gröna värden är ändrade'); setTimeout(hideRefreshImportOverlay, 900); } catch (error) { setRefreshImportOverlay(config, 'error', error.message); showToast(error.message); setTimeout(hideRefreshImportOverlay, 1800); } finally { $('#refresh-round').disabled = false; } }

function bindEvents() {
  ensureCouponImportTabMarkup();
  ensureRoundTipstersMarkup();
  ensureTipsterNavBadge();
  renderTipsterNavBadge();
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-focus-together]')) { event.stopPropagation(); toggleFocusedTogether(); }
    if (event.target.closest('[data-focus-remove]')) { event.stopPropagation(); removeFocusedTogether(); }
  });
  document.addEventListener('click', (event) => {
    const horse = event.target.closest('[data-tipster-horse]');
    if (horse) { state.tipsterHorseNumber = Number(horse.dataset.tipsterHorse); if (state.roundBuilderTab === 'tipsters') renderRoundTipsters(); else renderTipsters(); return; }
    const division = event.target.closest('[data-tipster-division]');
    if (division && state.round?.races?.length) { const direction = division.dataset.tipsterDivision === 'next' ? 1 : -1; state.tipsterDivision = ((Number(state.tipsterDivision || 1) - 1 + direction + state.round.races.length) % state.round.races.length) + 1; state.tipsterHorseNumber = null; if (state.roundBuilderTab === 'tipsters') renderRoundTipsters(); else renderTipsters(); return; }
    if (event.target.closest('#tipsters-refresh, #refresh-tipsters, [data-round-tipsters-refresh]')) { void loadTipsterBuzz(true); return; }
  });
  document.addEventListener('change', (event) => { if (event.target.id === 'tipster-division') { state.tipsterDivision = Number(event.target.value) || 1; state.tipsterHorseNumber = null; renderTipsters(); } });
  document.addEventListener('click', (event) => { if (event.target.closest('[data-view="tipsters"]')) { state.tipstersHasNewInfo = false; renderTipsterNavBadge(); if (state.round) { event.preventDefault(); event.stopImmediatePropagation(); showView('round'); setRoundBuilderTab('tipsters'); return; } setTimeout(() => { if (state.tipsterBuzz) renderTipsters(); else if (!state.tipsterLoading) void loadTipsterBuzz(false); }, 0); } });
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-coupon-subtab]');
    if (!tab) return;
    event.preventDefault();
    setCouponsSubtab(tab.dataset.couponSubtab);
  });
  $$('#open-create,#empty-create').forEach((button) => button.addEventListener('click', () => { $('#round-date').value = $('#round-date').value || today(); $('#create-modal').hidden = false; renderPreview(); }));
  $('#import-week-games')?.addEventListener('click', importWeeklyGames);
  $$('#round-date,#round-type,#round-track,#round-track2').forEach((field) => field.addEventListener('input', renderPreview));
  $('#create-form').addEventListener('submit', (event) => submitCreate(event, false)); $('#manual-round').addEventListener('click', () => submitCreate(null, true));
  $$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => { $(`#${button.dataset.closeModal}`).hidden = true; }));
  document.addEventListener('click', (event) => { const view = event.target.closest('[data-view]'); if (view) { if (view.dataset.view === 'round' && !state.round) { showToast('Öppna eller skapa en omgång först'); return; } showView(view.dataset.view); if (view.dataset.view === 'coupons') loadSavedCoupons(); if (view.dataset.view === 'results') loadResults(); } const inlineShuffle = event.target.closest('[data-shuffle-inline]'); if (inlineShuffle) { event.stopPropagation(); shuffleCoupons(); return; } const inlineSave = event.target.closest('[data-save-inline]'); if (inlineSave) { event.stopPropagation(); savePackage(); return; } const buildReverse = event.target.closest('[data-build-reverse-coupon]'); if (buildReverse) { event.stopPropagation(); const purchased = state.purchasedCoupons.find((item) => item.id === state.selectedPurchasedCouponId); if (!purchased) return; try { state.reverseCoupon = buildReverseCoupon(purchased); renderReverseBuilder(); } catch (error) { const message = $('#purchased-coupon-message'); if (message) { message.className = 'reverse-message error'; message.textContent = error.message; } } return; } const purchasedCard = event.target.closest('[data-purchased-coupon]'); if (purchasedCard) { event.stopPropagation(); state.selectedPurchasedCouponId = purchasedCard.dataset.purchasedCoupon; state.reverseCoupon = null; renderReverseBuilder(); return; } const saveReverse = event.target.closest('[data-save-reverse-coupon]'); if (saveReverse) { event.stopPropagation(); saveReverseCoupon(); return; } const tab = event.target.closest('[data-round-builder-tab]'); if (tab) { event.stopPropagation(); setRoundBuilderTab(tab.dataset.roundBuilderTab); return; } const sliderArrow = event.target.closest('[data-combination-prev],[data-combination-next]'); if (sliderArrow) { event.stopPropagation(); if (sliderArrow.disabled) return; const couponIndex = Number(sliderArrow.dataset.combinationPrev ?? sliderArrow.dataset.combinationNext); moveCombinationCursor(couponIndex, sliderArrow.hasAttribute('data-combination-next') ? 1 : -1); return; } const combinationSelect = event.target.closest('[data-combination-select]'); if (combinationSelect) { event.stopPropagation(); const couponIndex = Number(combinationSelect.dataset.combinationSelect); const optionIndex = state.combinationCursors[couponIndex] ?? 0; if (state.combinationLocks.has(couponIndex)) { state.combinationLocks.delete(couponIndex); state.lockedCombinationPatterns.delete(couponIndex); showToast(`Kombinationen för kupong ${couponIndex + 1} är upplåst`); } else { const option = state.combinationOptions[couponIndex]?.[optionIndex]; if (option) { state.combinationLocks.add(couponIndex); state.lockedCombinationPatterns.set(couponIndex, countPlanSignature(option.counts)); showToast(`Kombinationen för kupong ${couponIndex + 1} är låst`); } } state.pendingCombinationIndexes[couponIndex] = null; renderCoupons(); return; } const resultButton = event.target.closest('[data-fetch-results]'); if (resultButton) { event.stopPropagation(); fetchGameResults(resultButton.dataset.fetchResults); return; } const deleteButton = event.target.closest('[data-delete-saved-coupon]'); if (deleteButton) { event.stopPropagation(); deleteSavedCoupon(deleteButton.dataset.deleteGame, deleteButton.dataset.deleteSavedCoupon); return; } const deleteGameButton = event.target.closest('[data-delete-game]'); if (deleteGameButton) { event.stopPropagation(); deleteGame(deleteGameButton.dataset.deleteGame); return; } const card = event.target.closest('[data-game-id]'); if (card) { event.stopPropagation(); openRoundById(card.dataset.gameId); return; } const race = event.target.closest('.race-summary'); if (race) race.parentElement.classList.toggle('open'); const edit = event.target.closest('[data-edit-coupon]'); if (edit && !event.target.closest('[data-lock-coupon]')) openCouponEditor(Number(edit.dataset.editCoupon), Number(edit.dataset.editDivision)); const lock = event.target.closest('[data-lock-coupon]'); if (lock) { event.stopPropagation(); const key = `${lock.dataset.lockCoupon}:${lock.dataset.lockDivision}`; state.locks.has(key) ? state.locks.delete(key) : state.locks.add(key); renderCoupons(); } });
  document.addEventListener('click', (event) => {
    const closeModal = event.target.closest('[data-close-modal]');
    if (closeModal && closeModal.dataset.closeModal === 'reverse-editor-modal') { const modal = document.getElementById('reverse-editor-modal'); if (modal) modal.hidden = true; return; }
    if (event.target.id === 'reverse-editor-modal') { event.target.hidden = true; return; }
    const sourceToggle = event.target.closest('[data-reverse-source-toggle]');
    if (sourceToggle) { toggleReverseSource(sourceToggle.dataset.reverseSourceToggle); return; }
    const downgradeToggle = event.target.closest('[data-downgrade-source-toggle]');
    if (downgradeToggle) { event.stopPropagation(); toggleDowngradeSource(downgradeToggle.dataset.downgradeSourceToggle); return; }
    const downgradeCard = event.target.closest('[data-downgrade-source]');
    if (downgradeCard) { event.stopPropagation(); toggleDowngradeSource(downgradeCard.dataset.downgradeSource); return; }
    const sourceCard = event.target.closest('.reverse-multi-source');
    if (sourceCard) { toggleReverseSource(sourceCard.dataset.purchasedCoupon); return; }
    const reverseMode = event.target.closest('[data-reverse-mode]');
    if (reverseMode) { state.reverseMode = reverseMode.dataset.reverseMode === 'favorite' ? 'favorite' : 'reverse'; renderReverseSettings(); return; }
    const reverseSpike = event.target.closest('[data-reverse-spikes]');
    if (reverseSpike) { state.reverseSpikeCount = Number(reverseSpike.dataset.reverseSpikes); renderReverseSettings(); return; }
    const reverseShuffle = event.target.closest('#reverse-shuffle');
    if (reverseShuffle) { shuffleReverseCoupon(); return; }
    const reverseSave = event.target.closest('#reverse-save');
    if (reverseSave) { void saveReverseCoupon(); return; }
    const reverseEdit = event.target.closest('[data-reverse-edit-division]');
    if (reverseEdit) { openReverseEditor(Number(reverseEdit.dataset.reverseEditDivision)); return; }
    const reversePrev = event.target.closest('[data-reverse-combination-prev]');
    if (reversePrev) { moveReverseCombination(-1); return; }
    const reverseNext = event.target.closest('[data-reverse-combination-next]');
    if (reverseNext) { moveReverseCombination(1); return; }
    const reverseSelect = event.target.closest('[data-reverse-combination-select]');
    if (reverseSelect) { toggleReverseCombinationLock(); return; }
    const downgradeShuffle = event.target.closest('#downgrade-shuffle');
    if (downgradeShuffle) { shuffleDowngradeCoupons(); return; }
    const downgradeSaveLater = event.target.closest('#downgrade-save-later, #downgrade-save');
    if (downgradeSaveLater) { saveDowngradeForLater(); return; }
    const downgradeApply = event.target.closest('[data-downgrade-apply]');
    if (downgradeApply) { void applyDowngradeDraft(downgradeApply.dataset.downgradeApply); return; }
    const downgradeDelete = event.target.closest('[data-downgrade-delete]');
    if (downgradeDelete) { state.downgradeDrafts = state.downgradeDrafts.filter((item) => item.id !== downgradeDelete.dataset.downgradeDelete); saveDowngradeDrafts(); renderDowngradeDrafts(); return; }
  });
  document.addEventListener('input', (event) => { if (event.target.id === 'reverse-price') { state.reversePrice = Math.max(1, Number(event.target.value) || 20); } if (event.target.id === 'together-stake-price') { state.togetherStakePrice = Number(event.target.value) > 0 ? Number(event.target.value) : null; scheduleCouponRegeneration(); } if (event.target.id === 'reverse-stake-price') { state.reverseStakePrice = Number(event.target.value) > 0 ? Number(event.target.value) : null; if (state.reverseCoupon) { state.reverseCoupon.cost = state.reverseCoupon.rows * rowPriceForGameType((state.round || matchingRoundForPurchased(selectedReverseSources()[0]))?.gameType || state.reverseCoupon.gameType); renderReversePreview(); } } if (event.target.id === 'downgrade-price') { state.downgradePrice = Math.max(1, Number(event.target.value) || 1000); state.downgradeCoupons = []; } });
  document.addEventListener('change', (event) => { if (event.target.id === 'downgrade-new-combination') { state.downgradeNewCombination = event.target.checked; state.downgradeCoupons = []; renderDowngradeBuilder(); } });
  document.addEventListener('change', (event) => { if (event.target.id === 'reverse-share-enabled') { state.reverseShareEnabled = event.target.checked; renderReverseSettings(); } if (event.target.id === 'reverse-share-count') state.reverseShareCount = Number(event.target.value) || 50; if (event.target.id === 'together-stake-percent') { state.togetherStakePercent = Number(event.target.value) || 100; generateCoupons(); renderCoupons(); } if (event.target.id === 'reverse-stake-percent') { state.reverseStakePercent = Number(event.target.value) || 100; const reverseRound = state.round || matchingRoundForPurchased(selectedReverseSources()[0]); if (state.reverseCoupon && reverseRound) state.reverseCoupon.cost = state.reverseCoupon.rows * rowPriceForGameType(reverseRound.gameType); renderReverseSettings(); renderReverseBuilder(); } });
  let reverseCombinationSwipe = null;
  document.addEventListener('touchstart', (event) => { const slider = event.target.closest('.reverse-combination-slider'); if (slider && event.touches.length === 1) reverseCombinationSwipe = { x: event.touches[0].clientX }; }, { passive: true });
  document.addEventListener('touchend', (event) => { if (!reverseCombinationSwipe || !event.changedTouches.length) return; const delta = event.changedTouches[0].clientX - reverseCombinationSwipe.x; reverseCombinationSwipe = null; if (Math.abs(delta) < 32) return; moveReverseCombination(delta < 0 ? 1 : -1); }, { passive: true });
  let combinationSwipe = null;
  document.addEventListener('touchstart', (event) => { const slider = event.target.closest('[data-combination-slider]'); if (slider && event.touches.length === 1) combinationSwipe = { slider, x: event.touches[0].clientX }; }, { passive: true });
  document.addEventListener('touchend', (event) => { if (!combinationSwipe || !event.changedTouches.length) return; const { slider, x } = combinationSwipe; combinationSwipe = null; if (!slider.isConnected) return; const delta = event.changedTouches[0].clientX - x; if (Math.abs(delta) < 32) return; const arrow = slider.querySelector(delta < 0 ? '[data-combination-next]' : '[data-combination-prev]'); if (arrow && !arrow.disabled) arrow.click(); }, { passive: true });
  $('#edit-round').addEventListener('click', openRoundEditor); $('#refresh-round').addEventListener('click', refreshFromAtg);   $('#round-editor-form')?.addEventListener('submit', saveRoundEditor);
  $('#parse-purchased-coupon')?.addEventListener('click', saveImportedPurchasedCoupon);
  $('#import-shop-coupon')?.addEventListener('click', importShopCoupon);
  $('#save-shop-link')?.addEventListener('click', saveShopLink);
  document.addEventListener('click', (event) => { const importLink = event.target.closest('[data-import-shop-link]'); if (importLink) { event.stopPropagation(); importSavedShopLink(importLink.dataset.importShopLink); } });
  $('#clear-purchased-coupon')?.addEventListener('click', () => { $('#purchased-coupon-input').value = ''; $('#purchased-coupon-message').textContent = ''; $('#purchased-coupon-message').className = 'reverse-message'; });
  $('#together-preset-options')?.addEventListener('click', (event) => { const cascadeButton = event.target.closest('[data-together-cascade]'); if (cascadeButton) { state.togetherCascadePreset = 'safety'; state.togetherPreset = null; state.together2 = false; state.couponCount = 3; state.spikeCount = requestedSpikes(); resetCombinationState(); state.seed += 1; generateCoupons(); renderCoupons(); return; } const button = event.target.closest('[data-together-preset]'); if (!button) return; state.togetherCascadePreset = null; state.togetherPreset = Number(button.dataset.togetherPreset); state.together2 = state.togetherPreset === 2; state.spikeCount = state.togetherPreset; state.manualSpikeCount = state.togetherPreset; resetCombinationState(); state.seed += 1; generateCoupons(); renderCoupons(); }); $('#coupon-count').addEventListener('click', (event) => { const button = event.target.closest('[data-count]'); if (!button) return; state.togetherCascadePreset = null; resetCombinationState(); state.couponCount = Number(button.dataset.count); generateCoupons(); renderCoupons(); }); $('#spike-count').addEventListener('click', (event) => { const button = event.target.closest('[data-spikes]'); if (!button || hasTogetherPreset() || state.together2 || state.togetherCascadePreset === 'safety') return; state.togetherPreset = null; state.togetherCascadePreset = null; state.together2 = false; clearPendingCombinationChoices(); state.spikeCount = Number(button.dataset.spikes); state.manualSpikeCount = state.spikeCount; $$('#spike-count button').forEach((item) => item.classList.toggle('selected', item === button)); scheduleCouponRegeneration(); }); $('#share-price').addEventListener('input', scheduleCouponRegeneration); $('#share-count').addEventListener('change', scheduleCouponRegeneration);
  $$('[data-step]').forEach((button) => button.addEventListener('click', () => { const input = $('#share-price'); input.value = Math.max(1, Number(input.value) + Number(button.dataset.dir)); scheduleCouponRegeneration(); })); $('#shuffle-coupons').addEventListener('click', shuffleCoupons); $('#save-package').addEventListener('click', savePackage);
  document.addEventListener('submit', (event) => { if (event.target.id === 'reverse-editor-form') saveReverseEditor(event); });
  document.addEventListener('submit', (event) => { if (event.target.id === 'round-editor-form') saveRoundEditor(event); if (event.target.id === 'coupon-editor-form') saveCouponEditor(event); }); document.addEventListener('click', (event) => { if (event.target.id === 'make-spike') { const form = event.target.closest('#coupon-editor-form'); const race = state.round?.races?.[Number(form?.dataset.race)]; const favorite = raceFavorite(race || { horses: [] }); form?.querySelectorAll('input[name="horse"]').forEach((input) => { input.checked = Number(input.value) === favorite?.number; }); } });
}

window.addEventListener('popstate', () => { const roundId = new URLSearchParams(window.location.search).get('round'); if (roundId) openRoundById(roundId, false); else { state.round = null; showView('home'); renderHome(); } });
loadPurchasedCoupons(); loadShopLinks(); loadDowngradeDrafts(); loadFocusedTogetherPackages(); $('#round-date').value = today(); bindEvents(); renderPreview(); loadGames();
document.addEventListener('click', (event) => {
  if (event.target.closest('#header-edit, #empty-edit')) openRoundEditor();
});






