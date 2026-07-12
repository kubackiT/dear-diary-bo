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
    const sampleType = config.mode === "enrollment" && config.profileUpdatesEnabled && !config.profileFrozen
      ? "enrollment"
      : "verification";
    const actorType = sampleType === "verification"
      ? user?.researchSettings?.currentActorType || "owner"
      : "owner";

    const newEntry = new TrainingData({
      ...req.body,
      sampleType,
      actorType,
      profileVersion: config.profileVersion,
      profileFrozen: config.profileFrozen
    });
    await newEntry.save();

    res.status(200).send({
      message: "Dane uzytkownika zapisane do profilu pisania",
      sampleId: newEntry._id
    });
  } catch (error) {
    res.status(500).send({ error: "Blad zapisu" });
  }
};
