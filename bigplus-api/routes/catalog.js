const express = require("express");
const { references, species } = require("../data/catalog");
const { achievements } = require("../data/admin-catalog");

const router = express.Router();

router.get("/references", (req, res) => {
  res.json(references);
});

async function managedList(req, collectionName, fallback) {
  if (!req.app.locals.mongo) return fallback;
  const result = await req.app.locals.mongo.collection(collectionName).find({}).sort({ sortOrder: 1, name: 1, title: 1 }).toArray();
  return result.length ? result : fallback;
}

function publicSpecies(item) { return { id: String(item.id), name: item.name, minCm: Number(item.minCm) || 0, factor: Number(item.factor) || 0.00001 }; }
function publicAchievement(item) { return { id: String(item.id), title: item.title, description: item.description, metric: item.metric, target: Number(item.target) || 1, points: Number(item.points) || 0, image: item.image || "", visible: item.visible !== false }; }

router.get("/species", async (req, res, next) => {
  try { res.json((await managedList(req, "species", species)).map(publicSpecies)); } catch (error) { next(error); }
});

router.get("/achievements", async (req, res, next) => {
  try { res.json((await managedList(req, "achievements", achievements)).filter((item) => item.visible !== false).map(publicAchievement)); } catch (error) { next(error); }
});

module.exports = router;
