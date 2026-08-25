import assert from "node:assert/strict";
import test from "node:test";

import {
  awardSplitIsValid,
  badgeCatalog,
  challengeForGame,
  debitPurseBalances,
  gameDayKey,
  gameSessionCanReward,
  gratitudeCategories,
  groupAwardCredits,
  initialBadgeIds,
  inviteWeekKey,
  levelForXp,
  missedPledgeBalances,
  rewardCatalog,
  rewardForGame,
  treeGrowthFor,
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
  assert.equal(gratitudeCategories.find((category) => category.id === "life")?.prompt, "What are you grateful for today?");
});

test("tree growth combines habit streak and completed water actions", () => {
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
