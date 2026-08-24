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
    collectionOnly: { type: Boolean, default: true },
    registrationEnabled: { type: Boolean, default: true },
    configVersion: { type: Number, default: 2 },
    targetEnrollmentSamples: { type: Number, default: 100 },
    validationFraction: { type: Number, default: 0.2 },
    sampleKeyThreshold: { type: Number, default: 250 },
    verificationKeyThreshold: { type: Number, default: 250 },
    longPauseThresholdMs: { type: Number, default: 2000 },
    maxDigraphFeatures: { type: Number, default: 20 },
    profileVersion: { type: Number, default: 1 },
    frozenAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now }
  })
);

module.exports = ResearchConfig;
