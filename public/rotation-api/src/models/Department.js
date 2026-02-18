const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    goalPerHour: { type: Number, default: null },        // Mål/h
    avgWeightKg: { type: Number, default: null },        // Snitt vikt artikel/låda (kg)
    info: { type: String, default: '' },                 // Information om avdelningen

    // Koncentrationsdelar (K-poäng)
    k_timePressure: { type: Number, default: 0 },        // A (0–2)
    k_interruptions: { type: Number, default: 0 },       // B (0–2)
    k_complexity: { type: Number, default: 0 },          // C (0–2)
    k_errorConsequence: { type: Number, default: 0 },    // D (0–3)
    k_safetyRisk: { type: Number, default: 0 }           // E (0–1)
  },
  { collection: 'avdelningar', timestamps: true }
);

DepartmentSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Department', DepartmentSchema);
