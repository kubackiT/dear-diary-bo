const db = require("../models");
const ResearchConfig = db.researchConfig;
const TrainingData = db.trainingData;
const User = db.user;

const DEFAULT_CONFIG = {
  key: "global",
  mode: "enrollment",
  profileUpdatesEnabled: true,
  profileFrozen: false,
  minEnrollmentSamples: 10,
  sampleKeyThreshold: 1000,
  verificationKeyThreshold: 120,
  verificationStep: 60,
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
    res.status(200).json({
      mode: config.mode,
      profileFrozen: config.profileFrozen,
      minEnrollmentSamples: config.minEnrollmentSamples,
      sampleKeyThreshold: config.sampleKeyThreshold,
      verificationKeyThreshold: config.verificationKeyThreshold,
      verificationStep: config.verificationStep,
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
      "mode",
      "profileUpdatesEnabled",
      "profileFrozen",
      "minEnrollmentSamples",
      "sampleKeyThreshold",
      "verificationKeyThreshold",
      "verificationStep",
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
    Object.assign(config, update, { updatedAt: new Date() });
    await config.save();

    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ error: error.message || "Blad zapisu konfiguracji badania" });
  }
};

exports.freezeProfile = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Brak userId" });
    }

    const frozenAt = new Date();
    const config = await getGlobalConfig();
    config.profileFrozen = true;
    config.profileUpdatesEnabled = false;
    config.mode = "verification";
    config.profileVersion += 1;
    config.frozenAt = frozenAt;
    config.updatedAt = frozenAt;
    await config.save();

    const user = await User.findByIdAndUpdate(
      userId,
      {
        "typingProfile.frozen": true,
        "typingProfile.frozenAt": frozenAt,
        "typingProfile.version": config.profileVersion
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Uzytkownik nie znaleziony" });
    }

    res.status(200).json({
      message: "Profil zostal zamrozony",
      config,
      typingProfile: user.typingProfile
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Blad zamrazania profilu" });
  }
};

exports.getStats = async (req, res) => {
  try {
    const userId = req.query.userId;
    const filter = userId ? { userId } : {};
    const [config, enrollmentCount, verificationCount, lastSamples] = await Promise.all([
      getGlobalConfig(),
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
    const users = await User.find({}, "username email typingProfile researchSettings").sort({ username: 1 });
    const userIds = users.map((user) => user._id);
    const counts = await TrainingData.aggregate([
      { $match: { userId: { $in: userIds } } },
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
