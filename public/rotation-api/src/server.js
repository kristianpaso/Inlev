require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { connectDb } = require('./db');
const Department = require('./models/Department');
const Person = require('./models/Person');
const DayLog = require('./models/DayLog');

const app = express();
const PORT = process.env.PORT || 5050;

// CORS: allow Netlify + local dev + custom
const allowed = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function isValidObjectId(id){ return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id); }
function isIsoDate(s){ return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

function normEntries(entries){
  if(!Array.isArray(entries)) return [];
  const out = [];
  for(const e of entries){
    const departmentId = String(e?.departmentId || '');
    const minutes = Number(e?.minutes);
    if(!isValidObjectId(departmentId)) continue;
    if(!Number.isFinite(minutes) || minutes <= 0) continue;
    out.push({ departmentId: new mongoose.Types.ObjectId(departmentId), minutes: clamp(minutes, 1, 24*60) });
  }
  return out;
}

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
    version: '1.1.0',
    endpoints: [
      'GET /api/health',
      'GET/POST /api/departments',
      'GET/POST /api/persons',
      'PUT /api/persons/:id',
      'GET /api/persons-expanded'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Departments (MongoDB: collection "avdelningar")
app.get('/api/departments', async (req, res) => {
  try {
    const items = await Department.find({}).sort({ name: 1 }).lean();
      res.json(items.map(d => ({
        id: String(d._id),
        name: d.name,
        goalPerHour: d.goalPerHour ?? null,
        avgWeightKg: d.avgWeightKg ?? null,
        info: d.info ?? '',
        createdAt: d.createdAt,
        updatedAt: d.updatedAt
      })));
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to fetch departments' });
  }
});

app.post('/api/departments', async (req, res) => {
  try {
    const name = (req.body?.name || '').trim();
    const goalPerHourRaw = req.body?.goalPerHour;
    const avgWeightKgRaw = req.body?.avgWeightKg;
      const infoRaw = req.body?.info;

    if (!name || name.length < 2) {
      return res.status(400).json({ ok: false, error: 'name is required (min 2 chars)' });
    }

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

    const info = typeof infoRaw === 'string' ? infoRaw.trim() : '';
      const created = await Department.create({ name, goalPerHour, avgWeightKg, info });
    res.status(201).json({ ok: true, department: { id: String(created._id), name: created.name, goalPerHour: created.goalPerHour ?? null, avgWeightKg: created.avgWeightKg ?? null, info: created.info ?? '', createdAt: created.createdAt, updatedAt: created.updatedAt } });
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
      const goalPerHour = v === null || v === '' ? null : Number(v);
      if (goalPerHour !== null && (!Number.isFinite(goalPerHour) || goalPerHour < 0)) {
        return res.status(400).json({ ok: false, error: 'goalPerHour must be a non-negative number' });
      }
      update.goalPerHour = goalPerHour;
    }

    if (req.body?.avgWeightKg !== undefined) {
      const v = req.body.avgWeightKg;
      const avgWeightKg = v === null || v === '' ? null : Number(v);
      if (avgWeightKg !== null && (!Number.isFinite(avgWeightKg) || avgWeightKg < 0)) {
        return res.status(400).json({ ok: false, error: 'avgWeightKg must be a non-negative number' });
      }
      update.avgWeightKg = avgWeightKg;
    }

    if (req.body?.info !== undefined) {
      update.info = typeof req.body.info === 'string' ? req.body.info.trim() : '';
    }

    const updated = await Department.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ ok: false, error: 'department not found' });

    res.json({
      ok: true,
      department: {
        id: String(updated._id),
        name: updated.name,
        goalPerHour: updated.goalPerHour ?? null,
        avgWeightKg: updated.avgWeightKg ?? null,
        info: updated.info ?? '',
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      }
    });
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

    // Remove reference from persons
    await Person.updateMany({}, { $pull: { departmentIds: deleted._id } });

    res.json({ ok: true, deletedId: id });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to delete department' });
  }
});

// Persons (MongoDB: collection "personer")
app.get('/api/persons', async (req, res) => {
  try {
    const persons = await Person.find({}).sort({ createdAt: -1 }).lean();
      res.json(persons.map(p => ({
        id: String(p._id),
        name: p.name,
        departmentIds: (p.departmentIds || []).map(x => String(x)),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      })));
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
    // Keep only valid Mongo ObjectId-looking strings
    const cleanedIds = departmentIds.filter(v => typeof v === 'string' && /^[a-fA-F0-9]{24}$/.test(v));
    const created = await Person.create({ name, departmentIds: cleanedIds });
    res.status(201).json({ ok: true, person: { id: String(created._id), name: created.name, departmentIds: (created.departmentIds||[]).map(x=>String(x)), createdAt: created.createdAt, updatedAt: created.updatedAt } });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to create person' });
  }
});

app.put('/api/persons/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : null;
    const departmentIds = Array.isArray(req.body?.departmentIds) ? req.body.departmentIds : null;

    const update = {};
    if (name && name.length >= 2) update.name = name;
    if (departmentIds) {
      update.departmentIds = departmentIds
        .filter(v => typeof v === 'string' && /^[a-fA-F0-9]{24}$/.test(v));
    }

    const updated = await Person.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ ok: false, error: 'person not found' });
    res.json({ ok: true, person: { id: String(updated._id), name: updated.name, departmentIds: (updated.departmentIds||[]).map(x=>String(x)), createdAt: updated.createdAt, updatedAt: updated.updatedAt } });
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


// Helpful: expand persons with department names
app.get('/api/persons-expanded', async (req, res) => {
  try {
    const persons = await Person.find({}).populate('departmentIds').lean();
    const expanded = persons.map(p => ({
      ...p,
      departments: (p.departmentIds || []).map(d => ({ _id: d._id, name: d.name }))
    }));
    res.json(expanded);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to fetch expanded persons' });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message || 'server error' });
});

// Start server after DB connect
/* ---------------- Day Logs ---------------- */

// Upsert day log for person+date
app.post('/api/day-logs', async (req, res) => {
  try{
    const personIdRaw = String(req.body?.personId || '');
    const date = req.body?.date;
    const entries = normEntries(req.body?.entries);

    if(!isValidObjectId(personIdRaw)) return res.status(400).json({ ok:false, error:'personId must be a valid ObjectId' });
    if(!isIsoDate(date)) return res.status(400).json({ ok:false, error:'date must be YYYY-MM-DD' });
    if(entries.length === 0) return res.status(400).json({ ok:false, error:'entries must contain at least 1 valid row (departmentId + minutes)' });

    const personId = new mongoose.Types.ObjectId(personIdRaw);

    const p = await Person.findById(personId).lean();
    if(!p) return res.status(404).json({ ok:false, error:'person not found' });

    // Robust upsert to avoid rare duplicate key race
    try{
      const doc = await DayLog.findOneAndUpdate(
        { personId, date },
        { $set: { entries } },
        { upsert: true, new: true }
      ).lean();

      return res.json({ ok:true, dayLog: { id:String(doc._id), personId:String(doc.personId), date: doc.date, entries: doc.entries }});
    }catch(e){
      if(e && e.code === 11000){
        const doc = await DayLog.findOneAndUpdate(
          { personId, date },
          { $set: { entries } },
          { new: true }
        ).lean();
        return res.json({ ok:true, dayLog: { id:String(doc._id), personId:String(doc.personId), date: doc.date, entries: doc.entries }});
      }
      throw e;
    }
  }catch(e){
    console.error('[day-logs] save error:', e);
    res.status(500).json({ ok:false, error: e?.message || 'Failed to save day log' });
  }
});

// Get logs for person (optional range)
app.get('/api/day-logs', async (req, res) => {
  try{
    const personIdRaw = String(req.query.personId || '');
    const from = req.query.from;
    const to = req.query.to;

    if(!isValidObjectId(personIdRaw)) return res.status(400).json({ ok:false, error:'personId must be a valid ObjectId' });
    const personId = new mongoose.Types.ObjectId(personIdRaw);

    const q = { personId };
    if(from && isIsoDate(from)) q.date = { ...(q.date||{}), $gte: from };
    if(to && isIsoDate(to)) q.date = { ...(q.date||{}), $lte: to };

    const docs = await DayLog.find(q).sort({ date: 1 }).lean();
    res.json(docs.map(d => ({ id:String(d._id), personId:String(d.personId), date:d.date, entries:d.entries })));
  }catch(e){
    console.error('[day-logs] fetch error:', e);
    res.status(500).json({ ok:false, error: e?.message || 'Failed to fetch day logs' });
  }
});

// Get list of dates with logs for person
app.get('/api/day-logs/dates', async (req, res) => {
  try{
    const personIdRaw = String(req.query.personId || '');
    if(!isValidObjectId(personIdRaw)) return res.status(400).json({ ok:false, error:'personId must be a valid ObjectId' });
    const personId = new mongoose.Types.ObjectId(personIdRaw);

    const docs = await DayLog.find({ personId }).select({ date: 1 }).sort({ date: 1 }).lean();
    res.json(docs.map(d => d.date));
  }catch(e){
    console.error('[day-logs] dates error:', e);
    res.status(500).json({ ok:false, error: e?.message || 'Failed to fetch day log dates' });
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
