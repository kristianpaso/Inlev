const express = require('express');
const TravGame = require('../models/Game');
const TipsterSignal = require('../models/TipsterSignal');
const { tipsterConfig, parseArticles, calculateBuzz, normalizeName, canonicalUrl } = require('../tipsters/parser');
const { discoverPublicArticles, sourceHealth } = require('../tipsters/publicSources');

const router = express.Router();
const configuredTipsters = tipsterConfig.tipsters.filter((tipster) => tipster.enabled);
function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, Number(value) || 0)); }

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

function infoSourceWeight(signal) {
  const sourceId = String(signal?.source?.sourceId || signal?.tipster?.sourceId || '').toLowerCase();
  if (sourceId === 'untersteiner' || sourceId === 'stallzet') return 1;
  if (sourceId === 'atg-stallsnack') return 0.9;
  if (sourceId === 'travnet' || sourceId === 'andelstorget') return 0.65;
  return 0.55;
}

function infoFreshnessWeight(publishedAt) {
  if (!publishedAt) return 0.72;
  const ageHours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3600000);
  if (ageHours <= 12) return 1;
  if (ageHours <= 24) return 0.96;
  if (ageHours <= 48) return 0.88;
  if (ageHours <= 72) return 0.72;
  return 0.5;
}

function infoSummary(signals) {
  const mentioned = signals.length > 0;
  const usable = signals.filter((signal) => !signal.mentionOnly && String(signal.signal?.type || '').toUpperCase() !== 'NEUTRAL');
  const weighted = usable.map((signal) => {
    const rawScore = Number(signal.signal?.score ?? 0.5);
    const overall = signal.signal?.positive === false ? -(1 - rawScore) : rawScore;
    return { signal, value: overall * infoSourceWeight(signal) * infoFreshnessWeight(signal.source?.publishedAt) * Number(signal.signal?.confidence ?? 1) };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + infoSourceWeight(item.signal) * infoFreshnessWeight(item.signal.source?.publishedAt), 0);
  const average = totalWeight ? weighted.reduce((sum, item) => sum + item.value, 0) / totalWeight : 0;
  const infoScore = Math.round(clamp(50 + average * 45, 0, 100));
  const sources = [...new Set(signals.map((signal) => signal.source?.sourceId || signal.tipster?.sourceId).filter(Boolean))];
  const directSources = sources.filter((sourceId) => ['untersteiner', 'stallzet'].includes(String(sourceId).toLowerCase())).length;
  const matchConfidence = signals.length ? signals.reduce((sum, signal) => sum + Number(signal.matching?.confidence ?? 0), 0) / signals.length : 0;
  const infoConfidence = Math.round(clamp(mentioned ? 25 + usable.length * 10 + sources.length * 8 + directSources * 10 + matchConfidence * 15 : 0, 0, 100));
  const positive = usable.filter((signal) => signal.signal?.positive === true).sort((a, b) => Number(b.signal?.score || 0) - Number(a.signal?.score || 0));
  const negative = usable.filter((signal) => signal.signal?.positive === false).sort((a, b) => Number(a.signal?.score || 1) - Number(b.signal?.score || 1));
  const flags = (items) => [...new Set(items.flatMap((signal) => signal.signal?.keywords || []))].slice(0, 6);
  return {
    infoMentioned: mentioned,
    infoScore,
    infoConfidence,
    infoAdjustment: usable.length ? Number(clamp((infoScore - 50) * 0.16 * (infoConfidence / 100), -8, 8).toFixed(1)) : 0,
    positiveFlags: flags(positive),
    riskFlags: flags(negative),
    positiveSources: [...new Set(positive.map((signal) => signal.source?.sourceId).filter(Boolean))],
    negativeSources: [...new Set(negative.map((signal) => signal.source?.sourceId).filter(Boolean))],
    directSources,
    strongestPositive: positive[0]?.source?.articleTitle || positive[0]?.signal?.type || '',
    strongestRisk: negative[0]?.source?.articleTitle || negative[0]?.signal?.type || '',
    latestSignal: signals.slice().sort((a, b) => new Date(b.source?.publishedAt || b.createdAt || 0) - new Date(a.source?.publishedAt || a.createdAt || 0))[0]?.source?.articleTitle || '',
  };
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
    mentionOnly: Boolean(signal.mentionOnly),
    source: { url: signal.source.url, canonicalUrl: canonicalUrl(signal.source.canonicalUrl || signal.source.url), articleTitle: signal.source.articleTitle || '', publishedAt: signal.source.publishedAt || null, fetchedAt: new Date(), parserVersion: 'tipsters-v1' },
  };
}

function publicSignal(signal) {
  return { tipster: signal.tipster, signal: signal.signal, matching: signal.matching, mentionOnly: Boolean(signal.mentionOnly), source: { url: signal.source.url, title: signal.source.articleTitle, publishedAt: signal.source.publishedAt } };
}

async function buildBuzzResponse(game) {
  const signals = await TipsterSignal.find({ roundId: String(game._id) }).lean();
  const races = roundRaces(game).map((race) => ({
    division: Number(race.division || race.index),
    horses: (race.horses || []).filter((horse) => !horse.scratched).map((horse) => {
      const horseSignals = signals.filter((signal) => Number(signal.division) === Number(race.division || race.index) && Number(signal.horse.number) === Number(horse.number));
      const info = infoSummary(horseSignals);
      return { number: Number(horse.number), name: horse.name, driver: horse.driver || '', winPercent: horse.winPercent ?? null, winOdds: horse.winOdds ?? null, buzz: calculateBuzz(horseSignals.filter((signal) => !signal.mentionOnly), currentMarketPercent(horse), configuredTipsters.length), ...info, signals: horseSignals.map(publicSignal) };
    }),
  }));
  return { roundId: String(game._id), gameType: game.gameType, date: game.date, track: game.track, track2: game.track2 || '', stallsnack: game.stallsnack || {}, infoArticles: game.infoArticles || [], configuredTipsters: configuredTipsters.map(({ id, name, primarySource }) => ({ id, name, sourceId: primarySource })), availableTipsters: new Set(signals.map((signal) => signal.tipster.id)).size, races, sourceHealth: Object.fromEntries(Object.keys(tipsterConfig.sources).map((sourceId) => [sourceId, sourceHealth.get(sourceId) || { sourceId, status: 'ok' }])) };
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
    if (!articles.length) discovery = await discoverPublicArticles(game);
    if (!articles.length) articles = discovery.articles;
    if (discovery.stallsnack?.length) {
      game.stallsnack = { articles: discovery.stallsnack, updatedAt: new Date() };
      game.markModified('stallsnack');
    }
    const infoArticles = (discovery.articles || []).filter((article) => !article.isStallsnack).map(({ sourceId, url, title, description, excerpt, image, publishedAt, sections }) => ({ sourceId, url, title, description, excerpt, image, publishedAt, sections: Array.isArray(sections) ? sections.map((section) => ({ tipster: section.tipster, text: String(section.text || '').slice(0, 1400) })) : [] }));
    if (infoArticles.length) { game.infoArticles = infoArticles; game.markModified('infoArticles'); }
    if (discovery.stallsnack?.length || infoArticles.length) await game.save();
    if (!articles.length) return res.json({ status: 'degraded', message: 'Inga publika tipsterartiklar hittades just nu.', imported: 0, skipped: 0, availableTipsters: 0, stallsnack: game.stallsnack || {}, sourceHealth: discovery.health });
    const knownHorses = roundRaces(game).flatMap((race) => (race.horses || []).map((horse) => ({ division: Number(race.division || race.index), number: Number(horse.number), name: horse.name })));
    const parsed = parseArticles(articles, { horses: knownHorses });
    const documents = parsed.map((signal) => signalForHorse(signal, game)).filter(Boolean);
    let signalImportError = '';
    if (documents.length) {
      try {
        await TipsterSignal.bulkWrite(documents.map((document) => ({ updateOne: { filter: { roundId: document.roundId, division: document.division, 'horse.number': document.horse.number, 'tipster.id': document.tipster.id, 'source.canonicalUrl': document.source.canonicalUrl }, update: { $set: document }, upsert: true } })));
      } catch (error) {
        signalImportError = error.message || 'En eller flera hästsignaler kunde inte sparas';
        console.error('Tipster signal save error; source articles were saved', error);
      }
    }
    return res.json({ status: signalImportError ? 'degraded' : 'ok', imported: signalImportError ? 0 : documents.length, parsed: parsed.length, skipped: parsed.length - documents.length, availableTipsters: signalImportError ? 0 : new Set(documents.map((document) => document.tipster.id)).size, warning: signalImportError || undefined, stallsnack: game.stallsnack || {}, infoArticles: game.infoArticles || [], sourceHealth: discovery.health });
  } catch (error) {
    console.error('POST tipster refresh error', error);
    return res.status(500).json({ error: 'Tipsterimporten kunde inte slutföras.' });
  }
});

module.exports = router;
