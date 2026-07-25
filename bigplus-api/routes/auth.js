const crypto = require("crypto");
const express = require("express");

const router = express.Router();
const COOKIE_NAME = "bigplus_session";
const SESSION_DAYS = 30;

function database(req, res) {
  if (!req.app.locals.mongo) {
    res.status(503).json({ error: "Databasen är inte ansluten ännu." });
    return null;
  }
  return req.app.locals.mongo;
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function sessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function createMemberCode() {
  const digits = String(crypto.randomInt(10000, 100000));
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + crypto.randomInt(0, 26))).join("");
  return `#${digits}-${letters}`;
}

async function ensureMemberCode(db, user) {
  if (user.memberCode) return user;
  let memberCode;
  do {
    memberCode = createMemberCode();
  } while (await db.collection("users").findOne({ memberCode }, { projection: { _id: 1 } }));
  await db.collection("users").updateOne({ _id: user._id }, { $set: { memberCode } });
  return { ...user, memberCode };
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  const entry = cookies.find((item) => item.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : "";
}

function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, photo: user.photo || "", memberCode: user.memberCode || "", profileVisibility: user.profileVisibility === "private" ? "private" : "public" };
}

async function ensureDefaultGroup(db, userId = null) {
  const update = {
    $setOnInsert: { name: "Bigplus Medlemmar", slug: "bigplus-medlemmar", ownerId: null, createdAt: new Date() }
  };
  if (userId) update.$addToSet = { members: userId };
  await db.collection("groups").updateOne({ slug: "bigplus-medlemmar" }, update, { upsert: true });
}

async function createSession(db, userId) {
  const token = sessionToken();
  await db.collection("sessions").insertOne({
    tokenHash: tokenHash(token),
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000)
  });
  return token;
}

async function requireAuth(req, res, next) {
  try {
    const db = database(req, res);
    if (!db) return;
    const token = cookieValue(req, COOKIE_NAME);
    const session = token && await db.collection("sessions").findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } });
    const user = session && await db.collection("users").findOne({ _id: session.userId });
    if (!user) return res.status(401).json({ error: "Du måste vara inloggad." });
    await ensureDefaultGroup(db, user._id);
    req.user = await ensureMemberCode(db, user);
    req.db = db;
    next();
  } catch (error) {
    next(error);
  }
}

router.post("/auth/register", async (req, res, next) => {
  try {
    const db = database(req, res);
    if (!db) return;
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim().slice(0, 80);
    if (!name || !email || password.length < 8) return res.status(400).json({ error: "Namn, giltig e-post och lösenord på minst 8 tecken krävs." });
    const users = db.collection("users");
    await users.createIndex({ email: 1 }, { unique: true });
    await users.createIndex({ memberCode: 1 }, { unique: true, partialFilterExpression: { memberCode: { $type: "string" } } });
    let memberCode = createMemberCode();
    while (await users.findOne({ memberCode }, { projection: { _id: 1 } })) memberCode = createMemberCode();
    const user = { name, email, passwordHash: hashPassword(password), role: "user", photo: "", memberCode, createdAt: new Date() };
    const result = await users.insertOne(user);
    user._id = result.insertedId;
    await db.collection("groups").updateOne(
      { slug: "bigplus-medlemmar" },
      { $setOnInsert: { name: "Bigplus Medlemmar", slug: "bigplus-medlemmar", ownerId: null, createdAt: new Date() }, $addToSet: { members: result.insertedId } },
      { upsert: true }
    );
    const token = await createSession(db, result.insertedId);
    setSessionCookie(res, token);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "Det finns redan ett konto med den e-posten." });
    next(error);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const db = database(req, res);
    if (!db) return;
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const user = await db.collection("users").findOne({ email });
    if (user) await ensureDefaultGroup(db, user._id);
    if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: "E-post eller lösenord stämmer inte." });
    const member = await ensureMemberCode(db, user);
    const token = await createSession(db, member._id);
    setSessionCookie(res, token);
    res.json({ user: publicUser(member) });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", async (req, res, next) => {
  try {
    const db = database(req, res);
    if (!db) return;
    const token = cookieValue(req, COOKIE_NAME);
    const session = token && await db.collection("sessions").findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } });
    const user = session && await db.collection("users").findOne({ _id: session.userId });
    if (!user) return res.status(401).json({ error: "Inte inloggad." });
    const member = await ensureMemberCode(db, user);
    res.json({ user: publicUser(member) });
  } catch (error) {
    next(error);
  }
});

router.get("/members/search", requireAuth, async (req, res, next) => {
  try {
    const memberCode = String(req.query?.memberCode || "").trim().toUpperCase();
    if (!/^#[0-9]{5}-[A-Z]{3}$/.test(memberCode)) return res.status(400).json({ error: "Ange ett giltigt medlemsnummer." });
    const user = await req.db.collection("users").findOne(
      { memberCode, profileVisibility: { $ne: "private" }, _id: { $ne: req.user._id } },
      { projection: { passwordHash: 0 } }
    );
    if (!user) return res.status(404).json({ error: "Medlemmen hittades inte." });
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.patch("/auth/profile", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    const photo = typeof req.body?.photo === "string" ? req.body.photo.slice(0, 4_000_000) : (req.user.photo || "");
    const profileVisibility = req.body?.profileVisibility === "private" ? "private" : "public";
    if (!name) return res.status(400).json({ error: "Namn krävs." });
    await req.db.collection("users").updateOne(
      { _id: req.user._id },
      { $set: { name, photo, profileVisibility } }
    );
    const user = await req.db.collection("users").findOne({ _id: req.user._id });
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", async (req, res, next) => {
  try {
    const db = database(req, res);
    if (db) {
      const token = cookieValue(req, COOKIE_NAME);
      if (token) await db.collection("sessions").deleteOne({ tokenHash: tokenHash(token) });
    }
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.ensureDefaultGroup = ensureDefaultGroup;
