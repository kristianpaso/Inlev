import { DEFAULT_SPECIES } from "./reference-data.js";

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

export function calculateMeasurementOffline(input, speciesList = DEFAULT_SPECIES) {
  const spec = speciesList.find((item) => item.id === input.speciesId) || DEFAULT_SPECIES[DEFAULT_SPECIES.length - 1];
  const refPixels = Number(input.refPixels);
  const fishPixels = Number(input.fishPixels);
  const bodyPixels = Number(input.bodyPixels);
  const refCm = Number(input.refCm);
  const calibrationFactor = Number.isFinite(Number(input.calibrationFactor))
    ? Math.min(1.2, Math.max(0.65, Number(input.calibrationFactor)))
    : 1;
  const minCm = Number.isFinite(Number(input.minCm)) ? Number(input.minCm) : spec.minCm;

  if (!Number.isFinite(refPixels) || !Number.isFinite(fishPixels) || !Number.isFinite(refCm)) {
    throw new Error("Mätvärden saknas");
  }

  if (refPixels <= 0 || fishPixels <= 0 || refCm <= 0) {
    throw new Error("Mätvärden måste vara större än noll");
  }

  const factor = spec.factor || 0.0000100;
  const lengthCm = (fishPixels / refPixels) * refCm * calibrationFactor;
  const bodyCm = Number.isFinite(bodyPixels) && bodyPixels > 0
    ? (bodyPixels / refPixels) * refCm * calibrationFactor
    : null;
  const condition = bodyConditionMultiplier(spec, lengthCm, bodyCm);
  const mid = factor * Math.pow(lengthCm, 3) * condition;

  return {
    species: spec.name,
    lengthCm,
    bodyCm,
    minCm,
    status: minCm <= 0 ? "KOLLA" : lengthCm >= minCm ? "BIGPLUS" : "SLÄPP",
    confidence: bodyCm ? "body" : "local",
    conditionMultiplier: condition,
    weightKg: {
      low: Math.max(0, mid * 0.82),
      mid: Math.max(0, mid),
      high: Math.max(0, mid * 1.18)
    },
    disclaimer: "Lokal beräkning. Kontrollera alltid lokala regler, fredningstider och undantag."
  };
}
