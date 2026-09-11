import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";

import type { AppRouter } from "../routers/index";

type Dependencies = {
  db: typeof import("@rdm-b2c/db");
  caller: (userId: string) => ReturnType<AppRouter["createCaller"]>;
};

export const treeReadCases: Array<{ name: string; run: (dependencies: Dependencies) => Promise<void> }> = [
  {
    name: "an explicitly missed current goal day ends its fertilizer streak without erasing earned reflections",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2030-09-20T12:00:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 10 });
        const api = caller(userId);
        const goal = await api.rdm.goals.create({
          creationId: randomUUID(), title: "Complete a short draft", category: "Focus", target: "Finish one draft",
          durationDays: 3, startDayKey: "2030-09-20", timeZone: "UTC", pledgeAmount: 3, rdmPledgePerDay: 1,
        });
        await api.rdm.goals.reflect({ id: goal.id, operationId: randomUUID(), note: "Prepared an outline." });
        mock.timers.tick(86_400_000);
        const active = await api.rdm.goals.byId({ id: goal.id });
        assert.equal(active.streak, 1);
        const ended = await api.rdm.goals.update({ id: goal.id, requestId: randomUUID(), expectedVersion: active.progressVersion,
          action: "miss", note: "I confirm ending the commitment and forfeiting the remaining days." });
        assert.equal(ended.streak, 0);
        assert.equal(ended.completedDayCount, 1);
        assert.equal((await api.rdm.wallet.summary()).wallet.reward, 1);
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "goal fertilizer streak follows persisted daily reflections in the saved zone and resets only after a missed day",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2030-09-20T18:45:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 40 });
        const api = caller(userId);
        const goal = await api.rdm.goals.create({
          creationId: randomUUID(), title: "Write a useful article", category: "Focus", target: "Publish one article",
          durationDays: 5, startDayKey: "2030-09-21", timeZone: "Asia/Kolkata", pledgeAmount: 5, rdmPledgePerDay: 1,
        });
        assert.equal(goal.streak, 0);
        const reflect = () => api.rdm.goals.reflect({ id: goal.id, operationId: randomUUID(), note: "Made useful progress toward my article." });
        assert.equal((await reflect()).streak, 1);
        assert.equal((await api.rdm.goals.list()).find((item) => item.id === goal.id)?.streak, 1);
        mock.timers.tick(86_400_000);
        assert.equal((await api.rdm.goals.byId({ id: goal.id })).streak, 1, "Today's pending reflection preserves yesterday's streak");
        assert.equal((await reflect()).streak, 2);
        mock.timers.tick(86_400_000);
        assert.equal((await api.rdm.goals.byId({ id: goal.id })).streak, 2);
        mock.timers.tick(86_400_000);
        assert.equal((await api.rdm.goals.byId({ id: goal.id })).streak, 0);
        assert.equal((await reflect()).streak, 1);
        const legacy = await api.rdm.goals.create({
          creationId: randomUUID(), title: "Finish a legacy milestone", category: "Focus", target: "Finish the milestone",
          durationDays: 3, startDayKey: "2030-09-24", timeZone: "Asia/Kolkata", pledgeAmount: 3,
        });
        assert.equal(legacy.streak, null, "Outcome-funded goals must not invent a daily reflection streak");
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "water and sunlight reject a stale displayed day before saving or rewarding and accept same-day retries once",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2030-09-20T18:29:50Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 30 });
        const api = caller(userId);
        await api.rdm.tree.pledge({ amount: 10, timeZone: "Asia/Kolkata" });
        const journal = await api.rdm.gratitude.byCategory({ category: "life", timeZone: "UTC" });
        const deeds = await api.rdm.goodDeeds.today({ timeZone: "UTC" });
        mock.timers.tick(20_000);
        const before = await api.rdm.wallet.summary();
        const water = { category: "life" as const, body: "I appreciate this chance to reflect.", timeZone: "UTC", expectedDayKey: journal.dayKey };
        const sunlight = { deedIds: [deeds.deeds[0]!.id], timeZone: "UTC", expectedDayKey: deeds.dayKey };
        await assert.rejects(() => api.rdm.gratitude.save(water), /day.*changed/iu);
        await assert.rejects(() => api.rdm.goodDeeds.submit(sunlight), /day.*changed/iu);
        assert.equal((await api.rdm.gratitude.byCategory({ category: "life", timeZone: "UTC" })).todayEntry, null);
        assert.equal((await api.rdm.goodDeeds.today({ timeZone: "UTC" })).deeds.some((deed) => deed.completed), false);
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, before.wallet);
        const acceptedWater = await api.rdm.gratitude.save({ ...water, expectedDayKey: "2030-09-21" });
        assert.equal(acceptedWater.dayKey, "2030-09-21");
        assert.equal(acceptedWater.timeZone, "Asia/Kolkata");
        assert.equal(acceptedWater.reward, 15);
        const acceptedSunlight = await api.rdm.goodDeeds.submit({ ...sunlight, expectedDayKey: "2030-09-21" });
        assert.equal(acceptedSunlight.dayKey, "2030-09-21");
        assert.equal(acceptedSunlight.timeZone, "Asia/Kolkata");
        const after = await api.rdm.wallet.summary();
        assert.equal((await api.rdm.gratitude.save({ ...water, expectedDayKey: "2030-09-21" })).reward, 0);
        await api.rdm.goodDeeds.submit({ ...sunlight, expectedDayKey: "2030-09-21" });
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, after.wallet);
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "gratitude history is category and owner scoped with current day metadata from the saved tree time zone",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2030-09-20T18:45:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 30 });
        const api = caller(userId);
        await api.rdm.tree.pledge({ amount: 10, timeZone: "Asia/Kolkata" });
        const first = await api.rdm.gratitude.save({ category: "life", body: "I appreciate a quiet start to the day.", timeZone: "UTC" });
        await api.rdm.gratitude.save({ category: "helper", body: "Someone helped me carry my bag.", timeZone: "UTC" });
        await caller(randomUUID()).rdm.gratitude.save({ category: "life", body: "A different account's private reflection.", timeZone: "UTC" });
        mock.timers.tick(86_400_000);
        const day = await api.rdm.gratitude.byCategory({ category: "life", timeZone: "UTC" });
        assert.equal(day.dayKey, "2030-09-22");
        assert.equal(day.timeZone, "Asia/Kolkata");
        assert.equal(day.todayEntry, null);
        assert.deepEqual(day.previousEntries.map((entry) => entry.id), [first.entry.id]);
        assert.equal(day.previousEntries[0]?.body, "I appreciate a quiet start to the day.");
        const current = await api.rdm.gratitude.save({ category: "life", body: "I appreciate another chance to learn.", timeZone: "UTC" });
        const reloaded = await api.rdm.gratitude.byCategory({ category: "life", timeZone: "UTC" });
        assert.equal(reloaded.todayEntry?.id, current.entry.id);
        assert.deepEqual(reloaded.previousEntries.map((entry) => entry.id), [first.entry.id]);
        const deeds = await api.rdm.goodDeeds.today({ timeZone: "UTC" });
        assert.equal(deeds.dayKey, "2030-09-22");
        assert.equal(deeds.timeZone, "Asia/Kolkata");
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "tree history pages actual care and missed-day receipts without inventing records or exposing another owner",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2030-08-01T12:00:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 30 });
        const api = caller(userId);
        await api.rdm.gratitude.save({ category: "helper", body: "I appreciate the support I received before planting.", timeZone: "UTC" });
        mock.timers.tick(1000);
        await api.rdm.tree.pledge({ amount: 10, timeZone: "UTC" });
        await api.rdm.gratitude.save({ category: "life", body: "I am grateful for this fresh start.", timeZone: "UTC" });
        mock.timers.tick(2 * 86_400_000);
        await api.rdm.tree.overview({ timeZone: "UTC" });
        const deeds = await api.rdm.goodDeeds.today({ timeZone: "UTC" });
        await api.rdm.goodDeeds.submit({ deedIds: [deeds.deeds[0]!.id], timeZone: "UTC" });
        const walletBeforeReads = await api.rdm.wallet.summary();
        const page1 = await api.rdm.tree.history({ limit: 1 });
        assert.equal(page1.timeZone, "UTC");
        assert.deepEqual(page1.entries, [{ dayKey: "2030-08-03", fertilizerCount: 0, waterCount: 0, sunlightCount: 1, status: "cared", transferredToRemorse: null }]);
        assert.equal(page1.nextBeforeDayKey, "2030-08-03");
        const page2 = await api.rdm.tree.history({ limit: 1, beforeDayKey: page1.nextBeforeDayKey! });
        assert.deepEqual(page2.entries, [{ dayKey: "2030-08-02", fertilizerCount: 0, waterCount: 0, sunlightCount: 0, status: "missed", transferredToRemorse: 10 }]);
        assert.equal(page2.nextBeforeDayKey, "2030-08-02");
        const page3 = await api.rdm.tree.history({ limit: 1, beforeDayKey: page2.nextBeforeDayKey! });
        assert.deepEqual(page3.entries, [{ dayKey: "2030-08-01", fertilizerCount: 0, waterCount: 1, sunlightCount: 0, status: "cared", transferredToRemorse: null }]);
        assert.equal(page3.nextBeforeDayKey, null);
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, walletBeforeReads.wallet);
        assert.deepEqual((await caller(randomUUID()).rdm.tree.history({})).entries, []);
        await assert.rejects(() => api.rdm.tree.history({ limit: 51 }));
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "tree overview counts unique saved care days and links both habit and goal reflection without extra payouts",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2030-09-20T18:45:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 100 });
        const api = caller(userId);
        const empty = await api.rdm.tree.overview({ timeZone: "Asia/Kolkata" });
        assert.equal(empty.profile.tree.careDays, 0);
        assert.deepEqual(empty.profile.tree.todayCare, {
          dayKey: "2030-09-21", fertilizerCount: 0, waterCount: 0, sunlightCount: 0, caredFor: false,
        });
        await api.rdm.tree.pledge({ amount: 10, timeZone: "Asia/Kolkata" });
        const habit = await api.rdm.habits.create({
          creationId: randomUUID(), title: "Read a page", category: "Focus", cadence: "Daily",
          target: "Read a useful page", pledge: "I will read one page after breakfast.", source: "custom",
          rdmPledgePerDay: 1, rdmPledgeStartDayKey: "2030-09-21", rdmPledgeEndDayKey: "2030-09-24", timeZone: "Asia/Kolkata",
        });
        const goal = await api.rdm.goals.create({
          creationId: randomUUID(), title: "Draft a short article", category: "Focus", target: "Finish one article",
          durationDays: 3, startDayKey: "2030-09-20", timeZone: "UTC", pledgeAmount: 3, rdmPledgePerDay: 1,
        });
        await api.rdm.habits.logAction({ id: habit.id, note: "Read the opening page." });
        const actionOnly = await api.rdm.tree.overview({ timeZone: "UTC" });
        assert.equal(actionOnly.profile.tree.fertilizerCount, 0, "Logging action alone must not create fertilizer");
        await api.rdm.habits.reflect({ id: habit.id, reflection: "A small reading session helped me focus.", timeZone: "Asia/Kolkata" });
        const goalReflection = { id: goal.id, operationId: randomUUID(), note: "Wrote the opening paragraph." };
        await api.rdm.goals.reflect(goalReflection);
        await api.rdm.goals.reflect(goalReflection);
        await api.rdm.gratitude.save({ category: "life", body: "I appreciate having time to learn today.", timeZone: "UTC" });
        const deeds = await api.rdm.goodDeeds.today({ timeZone: "UTC" });
        await api.rdm.goodDeeds.submit({ deedIds: [deeds.deeds[0]!.id], timeZone: "UTC" });
        const wallet = await api.rdm.wallet.summary();
        const tree = await api.rdm.tree.overview({ timeZone: "UTC" });
        assert.equal(tree.profile.tree.timeZone, "Asia/Kolkata");
        assert.equal(tree.profile.tree.careDays, 1);
        assert.deepEqual(tree.profile.tree.todayCare, {
          dayKey: "2030-09-21", fertilizerCount: 2, waterCount: 1, sunlightCount: 1, caredFor: true,
        });
        assert.equal(tree.profile.tree.growth.points, 4);
        assert.deepEqual((await api.rdm.tree.overview({ timeZone: "UTC" })).profile.wallet, wallet.wallet);
        assert.equal((await caller(randomUUID()).rdm.tree.overview({ timeZone: "UTC" })).profile.tree.careDays, 0);
      } finally {
        mock.timers.reset();
      }
    },
  },
];
