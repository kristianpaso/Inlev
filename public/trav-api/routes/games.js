// trav-api/routes/games.js

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

const express = require('express');
const TravGame = require('../models/Game');
const { parseHorseText } = require('../utils/horseParser');

const router = express.Router();

// ---- Coupon status helpers ----
function normalizeCouponStatus(input) {
  const v = String(input || '').toLowerCase().trim();
  if (v === 'active' || v === 'waiting' || v === 'inactive') return v;
  return 'waiting';
}



const AtgLink = require('../models/AtgLink');
// Hämta alla spel
router.get('/', async (req, res) => {
  try {
    const games = await TravGame.find().sort({ createdAt: -1 }).lean();
    res.json(games);
  } catch (err) {
    console.error('GET /games error', err);
    res.status(500).send('Serverfel vid hämtning av spel.');
  }
});


function getDivisionCount(gameType) {
  const gt = String(gameType || '').toUpperCase();
  if (gt === 'V75') return 7;
  if (gt === 'V64') return 6;
  if (gt === 'V65') return 6;
  if (gt === 'V86') return 8;
  if (gt === 'V85') return 8;
  return 8; // fallback
}



// --- ATG presets (sparade länkar) ---

// Hämta alla sparade länkar
router.get('/atg-links', async (req, res) => {
  try {
    const links = await AtgLink.find({}).sort({ createdAt: -1 }).lean();
    res.json(links);
  } catch (e) {
    console.error('GET /atg-links error', e);
    res.status(500).json({ error: 'Kunde inte hämta ATG-länkar.' });
  }
});

// Skapa / uppdatera en länk (upsert på name)
router.post('/atg-links', async (req, res) => {
  try {
    const { name, templateUrl } = req.body || {};
    if (!name || !templateUrl) {
      return res.status(400).json({ error: 'Saknar name eller templateUrl.' });
    }

    // enkel validering: måste innehålla {DATE}
    if (!String(templateUrl).includes('{DATE}')) {
      return res.status(400).json({ error: 'templateUrl måste innehålla {DATE}.' });
    }

    const doc = await AtgLink.findOneAndUpdate(
      { name: String(name).trim() },
      { name: String(name).trim(), templateUrl: String(templateUrl).trim() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.status(201).json(doc);
  } catch (e) {
    console.error('POST /atg-links error', e);
    res.status(500).json({ error: 'Kunde inte spara ATG-länk.' });
  }
});

// Ta bort en länk
router.delete('/atg-links/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    await AtgLink.findByIdAndDelete(linkId);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /atg-links/:linkId error', e);
    res.status(500).json({ error: 'Kunde inte ta bort ATG-länk.' });
  }
});
 



// Hämta specifikt spel (inkl kuponger)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const game = await TravGame.findById(id).lean();
    if (!game) {
      return res.status(404).send('Spelet hittades inte.');
    }
    res.json(game);
  } catch (err) {
    console.error('GET /games/:id error', err);
    res.status(500).send('Serverfel vid hämtning av spel.');
  }
});

// Skapa nytt spel
router.post('/', async (req, res) => {
  try {
  const { title, date, track, trackSlug, gameType, horseText = '' } = req.body;


    if (!title || !date || !track || !gameType) {
      return res.status(400).send('Titel, datum, bana och spelform krävs.');
    }

    const parsedHorseInfo = parseHorseText(horseText, gameType);

    const game = new TravGame({
  title,
  date,
  track,
  gameType,
  trackSlug,
  horseText,
  parsedHorseInfo,
});

    const saved = await game.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /games error', err);
    res.status(500).send('Serverfel vid skapande av spel.');
  }
});



router.post('/:id/results/fetch', async (req, res) => {
  let browser = null;
  let page = null;

  try {
    const { id } = req.params;
    const game = await TravGame.findById(id);
    if (!game) return res.status(404).send('Spelet hittades inte.');

    // ---- Hämta date/gameType/trackSlug (DB först, fallback från frontend) ----
    const bodyDate = String(req.body?.date || '').trim();
    const bodyGameType = String(req.body?.gameType || '').trim();
    const bodyTrackSlug = String(req.body?.trackSlug || '').trim();

    const date = String(game.date || bodyDate || '').trim();
    const gameType = String(game.gameType || bodyGameType || '').trim().toUpperCase();
    const trackSlug = String(game.trackSlug || bodyTrackSlug || '').trim();

    if (!date || !gameType || !trackSlug) {
      return res.status(400).json({
        error: 'Saknar date/gameType/trackSlug. Kan inte hämta resultat från ATG.',
        debug: { date, gameType, trackSlug },
      });
    }

    // Antal avdelningar (först från parsedHorseInfo.divisions, annars fallback på spelform)
    const parsedDivs = Array.isArray(game.parsedHorseInfo?.divisions)
      ? game.parsedHorseInfo.divisions
      : [];
    const divisionCount =
      parsedDivs.length ||
      (gameType === 'V75' ? 7 : gameType === 'V64' ? 6 : 8);

    const results = {};

    // --- hjälpare: parse winner från statisk HTML ---
    const extractWinnerFromHtml = (html) => {
      const $ = cheerio.load(html);
      let winnerNumber = null;

      $('tr[data-test-id^="results-table-row"]').each((_, tr) => {
        const placement = $(tr).find('[data-test-id="horse-placement"]').first().text().trim();
        if (placement === '1') {
          const horseText = $(tr)
            .find('[startlist-export-id="startlist-cell-horse-split-export"]')
            .first()
            .text()
            .trim();
          const mm = horseText.match(/^(\d+)/);
          if (mm) winnerNumber = Number(mm[1]);
          return false; // break
        }
      });

      return Number.isFinite(winnerNumber) ? winnerNumber : null;
    };

    
// --- hjälpare: rendera sidan med Playwright ---
const ensureBrowser = async () => {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
  }
};

const clickTabByText = async (tabText) => {
  await page.evaluate((t) => {
    const want = String(t || '').trim().toLowerCase();
    const candidates = Array.from(document.querySelectorAll('[role="tab"], button, a'));
    const el = candidates.find((x) => (x.textContent || '').trim().toLowerCase() === want);
    if (el) el.click();
  }, tabText);
};

// --- plocka vinnare (per avd) från Resultat-fliken ---
const extractWinnerWithBrowser = async (url) => {
  await ensureBrowser();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Säkerställ Resultat-flik (inte Tabell)
  await clickTabByText('Resultat');
  await page.waitForTimeout(300);

  await page
    .waitForSelector('tr[data-test-id^="results-table-row"] [data-test-id="horse-placement"]', {
      timeout: 20000,
    })
    .catch(() => null);

  const winnerNum = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr[data-test-id^="results-table-row"]'));
    for (const tr of rows) {
      const placementEl = tr.querySelector('[data-test-id="horse-placement"]');
      if (placementEl && placementEl.textContent && placementEl.textContent.trim() === '1') {
        const horseEl = tr.querySelector('[startlist-export-id="startlist-cell-horse-split-export"]');
        const t = (horseEl?.textContent || '').trim();
        const m = t.match(/^(\d+)/);
        if (m) return Number(m[1]);
      }
    }
    return null;
  });

  return Number.isFinite(winnerNum) ? winnerNum : null;
};

// --- hämta ALLA vinnare från Tabell-fliken (avd->vinnare) i ett svep ---
const extractAllWinnersFromTableWithBrowser = async (url) => {
  await ensureBrowser();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await clickTabByText('Tabell');
  await page.waitForTimeout(400);

  await page
    .waitForSelector('tr[data-test-id^="results-table-row"] [data-test-id="horse-placement"]', {
      timeout: 20000,
    })
    .catch(() => null);

  const map = await page.evaluate(() => {
    const out = {};
    const rows = Array.from(document.querySelectorAll('tr[data-test-id^="results-table-row"]'));
    for (const tr of rows) {
      // I Tabell-vyn är horse-placement = AVD (1..8)
      const avdTxt = tr.querySelector('[data-test-id="horse-placement"]')?.textContent?.trim();
      const horseTxt = tr
        .querySelector('[startlist-export-id="startlist-cell-horse-split-export"]')
        ?.textContent?.trim();

      const avd = avdTxt ? parseInt(avdTxt, 10) : NaN;
      const m = (horseTxt || '').match(/^(\d+)/);

      if (Number.isFinite(avd) && m) out[String(avd)] = Number(m[1]);
    }
    return out;
  });

  return map && typeof map === 'object' ? map : {};
};

    
// Försök hämta alla vinnare från "Tabell"-vyn i ett svep (stabilare än per avd)
const tableUrl = `https://www.atg.se/spel/${date}/${gameType}/${trackSlug}/avd/1/resultat`;
try {
  const tableMap = await extractAllWinnersFromTableWithBrowser(tableUrl);
  if (tableMap && Object.keys(tableMap).length) {
    for (let avd = 1; avd <= divisionCount; avd++) {
      if (Number.isFinite(results[String(avd)])) continue;
      const v = tableMap[String(avd)];
      if (Number.isFinite(v)) results[String(avd)] = v;
    }
  }
} catch (e) {
  console.warn('Tabell-hämtning misslyckades, kör per-avd istället:', e?.message || e);
}

// Fyll på eventuella saknade avdelningar via per-avd Resultat

for (let avd = 1; avd <= divisionCount; avd++) {
      if (Number.isFinite(results[String(avd)])) continue;
      const url = `https://www.atg.se/spel/${date}/${gameType}/${trackSlug}/avd/${avd}/resultat`;

      // Försök först med vanlig fetch (om ATG skulle SSR:a resultatet)
      const html = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then((r) => r.text());

      let winnerNumber = null;

      // Om HTML faktiskt innehåller rader -> parse med cheerio
      if (html && html.includes('results-table-row') && html.includes('horse-placement')) {
        winnerNumber = extractWinnerFromHtml(html);
      }

      // Om inget hittades (oftast pga client-side render) -> Playwright
      if (!Number.isFinite(winnerNumber)) {
        winnerNumber = await extractWinnerWithBrowser(url);
      }

      if (Number.isFinite(winnerNumber)) {
        results[String(avd)] = winnerNumber;
      }
    }

    // spara i DB
    game.results = results;
    game.resultsUpdatedAt = new Date();
    await game.save();

    res.json({ results, resultsUpdatedAt: game.resultsUpdatedAt });
  } catch (err) {
    console.error('POST /games/:id/results/fetch error', err);
    res.status(500).send('Serverfel vid hämtning av vinnare.');
  } finally {
    try {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch (_) {}
  }
});


// ---------------------------------------------------------------------------
// Stallsnack / intervjuer
// ---------------------------------------------------------------------------

function normalizeAtgText(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[’‘‛´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Rensa bort suffix som * och (DK)/(NO) osv. för robust matchning
function cleanupHorseNameForMatch(name) {
  return String(name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Fold" text så att ö/ä/å/é osv matchar, och även ø/æ (DK/NO)
function foldForLooseMatch(s) {
  return normalizeAtgText(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Tecken som inte NFKD bryter ner (främst nordiska)
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[åÅ]/g, 'a')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[ß]/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitIntoSentences(text) {
  let cleaned = String(text || '').replace(/\r/g, '').trim();
  if (!cleaned) return [];

  // ATG-stallsnack är ofta "bullet-rader" per häst, t.ex:
  // – 9 Laureen B.R. ... Här kan det finnas flera meningar (med punkt i hästnamn).
  // Om vi splittrar på punkt riskerar vi att tappa resten av texten.
  //
  // Lösning: splitta i första hand per rad/bullet, och slå ihop fortsättningsrader.

  // Om bullets råkar ligga på samma rad: skapa radbrytning före ny bullet.
  cleaned = cleaned
    .replace(/([^\n])\s*([–-]\s*\d+\s+)/g, '$1\n$2')
    .replace(/([^\n])\s*(•\s*\d+\s+)/g, '$1\n$2');

  const rawLines = cleaned.split(/\n+/g).map((s) => s.trim()).filter(Boolean);

  const entries = [];
  let current = '';

  // Ny post om raden ser ut att börja med "bullet + nummer" eller bara "nummer".
  const isStart = (line) => /^\s*(?:[–-]|•)?\s*\d+\s+/.test(line);

  for (const line of rawLines) {
    if (isStart(line)) {
      if (current) entries.push(current.trim());
      current = line;
    } else if (current) {
      current += ' ' + line;
    } else {
      current = line;
    }
  }
  if (current) entries.push(current.trim());

  return entries;
}



function extractLeadingHorseNumber(entry) {
  const m = String(entry || '').match(/^\s*(?:[–-]|•)?\s*(\d{1,2})\s+/);
  return m ? String(m[1]) : '';
}
function extractHorseNameFromRawLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return '';
  const firstCol = line.split('\t')[0] || '';
  // Förväntat: "1 Hankypanky Slander" men kan också vara t.ex.:
  //  - "3 Gingerbel Brofont* (IT)"
  //  - "1 Kollund Møbler* (DK)"
  // Vi vill matcha mot texten i stallsnack-artikeln som ofta saknar landkod/asterisk.
  let name = firstCol.replace(/^\s*\d+\s+/, '').trim();
  // Ta bort asterisker som ATG använder i hästlistor.
  name = name.replace(/\*/g, '').trim();
  // Ta bort trailing landkod i parentes om den ser ut som (DK)/(IT)/(NO)/(SE)...
  name = name.replace(/\s*\(([A-ZÅÄÖ]{2,3})\)\s*$/i, '').trim();
  // Normalisera whitespace
  name = name.replace(/\s{2,}/g, ' ').trim();
  return name;
}

function sliceDivisionText(fullText, gameType, divisionCount) {
  const markers = [];
  for (let i = 1; i <= divisionCount; i++) {
		// ATG-texter kan ha rubriker som t.ex.
		//  - "V85 - 1:" (med kolon)
		//  - "V85-1" (utan kolon)
		// För att undvika att råka matcha "(V85-1/...)" inne i hästtexter
		// försöker vi bara matcha i början av en rad.
		const re = new RegExp(`(^|\\n)\\s*${escapeRegExp(gameType)}\\s*[-–]\\s*${i}\\b\\s*:?`, 'im');
		const m = fullText.search(re);
		markers.push({ i, idx: m });
  }

  const found = markers.filter((m) => m.idx >= 0).sort((a, b) => a.idx - b.idx);
  const sections = {};
  if (!found.length) {
    // Inga rubriker hittades – returnera allt som "0" för fallback.
    sections['0'] = fullText;
    return sections;
  }

  for (let k = 0; k < found.length; k++) {
    const start = found[k].idx;
    const end = k + 1 < found.length ? found[k + 1].idx : fullText.length;
    sections[String(found[k].i)] = fullText.slice(start, end);
  }
  return sections;
}

// Hämta stallsnack/intervju och spara på spelet
router.post('/:id/stallsnack/fetch', async (req, res) => {
  const { id } = req.params;
  const url = String(req.body?.url || req.query?.url || '').trim();

  if (!url) {
    return res.status(400).send('url krävs');
  }
  if (!/^https:\/\/www\.atg\.se\//i.test(url)) {
    return res.status(400).send('Endast https://www.atg.se/… stöds');
  }

  let browser;
  let page;
  try {
    const game = await TravGame.findById(id);
    if (!game) return res.status(404).send('Spelet hittades inte.');

    const divisionCount = (game.parsedHorseInfo?.divisions || []).length || 8;
    const gameType = game.gameType || 'V85';

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('[data-test-id="game-tip-article"]', { timeout: 30000 });

    const rawText = await page.$eval('[data-test-id="game-tip-article"]', (el) => el.innerText || '');
    const rawHtml = await page.$eval('[data-test-id="game-tip-article"]', (el) => el.innerHTML || '');

    // Normalisera och segmentera per avdelning
    const normalizedText = String(rawText || '').replace(/\u00A0/g, ' ');
    const divisionTexts = sliceDivisionText(normalizedText, gameType, divisionCount);

	    // --- Viktigt: ATG-texter saknar ofta tydliga "V85-1:"-rubriker.
	    // Då hamnar hela artikeln i samma textblock och startnummer (t.ex. "1")
	    // kolliderar mellan avdelningar (1 i V85-1, 1 i V85-7, osv).
	    // Lösning: bucketa rader utifrån "(V85-<avd>...)" som står efter hästnamnet.
	    const allEntries = splitIntoSentences(normalizedText);
	    const divisionEntryBuckets = {};
	    for (let i = 1; i <= divisionCount; i++) divisionEntryBuckets[i] = [];
	    const divTagRe = new RegExp(`\\b${escapeRegExp(gameType)}\\s*[-–]\\s*(\\d{1,2})\\b`, 'gi');
	    for (const entry of allEntries) {
	      const seen = new Set();
	      let m;
	      while ((m = divTagRe.exec(entry)) !== null) {
	        const d = parseInt(m[1], 10);
	        if (d >= 1 && d <= divisionCount && !seen.has(d)) {
	          divisionEntryBuckets[d].push(String(entry).trim());
	          seen.add(d);
	        }
	      }
	      divTagRe.lastIndex = 0;
	    }

    // Skapa mapping per avdelning och hästnummer
    const stallsnack = {
      url,
      fetchedAt: new Date().toISOString(),
      gameType,
      divisions: {},
    };

    for (let i = 1; i <= divisionCount; i++) {
      const division = game.parsedHorseInfo?.divisions?.[i - 1];
      const horses = division?.horses || [];
      let divText = '';
      let sentences = [];

      // Använd bucket-entries per avdelning när de finns (minskar nummerkrockar), annars fall tillbaka på sliceDivisionText
      const entries = (divisionEntryBuckets[i] || []).filter(Boolean);
      if (entries.length) {
        divText = entries.join('\n');
        sentences = entries;
      } else {
        divText = divisionTexts[String(i)] || divisionTexts['0'] || '';
        sentences = splitIntoSentences(divText);
      }

      const divTextFold = foldForLooseMatch(divText);
      const divObj = { rawText: divText, horses: {} };

      // Indexera meningar per hästnummer – och behåll även "fortsättningsrader"
      // som inte börjar med ett nytt startnummer (vanligt när texten radbryts
      // eller när vi splittrar på meningsslut).
      const sentencesByNumber = {};
      let lastLead = null;
      for (const s of sentences) {
        const raw = String(s || '').trim();
        if (!raw) continue;

        const lead = extractLeadingHorseNumber(raw);
        if (lead) {
          lastLead = lead;
          if (!sentencesByNumber[lead]) sentencesByNumber[lead] = [];
          sentencesByNumber[lead].push(raw);
          continue;
        }

        // Ingen ny ledande siffra – tolka som fortsättning på föregående häst.
        if (lastLead) {
          if (!sentencesByNumber[lastLead]) sentencesByNumber[lastLead] = [];
          sentencesByNumber[lastLead].push(raw);
        }
      }

      for (const h of horses) {
        const number = String(h.number ?? '').trim();
        if (!number) continue;
        const name = extractHorseNameFromRawLine(h.rawLine);
        const nameClean = cleanupHorseNameForMatch(name);
        const nameFold = foldForLooseMatch(nameClean);
        if (!nameFold) continue;

        // OBS: vi matchar mot foldad text (a-z0-9 + mellanslag).
        // Viktigt: escapea backslashes i template-strängar (\b och \s+) annars blir det backspace/vanliga bokstäver.
        const hits = [];

        // 1) Direktmatch: om vi har entries som börjar med samma startnummer som hästen.
        const direct = sentencesByNumber[number];
        if (direct && direct.length) {
          // Dedup + cap
          const seen = new Set();
          for (const s of direct) {
            const key = foldForLooseMatch(s);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            hits.push(s.trim());
            if (hits.length >= 10) break;
          }
        } else {
          // 2) Fallback: matcha "NUMMER NAMN" men bara om matchen sker tidigt i entryn,
          // så vi inte råkar ta en annan hästs text som bara nämner hästen längre ner.
          const pat = new RegExp(`\\b${escapeRegExp(number)}\\s+${escapeRegExp(nameFold)}\\b`, 'i');

          const seen = new Set();
          for (const s of sentences) {
            const raw = String(s || '').trim();
            if (!raw) continue;

            // Om entryn börjar med ett annat nummer – skip (minskar felmatchningar kraftigt).
            const lead = extractLeadingHorseNumber(raw);
            if (lead && lead !== number) continue;

            const head = raw.slice(0, 220); // tidig del av entryn
            const headFold = foldForLooseMatch(head);
            if (!headFold) continue;
            if (!pat.test(headFold)) continue;

            const key = foldForLooseMatch(raw);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            hits.push(raw);
            if (hits.length >= 10) break;
          }
        }
if (hits.length) {
          divObj.horses[number] = {
            name,
            sentences: hits.slice(0, 10),
          };
        }
      }

      // Bara spara avdelningen om någon häst fick träff
      if (Object.keys(divObj.horses).length) {
        stallsnack.divisions[String(i)] = divObj;
      }
    }

    // Fallback: om vi inte hittade rubriker, försök matcha mot hela texten via HTML (b-taggar)
    // Detta gör att vi ändå kan få träffar även om ATG ändrar rubrikerna.
    if (!Object.keys(stallsnack.divisions).length) {
      const $ = cheerio.load(`<div>${rawHtml}</div>`);
      const allText = normalizeAtgText($('div').text());
      const allSentences = splitIntoSentences(allText);
      const divisions = game.parsedHorseInfo?.divisions || [];
      for (let i = 1; i <= divisions.length; i++) {
        const division = divisions[i - 1];
        for (const h of division?.horses || []) {
          const number = String(h.number ?? '').trim();
          const name = extractHorseNameFromRawLine(h.rawLine);
          const nameClean = cleanupHorseNameForMatch(name);
          const nameFold = foldForLooseMatch(nameClean);
          if (!number || !nameFold) continue;
          const re = new RegExp(`\\b${escapeRegExp(number)}\\s+${escapeRegExp(nameFold)}\\b`, 'i');
          const hits = [];
          const seenHits = new Set();
          for (const s of allSentences) {
            const sFold = foldForLooseMatch(s);
            if (!sFold) continue;
            if (re.test(sFold)) {
              if (seenHits.has(sFold)) continue;
              seenHits.add(sFold);
              hits.push(s.trim());
              if (hits.length >= 10) break;
            }
          }
          if (hits.length) {
            stallsnack.divisions[String(i)] ??= { rawText: allText, horses: {} };
            stallsnack.divisions[String(i)].horses[number] = { name, sentences: hits };
          }
        }
      }
    }

    game.stallsnack = stallsnack;
    await game.save();

    res.json({ stallsnack });
  } catch (err) {
    console.error('POST /games/:id/stallsnack/fetch error', err);
    res.status(500).send('Serverfel vid hämtning av stallsnack/intervju.');
  } finally {
    try {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch (_) {}
  }
});


// Uppdatera befintligt spel
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
  const { title, date, track, trackSlug, gameType, horseText = '' } = req.body;


    if (!title || !date || !track || !gameType) {
      return res.status(400).send('Titel, datum, bana och spelform krävs.');
    }

    const parsedHorseInfo = parseHorseText(horseText, gameType);

    const updated = await TravGame.findByIdAndUpdate(
      id,
     {
  title,
  date,
  track,
  gameType,
  trackSlug,
  horseText,
  parsedHorseInfo,
},
      { new: true }
    );

    if (!updated) {
      return res.status(404).send('Spelet hittades inte.');
    }

    res.json(updated);
  } catch (err) {
    console.error('PUT /games/:id error', err);
    res.status(500).send('Serverfel vid uppdatering av spel.');
  }
});

// Ta bort spel
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await TravGame.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).send('Spelet hittades inte.');
    }
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /games/:id error', err);
    res.status(500).send('Serverfel vid borttagning av spel.');
  }
});




//
// 🔹 KUPONG-ROUTES
//

// Skapa kupong för ett spel
router.post('/:id/coupons', async (req, res) => {
  try {
    const { id } = req.params;
    const { selections, name, source, stakeLevel, status } = req.body;

    if (!Array.isArray(selections) || !selections.length) {
      return res.status(400).send('Minst en avdelning krävs för kupong.');
    }

    const normalized = selections
      .map((sel) => ({
        divisionIndex: Number(sel.divisionIndex),
        horses: Array.isArray(sel.horses)
          ? sel.horses
              .map((n) => Number(n))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [],
      }))
      .filter((s) => s.divisionIndex > 0 && s.horses.length > 0);

    if (!normalized.length) {
      return res.status(400).send('Kupongen saknar valda hästar.');
    }

    const game = await TravGame.findById(id);
    if (!game) {
      return res.status(404).send('Spelet hittades inte.');
    }

  const normalizedStatus = normalizeCouponStatus(status);

game.coupons.push({
  selections: normalized,
  name: name || '',
  source: source || 'manual',
  stakeLevel: stakeLevel || 'original',
  status: normalizedStatus,
  active: normalizedStatus === 'active',
});


    await game.save();

    const newCoupon = game.coupons[game.coupons.length - 1];
    res.status(201).json(newCoupon);
  } catch (err) {
    console.error('POST /games/:id/coupons error', err);
    res.status(500).send('Serverfel vid skapande av kupong.');
  }
});


// Ta bort kupong
router.delete('/:id/coupons/:couponId', async (req, res) => {
  try {
    const { id, couponId } = req.params;
    const game = await TravGame.findById(id);
    if (!game) {
      return res.status(404).send('Spelet hittades inte.');
    }

    // hitta kupongen
    const exists = game.coupons.some(
      (c) => String(c._id) === String(couponId)
    );
    if (!exists) {
      return res.status(404).send('Kupongen hittades inte.');
    }

    // filtrera bort den istället för coupon.remove()
    game.coupons = game.coupons.filter(
      (c) => String(c._id) !== String(couponId)
    );

    await game.save();

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /games/:id/coupons/:couponId error', err);
    res.status(500).send('Serverfel vid borttagning av kupong.');
  }
});

// Uppdatera kupong (aktiv/inaktiv)
router.patch('/:id/coupons/:couponId', async (req, res) => {
  try {
    const { id, couponId } = req.params;
    const { active, status, name, selections, source, stakeLevel } = req.body || {};

    const game = await TravGame.findById(id);
    if (!game) {
      return res.status(404).send('Spelet hittades inte.');
    }

    const coupon = game.coupons.id(couponId);
    if (!coupon) {
      return res.status(404).send('Kupongen hittades inte.');
    }

    if (typeof status === 'string' && status.length) {
      const normalizedStatus = normalizeCouponStatus(status);
      coupon.status = normalizedStatus;
      coupon.active = normalizedStatus === 'active';
    } else if (active !== undefined) {
      // bakåtkompatibilitet (gamla klienter skickar active true/false)
      coupon.active = Boolean(active);
      coupon.status = coupon.active ? 'active' : 'inactive';
    }

    // ✨ Uppdatera även innehåll (används av Redigera/Kopiera)
    if (typeof name === 'string') coupon.name = name.trim();
    if (typeof source === 'string') coupon.source = source.trim();
    if (typeof stakeLevel === 'string' && stakeLevel.length) coupon.stakeLevel = stakeLevel;
    if (Array.isArray(selections)) coupon.selections = selections;

    await game.save();

    return res.json(coupon);
  } catch (err) {
    console.error('PATCH /games/:id/coupons/:couponId error', err);
    return res.status(500).send('Serverfel vid uppdatering av kupong.');
  }
});






function normalizeAtgCouponText(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueSortedHorseNumbers(numbers) {
  return Array.from(new Set((numbers || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 20)))
    .sort((a, b) => a - b);
}

function parseAtgHorseNumbersFromRest(rest) {
  const out = [];
  const tokens = String(rest || '')
    .replace(/[,;]+/g, ' ')
    .replace(/[()\[\]]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const cleaned = token.replace(/[^0-9]/g, '');
    if (/^\d{1,2}$/.test(cleaned)) {
      const n = Number(cleaned);
      if (n >= 1 && n <= 20) {
        out.push(n);
        continue;
      }
    }

    // När vi redan börjat läsa hästnummer och första ordet i hästnamnet kommer
    // (t.ex. "3 FANGIO COR") ska vi sluta, annars riskerar vi att plocka datum,
    // kvittonummer eller andra siffror från sidan.
    if (out.length) break;
  }

  return uniqueSortedHorseNumbers(out);
}

function parseAtgSelectionsFromVisibleText(text, divisionCount = 8) {
  const selectionsByDiv = new Map();
  const lines = String(text || '')
    .replace(/\u00A0/g, ' ')
    .split(/\n+/)
    .map((line) => normalizeAtgCouponText(line))
    .filter(Boolean);

  const add = (divisionIndex, horses) => {
    const div = Number(divisionIndex);
    if (!Number.isFinite(div) || div < 1 || div > divisionCount) return;
    const nums = uniqueSortedHorseNumbers(horses);
    if (!nums.length || nums.length > 15) return;
    const old = selectionsByDiv.get(div) || [];
    selectionsByDiv.set(div, uniqueSortedHorseNumbers(old.concat(nums)));
  };

  // 1) Strikt ATG-kvittoformat:
  // AVD  HÄSTAR
  // 1    1 3
  // 2    1 3 6 8 9
  // 6    3 FANGIO COR
  const headerIndex = lines.findIndex((line) => /\bAVD\b/i.test(line) && /\bH[ÄA]STAR\b/i.test(line));
  if (headerIndex >= 0) {
    for (let i = headerIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      const m = line.match(/^([1-8])\s+(.+)$/);
      if (!m) {
        // När vi redan har börjat läsa och kommer till nästa sektion, sluta.
        if (selectionsByDiv.size) break;
        continue;
      }
      const divisionIndex = Number(m[1]);
      if (divisionIndex < 1 || divisionIndex > divisionCount) continue;
      add(divisionIndex, parseAtgHorseNumbersFromRest(m[2]));
      // Om vi har passerat sista avdelningen behöver vi inte fortsätta läsa kvittot.
      if (divisionIndex === divisionCount && selectionsByDiv.size >= divisionCount) break;
    }

    if (selectionsByDiv.size) {
      return Array.from(selectionsByDiv.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([divisionIndex, horses]) => ({ divisionIndex, horses }));
    }
  }

  // 2) Generellt en-radsformat:
  // "Avd 1 1 3", "V65-1 1 3", "1 1 3".
  for (const line of lines) {
    const match = line.match(/^(?:V\d{2}\s*[-:]\s*)?(?:Avd(?:elning)?\s*)?([1-8])\s+(.+)$/i);
    if (!match) continue;

    const divisionIndex = Number(match[1]);
    if (!Number.isFinite(divisionIndex) || divisionIndex < 1 || divisionIndex > divisionCount) continue;

    // Ignorera rader som uppenbart är datum/tid/pris/rader.
    if (/\b(inl[äa]mnat|pris|kr|rader|andel|kvitt|detalj|visa)\b/i.test(line)) continue;

    add(divisionIndex, parseAtgHorseNumbersFromRest(match[2]));
  }

  return Array.from(selectionsByDiv.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([divisionIndex, horses]) => ({ divisionIndex, horses }));
}

async function extractAtgCouponFromPage(page, divisionCount) {
  const RECEIPT_ROW_SEL = 'tr[data-test-id="receipt-row"]';
  const PRELIM_ROW_SEL = '[data-test-id="shop-purchase-confirm-coupon-race-row"]';

  const selectionsByDiv = new Map();
  const addSelection = (divisionIndex, horses) => {
    const div = Number(divisionIndex);
    if (!Number.isFinite(div) || div < 1 || div > divisionCount) return;
    const nums = uniqueSortedHorseNumbers(horses);
    if (!nums.length) return;
    const old = selectionsByDiv.get(div) || [];
    selectionsByDiv.set(div, uniqueSortedHorseNumbers(old.concat(nums)));
  };

  // 1) Nya/gamla kvitto-rader från ATG. Om detta ger träff returnerar vi direkt
  // så att inte en senare bred DOM-scan råkar blanda in kvittonummer, datum eller andra rader.
  const receiptRows = await page.$$(RECEIPT_ROW_SEL).catch(() => []);
  for (const row of receiptRows) {
    const divisionIndex = await row.evaluate(el => Number(el.getAttribute('data-test-value'))).catch(() => NaN);
    const horses = await row.$$eval(
      'span[data-test-id="horse-number"]',
      spans => spans.map(s => Number((s.textContent || '').trim())).filter(n => Number.isFinite(n) && n > 0)
    ).catch(() => []);
    addSelection(divisionIndex, horses);
  }

  if (selectionsByDiv.size) {
    return Array.from(selectionsByDiv.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([divisionIndex, horses]) => ({ divisionIndex, horses }));
  }

  // 2) Preliminär kupong / köpbekräftelse
  const prelimRows = await page.$$(PRELIM_ROW_SEL).catch(() => []);
  for (const row of prelimRows) {
    const divisionIndex = await row.$eval(
      '[data-test-id="race-row-number"]',
      el => Number((el.textContent || '').trim())
    ).catch(() => NaN);

    const horses = await row.$$eval(
      '[data-test-id="shop-purchase-confirm-coupon-race-row-selections"] span, span[data-test-id="horse-number"]',
      (spans) => {
        const out = [];
        for (const s of spans) {
          const cls = (s.className || '').toString();
          const parentCls = (s.parentElement?.className || '').toString();
          if (cls.includes('strike') || parentCls.includes('strike')) continue;
          const txt = (s.textContent || '').replace(/\u00A0/g, ' ').trim();
          const m = txt.match(/^(\d{1,2})\b/);
          if (m) out.push(Number(m[1]));
        }
        return Array.from(new Set(out)).sort((a, b) => a - b);
      }
    ).catch(() => []);
    addSelection(divisionIndex, horses);
  }


  if (selectionsByDiv.size) {
    return Array.from(selectionsByDiv.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([divisionIndex, horses]) => ({ divisionIndex, horses }));
  }

  // 3) Strikt texttolkning av synligt ATG-kvitto. Denna tar bara rader under
  // rubriken AVD/HÄSTAR och stoppar vid hästnamn, t.ex. "6 3 FANGIO COR" -> [3].
  const bodyTextForReceipt = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const fromStrictText = parseAtgSelectionsFromVisibleText(bodyTextForReceipt, divisionCount);
  if (fromStrictText.length) return fromStrictText;

  // 4) Flexibel DOM-scan om ATG ändrat data-test-id. Körs bara om inget annat fungerade.
  const domCandidates = await page.$$eval('tr, li, [class*="receipt"], [class*="coupon"], [class*="Coupon"], [data-test-id*="race"], [data-test-id*="receipt"]', (els) => {
    return els.slice(0, 1200).map((el) => {
      const attrs = {};
      for (const a of Array.from(el.attributes || [])) attrs[a.name] = a.value;
      return { text: (el.innerText || el.textContent || '').replace(/\u00A0/g, ' ').trim(), attrs };
    }).filter(x => x.text && x.text.length <= 260);
  }).catch(() => []);

  for (const c of domCandidates) {
    const rows = parseAtgSelectionsFromVisibleText(c.text, divisionCount);
    // Bara kandidater som tydligt ger en eller flera kupongrader får användas.
    for (const row of rows) addSelection(row.divisionIndex, row.horses);
  }

  return Array.from(selectionsByDiv.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([divisionIndex, horses]) => ({ divisionIndex, horses }));
}

router.post('/:id/import/atg', async (req, res) => {
  let browser = null;

  try {
    const { id } = req.params;
    const { url, status } = req.body || {};

    if (!url) return res.status(400).json({ error: 'Saknar url' });

    let u;
    try { u = new URL(url); } catch { return res.status(400).json({ error: 'Ogiltig URL' }); }
    if (!u.hostname.endsWith('atg.se')) {
      return res.status(400).json({ error: 'Endast atg.se-länkar tillåts' });
    }

    const game = await TravGame.findById(id);
    if (!game) return res.status(404).json({ error: 'Spelet hittades inte' });

    const divisionCount = getDivisionCount(game.gameType);

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const page = await browser.newPage({
      locale: 'sv-SE',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      viewport: { width: 1365, height: 1100 },
    });

    await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);

    // Försök stänga cookie/consent om den blockerar DOM/text.
    for (const label of ['Godkänn alla', 'Acceptera alla', 'Acceptera', 'Jag förstår', 'OK']) {
      try { await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click({ timeout: 700 }); } catch {}
    }

    await page.waitForTimeout(1500);

    let shareName = null;
    try {
      shareName = await page.locator('[data-test-id="share-details-name"]').first().innerText({ timeout: 2500 });
      shareName = normalizeAtgCouponText(shareName);
    } catch {
      shareName = null;
    }

    const selections = await extractAtgCouponFromPage(page, divisionCount);

    if (!selections.length) {
      const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      return res.status(422).json({
        error: 'Kunde inte tolka avdelningar/hästar ur ATG-länken. Kontrollera att länken visar ett kvitto eller en kupong som är synlig utan inloggning.',
        debug: bodyText.slice(0, 1200),
      });
    }

    const fallbackName = `ATG import ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const couponName = shareName && shareName.length ? shareName : fallbackName;
    const normalizedStatus = normalizeCouponStatus(status);

    game.coupons.push({
      name: couponName,
      source: 'atg',
      stakeLevel: 'original',
      selections,
      status: normalizedStatus,
      active: normalizedStatus === 'active',
    });

    await game.save();
    const newCoupon = game.coupons[game.coupons.length - 1];
    return res.status(201).json(newCoupon);
  } catch (err) {
    console.error('POST /games/:id/import/atg error', err);
    return res.status(err.statusCode || 500).json({
      error: err.message || 'Serverfel vid import av ATG-kupong.',
      detail: String(err && err.stack ? err.stack : err).slice(0, 1600),
    });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
});


module.exports = router;
