require("dotenv").config();

const db = require("../app/models");
const dbConfig = require("../app/config/db.config");

const execute = process.argv.includes("--execute");
const preservedAdminUsername = "admin";

async function main() {
  await db.mongoose.connect(
    `mongodb+srv://${dbConfig.LOGIN}:${dbConfig.PASSWORD}@${dbConfig.DB}`,
    { useNewUrlParser: true, useUnifiedTopology: true }
  );

  const adminRole = await db.role.findOne({ name: "admin" });
  if (!adminRole) {
    throw new Error("Nie znaleziono roli admin. Przerwano bez wprowadzania zmian.");
  }

  const admins = await db.user.find(
    { username: preservedAdminUsername, roles: adminRole._id },
    "_id username email"
  );
  if (admins.length === 0) {
    throw new Error(`Nie znaleziono konta administratora '${preservedAdminUsername}'. Przerwano bez wprowadzania zmian.`);
  }

  const [userCount, sampleCount, noteCount] = await Promise.all([
    db.user.countDocuments({}),
    db.trainingData.countDocuments({}),
    db.note.countDocuments({})
  ]);

  const summary = {
    mode: execute ? "execute" : "dry-run",
    preservedAdmins: admins.map(({ _id, username, email }) => ({ _id, username, email })),
    usersToDelete: userCount - admins.length,
    samplesToDelete: sampleCount,
    notesToDelete: noteCount
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!execute) {
    console.log("Podgląd zakończony. Uruchom ponownie z --execute, aby wykonać czyszczenie.");
    return;
  }

  const adminIds = admins.map((admin) => admin._id);
  const [samplesResult, notesResult, usersResult] = await Promise.all([
    db.trainingData.deleteMany({}),
    db.note.deleteMany({}),
    db.user.deleteMany({ _id: { $nin: adminIds } })
  ]);
  await db.user.updateMany(
    { _id: { $in: adminIds } },
    {
      $unset: { typingProfile: "", modelData: "" },
      $set: { "researchSettings.currentActorType": "owner" }
    }
  );

  console.log(JSON.stringify({
    deletedUsers: usersResult.deletedCount,
    deletedSamples: samplesResult.deletedCount,
    deletedNotes: notesResult.deletedCount,
    preservedAdminCount: admins.length
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
