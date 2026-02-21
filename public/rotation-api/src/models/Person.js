const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema(
  {
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    hours: { type: Number, default: 8 },    // timmar på avdelningen den dagen
    day: { type: Number, default: 0 }       // 0=Mon ... 6=Sun
  },
  { _id: false }
);

const PersonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // Backward compatible (en avdelning per dag-rotation)
    departmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],

    // Ny: flera avdelningar per dag med timmar + veckodag
    assignments: { type: [AssignmentSchema], default: [] }
  },
  { collection: 'personer', timestamps: true }
);

PersonSchema.index({ name: 1 });

module.exports = mongoose.model('Person', PersonSchema);
