const { species } = require("../data/catalog");

function estimateWeightKg(spec, lengthCm) {
  const center = spec.factor * Math.pow(lengthCm, 3);
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
  const refCm = Number(input.refCm);
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

  const lengthCm = (fishPixels / refPixels) * refCm;
  const weight = estimateWeightKg(spec, lengthCm);
  const confidence = input.angleWarning ? "medium" : "high";
  const status = minCm <= 0 ? "KOLLA" : lengthCm >= minCm ? "BIGPLUS" : "SLÄPP";

  return {
    species: spec.name,
    lengthCm,
    minCm,
    status,
    confidence,
    weightKg: weight,
    disclaimer: "Regler varierar mellan vatten, säsong och art. Bigplus är en mät- och logghjälp, inte juridisk rådgivning."
  };
}

module.exports = {
  calculateMeasurement
};
