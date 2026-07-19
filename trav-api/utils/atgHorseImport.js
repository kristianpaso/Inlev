const { chromium } = require('playwright');
const { parseHorseText } = require('./horseParser');

const ATG_BASE_URL = 'https://www.atg.se';

function getDivisionCount(gameType) {
  const gt = String(gameType || '').toUpperCase();
  if (gt === 'V75') return 7;
  if (gt === 'V64') return 6;
  if (gt === 'V65') return 6;
  if (gt === 'V86') return 8;
  if (gt === 'V85') return 8;
  return 8;
}

function buildAtgGameUrl({ date, gameType, trackSlug, atgUrl, division = 1 }) {
  const cleanDivision = Math.max(1, Number(division) || 1);
  const normalizedGameType = String(gameType || '').trim().toUpperCase();
  const normalizedTrackSlug = String(trackSlug || '').trim().toLowerCase();

  if (date && normalizedGameType && normalizedTrackSlug) {
    return `${ATG_BASE_URL}/spel/${date}/${normalizedGameType}/${normalizedTrackSlug}/avd/${cleanDivision}`;
  }

  const base = String(atgUrl || '').trim();
  if (!base) return '';

  try {
    const url = new URL(base, ATG_BASE_URL);
    const parts = url.pathname.split('/').filter(Boolean);
    const avdIndex = parts.indexOf('avd');
    if (avdIndex >= 0) {
      parts.splice(avdIndex, 2);
    }
    url.pathname = `/${parts.join('/')}/avd/${cleanDivision}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function fold(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o');
}

function exportHeader(gameType) {
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  return [
    'HÄST',
    'KÖN/ÅLDER',
    'KUSK',
    `${String(gameType || 'V').toUpperCase()}%`,
    'DISTANS & SPÅR',
    'HEMMABANA',
    'KR/START',
    'PENGAR',
    'P-ODDS',
    'REKORD',
    'SEGER%',
    'PLATS%',
    'SNITTODDS',
    'TREND%',
    'STAM',
    'STARTER LIVS',
    `STARTER ${lastYear}`,
    'STARTER I ÅR',
    'POÄNG',
    'TRÄNARE',
    'VAGN',
    'V-ODDS',
    'TIPSKOMMENTAR',
    'STATISTIKKOMMENTAR',
  ];
}

function normalizeExportText(rawText, gameType) {
  const text = normalizeText(rawText);
  if (!text) return '';

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const headerCandidates = lines
    .map((line, index) => ({ line, index, columns: parseTsvColumns(line) }))
    .filter(({ line, columns }) => {
      if (!line.includes('\t')) return false;
      if (columns.length < 4) return false;

      const normalizedColumns = columns.map((column) => normalizeColumnName(column, gameType));
      if (normalizedColumns[0] !== 'HÄST') return false;
      return (
        normalizedColumns.includes('KÖN/ÅLDER') &&
        normalizedColumns.includes('KUSK') &&
        normalizedColumns.some((column) => column === 'game_percent')
      );
    });

  let headerIndex = headerCandidates.length
    ? headerCandidates[headerCandidates.length - 1].index
    : -1;

  if (headerIndex < 0) {
    headerIndex = lines.findIndex((line) => {
      if (!line.includes('\t')) return false;
      const columns = parseTsvColumns(line);
      if (columns.length < 4) return false;
      if (normalizeColumnName(columns[0], gameType) !== 'HÄST') return false;

      const f = fold(line);
      return f.includes('konalder') && f.includes('kusk');
    });
  }

  if (headerIndex < 0) return '';

  const exportLines = [lines[headerIndex]];

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const columns = parseTsvColumns(line);
    const first = columns[0] || '';
    const match = first.match(/^(\d{1,2})\s+\S+/);
    const horseNumber = match ? Number(match[1]) : NaN;

    if (columns.length >= 4 && Number.isFinite(horseNumber) && horseNumber >= 1 && horseNumber <= 20) {
      exportLines.push(line);
      continue;
    }

    if (exportLines.length > 1) break;
  }

  const cleaned = exportLines.join('\n').trim();
  const parsed = parseHorseText(cleaned, gameType);
  const horseCount = (parsed.divisions || []).reduce((sum, div) => sum + (div.horses || []).filter((h) => h.rawLine).length, 0);

  return horseCount > 0 ? cleaned : '';
}

function parseTsvColumns(line) {
  if (String(line || '').includes('\t')) {
    return String(line || '').split('\t').map((cell) => cell.trim());
  }

  return String(line || '')
    .split(/\s{2,}/)
    .map((cell) => cell.trim());
}

function normalizeColumnName(value, gameType) {
  const normalized = fold(value)
    .replace(/[^a-z0-9%]+/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o');

  const gt = fold(gameType).replace(/[^a-z0-9]+/g, '');
  if (gt && normalized === `${gt}%`) return 'game_percent';

  if (normalized === 'hast') return 'HÄST';
  if (normalized === 'konalder') return 'KÖN/ÅLDER';
  if (normalized === 'kusk') return 'KUSK';
  if (normalized === 'distansspar' || normalized === 'distans') return 'DISTANS & SPÅR';
  if (normalized === 'hemmabana') return 'HEMMABANA';
  if (normalized === 'krstart' || normalized === 'krperstart') return 'KR/START';
  if (normalized === 'pengar') return 'PENGAR';
  if (normalized === 'podds' || normalized === 'platsodds') return 'P-ODDS';
  if (normalized === 'rekord') return 'REKORD';
  if (normalized === 'seger%') return 'SEGER%';
  if (normalized === 'plats%') return 'PLATS%';
  if (normalized === 'snittodds') return 'SNITTODDS';
  if (normalized === 'trend%') return 'TREND%';
  if (normalized === 'stam') return 'STAM';
  if (normalized === 'starterlivs') return 'STARTER LIVS';
  if (/^starter20\d{2}$/.test(normalized)) return `STARTER ${normalized.slice(-4)}`;
  if (normalized === 'starteriar') return 'STARTER I ÅR';
  if (normalized === 'poang') return 'POÄNG';
  if (normalized === 'tranare') return 'TRÄNARE';
  if (normalized === 'vagn' || normalized === 'skorvagn') return 'VAGN';
  if (normalized === 'skor') return 'SKOR';
  if (normalized === 'vodds' || normalized === 'vinnarodds') return 'V-ODDS';
  if (normalized === 'tipskommentar') return 'TIPSKOMMENTAR';
  if (normalized === 'statistikkommentar') return 'STATISTIKKOMMENTAR';

  return String(value || '').trim();
}

function isValidHorseCell(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\s+\S+/);
  if (!match) return false;
  const number = Number(match[1]);
  return Number.isFinite(number) && number >= 1 && number <= 20;
}

function canonicalizeExportRows(cleanedText, gameType) {
  const lines = normalizeText(cleanedText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const sourceHeader = parseTsvColumns(lines[0]);
  const targetHeader = exportHeader(gameType);
  const targetIndexByName = new Map(targetHeader.map((name, index) => [name, index]));

  const sourceToTarget = sourceHeader.map((name) => {
    const normalized = normalizeColumnName(name, gameType);
    if (normalized === 'game_percent') {
      return targetHeader.findIndex((target) => target === `${String(gameType || '').toUpperCase()}%`);
    }
    return targetIndexByName.has(normalized) ? targetIndexByName.get(normalized) : -1;
  });

  return lines
    .slice(1)
    .map((line) => {
      const sourceCells = parseTsvColumns(line);
      if (!String(line || '').includes('\t')) return null;
      if (sourceCells.length < 4) return null;
      if (!isValidHorseCell(sourceCells[0])) return null;

      const targetCells = targetHeader.map(() => '');
      sourceCells.forEach((value, sourceIndex) => {
        const targetIndex = sourceToTarget[sourceIndex];
        if (targetIndex >= 0) targetCells[targetIndex] = value;
      });

      return targetCells.join('\t');
    })
    .filter(Boolean);
}

function buildCanonicalLine(values, gameType) {
  const targetHeader = exportHeader(gameType);
  const targetCells = targetHeader.map(() => '');

  for (const [name, value] of Object.entries(values || {})) {
    const normalized = normalizeColumnName(name, gameType);
    const targetName = normalized === 'game_percent'
      ? `${String(gameType || '').toUpperCase()}%`
      : normalized;
    const index = targetHeader.findIndex((headerName) => headerName === targetName);
    if (index >= 0) targetCells[index] = String(value || '').trim();
  }

  return targetCells.join('\t');
}

function isLikelyVisibleHorseLine(line) {
  return /^([1-9]|1\d|20)\s+\S+.+[vhsm]\d+\*?(?:\s|\(|$)/i.test(String(line || '').trim());
}

function parseVisibleHorseHead(line) {
  const text = String(line || '').replace(/\s+/g, ' ').trim();
  const match = text.match(/^(\d{1,2})\s+(.+?)([vhsm]\d+\*?)$/i);
  if (!match) return null;

  return {
    number: Number(match[1]),
    name: match[2].trim(),
    genderAge: match[3].replace(/\*$/, '').trim(),
  };
}

function isLikelyOdds(value) {
  return /^\d{1,3}(?:[,.]\d{1,2})$/.test(String(value || '').trim());
}

function isLikelyTrend(value) {
  const text = String(value || '').trim().toUpperCase();
  return text === 'EJ' || /^[+-]?\d+(?:[,.]\d+)?$/.test(text);
}

function isLikelyPercent(value) {
  return /^\d{1,3}%$/.test(String(value || '').trim());
}

function isStopLineForVisibleStartlist(line) {
  const text = String(line || '').trim().toLowerCase();
  return (
    !text ||
    text.startsWith('loppets övriga spel') ||
    text.startsWith('speltips för avdelning') ||
    text.startsWith('spel nyheter') ||
    text.startsWith('omsättning och utdelning') ||
    text === 'exportera data'
  );
}

function parseVisibleStartlistText(rawText, gameType) {
  const lines = normalizeText(rawText)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line, index) => {
    const compactHeader = fold(line).replace(/[^a-z0-9%]+/g, '');
    if (compactHeader !== 'hastkusk') return false;
    return lines.slice(index + 1, index + 8).some((next) => {
      const f = fold(next);
      return f === `${fold(gameType)}%` || /^(v\d+|gs\d+)%$/.test(f);
    });
  });

  if (headerIndex < 0) return [];

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (isStopLineForVisibleStartlist(line)) {
      if (rows.length) break;
      continue;
    }
    if (/^tillägg\s*:/i.test(line)) continue;

    if (!isLikelyVisibleHorseLine(line)) continue;

    const head = parseVisibleHorseHead(line);
    if (!head || !Number.isFinite(head.number)) continue;

    const driver = lines[i + 1] || '';
    const percent = lines[i + 2] || '';
    if (!driver || !isLikelyPercent(percent)) continue;

    let cursor = i + 3;
    let trend = '';
    let odds = '';
    let trainer = '';
    let vagn = '';
    let tip = '';

    if (isLikelyTrend(lines[cursor])) {
      trend = lines[cursor];
      cursor += 1;
    }

    if (isLikelyOdds(lines[cursor])) {
      odds = lines[cursor];
      cursor += 1;
    }

    if (lines[cursor] && !isLikelyVisibleHorseLine(lines[cursor]) && !isStopLineForVisibleStartlist(lines[cursor])) {
      trainer = lines[cursor];
      cursor += 1;
    }

    if (lines[cursor] && /^(vanlig|amerikansk|bike|barfota|skor|brodd|jänkarvagn)/i.test(lines[cursor])) {
      vagn = lines[cursor]
        .replace(/^amerikansk$/i, 'Amerikansk')
        .replace(/^vanlig$/i, 'Vanlig');
      cursor += 1;
    }

    const tipParts = [];
    while (
      cursor < lines.length &&
      !isLikelyVisibleHorseLine(lines[cursor]) &&
      !/^tillägg\s*:/i.test(lines[cursor]) &&
      !isStopLineForVisibleStartlist(lines[cursor])
    ) {
      const candidate = lines[cursor];
      if (!/^(VINNARE|PLATS|TVILLING|KOMB|TRIO|V&P|H2H)$/i.test(candidate)) {
        tipParts.push(candidate);
      }
      cursor += 1;
    }
    tip = tipParts.join(' ').trim();

    rows.push(buildCanonicalLine({
      HÄST: `${head.number} ${head.name}`,
      'KÖN/ÅLDER': head.genderAge,
      KUSK: driver,
      [`${String(gameType || '').toUpperCase()}%`]: percent,
      'TREND%': trend,
      'V-ODDS': odds,
      TRÄNARE: trainer,
      VAGN: vagn,
      TIPSKOMMENTAR: tip,
    }, gameType));

    i = Math.max(i, cursor - 1);
  }

  return rows;
}

async function extractVisibleStartlistRows(page, gameType) {
  const bodyText = await page.locator('body').innerText({ timeout: 7000 }).catch(() => '');
  return parseVisibleStartlistText(bodyText, gameType);
}

function scoreExportLine(line) {
  const value = String(line || '').trim();
  if (!value) return 0;
  const cells = parseTsvColumns(value);
  const nonEmptyCells = cells.filter(Boolean).length;
  return (value.includes('\t') ? 100 : 0) + nonEmptyCells * 10 + Math.min(value.length / 20, 20);
}

function dedupeRowsWithinDivisions(rows) {
  const divisions = [];
  let current = [];
  let prevNumber = null;

  for (const row of rows || []) {
    const firstCell = parseTsvColumns(row)[0] || '';
    const match = firstCell.match(/^(\d{1,2})\s+\S+/);
    if (!match) continue;

    const number = Number(match[1]);
    if (!Number.isFinite(number) || number < 1 || number > 20) continue;

    if (prevNumber !== null && number < prevNumber) {
      divisions.push(current);
      current = [];
    }

    const existingIndex = current.findIndex((item) => item.number === number);
    if (existingIndex < 0) {
      current.push({ number, row });
    } else if (scoreExportLine(row) > scoreExportLine(current[existingIndex].row)) {
      current[existingIndex] = { number, row };
    }

    prevNumber = number;
  }

  if (current.length) divisions.push(current);
  return divisions.flatMap((division) => division.map((item) => item.row));
}

function exportRowsFromText(rawText, gameType) {
  const cleaned = normalizeExportText(rawText, gameType);
  if (!cleaned) return [];

  return canonicalizeExportRows(cleaned, gameType);
}

function valueFromExportMap(map, patterns) {
  for (const [id, value] of Object.entries(map || {})) {
    const haystack = fold(id);
    if (patterns.some((pattern) => haystack.includes(pattern))) {
      const clean = normalizeText(value).replace(/\s+/g, ' ');
      if (clean) return clean;
    }
  }
  return '';
}

function makeTsvLineFromExportMap(map, gameType) {
  const horse = valueFromExportMap(map, ['horse']);
  if (!/^\d{1,2}\s+\S+/.test(horse)) return null;

  const cells = [
    horse,
    valueFromExportMap(map, ['gender', 'age', 'kon', 'alder']),
    valueFromExportMap(map, ['driver', 'kusk']),
    valueFromExportMap(map, ['percent', 'percentage', 'streck', 'pool', fold(gameType)]),
    valueFromExportMap(map, ['distance', 'distans', 'post', 'spar', 'start-info', 'startinfo']),
    valueFromExportMap(map, ['home', 'hemmabana']),
    valueFromExportMap(map, ['earnings-per-start', 'kr-start', 'krperstart']),
    valueFromExportMap(map, ['earnings', 'pengar', 'prize']),
    valueFromExportMap(map, ['place-odds', 'p-odds', 'podds']),
    valueFromExportMap(map, ['record', 'rekord']),
    valueFromExportMap(map, ['win-percentage', 'win-percent', 'seger']),
    valueFromExportMap(map, ['place-percentage', 'place-percent', 'plats']),
    valueFromExportMap(map, ['average-odds', 'snitt']),
    valueFromExportMap(map, ['trend']),
    valueFromExportMap(map, ['pedigree', 'stam']),
    valueFromExportMap(map, ['starts-life', 'life-starts', 'livs']),
    valueFromExportMap(map, ['starts-last-year', 'last-year']),
    valueFromExportMap(map, ['starts-this-year', 'this-year']),
    valueFromExportMap(map, ['points', 'poang']),
    valueFromExportMap(map, ['trainer', 'tranare']),
    valueFromExportMap(map, ['sulky', 'vagn']),
    valueFromExportMap(map, ['win-odds', 'v-odds', 'vodds']),
    valueFromExportMap(map, ['tip-comment', 'tipskommentar', 'tip']),
    valueFromExportMap(map, ['statistics-comment', 'statistikkommentar', 'stat']),
  ];

  return cells.join('\t');
}

async function acceptCookies(page) {
  await page
    .evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const btn = buttons.find((el) => {
        const text = (el.textContent || '').trim().toLowerCase();
        return (
          text.includes('godkänn') ||
          text.includes('acceptera') ||
          text.includes('tillåt alla') ||
          text === 'ok'
        );
      });
      if (btn) btn.click();
    })
    .catch(() => null);
}

async function tryReadExportText(page, gameType) {
  const beforeClipboard = await page
    .evaluate(() => navigator.clipboard?.readText?.().catch(() => '') || '')
    .catch(() => '');
  const beforeBody = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');

  const clickByLocator = async (pattern) => {
    const locator = page.locator('button, a, [role="button"]').filter({ hasText: pattern });
    const count = await locator.count().catch(() => 0);
    if (!count) return false;

    const target = locator.nth(count - 1);
    await target.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => null);
    await target.click({ timeout: 5000 });
    return true;
  };

  const clicked =
    (await clickByLocator(/exportera|kopiera startlista/i).catch(() => false)) ||
    (await page
      .evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const exportButton = candidates.find((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return text.includes('exportera') || text.includes('kopiera startlista');
      });
      if (!exportButton) return false;
      exportButton.scrollIntoView({ block: 'center' });
      exportButton.click();
      return true;
    })
      .catch(() => false));

  if (!clicked) return '';

  await page.waitForTimeout(900);

  const textAfterExportClick = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const exportFromVisibleText = normalizeExportText(textAfterExportClick, gameType);
  if (exportFromVisibleText && normalizeText(textAfterExportClick) !== normalizeText(beforeBody)) {
    return exportFromVisibleText;
  }

  await clickByLocator(/kopiera|copy|exportera/i).catch(() => false);

  await page
    .evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const copyButton = candidates.find((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return text.includes('kopiera') || text.includes('exportera');
      });
      if (copyButton) {
        copyButton.scrollIntoView({ block: 'center' });
        copyButton.click();
      }
    })
    .catch(() => null);

  await page.waitForTimeout(900);

  const afterClipboard = await page
    .evaluate(() => navigator.clipboard?.readText?.().catch(() => '') || '')
    .catch(() => '');
  const candidate = normalizeExportText(
    afterClipboard && afterClipboard !== beforeClipboard
      ? afterClipboard
      : afterClipboard || beforeClipboard,
    gameType
  );

  return candidate;
}

async function extractDivisionRowsFromDom(page, gameType) {
  const result = await page
    .evaluate((gt) => {
      const norm = (value) =>
        String(value || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const exportCells = Array.from(document.querySelectorAll('[startlist-export-id]'));
      const sampleExportIds = Array.from(new Set(exportCells.map((el) => el.getAttribute('startlist-export-id')).filter(Boolean))).slice(0, 80);

      const rowRoots = [];
      const seen = new Set();

      const findRowRoot = (cell) => {
        let el = cell;
        for (let depth = 0; el && depth < 10; depth += 1, el = el.parentElement) {
          const count = el.querySelectorAll('[startlist-export-id]').length;
          const text = norm(el.innerText || el.textContent || '');
          const horseText = norm(
            Array.from(el.querySelectorAll('[startlist-export-id]'))
              .find((x) => (x.getAttribute('startlist-export-id') || '').includes('horse'))
              ?.textContent || ''
          );
          if (count >= 2 && /^\d{1,2}\s+\S+/.test(horseText) && text.length < 2000) return el;
        }
        return cell.closest('tr, [role="row"], li') || cell.parentElement;
      };

      for (const cell of exportCells) {
        const id = cell.getAttribute('startlist-export-id') || '';
        if (!id.includes('horse')) continue;
        const root = findRowRoot(cell);
        if (!root || seen.has(root)) continue;
        seen.add(root);
        rowRoots.push(root);
      }

      if (!rowRoots.length) {
        const candidates = Array.from(document.querySelectorAll('tr, [role="row"], li, article, section, div'));
        for (const el of candidates) {
          const text = norm(el.innerText || el.textContent || '');
          if (!/^\d{1,2}\s+\S+/.test(text)) continue;
          if (text.length > 1200) continue;
          if (seen.has(el)) continue;
          seen.add(el);
          rowRoots.push(el);
          if (rowRoots.length >= 25) break;
        }
      }

      const rows = rowRoots
        .map((root) => {
          const cells = Array.from(root.querySelectorAll('[startlist-export-id]'));
          const map = {};
          for (const cell of cells) {
            const id = cell.getAttribute('startlist-export-id') || '';
            const text = norm(cell.innerText || cell.textContent || '');
            if (!id || !text) continue;
            if (!map[id] || map[id].length < text.length) map[id] = text;
          }

          if (!Object.keys(map).length) {
            const text = norm(root.innerText || root.textContent || '');
            const m = text.match(/^(\d{1,2}\s+[^\d][^-–—|]{1,80})/);
            if (m) map['startlist-cell-horse-split-export'] = norm(m[1]);
          }

          return map;
        })
        .filter((map) => {
          const horse = Object.entries(map).find(([id]) => id.includes('horse'))?.[1] || '';
          return /^\d{1,2}\s+\S+/.test(horse);
        });

      return { rows, sampleExportIds };
    }, gameType)
    .catch((err) => ({ rows: [], sampleExportIds: [], error: err?.message || String(err) }));

  const tsvRows = [];
  for (const rowMap of result.rows || []) {
    const line = makeTsvLineFromExportMap(rowMap, gameType);
    if (line) tsvRows.push(line);
  }

  return {
    rows: tsvRows,
    diagnostics: {
      sampleExportIds: result.sampleExportIds || [],
      error: result.error || null,
    },
  };
}

async function importHorseInfoFromAtg(options = {}) {
  const date = String(options.date || '').trim();
  const gameType = String(options.gameType || '').trim().toUpperCase();
  const trackSlug = String(options.trackSlug || '').trim().toLowerCase();
  const divisionCount = Number(options.divisionCount) || getDivisionCount(gameType);
  const diagnostics = {
    method: null,
    divisionCount,
    exportWorked: false,
    domDivisions: [],
    sampleExportIds: [],
    errors: [],
  };

  let browser = null;
  let context = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    context = await browser.newContext({
      locale: 'sv-SE',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      viewport: { width: 1440, height: 1200 },
    });

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: ATG_BASE_URL,
    }).catch(() => null);

    const page = await context.newPage();
    const firstUrl = buildAtgGameUrl({ ...options, date, gameType, trackSlug, division: 1 });
    if (!firstUrl) {
      const error = new Error('Saknar date/gameType/trackSlug eller atgUrl för ATG-import.');
      error.statusCode = 400;
      throw error;
    }

    const allRows = [];
    let usedExportRows = 0;

    for (let division = 1; division <= divisionCount; division += 1) {
      const url = buildAtgGameUrl({ ...options, date, gameType, trackSlug, division });
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1600);

        if (division === 1) {
          await acceptCookies(page);
          await page.waitForTimeout(900);
        }

        const exportText = await tryReadExportText(page, gameType);
        if (exportText) {
          const canonicalExportRows = exportRowsFromText(exportText, gameType);
          const canonicalExportText = canonicalExportRows.length
            ? [exportHeader(gameType).join('\t'), ...canonicalExportRows].join('\n')
            : exportText;
          const parsed = parseHorseText(canonicalExportText, gameType);
          const importedDivisions = (parsed.divisions || []).length;

          if (division === 1 && importedDivisions >= Math.min(divisionCount, 2)) {
            diagnostics.method = 'atg-export';
            diagnostics.exportWorked = true;
            diagnostics.importedDivisions = importedDivisions;
            diagnostics.importedRows = (parsed.divisions || []).reduce(
              (sum, div) => sum + (div.horses || []).filter((horse) => horse.rawLine).length,
              0
            );
            diagnostics.exportDivisions = [{ division, rows: diagnostics.importedRows, url, mode: 'all-divisions' }];
            return {
              horseText: canonicalExportText,
              parsedHorseInfo: parsed,
              diagnostics,
            };
          }

          const exportRows = canonicalExportRows;
          if (exportRows.length) {
            allRows.push(...exportRows);
            usedExportRows += exportRows.length;
            diagnostics.domDivisions.push({
              division,
              rows: exportRows.length,
              url,
              method: 'atg-export-per-division',
            });
            continue;
          }
        }

        const visibleRows = await extractVisibleStartlistRows(page, gameType);
        if (visibleRows.length) {
          allRows.push(...visibleRows);
          diagnostics.domDivisions.push({
            division,
            rows: visibleRows.length,
            url,
            method: 'visible-startlist',
          });
          continue;
        }

        await page
          .waitForSelector('[startlist-export-id], tr, [role="row"]', { timeout: 15000 })
          .catch(() => null);

        const { rows, diagnostics: domDiagnostics } = await extractDivisionRowsFromDom(page, gameType);
        diagnostics.domDivisions.push({ division, rows: rows.length, url });
        diagnostics.sampleExportIds.push(...(domDiagnostics.sampleExportIds || []));
        if (domDiagnostics.error) diagnostics.errors.push(`Avd ${division}: ${domDiagnostics.error}`);
        allRows.push(...rows);
      } catch (err) {
        diagnostics.domDivisions.push({ division, rows: 0, url, error: err?.message || String(err) });
        diagnostics.errors.push(`Avd ${division}: ${err?.message || String(err)}`);
      }
    }

    diagnostics.sampleExportIds = Array.from(new Set(diagnostics.sampleExportIds)).slice(0, 80);

    if (!allRows.length) {
      const error = new Error('ATG-sidan öppnades, men ingen startliste-/hästdata kunde läsas via exportknapp eller sidan.');
      error.statusCode = 422;
      error.horseImportDiagnostics = diagnostics;
      throw error;
    }

    const dedupedRows = dedupeRowsWithinDivisions(allRows);
    const horseText = [exportHeader(gameType).join('\t'), ...dedupedRows].join('\n');
    const parsedHorseInfo = parseHorseText(horseText, gameType);

    diagnostics.method = usedExportRows > 0 ? 'atg-export-per-division' : 'dom-startlist';
    diagnostics.exportWorked = usedExportRows > 0;
    diagnostics.importedDivisions = (parsedHorseInfo.divisions || []).length;
    diagnostics.importedRows = dedupedRows.length;
    diagnostics.rawImportedRows = allRows.length;
    diagnostics.removedDuplicateRows = allRows.length - dedupedRows.length;
    diagnostics.exportRows = usedExportRows;

    return { horseText, parsedHorseInfo, diagnostics };
  } catch (err) {
    if (!err.horseImportDiagnostics) err.horseImportDiagnostics = diagnostics;
    throw err;
  } finally {
    if (context) await context.close().catch(() => null);
    if (browser) await browser.close().catch(() => null);
  }
}

module.exports = {
  buildAtgGameUrl,
  getDivisionCount,
  importHorseInfoFromAtg,
};
