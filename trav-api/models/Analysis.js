// trav-api/models/Analysis.js
const mongoose = require('mongoose');

const AnalysisSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: String, default: '' }, // YYYY-MM-DD
    track: { type: String, required: true, trim: true },
    trackType: { type: String, default: '', trim: true }, // ex: "Lätt bana"
    group: { type: String, default: '', trim: true },     // ex: "STL Klass III → STL Klass II"
    start: { type: String, default: '', trim: true, lowercase: true }, // "voltstart" | "autostart"
    distance: { type: Number, default: 0 },
    comment: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TravAnalysis', AnalysisSchema);
