const crypto = require("crypto");
const express = require("express");
const { readCatches, writeCatches } = require("../services/catchStore");
const { calculateMeasurement } = require("../services/measurement");

const router = express.Router();

function cleanUserId(value) {
  return String(value || "").trim().slice(0, 80);
}

router.get("/catches", (req, res) => {
  const userId = cleanUserId(req.query.user);
  const catches = readCatches();
  const visible = userId ? catches.filter((item) => item.userId === userId) : catches;
  res.json(visible.slice(-30).reverse());
});

router.post("/catches", (req, res, next) => {
  try {
    const input = req.body || {};
    const result = calculateMeasurement(input.measurement || input);
    const catches = readCatches();
    const userId = cleanUserId(input.userId);
    const item = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      userId,
      note: String(input.note || "").slice(0, 240),
      photo: typeof input.photo === "string" ? input.photo.slice(0, 4_000_000) : "",
      measurement: result
    };

    catches.push(item);
    writeCatches(catches.slice(-100));
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
