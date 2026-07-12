const mongoose = require("mongoose");

const User = mongoose.model(
  "User",
  new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    modelData: {
      modelTopology: { type: Object, default: null },
      weightSpecs: { type: Array, default: null },
      weightData: { type: Buffer, default: null },
      featureNames: { type: [String], default: [] },
      meanVector: { type: [Number], default: [] },
      stdVector: { type: [Number], default: [] },
      reconstructionThreshold: { type: Number, default: null },
      reconstructionMean: { type: Number, default: null },
      reconstructionStdDev: { type: Number, default: null },
      trainedAt: { type: Date, default: null }
    },
    typingProfile: {
      version: { type: Number, default: 1 },
      sampleCount: { type: Number, default: 0 },
      featureNames: { type: [String], default: [] },
      meanVector: { type: [Number], default: [] },
      stdVector: { type: [Number], default: [] },
      threshold: { type: Number, default: null },
      frozen: { type: Boolean, default: false },
      frozenAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null }
    },
    researchSettings: {
      currentActorType: {
        type: String,
        enum: ["owner", "impostor"],
        default: "owner"
      }
    },
    roles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role"
      }
    ]
  })
);

module.exports = User;
