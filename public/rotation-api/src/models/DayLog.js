const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema(
  {
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    minutes: { type: Number, required: true }
  },
  { _id: false }
);

const DayLogSchema = new mongoose.Schema(
  {
    personId: { type: mongoose.Schema.Types.ObjectId, ref: 'Person', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    entries: { type: [EntrySchema], default: [] }
  },
  { collection: 'day_logs', timestamps: true }
);

DayLogSchema.index({ personId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DayLog', DayLogSchema);
