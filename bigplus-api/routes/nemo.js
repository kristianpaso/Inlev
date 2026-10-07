const crypto = require("node:crypto");
const express = require("express");

const router = express.Router();
const DEFAULT_DEPARTMENTS = ["Plock AS Normal","Plock AS Marketplaces","Fadder","Returhantering","B2B","Inventering","Inleverans Automatisk","Infackning Buffert","Komplettering","TL","Utleverans","Infackning AS","Plock AS - Norge","Påfyllning Buffert","Externa"];
const DEFAULT_PEOPLE = ["Ali","Asma","Sigurd","Roudi","Haris","Mathilda","Frida","Belissa","Cecilia","Paso","Morsal","Raziyeh","Nasser","Sofia","Axel","Ahmad Y","Ahmad J"];
const normalize = (value) => String(value || "").trim().toLocaleLowerCase("sv-SE");
const asId = (document) => ({ ...document, id: String(document._id), _id: undefined });

function getDb(req, res) {
  const db = req.app.locals.nemoDb;
  if (!db) { res.status(503).json({ error: "Nemo-databasen är inte ansluten ännu." }); return null; }
  return db;
}
function passwordRequired() { return Boolean(process.env.NEMO_ACCESS_PASSWORD); }
function configuredPassword() { return process.env.NEMO_ACCESS_PASSWORD || ""; }
function tokenFor(password) {
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(18).toString("base64url");
  const payload = `${expires}.${nonce}`;
  const signature = crypto.createHmac("sha256", password).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function validToken(token, password) {
  const [expires, nonce, signature, extra] = String(token || "").split(".");
  if (!expires || !nonce || !signature || extra || Number(expires) < Date.now()) return false;
  const expected = crypto.createHmac("sha256", password).update(`${expires}.${nonce}`).digest();
  let supplied;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return false; }
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
function protect(req, res, next) {
  if (!passwordRequired()) return next();
  const password = configuredPassword();
  if (!password) return res.status(503).json({ error: "Nemo kräver NEMO_ACCESS_PASSWORD innan tjänsten kan användas i produktion." });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!validToken(token, password)) return res.status(401).json({ error: "Inloggning krävs." });
  next();
}
function validDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)); }
function isoWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

router.get("/session", (req, res) => {
  res.json({ required: passwordRequired() });
});
router.post("/login", (req, res) => {
  const password = configuredPassword();
  if (!passwordRequired()) return res.json({ token: "local" });
  if (!password) return res.status(503).json({ error: "Nemo är inte konfigurerat för inloggning ännu." });
  const supplied = Buffer.from(String(req.body?.password || "")); const expected = Buffer.from(password);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ error: "Fel lösenord." });
  res.json({ token: tokenFor(password) });
});

router.use(protect);
router.get("/bootstrap", async (req, res, next) => {
  const db = getDb(req, res); if (!db) return;
  try {
    const [departments, people] = await Promise.all([
      db.collection("departments").find({ active: { $ne: false } }).sort({ createdAt: 1, name: 1 }).toArray(),
      db.collection("people").find({ active: { $ne: false } }).sort({ createdAt: 1, name: 1 }).toArray()
    ]);
    const [departmentCount, peopleCount] = await Promise.all([db.collection("departments").countDocuments(), db.collection("people").countDocuments()]);
    res.json({ departments: departments.map(asId), people: people.map(asId), seedRequired: !departmentCount && !peopleCount });
  } catch (error) { next(error); }
});
router.post("/bootstrap/seed", async (req, res, next) => {
  const db = getDb(req, res); if (!db) return;
  try {
    const [departmentCount, peopleCount] = await Promise.all([db.collection("departments").countDocuments(), db.collection("people").countDocuments()]);
    if (departmentCount || peopleCount) { res.status(409).json({ error: "Grundlistorna är redan skapade." }); return; }
    const departments = [...new Set((Array.isArray(req.body?.departments) ? req.body.departments : DEFAULT_DEPARTMENTS).map((name) => String(name).trim()).filter(Boolean))].map((name) => ({ name, key: normalize(name), active: true, createdAt: new Date() }));
    const people = [...new Set((Array.isArray(req.body?.people) ? req.body.people : DEFAULT_PEOPLE).map((name) => String(name).trim()).filter(Boolean))].map((name) => ({ name, key: normalize(name), active: true, competencies: [], createdAt: new Date() }));
    if (departments.length) await db.collection("departments").insertMany(departments);
    if (people.length) await db.collection("people").insertMany(people);
    res.json({ departments: departments.map(asId), people: people.map(asId) });
  } catch (error) { next(error); }
});
router.post("/departments", async (req, res, next) => {
  const db = getDb(req, res); if (!db) return;
  try {
    const name = String(req.body?.name || "").trim(); if (!name) return res.status(400).json({ error: "Ange avdelningens namn." });
    const existing = await db.collection("departments").findOne({ key: normalize(name), active: { $ne: false } });
    if (existing) return res.status(409).json({ error: "Avdelningen finns redan." });
    const result = await db.collection("departments").insertOne({ name, key: normalize(name), active: true, createdAt: new Date() });
    res.status(201).json({ id: String(result.insertedId), name, active: true });
  } catch (error) { next(error); }
});
router.delete("/departments/:id", async (req, res, next) => {
  const db = getDb(req, res); if (!db) return;
  try { const result = await db.collection("departments").updateOne({ _id: new (require("mongodb").ObjectId)(req.params.id) }, { $set: { active: false, archivedAt: new Date() } }); res.json({ ok: true, changed: result.modifiedCount }); }
  catch (error) { if (error.name === "BSONError") return res.status(400).json({ error: "Ogiltig avdelning." }); next(error); }
});
router.post("/people", async (req, res, next) => {
  const db = getDb(req, res); if (!db) return;
  try {
    const name = String(req.body?.name || "").trim(); if (!name) return res.status(400).json({ error: "Ange personens namn." });
    const existing = await db.collection("people").findOne({ key: normalize(name), active: { $ne: false } });
    if (existing) return res.status(409).json({ error: "Personen finns redan." });
    const result = await db.collection("people").insertOne({ name, key: normalize(name), active: true, competencies: [], createdAt: new Date() });
    res.status(201).json({ id: String(result.insertedId), name, active: true });
  } catch (error) { next(error); }
});
router.delete("/people/:id", async (req, res, next) => {
  const db = getDb(req, res); if (!db) return;
  try { const result = await db.collection("people").updateOne({ _id: new (require("mongodb").ObjectId)(req.params.id) }, { $set: { active: false, archivedAt: new Date() } }); res.json({ ok: true, changed: result.modifiedCount }); }
  catch (error) { if (error.name === "BSONError") return res.status(400).json({ error: "Ogiltig person." }); next(error); }
});
router.get("/days/:date", async (req, res, next) => {
  const db = getDb(req, res); if (!db) return;
  if (!validDate(req.params.date)) return res.status(400).json({ error: "Ogiltigt datum." });
  try { const day = await db.collection("days").findOne({ date: req.params.date }); res.json({ day: day ? { date: day.date, assignments: day.assignments || {}, updatedAt: day.updatedAt } : null }); }
  catch (error) { next(error); }
});
router.put("/days/:date", async (req, res, next) => {
  const db = getDb(req, res); if (!db) return;
  const date = req.params.date; if (!validDate(date)) return res.status(400).json({ error: "Ogiltigt datum." });
  const submitted = req.body?.assignments;
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) return res.status(400).json({ error: "Placeringarna har fel format." });
  const assignments = {};
  for (const [departmentId, people] of Object.entries(submitted)) {
    if (!Array.isArray(people)) return res.status(400).json({ error: "Personlistan har fel format." });
    assignments[departmentId] = [...new Map(people.filter((person) => person && person.personId && person.name).map((person) => [String(person.personId), { personId: String(person.personId), name: String(person.name).trim() }])).values()];
  }
  try {
    const savedAt = new Date();
    await db.collection("days").updateOne({ date }, { $set: { date, assignments, updatedAt: savedAt }, $setOnInsert: { createdAt: savedAt } }, { upsert: true });
    const competenceUpdates = [];
    for (const [departmentId, people] of Object.entries(assignments)) for (const person of people) {
      competenceUpdates.push(db.collection("people").updateOne({ _id: new (require("mongodb").ObjectId)(person.personId) }, { $addToSet: { competencies: departmentId }, $set: { lastKnownName: person.name } }));
    }
    await Promise.all(competenceUpdates);
    res.json({ day: { date, assignments, updatedAt: savedAt } });
  } catch (error) { next(error); }
});
router.get("/summary", async (req, res, next) => {
  const db = getDb(req, res); if (!db) return;
  const { from, to } = req.query;
  if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ error: "Ange ett giltigt datumintervall." });
  try {
    const [days, people, departments] = await Promise.all([
      db.collection("days").find({ date: { $gte: from, $lte: to } }).toArray(),
      db.collection("people").find({}).toArray(),
      db.collection("departments").find({}).toArray()
    ]);
    const peopleById = new Map(people.map((person) => [String(person._id), person.name]));
    const counts = new Map(people.filter((person) => person.active !== false).map((person) => [String(person._id), { id: String(person._id), name: person.name, count: 0, departmentCounts: {} }]));
    const departmentCounts = new Map(departments.map((department) => [String(department._id), { id: String(department._id), name: department.name, active: department.active !== false, count: 0, names: new Set() }]));
    let totalAssignments = 0;
    for (const day of days) for (const [departmentId, assigned] of Object.entries(day.assignments || {})) {
      for (const person of assigned || []) {
        totalAssignments += 1;
        let personRow = counts.get(String(person.personId));
        if (!personRow) { personRow = { id: String(person.personId), name: peopleById.get(String(person.personId)) || person.name, count: 0, departmentCounts: {} }; counts.set(String(person.personId), personRow); }
        personRow.count += 1;
        personRow.departmentCounts[departmentId] = (personRow.departmentCounts[departmentId] || 0) + 1;
        let department = departmentCounts.get(departmentId);
        if (!department) { department = { id: departmentId, name: "Avdelning borttagen", active: false, count: 0, names: new Set() }; departmentCounts.set(departmentId, department); }
        department.count += 1; department.names.add(peopleById.get(String(person.personId)) || person.name);
      }
    }
    const sortedPeople = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "sv"));
    const sortedDepartments = [...departmentCounts.values()].filter((item) => item.active || item.count).map((item) => ({ id: item.id, name: item.name, count: item.count, people: [...item.names].sort((a, b) => a.localeCompare(b, "sv")) })).sort((a,b) => a.name.localeCompare(b.name, "sv"));
    res.json({ from, to, weekNumber: isoWeek(from), totalAssignments, peopleCount: new Set(days.flatMap((day) => Object.values(day.assignments || {}).flat().map((person) => person.personId))).size, daysCount: days.length, people: sortedPeople, departments: sortedDepartments });
  } catch (error) { next(error); }
});

module.exports = router;
