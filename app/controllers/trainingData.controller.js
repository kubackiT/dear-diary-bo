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
      User.findById(userId, "researchSettings typingProfile modelData")
    ]);
    if (!user) {
      return res.status(404).send({ error: "Uzytkownik nie znaleziony" });
    }
    const hasFrozenProfile = !!(
      user.typingProfile?.frozen &&
      user.typingProfile?.sampleCount &&
      user.modelData?.modelTopology
    );
    const sampleType = hasFrozenProfile ? "verification" : "enrollment";
    const actorType = sampleType === "verification"
      ? user?.researchSettings?.currentActorType || "owner"
      : "owner";

    const enrollmentFilter = { userId, sampleType: "enrollment", profileVersion: config.profileVersion };
    if (sampleType === "enrollment") {
      const currentCount = await TrainingData.countDocuments(enrollmentFilter);
      if (currentCount >= config.targetEnrollmentSamples) {
        return res.status(409).send({
          error: "Osiagnieto docelowa liczbe probek enrollment",
          enrollmentCount: currentCount,
          targetEnrollmentSamples: config.targetEnrollmentSamples,
          targetReached: true
        });
      }
    }

    const newEntry = new TrainingData({
      ...req.body,
      sampleType,
      actorType,
      profileVersion: config.profileVersion,
      profileFrozen: hasFrozenProfile
    });
    await newEntry.save();

    const enrollmentCount = sampleType === "enrollment"
      ? await TrainingData.countDocuments(enrollmentFilter)
      : undefined;
    res.status(200).send({
      message: "Dane uzytkownika zapisane do profilu pisania",
      sampleId: newEntry._id,
      enrollmentCount,
      targetEnrollmentSamples: config.targetEnrollmentSamples,
      targetReached: sampleType === "enrollment" && enrollmentCount >= config.targetEnrollmentSamples
    });
  } catch (error) {
    res.status(500).send({ error: "Blad zapisu" });
  }
};
