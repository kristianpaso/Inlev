const crypto = require("crypto");
const express = require("express");
const { readCatches, writeCatches } = require("../services/catchStore");
const { calculateMeasurement } = require("../services/measurement");
const { requireAuth } = require("./auth");

const router = express.Router();

router.get("/catches", requireAuth, async (req, res, next) => {
  try {
    const catches = await req.db.collection("catches").find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).toArray();
    res.json(catches);
  } catch (error) {
    next(error);
  }
});

router.post("/catches", requireAuth, async (req, res, next) => {
  try {
    const input = req.body || {};
    const result = calculateMeasurement(input.measurement || input);
    // The server is the source of truth for participation. This prevents a
    // stale browser membership list from losing the competition links.
    const joinedCompetitions = await req.db.collection("competitions")
      .find({ members: req.user._id }, { projection: { _id: 1 } })
      .toArray();
    const competitionIds = joinedCompetitions
      .map((competition) => String(competition._id))
      .slice(0, 20);
    const item = {
      createdAt: new Date().toISOString(),
      userId: req.user._id,
      note: String(input.note || "").slice(0, 240),
      photo: typeof input.photo === "string" ? input.photo.slice(0, 4_000_000) : "",
      location: input.location && Number.isFinite(Number(input.location.latitude)) && Number.isFinite(Number(input.location.longitude))
        ? { latitude: Number(input.location.latitude), longitude: Number(input.location.longitude) }
        : null,
      competitionIds,
      measurement: result
    };

    const saved = await req.db.collection("catches").insertOne(item);
    res.status(201).json({ ...item, id: String(saved.insertedId) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
