import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";

import { HARA_HACHI_BU } from "../domain/wisdom";
import type { AppRouter } from "../routers/index";

type Dependencies = {
  db: typeof import("@rdm-b2c/db");
  caller: (userId: string) => ReturnType<AppRouter["createCaller"]>;
};

const dayAfter = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const wisdomInput = () => ({
  creationId: randomUUID(),
  wisdomPracticeId: HARA_HACHI_BU.id,
  title: HARA_HACHI_BU.title,
  category: HARA_HACHI_BU.category,
  icon: HARA_HACHI_BU.icon,
  target: HARA_HACHI_BU.target,
  pledge: HARA_HACHI_BU.pledge,
  cadence: HARA_HACHI_BU.cadence,
  source: "template" as const,
  rdmPledgePerDay: 1,
  rdmPledgeWeekdays: [...HARA_HACHI_BU.weekdays],
  rdmPledgeStartDayKey: dayAfter(0),
  rdmPledgeEndDayKey: dayAfter(3),
  timeZone: "UTC",
});

export const wisdomCases: Array<{ name: string; run: (dependencies: Dependencies) => Promise<void> }> = [
  {
    name: "Japanese Wisdom creates one canonical funded habit and keeps bonus payouts disabled",
    async run({ db, caller }) {
      const userId = randomUUID();
      await db.RdmProfile.create({ userId, walletBalance: 20 });
      const api = caller(userId);
      const input = wisdomInput();
      const [first, replay] = await Promise.all([api.rdm.habits.create(input), api.rdm.habits.create(input)]);
      assert.equal(first.id, replay.id);
      const saved = await caller(userId).rdm.habits.byId({ id: first.id });
      assert.equal(saved.wisdomPracticeId, "hara-hachi-bu");
      assert.equal(saved.wisdom?.consistencyStatus, "in_progress");
      assert.equal(saved.wisdom?.totalDays, 3);
      assert.deepEqual(saved.wisdom?.bonus, { eligible: false, status: "disabled", amount: 0 });
      assert.equal(saved.rdmPledge?.total, 3);
      assert.equal(saved.rdmPledge?.remaining, 3);
      assert.equal((await api.rdm.habits.list()).length, 1);
      assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 17, base: 17, reward: 0, remorse: 0, peer: 0 });
    },
  },
  {
    name: "Japanese Wisdom rejects altered practice terms and changed creation retries",
    async run({ db, caller }) {
      const userId = randomUUID();
      await db.RdmProfile.create({ userId, walletBalance: 30 });
      const api = caller(userId);
      const input = wisdomInput();
      for (const change of [
        { title: "Eat less to earn RDM" }, { target: "Restrict portions for rewards" },
        { pledge: "I will follow a different pledge." }, { category: "Focus" as const },
        { source: "custom" as const }, { cadence: "Weekdays" }, { icon: "target" },
        { rdmPledgeWeekdays: [1, 2, 3, 4, 5] },
      ]) {
        await assert.rejects(() => api.rdm.habits.create({ ...input, ...change }), /wisdom|practice|daily|Hara/iu);
      }
      assert.equal((await api.rdm.habits.list()).length, 0);
      const maliciousBonus = { ...input, wisdomBonusPolicyId: "approved", bonusAmount: 500 };
      const habit = await api.rdm.habits.create(maliciousBonus);
      assert.deepEqual(habit.wisdom?.bonus, { eligible: false, status: "disabled", amount: 0 });
      for (const change of [
        { rdmPledgePerDay: 2 }, { rdmPledgeEndDayKey: dayAfter(4) },
        { timeZone: "Asia/Kolkata" }, { wisdomPracticeId: undefined },
      ]) {
        await assert.rejects(() => api.rdm.habits.create({ ...input, ...change }), /different|changed|match|conflict/iu);
      }
      assert.equal((await api.rdm.habits.list()).length, 1);
      assert.equal((await api.rdm.wallet.summary()).wallet.base, 27);
      await assert.rejects(() => caller(randomUUID()).rdm.habits.byId({ id: habit.id }), /not found/iu);
    },
  },
  {
    name: "Japanese Wisdom settles honest daily reflections once and recognizes perfect completion only after the period ends",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2031-02-10T12:00:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 20 });
        const api = caller(userId);
        const habit = await api.rdm.habits.create(wisdomInput());
        await assert.rejects(() => api.rdm.habits.reflect({ id: habit.id, reflection: "I noticed my experience.", timeZone: "UTC" }), /not ready|action|reflection/iu);
        for (let day = 0; day < 3; day += 1) {
          if (day > 0) mock.timers.tick(86_400_000);
          await api.rdm.habits.logAction({ id: habit.id, note: "I paused to notice my eating experience." });
          const reflection = { id: habit.id, reflection: "Today was difficult; I noticed my feelings without judging or restricting my food.", timeZone: "UTC" };
          await Promise.all([api.rdm.habits.reflect(reflection), api.rdm.habits.reflect(reflection)]);
          await api.rdm.habits.reflect(reflection);
          const saved = await caller(userId).rdm.habits.byId({ id: habit.id });
          assert.equal(saved.wisdom?.completedDays, day + 1);
          assert.equal(saved.wisdom?.missedDays, 0);
          assert.equal(saved.history.length, day + 1);
          assert.equal(saved.history[0]?.reflection, reflection.reflection);
        }
        const lastDay = await api.rdm.habits.byId({ id: habit.id });
        assert.equal(lastDay.wisdom?.consistencyStatus, "in_progress");
        assert.equal(lastDay.rdmPledge?.remaining, 0);
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 20, base: 17, reward: 3, remorse: 0, peer: 0 });
        mock.timers.tick(86_400_000);
        const finished = await caller(userId).rdm.habits.byId({ id: habit.id });
        assert.equal(finished.wisdom?.consistencyStatus, "perfect");
        assert.deepEqual(finished.wisdom?.bonus, { eligible: false, status: "disabled", amount: 0 });
        await Promise.all([api.rdm.habits.byId({ id: habit.id }), api.rdm.habits.list(), api.rdm.wallet.summary()]);
        const wallet = await api.rdm.wallet.summary();
        assert.deepEqual(wallet.wallet, { balance: 20, base: 17, reward: 3, remorse: 0, peer: 0 });
        assert.equal(wallet.transactions.filter((entry) => entry.kind === "habit").length, 3);
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "Japanese Wisdom spends only Base and never funds an unapproved past-date retry",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2031-03-10T12:00:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 100, rewardBalance: 98 });
        const api = caller(userId);
        const input = wisdomInput();
        await assert.rejects(() => api.rdm.habits.create({ ...input, rdmPledgePerDay: 0 }), /1|small/iu);
        await assert.rejects(() => api.rdm.habits.create(input), /Base/iu);
        assert.equal((await api.rdm.habits.list()).length, 0);
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 100, base: 2, reward: 98, remorse: 0, peer: 0 });
        mock.timers.tick(86_400_000);
        // External top-up fixture: never use or modify a real account.
        await db.RdmProfile.updateOne({ userId }, { $inc: { walletBalance: 1 } });
        await assert.rejects(() => api.rdm.habits.create(input), /past|start date|new commitment/iu);
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 101, base: 3, reward: 98, remorse: 0, peer: 0 });
        assert.equal((await api.rdm.habits.list()).length, 0);
        const replacement = await api.rdm.habits.create(wisdomInput());
        assert.equal(replacement.rdmPledge?.total, 3);
        assert.equal((await api.rdm.wallet.summary()).wallet.base, 0);
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "Japanese Wisdom preserves earned Reward and loses perfect consistency after any explicit or elapsed miss",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2031-04-10T12:00:00Z") });
      try {
        for (const missedBy of ["explicit", "elapsed"] as const) {
          const userId = randomUUID();
          await db.RdmProfile.create({ userId, walletBalance: 20 });
          const api = caller(userId);
          const habit = await api.rdm.habits.create({ ...wisdomInput(), rdmPledgeEndDayKey: dayAfter(4) });
          for (let day = 0; day < 4; day += 1) {
            if (day > 0) mock.timers.tick(86_400_000);
            if (day === 1) {
              if (missedBy === "explicit") await Promise.all([api.rdm.habits.miss({ id: habit.id }), api.rdm.habits.miss({ id: habit.id })]);
              continue;
            }
            await api.rdm.habits.logAction({ id: habit.id, note: "I checked in with my eating experience." });
            await api.rdm.habits.reflect({ id: habit.id, reflection: "I noticed a moment of calm during my meal.", timeZone: "UTC" });
          }
          mock.timers.tick(86_400_000);
          await Promise.all([api.rdm.habits.list(), api.rdm.wallet.summary()]);
          const completed = await caller(userId).rdm.habits.byId({ id: habit.id });
          assert.equal(completed.wisdom?.consistencyStatus, "missed");
          assert.equal(completed.wisdom?.completedDays, 3);
          assert.equal(completed.wisdom?.missedDays, 1);
          assert.equal(completed.wisdom?.unresolvedDays, 0);
          assert.equal(completed.history.filter((entry) => entry.outcome === "missed").length, 1);
          assert.equal(completed.wisdom?.bonus.eligible, false);
          assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 20, base: 16, reward: 3, remorse: 1, peer: 0 });
        }
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "Japanese Wisdom recovers an already-backed creation and an interrupted reflection without duplicate RDM",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2031-05-10T12:00:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 20 });
        const api = caller(userId);
        const input = wisdomInput();
        // Interrupt activation after the real wallet has recorded its debit.
        await db.client.command({ collMod: "habits", validator: { rdmPledgeFundingStatus: { $ne: "funded" } } });
        try { await assert.rejects(() => api.rdm.habits.create(input)); }
        finally { await db.client.command({ collMod: "habits", validator: {} }); }
        mock.timers.tick(86_400_000);
        const [recovered, duplicate] = await Promise.all([api.rdm.habits.create(input), api.rdm.habits.create(input)]);
        assert.equal(recovered.id, duplicate.id);
        await api.rdm.habits.logAction({ id: recovered.id, note: "I noticed a meal after returning to the app." });
        const reflection = { id: recovered.id, reflection: "I found it difficult and reflected honestly.", timeZone: "UTC" };
        await db.client.command({ collMod: "rdmprofiles", validator: { "transactions.kind": { $ne: "habit" } } });
        try { await assert.rejects(() => api.rdm.habits.reflect(reflection)); }
        finally { await db.client.command({ collMod: "rdmprofiles", validator: {} }); }
        await Promise.all([api.rdm.habits.reflect(reflection), api.rdm.habits.reflect(reflection)]);
        const saved = await caller(userId).rdm.habits.byId({ id: recovered.id });
        assert.equal(saved.wisdom?.completedDays, 1);
        assert.equal(saved.wisdom?.missedDays, 1);
        assert.equal(saved.wisdom?.consistencyStatus, "missed");
        assert.equal(saved.rdmPledge?.remaining, 1);
        assert.equal((await api.rdm.habits.list()).length, 1);
        const wallet = await api.rdm.wallet.summary();
        assert.deepEqual(wallet.wallet, { balance: 19, base: 17, reward: 1, remorse: 1, peer: 0 });
        assert.equal(wallet.transactions.filter((entry) => entry.kind === "habit").length, 1);
      } finally {
        mock.timers.reset();
      }
    },
  },
  {
    name: "Japanese Wisdom uses the saved time zone and allows reflections only inside the confirmed dates",
    async run({ db, caller }) {
      mock.timers.enable({ apis: ["Date"], now: new Date("2031-06-10T18:20:00Z") });
      try {
        const userId = randomUUID();
        await db.RdmProfile.create({ userId, walletBalance: 10 });
        const api = caller(userId);
        const habit = await api.rdm.habits.create({ ...wisdomInput(),
          rdmPledgeStartDayKey: "2031-06-11", rdmPledgeEndDayKey: "2031-06-13",
          rdmPledgePerDay: 2, timeZone: "Asia/Kolkata",
        });
        assert.equal(habit.wisdom?.consistencyStatus, "upcoming");
        assert.equal(habit.rdmPledge?.total, 4);
        await assert.rejects(() => api.rdm.habits.logAction({ id: habit.id, note: "Trying before the start." }), /scheduled|available/iu);
        mock.timers.tick(20 * 60_000);
        await api.rdm.habits.logAction({ id: habit.id, note: "Noticed my eating experience on the start day." });
        await api.rdm.habits.reflect({ id: habit.id, reflection: "An honest daily reflection.", timeZone: "Pacific/Honolulu" });
        const current = await api.rdm.habits.byId({ id: habit.id });
        assert.equal(current.rdmPledge?.timeZone, "Asia/Kolkata");
        assert.equal(current.history[0]?.dayKey, "2031-06-11");
        mock.timers.tick(2 * 86_400_000);
        const ended = await api.rdm.habits.byId({ id: habit.id });
        assert.equal(ended.wisdom?.completedDays, 1);
        assert.equal(ended.wisdom?.missedDays, 1);
        assert.equal(ended.rdmPledge?.remaining, 0);
        await assert.rejects(() => api.rdm.habits.logAction({ id: habit.id, note: "Trying on the excluded end date." }), /scheduled|available/iu);
        assert.deepEqual((await api.rdm.wallet.summary()).wallet, { balance: 10, base: 6, reward: 2, remorse: 2, peer: 0 });
      } finally {
        mock.timers.reset();
      }
    },
  },
];
