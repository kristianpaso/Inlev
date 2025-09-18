
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'schema-logs.json');
const CFG_FILE = path.join(DATA_DIR, 'schema-config.json');

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function readJson(p, fallback) {
  ensureDir();
  try { if (!fs.existsSync(p)) return fallback;
        const raw = fs.readFileSync(p, 'utf-8'); return JSON.parse(raw || 'null') ?? fallback; } catch(e){ return fallback; }
}
function writeJson(p, obj) { ensureDir(); fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8'); }

// --------- Config
router.get('/config', (req, res) => {
  const cfg = readJson(CFG_FILE, { areas: [], people: [] });
  res.json(cfg);
});
router.post('/config', (req, res) => {
  const { areas, people } = req.body || {};
  const cur = readJson(CFG_FILE, { areas: [], people: [] });
  if (Array.isArray(areas)) cur.areas = areas;
  if (Array.isArray(people)) cur.people = people;
  writeJson(CFG_FILE, cur);
  res.json(cur);
});

// --------- Entries
router.get('/entries', (req, res) => {
  res.json(readJson(LOG_FILE, []));
});

router.post('/entry', (req, res) => {
  const { rawText, assignments, meta } = req.body || {};
  if (!rawText || !Array.isArray(assignments)) return res.status(400).json({ error: 'rawText and assignments[] are required' });
  const all = readJson(LOG_FILE, []);
  const id = `scm_${new Date().toISOString()}_${uuidv4().slice(0,4)}`;
  const entry = { id, ts: new Date().toISOString(), rawText, assignments, meta: meta || {} };
  all.push(entry);
  writeJson(LOG_FILE, all);
  res.json(entry);
});

router.delete('/entry/:id', (req, res) => {
  const id = req.params.id;
  const all = readJson(LOG_FILE, []);
  const idx = all.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  all.splice(idx, 1);
  writeJson(LOG_FILE, all);
  res.json({ ok: true, id });
});

// --------- Stats
router.get('/stats', (req, res) => {
  const all = readJson(LOG_FILE, []);
  const agg = {}; // area -> person -> count
  for (const e of all) for (const a of (e.assignments || [])) {
    if (!a || !a.area || !a.person) continue;
    const area = a.area, person = a.person;
    agg[area] = agg[area] || {};
    agg[area][person] = (agg[area][person] || 0) + 1;
  }
  const rows = [];
  Object.keys(agg).sort().forEach(area => {
    Object.keys(agg[area]).sort().forEach(person => rows.push({ area, person, count: agg[area][person] }));
  });
  res.json({ rows, totalEntries: all.length });
});

router.get('/statsByPerson', (req, res) => {
  const all = readJson(LOG_FILE, []);
  const personTotals = {}; // person -> total
  const personAreas = {}; // person -> area -> count
  for (const e of all) for (const a of (e.assignments || [])) {
    if (!a || !a.area || !a.person) continue;
    const { area, person } = a;
    personTotals[person] = (personTotals[person] || 0) + 1;
    personAreas[person] = personAreas[person] || {};
    personAreas[person][area] = (personAreas[person][area] || 0) + 1;
  }
  const rows = Object.keys(personTotals).sort().map(p => ({
    person: p, total: personTotals[p], areas: personAreas[p]
  }));
  res.json({ rows });
});

module.exports = router;
