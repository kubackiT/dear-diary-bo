const db = require("../models");
const ResearchConfig = db.researchConfig;
const TrainingData = db.trainingData;
const User = db.user;

const DEFAULT_CONFIG = {
  key: "global",
  mode: "enrollment",
  profileUpdatesEnabled: true,
  profileFrozen: false,
  collectionOnly: true,
  registrationEnabled: true,
  configVersion: 2,
  targetEnrollmentSamples: 100,
  validationFraction: 0.2,
  sampleKeyThreshold: 250,
  verificationKeyThreshold: 250,
  longPauseThresholdMs: 2000,
  maxDigraphFeatures: 20,
  profileVersion: 1,
  frozenAt: null
};

async function getGlobalConfig() {
  const config = await ResearchConfig.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: DEFAULT_CONFIG },
    { upsert: true, new: true }
  );

  let changed = false;
  // Migrate configurations created before the collection-only study design.
  if (!config.configVersion || config.configVersion < 2) {
    config.mode = "enrollment";
    config.profileFrozen = false;
    config.profileUpdatesEnabled = true;
    config.collectionOnly = true;
    config.targetEnrollmentSamples = 100;
    config.sampleKeyThreshold = 250;
    config.configVersion = 2;
    config.frozenAt = null;
    changed = true;
  }
  Object.entries(DEFAULT_CONFIG).forEach(([key, value]) => {
    if (config[key] === undefined) {
      config[key] = value;
      changed = true;
    }
  });

  if (changed) {
    await config.save();
  }

  return config;
}

exports.getGlobalConfig = getGlobalConfig;

exports.getConfig = async (req, res) => {
  try {
    const config = await getGlobalConfig();
    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ error: "Blad pobierania konfiguracji badania" });
  }
};

exports.getRuntimeConfig = async (req, res) => {
  try {
    const config = await getGlobalConfig();
    const enrollmentCount = await TrainingData.countDocuments({
      userId: req.userId,
      sampleType: "enrollment",
      profileVersion: config.profileVersion
    });
    const target = config.targetEnrollmentSamples;
    res.status(200).json({
      mode: "enrollment",
      profileFrozen: false,
      collectionOnly: true,
      targetEnrollmentSamples: target,
      enrollmentCount,
      remainingEnrollmentSamples: Math.max(target - enrollmentCount, 0),
      enrollmentProgressPercent: Math.min(Math.round((enrollmentCount / target) * 100), 100),
      extraEnrollmentSamples: Math.max(enrollmentCount - target, 0),
      targetReached: enrollmentCount >= target,
      validationFraction: config.validationFraction,
      sampleKeyThreshold: config.sampleKeyThreshold,
      verificationKeyThreshold: config.verificationKeyThreshold,
      longPauseThresholdMs: config.longPauseThresholdMs,
      maxDigraphFeatures: config.maxDigraphFeatures,
      profileVersion: config.profileVersion
    });
  } catch (error) {
    res.status(500).json({ error: "Blad pobierania konfiguracji runtime" });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const allowedFields = [
      "profileUpdatesEnabled",
      "registrationEnabled",
      "targetEnrollmentSamples",
      "validationFraction",
      "sampleKeyThreshold",
      "verificationKeyThreshold",
      "longPauseThresholdMs",
      "maxDigraphFeatures"
    ];
    const update = {};

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        update[field] = req.body[field];
      }
    });

    const config = await getGlobalConfig();
    if (update.targetEnrollmentSamples !== undefined &&
        (!Number.isInteger(update.targetEnrollmentSamples) || update.targetEnrollmentSamples < 2)) {
      return res.status(400).json({ error: "Docelowa liczba probek musi byc liczba calkowita >= 2" });
    }
    if (update.validationFraction !== undefined &&
        (update.validationFraction < 0.1 || update.validationFraction > 0.4)) {
      return res.status(400).json({ error: "Udzial walidacji musi miescic sie w zakresie 0.1-0.4" });
    }
    if (update.sampleKeyThreshold !== undefined &&
        (!Number.isInteger(update.sampleKeyThreshold) || update.sampleKeyThreshold < 250)) {
      return res.status(400).json({ error: "Probka enrollment musi zawierac co najmniej 250 klawiszy" });
    }
    Object.assign(config, update, { updatedAt: new Date() });
    await config.save();

    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ error: error.message || "Blad zapisu konfiguracji badania" });
  }
};

async function freezeProfileForUser(userId) {
  const config = await getGlobalConfig();
  if (config.collectionOnly) {
    throw new Error("Badanie dziala w trybie wylacznego zbierania danych");
  }
  const user = await User.findById(userId);
  if (!user) throw new Error("Uzytkownik nie znaleziony");
  if (!user.modelData?.modelTopology || user.modelData.profileVersion !== config.profileVersion) {
    throw new Error("Brak modelu wytrenowanego dla biezacej rundy");
  }
  const frozenAt = new Date();
  config.profileFrozen = true;
  config.profileUpdatesEnabled = false;
  config.mode = "verification";
  config.frozenAt = frozenAt;
  config.updatedAt = frozenAt;
  await config.save();
  user.typingProfile.frozen = true;
  user.typingProfile.frozenAt = frozenAt;
  user.typingProfile.version = config.profileVersion;
  await user.save();
  return { config, user };
}

exports.freezeProfileForUser = freezeProfileForUser;

exports.freezeProfile = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Brak userId" });
    }

    const { config, user } = await freezeProfileForUser(userId);

    res.status(200).json({
      message: "Profil zostal zamrozony",
      config,
      typingProfile: user.typingProfile
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Blad zamrazania profilu" });
  }
};

exports.startEnrollment = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Brak userId" });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Uzytkownik nie znaleziony" });
    const config = await getGlobalConfig();
    config.mode = "enrollment";
    config.profileFrozen = false;
    config.profileUpdatesEnabled = true;
    config.profileVersion += 1;
    config.frozenAt = null;
    config.updatedAt = new Date();
    await config.save();
    user.typingProfile = undefined;
    user.modelData = undefined;
    await user.save();
    res.status(200).json({ message: "Rozpoczeto nowa runde enrollment", config });
  } catch (error) {
    res.status(500).json({ error: error.message || "Blad rozpoczynania rundy" });
  }
};

exports.getStats = async (req, res) => {
  try {
    const userId = req.query.userId;
    const config = await getGlobalConfig();
    const filter = { ...(userId ? { userId } : {}), profileVersion: config.profileVersion };
    const [enrollmentCount, verificationCount, lastSamples] = await Promise.all([
      TrainingData.countDocuments({ ...filter, sampleType: "enrollment" }),
      TrainingData.countDocuments({ ...filter, sampleType: "verification" }),
      TrainingData.find(filter).sort({ timestamp: -1 }).limit(10)
    ]);

    res.status(200).json({
      config,
      enrollmentCount,
      verificationCount,
      lastSamples
    });
  } catch (error) {
    res.status(500).json({ error: "Blad pobierania statystyk badania" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const config = await getGlobalConfig();
    const users = await User.find({}, "username email typingProfile researchSettings").sort({ username: 1 });
    const userIds = users.map((user) => user._id);
    const counts = await TrainingData.aggregate([
      { $match: { userId: { $in: userIds }, profileVersion: config.profileVersion } },
      {
        $group: {
          _id: {
            userId: "$userId",
            sampleType: "$sampleType"
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const countMap = counts.reduce((map, item) => {
      const userId = item._id.userId.toString();
      if (!map[userId]) {
        map[userId] = { enrollmentCount: 0, verificationCount: 0 };
      }

      if (item._id.sampleType === "enrollment") {
        map[userId].enrollmentCount = item.count;
      }

      if (item._id.sampleType === "verification") {
        map[userId].verificationCount = item.count;
      }

      return map;
    }, {});

    res.status(200).json(users.map((user) => {
      const userCounts = countMap[user._id.toString()] || {
        enrollmentCount: 0,
        verificationCount: 0
      };

      return {
        id: user._id,
        username: user.username,
        email: user.email,
        typingProfile: user.typingProfile,
        researchSettings: {
          currentActorType: user.researchSettings?.currentActorType || "owner"
        },
        enrollmentCount: userCounts.enrollmentCount,
        verificationCount: userCounts.verificationCount
      };
    }));
  } catch (error) {
    res.status(500).json({ error: "Blad pobierania uzytkownikow badania" });
  }
};

exports.updateUserResearchSettings = async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentActorType } = req.body;

    if (!["owner", "impostor"].includes(currentActorType)) {
      return res.status(400).json({ error: "Nieprawidlowy actorType" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { "researchSettings.currentActorType": currentActorType },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Uzytkownik nie znaleziony" });
    }

    res.status(200).json({
      id: user._id,
      username: user.username,
      email: user.email,
      researchSettings: {
        currentActorType: user.researchSettings?.currentActorType || "owner"
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Blad zapisu ustawien uzytkownika" });
  }
};
