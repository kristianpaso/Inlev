import { API_ROOT } from "./config.js";
import { fetchJson } from "./http.js";

export const DEFAULT_REFERENCES = [
  { id: "can-330", name: "33 cl burk vanlig", sizeCm: 11.5, note: "Klassisk burk, ca 66 mm bred och 115 mm hög." },
  { id: "can-330-slim", name: "33 cl burk smal", sizeCm: 14.5, note: "Smal burk, ca 58 mm bred och 145 mm hög." },
  { id: "can-500", name: "50 cl burk", sizeCm: 16.8, note: "Vanlig hög burk, ungefärlig höjd." },
  { id: "glasses", name: "Glasögon", sizeCm: 13.5, note: "Ungefärlig total bredd över bågen. Justera vid ansiktet." },
  { id: "card", name: "Bankkort", sizeCm: 8.56, note: "Kortets långsida enligt ISO-format." },
  { id: "snus", name: "Snusdosa", sizeCm: 7.0, note: "Ungefärlig diameter." },
  { id: "custom", name: "Egen referens", sizeCm: null, note: "Ange verklig längd i centimeter." }
];

export const DEFAULT_SPECIES = [
  { id: "pike", name: "Gädda", minCm: 40, factor: 0.0000080 },
  { id: "perch", name: "Abborre", minCm: 20, factor: 0.0000155 },
  { id: "zander", name: "Gös", minCm: 45, factor: 0.0000092 },
  { id: "trout", name: "Öring", minCm: 35, factor: 0.0000105 },
  { id: "salmon", name: "Lax", minCm: 60, factor: 0.0000112 },
  { id: "char", name: "Röding", minCm: 35, factor: 0.0000100 },
  { id: "cod", name: "Torsk", minCm: 35, factor: 0.0000095 },
  { id: "other", name: "Annan art", minCm: 0, factor: 0.0000100 }
];

export function getReferences() {
  return fetchJson(`${API_ROOT}/references`, {}, "Kunde inte hämta referenser");
}

export function getSpecies() {
  return fetchJson(`${API_ROOT}/species`, {}, "Kunde inte hämta arter");
}

export function calculateMeasurement(payload) {
  return fetchJson(
    `${API_ROOT}/calculate`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    "Kunde inte räkna mätningen"
  );
}
