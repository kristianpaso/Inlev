const { species } = require("../data/catalog");

function expectedBodyRatio(spec) {
  switch (spec.id) {
    case "perch":
      return 0.30;
    case "pike":
      return 0.16;
    case "zander":
      return 0.20;
    case "cod":
      return 0.24;
    default:
      return 0.22;
  }
}

function bodyConditionMultiplier(spec, lengthCm, bodyCm) {
  if (!Number.isFinite(bodyCm) || bodyCm <= 0 || !Number.isFinite(lengthCm) || lengthCm <= 0) return 1;
  const ratio = bodyCm / lengthCm;
  const expected = expectedBodyRatio(spec);
  return Math.min(1.45, Math.max(0.65, Math.pow(ratio / expected, 1.25)));
}

function estimateWeightKg(spec, lengthCm, bodyCm) {
  const center = spec.factor * Math.pow(lengthCm, 3) * bodyConditionMultiplier(spec, lengthCm, bodyCm);
  return {
    low: Math.max(0, center * 0.82),
    mid: Math.max(0, center),
    high: Math.max(0, center * 1.18)
  };
}

function calculateMeasurement(input) {
  const spec = species.find((item) => item.id === input.speciesId) || species[species.length - 1];
  const refPixels = Number(input.refPixels);
  const fishPixels = Number(input.fishPixels);
  const bodyPixels = Number(input.bodyPixels);
  const refCm = Number(input.refCm);
  const calibrationFactor = Number.isFinite(Number(input.calibrationFactor))
    ? Math.min(1.2, Math.max(0.65, Number(input.calibrationFactor)))
    : 1;
  const minCm = Number.isFinite(Number(input.minCm)) ? Number(input.minCm) : spec.minCm;

  if (!Number.isFinite(refPixels) || !Number.isFinite(fishPixels) || !Number.isFinite(refCm)) {
    const error = new Error("Missing measurement values");
    error.status = 400;
    throw error;
  }

  if (refPixels <= 0 || fishPixels <= 0 || refCm <= 0) {
    const error = new Error("Measurement values must be positive");
    error.status = 400;
    throw error;
  }

  const lengthCm = (fishPixels / refPixels) * refCm * calibrationFactor;
  const bodyCm = Number.isFinite(bodyPixels) && bodyPixels > 0
    ? (bodyPixels / refPixels) * refCm * calibrationFactor
    : null;
  const weight = estimateWeightKg(spec, lengthCm, bodyCm);
  const confidence = bodyCm ? "body" : input.angleWarning ? "medium" : "high";
  const status = minCm <= 0 ? "KOLLA" : lengthCm >= minCm ? "BIGPLUS" : "SLÄPP";

  return {
    species: spec.name,
    lengthCm,
    bodyCm,
    minCm,
    status,
    confidence,
    conditionMultiplier: bodyConditionMultiplier(spec, lengthCm, bodyCm),
    weightKg: weight,
    disclaimer: "Regler varierar mellan vatten, säsong och art. Bigplus är en mät- och logghjälp, inte juridisk rådgivning."
  };
}

module.exports = {
  calculateMeasurement
};
