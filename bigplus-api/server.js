const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const dns = require("dns");
require("./mongodb-dns-fallback");
const { MongoClient } = require("mongodb");

const catalogRouter = require("./routes/catalog");
const measurementsRouter = require("./routes/measurements");
const catchesRouter = require("./routes/catches");
const authRouter = require("./routes/auth");
const groupsRouter = require("./routes/groups");
const competitionsRouter = require("./routes/competitions");
const sharingRouter = require("./routes/sharing");
const friendsRouter = require("./routes/friends");
const { ensureDefaultGroup, ensureMemberCodeIndex } = require("./routes/auth");

const app = express();
let mongoState = process.env.MONGODB_URI ? "connecting" : "not_configured";

// Atlas SRV records can fail with a local DNS resolver even when the cluster is healthy.
// Keep the resolver configurable so local development can use a reliable DNS service.
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(",").map((server) => server.trim()).filter(Boolean));
}
if (typeof dns.setDefaultResultOrder === "function") dns.setDefaultResultOrder("ipv4first");

const configuredOrigins = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const allowedOrigins = [...new Set([
  ...configuredOrigins,
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://localhost:8888",
  "https://sage-vacherin-aa5cd3.netlify.app"
])];
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)), credentials: true }));
app.use(express.json({ limit: "6mb" }));

app.get("/", (req, res) => {
  res.send("Bigplus API är igång");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    api: "up",
    service: "bigplus-api",
    database: mongoState
  });
});

app.get("/api/bigplus/test-image", (req, res, next) => {
  const imagePath = path.join(process.env.USERPROFILE || "", "Downloads", "6420gram_83cm.jpg");
  if (!fs.existsSync(imagePath)) return res.status(404).json({ error: "Testbilden saknas i Downloads" });
  res.sendFile(imagePath, (error) => error && next(error));
});

app.use("/api/bigplus", catalogRouter);
app.use("/api/bigplus", measurementsRouter);
app.use("/api/bigplus", catchesRouter);
app.use("/api/bigplus", authRouter);
app.use("/api/bigplus", groupsRouter);
app.use("/api/bigplus", competitionsRouter);
app.use("/api/bigplus", sharingRouter);
app.use("/api/bigplus", friendsRouter);

app.use((error, req, res, next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: error.message || "Serverfel"
  });
});

let mongoClient = null;
let mongoAttempts = 0;

async function connectMongo() {
  if (!process.env.MONGODB_URI) return;
  mongoState = "connecting";
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 12000,
    connectTimeoutMS: 12000,
    family: 4,
    retryReads: true,
    retryWrites: true
  });

  try {
    await client.connect();
    const db = client.db();
    await db.command({ ping: 1 });
    await ensureDefaultGroup(db);
    await ensureMemberCodeIndex(db);
    mongoClient = client;
    app.locals.mongo = db;
    mongoAttempts = 0;
    mongoState = "connected";
    console.log("MongoDB ansluten");
  } catch (error) {
    await client.close().catch(() => {});
    app.locals.mongo = null;
    mongoState = "connecting";
    mongoAttempts += 1;
    const retryBase = Math.max(1000, Number(process.env.MONGODB_CONNECT_RETRY_MS) || 3000);
    const delay = Math.min(30000, retryBase * (2 ** Math.min(mongoAttempts - 1, 3)));
    console.error(`MongoDB kunde inte ansluta (försök ${mongoAttempts}). Nästa försök om ${Math.round(delay / 1000)} s:`, error.message);
    setTimeout(connectMongo, delay);
  }
}

connectMongo();

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`Bigplus API lyssnar på port ${PORT}`);
});
