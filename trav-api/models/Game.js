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
  // Alla kuponger som sparas i samma paket delar detta id och visas därför
  // tillsammans under Kuponger.
  packageId: { type: String, default: '' },
  packageName: { type: String, default: '' },
  packageCreatedAt: { type: Date, default: null },
  rows: { type: Number, default: null },
  cost: { type: Number, default: null },
  spikeCount: { type: Number, default: null },
  variation: { type: Number, default: null },
  stakeLevel: {
    type: String,
    enum: ['original', '70', '50', '30'],
    default: 'original',
  },

  // ✅ NYTT: kupongläge (active | waiting | inactive)
  status: { type: String, enum: ['active', 'waiting', 'inactive'], default: 'waiting' },

  // Backwards compat: gamla fältet active finns kvar
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
resultDetails: {
  type: Object,
  default: {}, // avd -> häst/värde samt utdelning och omsättning
},
resultsSourceUrl: { type: String, default: '' },
resultsUpdatedAt: { type: Date, default: null },
    gameType: { type: String, required: true },

    horseText: { type: String, default: '' },

    parsedHorseInfo: {
      type: Object,
      default: {},
    },

    // ✅ NYTT: Stallsnack/Intervju per avdelning och häst (hämtas via knapp från ATG)
    stallsnack: {
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
