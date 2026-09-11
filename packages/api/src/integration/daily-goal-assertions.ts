import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";

import type { AppRouter } from "../routers/index";

type Dependencies = {
  db: typeof import("@rdm-b2c/db");
  caller: (userId: string) => ReturnType<AppRouter["createCaller"]>;
};

const today = () => new Date().toISOString().slice(0, 10);

export const dailyGoalCases: Array<{ name: string; run: (dependencies: Dependencies) => Promise<void> }> = [
  {
    name: "daily personal goal locks the full calendar allocation and reflects only one day once",
    async run({ db, caller }) {
      const userId = randomUUID();
      await db.RdmProfile.create({ userId, walletBalance: 100 });
      const api = caller(userId);
      const input = {
        creationId: randomUUID(), title: "Finish a short book", category: "Focus" as const,
        target: "Read one book and record five takeaways", durationDays: 3,
        startDayKey: today(), timeZone: "UTC", pledgeAmount: 6, rdmPledgePerDay: 2,
        why: "Build confidence for a longer reading goal.", steps: ["Choose a short book", "Read and capture takeaways"],
        reflectionPrompt: "What did you understand from your reading today?",
      };
      const goal = await api.rdm.goals.create(input);
      assert.equal(goal.fundingMode, "daily");
      assert.equal(goal.remainingPledge, 6);
      assert.equal(goal.pledgePerDay, 2);
      assert.equal(goal.todayStatus, "pending");
      assert.equal((await api.rdm.wallet.summary()).wallet.base, 94);
      const reflection = { id: goal.id, operationId: randomUUID(), expectedVersion: goal.progressVersion, note: "Read the opening chapter and captured one takeaway." };
      await Promise.all([api.rdm.goals.reflect(reflection), api.rdm.goals.reflect(reflection)]);
      const replay = await api.rdm.goals.reflect(reflection);
      assert.equal(replay.remainingPledge, 4);
      assert.equal(replay.completedDayCount, 1);
      assert.equal(replay.dayEntries.length, 1);
      assert.equal(replay.todayStatus, "completed");
      assert.equal(replay.why, input.why);
      assert.deepEqual(replay.steps, input.steps);
      assert.equal(replay.reflectionPrompt, input.reflectionPrompt);
      assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 96, base: 94, reward: 2, remorse: 0, peer: 0 });
      await assert.rejects(() => api.rdm.goals.reflect({ ...reflection, operationId: randomUUID() }), /already|updated/iu);
      await assert.rejects(() => api.rdm.goals.update({ id: goal.id, requestId: randomUUID(), expectedVersion: replay.progressVersion, action: "complete", note: "I want to finish early" }), /daily|reflection|allocation/iu);
      await assert.rejects(() => caller(randomUUID()).rdm.goals.reflect(reflection), /not found/iu);
    },
  },
  {
    name: "daily goal catches up missed dates and completing the last day never pays the full pledge twice",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2030-04-10T12:00:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 20 });
        const api = caller(userId);
        const goal = await api.rdm.goals.create({
          creationId: randomUUID(), title: "Draft a short essay", category: "Focus", target: "Draft one essay",
          durationDays: 3, startDayKey: today(), timeZone: "UTC", pledgeAmount: 6, rdmPledgePerDay: 2,
        });
        await api.rdm.goals.reflect({ id: goal.id, operationId: randomUUID(), note: "Prepared the outline." });
        mock.timers.tick(2 * 86_400_000);
        const [reloaded] = await Promise.all([api.rdm.goals.byId({ id: goal.id }), api.rdm.wallet.summary()]);
        assert.equal(reloaded.missedDayCount, 1);
        assert.equal(reloaded.remainingPledge, 2);
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 18, base: 14, reward: 2, remorse: 2, peer: 0 });
        const finalDay = await api.rdm.goals.reflect({ id: goal.id, operationId: randomUUID(), note: "Wrote the finished essay." });
        assert.equal(finalDay.canComplete, true);
        const finish = { id: goal.id, requestId: randomUUID(), expectedVersion: finalDay.progressVersion, action: "complete" as const, note: "The essay is complete." };
        await Promise.all([api.rdm.goals.update(finish), api.rdm.goals.update(finish)]);
        mock.timers.tick(86_400_000);
        const ended = await caller(userId).rdm.goals.byId({ id: goal.id });
        assert.equal(ended.status, "completed");
        assert.equal(ended.remainingPledge, 0);
        assert.equal(ended.dayEntries.length, 3);
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 20, base: 14, reward: 4, remorse: 2, peer: 0 });
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "daily goal recovers a reflected day after interrupted wallet credit and adds tree fertilizer once",
    async run({ db, caller }) {
      const userId = randomUUID();
      await db.RdmProfile.create({ userId, walletBalance: 30 });
      const api = caller(userId);
      await api.rdm.tree.pledge({ amount: 10, timeZone: "UTC" });
      const goal = await api.rdm.goals.create({
        creationId: randomUUID(), title: "Prepare a presentation", category: "Focus", target: "Draft five slides",
        durationDays: 3, startDayKey: today(), timeZone: "UTC", pledgeAmount: 6, rdmPledgePerDay: 2,
      });
      const reflection = { id: goal.id, operationId: randomUUID(), note: "Created the title and agenda slides." };
      // Fail the real database boundary after the reflection record has committed.
      await db.client.command({ collMod: "rdmprofiles", validator: { "transactions.kind": { $ne: "goal" } } });
      try {
        await assert.rejects(() => api.rdm.goals.reflect(reflection));
      } finally {
        await db.client.command({ collMod: "rdmprofiles", validator: {} });
      }
      await Promise.all([api.rdm.wallet.summary(), api.rdm.goals.reflect(reflection)]);
      const recovered = await caller(userId).rdm.goals.byId({ id: goal.id });
      assert.equal(recovered.dayEntries[0]?.note, reflection.note);
      assert.equal(recovered.completedDayCount, 1);
      assert.equal(recovered.remainingPledge, 4);
      const tree = await api.rdm.tree.overview({ timeZone: "UTC" });
      assert.equal(tree.profile.tree.growth.points, 1);
      assert.deepEqual(tree.profile.wallet, { balance: 16, base: 14, reward: 2, remorse: 0, peer: 0 });
      assert.equal((await api.rdm.wallet.summary()).transactions.filter((entry) => entry.kind === "goal").length, 1);
    },
  },
  {
    name: "daily goal explicit miss forfeits only remaining days while expiration preserves previous Reward",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2030-05-10T12:00:00Z") });
      try {
        for (const finish of ["miss", "expire"] as const) {
          const userId = randomUUID();
          await db.RdmProfile.create({ userId, walletBalance: 10 });
          const api = caller(userId);
          const goal = await api.rdm.goals.create({
            creationId: randomUUID(), title: "Learn a short piece", category: "Focus", target: "Play one piece",
            durationDays: 3, startDayKey: today(), timeZone: "UTC", pledgeAmount: 3, rdmPledgePerDay: 1,
          });
          const reflected = await api.rdm.goals.reflect({ id: goal.id, operationId: randomUUID(), note: "Practiced the first section." });
          if (finish === "miss") {
            const request = { id: goal.id, requestId: randomUUID(), expectedVersion: reflected.progressVersion, action: "miss" as const, note: "I confirm forfeiting the remaining allocation." };
            await Promise.all([api.rdm.goals.update(request), api.rdm.goals.update(request)]);
          } else {
            mock.timers.tick(3 * 86_400_000);
          }
          const ended = await caller(userId).rdm.goals.byId({ id: goal.id });
          assert.equal(ended.status, "missed");
          assert.equal(ended.remainingPledge, 0);
          assert.equal(ended.completedDayCount, 1);
          assert.equal(ended.missedDayCount, 2);
          assert.equal(ended.settled, true);
          assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 10, base: 7, reward: 1, remorse: 2, peer: 0 });
        }
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "daily goal validates exact allocation and 90-day cap and only spends available Base",
    async run({ db, caller }) {
      const userId = randomUUID();
      await db.RdmProfile.create({ userId, walletBalance: 103, rewardBalance: 100 });
      const api = caller(userId);
      const input = {
        creationId: randomUUID(), title: "Finish a small project", category: "Focus" as const, target: "Publish one page",
        durationDays: 3, startDayKey: today(), timeZone: "UTC", pledgeAmount: 3, rdmPledgePerDay: 1,
      };
      await assert.rejects(() => api.rdm.goals.create({ ...input, pledgeAmount: 1 }), /daily RDM/iu);
      await assert.rejects(() => api.rdm.goals.create({ ...input, durationDays: 91, pledgeAmount: 91 }), /90 days/iu);
      await assert.rejects(() => api.rdm.goals.create({ ...input, durationDays: 4, pledgeAmount: 4 }), /Base Purse/iu);
      const exactInput = { ...input, creationId: randomUUID() };
      const exact = await api.rdm.goals.create(exactInput);
      assert.equal(exact.remainingPledge, 3);
      assert.equal((await api.rdm.wallet.summary()).wallet.base, 0);
      await assert.rejects(() => api.rdm.goals.create({ ...input, creationId: randomUUID(), durationDays: 1, pledgeAmount: 1 }), /Base Purse/iu);
      assert.equal((await api.rdm.goals.create(exactInput)).id, exact.id);
      await assert.rejects(() => api.rdm.goals.create({ ...exactInput, rdmPledgePerDay: undefined }), /different goal details/iu);
      await assert.rejects(() => api.rdm.goals.create({ ...exactInput, why: "Changed after funding" }), /different goal details/iu);
    },
  },
  {
    name: "daily goal uses the confirmed time zone and excludes the end date from reflections",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2030-06-01T17:00:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 2 });
        const api = caller(userId);
        const goal = await api.rdm.goals.create({
          creationId: randomUUID(), title: "Outline a presentation", category: "Focus", target: "Write a presentation outline",
          durationDays: 1, startDayKey: "2030-06-02", timeZone: "Asia/Kolkata", pledgeAmount: 1, rdmPledgePerDay: 1,
        });
        assert.equal(goal.endDayKey, "2030-06-03");
        assert.equal(goal.todayStatus, "upcoming");
        await assert.rejects(() => api.rdm.goals.reflect({ id: goal.id, operationId: randomUUID(), note: "I started too early." }), /active dates/iu);
        mock.timers.tick(2 * 60 * 60 * 1000);
        assert.equal((await api.rdm.goals.byId({ id: goal.id })).canReflect, true);
        await api.rdm.goals.reflect({ id: goal.id, operationId: randomUUID(), note: "Completed the presentation outline." });
        mock.timers.tick(86_400_000);
        await assert.rejects(() => api.rdm.goals.reflect({ id: goal.id, operationId: randomUUID(), note: "This is beyond the end date." }), /active dates/iu);
        const expired = await api.rdm.goals.byId({ id: goal.id });
        assert.equal(expired.status, "missed", "The final outcome still needs explicit confirmation, separate from daily reflection");
        assert.equal(expired.completedDayCount, 1);
        assert.equal(expired.missedDayCount, 0);
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 2, base: 1, reward: 1, remorse: 0, peer: 0 });
      } finally {
        mock.timers.reset();
      }
    },
  },
];
