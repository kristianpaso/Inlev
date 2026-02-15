// Beteknepet-backend (Express + MongoDB)
//
// Routes:
//   GET  /health
//   GET  /api/beteknepet/steg
//   PUT  /api/beteknepet/steg   body: { steg: [...] }
//
// Env:
//   PORT=5005
//   MONGODB_URI=mongodb+srv://.../beteknepet-api?...
//   MONGODB_STEPS_COLLECTION=steg

import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const PORT = process.env.PORT || 5005;
const MONGODB_URI = process.env.MONGODB_URI || "";
const COL_NAME = process.env.MONGODB_STEPS_COLLECTION || "steg";

let client;

async function getCollection() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI saknas i .env");
  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
  }
  // Om URI innehåller /beteknepet-api så räcker default db:
  const db = client.db();
  return db.collection(COL_NAME);
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "beteknepet-backend" }));

app.get("/api/beteknepet/steg", async (_req, res) => {
  try {
    const col = await getCollection();
    const docs = await col.find({}).sort({ order: 1 }).toArray();
    res.json({ ok: true, steg: docs });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.put("/api/beteknepet/steg", async (req, res) => {
  try {
    const list = req.body?.steg;
    if (!Array.isArray(list)) {
      return res.status(400).json({ ok: false, error: "Body måste vara { steg: [...] }" });
    }
    const col = await getCollection();
    await col.deleteMany({});
    if (list.length) {
      const normalized = list.map((x, i) => ({
        ...x,
        order: typeof x.order === "number" ? x.order : i + 1,
      }));
      await col.insertMany(normalized);
    }
    res.json({ ok: true, count: list.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`Beteknepet-backend igång på http://localhost:${PORT}`);
});
