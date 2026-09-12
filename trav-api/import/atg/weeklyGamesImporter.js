const fetch = require('node-fetch');
const { parseGameId } = require('./shopCouponImporter');

const UPCOMING_GAMES_URL = 'https://www.atg.se/services/shop-share/v1/games/upcoming';
const SUPPORTED_GAME_TYPES = new Set(['V64', 'V65', 'V85', 'V86', 'GS75']);

function splitTracks(name) {
  const values = String(name || '')
    .split(/\s*(?:–|—|-|\/)\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
  return { track: values[0] || 'Okänd bana', track2: values[1] || '' };
}

async function fetchWeeklyGames() {
  const response = await fetch(UPCOMING_GAMES_URL, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
    timeout: 20000,
  });
  if (!response.ok) throw new Error(`ATG:s lista svarade ${response.status}`);
  const items = await response.json();
  const now = Date.now();
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const id = String(item.id || '').trim();
      const parsed = parseGameId(id);
      const type = String(item.type || parsed.gameType || '').toUpperCase();
      const { track, track2 } = splitTracks(item.name);
      return {
        atgGameId: id,
        gameType: type,
        date: parsed.date || String(item.scheduledStartTime || '').slice(0, 10),
        track,
        track2,
        scheduledStartTime: item.scheduledStartTime || '',
        status: String(item.status || '').toUpperCase(),
        jackpot: Boolean(item.jackpot),
      };
    })
    .filter((item) => SUPPORTED_GAME_TYPES.has(item.gameType))
    .filter((item) => item.status === 'BETTABLE' && (!item.scheduledStartTime || new Date(item.scheduledStartTime).getTime() >= now - 24 * 60 * 60 * 1000))
    .filter((item) => item.atgGameId && item.date)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.atgGameId === item.atgGameId) === index)
    .sort((a, b) => String(a.scheduledStartTime).localeCompare(String(b.scheduledStartTime)));
}

module.exports = { fetchWeeklyGames, splitTracks, SUPPORTED_GAME_TYPES };
