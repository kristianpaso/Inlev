const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    goalPerHour: { type: Number, default: null },        // Mål/h
    avgWeightKg: { type: Number, default: null },        // Snitt vikt artikel/låda (kg)
    info: { type: String, default: '' }                  // Information om avdelningen
    // Later:
    // handlesPerDay: Number,
    // concentration: Number
  },
  { collection: 'avdelningar', timestamps: true }
);

DepartmentSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Department', DepartmentSchema);
