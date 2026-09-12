const tipsterConfig = require('./config/tipsters.json');
const keywordConfig = require('./config/signalKeywords.json');

const SCORE_BY_TYPE = {
  SUPER_SPIK: 1,
  SPIK: 0.95,
  STRONG_WIN: 0.92,
  STRONG_OUTSIDER: 0.9,
  VALUE: 0.82,
  OUTSIDER: 0.8,
  EARLY_PICK: 0.76,
  POSITIVE: 0.68,
  NEUTRAL: 0.5,
  NEGATIVE: 0.25,
  FADE_FAVORITE: 0.1,
};

function clean(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function normalizeName(value) { return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function resolveTipster(value, sourceId = '') {
  const wanted = normalizeName(value);
  return tipsterConfig.tipsters.find((tipster) => tipster.enabled && (tipster.aliases || []).some((alias) => normalizeName(alias) === wanted) && (!sourceId || tipster.primarySource === sourceId))
    || tipsterConfig.tipsters.find((tipster) => tipster.enabled && (tipster.aliases || []).some((alias) => normalizeName(alias) === wanted))
    || null;
}

function classifySignal(text) {
  const normalized = clean(text).toLowerCase();
  for (const rule of keywordConfig.negationRules || []) {
    if (normalized.includes(rule.pattern.toLowerCase())) return { type: rule.overrideType || 'NEGATIVE', score: rule.weight ?? SCORE_BY_TYPE[rule.overrideType] ?? 0.5, positive: rule.overrideType !== 'NEGATIVE', keywords: [rule.pattern] };
  }
  const matches = [...(keywordConfig.positive || []), ...(keywordConfig.negative || [])]
    .filter((keyword) => normalized.includes(String(keyword.phrase).toLowerCase()))
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
  if (!matches.length) return { type: 'NEUTRAL', score: SCORE_BY_TYPE.NEUTRAL, positive: true, keywords: [] };
  const match = matches[0];
  const positive = (keywordConfig.positive || []).includes(match);
  return { type: match.type, score: Number(match.weight ?? SCORE_BY_TYPE[match.type] ?? 0.5), positive, keywords: matches.slice(0, 3).map((item) => item.phrase) };
}

function parseHorseLines(text, gameTypeHint = '') {
  const signals = [];
  const sourceText = String(text || '');
  const addSignal = (match, gameType, division, horseNumber, horseName) => {
    const cleanedName = clean(horseName).replace(/^[–-]\s*/, '').split(/\b(?:V64|V65|V75|V85|V86|GS75)[-\s]?\d+\s+\d{1,2}\s+/i)[0].replace(/([a-zåäö])(?:var|har|ser|får|är|det|här|från|grymt|blev|höll|kan|piper|inlett|fått|gått)\b.*$/i, '$1').replace(/\s+(?:spikbud|skrällbud|spelvärd|given|tidigt).*$/i, '').trim();
    if (!cleanedName || Number(horseNumber) < 1 || Number(division) < 1 || !Number.isFinite(Number(division)) || !Number.isFinite(Number(horseNumber))) return;
    signals.push({ gameType: String(gameType || gameTypeHint).toUpperCase(), division: Number(division), horseNumber: Number(horseNumber), horseName: cleanedName, context: sourceText.slice(Math.max(0, match.index - 140), Math.min(sourceText.length, match.index + match[0].length + 260)) });
  };
  let match;
  const prefixPattern = /\b(V64|V65|V75|V85|V86|GS75)[-\s]?(\d+)\s*[–-]?\s*(\d{1,2})\s+([^\n\r]+?)(?=\r?\n|\s*\b(?:V64|V65|V75|V85|V86|GS75)[-\s]?\d+\s+\d{1,2}\s+|\s*$)/gi;
  while ((match = prefixPattern.exec(sourceText))) addSignal(match, match[1], match[2], match[3], match[4]);
  const suffixPattern = /\b(\d{1,2})\s+([A-ZÅÄÖ][^()\n\r]{1,80}?)\s*\(\s*(V64|V65|V75|V85|V86|GS75)[-\s]?(\d+)\s*\)/gi;
  while ((match = suffixPattern.exec(sourceText))) addSignal(match, match[3], match[4], match[1], match[2]);
  const seen = new Set();
  return signals.filter((signal) => { const key = `${signal.gameType}:${signal.division}:${signal.horseNumber}:${normalizeName(signal.horseName)}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

function parseArticles(articles = []) {
  const parsed = [];
  for (const article of articles) {
    const sourceId = String(article.sourceId || '').trim().toLowerCase();
    const sections = Array.isArray(article.sections) && article.sections.length ? article.sections : [{ tipster: article.tipster || '', text: article.text || '' }];
    for (const section of sections) {
      const tipster = resolveTipster(section.tipster || section.heading || '', sourceId);
      if (!tipster) continue;
      const horseLines = parseHorseLines(section.text || '', article.gameType || '');
      for (const horse of horseLines) {
        const signal = classifySignal(`${section.text || ''} ${horse.context}`);
        parsed.push({ ...horse, tipster, signal, source: { sourceId, url: String(article.url || ''), canonicalUrl: canonicalUrl(article.url || ''), articleTitle: clean(article.title), publishedAt: article.publishedAt || null } });
      }
    }
  }
  return parsed;
}

function canonicalUrl(value) {
  try { const url = new URL(value); url.search = ''; url.hash = ''; return url.toString(); } catch { return String(value || '').trim(); }
}

function consensusBonus(count) { return count >= 5 ? 25 : count === 4 ? 20 : count === 3 ? 14 : count === 2 ? 7 : 0; }
function outsiderBonus(percent) { if (percent === null || percent === undefined || percent === '') return 0; const value = Number(percent); if (!Number.isFinite(value)) return 0; return value <= 3 ? 8 : value <= 5 ? 6 : value <= 10 ? 3 : 0; }

function calculateBuzz(signals, marketPercent, availableTipsters = tipsterConfig.tipsters.filter((tipster) => tipster.enabled).length) {
  const usable = signals.filter((signal) => Number(signal.matching?.confidence ?? signal.matchConfidence ?? 1) >= 0.85);
  const positive = usable.filter((signal) => signal.signal?.positive ?? signal.positive);
  const negative = usable.filter((signal) => !(signal.signal?.positive ?? signal.positive));
  const weighted = positive.map((signal) => Number(signal.signal?.score ?? signal.signalScore ?? 0.5) * Number(signal.tipsterWeight ?? 1) * Number(signal.freshnessWeight ?? 1));
  const average = weighted.length ? weighted.reduce((sum, value) => sum + value, 0) / weighted.length : 0;
  const normalizedCount = Math.round((positive.length / Math.max(1, availableTipsters)) * 5);
  const negativePenalty = negative.reduce((sum, signal) => sum + (1 - Number(signal.signal?.score ?? signal.signalScore ?? 0.25)) * 8, 0);
  const market = marketPercent === null || marketPercent === undefined || marketPercent === '' ? null : Number(marketPercent);
  const score = clamp(average * 75 + consensusBonus(normalizedCount) + outsiderBonus(market) - negativePenalty, 0, 100);
  let classification = 'INGEN_STARK_SIGNAL';
  if (market !== null && market <= 5 && score >= 85) classification = 'HET_SKRÄLL';
  else if (market !== null && market <= 10 && score >= 80) classification = 'STARK_SKRÄLLSIGNAL';
  else if (score >= 90) classification = 'ELIT_SIGNAL';
  else if (score >= 80) classification = 'STARK_SIGNAL';
  else if (score >= 70) classification = 'POSITIV_SIGNAL';
  else if (score >= 55) classification = 'BEVAKA';
  return { score: Math.round(score), classification, positiveCount: positive.length, negativeCount: negative.length, availableCount: Math.min(availableTipsters, new Set(usable.map((signal) => signal.tipster?.id || signal.tipsterId)).size || 0) };
}

module.exports = { tipsterConfig, parseArticles, parseHorseLines, classifySignal, calculateBuzz, normalizeName, canonicalUrl };
