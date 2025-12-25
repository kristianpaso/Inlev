// trav-api/routes/tracks.js
const express = require('express');
const TravTrack = require('../models/Track');

const router = express.Router();

// GET /api/trav/tracks – lista alla banor
router.get('/', async (req, res) => {
  try {
    const tracks = await TravTrack.find().sort({ name: 1 }).lean();
    res.json(tracks);
  } catch (err) {
    console.error('GET /tracks error', err);
    res.status(500).send('Serverfel vid hämtning av banor.');
  }
});

// POST /api/trav/tracks – skapa ny bana
router.post('/', async (req, res) => {
  try {
   const { name, code, slug, length, width, homeStretch, openStretch, angledGate, lat, lon } = req.body;

    if (!name || !code) {
      return res
        .status(400)
        .send('Namn och banförkortning krävs för att skapa bana.');
    }

    const track = new TravTrack({
      name,
      code,
      length,
      width,
      homeStretch,
      openStretch,
      angledGate,
      slug: (slug || '').trim().toLowerCase(),
      lat: lat ?? null,
      lon: lon ?? null,
    });

    const saved = await track.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /tracks error', err);
    res.status(500).send('Serverfel vid skapande av bana.');
  }
});
// PUT /api/trav/tracks/:id – uppdatera bana
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      slug,
      length,
      width,
      homeStretch,
      openStretch,
      angledGate,
      
      lat,
      lon,
    } = req.body;

    const track = await TravTrack.findById(id);
    if (!track) {
      return res.status(404).send('Banan hittades inte.');
    }
if (slug !== undefined) track.slug = (slug || '').trim().toLowerCase();
    if (name !== undefined) track.name = name.trim();
    if (code !== undefined) track.code = code.trim().toUpperCase();
    if (slug !== undefined) track.slug = (slug || '').trim().toLowerCase();
    if (length !== undefined) track.length = length;
    if (width !== undefined) track.width = width;
    if (homeStretch !== undefined) track.homeStretch = homeStretch;
    if (openStretch !== undefined) track.openStretch = openStretch;
    if (angledGate !== undefined) track.angledGate = angledGate;
    if (lat !== undefined) track.lat = lat ?? null;
    if (lon !== undefined) track.lon = lon ?? null;

    const saved = await track.save();
    res.json(saved);
  } catch (err) {
    console.error('PUT /tracks/:id error', err);
    res.status(500).send('Serverfel vid uppdatering av bana.');
  }
});


// DELETE /api/trav/tracks/:id – ta bort bana
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await TravTrack.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).send('Banan hittades inte.');
    }
    res.status(204).send(); // no content
  } catch (err) {
    console.error('DELETE /tracks/:id error', err);
    res.status(500).send('Serverfel vid borttagning av bana.');
  }
});

module.exports = router;
