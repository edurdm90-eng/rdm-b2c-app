import assert from "node:assert/strict";
import test from "node:test";

import {
  awardSplitIsValid,
  badgeCatalog,
  calendarDayKeysAfter,
  challengeForGame,
  dayKeyForTimeZone,
  debitPurseBalances,
  gameDayKey,
  gameSessionCanReward,
  goodDeedCatalog,
  goodDeedSubmissionResult,
  gratitudeCategories,
  groupAwardCredits,
  habitCanStartNextCycle,
  initialBadgeIds,
  inviteWeekKey,
  levelForXp,
  missedPledgeBalances,
  missedTreeDayKey,
  previousDayKeyForTimeZone,
  rewardToRemorseTransfer,
  rewardCatalog,
  rewardForGame,
  treeGrowthFor,
  treePledgeWalletBalance,
} from "./rdm";

test("responsible games cap rewards and normalize duration", () => {
  assert.equal(rewardForGame(2, 340), 7);
  assert.equal(rewardForGame(30, 5000), 12);
  assert.equal(rewardForGame(0, -50), 2);
});

test("levels advance every 100 XP", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(640), 7);
  assert.equal(levelForXp(-100), 1);
});

test("group awards must allocate the full pool", () => {
  assert.equal(awardSplitIsValid([80, 120, 60, 40], 300), true);
  assert.equal(awardSplitIsValid([80, 120], 300), false);
  assert.equal(awardSplitIsValid([300.5], 300.5), false);
});

test("the badge framework exposes 24 achievements with 9 initially unlocked", () => {
  assert.equal(badgeCatalog.length, 24);
  assert.equal(new Set(badgeCatalog.map((badge) => badge.id)).size, 24);
  assert.equal(initialBadgeIds.length, 9);
  assert.equal(initialBadgeIds.every((id) => badgeCatalog.some((badge) => badge.id === id)), true);
});

test("redeemable rewards use server-owned ids and prices", () => {
  assert.deepEqual(rewardCatalog, [{ id: "focus-garden", title: "Focus Garden skin", cost: 50 }]);
});

test("game challenges stay attached to their game after filtering", () => {
  assert.equal(challengeForGame("word-sprint"), "Beat Priya's 340");
  assert.equal(challengeForGame("sort-sprint"), "Beat Ravi's 12");
  assert.equal(challengeForGame("box-breathing"), null);
});

test("game sessions use a stable UTC day key", () => {
  assert.equal(gameDayKey(new Date("2026-08-19T23:59:59.000Z")), "2026-08-19");
});

test("tree care uses the user's local calendar day", () => {
  const lateUtc = new Date("2026-09-04T19:00:00.000Z");
  assert.equal(dayKeyForTimeZone(lateUtc, "Asia/Kolkata"), "2026-09-05");
  assert.equal(previousDayKeyForTimeZone(lateUtc, "Asia/Kolkata"), "2026-09-04");
});

test("tree reconciliation enumerates every unevaluated calendar day", () => {
  assert.deepEqual(
    calendarDayKeysAfter("2026-09-01", "2026-09-04"),
    ["2026-09-02", "2026-09-03", "2026-09-04"],
  );
  assert.deepEqual(calendarDayKeysAfter("2026-09-04", "2026-09-04"), []);
});

test("any care activity protects yesterday while no care creates a missed day", () => {
  const now = new Date("2026-09-05T05:00:00.000Z");
  const pledgedAt = new Date("2026-09-03T05:00:00.000Z");
  assert.equal(
    missedTreeDayKey({ pledgedAt, now, timeZone: "Asia/Kolkata", caredForYesterday: false }),
    "2026-09-04",
  );
  assert.equal(
    missedTreeDayKey({ pledgedAt, now, timeZone: "Asia/Kolkata", caredForYesterday: true }),
    null,
  );
  assert.equal(
    missedTreeDayKey({
      pledgedAt: new Date("2026-09-05T01:00:00.000Z"),
      now,
      timeZone: "Asia/Kolkata",
      caredForYesterday: false,
    }),
    null,
  );
});

test("daily habits cannot inflate a streak with repeated same-day cycles", () => {
  assert.equal(habitCanStartNextCycle(null, "2026-09-05"), true);
  assert.equal(habitCanStartNextCycle("2026-09-04", "2026-09-05"), true);
  assert.equal(habitCanStartNextCycle("2026-09-05", "2026-09-05"), false);
});

test("missed tree care moves RDM from Reward to Remorse without destroying it", () => {
  assert.deepEqual(rewardToRemorseTransfer(320, 40, 10), {
    appliedAmount: 10,
    rewardBalance: 310,
    remorseBalance: 50,
  });
  assert.equal(rewardToRemorseTransfer(4, 12, 10), null);
});

test("tree creation stakes RDM from the available wallet", () => {
  assert.equal(treePledgeWalletBalance(1240, 100), 1140);
  assert.equal(treePledgeWalletBalance(40, 100), null);
});

test("invite progress resets on ISO week boundaries", () => {
  assert.equal(inviteWeekKey(new Date("2026-08-19T23:59:59.000Z")), "2026-W34");
  assert.equal(inviteWeekKey(new Date("2027-01-01T10:00:00.000Z")), "2026-W53");
});

test("expired or completed game sessions cannot reward", () => {
  const expiresAt = new Date("2026-08-19T10:03:00.000Z");
  assert.equal(gameSessionCanReward("running", expiresAt, new Date("2026-08-19T10:03:00.000Z")), true);
  assert.equal(gameSessionCanReward("running", expiresAt, new Date("2026-08-19T10:03:00.001Z")), false);
  assert.equal(gameSessionCanReward("complete", expiresAt, new Date("2026-08-19T10:02:00.000Z")), false);
});

test("missed pledges conserve the applied penalty for low balances", () => {
  assert.deepEqual(missedPledgeBalances(4, 12, 10), { appliedPenalty: 4, walletBalance: 0, remorseBalance: 16 });
  assert.deepEqual(missedPledgeBalances(40, 5, 10), { appliedPenalty: 10, walletBalance: 30, remorseBalance: 15 });
});

test("purse spending updates the purse and total together", () => {
  assert.deepEqual(debitPurseBalances(100, 20, 5), { walletBalance: 95, purseBalance: 15 });
  assert.equal(debitPurseBalances(100, 3, 5), null);
});

test("group awards deliver every real member's positive allocation", () => {
  assert.deepEqual(
    groupAwardCredits([{ userId: "a" }, {}, { userId: "b" }], [80, 120, 100]),
    [{ userId: "a", amount: 80 }, { userId: "b", amount: 100 }],
  );
});

test("gratitude categories own their dynamic journal copy", () => {
  assert.equal(gratitudeCategories.length, 5);
  assert.equal(new Set(gratitudeCategories.map((category) => category.journalTitle)).size, 5);
  assert.equal(new Set(gratitudeCategories.map((category) => category.rewardMessage)).size, 5);
  assert.equal(gratitudeCategories.find((category) => category.id === "life")?.prompt, "What are you grateful for today?");
  assert.equal(
    gratitudeCategories.find((category) => category.id === "life")?.rewardMessage,
    "Added to your Reward Purse for today's gratitude entry.",
  );
});

test("good deeds use the wireframe catalog and server-owned rewards", () => {
  assert.deepEqual(
    goodDeedCatalog.map(({ title, reward }) => [title, reward]),
    [
      ["Helped a neighbor", 20],
      ["Recycled waste at home", 15],
      ["Complimented someone sincerely", 10],
      ["Gave up your seat / priority", 10],
      ["Donated old clothes / books", 25],
      ["Checked on someone who's struggling", 20],
    ],
  );
  assert.equal(new Set(goodDeedCatalog.map((deed) => deed.id)).size, 6);
  assert.equal(goodDeedCatalog.reduce((total, deed) => total + deed.reward, 0), 100);
});

test("good deed submissions allocate rewards only for newly completed actions", () => {
  const successful = goodDeedSubmissionResult([
    { completedNow: true, reward: 20 },
    { completedNow: true, reward: 15 },
  ]);
  assert.deepEqual(successful, { reward: 35, completedCount: 2, alreadyCompleted: 0 });
  assert.equal(treeGrowthFor(18, successful.completedCount).points, 20);

  assert.deepEqual(
    goodDeedSubmissionResult([
      { completedNow: false, reward: 20 },
      { completedNow: false, reward: 15 },
    ]),
    { reward: 0, completedCount: 0, alreadyCompleted: 2 },
  );

  assert.deepEqual(
    goodDeedSubmissionResult([
      { completedNow: false, reward: 20 },
      { completedNow: true, reward: 15 },
    ]),
    { reward: 15, completedCount: 1, alreadyCompleted: 1 },
  );
});

test("tree growth combines habit streak and completed care actions", () => {
  assert.deepEqual(treeGrowthFor(0, 0), {
    points: 0,
    stage: "Seedling",
    progress: 0,
    artworkWidth: 96,
  });
  assert.deepEqual(treeGrowthFor(18, 0), {
    points: 18,
    stage: "Budding",
    progress: 0.25,
    artworkWidth: 150,
  });
  assert.equal(treeGrowthFor(18, 1).artworkWidth, 153);
  assert.equal(treeGrowthFor(30, 0).stage, "Flourishing");
});
