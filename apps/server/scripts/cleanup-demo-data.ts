import "dotenv/config";
import { isUnmodifiedDemoHabit, planLegacyDemoCleanup } from "@rdm-b2c/api/domain/demo-cleanup";
import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

// Load the existing MongoDB driver without importing app models, whose initialization
// can create indexes. Dry runs use raw collections and perform no database writes.
const requireFromDb = createRequire(import.meta.resolve("@rdm-b2c/db"));
const { MongoClient, BSON } = requireFromDb("mongoose").mongo;
type RawDocument = Record<string, any>;
type Candidate = { profile: RawDocument; habits: RawDocument[] };

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const recordsOnly = args.includes("--records-only");
  const backupArgument = args.find((argument) => argument.startsWith("--backup-dir="));
  if (args.some((argument) => argument !== "--apply" && argument !== "--dry-run" && argument !== "--records-only" && !argument.startsWith("--backup-dir="))
    || apply && args.includes("--dry-run") || apply && !backupArgument?.slice("--backup-dir=".length).trim()) {
    throw Object.assign(new Error(), { name: "INVALID_ARGUMENTS" });
  }
  const configuredUrl = process.env.DATABASE_URL ?? "";
  const connectionParts = configuredUrl.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/[^?]*)?(\?.*)?$/);
  if (!connectionParts?.[1]) throw Object.assign(new Error(), { name: "DATABASE_URL_REQUIRED" });
  const databaseName = "rdm-business";
  const connection = new MongoClient(`${connectionParts[1]}/${databaseName}${connectionParts[2] ?? ""}`, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  const counts = { legacyProfiles: 0, eligibleProfiles: 0, exactDemoHabits: 0, requiresReview: 0, profilesReset: 0, habitsRemoved: 0, changedSinceScan: 0 };
  let backupCreated = false;
  try {
    await connection.connect();
    const database = connection.db(databaseName);
    const profiles = database.collection("rdmprofiles");
    const habits = database.collection("habits");

    async function readAccount(profile: RawDocument, session?: unknown) {
      const userId = profile.userId;
      const options = session ? { session } : {};
      const userHabits: RawDocument[] = await habits.find({ userId }, options).toArray();
      const activityFilters = [
        ["goals", { userId }],
        ["goalgroups", { $or: [{ creatorId: userId }, { "members.userId": userId }] }],
        ["gamesessions", { userId }],
        ["gratitudeentries", { userId }],
        ["gooddeedentries", { userId }],
        ["treecareactivities", { userId }],
        ["referrals", { $or: [{ inviteeId: userId }, { inviterId: userId }] }],
      ] as const;
      // Session operations remain sequential, including when inside a transaction.
      let relatedActivityCount = 0;
      for (const [collection, filter] of activityFilters) {
        if (await database.collection(collection).findOne(filter, { ...options, projection: { _id: 1 } })) relatedActivityCount += 1;
      }
      return { profile, habits: userHabits, relatedActivityCount };
    }

    const candidates: Candidate[] = [];
    for await (const profile of profiles.find({ dataVersion: { $exists: false } })) {
      counts.legacyProfiles += 1;
      if (typeof profile.userId !== "string" || profile.userId.length === 0) {
        counts.requiresReview += 1;
        continue;
      }
      const account = await readAccount(profile);
      const plan = planLegacyDemoCleanup(account);
      counts.exactDemoHabits += plan.demoHabitCount;
      if (recordsOnly) {
        const exactHabits = account.habits.filter(isUnmodifiedDemoHabit);
        if (exactHabits.length) {
          candidates.push({ profile, habits: exactHabits });
          counts.eligibleProfiles += 1;
        }
        if (plan.action === "review") counts.requiresReview += 1;
        continue;
      }
      if (plan.action === "reset") {
        candidates.push({ profile, habits: account.habits });
        counts.eligibleProfiles += 1;
      } else if (plan.action === "review") counts.requiresReview += 1;
    }

    if (apply && candidates.length > 0) {
      const capabilities = await database.admin().command({ hello: 1 });
      if (!capabilities.setName && capabilities.msg !== "isdbgrid") {
        throw Object.assign(new Error(), { name: "TRANSACTIONS_REQUIRED" });
      }
      const backupDirectory = resolve(backupArgument!.slice("--backup-dir=".length));
      await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
      const backupPath = join(backupDirectory, `rdm-demo-${Date.now()}-${randomUUID()}.ejson`);
      const backup = await open(backupPath, "wx", 0o600);
      try {
        await backup.writeFile(BSON.EJSON.stringify({
          formatVersion: 1,
          database: databaseName,
          createdAt: new Date(),
          collections: {
            rdmprofiles: candidates.map((candidate) => candidate.profile),
            habits: candidates.flatMap((candidate) => candidate.habits),
          },
        }, { relaxed: false }));
        await backup.sync();
      } finally {
        await backup.close();
      }
      backupCreated = true;

      for (const candidate of candidates) {
        const session = connection.startSession();
        try {
          const applied = await session.withTransaction(async () => {
            const current = await profiles.findOne({ _id: candidate.profile._id }, { session });
            if (!current || BSON.EJSON.stringify(current) !== BSON.EJSON.stringify(candidate.profile)) return false;
            const account = await readAccount(current, session);
            if (!recordsOnly && planLegacyDemoCleanup(account).action !== "reset") return false;
            const selectedHabits = recordsOnly ? account.habits.filter(isUnmodifiedDemoHabit) : account.habits;
            const originalHabits = new Map(candidate.habits.map((habit) => [String(habit._id), BSON.EJSON.stringify(habit)]));
            if (selectedHabits.length !== originalHabits.size
              || selectedHabits.some((habit) => originalHabits.get(String(habit._id)) !== BSON.EJSON.stringify(habit))) return false;
            if (!recordsOnly) {
              const result = await profiles.updateOne({ _id: current._id, dataVersion: { $exists: false } }, {
              $set: {
                dataVersion: 1, xp: 0, level: 1, streak: 0, plantStage: "Seedling",
                walletBalance: 0, rewardBalance: 0, remorseBalance: 0, peerBalance: 0,
                transactions: [], unlockedBadges: [], updatedAt: new Date(),
              },
            }, { session });
              if (result.modifiedCount !== 1) throw Object.assign(new Error(), { name: "PROFILE_CHANGED" });
            }
            for (const habit of selectedHabits) {
              const deleted = await habits.deleteOne({ _id: habit._id, userId: current.userId }, { session });
              if (deleted.deletedCount !== 1) throw Object.assign(new Error(), { name: "HABIT_CHANGED" });
            }
            return true;
          });
          if (applied) {
            if (!recordsOnly) counts.profilesReset += 1;
            counts.habitsRemoved += candidate.habits.length;
          } else counts.changedSinceScan += 1;
        } finally {
          await session.endSession();
        }
      }
    }
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", recordsOnly, ...counts, backupCreated }));
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  // Do not print connection strings, account details, or driver error messages.
  console.error(JSON.stringify({ status: "failed", errorType: error instanceof Error ? error.name : "UnknownError" }));
  process.exitCode = 1;
});
