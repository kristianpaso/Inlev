const cheerio = require('cheerio');

const ATG_BASE_URL = 'https://www.atg.se';
const SUPPORTED_GAME_TYPES = new Set(['V64', 'V65', 'V75', 'V85', 'V86', 'GS75']);

function normalizeGameType(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeTrackSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function titleFromSlug(slug) {
  return normalizeTrackSlug(slug)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toAtgUrl(href) {
  const raw = String(href || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw, ATG_BASE_URL).toString();
  } catch (_) {
    return '';
  }
}

function parseAtgGameUrl(href) {
  const url = toAtgUrl(href);
  if (!url) return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return null;
  }

  if (!parsed.hostname.endsWith('atg.se')) return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'spel') return null;

  const [_, date, gameTypeRaw, trackSlugRaw] = parts;
  const gameType = normalizeGameType(gameTypeRaw);
  const trackSlug = normalizeTrackSlug(trackSlugRaw);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  if (!SUPPORTED_GAME_TYPES.has(gameType)) return null;
  if (!trackSlug) return null;

  return {
    date,
    gameType,
    trackSlug,
    atgUrl: `${ATG_BASE_URL}/spel/${date}/${gameType}/${trackSlug}`,
  };
}

function isBeforeToday(dateString, today = new Date()) {
  const m = String(dateString || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;

  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);

  const t = new Date(today);
  t.setHours(0, 0, 0, 0);

  return d < t;
}

function extractAtgGamesFromHomeHtml(html, options = {}) {
  const includePast = Boolean(options.includePast);
  const $ = cheerio.load(String(html || ''));
  const byKey = new Map();

  $('a[href]').each((_, el) => {
    const discovered = parseAtgGameUrl($(el).attr('href'));
    if (!discovered) return;
    if (!includePast && isBeforeToday(discovered.date, options.today)) return;

    const visibleText = $(el).text().replace(/\s+/g, ' ').trim();
    const key = `${discovered.date}:${discovered.gameType}:${discovered.trackSlug}`;

    if (!byKey.has(key)) {
      byKey.set(key, {
        ...discovered,
        track: titleFromSlug(discovered.trackSlug),
        title: `${discovered.gameType} ${titleFromSlug(discovered.trackSlug)} ${discovered.date}`,
        source: 'atg-popular',
        visibleText,
      });
    }
  });

  return [...byKey.values()].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const typeCmp = a.gameType.localeCompare(b.gameType);
    if (typeCmp !== 0) return typeCmp;
    return a.trackSlug.localeCompare(b.trackSlug);
  });
}

module.exports = {
  ATG_BASE_URL,
  SUPPORTED_GAME_TYPES,
  extractAtgGamesFromHomeHtml,
  parseAtgGameUrl,
  titleFromSlug,
};
