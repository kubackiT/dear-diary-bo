require("dotenv").config();

const db = require("../app/models");
const dbConfig = require("../app/config/db.config");

const SAFE_BASE_FEATURES = [
  "dwell.mean", "dwell.median", "dwell.stdDev",
  "flight.mean", "flight.median", "flight.stdDev",
  "pause.mean", "pause.median", "pause.stdDev",
  "burst.mean", "burst.median", "burst.stdDev",
  "correctionRate", "longPauseRate",
  "keysPerMinute", "charsPerMinute", "wordsPerMinute"
];

const COLLECTOR_V2_FEATURES = [
  "releasePress.mean", "releasePress.median", "releasePress.stdDev",
  "releaseRelease.mean", "releaseRelease.median", "releaseRelease.stdDev",
  "overlapRate"
];

const STD_FLOORS = {
  "dwell.mean": 15, "dwell.median": 15, "dwell.stdDev": 10,
  "flight.mean": 50, "flight.median": 50, "flight.stdDev": 100,
  "releasePress.mean": 50, "releasePress.median": 50, "releasePress.stdDev": 100,
  "releaseRelease.mean": 50, "releaseRelease.median": 50, "releaseRelease.stdDev": 100,
  "pause.mean": 500, "pause.median": 500, "pause.stdDev": 500,
  "burst.mean": 2, "burst.median": 2, "burst.stdDev": 1,
  correctionRate: 0.03, overlapRate: 0.03, longPauseRate: 0.02,
  keysPerMinute: 25, charsPerMinute: 25, wordsPerMinute: 10
};

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => Math.pow(value - average, 2))));
}

function quantile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function digraphEntries(sample) {
  if (!sample.digraphs) return [];
  return typeof sample.digraphs.entries === "function"
    ? Array.from(sample.digraphs.entries())
    : Object.entries(sample.digraphs);
}

function selectDigraphs(trainingSamples, limit) {
  const stats = new Map();
  trainingSamples.forEach((sample) => {
    digraphEntries(sample).forEach(([key, value]) => {
      const current = stats.get(key) || { sampleCount: 0, eventCount: 0 };
      current.sampleCount += 1;
      current.eventCount += Number(value?.count) || 0;
      stats.set(key, current);
    });
  });

  const minimumCoverage = Math.ceil(trainingSamples.length / 2);
  return [...stats.entries()]
    .filter(([, value]) => value.sampleCount >= minimumCoverage)
    .sort((a, b) => b[1].eventCount - a[1].eventCount)
    .slice(0, limit)
    .map(([key]) => key);
}

function digraphMetric(sample, key, field) {
  const value = typeof sample.digraphs?.get === "function"
    ? sample.digraphs.get(key)
    : sample.digraphs?.[key];
  return Number.isFinite(value?.[field]) ? value[field] : 0;
}

function featureValue(sample, featureName) {
  const durationMinutes = sample.durationMs > 0 ? sample.durationMs / 60000 : 0;
  if (featureName.startsWith("digraph.")) {
    const [, key, field] = featureName.split(".");
    return digraphMetric(sample, key, field);
  }
  const metric = featureName.match(/^(dwell|flight|releasePress|releaseRelease|pause|burst)\.(mean|median|stdDev)$/);
  if (metric) return Number(sample[metric[1]]?.[metric[2]]) || 0;
  const scalars = {
    correctionRate: sample.keyCount ? sample.correctionCount / sample.keyCount : 0,
    overlapRate: sample.keyCount ? sample.overlapCount / sample.keyCount : 0,
    longPauseRate: sample.keyCount ? sample.longPauseCount / sample.keyCount : 0,
    keysPerMinute: durationMinutes ? sample.keyCount / durationMinutes : 0,
    charsPerMinute: durationMinutes ? sample.textLength / durationMinutes : 0,
    wordsPerMinute: durationMinutes ? sample.wordCount / durationMinutes : 0
  };
  return Number(scalars[featureName]) || 0;
}

function vector(sample, featureNames) {
  return featureNames.map((name) => featureValue(sample, name));
}

function distance(input, center, scales) {
  return Math.sqrt(mean(input.map((value, index) =>
    Math.pow((value - center[index]) / scales[index], 2)
  )));
}

async function main() {
  const username = argument("username", "admin");
  const requestedTrain = Number(argument("train", 12));
  const requestedValidation = Number(argument("validation", 4));
  const requestedTest = Number(argument("test", 4));
  const digraphLimit = Number(argument("digraphs", 10));

  await db.mongoose.connect(
    `mongodb+srv://${dbConfig.LOGIN}:${dbConfig.PASSWORD}@${dbConfig.DB}`,
    { useNewUrlParser: true, useUnifiedTopology: true }
  );

  const user = await db.user.findOne({ username });
  if (!user) throw new Error(`Nie znaleziono użytkownika '${username}'.`);

  const samples = await db.trainingData.find({
    userId: user._id,
    sampleType: "enrollment",
    keyCount: { $gte: 250 }
  }).sort({ timestamp: 1 }).lean();

  const required = requestedTrain + requestedValidation + requestedTest;
  if (samples.length < required) {
    throw new Error(`Za mało próbek: wymagane ${required}, dostępne ${samples.length}.`);
  }

  const selected = samples.slice(0, required);
  const training = selected.slice(0, requestedTrain);
  const validation = selected.slice(requestedTrain, requestedTrain + requestedValidation);
  const test = selected.slice(requestedTrain + requestedValidation);
  const digraphs = selectDigraphs(training, digraphLimit);
  const hasOnlyCollectorV2Samples = selected.every((sample) => sample.collectorVersion >= 2);
  const featureNames = [
    ...SAFE_BASE_FEATURES,
    ...(hasOnlyCollectorV2Samples ? COLLECTOR_V2_FEATURES : []),
    ...digraphs.flatMap((key) => [`digraph.${key}.mean`, `digraph.${key}.stdDev`])
  ];
  const trainingVectors = training.map((sample) => vector(sample, featureNames));
  const center = featureNames.map((_, index) => mean(trainingVectors.map((item) => item[index])));
  const scales = featureNames.map((name, index) => Math.max(
    stdDev(trainingVectors.map((item) => item[index])),
    name.startsWith("digraph.") ? 40 : STD_FLOORS[name] || 1
  ));
  const validationDistances = validation.map((sample) => distance(vector(sample, featureNames), center, scales));
  const threshold = Math.max(1.5, quantile(validationDistances, 0.95));
  const testResults = test.map((sample, index) => {
    const sampleDistance = distance(vector(sample, featureNames), center, scales);
    return {
      sample: requestedTrain + requestedValidation + index + 1,
      timestamp: sample.timestamp,
      distance: Number(sampleDistance.toFixed(4)),
      accepted: sampleDistance <= threshold
    };
  });
  const rejected = testResults.filter((result) => !result.accepted).length;

  console.log(JSON.stringify({
    username,
    warning: "To test właściciela z jednej sesji, a nie pełna ocena dokładności biometrycznej.",
    split: { training: training.length, validation: validation.length, test: test.length },
    collectorVersions: [...new Set(selected.map((sample) => sample.collectorVersion || 1))],
    excludedHistoricalFeatures: hasOnlyCollectorV2Samples
      ? []
      : ["releasePress", "releaseRelease", "overlapRate"],
    featureCount: featureNames.length,
    selectedDigraphs: digraphs,
    validationDistances: validationDistances.map((value) => Number(value.toFixed(4))),
    threshold: Number(threshold.toFixed(4)),
    testResults,
    genuineAccepted: testResults.length - rejected,
    genuineRejected: rejected,
    falseRejectionRate: Number((rejected / testResults.length).toFixed(4)),
    falseRejectionRatePercent: `${((rejected / testResults.length) * 100).toFixed(1)}%`,
    accuracy: null,
    accuracyReason: "Brak próbek innych użytkowników, więc nie można policzyć FAR ani accuracy."
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.mongoose.disconnect();
  });
