const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const nemoRouter = require("./routes/nemo");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));

const allowedOrigins = new Set([
  ...String(process.env.CORS_ORIGIN || "").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean),
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "https://sage-vacherin-aa5cd3.netlify.app"
]);
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin.replace(/\/$/, ""))) }));

let mongoState = process.env.MONGODB_URI ? "connecting" : "not_configured";
let mongoClient;
let retryCount = 0;

app.get("/", (_req, res) => res.send("Nemo API is running"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "nemo-api", database: mongoState }));
app.use("/api/nemo", nemoRouter);
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message || "Serverfel" }));

async function connectMongo() {
  if (!process.env.MONGODB_URI) { mongoState = "not_configured"; return; }
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 12000,
    connectTimeoutMS: 12000,
    family: 4,
    retryReads: true
  });
  try {
    await client.connect();
    const db = client.db(process.env.NEMO_MONGODB_DB || "Nemo");
    await db.command({ ping: 1 });
    await db.collection("days").createIndex({ date: 1 }, { unique: true });
    await db.collection("people").createIndex({ key: 1 }, { unique: true, partialFilterExpression: { active: true } });
    await db.collection("departments").createIndex({ key: 1 }, { unique: true, partialFilterExpression: { active: true } });
    mongoClient = client;
    app.locals.nemoDb = db;
    retryCount = 0;
    mongoState = "connected";
    console.log(`MongoDB connected (database: ${db.databaseName})`);
  } catch (error) {
    await client.close().catch(() => {});
    app.locals.nemoDb = null;
    mongoState = "connecting";
    retryCount += 1;
    const delay = Math.min(30000, 3000 * (2 ** Math.min(retryCount - 1, 3)));
    console.error(`MongoDB connection failed; retrying in ${Math.round(delay / 1000)}s: ${error.message}`);
    setTimeout(connectMongo, delay).unref?.();
  }
}

const port = Number(process.env.PORT || 4200);
const server = app.listen(port, () => console.log(`Nemo API listening on port ${port}`));
connectMongo();

async function shutdown() {
  server.close();
  if (mongoClient) await mongoClient.close().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
