// trav-api/models/Track.js
const mongoose = require('mongoose');

const TrackSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },

    // ✅ NYTT
    slug: { type: String, default: '', trim: true, lowercase: true },

    length: { type: String, default: '' },
    width: { type: String, default: '' },
    homeStretch: { type: String, default: '' },
    openStretch: { type: String, default: '' },
    angledGate: { type: String, default: '' },

    lat: { type: Number, default: null },
    lon: { type: Number, default: null },
  },
  { timestamps: true }
);


module.exports = mongoose.model('TravTrack', TrackSchema);
