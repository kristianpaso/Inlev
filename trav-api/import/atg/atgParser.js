function parseSwedishNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const normalized = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/%/g, '')
    .replace(',', '.')
    .trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function findColumn(headers, matcher) {
  const index = headers.findIndex((header) => matcher.test(normalizeHeader(header)));
  return index >= 0 ? index : null;
}

function parseHorseCell(value, fallbackNumber = null) {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d+)\s+(.+)$/);
  if (!match) return { number: null, name: clean };
  return { number: Number(match[1]), name: match[2].trim() };
}

function parseExportRows(rows, gameType = 'V64') {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const headers = rows[0].map((value) => String(value || '').trim());
  const horseIndex = findColumn(headers, /^HÄST$/) ?? 0;
  const sexAgeIndex = findColumn(headers, /^KÖN\/?ÅLDER$|^KÖNÅLDER$/);
  const driverIndex = findColumn(headers, /^KUSK$/);
  const percentIndex = findColumn(headers, new RegExp(`^${String(gameType).toUpperCase()}%$`));
  const trendIndex = findColumn(headers, /^TREND%?$/);
  const oddsIndex = findColumn(headers, /^V-?ODDS$/);
  const trainerIndex = findColumn(headers, /^TRÄNARE$/);
  const sulkyIndex = findColumn(headers, /^VAGN$/);

  return rows.slice(1).map((row) => {
    let horse = parseHorseCell(row[horseIndex]);
    if (!horse.number && /^\d{1,2}$/.test(String(row[horseIndex - 1] || '').trim())) {
      horse = { number: Number(row[horseIndex - 1]), name: String(row[horseIndex] || '').trim() };
    }
    if (!horse.number && /^\d{1,2}$/.test(String(row[horseIndex] || '').trim()) && row[horseIndex + 1]) {
      horse = { number: Number(row[horseIndex]), name: String(row[horseIndex + 1] || '').trim() };
    }
    const oddsValue = oddsIndex === null ? '' : String(row[oddsIndex] || '').trim();
    const scratched = /^EJ$/i.test(oddsValue);
    return {
      id: `${horse.number || 'horse'}-${horse.name || 'okand'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      number: horse.number,
      name: horse.name,
      sexAge: sexAgeIndex === null ? '' : String(row[sexAgeIndex] || '').trim(),
      driver: driverIndex === null ? '' : String(row[driverIndex] || '').trim(),
      winPercent: percentIndex === null ? null : parseSwedishNumber(row[percentIndex]),
      trendPercent: trendIndex === null ? null : parseSwedishNumber(row[trendIndex]),
      winOdds: scratched ? null : (oddsIndex === null ? null : parseSwedishNumber(row[oddsIndex])),
      trainer: trainerIndex === null ? '' : String(row[trainerIndex] || '').trim(),
      sulky: sulkyIndex === null ? '' : String(row[sulkyIndex] || '').trim(),
      scratched,
      manualScore: 0,
      note: '',
    };
  }).filter((horse) => horse.name || Number.isFinite(horse.number));
}

function parseExportText(rawText, gameType = 'V64') {
  const lines = String(rawText || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex((line) => /HÄST/i.test(line) && /KUSK/i.test(line));
  if (headerIndex < 0) return [];

  const header = lines[headerIndex].includes('\t')
    ? lines[headerIndex].split('\t')
    : lines[headerIndex].split(/\s{2,}/);
  const rows = [header];
  for (const line of lines.slice(headerIndex + 1)) {
    const row = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/);
    if (row.length >= 2) rows.push(row);
  }
  return parseExportRows(rows, gameType);
}

function rowsFromDomCells(cellRows) {
  return (cellRows || [])
    .map((cells) => (cells || []).map((cell) => String(cell || '').replace(/\u00a0/g, ' ').trim()))
    .filter((row) => row.length >= 2 && (row.some((cell) => /HÄST|KUSK|TRÄNARE|ODDS|%/i.test(cell)) || row.some((cell) => /^\d+(?:\s+\S|$)/.test(cell))));
}

module.exports = {
  parseSwedishNumber,
  parseHorseCell,
  parseExportRows,
  parseExportText,
  rowsFromDomCells,
};
