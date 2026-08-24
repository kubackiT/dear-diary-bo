const db = require("../models");
const TrainingData = db.trainingData;
const User = db.user;
const researchController = require("./research.controller");

exports.trainingData = async (req, res) => {
  try {
    const { userId } = req.body;

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

    const newEntry = new TrainingData({
      ...req.body,
      sampleType,
      actorType,
      profileVersion: config.profileVersion,
      profileFrozen: false
    });
    await newEntry.save();

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
    res.status(500).send({ error: "Blad zapisu" });
  }
};
