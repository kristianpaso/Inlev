const express = require("express");
const { ObjectId } = require("mongodb");
const { requireAuth } = require("./auth");

const router = express.Router();

function objectId(value) {
  return ObjectId.isValid(String(value || "")) ? new ObjectId(String(value)) : null;
}

function publicUser(user) {
  return user ? {
    id: String(user._id),
    name: user.name || "Fiskare",
    email: user.email || "",
    photo: user.photo || "",
    memberCode: user.memberCode || "",
    profileVisibility: user.profileVisibility === "private" ? "private" : "public"
  } : null;
}

async function usersByIds(db, ids) {
  const validIds = ids.map(objectId).filter(Boolean);
  if (!validIds.length) return new Map();
  const users = await db.collection("users").find({ _id: { $in: validIds } }, { projection: { passwordHash: 0 } }).toArray();
  return new Map(users.map((user) => [String(user._id), publicUser(user)]));
}

router.get("/friends", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const [requests, user] = await Promise.all([
      req.db.collection("friend_requests").find({ $or: [{ fromId: req.user._id }, { toId: req.user._id }] }).sort({ createdAt: -1 }).toArray(),
      req.db.collection("users").findOne({ _id: req.user._id }, { projection: { passwordHash: 0 } })
    ]);
    const ids = [ ...(user?.friendIds || []).map(String), ...requests.flatMap((item) => [String(item.fromId), String(item.toId)]) ];
    const userMap = await usersByIds(req.db, [...new Set(ids)]);
    const friends = (user?.friendIds || []).map((id) => userMap.get(String(id))).filter(Boolean);
    const toRequest = (item) => ({
      id: String(item._id),
      fromId: String(item.fromId),
      toId: String(item.toId),
      status: item.status,
      createdAt: item.createdAt,
      from: userMap.get(String(item.fromId)) || null,
      to: userMap.get(String(item.toId)) || null
    });
    res.json({
      friends,
      incoming: requests.filter((item) => String(item.toId) === userId && item.status === "pending").map(toRequest),
      outgoing: requests.filter((item) => String(item.fromId) === userId && item.status === "pending").map(toRequest)
    });
  } catch (error) { next(error); }
});

router.post("/friends/requests", requireAuth, async (req, res, next) => {
  try {
    const targetId = objectId(req.body?.userId);
    if (!targetId || String(targetId) === String(req.user._id)) return res.status(400).json({ error: "Ogiltig vän." });
    const target = await req.db.collection("users").findOne({ _id: targetId, profileVisibility: { $ne: "private" } }, { projection: { passwordHash: 0 } });
    if (!target) return res.status(404).json({ error: "Medlemmen hittades inte." });
    const me = await req.db.collection("users").findOne({ _id: req.user._id }, { projection: { friendIds: 1 } });
    if ((me?.friendIds || []).some((id) => String(id) === String(targetId))) return res.status(409).json({ error: "Ni är redan vänner." });
    const existing = await req.db.collection("friend_requests").findOne({ fromId: req.user._id, toId: targetId, status: "pending" });
    if (existing) return res.json({ ok: true, requestId: String(existing._id) });
    const reverse = await req.db.collection("friend_requests").findOne({ fromId: targetId, toId: req.user._id, status: "pending" });
    if (reverse) return res.status(409).json({ error: "Den här personen har redan skickat en förfrågan till dig." });
    const result = await req.db.collection("friend_requests").insertOne({ fromId: req.user._id, toId: targetId, status: "pending", createdAt: new Date() });
    res.status(201).json({ ok: true, requestId: String(result.insertedId) });
  } catch (error) { next(error); }
});

router.delete("/friends/:friendId", requireAuth, async (req, res, next) => {
  try {
    const friendId = objectId(req.params.friendId);
    if (!friendId || String(friendId) === String(req.user._id)) return res.status(400).json({ error: "Ogiltig vän." });
    const me = await req.db.collection("users").findOne({ _id: req.user._id }, { projection: { friendIds: 1 } });
    if (!(me?.friendIds || []).some((id) => String(id) === String(friendId))) {
      return res.status(404).json({ error: "Vännen finns inte i din vänlista." });
    }
    await Promise.all([
      req.db.collection("users").updateOne({ _id: req.user._id }, { $pull: { friendIds: friendId } }),
      req.db.collection("users").updateOne({ _id: friendId }, { $pull: { friendIds: req.user._id } }),
      req.db.collection("competitions").updateMany({ type: "friends", members: req.user._id }, { $pull: { members: friendId } })
    ]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

async function updateRequest(req, res, next, status) {
  try {
    const requestId = objectId(req.params.requestId);
    if (!requestId) return res.status(400).json({ error: "Ogiltig vänförfrågan." });
    const request = await req.db.collection("friend_requests").findOne({ _id: requestId, toId: req.user._id, status: "pending" });
    if (!request) return res.status(404).json({ error: "Vänförfrågan hittades inte." });
    await req.db.collection("friend_requests").updateOne({ _id: requestId }, { $set: { status, respondedAt: new Date() } });
    if (status === "accepted") {
      await req.db.collection("users").updateOne({ _id: req.user._id }, { $addToSet: { friendIds: request.fromId } });
      await req.db.collection("users").updateOne({ _id: request.fromId }, { $addToSet: { friendIds: req.user._id } });
    }
    res.json({ ok: true, status });
  } catch (error) { next(error); }
}

router.post("/friends/requests/:requestId/accept", requireAuth, (req, res, next) => updateRequest(req, res, next, "accepted"));
router.post("/friends/requests/:requestId/deny", requireAuth, (req, res, next) => updateRequest(req, res, next, "denied"));

module.exports = router;
