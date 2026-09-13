const fetch = require('node-fetch');
const { chromium } = require('playwright');
const { ensureChromium } = require('./atgBrowserFallback');

function clean(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function numberFromText(value) {
  const match = clean(value).match(/[-+]?\d[\d\s.,]*/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function gameIdFromUrl(value) {
  const raw = String(value || '');
  let source = raw;
  try { source = decodeURIComponent(raw); } catch {}
  const shopMatch = source.match(/\/spel\/\d+_([A-Z0-9]+_20\d{2}-\d{2}-\d{2}_[^&/?#]+)/i);
  if (shopMatch) return decodeURIComponent(shopMatch[1]);
  const match = source.match(/gameId=([A-Z0-9]+_20\d{2}-\d{2}-\d{2}_[^&/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function parseGameId(gameId) {
  const match = String(gameId || '').match(/^([A-Z0-9]+)_(20\d{2}-\d{2}-\d{2})_(.+)$/i);
  return match ? { gameType: match[1].toUpperCase(), date: match[2], scheduleId: match[3] } : {};
}

function extractShopCoupon(documentData, sourceUrl) {
  const races = (documentData.races || []).filter((race) => race.picks.length).sort((a, b) => a.division - b.division);
  if (!races.length) throw new Error('Ingen kupong med valda hästar hittades på ATG-sidan.');
  const urlGameId = gameIdFromUrl(sourceUrl);
  const fromGameId = parseGameId(urlGameId);
  const gameType = String(documentData.gameType || fromGameId.gameType || '').toUpperCase();
  const date = documentData.date || fromGameId.date || '';
  if (!gameType || !date) throw new Error('Kunde inte läsa spelform och datum från butiksandelen.');
  return {
    sourceUrl,
    atgGameId: urlGameId,
    gameType,
    date,
    track: documentData.track || '',
    rows: documentData.rows || races.reduce((total, race) => total * race.picks.length, 1),
    cost: documentData.totalCost ?? documentData.myCost ?? null,
    myCost: documentData.myCost,
    shareCount: documentData.shareCount,
    name: documentData.name || `Butiksandel ${gameType}`,
    races,
  };
}

async function readShopCouponPage(page, sourceUrl) {
  await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (const label of ['Godkänn alla', 'Acceptera alla', 'Acceptera', 'Jag förstår', 'OK']) {
    try { await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click({ timeout: 700 }); } catch {}
  }
  await page.waitForSelector('[data-test-id="receipt-row"], [data-test-id^="race-selections-"], [data-test-id="share-details-name"], [data-test-id="shop-purchase-confirm-coupon-race-row"]', { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(1800);
  return page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent || '';
    const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) || '';
    const clean = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const numberFromText = (value) => {
      const match = clean(value).match(/[-+]?\d[\d\s.,]*/);
      if (!match) return null;
      const parsed = Number(match[0].replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const readNumbers = (row) => Array.from(row.querySelectorAll('[data-test-id="horse-number"], [data-test-id="shop-purchase-confirm-coupon-race-row-selections"] span')).map((element) => Number(clean(element.textContent).match(/^\d{1,2}/)?.[0] || '')).filter((number) => Number.isFinite(number) && number > 0 && number < 100);
    const rows = Array.from(document.querySelectorAll('tr[data-test-id="receipt-row"], [data-test-id="receipt-row"]')).map((row, rowIndex) => {
      const division = Number(row.getAttribute('data-test-value')) || Number((row.querySelector('[data-test-id^="race-number-"]')?.textContent || '').match(/\d+/)?.[0] || rowIndex + 1);
      const picks = readNumbers(row);
      return { division, picks, raw: clean(row.textContent) };
    });
    const fallbackRows = Array.from(document.querySelectorAll('[data-test-id^="race-selections-"], [data-test-id="shop-purchase-confirm-coupon-race-row"]')).map((element, index) => ({
      division: index + 1,
      picks: readNumbers(element),
      raw: clean(element.textContent),
    }));
    const gameType = attr('[data-test-id="game-type"]', 'data-test-value') || clean(text('[data-test-id="game-type"]'));
    const date = clean(text('[data-test-id="receipt-date"]')).match(/20\d{2}-\d{2}-\d{2}/)?.[0] || '';
    const track = clean(text('[data-test-id="receipt-tracks"]'));
    const name = clean(document.querySelector('[data-test-id="share-details-name"]')?.textContent || document.querySelector('[data-test-id="offering-text"]')?.textContent || document.title);
    return {
      gameType,
      date,
      track,
      name,
      rows: numberFromText(text('[data-test-id="receipt-row-count"]')),
      myCost: numberFromText(text('[data-test-id="my-cost"]')),
      totalCost: numberFromText(text('[data-test-id="total-cost"]')),
      shareCount: numberFromText(text('[data-test-id="my-shares"]')),
      races: (rows.some((race) => race.picks.length) ? rows : fallbackRows),
    };
  });
}

async function importShopCoupon(sourceUrl) {
  let browser;
  try {
    await ensureChromium();
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ locale: 'sv-SE', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36' });
    const documentData = await readShopCouponPage(page, sourceUrl);
    return extractShopCoupon(documentData, sourceUrl);
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function findAtgGameId({ date, gameType, trackSlug = '' }) {
  const type = String(gameType || '').toUpperCase();
  const day = String(date || '');
  if (!type || !day) return '';
  const pattern = new RegExp(`(?:gameId=|gameId%3D)(${type}_${day}_[^&"'<>]+)`, 'i');
  const pages = ['https://www.atg.se/andelsspel'];
  if (trackSlug) pages.push(`https://www.atg.se/spel/${day}/${type}/${trackSlug}/avd/1`);
  for (const url of pages) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, timeout: 15000 });
      const html = await response.text();
      const match = html.match(pattern);
      if (match) return decodeURIComponent(match[1]);
    } catch {}
  }
  return '';
}

module.exports = { importShopCoupon, findAtgGameId, gameIdFromUrl, parseGameId };
