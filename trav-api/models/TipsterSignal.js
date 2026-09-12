const mongoose = require('mongoose');

const TipsterSignalSchema = new mongoose.Schema({
  roundId: { type: String, required: true, index: true },
  gameType: { type: String, required: true },
  trackId: { type: String, required: true },
  raceDate: { type: Date, required: true },
  division: { type: Number, required: true },
  horse: {
    number: { type: Number, required: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
  },
  tipster: {
    id: { type: String, required: true, index: true },
    name: { type: String, required: true },
    sourceId: { type: String, required: true },
  },
  signal: {
    type: { type: String, required: true },
    score: { type: Number, min: 0, max: 1, required: true },
    positive: { type: Boolean, required: true },
    confidence: { type: Number, min: 0, max: 1, default: 1 },
    keywords: [String],
  },
  matching: {
    confidence: { type: Number, min: 0, max: 1, required: true },
    method: { type: String, required: true },
  },
  source: {
    url: { type: String, required: true },
    canonicalUrl: { type: String, required: true },
    articleTitle: String,
    publishedAt: Date,
    fetchedAt: Date,
    parserVersion: String,
  },
}, { timestamps: true });

TipsterSignalSchema.index({ roundId: 1, division: 1, 'horse.number': 1, 'tipster.id': 1, 'source.canonicalUrl': 1 }, { unique: true });

module.exports = mongoose.models.TipsterSignal || mongoose.model('TipsterSignal', TipsterSignalSchema);
