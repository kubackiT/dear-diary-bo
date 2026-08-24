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

const KeyOccurrenceSchema = new mongoose.Schema({
  index: { type: Number, required: true },
  code: { type: String, required: true },
  category: { type: String, default: "other" },
  keydownOffsetMs: { type: Number, required: true },
  keyupOffsetMs: { type: Number, default: null },
  dwellMs: { type: Number, default: null },
  isCorrection: { type: Boolean, default: false }
}, { _id: false });

const KeyTransitionSchema = new mongoose.Schema({
  fromIndex: { type: Number, required: true },
  toIndex: { type: Number, required: true },
  fromCode: { type: String, required: true },
  toCode: { type: String, required: true },
  keydownKeydownMs: { type: Number, required: true },
  keyupKeydownMs: { type: Number, default: null },
  keyupKeyupMs: { type: Number, default: null },
  isLongPause: { type: Boolean, default: false }
}, { _id: false });

const TrainingDataSchema = mongoose.model(
  "TrainingData",
  new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    collectorVersion: { type: Number, default: 1 },
    sessionId: { type: String, default: null },
    sampleSequence: { type: Number, default: null },
    sampleStartedAt: { type: Date, default: null },
    environment: {
      userAgent: { type: String, default: "" },
      platform: { type: String, default: "" },
      language: { type: String, default: "" },
      timezone: { type: String, default: "" },
      screenWidth: { type: Number, default: null },
      screenHeight: { type: Number, default: null },
      touchPoints: { type: Number, default: 0 }
    },
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
      burstLengths: { type: [Number], default: [] },
      keyOccurrences: { type: [KeyOccurrenceSchema], default: [] },
      transitions: { type: [KeyTransitionSchema], default: [] }
    },
    verification: {
      score: { type: Number, default: null },
      finalScore: { type: Number, default: null },
      decision: {
        type: String,
        enum: ["match", "uncertain", "mismatch", null],
        default: null
      },
      distance: { type: Number, default: null },
      isMatch: { type: Boolean, default: null },
      tensorflowScore: { type: Number, default: null },
      tensorflowError: { type: Number, default: null },
      tensorflowThreshold: { type: Number, default: null },
      statisticalScore: { type: Number, default: null },
      statisticalMatch: { type: Boolean, default: null }
    },
    timestamp: { type: Date, default: Date.now }
  })
);

module.exports = TrainingDataSchema;
