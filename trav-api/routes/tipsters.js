const express = require('express');
const TravGame = require('../models/Game');
const TipsterSignal = require('../models/TipsterSignal');
const { tipsterConfig, parseArticles, calculateBuzz, normalizeName, canonicalUrl } = require('../tipsters/parser');
const { discoverPublicArticles, sourceHealth } = require('../tipsters/publicSources');

const router = express.Router();
const configuredTipsters = tipsterConfig.tipsters.filter((tipster) => tipster.enabled);

function roundRaces(game) {
  return Array.isArray(game?.parsedHorseInfo?.divisions) ? game.parsedHorseInfo.divisions : [];
}

function currentMarketPercent(horse) {
  const value = Number(horse?.winPercent);
  return Number.isFinite(value) ? value : null;
}

function horseMatches(reference, horse) {
  if (Number(reference.horseNumber) !== Number(horse.number)) return { confidence: 0, method: 'number-mismatch' };
  const wanted = normalizeName(reference.horseName);
  const actual = normalizeName(horse.name);
  if (wanted && actual === wanted) return { confidence: 1, method: 'number-and-name' };
  if (wanted && (wanted.includes(actual) || actual.includes(wanted))) return { confidence: 0.92, method: 'number-and-name-partial' };
  return { confidence: 0.72, method: 'number-with-name-mismatch' };
}

function signalForHorse(signal, game) {
  if (signal.gameType && String(signal.gameType).toUpperCase() !== String(game.gameType).toUpperCase()) return null;
  const division = roundRaces(game).find((race) => Number(race.division || race.index) === Number(signal.division));
  const horse = division?.horses?.find((item) => Number(item.number) === Number(signal.horseNumber));
  if (!division || !horse) return null;
  const matching = horseMatches(signal, horse);
  if (matching.confidence < 0.85) return null;
  return {
    roundId: String(game._id),
    gameType: game.gameType,
    trackId: game.trackSlug || normalizeName(game.track),
    raceDate: new Date(`${game.date}T12:00:00`),
    division: Number(signal.division),
    horse: { number: Number(horse.number), name: String(horse.name || signal.horseName), normalizedName: normalizeName(horse.name || signal.horseName) },
    tipster: { id: signal.tipster.id, name: signal.tipster.name, sourceId: signal.source.sourceId || signal.tipster.primarySource || '' },
    signal: { type: signal.signal.type, score: Number(signal.signal.score), positive: Boolean(signal.signal.positive), confidence: 1, keywords: signal.signal.keywords || [] },
    matching,
    source: { url: signal.source.url, canonicalUrl: canonicalUrl(signal.source.canonicalUrl || signal.source.url), articleTitle: signal.source.articleTitle || '', publishedAt: signal.source.publishedAt || null, fetchedAt: new Date(), parserVersion: 'tipsters-v1' },
  };
}

function publicSignal(signal) {
  return { tipster: signal.tipster, signal: signal.signal, matching: signal.matching, source: { url: signal.source.url, title: signal.source.articleTitle, publishedAt: signal.source.publishedAt } };
}

async function buildBuzzResponse(game) {
  const signals = await TipsterSignal.find({ roundId: String(game._id) }).lean();
  const races = roundRaces(game).map((race) => ({
    division: Number(race.division || race.index),
    horses: (race.horses || []).filter((horse) => !horse.scratched).map((horse) => {
      const horseSignals = signals.filter((signal) => Number(signal.division) === Number(race.division || race.index) && Number(signal.horse.number) === Number(horse.number));
      return { number: Number(horse.number), name: horse.name, driver: horse.driver || '', winPercent: horse.winPercent ?? null, winOdds: horse.winOdds ?? null, buzz: calculateBuzz(horseSignals, currentMarketPercent(horse), configuredTipsters.length), signals: horseSignals.map(publicSignal) };
    }),
  }));
  return { roundId: String(game._id), gameType: game.gameType, date: game.date, track: game.track, track2: game.track2 || '', configuredTipsters: configuredTipsters.map(({ id, name, primarySource }) => ({ id, name, sourceId: primarySource })), availableTipsters: new Set(signals.map((signal) => signal.tipster.id)).size, races, sourceHealth: Object.fromEntries(Object.keys(tipsterConfig.sources).map((sourceId) => [sourceId, sourceHealth.get(sourceId) || { sourceId, status: 'ok' }])) };
}

router.get('/:roundId/tipster-buzz', async (req, res) => {
  try {
    const game = await TravGame.findById(req.params.roundId).lean();
    if (!game) return res.status(404).json({ error: 'Omgången hittades inte.' });
    return res.json(await buildBuzzResponse(game));
  } catch (error) {
    console.error('GET tipster buzz error', error);
    return res.status(500).json({ error: 'Tipsterdata kunde inte hämtas.' });
  }
});

router.get('/:roundId/horses/:division/:number/tipster-buzz', async (req, res) => {
  try {
    const game = await TravGame.findById(req.params.roundId).lean();
    if (!game) return res.status(404).json({ error: 'Omgången hittades inte.' });
    const response = await buildBuzzResponse(game);
    const race = response.races.find((item) => Number(item.division) === Number(req.params.division));
    const horse = race?.horses.find((item) => Number(item.number) === Number(req.params.number));
    if (!horse) return res.status(404).json({ error: 'Hästen hittades inte.' });
    return res.json({ ...horse, division: race.division });
  } catch (error) {
    console.error('GET horse tipster buzz error', error);
    return res.status(500).json({ error: 'Hästarnas tipsterdata kunde inte hämtas.' });
  }
});

router.post('/:roundId/tipsters/refresh', async (req, res) => {
  try {
    const game = await TravGame.findById(req.params.roundId);
    if (!game) return res.status(404).json({ error: 'Omgången hittades inte.' });
    let articles = Array.isArray(req.body?.articles) ? req.body.articles : [];
    let discovery = { articles: [], health: [] };
    if (!articles.length) discovery = await discoverPublicArticles();
    if (!articles.length) articles = discovery.articles;
    if (!articles.length) return res.json({ status: 'degraded', message: 'Inga publika tipsterartiklar hittades just nu.', imported: 0, skipped: 0, availableTipsters: 0, sourceHealth: discovery.health });
    const parsed = parseArticles(articles);
    const documents = parsed.map((signal) => signalForHorse(signal, game)).filter(Boolean);
    if (documents.length) {
      await TipsterSignal.bulkWrite(documents.map((document) => ({ updateOne: { filter: { roundId: document.roundId, division: document.division, 'horse.number': document.horse.number, 'tipster.id': document.tipster.id, 'source.canonicalUrl': document.source.canonicalUrl }, update: { $set: document }, upsert: true } })));
    }
    return res.json({ status: 'ok', imported: documents.length, parsed: parsed.length, skipped: parsed.length - documents.length, availableTipsters: new Set(documents.map((document) => document.tipster.id)).size, sourceHealth: discovery.health });
  } catch (error) {
    console.error('POST tipster refresh error', error);
    return res.status(500).json({ error: 'Tipsterimporten kunde inte slutföras.' });
  }
});

module.exports = router;
