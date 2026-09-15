const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const fetch = require('node-fetch');
const { chromium } = require('playwright');
const { ensureChromium } = require('./atgBrowserFallback');
const { buildAtgDivisionUrls, getTrackSlug } = require('./atgUrlBuilder');

let pdfParse;
try {
  // Loaded lazily so the rest of the API can still start while a deployment
  // is installing dependencies. The import route reports a clear error if it
  // is missing instead of silently storing unusable data.
  pdfParse = require('pdf-parse');
} catch {}

const PROGRAM_DATA_ROOT = process.env.PROGRAM_DATA_DIR || path.join(__dirname, '..', '..', 'data', 'programs');
const PARSER_VERSION = 'program-pdf-v1';
const ATG_BETTING_INFO_GAME_URL = 'https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/games';

function clean(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'okand-bana';
}

function parseLocaleNumber(value) {
  const raw = clean(value).replace(/kr/gi, '').trim();
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(/\s/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parsePrizeCode(value) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = parseLocaleNumber(raw.replace(/[’']/g, ''));
  return parsed === null ? null : /[’']/.test(raw) ? parsed * 1000 : parsed;
}

function firstMatch(text, expression, index = 1) {
  const match = String(text || '').match(expression);
  return match ? clean(match[index]) : '';
}

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.slice(0, 5).toString() === '%PDF-';
}

function normalizeStartMethod(value) {
  const method = clean(value).toUpperCase();
  if (method.includes('AUTO')) return 'AUTO';
  if (method.includes('VOLT')) return 'VOLT';
  return '';
}

function parseRaceHeader(text) {
  const header = clean(text);
  const distanceMatches = [...header.matchAll(/\b(\d{3,4})\s*m\s*(VOLTSTART|AUTOSTART|AUTO|VOLT)\b/gi)];
  const distanceMatch = distanceMatches[distanceMatches.length - 1];
  const distance = distanceMatch ? Number(distanceMatch[1]) : null;
  const startMethod = normalizeStartMethod(distanceMatch?.[2] || '');
  const prizeText = firstMatch(header, /\bPris:\s*([\d .]+)(?:-|\s|kr)/i);
  const totalText = firstMatch(header, /Prispengar\s+max\s+total:\s*([\d .]+)\s*kr/i);
  const timeMatches = [...header.matchAll(/\b(\d{1,2}[.:]\d{2})\b/g)];
  const time = timeMatches.length ? clean(timeMatches[timeMatches.length - 1][1]) : '';
  const date = firstMatch(header, /\b(20\d{2}-\d{2}-\d{2})\b/);
  const ageRule = firstMatch(header, /\b(\d+[-–]\d+[- ]?åriga[^.]*|\d+[-–]?åriga[^.]*|\d+[-–]?åring[^.]*)/i);
  const handicapRules = [...header.matchAll(/Till(?:ä|a)gg[^.]+/gi)].map((match) => clean(match[0]));
  return {
    date,
    startTime: time,
    distance,
    startMethod,
    conditions: {
      ageRule,
      raw: header,
      handicapRules,
    },
    prizes: {
      first: parseLocaleNumber(prizeText),
      totalMax: parseLocaleNumber(totalText),
      raw: prizeText ? firstMatch(header, /\bPris:\s*([^\n]+)/i) : '',
    },
  };
}

function looksLikePersonLine(line) {
  const value = clean(line);
  if (!value || value.length > 58 || /\d/.test(value)) return false;
  if (/^(NR|SPÅR|DRESS|HÄST|KUSK|TRÄNARE|KARRIÄREN|STAM|ÄGARE|UPPFÖDARE|FORM|TID|ODDS|DAG|LOPP)/i.test(value)) return false;
  return /^[A-ZÅÄÖÉÜ][A-ZÅÄÖÉÜ .,'’\-]+$/.test(value) && value.split(' ').length >= 2;
}

function extractHorseName(rest) {
  const source = clean(rest);
  const formStart = source.search(/\s+(?=\d{1,2}\s+[a-zåäö]\b|[pkvhs]\s+\d)/i);
  const name = clean(formStart > 0 ? source.slice(0, formStart) : source.split(/\s{2,}/)[0]);
  return name.replace(/\s+$/, '');
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12 };

function parseRecentStarts(text, raceDate, raceMeta = {}) {
  const source = clean(text);
  const starts = [];
  const pattern = /([0-9dku]+)\s*(auto|volt|mont[ée])\s*\/\s*([a-z]*\d{1,2}[,.]\d+)([gudk]?)([\d]{1,3}[,.]\d{1,2})?(\d{1,2})(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)/gi;
  for (const match of source.matchAll(pattern)) {
    const tail = source.slice(match.index + match[0].length, match.index + match[0].length + 100);
    const competition = tail.match(/(?:\b(V\d{2}|GS\d{2})\s*)?([A-ZÅÄÖ]{1,3})(\d{1,2})\s*trav\s*(\d{1,2}):(\d{3,4})\s*([\d-]+[’']?)([a-z]{1,3})/i);
    const placeRaw = clean(match[1]);
    const month = MONTHS[String(match[7]).toLowerCase()];
    const year = String(raceDate || '').slice(0, 4) || '';
    starts.push({
      place: /^\d+$/.test(placeRaw) ? Number(placeRaw) : null,
      placeRaw,
      gallop: /[gku]/i.test(placeRaw) || /[gudk]/i.test(match[4] || ''),
      disqualified: /d|u/i.test(placeRaw),
      startMethod: normalizeStartMethod(match[2]),
      kmTime: parseLocaleNumber(match[3].replace(/^[a-z]+/i, '')),
      kmTimeRaw: match[3],
      odds: parseLocaleNumber(match[5]),
      date: year && month ? `${year}-${String(month).padStart(2, '0')}-${String(match[6]).padStart(2, '0')}` : `${match[6]} ${match[7]}`,
      track: competition?.[2] || '',
      trackId: competition?.[2] || '',
      raceNumber: competition ? Number(competition[3]) : null,
      postPosition: competition ? Number(competition[4]) : null,
      distance: competition ? Number(competition[5]) : (raceMeta.distance || null),
      firstPrize: competition ? (parsePrizeCode(competition[6]) || raceMeta.prizes?.first || null) : (raceMeta.prizes?.first || null),
      gameType: competition?.[1] || '',
      shoeCode: competition?.[7] || '',
      trackCondition: '',
    });
  }
  return starts.slice(0, 10);
}

function parseHorseRows(block, raceMeta) {
  const lines = String(block || '').split(/\r?\n/).map(clean).filter(Boolean);
  const headerIndex = lines.findIndex((line) => /NR\s*\/\s*SPÅR/i.test(line));
  const rows = [];
  const seen = new Set();
  const firstRow = headerIndex >= 0 ? headerIndex + 1 : 0;
  for (let index = firstRow; index < lines.length; index += 1) {
    const line = lines[index];
    const numberMatch = line.match(/^(\d{1,2})$/);
    const compactMatch = line.match(/^(\d{1,2})\s+(\d{1,2}):(\d{3,4})\s+(.+)$/);
    const splitMatch = numberMatch && lines[index + 1]?.match(/^(\d{1,2}):(\d{3,4})$/) && lines[index + 2] ? { number: Number(numberMatch[1]), post: Number(lines[index + 1].split(':')[0]), distance: Number(lines[index + 1].split(':')[1]), rest: lines[index + 2], consumed: 2 } : null;
    const match = compactMatch ? { number: Number(compactMatch[1]), post: Number(compactMatch[2]), distance: Number(compactMatch[3]), rest: compactMatch[4], consumed: 0 } : splitMatch;
    if (!match) continue;
    const number = match.number;
    if (number < 1 || number > 20 || seen.has(number)) continue;
    const name = extractHorseName(match.rest);
    if (!name || name.length < 2 || /^(Lopp|Prispengar|Pris|Tillägg)/i.test(name)) continue;
    const nameIndex = splitMatch ? index + 2 : index;
    const nextHorse = lines.findIndex((candidate, candidateIndex) => candidateIndex > nameIndex + 1 && /^\d+$/.test(candidate) && /^\d{1,2}:\d{3,4}$/.test(lines[candidateIndex + 1] || ''));
    const horseLines = lines.slice(nameIndex, nextHorse >= 0 ? nextHorse : Math.min(lines.length, nameIndex + 24));
    const windowLines = horseLines.slice(1, 8);
    const people = windowLines.filter(looksLikePersonLine);
    const sexAge = horseLines.find((value) => /^(HINGST|STO|VALACK|VAL ACK|VALLACK|KÖN|STO)$/i.test(value)) || '';
    const age = firstMatch(horseLines.join(' '), /(\d+)\s*år/i);
    const form = firstMatch(match.rest, /\b\d+\s+([pkvhs](?:\s+[pkvhs0-9]){0,8})\b/i);
    const blockText = [line, lines[index + 1], match.rest, ...horseLines.slice(1)].filter(Boolean).join(' ');
    rows.push({
      number,
      postPosition: match.post || number,
      distance: match.distance || raceMeta.distance,
      name,
      driver: people[0] || '',
      trainer: people[1] || '',
      formRaw: form,
      recentStarts: parseRecentStarts(horseLines.join(' '), raceMeta.raceDate || raceMeta.date, raceMeta),
      sexAge: `${sexAge}${age ? ` ${age} år` : ''}`.trim(),
      rawText: blockText,
      statisticsRaw: blockText,
      startMethod: raceMeta.startMethod,
    });
    seen.add(number);
    index += splitMatch ? 2 : 0;
  }
  return rows;
}

function parseProgramText(text, metadata = {}) {
  const normalized = String(text || '').replace(/\r/g, '');
  const trackName = clean(metadata.trackName || firstMatch(normalized, /\n\s*([A-ZÅÄÖ][A-ZÅÄÖ ]{2,})\s*\/\/\s*\d+/i));
  const raceMatches = [...normalized.matchAll(/(?:^|\n)\s*Lopp\s+(\d+)\b/gi)];
  const races = raceMatches.map((marker, index) => {
    // ATG:s PDF-text är kolumnbaserad. I pdf-parse kommer hästtabellen före
    // sidans loppmarkör, därför hör prefixet före Lopp 1 till lopp 1 och
    // texten mellan Lopp 1 och Lopp 2 till lopp 2.
    const previousMarker = raceMatches[index - 1];
    const blockStart = previousMarker ? previousMarker.index + previousMarker[0].length : 0;
    const block = normalized.slice(blockStart, marker.index);
    const raceNumber = Number(marker[1]);
    const parsedMeta = parseRaceHeader(block);
    const meta = { ...parsedMeta, date: parsedMeta.date || clean(metadata.raceDate) };
    const horses = parseHorseRows(block, meta);
    return {
      raceNumber,
      ...meta,
      horseCount: horses.length,
      horses,
      rawText: clean(block).slice(0, 30000),
    };
  }).filter((race) => race.raceNumber || race.horses.length);

  return {
    trackName,
    raceDate: firstMatch(normalized, /\b(20\d{2}-\d{2}-\d{2})\b/) || clean(metadata.raceDate),
    pages: Number(metadata.pages) || null,
    races,
    rawText: normalized.slice(0, 150000),
  };
}

function personName(person) {
  if (!person) return '';
  return clean(person.name || [person.firstName, person.lastName].filter(Boolean).join(' ') || person.shortName || '');
}

function apiRecordTime(record) {
  const time = record?.time || {};
  if (!Number.isFinite(Number(time.minutes)) || !Number.isFinite(Number(time.seconds))) return '';
  return `${time.minutes}:${String(time.seconds).padStart(2, '0')}.${Number(time.tenths || 0)}`;
}

function apiHistoryForHorse(horse, race) {
  const years = horse?.statistics?.years || {};
  const records = Object.entries(years)
    .flatMap(([year, value]) => (value?.records || []).map((record) => ({ ...record, year })))
    .concat((horse?.statistics?.life?.records || []).map((record) => ({ ...record, year: record.year || '' })))
    .slice(-10);
  return records.map((record) => ({
    place: Number.isFinite(Number(record.place)) ? Number(record.place) : null,
    placeRaw: record.place === undefined || record.place === null ? '' : String(record.place),
    gallop: false,
    disqualified: false,
    startMethod: normalizeStartMethod(record.startMethod),
    kmTime: apiRecordTime(record),
    kmTimeRaw: apiRecordTime(record),
    odds: null,
    date: record.year || '',
    track: horse?.homeTrack?.name || '',
    trackId: horse?.homeTrack?.id || '',
    raceNumber: null,
    postPosition: null,
    distance: race?.distance || null,
    firstPrize: null,
    gameType: '',
    shoeCode: '',
    trackCondition: '',
  }));
}

function parseApiFirstPrize(value) {
  const labelled = parseLocaleNumber(firstMatch(value, /Pris:\s*([\d .]+)/i));
  if (labelled !== null) return labelled;
  return parseLocaleNumber(firstMatch(value, /^\s*([\d .]+)/));
}

function apiProgramHorse(start, race) {
  const horse = start?.horse || {};
  const gameType = String(race?.gameType || '').toUpperCase();
  const pool = start?.pools?.[gameType] || {};
  const distribution = parseLocaleNumber(pool.betDistribution);
  const odds = parseLocaleNumber(start?.pools?.vinnare?.odds);
  const sex = { stallion: 'HINGST', gelding: 'VALACK', mare: 'STO', filly: 'STO', colt: 'HINGST' }[String(horse.sex || '').toLowerCase()] || '';
  return {
    number: Number(start?.number) || null,
    postPosition: Number(start?.postPosition) || Number(start?.number) || null,
    distance: Number(start?.distance || race?.distance) || null,
    name: clean(horse.name),
    driver: personName(start?.driver),
    trainer: personName(horse?.trainer),
    formRaw: '',
    recentStarts: apiHistoryForHorse(horse, race),
    sexAge: `${sex}${horse.age ? ` ${horse.age} år` : ''}`.trim(),
    rawText: `${start?.number || ''} ${horse.name || ''} ${personName(start?.driver)} ${personName(horse?.trainer)}`.trim(),
    statisticsRaw: JSON.stringify(horse?.statistics || {}),
    startMethod: normalizeStartMethod(race?.startMethod),
    winPercent: distribution === null ? null : Number((distribution / 100).toFixed(2)),
    winOdds: odds === null ? null : Number((odds / 100).toFixed(2)),
    scratched: Boolean(start?.scratched || horse?.scratched),
  };
}

async function importAtgGameAsProgram(round) {
  if (!round?.atgGameId) return null;
  const response = await fetch(`${ATG_BETTING_INFO_GAME_URL}/${encodeURIComponent(round.atgGameId)}`, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, timeout: 30000 }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null);
  const sourceRaces = Array.isArray(payload?.races) ? payload.races : [];
  if (!sourceRaces.length) return null;
  const groups = new Map();
  sourceRaces.forEach((sourceRace, index) => {
    const trackName = clean(sourceRace?.track?.name || round.track || `Bana ${index + 1}`);
    if (!groups.has(trackName)) groups.set(trackName, []);
    const race = {
      raceNumber: Number(sourceRace.number) || index + 1,
      date: clean(sourceRace.date || round.date),
      startTime: clean(sourceRace.startTime || ''),
      distance: Number(sourceRace.distance) || null,
      startMethod: normalizeStartMethod(sourceRace.startMethod),
      conditions: { ageRule: '', raw: (sourceRace.terms || []).join(' '), handicapRules: [] },
      prizes: { first: parseApiFirstPrize(sourceRace.prize), totalMax: null, raw: clean(sourceRace.prize) },
      horseCount: Array.isArray(sourceRace.starts) ? sourceRace.starts.length : 0,
      horses: (sourceRace.starts || []).map((start) => apiProgramHorse({ ...start, pools: start.pools || {} }, { ...sourceRace, gameType: round.gameType })).filter((horse) => horse.name || horse.number),
      rawText: clean(`${sourceRace.track?.name || ''} ${sourceRace.prize || ''} ${(sourceRace.terms || []).join(' ')}`),
    };
    groups.get(trackName).push(race);
  });
  const programs = {};
  const tracks = [];
  let index = 0;
  for (const [trackName, races] of groups) {
    const key = `${slug(trackName)}-${index}`;
    programs[key] = { key, roundId: String(round._id || round.id || ''), trackId: slug(trackName), trackName, raceDate: clean(round.date), sourcePdfUrl: '', sourceType: 'atg-api', pdfHash: '', byteSize: 0, fetchedAt: new Date().toISOString(), parserVersion: PARSER_VERSION, pages: null, raceCount: races.length, races, rawText: '', parseStatus: 'api' };
    tracks.push({ name: trackName, index, status: 'api', pages: null, races: races.length, sourceType: 'atg-api' });
    index += 1;
  }
  return { tracks, programs, matches: matchProgramRaces(round, programs), parserVersion: PARSER_VERSION, importedAt: new Date().toISOString() };
}

async function parsePdfBuffer(buffer, metadata = {}) {
  if (!pdfParse) throw new Error('PDF-parsern pdf-parse saknas i API-installationen.');
  const result = await pdfParse(buffer);
  return parseProgramText(result.text, { ...metadata, pages: result.numpages });
}

async function readPdfCandidate(candidate) {
  if (!candidate) return null;
  const buffer = candidate.buffer || null;
  if (!isPdfBuffer(buffer)) return null;
  return { ...candidate, buffer };
}

async function blobCandidates(page) {
  const urls = await page.evaluate(() => {
    const found = new Set();
    document.querySelectorAll('a[href], iframe[src], embed[src], object[data]').forEach((element) => {
      ['href', 'src', 'data'].forEach((attribute) => {
        const value = element.getAttribute(attribute) || '';
        if (value.startsWith('blob:') || /\.pdf(?:$|[?#])/i.test(value)) found.add(value);
      });
    });
    performance.getEntriesByType('resource').forEach((entry) => {
      if (/^blob:|\.pdf(?:$|[?#])/i.test(entry.name)) found.add(entry.name);
    });
    return [...found];
  }).catch(() => []);
  for (const url of urls) {
    if (!/^blob:/i.test(url)) continue;
    const bytes = await page.evaluate(async (blobUrl) => {
      try {
        const response = await fetch(blobUrl);
        if (!response.ok) return [];
        return Array.from(new Uint8Array(await response.arrayBuffer()));
      } catch { return []; }
    }, url).catch(() => []);
    const buffer = Buffer.from(bytes);
    if (isPdfBuffer(buffer)) return { buffer, sourceUrl: '', sourceType: 'blob', blobUrl: url, contentType: 'application/pdf' };
  }
  return null;
}

async function captureProgramPdf(page, link) {
  let candidate = null;
  const popupPages = [];
  const context = page.context();
  const responseHandler = async (response) => {
    if (candidate) return;
    const headers = response.headers();
    const contentType = String(headers['content-type'] || '').toLowerCase();
    const responseUrl = response.url();
    if (!contentType.includes('application/pdf') && !/\.pdf(?:$|[?#])/i.test(responseUrl)) return;
    const buffer = await response.body().catch(() => null);
    if (isPdfBuffer(buffer)) candidate = { buffer, sourceUrl: responseUrl, sourceType: 'network', contentType, etag: headers.etag || '', lastModified: headers['last-modified'] || '', contentLength: headers['content-length'] || '' };
  };
  const pageHandler = async (popup) => {
    popupPages.push(popup);
    await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    if (candidate) return;
    const url = popup.url();
    if (/^https?:/i.test(url) && /\.pdf(?:$|[?#])/i.test(url)) {
      const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, timeout: 30000 }).catch(() => null);
      const buffer = response ? await response.buffer().catch(() => null) : null;
      if (isPdfBuffer(buffer)) candidate = { buffer, sourceUrl: url, sourceType: 'popup', contentType: response.headers.get('content-type') || 'application/pdf' };
    }
  };
  const downloadPromise = page.waitForEvent('download', { timeout: 12000 }).then(async (download) => {
    const filePath = await download.path().catch(() => null);
    const buffer = filePath ? await fsp.readFile(filePath).catch(() => null) : null;
    return isPdfBuffer(buffer) ? { buffer, sourceUrl: download.url(), sourceType: 'download', contentType: 'application/pdf' } : null;
  }).catch(() => null);
  page.on('response', responseHandler);
  context.on('page', pageHandler);
  try {
    await link.click({ timeout: 10000 });
    const detailed = page.getByText('Detaljerad', { exact: true }).last();
    await detailed.click({ timeout: 7000 });
    const deadline = Date.now() + 12000;
    while (!candidate && Date.now() < deadline) {
      await page.waitForTimeout(400);
      if (!candidate) candidate = await blobCandidates(page);
      if (!candidate) {
        for (const popup of popupPages) {
          candidate = await blobCandidates(popup);
          if (candidate) break;
        }
      }
    }
    if (!candidate) candidate = await downloadPromise;
    return await readPdfCandidate(candidate);
  } finally {
    page.off('response', responseHandler);
    context.off('page', pageHandler);
  }
}

async function discoverTrackPrograms(page) {
  const locator = page.locator('[data-test-id="tracks-program-container"] [data-test-id="track-program-link"]');
  const count = await locator.count().catch(() => 0);
  const programs = [];
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    const name = clean(await item.innerText().catch(() => '') || await item.getAttribute('aria-label').catch(() => ''));
    programs.push({ name: name || `Bana ${index + 1}`, index });
  }
  return programs;
}

function normalizedHorseName(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[*]/g, ' ')
    .replace(/[^a-zåäö0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function raceHorseOverlap(roundRace, programRace) {
  const currentHorses = roundRace?.horses || [];
  const programHorses = programRace?.horses || [];
  const currentNames = new Set(currentHorses.map((horse) => normalizedHorseName(horse.name)).filter(Boolean));
  const programNames = programHorses.map((horse) => normalizedHorseName(horse.name)).filter(Boolean);
  const nameMatches = programNames.reduce((score, name) => score + (currentNames.has(name) ? 1 : 0), 0);
  // Nummer räcker inte som huvudnyckel i V86: varje avdelning börjar ofta på häst 1.
  // Använd därför nummer bara när något av objekten saknar ett användbart namn.
  if (currentNames.size > 0 && programNames.length > 0) return nameMatches;
  const currentNumbers = new Set(currentHorses.map((horse) => Number(horse.number)).filter((number) => number > 0));
  return programHorses.reduce((score, horse) => score + (currentNumbers.has(Number(horse.number)) ? 1 : 0), 0);
}

function matchProgramRaces(round, programs) {
  // API-dokumentet lagrar startlistan under parsedHorseInfo.divisions.
  // Normaliserade frontend-objekt har races, så stöd båda formerna här.
  const races = round?.races || round?.parsedHorseInfo?.divisions || [];
  const programRaces = Object.values(programs || {}).flatMap((program) => (program.races || []).map((race, index) => ({ ...race, sequence: index + 1, trackName: program.trackName, raceDate: program.raceDate, pdfKey: program.key })));
  return races.map((roundRace, roundIndex) => {
    const explicitRaceNumber = Number(roundRace.raceNumber) > 0;
    const requestedRaceNumber = Number(roundRace.raceNumber || roundRace.division || roundRace.index || roundIndex + 1);
    const candidates = programRaces.map((programRace) => {
      const overlap = raceHorseOverlap(roundRace, programRace);
      const wantedTracks = [round.track, round.track2].map((value) => clean(value).toLowerCase()).filter(Boolean);
      const sameTrack = !wantedTracks.length || wantedTracks.some((track) => clean(programRace.trackName).toLowerCase().includes(track));
      const sameDate = !programRace.raceDate || !round.date || String(programRace.raceDate) === String(round.date);
      const sameRaceNumber = explicitRaceNumber ? requestedRaceNumber === Number(programRace.raceNumber) : Number(programRace.sequence) === roundIndex + 1;
      const sameDistance = Number(roundRace.distance || roundRace.dist) === Number(programRace.distance) && Number(programRace.distance) > 0;
      const sameMethod = normalizeStartMethod(roundRace.startMethod || roundRace.startType) === programRace.startMethod && Boolean(programRace.startMethod);
      const roundHorseCount = (roundRace?.horses || []).length;
      const programHorseCount = (programRace?.horses || []).length;
      const overlapRatio = overlap > 0 && roundHorseCount > 0 && programHorseCount > 0
        ? overlap / Math.min(roundHorseCount, programHorseCount)
        : 0;
      // Hästöverlappningen är den säkraste kopplingen när flera banor har
      // samma loppnummer och samma hästnummer. Låt den därför väga tyngre än
      // loppets ordningsnummer. Kvoten gör att även lopp med sex hästar kan
      // bli en säker match när alla sex återfinns.
      const score = Math.min(100, (sameTrack ? 20 : 0) + (sameDate ? 15 : 0) + (sameRaceNumber ? 15 : 0) + (sameDistance ? 10 : 0) + (sameMethod ? 10 : 0) + Math.round(Math.min(40, overlapRatio * 40)));
      return { raceNumber: programRace.raceNumber, score, overlap, overlapRatio, sameTrack, sameDate, trackName: programRace.trackName, pdfKey: programRace.pdfKey };
    }).sort((a, b) => b.score - a.score);
    const best = candidates[0] || null;
    return {
      division: Number(roundRace.division || roundRace.index || roundIndex + 1),
      status: best && (best.score >= 70 || (best.overlapRatio >= 0.75 && best.sameTrack && best.sameDate))
        ? (best.score >= 85 || best.overlapRatio >= 0.85 ? 'matched' : 'needs_review')
        : 'unmatched',
      score: best?.score || 0,
      raceNumber: best?.raceNumber || null,
      trackName: best?.trackName || '',
      candidates: candidates.slice(0, 5),
    };
  });
}

async function saveProgramPdf(buffer, round, trackName, source) {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const day = clean(round.date) || 'okant-datum';
  const fileName = `${slug(trackName)}.pdf`;
  const directory = path.join(PROGRAM_DATA_ROOT, day);
  const absolutePath = path.join(directory, fileName);
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(absolutePath, buffer);
  return {
    roundId: String(round._id || round.id || ''),
    trackId: slug(trackName),
    trackName,
    raceDate: day,
    localPath: path.relative(path.join(PROGRAM_DATA_ROOT, '..'), absolutePath).replaceAll(path.sep, '/'),
    sourcePdfUrl: /^https?:/i.test(source.sourceUrl || '') ? source.sourceUrl : '',
    sourceType: source.sourceType || 'network',
    blobUrl: process.env.NODE_ENV === 'production' ? '' : (source.blobUrl || ''),
    pdfHash: hash,
    byteSize: buffer.length,
    etag: source.etag || '',
    lastModified: source.lastModified || '',
    fetchedAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    parseStatus: 'fetched',
  };
}

async function importTrackProgramsForRound(round) {
  if (!pdfParse) throw new Error('PDF-parsern pdf-parse saknas i API-installationen.');
  // ATG:s nya startlistesida visar inte längre PDF-länkar i HTML:en. Den
  // publika datatjänsten är därför den stabila vägen när ett ATG-spel-id finns.
  // PDF-flödet nedan används fortfarande som fallback för äldre/andra sidor.
  const apiProgram = await importAtgGameAsProgram(round);
  if (apiProgram) return apiProgram;
  const config = { date: round.date, gameType: round.gameType, track: round.track, track2: round.track2 || '' };
  const baseUrl = round.atgRoundUrl || buildAtgDivisionUrls(config)[0];
  await ensureChromium();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ locale: 'sv-SE', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36', viewport: { width: 1365, height: 1100 } });
  const tracks = [];
  const programs = {};
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2200);
    const links = await discoverTrackPrograms(page);
    if (!links.length) throw new Error('ATG:s banprogramslänkar hittades inte på omgångssidan.');
    for (const item of links) {
      const track = { name: item.name, index: item.index, status: 'loading' };
      tracks.push(track);
      try {
        const link = page.locator('[data-test-id="tracks-program-container"] [data-test-id="track-program-link"]').nth(item.index);
        const source = await captureProgramPdf(page, link);
        if (!source) throw new Error('Ingen PDF kunde fångas från Detaljerad.');
        const hash = crypto.createHash('sha256').update(source.buffer).digest('hex');
        const previousItems = Object.values(round.programs?.items || {});
        const cached = previousItems.find((previous) => previous.pdfHash === hash);
        const stored = cached ? { ...cached, trackName: item.name, trackId: slug(item.name), sourceType: source.sourceType || cached.sourceType, fetchedAt: cached.fetchedAt || new Date().toISOString() } : await saveProgramPdf(source.buffer, round, item.name, source);
        const parsed = cached ? { pages: cached.pages, races: cached.races || [], rawText: cached.rawText || '' } : await parsePdfBuffer(source.buffer, { trackName: item.name, raceDate: round.date });
        const key = `${slug(item.name)}-${item.index}`;
        programs[key] = { key, ...stored, pages: parsed.pages, raceCount: parsed.races.length, races: parsed.races, rawText: parsed.rawText, parseStatus: parsed.races.length ? (cached ? 'cached' : 'parsed') : 'parsed_no_races' };
        track.status = programs[key].parseStatus;
        track.pdfHash = stored.pdfHash;
        track.pages = parsed.pages;
        track.races = parsed.races.length;
        track.sourceType = stored.sourceType;
      } catch (error) {
        track.status = 'error';
        track.error = error.message || 'Banprogrammet kunde inte läsas.';
      }
    }
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  return { tracks, programs, matches: matchProgramRaces(round, programs), parserVersion: PARSER_VERSION, importedAt: new Date().toISOString() };
}

module.exports = {
  PARSER_VERSION,
  discoverTrackPrograms,
  parseProgramText,
  parsePdfBuffer,
  importTrackProgramsForRound,
  matchProgramRaces,
};
