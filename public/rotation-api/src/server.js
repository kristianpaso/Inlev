require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { connectDb } = require('./db');
const Department = require('./models/Department');
const Person = require('./models/Person');

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function numOrNull(v){
  if(v === null || v === undefined) return null;
  if(typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toInt(v, def=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function kScoreFromParts(d){
  const a = clamp(toInt(d.k_timePressure,0), 0, 2);
  const b = clamp(toInt(d.k_interruptions,0), 0, 2);
  const c = clamp(toInt(d.k_complexity,0), 0, 2);
  const dd = clamp(toInt(d.k_errorConsequence,0), 0, 3);
  const e = clamp(toInt(d.k_safetyRisk,0), 0, 1);
  const sum = a+b+c+dd+e;
  return clamp(sum === 0 ? 1 : sum, 1, 10);
}

function estimateKgPerHour(goalPerHour, avgWeightKg){
  const g = numOrNull(goalPerHour);
  const w = numOrNull(avgWeightKg);
  if(g === null || w === null) return null;
  return g * w;
}

function estimateMET(kgPerHour, goalPerHour){
  if(kgPerHour === null) return null;
  let met;
  if(kgPerHour < 50) met = 2.5;
  else if(kgPerHour < 150) met = 3.5;
  else if(kgPerHour < 300) met = 4.5;
  else if(kgPerHour < 600) met = 6.0;
  else met = 7.0;

  const g = numOrNull(goalPerHour);
  if(g !== null){
    if(g >= 300) met += 0.5;
    if(g >= 600) met += 0.5;
    if(g >= 900) met += 0.5;
    if(g >= 1200) met += 0.5;
  }
  met = clamp(met, 2.0, 10.0);
  return Math.round(met * 10) / 10;
}

function metToScore(met){
  if(met === null) return null;
  const minMet = 2.0, maxMet = 8.0;
  const clamped = clamp(met, minMet, maxMet);
  const t = (clamped - minMet) / (maxMet - minMet);
  return clamp(1 + Math.round(t * 9), 1, 10);
}

function totalScore(metScore, kScore){
  if(metScore === null) return null;
  const t = (metScore + kScore) / 2;
  return Math.round(t * 10) / 10;
}

function normalizeDepartment(d){
  const kgph = estimateKgPerHour(d.goalPerHour, d.avgWeightKg);
  const met = estimateMET(kgph, d.goalPerHour);
  const metScore = metToScore(met);
  const kScore = kScoreFromParts(d);
  const tScore = metScore === null ? null : totalScore(metScore, kScore);

  return {
    id: String(d._id),
    name: d.name,
    goalPerHour: d.goalPerHour ?? null,
    avgWeightKg: d.avgWeightKg ?? null,
    info: d.info ?? '',
    k_timePressure: d.k_timePressure ?? 0,
    k_interruptions: d.k_interruptions ?? 0,
    k_complexity: d.k_complexity ?? 0,
    k_errorConsequence: d.k_errorConsequence ?? 0,
    k_safetyRisk: d.k_safetyRisk ?? 0,
    kScore,
    met,
    metScore,
    totalScore: tScore,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt
  };
}

function normalizePerson(p){
  return {
    id: String(p._id),
    name: p.name,
    departmentIds: (p.departmentIds || []).map(x => String(x)),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

const app = express();
const PORT = process.env.PORT || 5050;

const allowed = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowed.length === 0) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    }
  })
);

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'rotation-api',
    version: '1.3.0',
    endpoints: [
      'GET /api/health',
      'GET/POST/PUT/DELETE /api/departments',
      'GET/POST/PUT/DELETE /api/persons',
      'GET /api/persons-expanded'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---------- Departments ----------
app.get('/api/departments', async (req, res) => {
  try {
    const items = await Department.find({}).sort({ name: 1 }).lean();
    res.json(items.map(normalizeDepartment));
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to fetch departments' });
  }
});

app.post('/api/departments', async (req, res) => {
  try {
    const name = (req.body?.name || '').trim();
    if (!name || name.length < 2) {
      return res.status(400).json({ ok: false, error: 'name is required (min 2 chars)' });
    }

    const goalPerHourRaw = req.body?.goalPerHour;
    const avgWeightKgRaw = req.body?.avgWeightKg;

    const goalPerHour =
      goalPerHourRaw === null || goalPerHourRaw === undefined || goalPerHourRaw === ''
        ? null
        : Number(goalPerHourRaw);

    const avgWeightKg =
      avgWeightKgRaw === null || avgWeightKgRaw === undefined || avgWeightKgRaw === ''
        ? null
        : Number(avgWeightKgRaw);

    if (goalPerHour !== null && (!Number.isFinite(goalPerHour) || goalPerHour < 0)) {
      return res.status(400).json({ ok: false, error: 'goalPerHour must be a non-negative number' });
    }
    if (avgWeightKg !== null && (!Number.isFinite(avgWeightKg) || avgWeightKg < 0)) {
      return res.status(400).json({ ok: false, error: 'avgWeightKg must be a non-negative number' });
    }

    const info = typeof req.body?.info === 'string' ? req.body.info.trim() : '';

    const dept = {
      name,
      goalPerHour,
      avgWeightKg,
      info,
      k_timePressure: clamp(toInt(req.body?.k_timePressure, 0), 0, 2),
      k_interruptions: clamp(toInt(req.body?.k_interruptions, 0), 0, 2),
      k_complexity: clamp(toInt(req.body?.k_complexity, 0), 0, 2),
      k_errorConsequence: clamp(toInt(req.body?.k_errorConsequence, 0), 0, 3),
      k_safetyRisk: clamp(toInt(req.body?.k_safetyRisk, 0), 0, 1)
    };

    const created = await Department.create(dept);
    res.status(201).json({ ok: true, department: normalizeDepartment(created) });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ ok: false, error: 'department already exists' });
    }
    res.status(500).json({ ok: false, error: 'Failed to create department' });
  }
});

app.put('/api/departments/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const update = {};
    if (typeof req.body?.name === 'string') {
      const name = req.body.name.trim();
      if (name.length < 2) return res.status(400).json({ ok: false, error: 'name must be at least 2 chars' });
      update.name = name;
    }

    if (req.body?.goalPerHour !== undefined) {
      const v = req.body.goalPerHour;
      const n = v === null || v === '' ? null : Number(v);
      if (n !== null && (!Number.isFinite(n) || n < 0)) {
        return res.status(400).json({ ok: false, error: 'goalPerHour must be a non-negative number' });
      }
      update.goalPerHour = n;
    }

    if (req.body?.avgWeightKg !== undefined) {
      const v = req.body.avgWeightKg;
      const n = v === null || v === '' ? null : Number(v);
      if (n !== null && (!Number.isFinite(n) || n < 0)) {
        return res.status(400).json({ ok: false, error: 'avgWeightKg must be a non-negative number' });
      }
      update.avgWeightKg = n;
    }

    if (req.body?.info !== undefined) {
      update.info = typeof req.body.info === 'string' ? req.body.info.trim() : '';
    }

    if (req.body?.k_timePressure !== undefined) update.k_timePressure = clamp(toInt(req.body.k_timePressure, 0), 0, 2);
    if (req.body?.k_interruptions !== undefined) update.k_interruptions = clamp(toInt(req.body.k_interruptions, 0), 0, 2);
    if (req.body?.k_complexity !== undefined) update.k_complexity = clamp(toInt(req.body.k_complexity, 0), 0, 2);
    if (req.body?.k_errorConsequence !== undefined) update.k_errorConsequence = clamp(toInt(req.body.k_errorConsequence, 0), 0, 3);
    if (req.body?.k_safetyRisk !== undefined) update.k_safetyRisk = clamp(toInt(req.body.k_safetyRisk, 0), 0, 1);

    const updated = await Department.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ ok: false, error: 'department not found' });

    res.json({ ok: true, department: normalizeDepartment(updated) });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ ok: false, error: 'department already exists' });
    }
    res.status(500).json({ ok: false, error: 'Failed to update department' });
  }
});

app.delete('/api/departments/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await Department.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ ok: false, error: 'department not found' });

    await Person.updateMany({}, { $pull: { departmentIds: deleted._id } });

    res.json({ ok: true, deletedId: id });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to delete department' });
  }
});

// ---------- Persons ----------
app.get('/api/persons', async (req, res) => {
  try {
    const persons = await Person.find({}).sort({ createdAt: -1 }).lean();
    res.json(persons.map(normalizePerson));
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to fetch persons' });
  }
});

app.post('/api/persons', async (req, res) => {
  try {
    const name = (req.body?.name || '').trim();
    const departmentIds = Array.isArray(req.body?.departmentIds) ? req.body.departmentIds : [];
    if (!name || name.length < 2) {
      return res.status(400).json({ ok: false, error: 'name is required (min 2 chars)' });
    }

    const created = await Person.create({ name, departmentIds });
    res.status(201).json({ ok: true, person: normalizePerson(created) });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to create person' });
  }
});

app.put('/api/persons/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const name = (req.body?.name || '').trim();
    const departmentIds = Array.isArray(req.body?.departmentIds) ? req.body.departmentIds : [];

    if (!name || name.length < 2) {
      return res.status(400).json({ ok: false, error: 'name is required (min 2 chars)' });
    }

    const updated = await Person.findByIdAndUpdate(
      id,
      { name, departmentIds },
      { new: true }
    );

    if (!updated) return res.status(404).json({ ok: false, error: 'person not found' });
    res.json({ ok: true, person: normalizePerson(updated) });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to update person' });
  }
});

app.delete('/api/persons/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await Person.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ ok: false, error: 'person not found' });
    res.json({ ok: true, deletedId: id });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to delete person' });
  }
});

app.get('/api/persons-expanded', async (req, res) => {
  try {
    const persons = await Person.find({}).sort({ createdAt: -1 }).lean();
    const depts = await Department.find({}).sort({ name: 1 }).lean();
    const map = new Map(depts.map(d => [String(d._id), normalizeDepartment(d)]));

    res.json(persons.map(p => ({
      ...normalizePerson(p),
      departments: (p.departmentIds || []).map(id => map.get(String(id))).filter(Boolean)
    })));
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to fetch persons-expanded' });
  }
});

connectDb()
  .then(() => {
    app.listen(PORT, () => console.log(`rotation-api listening on :${PORT}`));
  })
  .catch(err => {
    console.error('❌ Failed to connect to MongoDB', err);
    process.exit(1);
  });
