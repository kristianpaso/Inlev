const express = require('express');
const TravGame = require('../models/Game');
const { buildAtgDivisionUrls, getDivisionCount, getTrackSlug } = require('../import/atg/atgUrlBuilder');
const { importDivisionStartlists } = require('../import/atg/atgBrowserFallback');
const { findAtgGameId } = require('../import/atg/shopCouponImporter');
const { fetchWeeklyGames } = require('../import/atg/weeklyGamesImporter');

const router = express.Router();
const weeklyJobs = new Map();

function winningTrendPercent(horse) {
  const winPercent = Number(horse?.winPercent);
  const trendPercent = Number(horse?.trendPercent);
  return Number.isFinite(winPercent) && Number.isFinite(trendPercent) ? winPercent - trendPercent : null;
}

function rowPriceForGameType(gameType) {
  const type = String(gameType || '').trim().toUpperCase();
  if (type === 'V85') return 0.5;
  if (type === 'V86') return 0.25;
  return 1;
}

function normalizeRound(races, config) {
  return races.map((race) => ({
    index: race.division,
    division: race.division,
    sourceUrl: race.sourceUrl,
      horses: race.horses.map((horse) => ({ ...horse, rawLine: [horse.number, horse.name, horse.sexAge, horse.driver, horse.winPercent == null ? '' : `${horse.winPercent}%`, horse.trendPercent ?? '', horse.scratched ? 'EJ' : (horse.winOdds ?? ''), horse.trainer, horse.sulky].join('\t') })),
  }));
}

async function persistImportedRound(config, gameId, imported, atgGameId = '') {
  const { date, gameType, track, track2 = '' } = config;
  let game = gameId ? await TravGame.findById(gameId) : null;
  if (!game) {
    game = await TravGame.findOne({ atgGameId });
  }
  if (!game) {
    game = await TravGame.findOne({ gameType, date: String(date), track, track2 });
  }
  if (!game) {
    game = new TravGame({
      title: `${gameType} ${track}${track2 ? `-${track2}` : ''}`,
      date: String(date),
      track,
      track2,
      trackSlug: getTrackSlug(track, track2),
      gameType,
    });
  }

  const oldDivisions = Array.isArray(game.parsedHorseInfo?.divisions) ? game.parsedHorseInfo.divisions : [];
  const importedDivisions = normalizeRound(imported.races, config).map((division) => {
    const oldDivision = oldDivisions.find((item) => Number(item.division || item.index) === Number(division.division));
    return {
      ...division,
      horses: division.horses.map((horse) => {
        const oldHorse = oldDivision?.horses?.find((item) => Number(item.number) === Number(horse.number));
        const oldStart = Number(oldHorse?.startTrendPercent);
        const oldRawTrend = Number(oldHorse?.trendPercent);
        const oldDerivedStart = winningTrendPercent(oldHorse);
        const currentDerivedStart = winningTrendPercent(horse);
        const migratedStart = Number.isFinite(oldStart) && oldStart !== 0 && oldStart !== oldRawTrend ? oldStart : oldDerivedStart;
        const startTrendPercent = migratedStart ?? currentDerivedStart ?? horse.startTrendPercent ?? horse.trendPercent ?? null;
        return { ...horse, startTrendPercent };
      }),
    };
  });
  const importedNumbers = new Set(importedDivisions.map((division) => Number(division.division)));
  const divisions = [...importedDivisions, ...oldDivisions.filter((division) => !importedNumbers.has(Number(division.division)))].sort((a, b) => Number(a.division) - Number(b.division));

  game.title = `${gameType} ${track}${track2 ? `-${track2}` : ''}`;
  game.date = String(date);
  game.track = track;
  game.track2 = track2;
  game.trackSlug = getTrackSlug(track, track2);
  game.gameType = gameType;
  if (atgGameId) game.atgGameId = atgGameId;
  if (!game.atgGameId) game.atgGameId = await findAtgGameId({ date: String(date), gameType, trackSlug: getTrackSlug(track, track2) }).catch(() => '');
  game.horseText = `${gameType} ${track}\n${divisions.flatMap((division) => division.horses.map((horse) => horse.rawLine)).join('\n')}`;
  game.parsedHorseInfo = { header: `${gameType} ${track}`, divisions, expectedDivisions: getDivisionCount(gameType) };
  await game.save();
  return { game, divisions };
}

router.post('/import', async (req, res) => {
  const { gameId, date, gameType, track, track2 } = req.body || {};
  const normalizedType = String(gameType || '').trim().toUpperCase();
  const normalizedTrack = String(track || '').trim();
  const divisionCount = getDivisionCount(normalizedType);
  if (!date || !normalizedType || !normalizedTrack || !divisionCount) {
    return res.status(400).json({ error: 'Datum, spelform och bana krävs.' });
  }

  const normalizedTrack2 = String(track2 || '').trim();
  const config = { date, gameType: normalizedType, track: normalizedTrack, track2: normalizedTrack2 };
  const urls = buildAtgDivisionUrls(config);
  try {
    const currentGame = gameId ? await TravGame.findById(gameId).catch(() => null) : null;
    const atgGameId = currentGame?.atgGameId || await findAtgGameId({
      date: String(date),
      gameType: normalizedType,
      trackSlug: getTrackSlug(normalizedTrack, normalizedTrack2),
    }).catch(() => '');
    const imported = await importDivisionStartlists(urls, normalizedType, undefined, atgGameId);
    const { game, divisions } = await persistImportedRound(config, gameId, imported, atgGameId);
    return res.status(imported.errors.length ? 207 : 200).json({
      round: {
        id: String(game._id),
        name: game.title,
        date: game.date,
        gameType: game.gameType,
        track: game.track,
        track2: game.track2 || '',
        trackSlug: game.trackSlug,
        atgGameId: game.atgGameId || '',
        divisionCount,
        rowPrice: rowPriceForGameType(game.gameType),
        source: 'atg',
        races: divisions,
      },
      errors: imported.errors,
    });
  } catch (error) {
    console.error('POST /rounds/import error', error);
    return res.status(500).json({ error: 'ATG-importen kunde inte startas.', detail: error.message });
  }
});

function publicWeeklyJob(job) {
  return {
    jobId: job.id,
    state: job.state,
    total: job.games.length,
    completed: job.items.filter((item) => ['done', 'partial', 'error'].includes(item.status)).length,
    current: job.current || '',
    startedAt: job.startedAt,
    completedAt: job.completedAt || null,
    games: job.games,
    items: job.items,
    imported: job.imported,
    errors: job.errors,
  };
}

async function runWeeklyImport(job) {
  job.state = 'running';
  job.startedAt = new Date().toISOString();
  const queue = [...job.games];
  const importOne = async (item) => {
    const status = job.items.find((entry) => entry.atgGameId === item.atgGameId);
    if (status) status.status = 'loading';
    job.current = `${item.gameType} ${item.track}${item.track2 ? ` – ${item.track2}` : ''}`;
    try {
      const config = { date: item.date, gameType: item.gameType, track: item.track, track2: item.track2 };
      const startlists = await importDivisionStartlists(buildAtgDivisionUrls(config), item.gameType);
      const saved = await persistImportedRound(config, '', startlists, item.atgGameId);
      job.imported.push({ id: String(saved.game._id), atgGameId: item.atgGameId, gameType: item.gameType, date: item.date, track: item.track, track2: item.track2, divisions: saved.divisions.length, errors: startlists.errors });
      if (status) { status.status = startlists.errors.length ? 'partial' : 'done'; status.divisions = saved.divisions.length; status.detail = startlists.errors.length ? `${saved.divisions.length} avdelningar · vissa fel` : `${saved.divisions.length} avdelningar klara`; }
    } catch (error) {
      const detail = error.message || 'Kunde inte importera omgången.';
      job.errors.push({ atgGameId: item.atgGameId, gameType: item.gameType, date: item.date, track: item.track, message: detail });
      if (status) { status.status = 'error'; status.detail = detail; }
    }
  };
  const worker = async () => { while (queue.length) { const item = queue.shift(); if (item) await importOne(item); } };
  await Promise.all(Array.from({ length: Math.min(3, queue.length || 1) }, worker));
  job.current = '';
  job.state = 'complete';
  job.completedAt = new Date().toISOString();
}

// Hämta alla spelbara travomgångar från ATG:s veckolista och importera
// startlistorna i bakgrunden så klienten kan visa verklig progress.
router.post('/weekly-import', async (req, res) => {
  try {
    const games = await fetchWeeklyGames();
    if (req.body?.preview) return res.json({ games, count: games.length });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const job = { id, state: 'queued', games, items: games.map((item) => ({ atgGameId: item.atgGameId, gameType: item.gameType, date: item.date, track: item.track, track2: item.track2, status: 'pending', detail: 'Väntar på import' })), imported: [], errors: [], current: '', startedAt: null, completedAt: null };
    weeklyJobs.set(id, job);
    void runWeeklyImport(job).catch((error) => { job.state = 'error'; job.errors.push({ message: error.message || 'Veckoimporten avbröts.' }); job.completedAt = new Date().toISOString(); });
    return res.status(202).json(publicWeeklyJob(job));
  } catch (error) {
    console.error('POST /rounds/weekly-import error', error);
    return res.status(500).json({ error: error.message || 'Kunde inte hämta veckans spel från ATG.' });
  }
});

router.get('/weekly-import/:jobId', (req, res) => {
  const job = weeklyJobs.get(String(req.params.jobId));
  if (!job) return res.status(404).json({ error: 'Importjobbet hittades inte.' });
  if (job.completedAt && Date.now() - new Date(job.completedAt).getTime() > 30 * 60 * 1000) weeklyJobs.delete(job.id);
  return res.json(publicWeeklyJob(job));
});

router.put('/:id', async (req, res) => {
  const incoming = req.body?.round;
  if (!incoming || !Array.isArray(incoming.races)) {
    return res.status(400).json({ error: 'Omgångsdata saknas.' });
  }
  try {
    const game = await TravGame.findById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Omgången hittades inte.' });
    const races = incoming.races.map((race) => ({
      index: Number(race.division || race.index),
      division: Number(race.division || race.index),
      sourceUrl: String(race.sourceUrl || ''),
      horses: (race.horses || []).map((horse) => ({
        ...horse,
        number: Number(horse.number),
        winPercent: horse.winPercent == null ? null : Number(horse.winPercent),
        trendPercent: horse.trendPercent == null ? null : Number(horse.trendPercent),
        winOdds: horse.winOdds == null ? null : Number(horse.winOdds),
      })),
    }));
    game.title = String(incoming.name || `${incoming.gameType} ${incoming.track}`);
    game.date = String(incoming.date || game.date);
    game.track = String(incoming.track || game.track);
    game.track2 = String(incoming.track2 || game.track2 || '');
    game.trackSlug = String(incoming.trackSlug || getTrackSlug(game.track, game.track2));
    game.gameType = String(incoming.gameType || game.gameType).toUpperCase();
    game.parsedHorseInfo = { header: game.title, divisions: races, expectedDivisions: Number(incoming.divisionCount) || races.length };
    game.horseText = `${game.title}\n${races.flatMap((race) => race.horses.map((horse) => horse.rawLine || `${horse.number} ${horse.name}`)).join('\n')}`;
    await game.save();
    return res.json({ id: String(game._id), name: game.title, date: game.date, gameType: game.gameType, track: game.track, track2: game.track2 || '', trackSlug: game.trackSlug, divisionCount: Number(incoming.divisionCount) || races.length, rowPrice: rowPriceForGameType(game.gameType), source: 'manual', races });
  } catch (error) {
    console.error('PUT /rounds/:id error', error);
    return res.status(500).json({ error: 'Kunde inte spara omgången.' });
  }
});

module.exports = router;
