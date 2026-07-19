const express = require("express");
const { calculateMeasurement } = require("../services/measurement");

const router = express.Router();

router.post("/calculate", (req, res, next) => {
  try {
    res.json(calculateMeasurement(req.body || {}));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
