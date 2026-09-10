import { getTrackByName, getTrackBySlug, trackSlug } from './data/trackAliases.js';
import { classifyHomestretch, classifyTrackSize, getTrackContext, validateTrack } from './analysis/trackContext.js';
import { renderTrackInfoCard } from './components/TrackInfoCard.js';

const $ = (selector) => document.querySelector(selector);
const state = { tracks: [], filtered: [] };
const labels = { small_800m: '800 m-bana', standard_1000m: '1000 m-bana', mile_1609m: '1609 m milebana', very_short: 'Mycket kort upplopp', short: 'Kort upplopp', normal: 'Normalt upplopp', long: 'Långt upplopp', very_long: 'Mycket långt upplopp' };
const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const number = (value, suffix = '') => value == null ? '–' : `${esc(value)}${suffix}`;

function trackWidth(track, distance) { return (track.start_widths || []).find((entry) => Number(entry.distance_m) === distance)?.width_m ?? null; }

function badges(track) {
  const size = classifyTrackSize(track.length_m);
  const stretch = classifyHomestretch(track.homestretch_m);
  const output = [`<span class="track-badge">${esc(labels[size] || 'Bana')}</span>`];
  if (track.open_stretch?.enabled) output.push(`<span class="track-badge accent">${esc(track.open_stretch.lanes)}x open stretch</span>`);
  if (track.angled_starting_gate) output.push('<span class="track-badge warm">Vinklad startvinge</span>');
  output.push(`<span class="track-badge muted">${esc(labels[stretch] || 'Upplopp')}</span>`);
  return output.join('');
}

function renderTrackCard(track) {
  const context = getTrackContext({ track, distance: 2140 });
  const slug = trackSlug(track);
  return `<article class="track-card" data-track-slug="${esc(slug)}"><button class="track-card-main" data-open-track="${esc(slug)}"><div class="track-card-top"><span class="track-card-abbr">${esc(track.abbr)}</span><div><h3>${esc(track.name)}</h3><span class="track-atg">ATG: ${esc(track.atg_slug || slug)}</span></div><span class="track-card-arrow">↗</span></div><div class="track-card-facts"><span><strong>${number(track.length_m, ' m')}</strong><small>Banalängd</small></span><span><strong>${number(track.homestretch_m, ' m')}</strong><small>Upplopp</small></span><span><strong>${number(context.features.startWidth, ' m')}</strong><small>Bredd 2140</small></span></div><div class="track-badges">${badges(track)}</div></button><button class="track-card-detail" data-open-track="${esc(slug)}">Visa baninfo <span>→</span></button></article>`;
}

function renderList() {
  const list = $('#track-list');
  const query = String($('#track-search').value || '').trim().toLocaleLowerCase('sv-SE');
  const filter = $('#track-filter').value;
  state.filtered = state.tracks.filter((track) => {
    const haystack = [track.name, track.abbr, track.slug, track.atg_slug].join(' ').toLocaleLowerCase('sv-SE');
    const matchesQuery = !query || haystack.includes(query);
    const size = classifyTrackSize(track.length_m);
    const matchesFilter = filter === 'all' || filter === size || (filter === 'open' && track.open_stretch?.enabled) || (filter === 'angled' && track.angled_starting_gate);
    return matchesQuery && matchesFilter;
  });
  $('#track-result-count').textContent = `${state.filtered.length} av ${state.tracks.length} banor`;
  $('#track-result-title').textContent = query || filter !== 'all' ? 'Filtrerade banor' : 'Alla svenska travbanor';
  list.innerHTML = state.filtered.length ? state.filtered.map(renderTrackCard).join('') : '<div class="empty-state"><div class="empty-icon">⌕</div><h3>Ingen bana hittades</h3><p>Prova ett annat namn eller ta bort filtret.</p></div>';
}

function renderStats() {
  $('#track-total').textContent = state.tracks.length;
  $('#track-small').textContent = state.tracks.filter((track) => classifyTrackSize(track.length_m) === 'small_800m').length;
  $('#track-open').textContent = state.tracks.filter((track) => track.open_stretch?.enabled).length;
  $('#track-mile').textContent = state.tracks.filter((track) => classifyTrackSize(track.length_m) === 'mile_1609m').length;
}

function openTrack(slug) {
  const track = getTrackBySlug(state.tracks, slug);
  if (!track) return;
  $('#track-modal-content').innerHTML = renderTrackInfoCard(track);
  $('#track-modal').hidden = false;
  document.body.classList.add('modal-open');
  history.replaceState(null, '', `./banor.html?track=${encodeURIComponent(trackSlug(track))}`);
}

function closeTrack() {
  $('#track-modal').hidden = true;
  document.body.classList.remove('modal-open');
  history.replaceState(null, '', './banor.html');
}

async function init() {
  try {
    const response = await fetch('./data/tracks.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Banregistret svarade ${response.status}`);
    const payload = await response.json();
    state.tracks = Array.isArray(payload) ? payload : payload.tracks;
    if (!Array.isArray(state.tracks) || !state.tracks.length) throw new Error('Banregistret är tomt');
    const invalid = state.tracks.flatMap((track) => validateTrack(track));
    if (invalid.length) console.warn('Banregister innehåller valideringsanmärkningar:', invalid);
    renderStats();
    renderList();
    const requestedTrack = new URLSearchParams(window.location.search).get('track');
    const requested = requestedTrack && (getTrackBySlug(state.tracks, requestedTrack) || getTrackByName(state.tracks, requestedTrack));
    if (requested) openTrack(trackSlug(requested));
  } catch (error) {
    console.error(error);
    $('#track-result-count').textContent = 'Kunde inte läsa banregistret';
    $('#track-list').innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>Banorna kunde inte hämtas</h3><p>${esc(error.message)}</p></div>`;
  }
}

$('#track-search').addEventListener('input', renderList);
$('#track-filter').addEventListener('change', renderList);
document.addEventListener('click', (event) => {
  const open = event.target.closest('[data-open-track]');
  if (open) openTrack(open.dataset.openTrack);
  if (event.target.closest('[data-close-track-modal]')) closeTrack();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#track-modal').hidden) closeTrack(); });
init();
