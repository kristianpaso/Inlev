const references = [
  { id: "can-330", name: "33 cl burk", sizeCm: 11.5, note: "Vanlig läskburk, ungefärlig höjd." },
  { id: "can-500", name: "50 cl burk", sizeCm: 16.8, note: "Vanlig hög burk, ungefärlig höjd." },
  { id: "card", name: "Bankkort", sizeCm: 8.56, note: "Kortets långsida enligt ISO-format." },
  { id: "snus", name: "Snusdosa", sizeCm: 7.0, note: "Ungefärlig diameter. Mät gärna din dosa." },
  { id: "custom", name: "Egen referens", sizeCm: null, note: "Ange verklig längd i centimeter." }
];

const species = [
  { id: "pike", name: "Gädda", minCm: 40, factor: 0.0000080 },
  { id: "perch", name: "Abborre", minCm: 20, factor: 0.0000155 },
  { id: "zander", name: "Gös", minCm: 45, factor: 0.0000092 },
  { id: "trout", name: "Öring", minCm: 35, factor: 0.0000105 },
  { id: "salmon", name: "Lax", minCm: 60, factor: 0.0000112 },
  { id: "char", name: "Röding", minCm: 35, factor: 0.0000100 },
  { id: "cod", name: "Torsk", minCm: 35, factor: 0.0000095 },
  { id: "other", name: "Annan art", minCm: 0, factor: 0.0000100 }
];

module.exports = {
  references,
  species
};
