// trav-api/models/Game.js
const mongoose = require('mongoose');

// En division i en kupong (t.ex. Avd 1: [1,4,9,11,12])
const CouponDivisionSchema = new mongoose.Schema(
  {
    divisionIndex: { type: Number, required: true }, // 1..N
    horses: [{ type: Number, required: true }],
  },
  { _id: false }
);

// Själva kupongen
const CouponSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  source: { type: String, default: 'manual' },
  name: { type: String, default: '' },
  stakeLevel: {
    type: String,
    enum: ['original', '70', '50', '30'],
    default: 'original',
  },

  // ✅ NYTT: aktiv/inaktiv
  active: { type: Boolean, default: true },

  selections: [CouponDivisionSchema],
});




const TravGameSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    date: { type: String, required: true },
    track: { type: String, required: true },
    trackSlug: { type: String, default: '' }, // ex: "orebro"

results: {
  type: Object,
  default: {}, // ex: { "1": 2, "2": 12, ... } => avd -> vinnande startnummer
},
resultsUpdatedAt: { type: Date, default: null },
    gameType: { type: String, required: true },

    horseText: { type: String, default: '' },

    parsedHorseInfo: {
      type: Object,
      default: {},
    },

    coupons: {
      type: [CouponSchema],
      default: [],
    },
  },
  { timestamps: true }
);


module.exports = mongoose.model('TravGame', TravGameSchema);
