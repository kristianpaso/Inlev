const mongoose = require('mongoose');

const AtgLinkSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    templateUrl: { type: String, required: true, trim: true }, // innehåller {DATE}
  },
  { timestamps: true }
);

module.exports = mongoose.model('AtgLink', AtgLinkSchema);
