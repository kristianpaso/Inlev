const references = [
  { id: "can-330", name: "33 cl burk vanlig", sizeCm: 11.5, note: "Klassisk burk, ca 66 mm bred och 115 mm hog." },
  { id: "can-330-slim", name: "33 cl burk smal", sizeCm: 14.5, note: "Smal burk, ca 58 mm bred och 145 mm hog." },
  { id: "can-500", name: "50 cl burk", sizeCm: 16.8, note: "Vanlig hog burk, ungefarling hojd." },
  { id: "glasses", name: "Glasogon", sizeCm: 13.5, note: "Ungefarling total bredd over bagen. Justera vid ansiktet." },
  { id: "card", name: "Bankkort", sizeCm: 8.56, note: "Kortets langsida enligt ISO-format." },
  { id: "snus", name: "Snusdosa", sizeCm: 7.0, note: "Ungefarling diameter. Mat garna din dosa." },
  { id: "custom", name: "Egen referens", sizeCm: null, note: "Ange verklig langd i centimeter." }
];

const species = [
  { id: "pike", name: "Gadda", minCm: 40, factor: 0.0000080 },
  { id: "perch", name: "Abborre", minCm: 20, factor: 0.0000155 },
  { id: "zander", name: "Gos", minCm: 45, factor: 0.0000092 },
  { id: "trout", name: "Oring", minCm: 35, factor: 0.0000105 },
  { id: "salmon", name: "Lax", minCm: 60, factor: 0.0000112 },
  { id: "char", name: "Roding", minCm: 35, factor: 0.0000100 },
  { id: "cod", name: "Torsk", minCm: 35, factor: 0.0000095 },
  { id: "other", name: "Annan art", minCm: 0, factor: 0.0000100 }
];

module.exports = {
  references,
  species
};
