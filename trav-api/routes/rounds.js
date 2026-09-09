const express = require('express');
const TravGame = require('../models/Game');
const { buildAtgDivisionUrls, getDivisionCount, getTrackSlug } = require('../import/atg/atgUrlBuilder');
const { importDivisionStartlists } = require('../import/atg/atgBrowserFallback');

const router = express.Router();

function winningTrendPercent(horse) {
  const winPercent = Number(horse?.winPercent);
  const trendPercent = Number(horse?.trendPercent);
  return Number.isFinite(winPercent) && Number.isFinite(trendPercent) ? winPercent - trendPercent : null;
}

function normalizeRound(races, config) {
  return races.map((race) => ({
    index: race.division,
    division: race.division,
    sourceUrl: race.sourceUrl,
    horses: race.horses.map((horse) => ({ ...horse, rawLine: [horse.number, horse.name, horse.sexAge, horse.driver, horse.winPercent == null ? '' : `${horse.winPercent}%`, horse.trendPercent ?? '', horse.winOdds ?? '', horse.trainer, horse.sulky].join('\t') })),
  }));
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
    const imported = await importDivisionStartlists(urls, normalizedType);
    let game = null;
    if (gameId) game = await TravGame.findById(gameId);
    if (!game) {
      game = new TravGame({
        title: `${normalizedType} ${normalizedTrack}${normalizedTrack2 ? `-${normalizedTrack2}` : ''}`,
        date: String(date),
        track: normalizedTrack,
        track2: normalizedTrack2,
        trackSlug: getTrackSlug(normalizedTrack, normalizedTrack2),
        gameType: normalizedType,
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

    game.title = `${normalizedType} ${normalizedTrack}${normalizedTrack2 ? `-${normalizedTrack2}` : ''}`;
    game.date = String(date);
    game.track = normalizedTrack;
    game.track2 = normalizedTrack2;
    game.trackSlug = getTrackSlug(normalizedTrack, normalizedTrack2);
    game.gameType = normalizedType;
    game.horseText = `${normalizedType} ${normalizedTrack}\n${divisions.flatMap((division) => division.horses.map((horse) => horse.rawLine)).join('\n')}`;
    game.parsedHorseInfo = {
      header: `${normalizedType} ${normalizedTrack}`,
      divisions,
      expectedDivisions: divisionCount,
    };
    await game.save();
    return res.status(imported.errors.length ? 207 : 200).json({
      round: {
        id: String(game._id),
        name: game.title,
        date: game.date,
        gameType: game.gameType,
        track: game.track,
        track2: game.track2 || '',
        trackSlug: game.trackSlug,
        divisionCount,
        rowPrice: 1,
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
    return res.json({ id: String(game._id), name: game.title, date: game.date, gameType: game.gameType, track: game.track, track2: game.track2 || '', trackSlug: game.trackSlug, divisionCount: Number(incoming.divisionCount) || races.length, rowPrice: 1, source: 'manual', races });
  } catch (error) {
    console.error('PUT /rounds/:id error', error);
    return res.status(500).json({ error: 'Kunde inte spara omgången.' });
  }
});

module.exports = router;
