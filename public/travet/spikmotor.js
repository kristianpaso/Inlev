const GAME_TYPE_PROXY = { V85: 100, V86: 100, V75: 100, GS75: 90, V64: 75, V65: 75 };

function finite(value, fallback = null) {
  const raw = String(value ?? '').replace('%', '').replace(',', '.').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function average(values, fallback = 50) { const usable = values.filter((value) => Number.isFinite(value)); return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : fallback; }
function distanceBucket(distance) { const value = finite(distance, 2140); return value <= 1700 ? 'sprint' : value <= 2300 ? 'middle' : 'long'; }
function normalizeOdds(odds) { const value = finite(odds); return value && value > 1 ? clamp((1 / value) * 100 * 3.2) : null; }
function marketShare(horse) { return clamp(finite(horse?.winPercent, 0)); }
function horseNumber(horse) { return finite(horse?.number, 0); }

function firstPresent(...values) {
  return values.find((value) => {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return String(value).trim() !== '';
  }) ?? '';
}

function normalizeShoeCode(value) {
  if (value && typeof value === 'object') {
    const code = value.code ?? value.rawCode ?? value.value ?? value.type ?? value.name;
    const front = value.front ?? value.fram ?? value.frontShoes ?? value.frontBarefoot;
    const rear = value.rear ?? value.back ?? value.bak ?? value.rearShoes ?? value.rearBarefoot;
    if (front !== undefined || rear !== undefined) {
      const shoeState = (part) => {
        if (part === true) return true;
        if (part === false) return false;
        if (!part || typeof part !== 'object') return /shoe|sko|yes|true|ja/i.test(String(part));
        const nested = part.hasShoe ?? part.hasShoes ?? part.shoes;
        return nested === true || (nested === undefined && /shoe|sko|yes|true|ja/i.test(String(part.code ?? part.name ?? '')));
      };
      const frontShoes = shoeState(front);
      const rearShoes = shoeState(rear);
      return frontShoes ? (rearShoes ? 'CC' : 'CB') : (rearShoes ? 'BC' : 'BB');
    }
    value = code ?? '';
  }
  const rawValue = String(value ?? '').trim().replace(/\s+/g, ' ');
  const rawCompact = rawValue.replace(/\s+/g, '');
  const encodedSuffix = rawCompact.slice(-2);
  // pdf-parse återger ibland ATG:s centtecken (¢) som versalt C.
  const encodedCode = { cC: 'CB', Cc: 'BC', CC: 'BB', 'c¢': 'CB', '¢c': 'BC', '¢¢': 'BB' }[encodedSuffix];
  if (encodedCode) return encodedCode;
  const raw = rawValue.toLowerCase();
  const compact = raw.replace(/\s+/g, '');
  if (!raw || compact === '[objectobject]' || raw.includes('[object object]')) return '';
  if (raw.includes('¢¢') || compact === 'bb' || raw.includes('barfota runt')) return 'BB';
  if (raw.includes('¢c') || compact === 'bc' || raw.includes('barfota fram') || raw.includes('skor bak')) return 'BC';
  if (raw.includes('c¢') || compact === 'cb' || raw.includes('skor fram') || raw.includes('barfota bak')) return 'CB';
  if (compact === 'cc' || raw.includes('skor runt') || raw === 'skor' || raw === 'shoes') return 'CC';
  return raw;
}

function shoeType(value) {
  return { CC: 'SHOES_ALL', BC: 'BAREFOOT_FRONT', CB: 'BAREFOOT_REAR', BB: 'BAREFOOT_ALL' }[normalizeShoeCode(value)] || 'UNKNOWN';
}

function shoeLabel(value) {
  const code = normalizeShoeCode(value);
  return { CC: 'Skor runt om', BC: 'Barfota fram · skor bak', CB: 'Skor fram · barfota bak', BB: 'Barfota runt om' }[code] || (code ? String(value) : 'Saknas');
}

function normalizeWagon(value) {
  if (value && typeof value === 'object') value = value.code ?? value.type ?? value.model ?? value.name ?? value.value ?? (value.american || value.amerikansk ? 'AMERICAN' : '');
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw.replace(/\s+/g, '') === '[objectobject]') return '';
  if (/amerik|american|jänkar|bike|jank/.test(raw)) return 'AMERICAN';
  if (/vanlig|tradition|standard|regular|sulky/.test(raw)) return 'STANDARD';
  return raw;
}

function wagonLabel(value) {
  const code = normalizeWagon(value);
  return { AMERICAN: 'Amerikansk sulky', STANDARD: 'Vanlig sulky', REGULAR: 'Vanlig sulky' }[code] || (code ? String(value) : 'Saknas');
}

function startDateValue(start) {
  const raw = String(start?.date || start?.raceDate || '').trim();
  if (!raw) return null;
  // Banprogrammen innehåller ibland bara året (t.ex. "2026"). Det är
  // användbart som historikrad men får inte tolkas som 1 januari när vi
  // räknar dagar sedan senaste start.
  if (/^\d{4}(?:-\d{2})?$/.test(raw)) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function performanceFit(starts) {
  if (!starts.length) return { score: null, wins: 0, top3: 0, sample: 0 };
  const wins = starts.filter((start) => finite(start?.place, null) === 1).length;
  const top3 = starts.filter((start) => { const place = finite(start?.place, null); return place !== null && place <= 3; }).length;
  const success = 35 + (wins / starts.length) * 45 + (top3 / starts.length) * 20;
  const confidence = Math.min(1, starts.length / 4);
  return { score: clamp(50 + (success - 50) * confidence), wins, top3, sample: starts.length };
}

function contextualStarts(starts, horse, meta) {
  const currentDistance = finite(horse?.distance ?? meta.distance, null);
  const currentPost = finite(horse?.postPosition ?? horse?.startingPosition ?? horse?.number, null);
  const trackKey = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const currentTrack = trackKey(meta.track);
  const currentMethod = String(meta.startMethod || '').toUpperCase();
  return starts.filter((start) => {
    const track = trackKey(start?.track || start?.trackId);
    const method = String(start?.startMethod || '').toUpperCase();
    const distance = finite(start?.distance, null);
    const post = finite(start?.postPosition ?? start?.startingPosition, null);
    const trackMatch = !currentTrack || !track || track === currentTrack || track.includes(currentTrack) || currentTrack.includes(track) || (track.length >= 2 && currentTrack.length >= 2 && track.slice(0, 2) === currentTrack.slice(0, 2));
    const methodMatch = !currentMethod || !method || method === currentMethod;
    const distanceMatch = currentDistance === null || distance === null || Math.abs(distance - currentDistance) <= 120;
    const postMatch = currentPost === null || post === null || post === currentPost;
    return trackMatch && methodMatch && distanceMatch && postMatch;
  });
}

function confidenceForSample(sample) {
  return sample >= 10 ? 'HIGH' : sample >= 4 ? 'MEDIUM' : sample >= 1 ? 'LOW' : 'VERY_LOW';
}

function postPositionBucket(post, startMethod = '') {
  const value = finite(post, null);
  if (String(startMethod).toUpperCase() === 'VOLT' && (value === null || value > 8)) return 'SPECIAL';
  if (value === null) return 'UNKNOWN';
  return value <= 3 ? 'INNER' : value <= 6 ? 'MIDDLE' : 'OUTER';
}

function layoffBucket(days) {
  if (days === null || days === undefined) return 'UNKNOWN';
  if (days <= 14) return '0_14';
  if (days <= 30) return '15_30';
  if (days <= 45) return '31_45';
  if (days <= 75) return '46_75';
  if (days <= 120) return '76_120';
  return '120_plus';
}

function profileStats(starts) {
  const list = Array.isArray(starts) ? starts : [];
  const wins = list.filter((start) => finite(start?.place, null) === 1).length;
  const top3 = list.filter((start) => { const place = finite(start?.place, null); return place !== null && place <= 3; }).length;
  const caps = list.map((start) => finite(start?.CAP ?? start?.cap ?? start?.capScore, null) ?? placeScore(start)).filter((value) => value !== null);
  const adjustedTimes = list.map((start) => finite(start?.adjustedTimeScore ?? start?.adjustedTime ?? start?.kmTimeScore, null) ?? placeScore(start)).filter((value) => value !== null);
  const gallops = list.filter((start) => /g|galopp/i.test(String(start?.placeRaw || start?.result || '')) || start?.gallop || start?.disqualified).length;
  return {
    starts: list.length,
    wins,
    seconds: list.filter((start) => finite(start?.place, null) === 2).length,
    thirds: list.filter((start) => finite(start?.place, null) === 3).length,
    top3,
    winRate: list.length ? wins / list.length * 100 : null,
    top3Rate: list.length ? top3 / list.length * 100 : null,
    avgCAP: caps.length ? average(caps, null) : null,
    avgAdjustedTime: adjustedTimes.length ? average(adjustedTimes, null) : null,
    gallopRate: list.length ? gallops / list.length * 100 : null,
    confidence: confidenceForSample(list.length),
  };
}

function fitFromProfile(profile) {
  if (!profile?.starts) return null;
  const raw = average([
    profile.winRate === null ? null : 50 + (profile.winRate - 12) * 1.35,
    profile.top3Rate === null ? null : 50 + (profile.top3Rate - 35) * 0.45,
    profile.avgCAP === null ? null : profile.avgCAP,
    profile.gallopRate === null ? null : 70 - profile.gallopRate * 0.45,
  ], 50);
  const shrink = Math.min(1, profile.starts / 8);
  return clamp(50 + (raw - 50) * shrink);
}

function normalizedTrack(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function sameTrackName(left, right) {
  const a = normalizedTrack(left);
  const b = normalizedTrack(right);
  return !a || !b || a === b || a.includes(b) || b.includes(a) || (a.length >= 2 && b.length >= 2 && a.slice(0, 2) === b.slice(0, 2));
}

function equipmentContextStarts(starts, horse, meta, shoe, wagon) {
  const distance = finite(horse?.distance ?? meta.distance, null);
  const post = finite(horse?.postPosition ?? horse?.startingPosition ?? horse?.number, null);
  const method = String(meta.startMethod || '').toUpperCase();
  const track = meta.track;
  const bucket = distanceBucket(distance);
  const postBucket = postPositionBucket(post, method);
  const matches = (options) => starts.filter((start) => {
    const startShoe = normalizeShoeCode(start?.shoeCode ?? start?.shoes ?? start?.shoe);
    const startWagon = normalizeWagon(start?.sulky ?? start?.wagon ?? start?.cart ?? start?.vagn);
    if (options.shoe && startShoe !== shoe) return false;
    if (options.wagon && startWagon !== wagon) return false;
    if (options.method && method && String(start?.startMethod || '').toUpperCase() !== method) return false;
    const startDistance = finite(start?.distance, null);
    if (options.distance && distance !== null && startDistance !== null && Math.abs(startDistance - distance) > 120) return false;
    if (options.bucket && startDistance !== null && distance !== null && distanceBucket(startDistance) !== bucket) return false;
    if (options.track && start?.track && !sameTrackName(start.track, track)) return false;
    if (options.post && post !== null && finite(start?.postPosition ?? start?.startingPosition, null) !== null && postPositionBucket(start.postPosition ?? start.startingPosition, method) !== postBucket) return false;
    return true;
  });
  const levels = [
    { name: 'EXACT', options: { shoe: Boolean(shoe), wagon: Boolean(wagon), track: true, distance: true, method: true, post: true } },
    { name: 'DISTANCE_METHOD', options: { shoe: Boolean(shoe), wagon: Boolean(wagon), distance: true, method: true } },
    { name: 'METHOD', options: { shoe: Boolean(shoe), wagon: Boolean(wagon), method: true, bucket: true } },
    { name: 'SETUP', options: { shoe: Boolean(shoe), wagon: Boolean(wagon) } },
    { name: 'SHOES', options: { shoe: Boolean(shoe) } },
  ];
  let fallback = [];
  for (const level of levels) {
    const candidate = matches(level.options);
    if (!fallback.length) fallback = candidate;
    if (candidate.length >= 4) return { starts: candidate, level: level.name };
  }
  return { starts: fallback, level: fallback.length ? 'LOW_SAMPLE' : 'BASELINE' };
}

function raceMeta(race, round) {
  const condition = race?.conditions || {};
  const prizes = race?.prizes || {};
  const distance = finite(race?.distance ?? race?.dist, null);
  const firstPrize = finite(race?.firstPrize ?? prizes.first, null);
  return {
    distance,
    startMethod: String(race?.startMethod || race?.startType || '').toUpperCase(),
    raceDate: round?.date || race?.date || '',
    firstPrize,
    minEarnings: finite(race?.minEarnings ?? condition.minEarnings, null),
    maxEarnings: finite(race?.maxEarnings ?? condition.maxEarnings, null),
    trackCondition: race?.trackCondition || condition.trackCondition || '',
    track: race?.track || race?.trackName || race?.venue || round?.track || '',
  };
}

function recentStartsFor(horse) {
  const history = horse?.history;
  const starts = firstPresent(
    horse?.recentStarts,
    Array.isArray(history) ? history : null,
    history?.recentStarts,
    history?.starts,
    horse?.latestStarts,
    horse?.lastStarts,
    horse?.programHistory?.recentStarts,
    horse?.programHistory?.history?.recentStarts,
  );
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
  const starts = recentStartsFor(horse).map((start) => ({ ...start })).sort((left, right) => (startDateValue(right)?.getTime() || 0) - (startDateValue(left)?.getTime() || 0)).slice(0, 10);
  const recent = starts.slice(0, 5);
  const overallProfile = profileStats(starts);
  const wins = overallProfile.wins;
  const top3 = overallProfile.top3;
  const confidenceCount = starts.length;
  const confidence = confidenceForSample(confidenceCount);
  const recentCAP = overallProfile.avgCAP;
  const winConversion = top3 ? (wins / top3) * 100 : wins ? 75 : null;
  const gallopRisk = overallProfile.gallopRate === null ? 35 : overallProfile.gallopRate;
  const distance = meta.distance;
  const distanceStarts = distance ? starts.filter((start) => { const value = finite(start?.distance, null); return value === null || Math.abs(value - distance) <= 120; }) : [];
  const methodStarts = starts.filter((start) => !meta.startMethod || !start?.startMethod || String(start.startMethod).toUpperCase() === meta.startMethod);
  const methodGallops = methodStarts.filter((start) => /g|galopp/i.test(String(start?.placeRaw || start?.result || '')) || start?.gallop || start?.disqualified).length;
  const distanceWins = distanceStarts.filter((start) => finite(start?.place, null) === 1).length;
  const distanceFit = distanceStarts.length ? clamp(50 + ((distanceWins / distanceStarts.length) * 100 - 35) * 0.7) : null;
  const methodFit = methodStarts.length ? clamp(70 - (methodGallops / methodStarts.length) * 60 + (methodStarts.filter((start) => finite(start?.place, null) === 1).length / methodStarts.length) * 20) : null;
  const programHistory = horse?.programHistory || {};
  const currentShoe = normalizeShoeCode(firstPresent(horse?.shoeCode, horse?.shoes, horse?.shoe, horse?.equipment?.shoeCode, horse?.equipment?.shoes, programHistory?.shoeCode, programHistory?.shoes, programHistory?.shoe, programHistory?.equipment?.shoeCode));
  const currentWagon = normalizeWagon(firstPresent(horse?.sulky, horse?.wagon, horse?.cart, horse?.vagn, horse?.equipment?.wagon, horse?.equipment?.cart, programHistory?.sulky, programHistory?.wagon, programHistory?.cart, programHistory?.vagn, programHistory?.equipment?.wagon));
  const shoeHistory = currentShoe ? starts.filter((start) => normalizeShoeCode(start?.shoeCode ?? start?.shoes ?? start?.shoe ?? start?.equipment?.shoesRaw) === currentShoe) : [];
  const shoeDataHistory = starts.filter((start) => Boolean(normalizeShoeCode(start?.shoeCode ?? start?.shoes ?? start?.shoe ?? start?.equipment?.shoesRaw)));
  const wagonHistory = currentWagon ? starts.filter((start) => normalizeWagon(start?.sulky ?? start?.wagon ?? start?.cart ?? start?.vagn ?? start?.equipment?.cartRaw) === currentWagon) : [];
  const combinationHistory = currentShoe && currentWagon ? starts.filter((start) => normalizeShoeCode(start?.shoeCode ?? start?.shoes ?? start?.shoe ?? start?.equipment?.shoesRaw) === currentShoe && normalizeWagon(start?.sulky ?? start?.wagon ?? start?.cart ?? start?.vagn ?? start?.equipment?.cartRaw) === currentWagon) : [];
  const contextSelection = equipmentContextStarts(starts, horse, meta, currentShoe, currentWagon);
  const contextHistory = contextSelection.starts;
  const shoeProfile = profileStats(shoeHistory);
  const shoeDataProfile = profileStats(shoeDataHistory);
  const wagonProfile = profileStats(wagonHistory);
  const combinationProfile = profileStats(combinationHistory);
  const contextProfile = profileStats(contextHistory);
  // När exakt dagens balans inte finns i historiken ska Sko-fit ändå använda
  // hästens importerade skohistorik som ett försiktigt fallback-underlag.
  // Annars blir alla hästar med en ny/ovanlig balans felaktigt 50 trots att
  // det finns flera historiska starter med registrerade skor.
  const shoeFit = fitFromProfile(shoeProfile);
  const shoeDataFit = fitFromProfile(shoeDataProfile);
  const effectiveShoeFit = shoeFit ?? shoeDataFit;
  const wagonFit = fitFromProfile(wagonProfile);
  const combinationFit = fitFromProfile(combinationProfile);
  // Vagnens aktuella värde kommer från dagens importerade startlista, medan
  // vagnhistorik inte alltid finns i källan. Visa därför ett preliminärt
  // setup-fit baserat på skohistorik + neutral vagnbas tills kombinationsdata
  // finns, i stället för att lämna Dagens setup tomt.
  const setupFit = combinationFit ?? (effectiveShoeFit === null ? null : average([effectiveShoeFit, 50], 50));
  const contextualEquipmentFit = average([effectiveShoeFit, wagonFit, combinationFit], 50);
  const trackStarts = starts.filter((start) => !start?.track || sameTrackName(start.track, meta.track));
  const post = finite(horse?.postPosition ?? horse?.startingPosition ?? horse?.number, null);
  const postStarts = post === null ? [] : starts.filter((start) => { const startPost = finite(start?.postPosition ?? start?.startingPosition, null); return startPost === null || postPositionBucket(startPost, meta.startMethod) === postPositionBucket(post, meta.startMethod); });
  const trackFit = fitFromProfile(profileStats(trackStarts));
  const postPositionFit = fitFromProfile(profileStats(postStarts));
  const chronologicalStarts = [...starts].sort((left, right) => (startDateValue(left)?.getTime() || 0) - (startDateValue(right)?.getTime() || 0));
  const layoffProfiles = {};
  for (let index = 1; index < chronologicalStarts.length; index += 1) {
    const previous = startDateValue(chronologicalStarts[index - 1]);
    const current = startDateValue(chronologicalStarts[index]);
    if (!previous || !current) continue;
    const bucket = layoffBucket(Math.max(0, Math.round((current - previous) / 86400000)));
    (layoffProfiles[bucket] ||= []).push(chronologicalStarts[index]);
  }
  const datedStarts = starts.map((start) => startDateValue(start)).filter(Boolean).sort((a, b) => b - a);
  const lastStart = datedStarts[0] || null;
  const raceDate = startDateValue({ date: meta.raceDate });
  const layoffDays = lastStart && raceDate ? Math.max(0, Math.round((raceDate - lastStart) / 86400000)) : null;
  const currentLayoffBucket = layoffBucket(layoffDays);
  const layoffProfile = profileStats(layoffProfiles[currentLayoffBucket] || []);
  const rawLayoffRisk = layoffDays === null ? 0 : layoffDays <= 45 ? 15 : 15 + (layoffDays - 45) * 0.55;
  const layoffRisk = layoffDays === null ? 0 : layoffProfile.starts >= 4 ? clamp(60 - (fitFromProfile(layoffProfile) || 50) * 0.45 + (layoffProfile.gallopRate || 0) * 0.15) : clamp(rawLayoffRisk);
  const layoffFit = layoffDays === null ? null : clamp(100 - layoffRisk);
  const recencyFitness = layoffDays === null ? 50 : clamp(100 - layoffRisk * 0.7 + Math.min(12, starts.filter((start) => { const date = startDateValue(start); return date && raceDate && (raceDate - date) / 86400000 <= 90; }).length * 3));
  const last = starts[0] || null;
  const lastShoe = normalizeShoeCode(last?.shoeCode ?? last?.shoes ?? last?.shoe ?? last?.equipment?.shoesRaw);
  const lastWagon = normalizeWagon(last?.sulky ?? last?.wagon ?? last?.cart ?? last?.vagn ?? last?.equipment?.cartRaw);
  const oldSetup = lastShoe && lastWagon ? starts.filter((start) => normalizeShoeCode(start?.shoeCode ?? start?.shoes ?? start?.shoe ?? start?.equipment?.shoesRaw) === lastShoe && normalizeWagon(start?.sulky ?? start?.wagon ?? start?.cart ?? start?.vagn ?? start?.equipment?.cartRaw) === lastWagon) : [];
  const oldSetupFit = fitFromProfile(profileStats(oldSetup));
  const equipmentChange = { shoesChanged: Boolean(currentShoe && lastShoe && currentShoe !== lastShoe), cartChanged: Boolean(currentWagon && lastWagon && currentWagon !== lastWagon), last: { shoes: lastShoe, cart: lastWagon }, today: { shoes: currentShoe, cart: currentWagon } };
  return {
    starts,
    recentCAP,
    wins,
    top3,
    winConversion,
    gallopRisk,
    distanceFit,
    methodFit,
    confidence,
    confidenceCount,
    currentShoe,
    currentShoeType: shoeType(currentShoe),
    currentWagon,
    currentCartType: currentWagon || 'UNKNOWN',
    contextFit: fitFromProfile(contextProfile),
    contextSample: contextProfile.starts,
    contextLevel: contextSelection.level,
    shoeProfile,
    shoeDataProfile,
    wagonProfile,
    combinationProfile,
    equipmentCombinationProfile: combinationProfile,
    contextualEquipmentProfile: contextProfile,
    shoeFit,
    shoeDataFit,
    shoeWins: shoeProfile.wins,
    shoeSample: shoeProfile.starts,
    wagonFit,
    wagonWins: wagonProfile.wins,
    wagonSample: wagonProfile.starts,
    combinationFit,
    setupFit,
    combinationWins: combinationProfile.wins,
    combinationSample: combinationProfile.starts,
    equipmentFit: contextualEquipmentFit,
    trackFit,
    postPositionFit,
    postPositionBucket: postPositionBucket(post, meta.startMethod),
    equipmentChange,
    equipmentChangeDelta: oldSetupFit === null ? 0 : contextualEquipmentFit - oldSetupFit,
    equipmentConfidence: confidenceForSample(Math.max(shoeProfile.starts, shoeDataProfile.starts, wagonProfile.starts, combinationProfile.starts)),
    recencyFitness,
    layoffBucket: currentLayoffBucket,
    layoffProfiles: Object.fromEntries(Object.entries(layoffProfiles).map(([bucket, values]) => [bucket, profileStats(values)])),
    layoffProfile,
    layoffConfidence: layoffProfile.confidence,
    layoffDays,
    layoffRisk,
    layoffFit,
  };
}

function tipsterFor(tipsterBuzz, race, horse) {
  const buzzRace = tipsterBuzz?.races?.find((item) => Number(item.division) === Number(race?.division));
  return buzzRace?.horses?.find((item) => Number(item.number) === horseNumber(horse)) || null;
}

function startPerformanceValue(start) {
  return finite(start?.CAP ?? start?.cap ?? start?.capScore, null) ?? placeScore(start) ?? 50;
}

function formTrendFor(starts) {
  const values = starts.slice(0, 6).map(startPerformanceValue).filter(Number.isFinite);
  if (values.length < 2) return 0;
  const oldest = values[values.length - 1];
  const newest = values[0];
  return clamp((newest - oldest) * 2, -100, 100);
}

function currentCapacityFor(starts) {
  return starts.length ? clamp(average(starts.slice(0, 5).map(startPerformanceValue), 50)) : 50;
}

function positionPerformanceFor(starts, position) {
  const normalized = String(position || '').toLowerCase();
  const matches = starts.filter((start) => {
    const value = String(start?.runningPosition || start?.positionType || start?.racePosition || start?.position || '').toLowerCase();
    return value && (value.includes(normalized) || normalized.includes(value));
  });
  return { position, profile: profileStats(matches), fit: fitFromProfile(profileStats(matches)), sample: matches.length };
}

function paceScenarioForRace(race) {
  const horses = Array.isArray(race?.horses) ? race.horses : [];
  const method = String(race?.startMethod || race?.startType || '').toUpperCase();
  const raw = horses.map((horse, index) => {
    const post = finite(horse?.postPosition ?? horse?.startingPosition ?? horse?.number, index + 1) || index + 1;
    const speedHint = finite(horse?.leadProbability ?? horse?.startSpeedScore ?? horse?.speedScore, null);
    const laneScore = post <= 3 ? 38 : post <= 6 ? 25 : post <= 9 ? 16 : 8;
    const methodScore = method === 'AUTO' ? 16 : 10;
    return { horse, post, value: laneScore + methodScore + (speedHint === null ? 0 : (speedHint - 50) * 0.35) };
  });
  const maximum = Math.max(...raw.map((item) => item.value), 1);
  const minimum = Math.min(...raw.map((item) => item.value), maximum);
  const spread = maximum - minimum;
  const ordered = [...raw].sort((left, right) => right.value - left.value);
  const topGap = ordered.length > 1 ? ordered[0].value - ordered[1].value : 20;
  const pressure = clamp(32 + Math.max(0, 18 - topGap) * 2 + (ordered.length > 9 ? 6 : 0) + (method === 'AUTO' ? 4 : 0));
  const clarity = clamp(58 + topGap * 2.4 - pressure * 0.18);
  const byHorseId = {};
  ordered.forEach((item, position) => {
    const leadProbability = clamp(30 + ((item.value - minimum) / Math.max(1, spread)) * 48 + (item.post <= 3 ? 8 : 0));
    const expectedPosition = position === 0 ? 'Ledningen' : position === 1 ? 'Rygg ledaren' : position === 2 ? 'Utvändigt ledaren' : position <= 4 ? 'Andra utvändigt' : 'Långt bak';
    const pacePressure = pressure >= 68 ? 'Hög' : pressure >= 48 ? 'Medel' : 'Låg';
    byHorseId[String(item.horse.id ?? item.horse.number)] = { leadProbability, expectedPosition, pacePressure, paceClarity: clarity };
  });
  return { leadProbability: ordered[0] ? byHorseId[String(ordered[0].horse.id ?? ordered[0].horse.number)]?.leadProbability || 50 : 50, positionAfter500m: ordered[0] ? 'Ledningen' : 'Okänd', pacePressure: pressure >= 68 ? 'Hög' : pressure >= 48 ? 'Medel' : 'Låg', pacePressureScore: pressure, paceClarity: clarity, byHorseId };
}

function paceFitForHorse(horse, pace) {
  const position = pace?.expectedPosition || 'Okänd';
  const starts = recentStartsFor(horse);
  const keywords = position === 'Ledningen' ? ['ledning', 'ledningen', 'front'] : position === 'Rygg ledaren' ? ['rygg', 'ledarrygg'] : position === 'Utvändigt ledaren' ? ['död', 'utvändigt'] : position === 'Andra utvändigt' ? ['andra', 'utvändigt'] : ['bak', 'kö'];
  const positionStarts = starts.filter((start) => keywords.some((keyword) => String(start?.runningPosition || start?.positionType || start?.racePosition || '').toLowerCase().includes(keyword)));
  const profileFit = fitFromProfile(profileStats(positionStarts));
  const leadBoost = position === 'Ledningen' ? (pace.leadProbability || 50) * 0.35 : (100 - (pace.leadProbability || 50)) * 0.08;
  return clamp((profileFit === null ? 50 : profileFit) * 0.65 + leadBoost + (pace.paceClarity || 50) * 0.15);
}

function trainerFormFor(horse) {
  return clamp(finite(horse?.trainerForm ?? horse?.trainerFormScore, null) ?? 50);
}

function driverChangeFor(horse) {
  return clamp(finite(horse?.driverChangeScore, null) ?? finite(horse?.driverScore ?? horse?.driverRating, null) - 50, -100, 100);
}

function edgeFromMarket(market, oddsScore, infoScore) {
  const externalSignal = (oddsScore ?? market) * 0.72 + (infoScore || 50) * 0.28;
  return clamp(externalSignal - market, -100, 100);
}

function scoreHorse(horse, race, round, tipsterBuzz, paceContext = null) {
  const meta = raceMeta(race, round);
  const history = historyMetrics(horse, meta);
  const pace = paceContext?.byHorseId?.[String(horse.id ?? horse.number)] || { leadProbability: 50, expectedPosition: 'Okänd', pacePressure: paceContext?.pacePressure || 'Medel', paceClarity: paceContext?.paceClarity || 50 };
  const market = marketShare(horse);
  const oddsScore = normalizeOdds(horse?.winOdds);
  const trend = finite(horse?.startTrendPercent ?? horse?.trendPercent, null);
  const trendScore = trend === null ? 50 : clamp(50 + (trend - 50) * 0.7);
  const formTrend = formTrendFor(history.starts);
  const currentCapacity = currentCapacityFor(history.starts);
  const careerPeak = history.starts.length ? Math.max(...history.starts.map(startPerformanceValue)) : currentCapacity;
  const recentPeak = history.starts.length ? Math.max(...history.starts.slice(0, 5).map(startPerformanceValue)) : currentCapacity;
  const developmentTrend = clamp(formTrend + (finite(horse?.age, null) !== null && finite(horse.age) <= 5 ? 8 : 0), -100, 100);
  const trainerForm = trainerFormFor(horse);
  const driverChangeScore = driverChangeFor(horse);
  const positionPerformance = positionPerformanceFor(history.starts, pace.expectedPosition);
  const paceFit = paceFitForHorse(horse, pace);
  const buzzHorse = tipsterFor(tipsterBuzz, race, horse);
  const buzz = clamp(buzzHorse?.buzz?.score, 0);
  const buzzPositive = finite(buzzHorse?.buzz?.positiveCount, 0);
  const infoScore = finite(buzzHorse?.infoScore, 50);
  const infoConfidence = finite(buzzHorse?.infoConfidence, 0);
  const infoAdjustment = finite(buzzHorse?.infoAdjustment, 0);
  const historyAvailable = history.confidenceCount > 0;
  const raceStrength = clamp((GAME_TYPE_PROXY[round?.gameType] || 55) * 0.58 + Math.min(100, Math.log1p(meta.firstPrize || 0) * 7) * 0.42);
  const classFit = historyAvailable && meta.firstPrize ? clamp(50 + ((history.recentCAP || 50) - raceStrength) * 0.45) : 50;
  const adjustedTime = historyAvailable ? clamp((history.recentCAP || 50) * 0.65 + trendScore * 0.35) : trendScore;
  const cap = clamp(adjustedTime * 0.35 + raceStrength * 0.3 + (history.recentCAP || 50) * 0.2 + (oddsScore ?? 50) * 0.15);
  const winConversion = history.winConversion ?? (market ? clamp(market + (trendScore - 50) * 0.25) : 50);
  const equipmentFit = history.equipmentFit ?? 50;
  const todayFit = clamp(
    (history.distanceFit ?? 50) * 0.18
      + (history.methodFit ?? 50) * 0.15
      + (history.trackFit ?? 50) * 0.12
      + (history.postPositionFit ?? 50) * 0.12
      + classFit * 0.15
      + equipmentFit * 0.18
      + (history.recencyFitness ?? 50) * 0.1,
  );
  const winAbility = clamp(
    currentCapacity * 0.3
      + adjustedTime * 0.2
      + winConversion * 0.2
      + raceStrength * 0.15
      + trendScore * 0.1
      + clamp(50 + developmentTrend * 0.25) * 0.05,
  );
  const reliability = clamp(100 - history.gallopRisk * 0.3 - Math.max(0, history.layoffRisk - 15) * 0.1 + (historyAvailable ? Math.min(18, history.confidenceCount * 1.8) : 0) + (history.recentCAP === null ? 0 : (100 - Math.abs(history.recentCAP - 65)) * 0.2) + (history.equipmentConfidence === 'HIGH' ? 10 : history.equipmentConfidence === 'MEDIUM' ? 5 : 0) + (formTrend > 15 ? 5 : formTrend < -15 ? -6 : 0) + (trainerForm - 50) * 0.08);
  const driver = clamp((finite(horse?.driverScore ?? horse?.driverRating, null) ?? 50) + driverChangeScore * 0.18);
  const infoContext = clamp(infoScore + infoAdjustment * 2 + (buzzPositive > 0 ? 5 : 0));
  const marketDisagreement = clamp(edgeFromMarket(market, oddsScore, infoScore));
  const marketValue = clamp(50 + marketDisagreement * 1.8);
  const modelChance = clamp(
    market * 0.25
      + ((oddsScore ?? market) || 50) * 0.2
      + cap * 0.2
      + todayFit * 0.15
      + reliability * 0.08
      + driver * 0.05
      + (buzz || 50) * 0.05
      + infoScore * 0.05
      + equipmentFit * 0.05,
  );
  const estimatedWinProbability = clamp(modelChance * 0.62 + market * 0.38);
  const edge = estimatedWinProbability - market;
  const directEquipmentEdge = history.equipmentConfidence === 'HIGH' || history.equipmentConfidence === 'MEDIUM' ? clamp(50 + history.equipmentChangeDelta) : 50;
  const spikScore = clamp(
    winAbility * 0.24
      + todayFit * 0.2
      + reliability * 0.14
      + driver * 0.08
      + paceFit * 0.1
      + marketValue * 0.1
      + infoContext * 0.04
      + directEquipmentEdge * 0.05
      + 50 * 0.05,
  );
  const baseSpikScore = spikScore;
  const finalSpikScore = clamp(baseSpikScore + infoAdjustment);
  const falseFavoriteRisk = market >= 20 ? clamp(35 + Math.max(0, market - estimatedWinProbability) * 1.6 + history.gallopRisk * 0.22 + (100 - todayFit) * 0.22 + (winConversion < 45 ? 12 : 0)) : clamp(18 + history.gallopRisk * 0.18 + (100 - todayFit) * 0.12);
  let recommendation = 'GARDERA';
  if (market >= 30 && falseFavoriteRisk >= 67) recommendation = 'FÄLL FAVORITEN';
  else if (market <= 12 && finalSpikScore >= 68 && edge >= 8) recommendation = 'SKRÄLLSPIK';
  else if (finalSpikScore >= 78 && edge >= 7) recommendation = 'VÄRDESPIK';
  else if (finalSpikScore >= 78 && reliability >= 65 && falseFavoriteRisk < 42) recommendation = 'TRYGG SPIK';
  const plus = [];
  const minus = [];
  if (historyAvailable && (history.recentCAP || 0) >= 70) plus.push('hög CAP i de senaste starterna');
  if (historyAvailable && history.distanceFit >= 65) plus.push(`dokumenterat bra över ${meta.distance || 'dagens distans'} m`);
  if (edge >= 7) plus.push(`positiv marknadsedge på ${Math.round(edge)}%`);
  if (buzz >= 55 || buzzPositive > 0) plus.push('positiv Tipster Buzz');
  if (infoAdjustment > 0) plus.push(`infoanalys +${infoAdjustment.toFixed(1)} spikscore`);
  if (history.shoeFit >= 64 && history.shoeSample) plus.push(`vunnit ${history.shoeWins} gång${history.shoeWins === 1 ? '' : 'er'} med ${shoeLabel(history.currentShoe).toLowerCase()}`);
  if (history.wagonFit >= 64 && history.wagonSample) plus.push(`bra historik med ${wagonLabel(history.currentWagon).toLowerCase()}`);
  if (history.contextFit >= 66 && history.contextSample) plus.push(`bra resultat i liknande ${meta.startMethod || 'start'} på ${meta.track || 'banan'}`);
  if (paceFit >= 66) plus.push(`${pace.expectedPosition} passar hästens körprofil`);
  if (formTrend >= 15) plus.push(`stigande formtrend (+${Math.round(formTrend)})`);
  if (trainerForm >= 65) plus.push('stark stallform');
  if (history.equipmentFit >= 68 && history.equipmentConfidence !== 'VERY_LOW') plus.push(`stark dagens setup: ${shoeLabel(history.currentShoe)} + ${wagonLabel(history.currentWagon)}`);
  if (history.equipmentChangeDelta >= 8 && history.equipmentConfidence !== 'LOW' && history.equipmentConfidence !== 'VERY_LOW') plus.push(`utrustningsändring ger +${Math.round(history.equipmentChangeDelta)} i historisk setup-fit`);
  if (classFit >= 62) plus.push('passar loppets klass');
  if (history.gallopRisk >= 38) minus.push(`${Math.round(history.gallopRisk)}% uppskattad galopprisk`);
  if (falseFavoriteRisk >= 58 && market >= 20) minus.push('risk att vara överstreckad');
  if (!historyAvailable) minus.push('historik saknas ännu');
  if (history.winConversion !== null && history.winConversion < 45) minus.push('låg segerkonvertering från topp-3');
  if (infoAdjustment < 0) minus.push(`infoanalys ${infoAdjustment.toFixed(1)} spikscore`);
  if (history.layoffRisk >= 40) minus.push(`${history.layoffDays} dagar sedan senaste starten – osäker comeback`);
  if (paceFit < 40) minus.push(`körscenariot (${pace.expectedPosition.toLowerCase()}) passar svagt`);
  if (formTrend <= -15) minus.push(`fallande formtrend (${Math.round(formTrend)})`);
  if (history.equipmentFit < 45 && history.equipmentConfidence !== 'VERY_LOW') minus.push('svag historik med dagens utrustning');
  if (history.equipmentConfidence === 'LOW') minus.push('intressant utrustning – låg historik');
  if (!plus.length) plus.push('startlistans marknadsdata ger grundsignalen');
  if (!minus.length) minus.push('inga tydliga varningssignaler i tillgänglig data');
  return {
    ...horse,
    meta,
    history,
    shoeCode: history.currentShoe,
    shoeLabel: shoeLabel(history.currentShoe),
    wagonType: history.currentWagon,
    wagonLabel: wagonLabel(history.currentWagon),
    equipment: { shoes: { rawCode: horse?.shoeCode || '', normalizedType: history.currentShoeType }, cart: { rawValue: horse?.sulky || horse?.wagon || '', normalizedType: history.currentCartType } },
    market,
    oddsScore,
    adjustedTime,
    raceStrength,
    classFit,
    cap,
    todayFit,
    winAbility,
    reliability,
    driver,
    paceFit,
    pace,
    leadProbability: pace.leadProbability,
    expectedPosition: pace.expectedPosition,
    pacePressure: pace.pacePressure,
    paceClarity: pace.paceClarity,
    positionPerformance,
    formTrend,
    careerPeak,
    recentPeak,
    currentCapacity,
    developmentTrend,
    trainerForm,
    driverChangeScore,
    infoContext,
    equipmentEdge: directEquipmentEdge,
    marketDisagreement,
    fieldPositioning: 50,
    fieldDominance: 50,
    opponentStrength: 50,
    modelChance: estimatedWinProbability,
    confidence: history.confidence,
    edge,
    marketValue,
    shoeFit: history.shoeFit ?? history.shoeDataFit ?? 50,
    wagonFit: history.wagonFit ?? 50,
    equipmentFit,
    combinationFit: history.setupFit ?? 50,
    recencyFitness: history.recencyFitness ?? 50,
    daysSinceLastStart: history.layoffDays ?? undefined,
    layoffRisk: history.layoffRisk,
    trackFit: history.trackFit ?? 50,
    postPositionFit: history.postPositionFit ?? 50,
    spikScore: finalSpikScore,
    baseSpikScore,
    infoScore,
    infoConfidence,
    infoAdjustment,
    positiveFlags: buzzHorse?.positiveFlags || [],
    riskFlags: buzzHorse?.riskFlags || [],
    falseFavoriteRisk,
    recommendation,
    tag: null,
    tagReasons: [],
    buzz,
    plus,
    minus,
  };
}

function rankLabel(index) { return index === 0 ? '1' : index === 1 ? '2' : index === 2 ? '3' : String(index + 1); }

function createHorseTag(horse, favorite, fieldRank = 99) {
  const reasons = [];
  const market = horse.market;
  const edge = horse.edge;
  const severeRisk = horse.history.gallopRisk >= 90 || (horse.layoffRisk >= 85 && horse.recencyFitness < 40);
  let tag = 'GARDERA';
  if (severeRisk || (horse.modelChance < market * 0.55 && horse.todayFit < 48) || (horse.reliability < 35 && horse.spikScore < 60)) tag = 'UNDVIK';
  else if (horse.spikScore >= 78 && horse.reliability >= 65 && horse.confidence !== 'VERY_LOW' && (fieldRank <= 2 || horse.fieldDominance >= 72)) tag = 'SPIK';
  else if (market <= 10 && edge >= 5 && horse.spikScore >= 52) tag = 'SKRÄLL';
  else if (favorite && horse.id !== favorite.id && favorite.falseFavoriteRisk >= 55 && fieldRank <= 3 && horse.modelChance >= Math.max(15, favorite.modelChance * 0.7) && edge >= 0) tag = 'MOTBUD';
  if (tag === 'SPIK') reasons.push('hög SpikScore med rimlig reliability');
  if (tag === 'SPIK' && horse.paceFit >= 66) reasons.push(`körningsscenario gynnar ${horse.expectedPosition.toLowerCase()}`);
  if (tag === 'MOTBUD') reasons.push(`modellen rankar hästen ${fieldRank}:a med ${Math.round(horse.modelChance)}% chans`);
  if (tag === 'SKRÄLL') reasons.push(`positiv edge på ${Math.round(edge)}% vid låg marknadsprocent`);
  if (tag === 'UNDVIK') reasons.push('för låg modellchans eller för hög risk för aktuell budget');
  if (horse.equipmentFit >= 68) reasons.push('stark med dagens utrustning');
  if (favorite?.id !== horse.id && favorite?.falseFavoriteRisk >= 55 && tag === 'MOTBUD') reasons.push('favoriten är sårbar');
  if (horse.fieldDominance >= 72) reasons.push(`tydligt avstånd till nästa häst (${Math.round(horse.fieldDominance)}/100)`);
  if (horse.layoffRisk >= 40) reasons.push(`${horse.daysSinceLastStart} dagar sedan start`);
  if (!reasons.length) reasons.push('realistisk vinstchans men inte trygg nog som spik');
  return { tag, tagReasons: reasons.slice(0, 3) };
}

export function calculateSpikeEngine(round, tipsterBuzz = null) {
  const races = (round?.races || []).map((race, raceIndex) => {
    const division = finite(race?.division ?? race?.divisionNumber ?? race?.raceNumber, raceIndex + 1) ?? raceIndex + 1;
    const normalizedRace = { ...race, division };
    const paceScenario = paceScenarioForRace(normalizedRace);
    const scored = (normalizedRace.horses || [])
      .filter((horse) => !horse.scratched)
      .map((horse, horseIndex) => scoreHorse({ ...horse, id: horse.id ?? `${division}-${horse.number ?? horseIndex + 1}` }, normalizedRace, round, tipsterBuzz, paceScenario))
      .map((horse) => ({ ...horse, division }));
    const favorite = [...scored].sort((left, right) => right.market - left.market)[0] || null;
    const initialOrder = [...scored].sort((left, right) => right.spikScore - left.spikScore || right.modelChance - left.modelChance);
    const secondScore = initialOrder[1]?.spikScore ?? initialOrder[0]?.spikScore ?? 50;
    const horses = initialOrder.map((horse, index) => {
      const nextBest = index === 0 ? secondScore : initialOrder[0]?.spikScore || 50;
      const fieldDominance = clamp(50 + (horse.spikScore - nextBest) * (index === 0 ? 2.2 : 1.4));
      const fieldPositioning = clamp(100 - index * (initialOrder.length > 1 ? 60 / Math.max(1, initialOrder.length - 1) : 0));
      const opponentStrength = initialOrder.filter((item) => item.id !== horse.id).length ? average(initialOrder.filter((item) => item.id !== horse.id).map((item) => item.winAbility), 50) : 50;
      const finalSpikScore = clamp(horse.winAbility * 0.24 + horse.todayFit * 0.2 + horse.reliability * 0.14 + horse.driver * 0.08 + horse.paceFit * 0.1 + horse.marketValue * 0.1 + horse.infoContext * 0.04 + (horse.equipmentEdge ?? 50) * 0.05 + fieldPositioning * 0.05 + (horse.infoAdjustment || 0));
      return { ...horse, fieldRank: index + 1, fieldDominance, fieldPositioning, opponentStrength, spikScore: finalSpikScore };
    });
    const tagged = horses.map((horse) => ({ ...horse, ...createHorseTag(horse, favorite, horse.fieldRank) }));
    const sortedHorses = tagged.sort((a, b) => b.spikScore - a.spikScore || b.modelChance - a.modelChance || b.marketValue - a.marketValue);
    const top = sortedHorses[0] || null;
    const raceUncertainty = sortedHorses.length < 2 ? 65 : clamp(82 - Math.max(0, top.spikScore - sortedHorses[1].spikScore) * 2.5 - Math.min(25, sortedHorses.filter((horse) => horse.modelChance >= 15).length * 3) + (100 - paceScenario.paceClarity) * 0.25);
    const vulnerableFavorite = favorite && favorite.falseFavoriteRisk >= 55 ? favorite : null;
    const bestScrall = sortedHorses.find((horse) => horse.tag === 'SKRÄLL') || null;
    const bestMotbud = sortedHorses.find((horse) => horse.tag === 'MOTBUD') || null;
    const favoriteTrust = favorite ? clamp(100 - favorite.falseFavoriteRisk) : 50;
    const spikQuality = top ? clamp(top.spikScore * 0.35 + (top.fieldDominance || 50) * 0.2 + (100 - raceUncertainty) * 0.2 + favoriteTrust * 0.15 + paceScenario.paceClarity * 0.1) : 0;
    const status = spikQuality >= 90 ? 'Tydlig spik' : spikQuality >= 75 ? 'Spiklopp' : spikQuality >= 60 ? 'Neutral / möjlig spik' : spikQuality >= 45 ? 'Öppet lopp' : 'Garderingslopp';
    return { ...normalizedRace, meta: raceMeta(normalizedRace, round), paceScenario, horses: sortedHorses, top, raceMetrics: { spikQuality, raceUncertainty, paceClarity: paceScenario.paceClarity, bestHorseId: top?.id || null, bestHorseSpikScore: top?.spikScore || 0, bestHorseModelChance: top?.modelChance || 0, mainFavoriteHorseId: favorite?.id || null, vulnerableFavoriteHorseId: vulnerableFavorite?.id || null, bestScrallHorseId: bestScrall?.id || null, bestMotbudHorseId: bestMotbud?.id || null, status } };
  });
  const ranking = races.flatMap((race) => race.horses.slice(0, 3).map((horse) => ({ ...horse, division: race.division, race }))).sort((a, b) => b.spikScore - a.spikScore || b.modelChance - a.modelChance).slice(0, 10).map((item, index) => ({ ...item, rank: rankLabel(index) }));
  const vulnerableFavorites = races.map((race) => race.horses[0]).filter((horse) => horse && horse.market >= 20 && horse.falseFavoriteRisk >= 55).sort((a, b) => b.falseFavoriteRisk - a.falseFavoriteRisk).map((horse) => ({ ...horse, division: races.find((race) => race.horses.some((item) => item.id === horse.id))?.division }));
  const candidates = ranking.slice(0, 2);
  const duel = candidates.length === 2 ? { left: candidates[0], right: candidates[1], verdict: candidates[0].edge >= candidates[1].edge ? `${candidates[0].name} är bättre värdespik` : `${candidates[1].name} är bättre värdespik` } : null;
  const rowPrice = finite(round?.rowPrice, 1) || 1;
  const averageRows = (round?.races || []).reduce((sum, race) => sum + Math.max(1, race.horses?.length || 1), 0);
  const roundOverview = races.map((race) => ({ divisionNumber: race.division, gameType: round?.gameType || '', trackName: race.meta.track, distance: race.meta.distance, startMethod: race.meta.startMethod, raceMetrics: race.raceMetrics, bestHorse: race.top ? { id: race.top.id, number: race.top.number, name: race.top.name, spikScore: race.top.spikScore, modelChance: race.top.modelChance } : null }));
  return { races, divisions: roundOverview, roundOverview, ranking, vulnerableFavorites, duel, rowPrice, averageRows, generatedAt: new Date().toISOString() };
}
