import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { verifySavedLeaderboard } from "./leaderboard-assertions";
import { verifyCareRecovery } from "./care-recovery-assertions";
import { medaaRegressionCases } from "./medaa-journey-assertions";
import { signupAirdropCases } from "./signup-airdrop-assertions";
import { dailyGoalCases } from "./daily-goal-assertions";
import { wisdomCases } from "./wisdom-assertions";
import { treeReadCases } from "./tree-read-assertions";

let mongo: ChildProcess | undefined;
let temporaryDirectory: string;
let db: typeof import("@rdm-b2c/db");
let appRouter: typeof import("../routers/index")["appRouter"];
let reconcileDueGroupGoalsBatch: typeof import("../routers/rdm")["reconcileDueGroupGoalsBatch"];
let auth: typeof import("@rdm-b2c/auth")["auth"];

before(async () => {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  temporaryDirectory = await mkdtemp(join(tmpdir(), "rdm-persistence-test-"));
  mongo = spawn(process.env.RDM_TEST_MONGOD ?? "mongod", [
    "--dbpath", temporaryDirectory, "--port", String(port), "--bind_ip", "127.0.0.1", "--nounixsocket", "--quiet",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let startupError = "";
  mongo.on("error", (error) => { startupError = error.message; });
  mongo.stderr?.on("data", (chunk) => { startupError = String(chunk).slice(-1500); });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (startupError || mongo.exitCode !== null) throw new Error(`Test MongoDB could not start: ${startupError}`);
    ready = await new Promise<boolean>((resolve) => {
      const socket = connect(port, "127.0.0.1");
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => { socket.destroy(); resolve(false); });
    });
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, "Isolated test MongoDB must be ready");
  // These values always override app .env files; tests never connect to an existing database.
  process.env.DATABASE_URL = `mongodb://127.0.0.1:${port}/rdm-business`;
  process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID();
  process.env.BETTER_AUTH_URL = "http://127.0.0.1:43991";
  process.env.CORS_ORIGIN = "http://127.0.0.1:43992";
  process.env.NODE_ENV = "test";
  process.env.OPENAI_API_KEY = "";
  process.env.MEDAA_DAILY_REQUEST_LIMIT = "30";
  db = await import("@rdm-b2c/db");
  ({ appRouter } = await import("../routers/index"));
  ({ reconcileDueGroupGoalsBatch } = await import("../routers/rdm"));
  ({ auth } = await import("@rdm-b2c/auth"));
  await Promise.all([db.RdmProfile, db.Habit, db.Goal, db.TreeCareActivity, db.GratitudeEntry,
    db.GoodDeedEntry, db.GoalGroup, db.GameSession, db.Referral, db.MedaaConversation, db.MedaaUsage].map((model) => model.init()));
}, { timeout: 30_000 });

after(async () => {
  await db?.RdmProfile.db.close();
  if (mongo && mongo.exitCode === null) {
    const exited = new Promise<void>((resolve) => mongo!.once("exit", () => resolve()));
    mongo.kill("SIGTERM");
    await exited;
  }
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

function caller(userId: string) {
  const now = new Date();
  return appRouter.createCaller({ auth: null, session: {
    user: { id: userId, email: `${userId}@example.test`, name: "Persistence Tester", emailVerified: false, createdAt: now, updatedAt: now },
    session: { id: randomUUID(), token: randomUUID(), userId, expiresAt: new Date(Date.now() + 86_400_000), createdAt: now, updatedAt: now },
  } });
}

const today = () => new Date().toISOString().slice(0, 10);
const dayAfter = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

for (const regression of medaaRegressionCases) {
  test(regression.name, async () => regression.run({ db, caller }));
}

for (const regression of dailyGoalCases) {
  test(regression.name, async () => regression.run({ db, caller }));
}

for (const regression of wisdomCases) {
  test(regression.name, async () => regression.run({ db, caller }));
}

for (const regression of treeReadCases) {
  test(regression.name, async () => regression.run({ db, caller }));
}

for (const regression of signupAirdropCases) {
  test(regression.name, async () => regression.run({ db, auth, caller }));
}

test("leaderboards use persistent accounts, real XP, and actual social relationships", async () => {
  await verifySavedLeaderboard({ db, auth, appRouter });
});

test("interrupted water and sunlight completion recover tree care with no new reward", async () => {
  await verifyCareRecovery({ db, caller });
});

test("unconfigured external rewards cannot consume wallet balances", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 100, rewardBalance: 60, remorseBalance: 20 });
  const api = caller(id);
  const beforeWallet = await api.rdm.wallet.summary();
  await assert.rejects(() => api.rdm.wallet.donate({ charity: "Plant a Tree Trust", amount: 5 }), /not available/iu);
  await assert.rejects(() => api.rdm.wallet.redeem({ rewardId: "focus-garden" }), /not available/iu);
  const afterWallet = await api.rdm.wallet.summary();
  assert.deepEqual(afterWallet.wallet, beforeWallet.wallet);
  assert.deepEqual(afterWallet.transactions, beforeWallet.transactions);
});

test("a newly registered account receives one 500 RDM Base airdrop while other progress starts empty", async () => {
  const created = await auth.api.signUpEmail({ body: {
    email: `register-${randomUUID()}@example.test`, password: randomUUID(), name: "Real Registration Test",
  } });
  const api = caller(created.user.id);
  const state = await api.rdm.dashboard();
  assert.deepEqual(state.profile.wallet, { balance: 500, base: 500, reward: 0, remorse: 0, peer: 0 });
  assert.equal(state.profile.xp, 0);
  assert.equal(state.profile.level, 1);
  assert.equal(state.profile.streak, 0);
  assert.deepEqual(state.habits, []);
  assert.equal(state.profile.transactions.length, 1);
  assert.equal(state.profile.transactions[0]?.amount, 500);
  assert.equal(state.profile.transactions[0]?.kind, "airdrop");
  assert.deepEqual(state.profile.unlockedBadges, []);
  assert.deepEqual(await api.rdm.goals.list(), []);
  const reload = await caller(created.user.id).rdm.wallet.summary();
  assert.deepEqual(reload.wallet, state.profile.wallet);
});

test("a funded personal goal persists progress, completes once, and releases exactly its pledge", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 100 });
  const api = caller(id);
  const goal = await api.rdm.goals.create({ creationId: randomUUID(), title: "Read a real book", category: "Focus", target: "Finish one book", durationDays: 5, startDayKey: today(), timeZone: "UTC", pledgeAmount: 50 });
  assert.equal((await api.rdm.wallet.summary()).wallet.base, 50);
  const progress = await api.rdm.goals.update({ id: goal.id, requestId: randomUUID(), expectedVersion: goal.progressVersion, action: "progress", progress: 40, note: "Read the first chapters" });
  const reloaded = await caller(id).rdm.goals.byId({ id: goal.id });
  assert.equal(reloaded.progress, 40);
  const command = { id: goal.id, requestId: randomUUID(), expectedVersion: progress.progressVersion, action: "complete" as const, note: "Finished the book" };
  await Promise.all([api.rdm.goals.update(command), api.rdm.goals.update(command)]);
  await api.rdm.goals.update(command);
  const wallet = await api.rdm.wallet.summary();
  assert.deepEqual(wallet.wallet, { balance: 100, base: 50, reward: 50, remorse: 0, peer: 0 });
  assert.equal((await api.rdm.goals.byId({ id: goal.id })).status, "completed");
  assert.equal((await api.rdm.goals.list()).length, 1);
  await assert.rejects(() => caller(randomUUID()).rdm.goals.byId({ id: goal.id }));
});

test("expired goals settle into Remorse on wallet catch-up and remain in history", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 100 });
  const api = caller(id);
  const goal = await api.rdm.goals.create({ creationId: randomUUID(), title: "Timed goal", category: "Health", target: "Complete the target", durationDays: 2, startDayKey: today(), timeZone: "UTC", pledgeAmount: 30 });
  await db.Goal.updateOne({ _id: goal.id }, { $set: { startDayKey: dayAfter(-3), endDayKey: dayAfter(-1) } });
  assert.equal((await api.rdm.wallet.summary()).wallet.remorse, 30);
  assert.equal((await api.rdm.wallet.summary()).wallet.remorse, 30);
  assert.equal((await api.rdm.goals.byId({ id: goal.id })).status, "missed");
});

test("Base alone can create a tree, and empty Reward cannot block a missed-day recovery", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 20 });
  const api = caller(id);
  await api.rdm.tree.pledge({ amount: 10, timeZone: "UTC" });
  await db.RdmProfile.updateOne({ userId: id }, { $set: { treePledgedAt: new Date(Date.now() - 2 * 86_400_000), treeLastEvaluatedDayKey: dayAfter(-2) } });
  const tree = await api.rdm.tree.overview({ timeZone: "UTC" });
  assert.equal(tree.missedDay?.transferredAmount, 0);
  assert.equal(tree.profile.wallet.base, 10);
  await api.rdm.tree.acknowledgeMissedDay({ dayKey: tree.missedDay!.dayKey });
  assert.equal((await api.rdm.tree.overview({ timeZone: "UTC" })).missedDay, null);
  await api.rdm.dashboard();
});

test("water and sunlight rewards, journals, and tree growth persist without double credits", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 20 });
  const api = caller(id);
  await api.rdm.tree.pledge({ amount: 10, timeZone: "UTC" });
  const water = { category: "life" as const, body: "Grateful for a peaceful morning.", timeZone: "UTC" };
  await Promise.all([api.rdm.gratitude.save(water), api.rdm.gratitude.save(water)]);
  const saved = await caller(id).rdm.gratitude.byCategory({ category: "life", timeZone: "UTC" });
  assert.equal(saved.todayEntry?.body, water.body);
  const tree = await caller(id).rdm.tree.overview({ timeZone: "UTC" });
  assert.equal(tree.profile.tree.waterCount, 1);
  assert.equal(tree.profile.tree.growth.points, 1);
  assert.equal(tree.profile.streak, 1);
  assert.equal(tree.profile.wallet.reward, 15);
  await api.rdm.gratitude.save({ ...water, timeZone: "Pacific/Kiritimati" });
  await api.rdm.gratitude.save({ ...water, timeZone: "Etc/GMT+12" });
  assert.equal((await api.rdm.wallet.summary()).wallet.reward, 15, "Changing device time zones cannot claim another reward for the same tree day");
  const deeds = await api.rdm.goodDeeds.today({ timeZone: "UTC" });
  const deed = deeds.deeds[0]!;
  await api.rdm.goodDeeds.submit({ deedIds: [deed.id], timeZone: "UTC" });
  await api.rdm.goodDeeds.submit({ deedIds: [deed.id], timeZone: "UTC" });
  const after = await caller(id).rdm.tree.overview({ timeZone: "UTC" });
  assert.equal(after.profile.tree.sunlightCount, 1);
  assert.equal(after.profile.tree.growth.points, 2);
  assert.equal(after.profile.wallet.reward, 15 + deed.reward);
});

function testHabitInput(overrides: Partial<Parameters<ReturnType<typeof caller>["rdm"]["habits"]["create"]>[0]> = {}) {
  return {
    creationId: randomUUID(), title: "Read ten pages", category: "Focus" as const,
    cadence: "Daily", target: "Read ten pages", pledge: "I will read ten pages on each scheduled day.",
    rdmPledgePerDay: 10, rdmPledgeStartDayKey: today(), rdmPledgeEndDayKey: dayAfter(2),
    timeZone: "UTC", source: "custom" as const, ...overrides,
  };
}

function testGroupInput(overrides: Partial<Parameters<ReturnType<typeof caller>["rdm"]["groups"]["create"]>[0]> = {}) {
  return {
    creationId: randomUUID(), category: "Friends" as const, activityId: "custom", name: "Reading together",
    description: "Complete one hundred pages together", target: 100, unit: "pages", durationDays: 7,
    startDayKey: today(), timeZone: "UTC", cadence: "daily" as const,
    pledgeBasis: "per_activity" as const, pledgePerUnit: 10, expectedActivities: 1,
    rewardStructure: "top_3" as const, ...overrides,
  };
}

test("an unfunded failed join cannot block the funded group's award pool", async () => {
  const creatorId = randomUUID();
  const failedMemberId = randomUUID();
  await db.RdmProfile.create({ userId: creatorId, walletBalance: 100 });
  const creator = caller(creatorId);
  const failedMember = caller(failedMemberId);
  const group = await creator.rdm.groups.create(testGroupInput({ rewardStructure: "winner_takes_all", target: 10 }));
  await assert.rejects(() => failedMember.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 }));
  await assert.rejects(() => failedMember.rdm.groups.detail({ id: group.id }), { code: "NOT_FOUND" });
  await creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 10 });
  const preview = await creator.rdm.groups.awardPreview({ id: group.id });
  assert.equal(preview.group.members.length, 1);
  assert.deepEqual(preview.amounts, [10]);
  await creator.rdm.groups.award({ id: group.id });
  assert.equal((await creator.rdm.wallet.summary()).wallet.peer, 10);
  assert.equal((await failedMember.rdm.wallet.summary()).wallet.balance, 0);
});

test("failed join funding releases the reserved member slot immediately", async () => {
  const creatorId = randomUUID();
  const fundedMemberId = randomUUID();
  await Promise.all([
    db.RdmProfile.create({ userId: creatorId, walletBalance: 100 }),
    db.RdmProfile.create({ userId: fundedMemberId, walletBalance: 100 }),
  ]);
  const creator = caller(creatorId);
  const group = await creator.rdm.groups.create(testGroupInput({ rewardStructure: "winner_takes_all" }));

  for (let index = 0; index < 49; index += 1) {
    const unfundedMember = caller(randomUUID());
    await assert.rejects(() => unfundedMember.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 }));
  }

  const joined = await caller(fundedMemberId).rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  assert.equal(joined.members.length, 2);
  assert.equal(joined.rewardPool, 20);
});

test("a pending member cannot read member-only group details", async () => {
  const creatorId = randomUUID();
  const pendingMemberId = randomUUID();
  await db.RdmProfile.create({ userId: creatorId, walletBalance: 100 });
  const creator = caller(creatorId);
  const group = await creator.rdm.groups.create(testGroupInput({ rewardStructure: "winner_takes_all" }));
  await db.GoalGroup.updateOne({ _id: group.id }, {
    $push: {
      members: {
        userId: pendingMemberId,
        name: "Pending member",
        initials: "PM",
        contribution: 0,
        pledgeAmount: 10,
        pledgeOperationId: `group-stake:${group.id}:${pendingMemberId}`,
        fundingStatus: "pending",
        award: 0,
      },
    },
  });

  await assert.rejects(() => caller(pendingMemberId).rdm.groups.detail({ id: group.id }), { code: "NOT_FOUND" });
});

test("invite preview reports when an active group has reached member capacity", async () => {
  const creatorId = randomUUID();
  await db.RdmProfile.create({ userId: creatorId, walletBalance: 100 });
  const creator = caller(creatorId);
  const group = await creator.rdm.groups.create(testGroupInput({ rewardStructure: "winner_takes_all" }));
  await db.GoalGroup.updateOne({ _id: group.id }, {
    $push: {
      members: {
        $each: Array.from({ length: 49 }, (_, index) => ({
          userId: randomUUID(),
          name: `Capacity member ${index + 1}`,
          initials: "CM",
          contribution: 0,
          pledgeAmount: 10,
          pledgeOperationId: `capacity-member-${index + 1}`,
          fundingStatus: "funded",
          award: 0,
        })),
      },
    },
  });

  await assert.rejects(
    () => caller(randomUUID()).rdm.groups.preview({ inviteCode: group.inviteCode }),
    { code: "CONFLICT", message: "This group already has 50 members" },
  );
});

test("stale unbacked join reservations are removed before capacity is checked", async () => {
  const creatorId = randomUUID();
  const fundedMemberId = randomUUID();
  await Promise.all([
    db.RdmProfile.create({ userId: creatorId, walletBalance: 100 }),
    db.RdmProfile.create({ userId: fundedMemberId, walletBalance: 100 }),
  ]);
  const creator = caller(creatorId);
  const group = await creator.rdm.groups.create(testGroupInput({ rewardStructure: "winner_takes_all" }));
  await db.GoalGroup.updateOne({ _id: group.id }, {
    $push: {
      members: {
        $each: Array.from({ length: 49 }, (_, index) => ({
          userId: randomUUID(),
          name: `Interrupted member ${index + 1}`,
          initials: "IM",
          contribution: 0,
          pledgeAmount: 10,
          pledgeOperationId: `interrupted-member-${index + 1}`,
          fundingStatus: "pending",
          joinedAt: new Date(Date.now() - 10 * 60_000),
          award: 0,
        })),
      },
    },
  });

  const preview = await caller(fundedMemberId).rdm.groups.preview({ inviteCode: group.inviteCode });
  assert.equal(preview.group.members.length, 1);
  const joined = await caller(fundedMemberId).rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  assert.equal(joined.members.length, 2);
});

test("a debit arriving after stale reservation cleanup is refunded while the group remains open", async () => {
  const creatorId = randomUUID();
  const interruptedMemberId = randomUUID();
  await Promise.all([
    db.RdmProfile.create({ userId: creatorId, walletBalance: 100 }),
    db.RdmProfile.create({ userId: interruptedMemberId, walletBalance: 100 }),
  ]);
  const creator = caller(creatorId);
  const group = await creator.rdm.groups.create(testGroupInput({ rewardStructure: "winner_takes_all" }));
  const operationId = `group-stake:${group.id}:${interruptedMemberId}`;
  await db.GoalGroup.updateOne({ _id: group.id }, {
    $push: {
      members: {
        userId: interruptedMemberId,
        name: "Interrupted member",
        initials: "IM",
        contribution: 0,
        pledgeAmount: 10,
        pledgeOperationId: operationId,
        fundingStatus: "pending",
        joinedAt: new Date(Date.now() - 10 * 60_000),
        award: 0,
      },
    },
  });
  await caller(randomUUID()).rdm.groups.preview({ inviteCode: group.inviteCode });
  await db.RdmProfile.updateOne({ userId: interruptedMemberId }, {
    $set: { walletBalance: 90 },
    $addToSet: { creditedOperations: operationId },
    $push: { transactions: { title: "Group pledge locked — Reading together", kind: "stake", amount: -10, operationId, createdAt: new Date() } },
  });

  assert.equal((await caller(interruptedMemberId).rdm.wallet.summary()).wallet.base, 100);
  const profile = await db.RdmProfile.findOne({ userId: interruptedMemberId });
  assert.ok(profile?.creditedOperations.includes(`group-refund:${group.id}:${interruptedMemberId}`));
  assert.equal((await creator.rdm.groups.detail({ id: group.id })).status, "active");
});

test("a late join debit after pending-slot cleanup is refunded from its receipt exactly once", async () => {
  const creatorId = randomUUID();
  const lateMemberId = randomUUID();
  await db.RdmProfile.create({ userId: creatorId, walletBalance: 100 });
  const creator = caller(creatorId);
  const lateMember = caller(lateMemberId);
  const group = await creator.rdm.groups.create(testGroupInput({ rewardStructure: "winner_takes_all", target: 10 }));
  await assert.rejects(() => lateMember.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 }));
  await creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 10 });
  await creator.rdm.groups.awardPreview({ id: group.id });
  const operationId = `group-stake:${group.id}:${lateMemberId}`;
  // Model an already-authorized in-flight debit committing after slot cleanup,
  // followed by its request handler exiting before compensating the debit.
  await db.RdmProfile.updateOne({ userId: lateMemberId }, {
    $set: { walletBalance: 90 },
    $addToSet: { creditedOperations: operationId },
    $push: { transactions: { title: "Group pledge locked — Reading together", kind: "stake", amount: -10, operationId, createdAt: new Date() } },
  });
  await Promise.all([lateMember.rdm.wallet.summary(), lateMember.rdm.wallet.summary()]);
  assert.equal((await lateMember.rdm.wallet.summary()).wallet.base, 100);
  const profile = await db.RdmProfile.findOne({ userId: lateMemberId });
  assert.ok(profile?.creditedOperations.includes(operationId));
  assert.ok(profile?.creditedOperations.includes(`group-refund:${group.id}:${lateMemberId}`));
  assert.equal(profile?.transactions.filter((entry: any) => entry.operationId === `group-refund:${group.id}:${lateMemberId}`).length, 1);
  const result = await creator.rdm.groups.award({ id: group.id });
  assert.equal(result.group.rewardPool, 10);
  assert.equal(result.group.members.length, 1);
  assert.equal((await lateMember.rdm.wallet.summary()).wallet.base, 100);
});

test("racing a join against the final contribution preserves the exact backed pool", async () => {
  const creatorId = randomUUID();
  const joiningId = randomUUID();
  await Promise.all([creatorId, joiningId].map((userId) => db.RdmProfile.create({ userId, walletBalance: 100 })));
  const creator = caller(creatorId);
  const joining = caller(joiningId);
  const group = await creator.rdm.groups.create(testGroupInput({ rewardStructure: "winner_takes_all", target: 10 }));
  await Promise.allSettled([
    joining.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 }),
    creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 10 }),
  ]);
  const result = await creator.rdm.groups.award({ id: group.id });
  assert.ok(result.group.rewardPool === 10 || result.group.rewardPool === 20);
  const balances = await Promise.all([creator.rdm.wallet.summary(), joining.rdm.wallet.summary()]);
  assert.equal(balances.reduce((sum, wallet) => sum + wallet.wallet.balance, 0), 200);
  assert.equal(balances[0]?.wallet.peer, result.group.rewardPool);
});

test("a refunded expired creator attempt cannot reuse its original debit receipt for another group", async () => {
  const creatorId = randomUUID();
  const creator = caller(creatorId);
  const input = testGroupInput({ rewardStructure: "winner_takes_all" });
  await assert.rejects(() => creator.rdm.groups.create(input));
  const attempt = await db.GoalGroup.findOne({ creatorId, creationId: input.creationId });
  assert.ok(attempt);
  await db.GoalGroup.updateOne({ _id: attempt._id }, { $set: { endDayKey: dayAfter(-1) } });
  const operationId = `group-create:${creatorId}:${input.creationId}`;
  await db.RdmProfile.updateOne({ userId: creatorId }, {
    $set: { walletBalance: 90 },
    $addToSet: { creditedOperations: operationId },
    $push: { transactions: { title: "Group pledge locked — Reading together", kind: "stake", amount: -10, operationId, createdAt: new Date() } },
  });
  assert.equal((await creator.rdm.wallet.summary()).wallet.base, 100);
  const closed = await db.GoalGroup.findById(attempt._id);
  assert.equal(closed?.status, "expired");
  await assert.rejects(() => creator.rdm.groups.create(input), { code: "CONFLICT" });
  assert.equal(await db.GoalGroup.countDocuments({ creatorId, creationId: input.creationId }), 1);
  assert.equal((await creator.rdm.wallet.summary()).wallet.base, 100);
});

test("group idempotency keys reject a different creation or join pledge", async () => {
  const creatorId = randomUUID();
  const memberId = randomUUID();
  await Promise.all([creatorId, memberId].map((userId) => db.RdmProfile.create({ userId, walletBalance: 100 })));
  const creator = caller(creatorId);
  const member = caller(memberId);
  const input = testGroupInput({ rewardStructure: "winner_takes_all" });
  const group = await creator.rdm.groups.create(input);

  await assert.rejects(
    () => creator.rdm.groups.create({ ...input, name: "A different group" }),
    { code: "CONFLICT", message: "This creation request was already used for a different group" },
  );
  await member.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  await assert.rejects(
    () => member.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 11 }),
    { code: "CONFLICT", message: "This join request already has a different pledge" },
  );
  assert.equal((await member.rdm.wallet.summary()).wallet.base, 90);
});

test("a selected-weekday habit charges only scheduled days and keeps missed history after finishing", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 100 });
  const api = caller(id);
  const tomorrowWeekday = new Date(`${dayAfter(1)}T00:00:00Z`).getUTCDay() || 7;
  const habit = await api.rdm.habits.create(testHabitInput({
    rdmPledgeEndDayKey: dayAfter(14), rdmPledgeWeekdays: [tomorrowWeekday],
  }));
  assert.equal(habit.rdmPledge?.dayCount, 2);
  assert.equal(habit.rdmPledge?.total, 20);
  assert.equal(habit.rdmPledge?.scheduledToday, false);
  await assert.rejects(() => api.rdm.habits.logAction({ id: habit.id, note: "Not a scheduled day" }));
  await assert.rejects(() => api.rdm.habits.miss({ id: habit.id }));
  assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 80, base: 80, reward: 0, remorse: 0, peer: 0 });

  // Move the commitment window, preserving its weekday/duration, to model elapsed calendar time.
  await db.Habit.updateOne({ _id: habit.id }, { $set: {
    rdmPledgeStartDayKey: dayAfter(-7), rdmPledgeEndDayKey: dayAfter(7),
  } });
  const catchUp = await caller(id).rdm.habits.byId({ id: habit.id });
  assert.deepEqual(catchUp.rdmPledge?.settledDayKeys, [dayAfter(-6)]);
  assert.equal(catchUp.rdmPledge?.remaining, 10);
  assert.equal(catchUp.rdmPledge?.nextDayKey, dayAfter(1));
  assert.equal((await api.rdm.wallet.summary()).wallet.remorse, 10);
  await db.Habit.updateOne({ _id: habit.id }, { $set: {
    rdmPledgeStartDayKey: dayAfter(-14), rdmPledgeEndDayKey: today(),
  } });
  const finished = await caller(id).rdm.habits.byId({ id: habit.id });
  assert.equal(finished.rdmPledge?.status, "finished");
  assert.equal(finished.rdmPledge?.remaining, 0);
  assert.equal(finished.history.length, 2);
  assert.equal((await api.rdm.habits.list()).some((item) => item.id === habit.id), true);
  assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 100, base: 80, reward: 0, remorse: 20, peer: 0 });
});

test("concurrent habit completion and miss attempts cannot release a daily pledge twice", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 100 });
  const api = caller(id);
  const habit = await api.rdm.habits.create(testHabitInput());
  await api.rdm.habits.logAction({ id: habit.id, note: "Read the planned pages" });
  const outcomes = await Promise.allSettled([
    api.rdm.habits.reflect({ id: habit.id, reflection: "A quiet room helped me focus.", timeZone: "UTC" }),
    api.rdm.habits.reflect({ id: habit.id, reflection: "A quiet room helped me focus.", timeZone: "UTC" }),
    api.rdm.habits.miss({ id: habit.id }),
  ]);
  assert.ok(outcomes.some((outcome) => outcome.status === "fulfilled"));
  const completed = await caller(id).rdm.habits.byId({ id: habit.id });
  assert.equal(completed.lastOutcome, "completed");
  assert.equal(completed.streak, 1);
  assert.equal(completed.rdmPledge?.remaining, 10);
  assert.equal(completed.history.length, 1);
  assert.equal(completed.history[0]?.reflection, "A quiet room helped me focus.");
  assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 90, base: 80, reward: 10, remorse: 0, peer: 0 });

  const missedHabit = await api.rdm.habits.create(testHabitInput({ rdmPledgeEndDayKey: dayAfter(1) }));
  await Promise.allSettled([api.rdm.habits.miss({ id: missedHabit.id }), api.rdm.habits.miss({ id: missedHabit.id })]);
  const missed = await caller(id).rdm.habits.byId({ id: missedHabit.id });
  assert.equal(missed.lastOutcome, "missed");
  assert.equal(missed.rdmPledge?.remaining, 0);
  assert.equal(missed.history.length, 1);
  assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 90, base: 70, reward: 10, remorse: 10, peer: 0 });
  await assert.rejects(() => caller(randomUUID()).rdm.habits.reflect({ id: habit.id, reflection: "Cannot access this habit", timeZone: "UTC" }));
});

test("goal progress races preserve one version and competing outcomes allocate the pledge only once", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 100 });
  const api = caller(id);
  const goal = await api.rdm.goals.create({ creationId: randomUUID(), title: "Consistent goal progress", category: "Focus", target: "Finish a project", durationDays: 5, startDayKey: today(), timeZone: "UTC", pledgeAmount: 50 });
  const progressResults = await Promise.allSettled([
    api.rdm.goals.update({ id: goal.id, requestId: randomUUID(), expectedVersion: 0, action: "progress", progress: 30, note: "First session progress" }),
    api.rdm.goals.update({ id: goal.id, requestId: randomUUID(), expectedVersion: 0, action: "progress", progress: 70, note: "Second session progress" }),
  ]);
  assert.equal(progressResults.filter((result) => result.status === "fulfilled").length, 1);
  const progressed = await caller(id).rdm.goals.byId({ id: goal.id });
  assert.equal(progressed.progressVersion, 1);
  assert.equal(progressed.progressUpdates.length, 1);
  const outcomes = await Promise.allSettled([
    api.rdm.goals.update({ id: goal.id, requestId: randomUUID(), expectedVersion: 1, action: "complete", note: "The target is finished" }),
    api.rdm.goals.update({ id: goal.id, requestId: randomUUID(), expectedVersion: 1, action: "miss", note: "The target was missed" }),
  ]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  const settled = await caller(id).rdm.goals.byId({ id: goal.id });
  assert.equal(settled.progressVersion, 2);
  assert.equal(settled.progressUpdates.length, 2);
  const wallet = (await api.rdm.wallet.summary()).wallet;
  assert.equal(wallet.balance, 100);
  assert.equal(wallet.base, 50);
  assert.equal(wallet.reward + wallet.remorse, 50);
  assert.equal(settled.status === "completed" ? wallet.reward : wallet.remorse, 50);
});

test("a completed personal goal provides one persisted fertilizer action to its active tree", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 100 });
  const api = caller(id);
  await api.rdm.tree.pledge({ amount: 10, timeZone: "UTC" });
  const goal = await api.rdm.goals.create({ creationId: randomUUID(), title: "Complete a meaningful goal", category: "Health", target: "Finish the planned activity", durationDays: 5, startDayKey: today(), timeZone: "UTC", pledgeAmount: 30 });
  const command = { id: goal.id, requestId: randomUUID(), expectedVersion: 0, action: "complete" as const, note: "The planned activity is complete" };
  await api.rdm.goals.update(command);
  await api.rdm.goals.update(command);
  const tree = await caller(id).rdm.tree.overview({ timeZone: "UTC" });
  assert.equal(tree.profile.tree.fertilizerCount, 1);
  assert.equal(tree.profile.tree.growth.points, 1);
  assert.equal(tree.profile.wallet.reward, 30);
});

test("three real group participants join, contribute and receive the saved award split exactly once", async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  await Promise.all(ids.map((userId) => db.RdmProfile.create({ userId, walletBalance: 100 })));
  const [creatorId, secondId, thirdId] = ids;
  assert.ok(creatorId && secondId && thirdId);
  const creator = caller(creatorId);
  const second = caller(secondId);
  const third = caller(thirdId);
  const group = await creator.rdm.groups.create(testGroupInput());
  await second.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  await second.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  await third.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  const joined = await creator.rdm.groups.detail({ id: group.id });
  assert.equal(joined.members.length, 3);
  assert.equal(joined.rewardPool, 30);
  assert.equal((await second.rdm.wallet.summary()).wallet.base, 90);
  const firstContribution = { id: group.id, operationId: randomUUID(), amount: 60 };
  await Promise.all([creator.rdm.groups.logContribution(firstContribution), creator.rdm.groups.logContribution(firstContribution)]);
  await assert.rejects(() => creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 1 }));
  await second.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 30 });
  await third.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 10 });
  const preview = await creator.rdm.groups.awardPreview({ id: group.id });
  assert.deepEqual(preview.amounts, [18, 9, 3]);
  await assert.rejects(() => second.rdm.groups.award({ id: group.id }));
  await Promise.all([
    creator.rdm.groups.award({ id: group.id, specialAwarded: true }),
    creator.rdm.groups.award({ id: group.id, specialAwarded: true }),
  ]);
  await creator.rdm.groups.award({ id: group.id, specialAwarded: true });
  const wallets = await Promise.all(ids.map((userId) => caller(userId).rdm.wallet.summary()));
  assert.deepEqual(wallets.map((wallet) => wallet.wallet.peer), [18, 9, 3]);
  assert.equal(wallets.reduce((sum, wallet) => sum + wallet.wallet.balance, 0), 300);
  assert.equal(wallets[0]?.collectibles.length, 1);
  assert.equal((await third.rdm.groups.detail({ id: group.id })).status, "completed");
  assert.equal((await third.rdm.groups.list()).some((item) => item.id === group.id), true);
  await assert.rejects(() => caller(randomUUID()).rdm.groups.detail({ id: group.id }));
});

test("top-three groups complete smoothly without rewarding non-contributors", async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  await Promise.all(ids.map((userId) => db.RdmProfile.create({ userId, walletBalance: 100 })));
  const [creatorId, secondId, thirdId] = ids;
  assert.ok(creatorId && secondId && thirdId);
  const creator = caller(creatorId);
  const group = await creator.rdm.groups.create(testGroupInput({ target: 10 }));
  await caller(secondId).rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  await caller(thirdId).rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });

  const completed = await creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 10 });
  assert.equal(completed.targetHit, true);
  const preview = await creator.rdm.groups.awardPreview({ id: group.id });
  assert.deepEqual(preview.amounts, [30, 0, 0]);
});

test("a contribution note is saved for that member only and defaults to empty", async () => {
  const ids = [randomUUID(), randomUUID()];
  await Promise.all(ids.map((userId) => db.RdmProfile.create({ userId, walletBalance: 100 })));
  const [creatorId, secondId] = ids;
  assert.ok(creatorId && secondId);
  const creator = caller(creatorId);
  const second = caller(secondId);
  const group = await creator.rdm.groups.create(testGroupInput());
  await second.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  const beforeLog = await creator.rdm.groups.detail({ id: group.id });
  assert.equal(beforeLog.members.every((member) => member.lastNote === ""), true);
  await creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 1, note: "Morning session done" });
  await second.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 1 });
  const creatorMember = (await creator.rdm.groups.detail({ id: group.id })).members.find((member) => member.currentUser);
  assert.equal(creatorMember?.lastNote, "Morning session done");
  const secondMember = (await second.rdm.groups.detail({ id: group.id })).members.find((member) => member.currentUser);
  assert.equal(secondMember?.lastNote, "");
});

test("an unfinished group expires and refunds each member's original pledge once", async () => {
  const creatorId = randomUUID();
  const memberId = randomUUID();
  await Promise.all([creatorId, memberId].map((userId) => db.RdmProfile.create({ userId, walletBalance: 100 })));
  const creator = caller(creatorId);
  const member = caller(memberId);
  const group = await creator.rdm.groups.create(testGroupInput({
    durationDays: 4, pledgeBasis: "per_day", pledgePerUnit: 5, rewardStructure: "win_as_group",
  }));
  await member.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 20 });
  assert.equal((await member.rdm.wallet.summary()).wallet.base, 80);
  await creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 15 });
  await db.GoalGroup.updateOne({ _id: group.id }, { $set: { startDayKey: dayAfter(-4), endDayKey: today() } });
  const expired = await member.rdm.groups.detail({ id: group.id });
  assert.equal(expired.status, "expired");
  await creator.rdm.groups.detail({ id: group.id });
  await member.rdm.groups.list();
  assert.deepEqual((await creator.rdm.wallet.summary()).wallet, { balance: 100, base: 100, reward: 0, remorse: 0, peer: 0 });
  assert.deepEqual((await member.rdm.wallet.summary()).wallet, { balance: 100, base: 100, reward: 0, remorse: 0, peer: 0 });
  await assert.rejects(() => creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 15 }));
  await assert.rejects(() => creator.rdm.groups.award({ id: group.id }));
});

test("a completed group automatically distributes its backed pool at the deadline", async () => {
  const creatorId = randomUUID();
  const memberId = randomUUID();
  await Promise.all([creatorId, memberId].map((userId) => db.RdmProfile.create({ userId, walletBalance: 100 })));
  const creator = caller(creatorId);
  const member = caller(memberId);
  const group = await creator.rdm.groups.create(testGroupInput({
    rewardStructure: "winner_takes_all",
    target: 10,
  }));
  await member.rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  await creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 10 });
  await db.GoalGroup.updateOne({ _id: group.id }, { $set: { endDayKey: today() } });

  const completed = await member.rdm.groups.detail({ id: group.id });
  assert.equal(completed.status, "completed");
  assert.equal(completed.awarded, true);
  assert.deepEqual(completed.members.map((entry) => entry.award), [20, 0]);
  assert.equal((await creator.rdm.wallet.summary()).wallet.peer, 20);
  assert.equal((await member.rdm.wallet.summary()).wallet.peer, 0);

  await Promise.all([creator.rdm.groups.detail({ id: group.id }), member.rdm.groups.detail({ id: group.id })]);
  assert.equal((await creator.rdm.wallet.summary()).wallet.peer, 20);
});

test("the serverless settlement sweep completes due groups without a member request", async () => {
  const creatorId = randomUUID();
  await db.RdmProfile.create({ userId: creatorId, walletBalance: 100 });
  const creator = caller(creatorId);
  const group = await creator.rdm.groups.create(testGroupInput({
    rewardStructure: "winner_takes_all",
    target: 10,
  }));
  await creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 10 });
  await db.GoalGroup.updateOne({ _id: group.id }, { $set: { endDayKey: today() } });

  const result = await reconcileDueGroupGoalsBatch();
  assert.ok(result.processed >= 1);
  const completed = await db.GoalGroup.findById(group.id);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.awarded, true);
  assert.equal((await creator.rdm.wallet.summary()).wallet.peer, 10);
});

test("the serverless sweep retries completed groups whose wallet awards were interrupted", async () => {
  const creatorId = randomUUID();
  await db.RdmProfile.create({ userId: creatorId, walletBalance: 100 });
  const creator = caller(creatorId);
  const group = await creator.rdm.groups.create(testGroupInput({
    rewardStructure: "winner_takes_all",
    target: 10,
  }));
  await creator.rdm.groups.logContribution({ id: group.id, operationId: randomUUID(), amount: 10 });
  await db.GoalGroup.updateOne({ _id: group.id }, {
    $set: { awarded: true, "members.0.award": 10, status: "completed" },
  });
  assert.equal((await creator.rdm.wallet.summary()).wallet.peer, 0);

  await reconcileDueGroupGoalsBatch();
  assert.equal((await creator.rdm.wallet.summary()).wallet.peer, 10);
  const settled = await db.GoalGroup.findById(group.id);
  assert.ok(settled?.awardsSettledAt instanceof Date);
});

test("automatic settlement releases legacy completed top-three groups", async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  await Promise.all(ids.map((userId) => db.RdmProfile.create({ userId, walletBalance: 100 })));
  const [creatorId, secondId, thirdId] = ids;
  assert.ok(creatorId && secondId && thirdId);
  const creator = caller(creatorId);
  const group = await creator.rdm.groups.create(testGroupInput({ target: 10 }));
  await caller(secondId).rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  await caller(thirdId).rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 10 });
  await db.GoalGroup.updateOne({ _id: group.id }, {
    $set: {
      current: 10,
      endDayKey: today(),
      "members.0.contribution": 10,
      targetHit: true,
    },
  });

  const completed = await caller(secondId).rdm.groups.detail({ id: group.id });
  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.members.map((member) => member.award), [30, 0, 0]);
  assert.equal((await creator.rdm.wallet.summary()).wallet.peer, 30);
});

test("failed habit, goal and group funding attempts never charge later wallet reads without an explicit retry", async () => {
  const habitUserId = randomUUID();
  const goalUserId = randomUUID();
  const groupUserId = randomUUID();
  const habitApi = caller(habitUserId);
  const goalApi = caller(goalUserId);
  const groupApi = caller(groupUserId);
  const habitInput = testHabitInput();
  const goalInput = {
    creationId: randomUUID(), title: "A deliberately unfunded goal", category: "Focus" as const,
    target: "Finish the planned target", durationDays: 5, startDayKey: today(), timeZone: "UTC", pledgeAmount: 30,
  };
  const groupInput = testGroupInput({ rewardStructure: "win_as_group" });
  await assert.rejects(() => habitApi.rdm.habits.create(habitInput));
  await assert.rejects(() => goalApi.rdm.goals.create(goalInput));
  await assert.rejects(() => groupApi.rdm.groups.create(groupInput));
  // Explicit test fixture funding models a later legitimate top-up, not a creation retry.
  await Promise.all([habitUserId, goalUserId, groupUserId].map((userId) =>
    db.RdmProfile.updateOne({ userId }, { $set: { walletBalance: 100 } })));
  for (const api of [habitApi, goalApi, groupApi]) {
    assert.equal((await api.rdm.wallet.summary()).wallet.base, 100);
    await api.rdm.groups.list();
    assert.equal((await api.rdm.wallet.summary()).wallet.base, 100);
  }
  assert.equal((await habitApi.rdm.habits.list()).length, 0);
  assert.equal((await goalApi.rdm.goals.list()).length, 0);
  assert.deepEqual(await groupApi.rdm.groups.list(), []);
  await habitApi.rdm.habits.create(habitInput);
  await goalApi.rdm.goals.create(goalInput);
  await groupApi.rdm.groups.create(groupInput);
  assert.equal((await habitApi.rdm.wallet.summary()).wallet.base, 80);
  assert.equal((await goalApi.rdm.wallet.summary()).wallet.base, 70);
  assert.equal((await groupApi.rdm.wallet.summary()).wallet.base, 90);
});

test("interrupted personal goal funding and settlement recover without duplicate wallet credits", async () => {
  const id = randomUUID();
  await db.RdmProfile.create({ userId: id, walletBalance: 100 });
  const api = caller(id);
  await api.rdm.tree.pledge({ amount: 10, timeZone: "UTC" });
  const goal = await api.rdm.goals.create({ creationId: randomUUID(), title: "Crash recovery goal", category: "Focus", target: "A durable target", durationDays: 5, startDayKey: today(), timeZone: "UTC", pledgeAmount: 30 });
  // Model a process exit after the stake ledger write but before activation.
  await db.Goal.updateOne({ _id: goal.id }, { $set: { fundingStatus: "pending", active: false } });
  assert.equal((await api.rdm.wallet.summary()).wallet.base, 60);
  assert.equal((await caller(id).rdm.goals.byId({ id: goal.id })).active, true);

  // Model a process exit after the immutable outcome but before wallet/care settlement.
  await db.Goal.updateOne({ _id: goal.id }, { $set: {
    status: "completed", active: false, progress: 100, progressVersion: 1, outcomeAt: new Date(),
    progressUpdates: [{ requestId: randomUUID(), progress: 100, note: "Target reached before interruption", status: "completed", recordedAt: new Date() }],
  } });
  assert.equal((await api.rdm.wallet.summary()).wallet.reward, 30);
  assert.equal((await caller(id).rdm.goals.byId({ id: goal.id })).settled, true);
  // Model a lost final settlement marker after the wallet and tree activity were persisted.
  await db.Goal.updateOne({ _id: goal.id }, { $unset: { settledAt: 1 } });
  const tree = await caller(id).rdm.tree.overview({ timeZone: "UTC" });
  await api.rdm.goals.byId({ id: goal.id });
  const wallet = await api.rdm.wallet.summary();
  assert.equal(wallet.wallet.reward, 30);
  assert.equal(wallet.wallet.balance, 90);
  assert.equal(tree.profile.tree.fertilizerCount, 1);
  assert.equal(wallet.transactions.filter((entry) => entry.kind === "goal").length, 1);
});

test("finishing an empty game immediately or repeatedly grants no RDM, XP or badge", async () => {
  const id = randomUUID();
  const api = caller(id);
  const started = await api.rdm.games.start({ gameId: "aptitude-bliss" });
  const completed = await api.rdm.games.complete({ sessionId: started.sessionId });
  assert.equal(completed.reward, 0);
  const retried = await caller(id).rdm.games.complete({ sessionId: started.sessionId });
  assert.equal(retried.reward, 0);
  const wallet = await api.rdm.wallet.summary();
  assert.deepEqual(wallet.wallet, { balance: 0, base: 0, reward: 0, remorse: 0, peer: 0 });
  assert.equal(wallet.xp, 0);
  assert.deepEqual(wallet.unlockedBadges, []);
  assert.deepEqual(wallet.transactions, []);
  assert.equal((await api.rdm.games.list()).find((game) => game.id === "aptitude-bliss")?.locked, true);
  assert.equal((await api.rdm.wallet.summary()).wallet.reward, 0);
  const abandoned = await api.rdm.games.start({ gameId: "focus-flow" });
  await db.GameSession.updateOne({ _id: abandoned.sessionId }, { $set: {
    startedAt: new Date(Date.now() - 91_000), expiresAt: new Date(Date.now() - 1_000),
  } });
  assert.equal((await api.rdm.games.list()).find((game) => game.id === "focus-flow")?.locked, true);
  assert.equal((await api.rdm.games.complete({ sessionId: abandoned.sessionId })).reward, 0);
  assert.equal((await api.rdm.wallet.summary()).wallet.reward, 0);
});

test("a real wrong-answer game session reloads and banks its participation reward exactly once", async () => {
  const id = randomUUID();
  const api = caller(id);
  const started = await api.rdm.games.start({ gameId: "aptitude-bliss" });
  assert.equal(started.actionCount, 0);
  assert.equal(started.score, 0);
  assert.equal(started.prompt?.kind, "aptitude");
  const command = { sessionId: started.sessionId, operationId: randomUUID(), action: { type: "answer" as const, value: "A" } };
  await assert.rejects(() => caller(randomUUID()).rdm.games.progress(command));
  await assert.rejects(() => caller(randomUUID()).rdm.games.complete({ sessionId: started.sessionId }));
  const [answered, replayed] = await Promise.all([api.rdm.games.progress(command), api.rdm.games.progress(command)]);
  assert.equal(answered.accepted, true);
  assert.equal(answered.correct, false);
  assert.equal(answered.score, 0);
  assert.equal(answered.actionCount, 1);
  assert.deepEqual(replayed, answered);
  const reloaded = await caller(id).rdm.games.start({ gameId: "aptitude-bliss" });
  assert.equal(reloaded.sessionId, started.sessionId);
  assert.equal(reloaded.actionCount, 1);
  assert.equal(reloaded.score, 0);
  assert.equal(reloaded.prompt?.kind === "aptitude" ? reloaded.prompt.questionNumber : null, 2);

  // The native app intentionally supports finishing early; a genuine attempt need not be correct.
  const completions = await Promise.all([
    api.rdm.games.complete({ sessionId: started.sessionId }),
    api.rdm.games.complete({ sessionId: started.sessionId }),
  ]);
  assert.deepEqual(completions.map((result) => result.reward), [4, 4]);
  const retried = await caller(id).rdm.games.complete({ sessionId: started.sessionId });
  assert.equal(retried.score, 0);
  assert.equal(retried.actionCount, 1);
  assert.equal(retried.reward, 4);
  assert.equal((await api.rdm.games.list()).find((game) => game.id === "aptitude-bliss")?.locked, true);
  await assert.rejects(() => api.rdm.games.start({ gameId: "aptitude-bliss" }));
  const wallet = await caller(id).rdm.wallet.summary();
  assert.deepEqual(wallet.wallet, { balance: 4, base: 0, reward: 4, remorse: 0, peer: 0 });
  assert.equal(wallet.xp, 4);
  assert.equal(wallet.unlockedBadges.filter((badge) => badge === "first-game").length, 1);
  assert.equal(wallet.transactions.filter((entry) => entry.kind === "game").length, 1);
});

test("breathing game progress enforces elapsed cycles and persists the accepted result", async () => {
  const id = randomUUID();
  const api = caller(id);
  const started = await api.rdm.games.start({ gameId: "box-breathing" });
  const command = { sessionId: started.sessionId, operationId: randomUUID(), action: { type: "breath_cycle" as const } };
  await assert.rejects(() => api.rdm.games.progress(command), /full breathing cycle/);
  await db.GameSession.updateOne({ _id: started.sessionId }, { $set: {
    startedAt: new Date(Date.now() - 17_000), expiresAt: new Date(Date.now() + 43_000),
  } });
  const recorded = await api.rdm.games.progress(command);
  assert.equal(recorded.score, 25);
  assert.equal(recorded.actionCount, 1);
  assert.deepEqual(await caller(id).rdm.games.progress(command), recorded);
  await assert.rejects(() => api.rdm.games.progress({ ...command, operationId: randomUUID() }), /full breathing cycle/);
  const reloaded = await caller(id).rdm.games.start({ gameId: "box-breathing" });
  assert.equal(reloaded.actionCount, 1);
  assert.equal(reloaded.score, 25);
  assert.equal((await api.rdm.games.complete({ sessionId: started.sessionId })).reward, 2);
  assert.equal((await api.rdm.games.complete({ sessionId: started.sessionId })).reward, 2);
  assert.equal((await caller(id).rdm.wallet.summary()).wallet.reward, 2);
});
