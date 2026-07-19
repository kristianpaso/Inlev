const express = require("express");
const { references, species } = require("../data/catalog");

const router = express.Router();

router.get("/references", (req, res) => {
  res.json(references);
});

router.get("/species", (req, res) => {
  res.json(species.map(({ id, name, minCm }) => ({ id, name, minCm })));
});

module.exports = router;
