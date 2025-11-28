// trav-api/models/Game.js
const mongoose = require('../db');

const HorseSchema = new mongoose.Schema(
  {
    number: Number,
    rawLine: String,
    scratched: { type: Boolean, default: false },
  },
  { _id: false }
);

const DivisionSchema = new mongoose.Schema(
  {
    index: Number,
    horses: [HorseSchema],
  },
  { _id: false }
);

const ParsedHorseInfoSchema = new mongoose.Schema(
  {
    header: String,
    divisions: [DivisionSchema],
    expectedDivisions: Number,
  },
  { _id: false }
);

const GameSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: String, required: true }, // räcker bra här, kan vara Date senare
  track: { type: String, required: true },
  gameType: {
    type: String,
    required: true,
    enum: ['V64', 'V65', 'V75', 'V85', 'V86', 'GS75'],
  },
  horseText: { type: String, default: '' },
  parsedHorseInfo: ParsedHorseInfoSchema,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TravGame', GameSchema);
