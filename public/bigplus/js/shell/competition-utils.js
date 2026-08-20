export function competitionMetric(competition) {
  return ["length", "weight", "both"].includes(competition?.scoringMetric) ? competition.scoringMetric : "length";
}

export function competitionMetricLabel(competition) {
  const metric = competitionMetric(competition);
  return metric === "weight" ? "Vikt" : metric === "both" ? "Längd + vikt" : "Längd";
}

export function competitionSpeciesLabel(competition) {
  const species = Array.isArray(competition?.species) ? competition.species.filter(Boolean) : [];
  return species.length ? species.join(", ") : "Alla arter";
}

export function competitionAllowsSpecies(competition, measurement) {
  const selected = Array.isArray(competition?.species) ? competition.species.filter(Boolean) : [];
  if (!selected.length) return true;
  const name = String(measurement?.speciesName || measurement?.species || "").toLowerCase();
  return selected.some((item) => String(item).toLowerCase() === name);
}

export function competitionScore(item, competition) {
  const measurement = item?.measurement || item || {};
  if (!competitionAllowsSpecies(competition, measurement)) return 0;
  if (competitionMetric(competition) === "weight") {
    const value = measurement.weightKg?.mid ?? measurement.weightKg ?? measurement.weight ?? 0;
    return Number(value) || 0;
  }
  return Number(measurement.lengthCm ?? measurement.length ?? 0) || 0;
}

export function formatCompetitionScore(value, competition) {
  return value > 0 ? `${value.toFixed(1)} ${competitionMetric(competition) === "weight" ? "kg" : "cm"}` : "--";
}

export function formatCompetitionResult(item, competition) {
  const measurement = item?.measurement || item || {};
  if (competitionMetric(competition) !== "both") return formatCompetitionScore(competitionScore(item, competition), competition);
  const length = Number(measurement.lengthCm ?? measurement.length ?? 0);
  const weight = Number(measurement.weightKg?.mid ?? measurement.weightKg ?? measurement.weight ?? 0);
  const values = [];
  if (length > 0) values.push(`${length.toFixed(1)} cm`);
  if (weight > 0) values.push(`${weight.toFixed(1)} kg`);
  return values.length ? values.join(" · ") : "--";
}
