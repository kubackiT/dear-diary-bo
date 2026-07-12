const mongoose = require("mongoose");

const MetricSummarySchema = new mongoose.Schema(
  {
    mean: { type: Number, default: 0 },
    median: { type: Number, default: 0 },
    stdDev: { type: Number, default: 0 },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  { _id: false }
);

const TrainingDataSchema = mongoose.model(
  "TrainingData",
  new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sampleType: {
      type: String,
      enum: ["enrollment", "verification"],
      default: "enrollment"
    },
    actorType: {
      type: String,
      enum: ["owner", "impostor"],
      default: "owner"
    },
    profileVersion: { type: Number, default: 1 },
    profileFrozen: { type: Boolean, default: false },
    textLength: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    keyCount: { type: Number, default: 0 },
    correctionCount: { type: Number, default: 0 },
    wordCount: { type: Number, default: 0 },
    burstCount: { type: Number, default: 0 },
    longPauseCount: { type: Number, default: 0 },
    overlapCount: { type: Number, default: 0 },
    dwell: { type: MetricSummarySchema, default: () => ({}) },
    flight: { type: MetricSummarySchema, default: () => ({}) },
    releasePress: { type: MetricSummarySchema, default: () => ({}) },
    releaseRelease: { type: MetricSummarySchema, default: () => ({}) },
    pause: { type: MetricSummarySchema, default: () => ({}) },
    burst: { type: MetricSummarySchema, default: () => ({}) },
    digraphs: { type: Map, of: MetricSummarySchema, default: {} },
    raw: {
      dwellTimes: { type: [Number], default: [] },
      flightTimes: { type: [Number], default: [] },
      releasePressTimes: { type: [Number], default: [] },
      releaseReleaseTimes: { type: [Number], default: [] },
      pauseTimes: { type: [Number], default: [] },
      burstLengths: { type: [Number], default: [] }
    },
    verification: {
      score: { type: Number, default: null },
      distance: { type: Number, default: null },
      isMatch: { type: Boolean, default: null },
      tensorflowError: { type: Number, default: null },
      tensorflowThreshold: { type: Number, default: null },
      statisticalScore: { type: Number, default: null },
      statisticalMatch: { type: Boolean, default: null }
    },
    timestamp: { type: Date, default: Date.now }
  })
);

module.exports = TrainingDataSchema;
