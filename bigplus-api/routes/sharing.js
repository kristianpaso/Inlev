const express = require("express");
const { ObjectId } = require("mongodb");
const { requireAuth } = require("./auth");

const router = express.Router();

function validIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || ""))
    .filter((value) => ObjectId.isValid(value))
    .map((value) => new ObjectId(value)))];
}

function catchId(value) {
  return ObjectId.isValid(String(value || "")) ? new ObjectId(String(value)) : null;
}

async function acceptedRecipientIds(db, userId, values) {
  const requested = validIds(values).filter((id) => !id.equals(userId));
  const [owner, acceptedRequests] = await Promise.all([
    db.collection("users").findOne({ _id: userId }, { projection: { friendIds: 1 } }),
    db.collection("friend_requests").find({
      status: "accepted",
      $or: [{ fromId: userId }, { toId: userId }]
    }, { projection: { fromId: 1, toId: 1 } }).toArray()
  ]);
  const accepted = new Set((owner?.friendIds || []).map(String));
  acceptedRequests.forEach((request) => {
    const otherId = String(request.fromId) === String(userId) ? request.toId : request.fromId;
    if (otherId) accepted.add(String(otherId));
  });
  return requested.filter((id) => accepted.has(String(id)));
}

function publicZone(zone) {
  return {
    id: String(zone._id),
    name: zone.name || "Delad zon",
    catchIds: (zone.catchIds || []).map(String),
    recipientIds: (zone.recipientIds || []).map(String),
    enabled: zone.enabled !== false,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt
  };
}

router.get("/sharing/zones", requireAuth, async (req, res, next) => {
  try {
    const zones = await req.db.collection("map_zones").find({ ownerId: req.user._id }).sort({ updatedAt: -1 }).toArray();
    res.json(zones.map(publicZone));
  } catch (error) { next(error); }
});

router.post("/sharing/zones", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "Delad zon").trim().slice(0, 80) || "Delad zon";
    const recipientIds = await acceptedRecipientIds(req.db, req.user._id, req.body?.recipientIds);
    if (!recipientIds.length) return res.status(400).json({ error: "Välj minst en accepterad vän." });
    const requestedCatchIds = [...new Set((Array.isArray(req.body?.catchIds) ? req.body.catchIds : []).map(String))]
      .map(catchId).filter(Boolean);
    if (!requestedCatchIds.length) return res.status(400).json({ error: "Välj minst en fångst med sparad plats." });
    const catches = requestedCatchIds.length
      ? await req.db.collection("catches").find({
        _id: { $in: requestedCatchIds },
        $or: [{ userId: req.user._id }, { userId: String(req.user._id) }],
        location: { $ne: null }
      }, { projection: { _id: 1 } }).toArray()
      : [];
    const catchIds = catches.map((item) => item._id);
    if (!catchIds.length) return res.status(400).json({ error: "De valda fångsterna saknar sparad plats eller tillhör inte ditt konto." });
    const now = new Date();
    const result = await req.db.collection("map_zones").insertOne({ ownerId: req.user._id, name, catchIds, recipientIds, enabled: recipientIds.length > 0 && catchIds.length > 0, createdAt: now, updatedAt: now });
    const zone = await req.db.collection("map_zones").findOne({ _id: result.insertedId });
    res.status(201).json(publicZone(zone));
  } catch (error) { next(error); }
});

router.delete("/sharing/zones/:zoneId", requireAuth, async (req, res, next) => {
  try {
    const id = catchId(req.params.zoneId);
    if (!id) return res.status(400).json({ error: "Ogiltig zon." });
    const result = await req.db.collection("map_zones").deleteOne({ _id: id, ownerId: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ error: "Zonen hittades inte." });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get("/sharing/map", requireAuth, async (req, res, next) => {
  try {
    const share = await req.db.collection("map_shares").findOne({ ownerId: req.user._id });
    res.json({ enabled: Boolean(share?.enabled), recipientIds: (share?.recipientIds || []).map(String) });
  } catch (error) {
    next(error);
  }
});

router.post("/sharing/map", requireAuth, async (req, res, next) => {
  try {
    const recipientIds = validIds(req.body?.recipientIds).filter((id) => !id.equals(req.user._id));
    const members = recipientIds.length
      ? await req.db.collection("users").find({ _id: { $in: recipientIds } }, { projection: { _id: 1 } }).toArray()
      : [];
    const allowed = members.map((member) => member._id);
    const enabled = Boolean(req.body?.enabled) && allowed.length > 0;
    await req.db.collection("map_shares").updateOne(
      { ownerId: req.user._id },
      { $set: { ownerId: req.user._id, enabled, recipientIds: enabled ? allowed : [], updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ enabled, recipientIds: enabled ? allowed.map(String) : [] });
  } catch (error) {
    next(error);
  }
});

router.get("/sharing/maps", requireAuth, async (req, res, next) => {
  try {
    const [shares, zones] = await Promise.all([
      req.db.collection("map_shares").find({ enabled: true, recipientIds: req.user._id }).toArray(),
      req.db.collection("map_zones").find({ enabled: true, recipientIds: req.user._id }).toArray()
    ]);
    const ownerIds = [...shares.map((share) => share.ownerId), ...zones.map((zone) => zone.ownerId)].filter(Boolean);
    if (!ownerIds.length) return res.json([]);
    const legacyOwnerIds = shares.map((share) => share.ownerId).filter(Boolean);
    const zoneCatchIds = zones.flatMap((zone) => zone.catchIds || []);
    const catchSources = [
      ...(legacyOwnerIds.length ? [{ userId: { $in: legacyOwnerIds } }] : []),
      ...(zoneCatchIds.length ? [{ _id: { $in: zoneCatchIds } }] : [])
    ];
    if (!catchSources.length) return res.json([]);
    const [users, catches] = await Promise.all([
      req.db.collection("users").find({ _id: { $in: ownerIds } }, { projection: { name: 1, email: 1 } }).toArray(),
      req.db.collection("catches").find({
        location: { $ne: null },
        $or: catchSources
      }).sort({ createdAt: -1 }).limit(200).toArray()
    ]);
    const owners = new Map(users.map((user) => [String(user._id), user.name || user.email || "Vän"]));
    res.json(catches.map((item) => ({
      id: String(item._id),
      _id: String(item._id),
      ownerId: String(item.userId),
      ownerName: owners.get(String(item.userId)) || "Vän",
      location: item.location,
      measurement: item.measurement,
      createdAt: item.createdAt
    })));
  } catch (error) {
    next(error);
  }
});

router.post("/sharing/catches/:catchId", requireAuth, async (req, res, next) => {
  try {
    const id = catchId(req.params.catchId);
    if (!id) return res.status(400).json({ error: "Ogiltig fångst." });
    const item = await req.db.collection("catches").findOne({ _id: id, userId: req.user._id }, { projection: { _id: 1 } });
    if (!item) return res.status(404).json({ error: "Fångsten hittades inte." });
    const recipientIds = validIds(req.body?.recipientIds).filter((value) => !value.equals(req.user._id));
    await req.db.collection("catch_shares").updateOne(
      { catchId: id, ownerId: req.user._id },
      { $set: { catchId: id, ownerId: req.user._id, recipientIds, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true, recipientIds: recipientIds.map(String) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
