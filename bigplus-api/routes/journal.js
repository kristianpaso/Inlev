const express = require("express");
const { requireAuth } = require("./auth");

const router = express.Router();
const MAX_STOPS = 100;
const MAX_PLAN_JSON = 600_000;

function text(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function coordinates(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

function cleanSpot(value, index) {
  if (!value || typeof value !== "object") return null;
  const lngLat = coordinates(value.lngLat);
  if (!lngLat) return null;
  return {
    ...value,
    name: text(value.name, 120) || `Plats ${index + 1}`,
    area: text(value.area, 160),
    coordinates: text(value.coordinates, 80),
    lngLat,
    pinColorIndex: Number.isInteger(value.pinColorIndex) ? Math.max(0, Math.min(20, value.pinColorIndex)) : index,
    time: text(value.time, 80),
    shortTime: text(value.shortTime, 40),
    priority: text(value.priority, 40),
    method: text(value.method, 160),
    wind: text(value.wind, 80),
    depth: text(value.depth, 80),
    notes: text(value.notes, 600),
    image: text(value.image, 300),
    type: text(value.type, 40),
    durationMinutes: Math.max(0, Math.min(1440, Number(value.durationMinutes) || 0)),
    travelMode: ["car", "boat", "walk"].includes(value.travelMode) ? value.travelMode : "car",
    boatType: text(value.boatType, 80),
    motor: text(value.motor, 40),
    target: text(value.target, 80),
    isPause: Boolean(value.isPause),
    checklist: Array.isArray(value.checklist) ? value.checklist.slice(0, 20).map((item) => text(item, 160)) : []
  };
}

function cleanPlan(input, planId) {
  const source = input && typeof input === "object" ? input : {};
  const rawStops = Array.isArray(source.stops)
    ? source.stops
    : Array.isArray(source.fields?.stops) ? source.fields.stops : [];
  const stops = rawStops.slice(0, MAX_STOPS).map(cleanSpot).filter(Boolean);
  const fields = source.fields && typeof source.fields === "object" ? { ...source.fields, stops } : { stops };
  fields.planId = planId;
  fields.planTitle = text(source.title || fields.planTitle, 120) || "Min fisketur";
  fields.stops = stops;
  return {
    planId,
    title: fields.planTitle,
    stops,
    fields,
    activeSpot: Math.max(0, Math.min(Math.max(0, stops.length - 1), Number(source.activeSpot) || 0)),
    favorites: Array.isArray(source.favorites) ? source.favorites.slice(0, MAX_STOPS).map(Number).filter(Number.isInteger) : [],
    checks: source.checks && typeof source.checks === "object" ? source.checks : {},
    ratings: Array.isArray(source.ratings) ? source.ratings.slice(0, MAX_STOPS).map((value) => Math.max(0, Math.min(5, Number(value) || 0))) : [],
    started: Boolean(source.started),
    notes: text(source.notes, 2000)
  };
}

function publicPlan(item) {
  return {
    id: item.planId,
    title: item.title,
    stops: item.stops || [],
    fields: item.fields || {},
    activeSpot: item.activeSpot || 0,
    favorites: item.favorites || [],
    checks: item.checks || {},
    ratings: item.ratings || [],
    started: Boolean(item.started),
    notes: item.notes || "",
    savedAt: item.updatedAt || item.createdAt || ""
  };
}

router.get("/journal/plans", requireAuth, async (req, res, next) => {
  try {
    const plans = await req.db.collection("journalPlans")
      .find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
    res.json(plans.map(publicPlan));
  } catch (error) {
    next(error);
  }
});

router.put("/journal/plans/:planId", requireAuth, async (req, res, next) => {
  try {
    const planId = text(req.params.planId, 120);
    if (!planId) return res.status(400).json({ error: "Planen saknar id." });
    if (JSON.stringify(req.body || {}).length > MAX_PLAN_JSON) return res.status(413).json({ error: "Planen är för stor." });
    const now = new Date();
    const plan = cleanPlan(req.body, planId);
    const result = await req.db.collection("journalPlans").findOneAndUpdate(
      { userId: req.user._id, planId },
      {
        $set: { ...plan, userId: req.user._id, updatedAt: now },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true, returnDocument: "after" }
    );
    res.json(publicPlan(result.value || result));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
