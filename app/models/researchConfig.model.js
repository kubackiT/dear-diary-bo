const mongoose = require("mongoose");

const ResearchConfig = mongoose.model(
  "ResearchConfig",
  new mongoose.Schema({
    key: { type: String, default: "global", unique: true },
    mode: {
      type: String,
      enum: ["enrollment", "verification"],
      default: "enrollment"
    },
    profileUpdatesEnabled: { type: Boolean, default: true },
    profileFrozen: { type: Boolean, default: false },
    minEnrollmentSamples: { type: Number, default: 10 },
    sampleKeyThreshold: { type: Number, default: 1000 },
    verificationKeyThreshold: { type: Number, default: 120 },
    verificationStep: { type: Number, default: 60 },
    longPauseThresholdMs: { type: Number, default: 2000 },
    maxDigraphFeatures: { type: Number, default: 20 },
    profileVersion: { type: Number, default: 1 },
    frozenAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now }
  })
);

module.exports = ResearchConfig;
