const GAME_TYPE_PROXY = { V85: 100, V86: 100, V75: 100, GS75: 90, V64: 75, V65: 75 };

function finite(value, fallback = null) {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function average(values, fallback = 50) { const usable = values.filter((value) => Number.isFinite(value)); return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : fallback; }
function distanceBucket(distance) { const value = finite(distance, 2140); return value <= 1700 ? 'sprint' : value <= 2300 ? 'middle' : 'long'; }
function normalizeOdds(odds) { const value = finite(odds); return value && value > 1 ? clamp((1 / value) * 100 * 3.2) : null; }
function marketShare(horse) { return clamp(finite(horse?.winPercent, 0)); }
function horseNumber(horse) { return finite(horse?.number, 0); }

function raceMeta(race, round) {
  const condition = race?.conditions || {};
  const prizes = race?.prizes || {};
  const distance = finite(race?.distance ?? race?.dist, null);
  const firstPrize = finite(race?.firstPrize ?? prizes.first, null);
  return {
    distance,
    startMethod: String(race?.startMethod || race?.startType || '').toUpperCase(),
    firstPrize,
    minEarnings: finite(race?.minEarnings ?? condition.minEarnings, null),
    maxEarnings: finite(race?.maxEarnings ?? condition.maxEarnings, null),
    trackCondition: race?.trackCondition || condition.trackCondition || '',
    track: round?.track || '',
  };
}

function recentStartsFor(horse) {
  const starts = horse?.recentStarts || horse?.history || horse?.latestStarts || horse?.lastStarts;
  return Array.isArray(starts) ? starts : [];
}

function placeScore(start) {
  const raw = String(start?.placeRaw ?? start?.place ?? '').toLowerCase();
  if (/^(1|1:a|v)/.test(raw)) return 100;
  const place = finite(start?.place, null);
  if (place === null) return /g|d|u/.test(raw) ? 12 : null;
  if (place === 1) return 100;
  if (place === 2) return 84;
  if (place === 3) return 72;
  if (place === 4) return 58;
  if (place === 5) return 48;
  return 30;
}

function historyMetrics(horse, meta) {
  const starts = recentStartsFor(horse).slice(0, 10);
  const recent = starts.slice(0, 5);
  const placeScores = recent.map(placeScore).filter((value) => value !== null);
  const wins = starts.filter((start) => finite(start?.place, null) === 1).length;
  const top3 = starts.filter((start) => { const place = finite(start?.place, null); return place !== null && place <= 3; }).length;
  const gallops = starts.filter((start) => /g|galopp/i.test(String(start?.placeRaw || start?.result || '')) || start?.gallop || start?.disqualified).length;
  const methodStarts = starts.filter((start) => !meta.startMethod || String(start?.startMethod || '').toUpperCase() === meta.startMethod);
  const methodGallops = methodStarts.filter((start) => /g|galopp/i.test(String(start?.placeRaw || start?.result || '')) || start?.gallop || start?.disqualified).length;
  const distance = meta.distance;
  const distanceStarts = distance ? starts.filter((start) => Math.abs(finite(start?.distance, distance) - distance) <= 120) : [];
  const distanceWins = distanceStarts.filter((start) => finite(start?.place, null) === 1).length;
  const confidenceCount = starts.length;
  const confidence = confidenceCount >= 20 ? 'HIGH' : confidenceCount >= 6 ? 'MEDIUM' : confidenceCount ? 'LOW' : 'VERY_LOW';
  const recentCAP = average(placeScores, null);
  const winConversion = top3 ? (wins / top3) * 100 : wins ? 75 : null;
  const gallopRisk = starts.length ? clamp((gallops / starts.length) * 100) : 35;
  const distanceFit = distanceStarts.length ? clamp(50 + ((distanceWins / distanceStarts.length) * 100 - 35) * 0.7) : null;
  const methodFit = methodStarts.length ? clamp(70 - (methodGallops / methodStarts.length) * 60 + (methodStarts.filter((start) => finite(start?.place, null) === 1).length / methodStarts.length) * 20) : null;
  return { starts, recentCAP, wins, top3, winConversion, gallopRisk, distanceFit, methodFit, confidence, confidenceCount };
}

function tipsterFor(tipsterBuzz, race, horse) {
  const buzzRace = tipsterBuzz?.races?.find((item) => Number(item.division) === Number(race?.division));
  return buzzRace?.horses?.find((item) => Number(item.number) === horseNumber(horse)) || null;
}

function scoreHorse(horse, race, round, tipsterBuzz) {
  const meta = raceMeta(race, round);
  const history = historyMetrics(horse, meta);
  const market = marketShare(horse);
  const oddsScore = normalizeOdds(horse?.winOdds);
  const trend = finite(horse?.startTrendPercent ?? horse?.trendPercent, null);
  const trendScore = trend === null ? 50 : clamp(50 + (trend - 50) * 0.7);
  const buzzHorse = tipsterFor(tipsterBuzz, race, horse);
  const buzz = clamp(buzzHorse?.buzz?.score, 0);
  const buzzPositive = finite(buzzHorse?.buzz?.positiveCount, 0);
  const historyAvailable = history.confidenceCount > 0;
  const raceStrength = clamp((GAME_TYPE_PROXY[round?.gameType] || 55) * 0.58 + Math.min(100, Math.log1p(meta.firstPrize || 0) * 7) * 0.42);
  const classFit = historyAvailable && meta.firstPrize ? clamp(50 + ((history.recentCAP || 50) - raceStrength) * 0.45) : 50;
  const adjustedTime = historyAvailable ? clamp((history.recentCAP || 50) * 0.65 + trendScore * 0.35) : trendScore;
  const cap = clamp(adjustedTime * 0.35 + raceStrength * 0.3 + (history.recentCAP || 50) * 0.2 + (oddsScore ?? 50) * 0.15);
  const winConversion = history.winConversion ?? (market ? clamp(market + (trendScore - 50) * 0.25) : 50);
  const todayFit = clamp(
    (history.distanceFit ?? 50) * 0.25
      + (history.methodFit ?? 50) * 0.2
      + 50 * 0.15
      + 50 * 0.15
      + classFit * 0.15
      + (historyAvailable ? 55 : 50) * 0.1,
  );
  const reliability = clamp(100 - history.gallopRisk * 0.48 + (historyAvailable ? Math.min(18, history.confidenceCount) : 0) + (history.recentCAP === null ? 0 : (100 - Math.abs(history.recentCAP - 65)) * 0.15));
  const driver = finite(horse?.driverScore ?? horse?.driverRating, null) ?? 50;
  const modelChance = clamp(
    market * 0.25
      + ((oddsScore ?? market) || 50) * 0.2
      + cap * 0.2
      + todayFit * 0.15
      + reliability * 0.08
      + driver * 0.05
      + (buzz || 50) * 0.07,
  );
  const estimatedWinProbability = clamp(modelChance * 0.62 + market * 0.38);
  const edge = estimatedWinProbability - market;
  const equipment = horse?.equipmentChange || horse?.equipment ? 55 : 50;
  const spikScore = clamp(
    cap * 0.3
      + todayFit * 0.2
      + reliability * 0.15
      + driver * 0.1
      + equipment * 0.05
      + clamp(50 + edge * 1.8) * 0.2,
  );
  const falseFavoriteRisk = market >= 20 ? clamp(35 + Math.max(0, market - estimatedWinProbability) * 1.6 + history.gallopRisk * 0.22 + (100 - todayFit) * 0.22 + (winConversion < 45 ? 12 : 0)) : clamp(18 + history.gallopRisk * 0.18 + (100 - todayFit) * 0.12);
  let recommendation = 'GARDERA';
  if (market >= 30 && falseFavoriteRisk >= 67) recommendation = 'FÄLL FAVORITEN';
  else if (market <= 12 && spikScore >= 68 && edge >= 8) recommendation = 'SKRÄLLSPIK';
  else if (spikScore >= 78 && edge >= 7) recommendation = 'VÄRDESPIK';
  else if (spikScore >= 78 && reliability >= 65 && falseFavoriteRisk < 42) recommendation = 'TRYGG SPIK';
  const plus = [];
  const minus = [];
  if (historyAvailable && (history.recentCAP || 0) >= 70) plus.push('hög CAP i de senaste starterna');
  if (historyAvailable && history.distanceFit >= 65) plus.push(`dokumenterat bra över ${meta.distance || 'dagens distans'} m`);
  if (edge >= 7) plus.push(`positiv marknadsedge på ${Math.round(edge)}%`);
  if (buzz >= 55 || buzzPositive > 0) plus.push('positiv Tipster Buzz');
  if (classFit >= 62) plus.push('passar loppets klass');
  if (history.gallopRisk >= 38) minus.push(`${Math.round(history.gallopRisk)}% uppskattad galopprisk`);
  if (falseFavoriteRisk >= 58 && market >= 20) minus.push('risk att vara överstreckad');
  if (!historyAvailable) minus.push('historik saknas ännu');
  if (history.winConversion !== null && history.winConversion < 45) minus.push('låg segerkonvertering från topp-3');
  if (!plus.length) plus.push('startlistans marknadsdata ger grundsignalen');
  if (!minus.length) minus.push('inga tydliga varningssignaler i tillgänglig data');
  return {
    ...horse,
    meta,
    history,
    market,
    oddsScore,
    adjustedTime,
    raceStrength,
    classFit,
    cap,
    todayFit,
    reliability,
    driver,
    modelChance: estimatedWinProbability,
    confidence: history.confidence,
    edge,
    spikScore,
    falseFavoriteRisk,
    recommendation,
    buzz,
    plus,
    minus,
  };
}

function rankLabel(index) { return index === 0 ? '1' : index === 1 ? '2' : index === 2 ? '3' : String(index + 1); }

export function calculateSpikeEngine(round, tipsterBuzz = null) {
  const races = (round?.races || []).map((race) => {
    const horses = (race.horses || []).filter((horse) => !horse.scratched).map((horse) => scoreHorse(horse, race, round, tipsterBuzz)).sort((a, b) => b.spikScore - a.spikScore || b.modelChance - a.modelChance);
    return { ...race, meta: raceMeta(race, round), horses, top: horses[0] || null };
  });
  const ranking = races.flatMap((race) => race.horses.slice(0, 3).map((horse) => ({ ...horse, division: race.division, race }))).sort((a, b) => b.spikScore - a.spikScore || b.modelChance - a.modelChance).slice(0, 10).map((item, index) => ({ ...item, rank: rankLabel(index) }));
  const vulnerableFavorites = races.map((race) => race.horses[0]).filter((horse) => horse && horse.market >= 20 && horse.falseFavoriteRisk >= 55).sort((a, b) => b.falseFavoriteRisk - a.falseFavoriteRisk).map((horse) => ({ ...horse, division: races.find((race) => race.horses.some((item) => item.id === horse.id))?.division }));
  const candidates = ranking.slice(0, 2);
  const duel = candidates.length === 2 ? { left: candidates[0], right: candidates[1], verdict: candidates[0].edge >= candidates[1].edge ? `${candidates[0].name} är bättre värdespik` : `${candidates[1].name} är bättre värdespik` } : null;
  const rowPrice = finite(round?.rowPrice, 1) || 1;
  const averageRows = (round?.races || []).reduce((sum, race) => sum + Math.max(1, race.horses?.length || 1), 0);
  return { races, ranking, vulnerableFavorites, duel, rowPrice, averageRows, generatedAt: new Date().toISOString() };
}
