const express = require("express");
const { requireAuth } = require("./auth");

const router = express.Router();
const MAX_PLAN_ID_LENGTH = 120;
const MAX_PLAN_TITLE_LENGTH = 160;

function normalizePlan(input, planId) {
  const source = input && typeof input === "object" ? input : {};
  const fields = source.fields && typeof source.fields === "object" ? source.fields : {};
  const stops = Array.isArray(source.stops)
    ? source.stops.slice(0, 100)
    : Array.isArray(fields.stops) ? fields.stops.slice(0, 100) : [];
  return {
    id: String(planId || source.id || "").trim().slice(0, MAX_PLAN_ID_LENGTH),
    title: String(source.title || fields.planTitle || "Min fisketur").trim().slice(0, MAX_PLAN_TITLE_LENGTH) || "Min fisketur",
    stops,
    fields: { ...fields, stops },
    activeSpot: Number.isInteger(source.activeSpot) ? source.activeSpot : 0,
    favorites: Array.isArray(source.favorites) ? source.favorites.slice(0, 100) : [],
    checks: source.checks && typeof source.checks === "object" ? source.checks : {},
    ratings: Array.isArray(source.ratings) ? source.ratings.slice(0, 100) : [],
    started: Boolean(source.started),
    notes: String(source.notes || "").slice(0, 10000),
    savedAt: source.savedAt || new Date().toISOString()
  };
}

function publicPlan(document) {
  return document.data;
}

router.get("/plans", requireAuth, async (req, res, next) => {
  try {
    const documents = await req.db.collection("fishing_plans")
      .find({ ownerId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
    res.json(documents.map(publicPlan));
  } catch (error) {
    next(error);
  }
});

router.put("/plans/:planId", requireAuth, async (req, res, next) => {
  try {
    const planId = String(req.params.planId || "").trim().slice(0, MAX_PLAN_ID_LENGTH);
    if (!planId) return res.status(400).json({ error: "Planen saknar ID." });
    const data = normalizePlan(req.body, planId);
    const now = new Date();
    await req.db.collection("fishing_plans").updateOne(
      { ownerId: req.user._id, planId },
      {
        $set: { ownerId: req.user._id, planId, data, title: data.title, updatedAt: now },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete("/plans/:planId", requireAuth, async (req, res, next) => {
  try {
    const planId = String(req.params.planId || "").trim().slice(0, MAX_PLAN_ID_LENGTH);
    const result = await req.db.collection("fishing_plans").deleteOne({ ownerId: req.user._id, planId });
    if (!result.deletedCount) return res.status(404).json({ error: "Planen hittades inte." });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
