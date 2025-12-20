// trav-api/routes/games.js

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

const express = require('express');
const TravGame = require('../models/Game');
const { parseHorseText } = require('../utils/horseParser');

const router = express.Router();

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
    const { title, date, track, gameType, horseText = '' } = req.body;

    if (!title || !date || !track || !gameType) {
      return res.status(400).send('Titel, datum, bana och spelform krävs.');
    }

    const parsedHorseInfo = parseHorseText(horseText, gameType);

    const game = new TravGame({
      title,
      date,
      track,
      gameType,
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

// Uppdatera befintligt spel
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, date, track, gameType, horseText = '' } = req.body;

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

const newCoupon = gam
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
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Kvittot ligger i en div som innehåller "HorseReceipt" i klassnamnet (hashad prefix)
  const receiptSelector = 'div[class*="HorseReceipt"]';

  // Vänta tills kvittot renderats (ATG bygger ofta med JS)
  await page.waitForSelector(receiptSelector, { timeout: 30000 });

  // Hämta alla rader i kvittotabellen
const rows = await page.$$(`tr[data-test-id="receipt-row"]`);

const selections = [];

for (const row of rows) {
  const divisionIndex = await row.evaluate(el => Number(el.getAttribute('data-test-value')));
  if (!Number.isFinite(divisionIndex) || divisionIndex <= 0) continue;

  // Hästarna ligger i spans med data-test-id="horse-number"
  const horses = await row.$$eval(
    `span[data-test-id="horse-number"]`,
    (spans) =>
      spans
        .map(s => Number((s.textContent || '').trim()))
        .filter(n => Number.isFinite(n) && n > 0)
  );

  if (!horses.length) continue;

  selections.push({ divisionIndex, horses });
}

if (!selections.length) {
  // Debug: returnera lite info så vi ser om selectors missar
  const debugHtml = await page.content();
  throw Object.assign(new Error('Kunde inte tolka avdelningar/hästar ur ATG-kvittot (DOM).'), {
    statusCode: 422,
    debug: debugHtml.slice(0, 2000),
  });
}


  await game.save();
  const newCoupon = game.coupons[game.coupons.length - 1];
  return res.status(201).json(newCoupon);

} catch (err) {
  if (browser) {
    try { await browser.close();
browser = null; } catch {}
  }
  console.error('POST /games/:id/import/atg error', err);
  return res.status(500).json({ error: 'Serverfel vid import av ATG-kupong (render/parse).' });
}


} catch (err) {
  if (browser) {
    try { await browser.close(); } catch {}
  }

  const status = err.statusCode || 500;
  console.error('POST /games/:id/import/atg error', err);

  return res.status(status).json({
    error: err.message || 'Serverfel vid import av ATG-kupong (render/parse).',
    debug: err.debug || undefined
  });
}

});


module.exports = router;
