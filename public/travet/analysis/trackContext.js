import { getTrackByName, getTrackBySlug } from '../data/trackAliases.js';

export function validateTrack(track) {
  const errors = [];
  if (!track || typeof track !== 'object') return ['Banan saknas'];
  if (!String(track.name || '').trim()) errors.push('name saknas');
  if (!String(track.slug || track.atg_slug || '').trim()) errors.push('slug saknas');
  if (track.length_m != null && !(Number(track.length_m) > 0)) errors.push('length_m måste vara positiv');
  if (track.homestretch_m != null && !(Number(track.homestretch_m) > 0)) errors.push('homestretch_m måste vara positiv');
  if (typeof track.open_stretch?.enabled !== 'boolean') errors.push('open_stretch.enabled måste vara boolean');
  if (track.open_stretch?.lanes != null && !(Number(track.open_stretch.lanes) >= 0)) errors.push('open_stretch.lanes måste vara 0 eller större');
  const turns = track.turns || {};
  ['radius_large_m', 'radius_turn1_m', 'radius_turn2_m'].forEach((key) => {
    if (turns[key] != null && !(Number(turns[key]) > 0)) errors.push(`${key} måste vara positiv`);
  });
  ['banking_turn1_pct', 'banking_turn2_pct'].forEach((key) => {
    if (turns[key] != null && !(Number(turns[key]) >= 0)) errors.push(`${key} måste vara 0 eller större`);
  });
  return errors;
}

export function classifyTrackSize(lengthM) {
  if (lengthM == null || Number.isNaN(Number(lengthM))) return 'unknown';
  if (Number(lengthM) <= 800) return 'small_800m';
  if (Number(lengthM) >= 1500) return 'mile_1609m';
  return 'standard_1000m';
}

export function classifyHomestretch(lengthM) {
  if (lengthM == null || Number.isNaN(Number(lengthM))) return 'unknown';
  if (Number(lengthM) <= 160) return 'very_short';
  if (Number(lengthM) <= 180) return 'short';
  if (Number(lengthM) <= 205) return 'normal';
  if (Number(lengthM) <= 220) return 'long';
  return 'very_long';
}

export function classifyWidth(widthM) {
  if (widthM == null || Number.isNaN(Number(widthM))) return 'unknown';
  if (Number(widthM) < 20) return 'narrow';
  if (Number(widthM) >= 23) return 'wide';
  return 'normal';
}

function numeric(value) {
  return value == null || Number.isNaN(Number(value)) ? null : Number(value);
}

function widthForDistance(track, distance) {
  const widths = Array.isArray(track?.start_widths) ? track.start_widths : [];
  if (!widths.length) return null;
  const wanted = Number(distance);
  const exact = widths.find((item) => Number(item.distance_m) === wanted);
  return numeric((exact || widths[0])?.width_m);
}

export function getTrackContext({ trackName, trackSlug, distance, startMethod = 'AUTO', postPosition, tracks = [], track: providedTrack } = {}) {
  const track = providedTrack || getTrackBySlug(tracks, trackSlug) || getTrackByName(tracks, trackName) || null;
  const length = numeric(track?.length_m);
  const homestretch = numeric(track?.homestretch_m);
  const openStretchLanes = Math.max(0, Number(track?.open_stretch?.lanes || 0));
  const turns = track?.turns || {};
  const width = widthForDistance(track, distance);
  const method = String(startMethod || 'AUTO').toUpperCase();
  const features = {
    isSmallTrack: classifyTrackSize(length) === 'small_800m',
    isMileTrack: classifyTrackSize(length) === 'mile_1609m',
    shortHomestretch: ['very_short', 'short'].includes(classifyHomestretch(homestretch)),
    longHomestretch: ['long', 'very_long'].includes(classifyHomestretch(homestretch)),
    openStretch: openStretchLanes > 0,
    openStretchLanes,
    angledGate: Boolean(track?.angled_starting_gate) && method === 'AUTO',
    hasAngledStartingGate: Boolean(track?.angled_starting_gate),
    startWidth: width,
    startWidthClass: classifyWidth(width),
    startWidth2140: widthForDistance(track, 2140),
    startWidth1640: widthForDistance(track, 1640),
    radiusLarge: numeric(turns.radius_large_m),
    radiusTurn1: numeric(turns.radius_turn1_m),
    radiusTurn2: numeric(turns.radius_turn2_m),
    bankingTurn1: numeric(turns.banking_turn1_pct),
    bankingTurn2: numeric(turns.banking_turn2_pct),
  };
  const radiusValues = [features.radiusTurn1, features.radiusTurn2].filter((value) => value != null);
  const bankingValues = [features.bankingTurn1, features.bankingTurn2].filter((value) => value != null);
  return {
    track,
    distance: numeric(distance),
    startMethod: method,
    postPosition: numeric(postPosition),
    averageTurnRadius: radiusValues.length ? radiusValues.reduce((sum, value) => sum + value, 0) / radiusValues.length : null,
    averageBankingPct: bankingValues.length ? bankingValues.reduce((sum, value) => sum + value, 0) / bankingValues.length : null,
    features,
  };
}
