const db = require("../models");
const TrainingData = db.trainingData;
const User = db.user;
const researchController = require("./research.controller");

exports.trainingData = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(400).send({ error: "Brak userId!" });
    }

    const [config, user] = await Promise.all([
      researchController.getGlobalConfig(),
      User.findById(userId, "researchSettings")
    ]);
    if (!user) {
      return res.status(404).send({ error: "Uzytkownik nie znaleziony" });
    }
    const sampleType = "enrollment";
    const actorType = "owner";

    const enrollmentFilter = { userId, sampleType: "enrollment", profileVersion: config.profileVersion };

    const entryData = {
      ...req.body,
      userId,
      sampleType,
      actorType,
      profileVersion: config.profileVersion,
      profileFrozen: false
    };

    let newEntry;
    if (entryData.sessionId && Number.isFinite(entryData.sampleSequence)) {
      const sampleIdentity = {
        userId,
        sessionId: entryData.sessionId,
        sampleSequence: entryData.sampleSequence,
        sampleType,
        profileVersion: config.profileVersion
      };
      try {
        newEntry = await TrainingData.findOneAndUpdate(
          sampleIdentity,
          { $setOnInsert: entryData },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        if (error?.code !== 11000) {
          throw error;
        }
        newEntry = await TrainingData.findOne(sampleIdentity);
        if (!newEntry) {
          throw error;
        }
      }
    } else {
      newEntry = await new TrainingData(entryData).save();
    }

    const enrollmentCount = await TrainingData.countDocuments(enrollmentFilter);
    const target = config.targetEnrollmentSamples;
    res.status(200).send({
      message: "Dane uzytkownika zapisane do profilu pisania",
      sampleId: newEntry._id,
      enrollmentCount,
      targetEnrollmentSamples: target,
      remainingEnrollmentSamples: Math.max(target - enrollmentCount, 0),
      enrollmentProgressPercent: Math.min(Math.round((enrollmentCount / target) * 100), 100),
      extraEnrollmentSamples: Math.max(enrollmentCount - target, 0),
      targetReached: enrollmentCount >= target
    });
  } catch (error) {
    console.error("Blad zapisu probki treningowej:", {
      userId: req.userId || null,
      sessionId: req.body?.sessionId || null,
      sampleSequence: req.body?.sampleSequence ?? null,
      errorName: error?.name || null,
      errorCode: error?.code || null,
      errorMessage: error?.message || String(error),
      stack: error?.stack || null
    });
    res.status(500).send({ error: "Blad zapisu" });
  }
};
