const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const catalogRouter = require("./routes/catalog");
const measurementsRouter = require("./routes/measurements");
const catchesRouter = require("./routes/catches");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "6mb" }));

app.get("/", (req, res) => {
  res.send("Bigplus API är igång");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    api: "up",
    service: "bigplus-api"
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

app.use((error, req, res, next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: error.message || "Serverfel"
  });
});

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`Bigplus API lyssnar på port ${PORT}`);
});
