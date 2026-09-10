const normalize = (value) => String(value ?? '')
  .toLocaleLowerCase('sv-SE')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');

export const TRACK_ALIASES = {
  eskilstuna: 'Eskilstuna',
  solvalla: 'Solvalla',
  aby: 'Åby',
  amal: 'Åmål',
  arjang: 'Årjäng',
  orebro: 'Örebro',
  ostersund: 'Östersund',
};

export function getTrackByName(tracks, name) {
  const key = normalize(name);
  if (!key) return null;
  const aliasName = TRACK_ALIASES[key];
  return (tracks || []).find((track) => normalize(track.name) === normalize(aliasName || name)) || null;
}

export function getTrackBySlug(tracks, slug) {
  const key = normalize(slug);
  if (!key) return null;
  return (tracks || []).find((track) => normalize(track.slug || track.atg_slug) === key) || getTrackByName(tracks, key);
}

export function getTrackByAbbr(tracks, abbr) {
  const key = normalize(abbr);
  if (!key) return null;
  return (tracks || []).find((track) => normalize(track.abbr) === key) || null;
}

export function trackSlug(track) {
  return normalize(track?.slug || track?.atg_slug || track?.name);
}

export { normalize as normalizeTrackKey };
