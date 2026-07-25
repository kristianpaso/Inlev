const crypto = require("crypto");
const express = require("express");
const { ObjectId } = require("mongodb");
const { requireAuth } = require("./auth");

const router = express.Router();

function id(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

async function ranking(db, group) {
  const members = group.members || [];
  const users = await db.collection("users").find({ _id: { $in: members } }, { projection: { passwordHash: 0 } }).toArray();
  const catches = await db.collection("catches").find({ userId: { $in: members } }).toArray();
  return users.map((user) => {
    const own = catches.filter((item) => String(item.userId) === String(user._id));
    const bigplus = own.filter((item) => item.measurement?.isBigplus || item.measurement?.status === "BIGPLUS").length;
    const lengths = own.map((item) => Number(item.measurement?.lengthCm || 0)).filter(Number.isFinite);
    return { id: String(user._id), name: user.name, catches: own.length, bigplus, bestLengthCm: lengths.length ? Math.max(...lengths) : 0 };
  }).sort((a, b) => b.bigplus - a.bigplus || b.bestLengthCm - a.bestLengthCm || b.catches - a.catches);
}

router.get("/groups", requireAuth, async (req, res, next) => {
  try {
    const groups = await req.db.collection("groups").find({ members: req.user._id }).sort({ name: 1 }).toArray();
    const result = await Promise.all(groups.map(async (group) => ({
      id: String(group._id), name: group.name, slug: group.slug || "", memberCount: (group.members || []).length, ranking: await ranking(req.db, group)
    })));
    res.json(result);
  } catch (error) { next(error); }
});

router.post("/groups", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Gruppen behöver ett namn." });
    const group = { name, slug: `group-${crypto.randomUUID()}`, ownerId: req.user._id, members: [req.user._id], createdAt: new Date() };
    const result = await req.db.collection("groups").insertOne(group);
    res.status(201).json({ id: String(result.insertedId), name: group.name, memberCount: 1, ranking: [{ id: String(req.user._id), name: req.user.name, catches: 0, bigplus: 0, bestLengthCm: 0 }] });
  } catch (error) { next(error); }
});

router.post("/groups/:groupId/join", requireAuth, async (req, res, next) => {
  try {
    const groupId = id(req.params.groupId);
    if (!groupId) return res.status(400).json({ error: "Ogiltig grupp." });
    const result = await req.db.collection("groups").updateOne({ _id: groupId }, { $addToSet: { members: req.user._id } });
    if (!result.matchedCount) return res.status(404).json({ error: "Gruppen hittades inte." });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
