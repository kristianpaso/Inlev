const crypto = require("crypto");
const express = require("express");
const { ObjectId } = require("mongodb");
const { readCatches, writeCatches } = require("../services/catchStore");
const { calculateMeasurement } = require("../services/measurement");
const { requireAuth } = require("./auth");

const router = express.Router();

function parseMeasurementNumber(value) {
  if (value && typeof value === "object") {
    value = value.mid ?? value.low ?? value.high;
  }
  return Number(String(value ?? "").trim().replace(",", "."));
}

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
    const measurementInput = input.measurement || input;
    // Manual saves may arrive from an older frontend with the values at the
    // request root. Normalize them before deciding which calculator to use.
    const manualInput = input.manual === true
      ? { ...measurementInput, ...input, measurement: undefined }
      : measurementInput;
    const manualLength = parseMeasurementNumber(manualInput.lengthCm);
    const manualWeight = parseMeasurementNumber(manualInput.weightKg);
    const hasManualValues = Number.isFinite(manualLength) && manualLength > 0
      && Number.isFinite(manualWeight) && manualWeight >= 0;
    const isManual = input.manual === true
      || manualInput.confidence === "Manuell"
      || (hasManualValues && !Number.isFinite(parseMeasurementNumber(manualInput.refPixels)));
    const result = isManual && Number.isFinite(manualLength) && manualLength > 0 && Number.isFinite(manualWeight) && manualWeight >= 0
      ? {
        species: String(manualInput.species || manualInput.speciesName || "Fisk").slice(0, 80),
        lengthCm: manualLength,
        bodyCm: null,
        minCm: Number.isFinite(Number(manualInput.minCm)) ? Number(manualInput.minCm) : 0,
        status: String(manualInput.status || "Mätt").slice(0, 20),
        isBigplus: Boolean(manualInput.isBigplus),
        confidence: "Manuell",
        weightKg: { low: manualWeight, mid: manualWeight, high: manualWeight },
        disclaimer: "Mått och vikt registrerade manuellt."
      }
      : calculateMeasurement(measurementInput);
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

router.delete("/catches/:id", requireAuth, async (req, res, next) => {
  try {
    let catchId;
    try {
      catchId = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: "Ogiltigt fångst-ID." });
    }

    const result = await req.db.collection("catches").deleteOne({
      _id: catchId,
      userId: req.user._id
    });

    if (!result.deletedCount) return res.status(404).json({ error: "Fångsten hittades inte." });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
