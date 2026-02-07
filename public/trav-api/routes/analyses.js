// trav-api/routes/analyses.js
const express = require('express');
const Analysis = require('../models/Analysis');

const router = express.Router();

// GET all
router.get('/', async (req, res) => {
  try{
    const items = await Analysis.find({}).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e){
    res.status(500).send(e?.message || 'Kunde inte hämta analyser');
  }
});

// POST create
router.post('/', async (req, res) => {
  try{
    const created = await Analysis.create(req.body);
    res.json(created);
  } catch (e){
    res.status(400).send(e?.message || 'Kunde inte skapa analys');
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try{
    const updated = await Analysis.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if(!updated) return res.status(404).send('Analys hittades inte');
    res.json(updated);
  } catch (e){
    res.status(400).send(e?.message || 'Kunde inte uppdatera analys');
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try{
    await Analysis.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e){
    res.status(400).send(e?.message || 'Kunde inte ta bort analys');
  }
});

module.exports = router;
