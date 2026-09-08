import assert from "node:assert/strict";
import test from "node:test";

import { planLegacyDemoCleanup } from "./demo-cleanup";

const profile = {
  userId: "test-user", xp: 640, level: 7, streak: 18, plantStage: "Budding",
  walletBalance: 1240, rewardBalance: 320, remorseBalance: 40, peerBalance: 15,
  treePledgeAmount: 0, treeWaterCount: 0, treeSunlightCount: 0,
  creditedOperations: [], unlockedBadges: [],
  transactions: [
    { title: "Deep Work Focus — reflection", amount: 25, kind: "habit" },
    { title: "Word Sprint game", amount: 8, kind: "game" },
    { title: "Missed pledge — Hydration", amount: -10, kind: "remorse" },
    { title: "Awarded by Family group", amount: 15, kind: "peer" },
    { title: "Gift to Plant a Tree Trust", amount: -20, kind: "charity" },
  ],
};

const habit = {
  userId: "test-user", title: "Deep Work Focus", category: "Focus", icon: "target",
  cadence: "Daily", target: "90 minutes",
  pledge: "90 minutes of undistracted work, phone in another room, every weekday after lunch.",
  source: "template", stage: "reflect", streak: 18, cycle: 1, active: true,
  lastAction: "Logged today · 92 minutes · No interruptions",
  reflection: "Felt easier today — putting the phone in the other room really helped.",
  completedDays: [1, 2, 3],
};

test("an untouched legacy profile with only the exact sample habit is eligible for backed-up cleanup", () => {
  assert.equal(planLegacyDemoCleanup({ profile, habits: [habit], relatedActivityCount: 0 }).action, "reset");
});

test("a sample-shaped habit belonging to another account never authorizes cleanup", () => {
  assert.equal(planLegacyDemoCleanup({
    profile, habits: [{ ...habit, userId: "someone-else" }], relatedActivityCount: 0,
  }).action, "review");
});

test("modified sample habits and real alongside-sample habits are preserved for review", () => {
  for (const changed of [
    { ...habit, reflection: "My own genuine reflection" },
    { ...habit, rdmPledgeCreationId: "real-pledge-id" },
    { ...habit, completedDays: [1, 2, 3, 4] },
    { ...habit, title: "My real habit" },
  ]) {
    assert.equal(planLegacyDemoCleanup({ profile, habits: [changed], relatedActivityCount: 0 }).action, "review");
  }
  assert.equal(planLegacyDemoCleanup({
    profile, habits: [habit, { ...habit, title: "My real habit" }], relatedActivityCount: 0,
  }).action, "review");
});

test("any real financial transaction or linked activity prevents resetting a legacy profile", () => {
  assert.equal(planLegacyDemoCleanup({ profile, habits: [habit], relatedActivityCount: 1 }).action, "review");
  for (const changed of [
    { ...profile, walletBalance: 1241 },
    { ...profile, xp: 641 },
    { ...profile, creditedOperations: ["real-credit"] },
    { ...profile, treePledgedAt: new Date("2026-09-01") },
    { ...profile, transactions: [...profile.transactions, { title: "Real action", kind: "habit", amount: 10 }] },
    { ...profile, transactions: profile.transactions.map((transaction) => ({ ...transaction, operationId: "real-operation" })) },
  ]) {
    assert.equal(planLegacyDemoCleanup({ profile: changed, habits: [habit], relatedActivityCount: 0 }).action, "review");
  }
});

test("versioned profiles are excluded and exact initial badges can be removed only for untouched users", () => {
  assert.equal(planLegacyDemoCleanup({ profile: { ...profile, dataVersion: 1 }, habits: [habit], relatedActivityCount: 0 }).action, "skip");
  assert.equal(planLegacyDemoCleanup({
    profile: { ...profile, unlockedBadges: ["first-sprout", "seven-day-streak", "group-starter", "first-game", "three-day", "community-hand", "hydration-start", "thirty-pledges", "first-charity"] },
    habits: [habit], relatedActivityCount: 0,
  }).action, "reset");
  assert.equal(planLegacyDemoCleanup({
    profile: { ...profile, unlockedBadges: ["reflection-journal"] }, habits: [habit], relatedActivityCount: 0,
  }).action, "review");
});
