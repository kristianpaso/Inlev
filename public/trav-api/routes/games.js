// trav-api/routes/games.js

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

const express = require('express');
const TravGame = require('../models/Game');
const { parseHorseText } = require('../utils/horseParser');

const router = express.Router();


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
  try {
    const { id } = req.params;
    const game = await TravGame.findById(id);
    if (!game) return res.status(404).send('Spelet hittades inte.');

   const date = game.date;
const gameType = String(game.gameType);
const trackSlug = String(game.trackSlug || '').trim();
    
    // Fallback från frontend om spelet saknar fält i DB
const bodyDate = (req.body?.date || '').trim();
const bodyGameType = (req.body?.gameType || '').trim();
const bodyTrackSlug = (req.body?.trackSlug || '').trim();

if ((!game.date && bodyDate) || (!game.gameType && bodyGameType) || (!game.trackSlug && bodyTrackSlug)) {
  if (!game.date && bodyDate) game.date = bodyDate;
  if (!game.gameType && bodyGameType) game.gameType = bodyGameType;
  if (!game.trackSlug && bodyTrackSlug) game.trackSlug = bodyTrackSlug;
  await game.save(); // sparar tillbaka så du slipper problem nästa gång
}


    if (!date || !gameType || !trackSlug) {
      return res.status(400).send('Saknar date/gameType/trackSlug i spelet.');
    }

    // antal avdelningar: ta från parsedHorseInfo om du har det, annars default
    const divisionCount =
      (game.parsedHorseInfo && Object.keys(game.parsedHorseInfo).length) ||
      (gameType.toUpperCase() === 'V86' ? 8 :
       gameType.toUpperCase() === 'V85' ? 8 :
       gameType.toUpperCase() === 'V75' ? 7 :
       gameType.toUpperCase() === 'V64' ? 6 : 8);

    const results = {};

    for (let avd = 1; avd <= divisionCount; avd++) {
      const url = `https://www.atg.se/spel/${date}/${gameType}/${trackSlug}/avd/${avd}/resultat`;

      const html = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then(r => r.text());

      const $ = cheerio.load(html);

      // 1) hitta första raden där placement == "1"
      // ATG: data-test-id="horse-placement" innehåller placering
      let winnerNumber = null;

      $('tr[data-test-id^="results-table-row"]').each((_, tr) => {
        const placement = $(tr).find('[data-test-id="horse-placement"]').first().text().trim();
        if (placement === '1') {
          // hästtext ex: "2 Princess Diamond" => vi tar första numret
          const horseText = $(tr).find('[startlist-export-id="startlist-cell-horse-split-export"]').first().text().trim();
          const m = horseText.match(/^(\d+)/);
          if (m) winnerNumber = Number(m[1]);
          return false; // break
        }
      });

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
    const { selections, name, source, stakeLevel } = req.body;

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

  game.coupons.push({
  selections: normalized,
  name: name || '',
  source: source || 'manual',
  stakeLevel: stakeLevel || 'original',
  active: true, // ✅ default
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
    const { active } = req.body || {};

    const game = await TravGame.findById(id);
    if (!game) {
      return res.status(404).send('Spelet hittades inte.');
    }

    const coupon = game.coupons.id(couponId);
    if (!coupon) {
      return res.status(404).send('Kupongen hittades inte.');
    }

    coupon.active = Boolean(active);
 // default true om saknas
    await game.save();

    return res.json(coupon);
  } catch (err) {
    console.error('PATCH /games/:id/coupons/:couponId error', err);
    return res.status(500).send('Serverfel vid uppdatering av kupong.');
  }
});





router.post('/:id/import/atg', async (req, res) => {
  try {
    const { id } = req.params;
    const { url } = req.body || {};

    if (!url) return res.status(400).json({ error: 'Saknar url' });

    let u;
    try { u = new URL(url); } catch { return res.status(400).json({ error: 'Ogiltig URL' }); }
    if (!u.hostname.endsWith('atg.se')) {
      return res.status(400).json({ error: 'Endast atg.se-länkar tillåts' });
    }

    const game = await TravGame.findById(id);
    if (!game) return res.status(404).json({ error: 'Spelet hittades inte' });

        let browser = null;

    try {
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
      const page = await browser.newPage();

      // Vänta tills sidan är klar (ATG renderar kvittot med JS)
      await page.goto(u.toString(), { waitUntil: 'networkidle', timeout: 60000 });

const RECEIPT_ROW_SEL = 'tr[data-test-id="receipt-row"]';
const PRELIM_ROW_SEL = '[data-test-id="shop-purchase-confirm-coupon-race-row"]';

const hasAny = async (sel) => (await page.locator(sel).count()) > 0;



// Hämta namnet på andelssystemet (t.ex. "NICLAS & CALLE 36")
let shareName = null;
try {
  shareName = await page.locator('[data-test-id="share-details-name"]').first().innerText();
  shareName = shareName.replace(/\u00A0/g, ' ').trim();
} catch {
  shareName = null;
}


      // Vänta på att raderna i kvittot finns
    // Försök hitta inlämnat kvitto först, annars preliminär kupong
let mode = null; // 'receipt' | 'prelim'

// 1) Vänta kort på att nåt av dem dyker upp
await page.waitForTimeout(1000);

if (await hasAny(RECEIPT_ROW_SEL)) {
  mode = 'receipt';
} else if (await hasAny(PRELIM_ROW_SEL)) {
  mode = 'prelim';
} else {
  // Ge sidan lite mer tid och testa igen
  await page.waitForTimeout(2000);

  if (await hasAny(RECEIPT_ROW_SEL)) mode = 'receipt';
  else if (await hasAny(PRELIM_ROW_SEL)) mode = 'prelim';
}

// Om fortfarande inget hittas: throw
if (!mode) {
  const html = await page.content();
  throw Object.assign(new Error('Kunde inte hitta varken kvitto (inlämnat) eller preliminär kupong på sidan.'), {
    statusCode: 422,
    debug: html.slice(0, 2000),
  });
}

const selections = [];

if (mode === 'receipt') {
  const rows = await page.$$(RECEIPT_ROW_SEL);

  for (const row of rows) {
    const divisionIndex = await row.evaluate(el => Number(el.getAttribute('data-test-value')));
    if (!Number.isFinite(divisionIndex) || divisionIndex <= 0) continue;

    const horses = await row.$$eval(
      'span[data-test-id="horse-number"]',
      spans => spans
        .map(s => Number((s.textContent || '').trim()))
        .filter(n => Number.isFinite(n) && n > 0)
    );

    if (!horses.length) continue;
    selections.push({ divisionIndex, horses });
  }
}

if (mode === 'prelim') {
  const rows = await page.$$(PRELIM_ROW_SEL);

  for (const row of rows) {
    const divisionIndex = await row.$eval(
      '[data-test-id="race-row-number"]',
      el => Number((el.textContent || '').trim())
    ).catch(() => NaN);

    if (!Number.isFinite(divisionIndex) || divisionIndex <= 0) continue;

    // ✅ VIKTIGT: läs varje span separat (inte textContent på hela containern)
    const horses = await row.$$eval(
      '[data-test-id="shop-purchase-confirm-coupon-race-row-selections"] span',
      (spans) => {
        const out = [];

        for (const s of spans) {
          // hoppa över strukna (strike) – ibland ligger siffran i en span inuti strike-span
          const cls = (s.className || '').toString();
          const parentCls = (s.parentElement?.className || '').toString();

          if (cls.includes('strike') || parentCls.includes('strike')) continue;

          const txt = (s.textContent || '').replace(/\u00A0/g, ' ').trim();

          // kan vara "9 Harriet Zet" → ta första numret
          const m = txt.match(/^(\d{1,2})\b/);
          if (m) out.push(Number(m[1]));
        }

        // unika + sorterade
        return Array.from(new Set(out)).sort((a, b) => a - b);
      }
    );

    if (!horses.length) continue;
    selections.push({ divisionIndex, horses });
  }
}


if (!selections.length) {
  return res.status(422).json({
    error: `Kunde inte tolka avdelningar/hästar ur ATG-${mode === 'prelim' ? 'preliminär kupong' : 'kvitto'} (DOM).`
  });
}


      // Skapa kupongen (sparas i DB)
const fallbackName = `ATG import ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
let couponName = shareName && shareName.length ? shareName : fallbackName;

if (mode === 'prelim') {
  couponName = `Preliminär ${couponName}`;
}


game.coupons.push({
  name: couponName,
  source: 'atg',
  stakeLevel: 'original',
  selections,
  active: true, // ✅
});

 
      await game.save();
      const newCoupon = game.coupons[game.coupons.length - 1];
      return res.status(201).json(newCoupon);

    } catch (err) {
      if (browser) {
        try { await browser.close(); } catch {}
      }
      console.error('POST /games/:id/import/atg error', err);
      return res.status(500).json({ error: 'Serverfel vid import av ATG-kupong.', details: err?.message || String(err) });
    }
 
  

  } catch (err) {
    console.error('POST /games/:id/import/atg error', err);
    res.status(500).json({ error: 'Serverfel vid import av ATG-kupong.', details: err?.message || String(err) });
  }
});



module.exports = router;
