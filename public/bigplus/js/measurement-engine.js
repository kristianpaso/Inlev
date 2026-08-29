const SPECIES_PROFILES = {
  pike: {
    name: "Gädda",
    latinName: "Esox lucius",
    bodyHeightToTotal: { min: 0.18, typical: 0.24, max: 0.31 },
    headToTotal: { min: 0.16, typical: 0.2, max: 0.25 }
  },
  perch: {
    name: "Abborre",
    latinName: "Perca fluviatilis",
    bodyHeightToTotal: { min: 0.24, typical: 0.3, max: 0.38 },
    headToTotal: { min: 0.18, typical: 0.23, max: 0.29 }
  },
  zander: {
    name: "Gös",
    latinName: "Sander lucioperca",
    bodyHeightToTotal: { min: 0.19, typical: 0.25, max: 0.32 },
    headToTotal: { min: 0.17, typical: 0.22, max: 0.28 }
  }
};

const FUSION_CONFIG = {
  minStdCm: 2,
  minRelativeStd: 0.025,
  huberK: 1.5,
  mildOutlierZ: 1.5,
  strongOutlierZ: 2.5,
  extremeOutlierZ: 4,
  maxUncertaintyCm: 60,
  withinVarianceWeight: 0.65,
  betweenVarianceWeight: 1,
  maxGroupShare: { hand: 0.4, vision: 0.4, human: 0.2, biology: 0.2, geometry: 0.25 }
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pointDistance = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));

function polylineLength(points = []) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += pointDistance(points[index - 1], points[index]);
  return length;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function weightedMedian(items, valueKey = "value") {
  const sorted = items
    .filter((item) => Number.isFinite(item[valueKey]) && item[valueKey] > 0 && Number.isFinite(item.weight) && item.weight > 0)
    .sort((a, b) => a[valueKey] - b[valueKey]);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  let accumulated = 0;
  for (const item of sorted) {
    accumulated += item.weight;
    if (accumulated >= total / 2) return item[valueKey];
  }
  return sorted[sorted.length - 1]?.[valueKey] || null;
}

function confidenceLevel(score) {
  if (score >= 88) return "very_high";
  if (score >= 72) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function groupForMethod(method = "") {
  if (method.includes("finger") || method.includes("hand")) return "hand";
  if (method.includes("species") || method.includes("morphology")) return "biology";
  if (method.includes("perspective") || method.includes("pose") || method.includes("geometry")) return "geometry";
  if (method.includes("human") || method.includes("body")) return "human";
  return "vision";
}

function defaultStdCm(meanCm, confidence, referenceFreeMode) {
  if (referenceFreeMode) return clamp(Math.max(12, meanCm * 0.25), 12, 60);
  return Math.max(FUSION_CONFIG.minStdCm, meanCm * clamp((1 - confidence) * 0.12, 0.025, 0.18));
}

function normalizeEstimate(item, referenceFreeMode = false) {
  const meanCm = Number(item.meanCm ?? item.lengthCm ?? item.value);
  const confidence = clamp(Number(item.confidence) || 0.25, 0.01, 1);
  const stdCm = Number(item.stdCm) > 0 ? Number(item.stdCm) : defaultStdCm(meanCm, confidence, referenceFreeMode);
  const suppliedWeight = Number(item.weight);
  return {
    method: item.method || "unknown",
    meanCm,
    stdCm,
    confidence,
    group: item.group || groupForMethod(item.method || ""),
    diagnostics: item.diagnostics || {},
    suppliedWeight: suppliedWeight > 0 ? suppliedWeight : 1
  };
}

function outlierPenalty(zScore) {
  if (zScore >= FUSION_CONFIG.extremeOutlierZ) return 0.02;
  if (zScore >= FUSION_CONFIG.strongOutlierZ) return 0.1;
  if (zScore >= FUSION_CONFIG.huberK) return FUSION_CONFIG.huberK / zScore;
  return 1;
}

function groupCapWeights(items) {
  const totals = new Map();
  const total = items.reduce((sum, item) => sum + item.rawWeight, 0) || 1;
  items.forEach((item) => totals.set(item.group, (totals.get(item.group) || 0) + item.rawWeight));
  return items.map((item) => {
    const groupTotal = totals.get(item.group) || item.rawWeight;
    const maxShare = FUSION_CONFIG.maxGroupShare[item.group] || 0.4;
    const share = groupTotal / total;
    const capFactor = share > maxShare ? maxShare / share : 1;
    return { ...item, finalWeight: item.rawWeight * capFactor, groupCapFactor: capFactor };
  });
}

export function fuseMeasurementEstimates(rawEstimates = [], options = {}) {
  const referenceFreeMode = Boolean(options.referenceFreeMode);
  const candidates = rawEstimates
    .map((item) => normalizeEstimate(item, referenceFreeMode))
    .filter((item) => Number.isFinite(item.meanCm) && item.meanCm > 1 && item.meanCm < 500 && Number.isFinite(item.stdCm));
  if (!candidates.length) return null;

  const provisional = weightedMedian(
    candidates.map((item) => ({ ...item, weight: item.confidence * item.suppliedWeight / (item.stdCm ** 2) })),
    "meanCm"
  ) || candidates[0].meanCm;
  const absoluteDeviations = candidates.map((item) => Math.abs(item.meanCm - provisional));
  const mad = median(absoluteDeviations) || 0;
  const robustScale = Math.max(FUSION_CONFIG.minStdCm, 1.4826 * mad);
  const scored = candidates.map((item) => {
    const zScore = Math.abs(item.meanCm - provisional) / robustScale;
    const penalty = outlierPenalty(zScore);
    const rawWeight = item.confidence * item.suppliedWeight * penalty / Math.max(item.stdCm ** 2, FUSION_CONFIG.minStdCm ** 2);
    return { ...item, zScore, outlierPenalty: penalty, rawWeight };
  });
  const capped = groupCapWeights(scored);
  const totalWeight = capped.reduce((sum, item) => sum + item.finalWeight, 0) || 1;
  const weightedMean = capped.reduce((sum, item) => sum + item.meanCm * item.finalWeight, 0) / totalWeight;
  const withinVariance = capped.reduce((sum, item) => sum + item.finalWeight * (item.stdCm ** 2), 0) / totalWeight;
  const betweenVariance = capped.reduce((sum, item) => sum + item.finalWeight * ((item.meanCm - weightedMean) ** 2), 0) / totalWeight;
  const groups = new Set(capped.map((item) => item.group));
  const sameGroupRatio = capped.length > 1 ? 1 - groups.size / capped.length : 0;
  const correlationInflation = 1 + sameGroupRatio * 0.35;
  const variance = (FUSION_CONFIG.withinVarianceWeight * withinVariance + FUSION_CONFIG.betweenVarianceWeight * betweenVariance) * correlationInflation;
  const uncertaintyMultiplier = referenceFreeMode ? 1.35 : 1;
  const uncertaintyCm = clamp(
    Math.max(FUSION_CONFIG.minStdCm, weightedMean * FUSION_CONFIG.minRelativeStd, Math.sqrt(Math.max(0, variance)) * uncertaintyMultiplier),
    FUSION_CONFIG.minStdCm,
    FUSION_CONFIG.maxUncertaintyCm
  );
  const agreement = clamp(1 - Math.sqrt(Math.max(0, betweenVariance)) / Math.max(weightedMean * 0.15, FUSION_CONFIG.minStdCm), 0, 1);
  const meanConfidence = capped.reduce((sum, item) => sum + item.confidence * item.finalWeight, 0) / totalWeight;
  const sourceBonus = clamp((groups.size - 1) * 0.08, 0, 0.2);
  const score = Math.round(clamp(100 * (0.5 * meanConfidence + 0.35 * agreement + 0.15 * (0.7 + sourceBonus)), 8, 98));
  return {
    meanCm: weightedMean,
    uncertaintyCm,
    rangeMinCm: Math.max(0, weightedMean - uncertaintyCm),
    rangeMaxCm: weightedMean + uncertaintyCm,
    confidence: { score, level: confidenceLevel(score) },
    estimates: capped.map((item) => ({
      method: item.method,
      meanCm: item.meanCm,
      lengthCm: item.meanCm,
      stdCm: item.stdCm,
      confidence: item.confidence,
      group: item.group,
      weight: item.finalWeight,
      outlierPenalty: item.outlierPenalty,
      diagnostics: item.diagnostics
    })),
    diagnostics: {
      provisionalCm: provisional,
      medianAbsoluteDeviationCm: mad,
      robustScaleCm: robustScale,
      withinVarianceCm2: withinVariance,
      betweenVarianceCm2: betweenVariance,
      correlationInflation,
      hardUncertaintyCapCm: FUSION_CONFIG.maxUncertaintyCm,
      validEstimateCount: capped.length,
      groups: [...groups],
      referenceFreeMode
    }
  };
}

export function analyzeFishMeasurement(input) {
  const fishPoints = input.fishPoints || [];
  const fishPx = polylineLength(fishPoints);
  const directFishPx = fishPoints.length >= 2 ? pointDistance(fishPoints[0], fishPoints[fishPoints.length - 1]) : 0;
  const scaleCmPerPixel = Number(input.scaleCmPerPixel);
  const referenceFreeMode = Boolean(input.referenceFreeMode);
  const referenceScales = (input.referenceScales || [])
    .map((item) => ({
      method: item.method || item.referenceId || "reference",
      scaleCmPerPixel: Number(item.scaleCmPerPixel),
      confidence: clamp(Number(item.confidence) || 0.5, 0.05, 1),
      weight: clamp(Number(item.weight) || Number(item.confidence) || 0.5, 0.05, 1),
      stdCm: Number(item.stdCm) > 0 ? Number(item.stdCm) : null
    }))
    .filter((item) => item.scaleCmPerPixel > 0 && Number.isFinite(item.scaleCmPerPixel));
  if (scaleCmPerPixel > 0 && !referenceScales.length) referenceScales.push({ method: "reference", scaleCmPerPixel, confidence: 0.45, weight: 0.35, stdCm: null });
  if (!Number.isFinite(fishPx) || fishPx <= 0 || (!referenceScales.length && !referenceFreeMode)) throw new Error("Mätvärden saknas");

  const profile = SPECIES_PROFILES[input.speciesId] || {
    name: input.speciesName || "Annan art",
    latinName: "",
    bodyHeightToTotal: { min: 0.18, typical: 0.24, max: 0.32 },
    headToTotal: { min: 0.16, typical: 0.21, max: 0.27 }
  };
  // Depth is relative, so it may only apply the bounded V1 perspective
  // correction. It must never be interpreted as a metric camera distance.
  const basePerspectiveScale = referenceFreeMode
    ? 1
    : clamp(Number(input.perspectiveScale) || 1, 0.88, 1.2);
  const depthAnalysis = input.depthAnalysis && input.depthAnalysis.ok ? input.depthAnalysis : null;
  const depthQuality = clamp(Number(depthAnalysis?.depthQuality?.score) || 0, 0, 1);
  const rawDepthCorrection = Number(
    depthAnalysis?.depthCorrection?.correctionFactor
      ?? depthAnalysis?.depthCorrection?.factor
  );
  const depthCorrectionFactor = depthAnalysis?.depthUsed && depthQuality >= 0.30
    ? clamp(Number.isFinite(rawDepthCorrection) ? rawDepthCorrection : 1, 0.92, 1.10)
    : 1;
  const perspectiveScale = clamp(basePerspectiveScale * depthCorrectionFactor, 0.88, 1.2);
  const imageHeightPx = Number(input.imageHeightPx);
  const photoScale = imageHeightPx > 0 ? clamp(64 / imageHeightPx, 0.02, 0.12) : 0.064;
  const baseLength = referenceScales.length ? fishPx * referenceScales[0].scaleCmPerPixel * perspectiveScale : fishPx * photoScale * perspectiveScale;
  const bodyPx = Number(input.bodyPx) > 0 ? Number(input.bodyPx) : null;
  const estimates = referenceScales.map((reference) => ({
    method: reference.method,
    meanCm: fishPx * reference.scaleCmPerPixel * perspectiveScale,
    stdCm: reference.stdCm || Math.max(2, fishPx * reference.scaleCmPerPixel * (1 - reference.confidence) * 0.1),
    confidence: reference.confidence,
    weight: reference.weight * 0.72,
    group: groupForMethod(reference.method),
    diagnostics: {
      source: "physical_reference",
      perspectiveScale,
      depthAdjusted: depthCorrectionFactor !== 1,
      dependencies: depthCorrectionFactor !== 1 ? [reference.method, "depth"] : []
    }
  }));
  if (referenceFreeMode) estimates.push({
    method: "absolute_size_heuristic_v1",
    meanCm: baseLength,
    stdCm: Math.max(12, baseLength * 0.25),
    confidence: 0.2,
    weight: 0.45,
    group: "vision",
    diagnostics: { adapter: "heuristic_v1", modelAvailable: false, scaleSource: "image_height_fallback" }
  });
  estimates.push({
    method: "perspective_model",
    meanCm: baseLength,
    stdCm: referenceFreeMode ? Math.max(14, baseLength * 0.3) : Math.max(3, baseLength * 0.12),
    confidence: referenceFreeMode ? 0.18 : 0.42,
    weight: 0.12,
    group: "geometry",
    diagnostics: {
      depthModelAvailable: Boolean(input.depthModelAvailable || depthAnalysis?.ok),
      perspectiveScale,
      depthQuality,
      depthCorrectionFactor
    }
  });
  const hands = (input.handGuides || []).filter((hand) => Number(hand.confidence || 0.65) > 0.25);
  const calibratedFingerMm = Number(input.handCalibration?.indexFingerWidthMm || input.handCalibration?.middleFingerWidthMm || 0);
  hands.slice(0, 2).forEach((hand, index) => {
    const fingerPx = Number(hand.upperFingerPixels || hand.fingerWidth || 0);
    if (fingerPx > 0 && calibratedFingerMm > 0) estimates.push({
      method: index === 0 ? "left_finger" : "right_finger",
    meanCm: fishPx / fingerPx * calibratedFingerMm / 10 * depthCorrectionFactor,
      stdCm: Math.max(2, fishPx / fingerPx * calibratedFingerMm / 10 * 0.08),
      confidence: clamp(Number(hand.confidence || 0.65) * 0.92, 0.05, 0.95),
      weight: 0.25,
      group: "hand",
      diagnostics: {
        calibratedFingerMm,
        fingerPx,
        depthAdjusted: depthCorrectionFactor !== 1,
        dependencies: depthCorrectionFactor !== 1 ? [index === 0 ? "left_finger" : "right_finger", "depth"] : []
      }
    });
  });
  if (bodyPx && profile.bodyHeightToTotal && referenceScales.length) estimates.push({
    method: "species_body_ratio",
    meanCm: bodyPx * referenceScales[0].scaleCmPerPixel * perspectiveScale / profile.bodyHeightToTotal.typical,
    stdCm: Math.max(3, bodyPx * referenceScales[0].scaleCmPerPixel * 0.18),
    confidence: 0.42,
    weight: 0.12,
    group: "biology",
    diagnostics: { expectedBodyHeightRatio: profile.bodyHeightToTotal }
  });

  const fusion = fuseMeasurementEstimates(estimates, { referenceFreeMode });
  if (!fusion) throw new Error("Mätvärden saknas");
  const quality = clamp(Number(input.imageQualityScore) || 0.7, 0, 1);
  const landmarksDetected = Boolean(input.fishLandmarksDetected);
  const pointsScore = landmarksDetected ? (fishPoints.length >= 4 ? 1 : 0.72) : 0.35;
  const visibilityScore = clamp(Number(input.fishVisibilityScore) || 0.82, 0, 1);
  const confidencePenalty = referenceFreeMode && !landmarksDetected ? 0.68 : 1;
  const depthConfidenceFactor = depthAnalysis?.ok ? (0.92 + depthQuality * 0.08) : 1;
  const score = Math.round(clamp(fusion.confidence.score * (0.55 + 0.2 * quality + 0.15 * pointsScore + 0.1 * visibilityScore) * confidencePenalty * depthConfidenceFactor, 8, 98));
  const finalConfidence = { score, level: confidenceLevel(score) };
  return {
    lengthCm: fusion.meanCm,
    weightKg: Number(input.weightKg) > 0 ? Number(input.weightKg) : null,
    minCm: Number(input.minCm) || 0,
    rangeMinCm: fusion.rangeMinCm,
    rangeMaxCm: fusion.rangeMaxCm,
    uncertaintyCm: fusion.uncertaintyCm,
    bodyCm: bodyPx && referenceScales.length ? bodyPx * referenceScales[0].scaleCmPerPixel * perspectiveScale : null,
    species: profile.name,
    speciesId: input.speciesId,
    speciesLatinName: profile.latinName,
    status: Number(input.minCm) > 0 && fusion.meanCm >= Number(input.minCm) ? "BIGPLUS" : Number(input.minCm) > 0 ? "SLÄPP" : "KOLLA",
    confidence: finalConfidence,
    estimates: fusion.estimates.map((item) => ({ ...item, lengthCm: item.meanCm })),
    fusion: fusion.diagnostics,
    measurementVersion: "BIGPLUS_MEASURE_V1",
    models: {
      depthEstimator: depthAnalysis?.models?.depthEstimator || null,
      depthNormalization: depthAnalysis?.models?.depthNormalization || null,
      depthCalibration: depthAnalysis?.models?.depthCalibration || null
    },
    depth: depthAnalysis ? {
      used: Boolean(depthAnalysis.depthUsed && depthQuality >= 0.30),
      confidence: depthQuality,
      quality: depthAnalysis.depthQuality || null,
      correction: depthAnalysis.depthCorrection || null,
      scene: depthAnalysis.sceneDepth || null,
      analysisId: depthAnalysis.analysisId || null
    } : null,
    analysis: {
      fishFullyVisible: visibilityScore >= 0.78,
      noseVisible: landmarksDetected,
      tailVisible: landmarksDetected,
      fishLandmarksDetected: landmarksDetected,
      calibratedHandUsed: Boolean(calibratedFingerMm && hands.length),
      bothHandsUsed: hands.length >= 2,
      perspectiveCorrected: perspectiveScale !== 1,
      speciesMorphologyVerified: Boolean(landmarksDetected && input.speciesId && SPECIES_PROFILES[input.speciesId] && (referenceScales.length || input.speciesMorphologyAvailable)),
      weightSanityCheckUsed: Number(input.weightKg) > 0,
      modelAdapter: input.fishSegmentationModelBacked
        ? "fish-segmentation-model"
        : referenceFreeMode && input.fishSegmentationAvailable
          ? "heuristic_segmentation_v2"
          : referenceFreeMode ? "heuristic_v1" : "calibrated_reference",
      fishSegmentationUsed: Boolean(input.fishSegmentationAvailable),
      fishSegmentationModelBacked: Boolean(input.fishSegmentationModelBacked),
      actualFishSegmentationAvailable: Boolean(input.fishSegmentationModelBacked),
      actualDepthModelAvailable: Boolean(depthAnalysis?.ok || input.depthModelAvailable),
      depthUsed: Boolean(depthAnalysis?.depthUsed && depthQuality >= 0.30),
      depthConfidence: depthAnalysis?.ok ? depthQuality : null,
      estimateCount: fusion.diagnostics.validEstimateCount
    },
    pixelLength: { straightLengthPx: directFishPx, centerlineLengthPx: fishPx },
    disclaimer: referenceFreeMode
      ? (input.fishSegmentationModelBacked
        ? "V1 Beta använder fisksegmentering och kontrollerade mätpunkter. Kontrollera alltid resultatet mot bilden."
        : input.fishSegmentationAvailable
          ? "V1 Beta använder en lokal preliminär fisksegmentering. Den är inte tränad på fiskbilder och resultatet måste kontrolleras manuellt."
          : landmarksDetected
            ? "V1 Beta använder manuellt kontrollerade mätpunkter. Utan fysisk skala eller ansluten fiskmodell är resultatet fortfarande ungefärligt."
            : "V1 Beta kunde inte hitta en tillförlitlig fiskmask. Den första linjen är bara ett förslag och måste justeras mellan nos och stjärt.")
      : "AI-mätningen är en uppskattning. Kontrollera resultatet mot fisken innan du sparar."
  };
}
