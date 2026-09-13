const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { parseExportText, parseExportRows, rowsFromDomCells } = require('./atgParser');

const execFileAsync = promisify(execFile);
let chromiumInstallPromise = null;

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

async function importDivisionStartlists(urls, gameType, onProgress) {
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
