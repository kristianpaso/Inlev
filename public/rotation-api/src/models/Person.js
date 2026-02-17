const mongoose = require('mongoose');

const PersonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    departmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }]
  },
  { collection: 'personer', timestamps: true }
);

PersonSchema.index({ name: 1 });

module.exports = mongoose.model('Person', PersonSchema);
