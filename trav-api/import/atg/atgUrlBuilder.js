const GAME_DIVISIONS = Object.freeze({
  V64: 6,
  V65: 6,
  V85: 8,
  V86: 8,
  GS75: 7,
});

const TRACK_SLUG_MAP = Object.freeze({
  Åby: 'aby',
  Örebro: 'orebro',
  Eskilstuna: 'eskilstuna',
});

function getDivisionCount(gameType) {
  return GAME_DIVISIONS[String(gameType || '').trim().toUpperCase()] || 0;
}

function toAtgTrackSlug(trackName) {
  return String(trackName || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

function getTrackSlug(trackName) {
  const value = String(trackName || '').trim();
  return TRACK_SLUG_MAP[value] || toAtgTrackSlug(value);
}

function buildAtgDivisionUrls({ date, gameType, track }) {
  const normalizedType = String(gameType || '').trim().toUpperCase();
  const trackSlug = getTrackSlug(track);
  const count = getDivisionCount(normalizedType);
  return Array.from({ length: count }, (_, index) => {
    const division = index + 1;
    return `https://www.atg.se/spel/${encodeURIComponent(date)}/${encodeURIComponent(normalizedType)}/${encodeURIComponent(trackSlug)}/avd/${division}`;
  });
}

module.exports = {
  GAME_DIVISIONS,
  getDivisionCount,
  getTrackSlug,
  toAtgTrackSlug,
  buildAtgDivisionUrls,
};
