const crypto = require("crypto");
const express = require("express");
const { ObjectId } = require("mongodb");
const { requireAuth } = require("./auth");

const router = express.Router();

function toId(value) {
  try { return new ObjectId(String(value)); } catch { return null; }
}

function publicCompetition(item, users, catches) {
  const members = (item.members || []).map(String);
  const participantUsers = users.filter((user) => members.includes(String(user._id)));
  const participants = participantUsers.map((user) => ({
    userId: String(user._id),
    name: user.name,
    photo: user.photo || "",
    catches: catches.filter((capture) => String(capture.userId) === String(user._id)).map((capture) => ({
      ...capture,
      userId: String(capture.userId),
      id: String(capture._id)
    }))
  }));
  return {
    id: String(item._id),
    type: item.type || "competition",
    name: item.name,
    description: item.description || "Mät och jämför dina fångster.",
    daysLeft: Number(item.daysLeft) || 0,
    species: Array.isArray(item.species) ? item.species : [],
    scoringMetric: ["length", "weight", "both"].includes(item.scoringMetric) ? item.scoringMetric : "length",
    createdBy: item.createdBy ? String(item.createdBy) : "",
    members,
    participants,
    createdAt: item.createdAt
  };
}

router.get("/competitions", requireAuth, async (req, res, next) => {
  try {
    const list = await req.db.collection("competitions").find({}).sort({ createdAt: -1 }).toArray();
    const memberIds = [...new Set(list.flatMap((item) => (item.members || []).map(String)))].map(toId).filter(Boolean);
    const users = memberIds.length ? await req.db.collection("users").find({ _id: { $in: memberIds } }, { projection: { passwordHash: 0 } }).toArray() : [];
    const competitionIds = list.map((item) => String(item._id));
    const captures = competitionIds.length ? await req.db.collection("catches").find({ competitionIds: { $in: competitionIds }, userId: { $in: memberIds } }).toArray() : [];
    res.json(list.map((item) => publicCompetition(item, users, captures.filter((capture) => (capture.competitionIds || []).includes(String(item._id))))));
  } catch (error) { next(error); }
});

// Keep one shared competition for the current user's accepted friends.
// It is created on demand so old accounts are upgraded without a migration.
router.post("/competitions/friends/ensure", requireAuth, async (req, res, next) => {
  try {
    const user = await req.db.collection("users").findOne({ _id: req.user._id }, { projection: { friendIds: 1 } });
    const friendIds = [...new Map((user?.friendIds || []).map((id) => [String(id), id])).values()];
    if (!friendIds.length) return res.json({ ok: true, competition: null });

    let competition = await req.db.collection("competitions").findOne({ type: "friends", members: req.user._id });
    const members = [req.user._id, ...friendIds];
    if (!competition) {
      const document = {
        type: "friends",
        name: "Vännerna",
        description: "Tävla mot dina vänner. Största fisk per art.",
        daysLeft: 365,
        species: [],
        scoringMetric: "length",
        createdBy: req.user._id,
        members,
        createdAt: new Date()
      };
      const result = await req.db.collection("competitions").insertOne(document);
      competition = { ...document, _id: result.insertedId };
    } else {
      await req.db.collection("competitions").updateOne({ _id: competition._id }, { $addToSet: { members: { $each: members } } });
      competition.members = [...new Map([...(competition.members || []), ...members].map((id) => [String(id), id])).values()];
    }
    res.json({ ok: true, competitionId: String(competition._id) });
  } catch (error) { next(error); }
});

router.post("/competitions", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Tävlingsnamn krävs." });
    const daysLeft = Math.max(1, Math.min(365, Number(req.body?.daysLeft) || 7));
    const competition = {
      type: "competition",
      name,
      description: String(req.body?.description || "Tävla om den längsta fisken.").slice(0, 140),
      daysLeft,
      species: Array.isArray(req.body?.species) ? req.body.species.filter(Boolean).slice(0, 30) : [],
      scoringMetric: ["length", "weight", "both"].includes(req.body?.scoringMetric) ? req.body.scoringMetric : "length",
      createdBy: req.user._id,
      members: req.body?.joinOnCreate === false ? [] : [req.user._id],
      createdAt: new Date()
    };
    const result = await req.db.collection("competitions").insertOne(competition);
    const users = competition.members.length ? [req.user] : [];
    res.status(201).json(publicCompetition({ ...competition, _id: result.insertedId }, users, []));
  } catch (error) { next(error); }
});

router.post("/competitions/:competitionId/join", requireAuth, async (req, res, next) => {
  try {
    const competitionId = toId(req.params.competitionId);
    if (!competitionId) return res.status(400).json({ error: "Ogiltig tävling." });
    const result = await req.db.collection("competitions").updateOne({ _id: competitionId }, { $addToSet: { members: req.user._id } });
    if (!result.matchedCount) return res.status(404).json({ error: "Tävlingen finns inte." });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post("/competitions/:competitionId/leave", requireAuth, async (req, res, next) => {
  try {
    const competitionId = toId(req.params.competitionId);
    if (!competitionId) return res.status(400).json({ error: "Ogiltig tävling." });
    const result = await req.db.collection("competitions").updateOne({ _id: competitionId }, { $pull: { members: req.user._id } });
    if (!result.matchedCount) return res.status(404).json({ error: "Tävlingen finns inte." });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.delete("/competitions/:competitionId", requireAuth, async (req, res, next) => {
  try {
    const competitionId = toId(req.params.competitionId);
    if (!competitionId) return res.status(400).json({ error: "Ogiltig tävling." });
    const result = await req.db.collection("competitions").deleteOne({ _id: competitionId, createdBy: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ error: "Tävlingen finns inte eller tillhör inte dig." });
    await req.db.collection("catches").updateMany({ competitionIds: String(competitionId) }, { $pull: { competitionIds: String(competitionId) } });
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;
