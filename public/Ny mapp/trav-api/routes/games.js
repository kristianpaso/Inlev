// trav-api/routes/games.js
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

// 🔹 Hämta ett specifikt spel
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

module.exports = router;
