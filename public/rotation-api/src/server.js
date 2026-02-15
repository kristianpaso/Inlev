const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const crypto = require('crypto');
const { readDb, writeDb, ensureDb } = require('./storage');

const app = express();

const PORT = process.env.PORT || 5050;

// CORS: allow Netlify + local dev + custom
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

ensureDb();

// nanoid is ESM-only in recent versions, which breaks require() in CommonJS.
// Use Node's built-in crypto to generate short IDs instead.
function makeId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'rotation-api',
    version: '1.0.0',
    endpoints: [
      'GET /api/health',
      'GET/POST /api/departments',
      'GET/POST /api/persons',
      'PUT /api/persons/:id'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Departments
app.get('/api/departments', (req, res) => {
  const db = readDb();
  res.json(db.departments);
});

app.post('/api/departments', (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'name is required (min 2 chars)' });
  }
  const db = readDb();
  const exists = db.departments.find(d => d.name.toLowerCase() === name.trim().toLowerCase());
  if (exists) {
    return res.status(409).json({ ok: false, error: 'department already exists', department: exists });
  }
  const department = {
    id: makeId(),
    name: name.trim(),
    // Workload fields can be added later:
    // kgPerDay: null,
    // handlesPerDay: null,
    // concentration: null
    createdAt: new Date().toISOString()
  };
  db.departments.push(department);
  writeDb(db);
  res.status(201).json({ ok: true, department });
});

// Persons
app.get('/api/persons', (req, res) => {
  const db = readDb();
  res.json(db.persons);
});

app.post('/api/persons', (req, res) => {
  const { name, departmentIds } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'name is required (min 2 chars)' });
  }
  const db = readDb();
  const person = {
    id: makeId(),
    name: name.trim(),
    departmentIds: Array.isArray(departmentIds) ? departmentIds : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.persons.push(person);
  writeDb(db);
  res.status(201).json({ ok: true, person });
});

app.put('/api/persons/:id', (req, res) => {
  const { id } = req.params;
  const { name, departmentIds } = req.body || {};
  const db = readDb();
  const person = db.persons.find(p => p.id === id);
  if (!person) return res.status(404).json({ ok: false, error: 'person not found' });

  if (typeof name === 'string' && name.trim().length >= 2) person.name = name.trim();
  if (Array.isArray(departmentIds)) person.departmentIds = departmentIds;

  person.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ ok: true, person });
});

// Helpful: expand persons with department names
app.get('/api/persons-expanded', (req, res) => {
  const db = readDb();
  const deptMap = new Map(db.departments.map(d => [d.id, d]));
  const expanded = db.persons.map(p => ({
    ...p,
    departments: (p.departmentIds || []).map(id => deptMap.get(id)).filter(Boolean)
  }));
  res.json(expanded);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message || 'server error' });
});

app.listen(PORT, () => {
  console.log(`rotation-api listening on :${PORT}`);
});
