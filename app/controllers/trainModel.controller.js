const db = require("../models");
const TrainingData = db.trainingData;
const User = db.user;
const researchController = require("./research.controller");
const tf = require("@tensorflow/tfjs");

const BASE_FEATURE_NAMES = [
  "dwell.mean",
  "dwell.median",
  "dwell.stdDev",
  "flight.mean",
  "flight.median",
  "flight.stdDev",
  "releasePress.mean",
  "releasePress.median",
  "releasePress.stdDev",
  "releaseRelease.mean",
  "releaseRelease.median",
  "releaseRelease.stdDev",
  "pause.mean",
  "pause.median",
  "pause.stdDev",
  "burst.mean",
  "burst.median",
  "burst.stdDev",
  "correctionRate",
  "overlapRate",
  "longPauseRate",
  "keysPerMinute",
  "charsPerMinute",
  "wordsPerMinute"
];

const BASE_FEATURE_STD_FLOORS = [
  15,
  15,
  10,
  50,
  50,
  100,
  50,
  50,
  100,
  50,
  50,
  100,
  500,
  500,
  500,
  2,
  2,
  1,
  0.03,
  0.03,
  0.02,
  25,
  25,
  10
];

const MIN_ENROLLMENT_KEY_COUNT = 250;

function safeNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function getMetric(sample, group, field) {
  return safeNumber(sample[group] && sample[group][field]);
}

function getDigraphMetric(sample, digraphKey, field) {
  if (!sample.digraphs) {
    return 0;
  }

  const digraph = typeof sample.digraphs.get === "function"
    ? sample.digraphs.get(digraphKey)
    : sample.digraphs[digraphKey];

  return safeNumber(digraph && digraph[field]);
}

function getFeatureValue(sample, featureName) {
  const durationMinutes = sample.durationMs > 0 ? sample.durationMs / 60000 : 0;
  const correctionRate = sample.keyCount > 0 ? sample.correctionCount / sample.keyCount : 0;
  const overlapRate = sample.keyCount > 0 ? sample.overlapCount / sample.keyCount : 0;
  const longPauseRate = sample.keyCount > 0 ? sample.longPauseCount / sample.keyCount : 0;
  const keysPerMinute = durationMinutes > 0 ? sample.keyCount / durationMinutes : 0;
  const charsPerMinute = durationMinutes > 0 ? sample.textLength / durationMinutes : 0;
  const wordsPerMinute = durationMinutes > 0 ? sample.wordCount / durationMinutes : 0;

  if (featureName.startsWith("digraph.")) {
    const [, digraphKey, field] = featureName.split(".");
    return getDigraphMetric(sample, digraphKey, field);
  }

  const metricMatch = featureName.match(/^(dwell|flight|releasePress|releaseRelease|pause|burst)\.(mean|median|stdDev)$/);
  if (metricMatch) {
    return getMetric(sample, metricMatch[1], metricMatch[2]);
  }

  const scalarFeatures = {
    correctionRate,
    overlapRate,
    longPauseRate,
    keysPerMinute,
    charsPerMinute,
    wordsPerMinute
  };

  return safeNumber(scalarFeatures[featureName]);
}

function sampleToVector(sample, featureNames) {
  return featureNames.map((featureName) => getFeatureValue(sample, featureName));
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values, fallback = 1) {
  if (values.length < 2) {
    return fallback;
  }

  const avg = mean(values);
  const variance = mean(values.map((value) => Math.pow(value - avg, 2)));
  const result = Math.sqrt(variance);
  return result > 0 ? result : fallback;
}

function vectorDistance(vector, meanVector, stdVector) {
  if (!meanVector.length || vector.length !== meanVector.length) {
    return null;
  }

  const normalizedSquared = vector.map((value, index) => {
    const scale = stdVector[index] > 0 ? stdVector[index] : 1;
    return Math.pow((value - meanVector[index]) / scale, 2);
  });

  return Math.sqrt(mean(normalizedSquared));
}

function scoreFromDistance(distance, threshold) {
  if (distance === null || threshold === null || threshold <= 0) {
    return null;
  }

  return Math.max(0, Math.min(1, 1 - distance / (threshold * 2)));
}

function normalizeVector(vector, meanVector, stdVector) {
  return vector.map((value, index) => {
    const scale = stdVector[index] > 0 ? stdVector[index] : 1;
    return (value - meanVector[index]) / scale;
  });
}

function reconstructionError(inputVector, outputVector) {
  if (!inputVector.length || inputVector.length !== outputVector.length) {
    return null;
  }

  return mean(inputVector.map((value, index) => Math.pow(value - outputVector[index], 2)));
}

function arrayBufferFromBuffer(buffer) {
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }

  if (buffer && buffer.buffer instanceof ArrayBuffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function trainTensorFlowAutoencoder(vectors, profile) {
  const normalizedVectors = vectors.map((vector) =>
    normalizeVector(vector, profile.meanVector, profile.stdVector)
  );
  const inputSize = profile.featureNames.length;
  const bottleneckSize = Math.max(2, Math.min(8, Math.floor(inputSize / 3)));
  const hiddenSize = Math.max(8, Math.min(32, Math.floor(inputSize * 0.75)));

  const xs = tf.tensor2d(normalizedVectors, [normalizedVectors.length, inputSize]);
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [inputSize], units: hiddenSize, activation: "relu" }));
  model.add(tf.layers.dense({ units: bottleneckSize, activation: "relu" }));
  model.add(tf.layers.dense({ units: hiddenSize, activation: "relu" }));
  model.add(tf.layers.dense({ units: inputSize, activation: "linear" }));
  model.compile({ optimizer: tf.train.adam(0.01), loss: "meanSquaredError" });

  await model.fit(xs, xs, {
    epochs: 120,
    batchSize: Math.min(8, normalizedVectors.length),
    shuffle: true,
    verbose: 0
  });

  const prediction = model.predict(xs);
  const reconstructed = await prediction.array();
  const errors = normalizedVectors.map((vector, index) => reconstructionError(vector, reconstructed[index]));
  const reconstructionMean = mean(errors);
  const reconstructionStdDev = stdDev(errors, 0.01);
  const reconstructionThreshold = Math.max(0.05, reconstructionMean + 3 * reconstructionStdDev);
  const artifacts = await model.save(tf.io.withSaveHandler(async (modelArtifacts) => modelArtifacts));

  xs.dispose();
  prediction.dispose();
  model.dispose();

  return {
    modelTopology: artifacts.modelTopology,
    weightSpecs: artifacts.weightSpecs,
    weightData: Buffer.from(artifacts.weightData),
    featureNames: profile.featureNames,
    meanVector: profile.meanVector,
    stdVector: profile.stdVector,
    reconstructionThreshold,
    reconstructionMean,
    reconstructionStdDev,
    trainedAt: new Date()
  };
}

async function predictTensorFlowScore(modelData, vector) {
  if (!modelData || !modelData.modelTopology || !modelData.weightSpecs || !modelData.weightData) {
    return null;
  }

  const normalizedVector = normalizeVector(vector, modelData.meanVector, modelData.stdVector);
  const model = await tf.loadLayersModel(tf.io.fromMemory(
    modelData.modelTopology,
    modelData.weightSpecs,
    arrayBufferFromBuffer(modelData.weightData)
  ));
  const input = tf.tensor2d([normalizedVector], [1, normalizedVector.length]);
  const prediction = model.predict(input);
  const reconstructed = await prediction.array();
  const error = reconstructionError(normalizedVector, reconstructed[0]);
  const threshold = modelData.reconstructionThreshold;
  const score = threshold && threshold > 0
    ? Math.max(0, Math.min(1, 1 - error / (threshold * 2)))
    : null;
  const isMatch = threshold !== null && error !== null && error <= threshold;

  input.dispose();
  prediction.dispose();
  model.dispose();

  return {
    error,
    threshold,
    score,
    isMatch
  };
}

function getDigraphFeatureNames(samples, maxDigraphFeatures) {
  const counts = samples.reduce((result, sample) => {
    if (!sample.digraphs) {
      return result;
    }

    const entries = typeof sample.digraphs.entries === "function"
      ? Array.from(sample.digraphs.entries())
      : Object.entries(sample.digraphs);

    entries.forEach(([key, value]) => {
      result[key] = (result[key] || 0) + safeNumber(value && value.count ? value.count : 1);
    });

    return result;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxDigraphFeatures)
    .flatMap(([key]) => [`digraph.${key}.mean`, `digraph.${key}.stdDev`]);
}

function getStdFloor(featureName) {
  const baseIndex = BASE_FEATURE_NAMES.indexOf(featureName);
  if (baseIndex >= 0) {
    return BASE_FEATURE_STD_FLOORS[baseIndex];
  }

  if (featureName.startsWith("digraph.")) {
    return 40;
  }

  return 1;
}

function buildProfile(samples, config) {
  const featureNames = [
    ...BASE_FEATURE_NAMES,
    ...getDigraphFeatureNames(samples, config.maxDigraphFeatures)
  ];
  const vectors = samples.map((sample) => sampleToVector(sample, featureNames));
  const meanVector = featureNames.map((_, featureIndex) =>
    mean(vectors.map((vector) => vector[featureIndex]))
  );
  const stdVector = featureNames.map((featureName, featureIndex) =>
    Math.max(
      stdDev(vectors.map((vector) => vector[featureIndex])),
      getStdFloor(featureName)
    )
  );
  const distances = vectors.map((vector) => vectorDistance(vector, meanVector, stdVector));
  const avgDistance = mean(distances);
  const distanceStdDev = stdDev(distances, 0.5);
  const threshold = Math.max(1.5, avgDistance + 2 * distanceStdDev);

  return {
    version: 1,
    sampleCount: samples.length,
    featureNames,
    meanVector,
    stdVector,
    threshold,
    updatedAt: new Date()
  };
}

async function trainUserProfile(userId) {
  const config = await researchController.getGlobalConfig();
  const samples = await TrainingData.find({
    userId,
    sampleType: "enrollment",
    keyCount: { $gte: MIN_ENROLLMENT_KEY_COUNT }
  }).sort({ timestamp: 1 });

  if (config.profileFrozen || !config.profileUpdatesEnabled) {
    return {
      ready: false,
      frozen: true,
      message: "Profil jest zamrozony. Nowe probki nie aktualizuja profilu.",
      sampleCount: samples.length
    };
  }

  if (samples.length < config.minEnrollmentSamples) {
    return {
      ready: false,
      message: `Za malo danych do profilu. Wymagane minimum: ${config.minEnrollmentSamples}, obecnie: ${samples.length}.`,
      sampleCount: samples.length
    };
  }

  const typingProfile = buildProfile(samples, config);
  typingProfile.version = config.profileVersion;
  typingProfile.frozen = false;
  const vectors = samples.map((sample) => sampleToVector(sample, typingProfile.featureNames));
  const modelData = await trainTensorFlowAutoencoder(vectors, typingProfile);
  await User.findByIdAndUpdate(userId, { typingProfile, modelData }, { new: true });

  return {
    ready: true,
    message: `Profil pisania dla uzytkownika ${userId} zostal zaktualizowany.`,
    profile: typingProfile,
    tensorflow: {
      reconstructionThreshold: modelData.reconstructionThreshold,
      reconstructionMean: modelData.reconstructionMean,
      reconstructionStdDev: modelData.reconstructionStdDev
    }
  };
}

exports.trainModel = async (req, res) => {
  try {
    const result = await trainUserProfile(req.params.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || "Blad podczas budowania profilu pisania" });
  }
};

exports.getModel = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);

    if (!user || !user.typingProfile || !user.typingProfile.sampleCount) {
      return res.status(404).json({ error: "Profil pisania uzytkownika nie zostal znaleziony" });
    }

    res.status(200).json(user.typingProfile);
  } catch (error) {
    res.status(500).json({ error: "Blad podczas pobierania profilu pisania" });
  }
};

exports.verifySample = async (req, res) => {
  try {
    const { userId, sample } = req.body;

    if (!userId || !sample) {
      return res.status(400).json({ error: "Brak userId albo probki do weryfikacji" });
    }

    const [user, config] = await Promise.all([
      User.findById(userId),
      researchController.getGlobalConfig()
    ]);

    if (!user || !user.typingProfile || !user.typingProfile.sampleCount) {
      return res.status(404).json({ error: "Profil pisania uzytkownika nie zostal znaleziony" });
    }

    const profile = user.typingProfile;
    const actorType = user.researchSettings?.currentActorType || "owner";
    const featureNames = user.modelData && user.modelData.featureNames && user.modelData.featureNames.length
      ? user.modelData.featureNames
      : profile.featureNames;
    const vector = sampleToVector(sample, featureNames);
    const distance = vectorDistance(vector, profile.meanVector, profile.stdVector);
    const statisticalScore = scoreFromDistance(distance, profile.threshold);
    const statisticalMatch = distance !== null && profile.threshold !== null && distance <= profile.threshold;
    const tensorflowResult = await predictTensorFlowScore(user.modelData, vector);
    const score = tensorflowResult && tensorflowResult.score !== null ? tensorflowResult.score : statisticalScore;
    const isMatch = tensorflowResult ? tensorflowResult.isMatch : statisticalMatch;

    const verificationSample = new TrainingData({
      ...sample,
      userId,
      sampleType: "verification",
      actorType,
      profileVersion: config.profileVersion,
      profileFrozen: config.profileFrozen,
      verification: {
        score,
        distance,
        isMatch,
        tensorflowError: tensorflowResult ? tensorflowResult.error : null,
        tensorflowThreshold: tensorflowResult ? tensorflowResult.threshold : null,
        statisticalScore,
        statisticalMatch
      }
    });
    await verificationSample.save();

    res.status(200).json({
      isMatch,
      score,
      distance,
      threshold: profile.threshold,
      tensorflow: tensorflowResult,
      sampleCount: profile.sampleCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Blad podczas weryfikacji probki" });
  }
};
