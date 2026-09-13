const { chromium } = require('playwright');
const fetch = require('node-fetch');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { parseExportText, parseExportRows, rowsFromDomCells } = require('./atgParser');

const execFileAsync = promisify(execFile);
let chromiumInstallPromise = null;

const ATG_RACING_INFO_GAMES_URL = 'https://www.atg.se/services/racinginfo/v1/api/games';

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fullName(person) {
  if (!person) return '';
  return String(person.name || [person.firstName, person.lastName].filter(Boolean).join(' ') || person.shortName || '').trim();
}

function sexAge(horse) {
  const sex = { stallion: 'h', gelding: 'v', mare: 's', filly: 's', colt: 'h' }[String(horse?.sex || '').toLowerCase()] || '';
  return `${sex}${horse?.age ?? ''}`;
}

function horseFromAtgStart(start, gameType) {
  const horse = start?.horse || {};
  const pool = start?.pools?.[gameType] || start?.pools?.[String(gameType || '').toUpperCase()] || {};
  const distribution = finiteNumber(pool.betDistribution);
  const trend = finiteNumber(pool.trend);
  const odds = finiteNumber(start?.pools?.vinnare?.odds);
  const scratched = Boolean(start?.scratched || horse?.scratched || /scratched|struken/i.test(String(start?.status || horse?.status || '')));
  const winPercent = distribution === null ? null : Number((distribution / 100).toFixed(2));
  const trendPercent = trend === null ? null : Number((Math.abs(trend) <= 1 ? trend * 100 : trend).toFixed(2));
  return {
    id: `${start?.number || 'horse'}-${horse.name || 'okand'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    number: finiteNumber(start?.number),
    name: String(horse.name || '').trim(),
    sexAge: sexAge(horse),
    driver: fullName(start?.driver),
    winPercent,
    trendPercent,
    winOdds: scratched || odds === null ? null : Number((odds / 100).toFixed(2)),
    trainer: fullName(horse.trainer),
    sulky: String(horse?.sulky?.type?.text || '').trim(),
    scratched,
    manualScore: 0,
    note: '',
  };
}

async function fetchDivisionStartlistsFromApi(atgGameId, urls, gameType) {
  if (!atgGameId) return null;
  const response = await fetch(`${ATG_RACING_INFO_GAMES_URL}/${encodeURIComponent(atgGameId)}`, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
    timeout: 20000,
  });
  if (!response.ok) throw new Error(`ATG:s racing-API svarade ${response.status}`);
  const payload = await response.json();
  const races = Array.isArray(payload?.races) ? payload.races : [];
  if (!races.length) throw new Error('ATG:s racing-API saknar avdelningar');

  const imported = races.slice(0, urls.length).map((race, index) => ({
    division: index + 1,
    sourceUrl: urls[index] || '',
    horses: (Array.isArray(race?.starts) ? race.starts : [])
      .map((start) => horseFromAtgStart(start, gameType))
      .filter((horse) => horse.name || Number.isFinite(horse.number)),
  })).filter((race) => race.horses.length);

  if (!imported.length) throw new Error('ATG:s racing-API saknar startlistor');
  const errors = [];
  for (let index = imported.length; index < urls.length; index += 1) {
    errors.push({ division: index + 1, sourceUrl: urls[index] || '', message: 'Avdelningen saknades i ATG:s racing-API' });
  }
  return { races: imported, errors };
}

async function ensureChromium() {
  if (fs.existsSync(chromium.executablePath())) return;
  if (!chromiumInstallPromise) {
    const playwrightCli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
    chromiumInstallPromise = execFileAsync(process.execPath, [playwrightCli, 'install', 'chromium'], {
      env: process.env,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    }).catch((error) => {
      chromiumInstallPromise = null;
      throw new Error(`Chromium kunde inte installeras i API-miljön: ${error.stderr || error.message}`);
    });
  }
  await chromiumInstallPromise;
  if (!fs.existsSync(chromium.executablePath())) throw new Error('Chromium installerades inte korrekt i API-miljön.');
}

async function dismissConsent(page) {
  for (const label of ['Godkänn alla', 'Acceptera alla', 'Acceptera', 'Jag förstår', 'OK']) {
    try {
      await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click({ timeout: 700 });
    } catch {}
  }
}

async function fetchDivisionWithBrowser(page, url, gameType) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);
  await dismissConsent(page);

  try {
    await page.locator('[data-test-id="export-startlist-tables-button"]').first().click({ timeout: 4000 });
    await page.waitForTimeout(500);
  } catch {}

  try {
    await page.locator('[data-test-id="copy-exported-startlist-tables-button"]').first().click({ timeout: 2500 });
  } catch {}

  const text = await page.evaluate(async () => {
    try { return await navigator.clipboard.readText(); } catch { return ''; }
  }).catch(() => '');
  const horsesFromClipboard = parseExportText(text, gameType);
  if (horsesFromClipboard.length) return horsesFromClipboard;

  const exportRows = await page.$$eval('tr', (rows) => rows.map((row) => Array.from(row.querySelectorAll('th,td,[startlist-export-id]')).map((cell) => cell.innerText || cell.textContent || ''))).catch(() => []);
  const horsesFromRows = parseExportRows(rowsFromDomCells(exportRows), gameType);
  if (horsesFromRows.length) return horsesFromRows;

  const bodyText = await page.locator('body').innerText().catch(() => '');
  return parseExportText(bodyText, gameType);
}

async function importDivisionStartlists(urls, gameType, onProgress, atgGameId = '') {
  if (atgGameId) {
    const imported = await fetchDivisionStartlistsFromApi(atgGameId, urls, gameType);
    if (imported) {
      imported.races.forEach((race) => onProgress?.({ division: race.division, status: 'done', count: race.horses.length }));
      imported.errors.forEach((error) => onProgress?.({ division: error.division, status: 'error', message: error.message }));
      return imported;
    }
  }
  await ensureChromium();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    locale: 'sv-SE',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
    viewport: { width: 1365, height: 1100 },
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.atg.se' }).catch(() => {});
  const races = [];
  const errors = [];
  try {
    for (let index = 0; index < urls.length; index += 1) {
      const division = index + 1;
      onProgress?.({ division, status: 'loading' });
      try {
        const horses = await fetchDivisionWithBrowser(page, urls[index], gameType);
        if (!horses.length) throw new Error('Ingen startlista hittades');
        races.push({ division, sourceUrl: urls[index], horses });
        onProgress?.({ division, status: 'done', count: horses.length });
      } catch (error) {
        errors.push({ division, sourceUrl: urls[index], message: error.message || 'Kunde inte hämta avdelningen' });
        onProgress?.({ division, status: 'error', message: error.message });
      }
    }
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  return { races, errors };
}

module.exports = { fetchDivisionWithBrowser, importDivisionStartlists, ensureChromium };
