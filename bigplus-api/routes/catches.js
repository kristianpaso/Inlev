const crypto = require("crypto");
const express = require("express");
const { readCatches, writeCatches } = require("../services/catchStore");
const { calculateMeasurement } = require("../services/measurement");

const router = express.Router();

router.get("/catches", (req, res) => {
  res.json(readCatches().slice(-30).reverse());
});

router.post("/catches", (req, res, next) => {
  try {
    const input = req.body || {};
    const result = calculateMeasurement(input.measurement || input);
    const catches = readCatches();
    const item = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
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
