import assert from "node:assert/strict";
import test from "node:test";

import {
  awardSplitIsValid,
  badgeCatalog,
  basePurseAfterPledge,
  basePurseBalance,
  baseToRemorseTransfer,
  calendarDayKeysAfter,
  dayKeyForTimeZone,
  debitPurseBalances,
  gameCatalog,
  gameDurationLabel,
  gameDayKey,
  gameSessionCanResume,
  goodDeedCatalog,
  goodDeedSubmissionResult,
  gratitudeCategories,
  goalDurationWindow,
  groupAwardAmounts,
  groupAwardCredits,
  groupContributionPeriodKey,
  groupGoalStatusForDay,
  groupPledgeTotal,
  habitCanStartNextCycle,
  habitPledgeDestinationForOperation,
  habitPledgeSchedule,
  initialBadgeIds,
  inviteWeekKey,
  levelForXp,
  missedHabitPledgeDayKeys,
  missedTreeDayKey,
  previousDayKeyForTimeZone,
  rewardToRemorseTransfer,
  rewardCatalog,
  rewardForGame,
  releaseHabitPledgeBalances,
  treeGrowthFor,
} from "./rdm";
import { evaluateGameAction, gamePromptFor, memoryBoardForSeed } from "./game-rules";

test("responsible games cap rewards and normalize duration", () => {
  assert.equal(rewardForGame(2, 340), 7);
  assert.equal(rewardForGame(30, 5000), 12);
  assert.equal(rewardForGame(0, -50), 2);
});

test("responsible games expose all seven reference experiences and exact time limits", () => {
  assert.deepEqual(
    gameCatalog.map(({ id, durationSeconds }) => ({ id, durationSeconds })),
    [
      { id: "focus-flow", durationSeconds: 90 },
      { id: "aptitude-bliss", durationSeconds: 120 },
      { id: "memory-match", durationSeconds: 120 },
      { id: "unscramble-word", durationSeconds: 60 },
      { id: "gratitude-tap", durationSeconds: 120 },
      { id: "box-breathing", durationSeconds: 60 },
      { id: "sort-sprint", durationSeconds: 180 },
    ],
  );
  assert.equal(gameDurationLabel(90), "1.5");
  assert.equal(gameDurationLabel(180), "3");
});

test("aptitude answers are scored from server-owned question rules", () => {
  assert.deepEqual(
    evaluateGameAction({
      action: { type: "answer", value: "B" },
      actionCount: 0,
      gameId: "aptitude-bliss",
      matchedIndexes: [],
    }),
    {
      accepted: true,
      actionDelta: 1,
      correct: true,
      matchedIndexes: [],
      movesDelta: 0,
      scoreDelta: 20,
    },
  );
  assert.equal(evaluateGameAction({
    action: { type: "answer", value: "A" },
    actionCount: 0,
    gameId: "aptitude-bliss",
    matchedIndexes: [],
  }).scoreDelta, 0);
});

test("aptitude prompts expose all ten reference questions without their answers", () => {
  assert.deepEqual(gamePromptFor("aptitude-bliss", 9), {
    kind: "aptitude",
    options: [
      { label: "A", text: "162" },
      { label: "B", text: "213" },
      { label: "C", text: "243" },
      { label: "D", text: "324" },
    ],
    question: "Which number completes the pattern? 3, 9, 27, 81, ...",
    questionNumber: 10,
    totalQuestions: 10,
  });
  assert.equal(gamePromptFor("aptitude-bliss", 10), null);
});

test("word answers are normalized and only correct words advance the sprint", () => {
  assert.deepEqual(gamePromptFor("unscramble-word", 0), {
    kind: "unscramble",
    scrambled: "TIBAH",
    wordNumber: 1,
  });
  assert.equal(evaluateGameAction({
    action: { type: "answer", value: " habit " },
    actionCount: 0,
    gameId: "unscramble-word",
    matchedIndexes: [],
  }).scoreDelta, 10);
  assert.deepEqual(evaluateGameAction({
    action: { type: "answer", value: "faith" },
    actionCount: 0,
    gameId: "unscramble-word",
    matchedIndexes: [],
  }), {
    accepted: true,
    actionDelta: 0,
    correct: false,
    matchedIndexes: [],
    movesDelta: 0,
    scoreDelta: 0,
  });
});

test("focus taps add one server-owned point per accepted target", () => {
  assert.deepEqual(evaluateGameAction({
    action: { type: "focus_tap" },
    actionCount: 14,
    gameId: "focus-flow",
    matchedIndexes: [],
  }), {
    accepted: true,
    actionDelta: 1,
    correct: true,
    matchedIndexes: [],
    movesDelta: 0,
    scoreDelta: 1,
  });
});

test("gratitude taps and breathing cycles use their own server-owned scoring", () => {
  assert.equal(evaluateGameAction({
    action: { type: "gratitude_tap", value: "family" },
    actionCount: 0,
    gameId: "gratitude-tap",
    matchedIndexes: [],
  }).scoreDelta, 10);
  assert.equal(evaluateGameAction({
    action: { type: "breath_cycle" },
    actionCount: 2,
    gameId: "box-breathing",
    matchedIndexes: [],
  }).scoreDelta, 25);
});

test("sort sprint prompts never expose their server-owned answer", () => {
  assert.deepEqual(gamePromptFor("sort-sprint", 0), {
    kind: "sort",
    item: "Apple",
    options: ["Food", "Animal", "Object"],
    roundNumber: 1,
  });
  assert.equal(evaluateGameAction({
    action: { type: "answer", value: "Food" },
    actionCount: 0,
    gameId: "sort-sprint",
    matchedIndexes: [],
  }).scoreDelta, 15);
});

test("memory moves validate pairs and never score an already matched card", () => {
  const board = ["🌿", "⭐", "🌿", "⭐"];
  assert.deepEqual(evaluateGameAction({
    action: { type: "memory_pair", first: 0, second: 2 },
    actionCount: 0,
    gameId: "memory-match",
    matchedIndexes: [],
    memoryBoard: board,
  }), {
    accepted: true,
    actionDelta: 1,
    correct: true,
    matchedIndexes: [0, 2],
    movesDelta: 1,
    scoreDelta: 20,
  });
  assert.equal(evaluateGameAction({
    action: { type: "memory_pair", first: 0, second: 2 },
    actionCount: 1,
    gameId: "memory-match",
    matchedIndexes: [0, 2],
    memoryBoard: board,
  }).accepted, false);
});

test("memory boards are stable per session and contain exactly eight pairs", () => {
  const board = memoryBoardForSeed("session-123");
  const counts = new Map<string, number>();
  for (const icon of board) counts.set(icon, (counts.get(icon) ?? 0) + 1);
  assert.equal(board.length, 16);
  assert.equal([...counts.values()].every((count) => count === 2), true);
  assert.deepEqual(memoryBoardForSeed("session-123"), board);
  assert.notDeepEqual(memoryBoardForSeed("session-456"), board);
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

test("group pledges lock the full per-day or per-activity commitment", () => {
  assert.equal(groupPledgeTotal({
    basis: "per_day",
    durationDays: 30,
    expectedActivities: 12,
    pledgePerUnit: 5,
  }), 150);
  assert.equal(groupPledgeTotal({
    basis: "per_activity",
    durationDays: 30,
    expectedActivities: 12,
    pledgePerUnit: 10,
  }), 120);
  assert.equal(groupPledgeTotal({
    basis: "per_day",
    durationDays: 0,
    expectedActivities: 12,
    pledgePerUnit: 5,
  }), null);
  assert.equal(groupPledgeTotal({
    basis: "per_activity",
    durationDays: 30,
    expectedActivities: 0,
    pledgePerUnit: 5,
  }), null);
});

test("group reward structures distribute the complete pool by performance", () => {
  const contributions = [82, 96, 58, 32];
  assert.deepEqual(
    groupAwardAmounts({ contributions, pool: 300, structure: "winner_takes_all" }),
    [0, 300, 0, 0],
  );
  assert.deepEqual(
    groupAwardAmounts({ contributions, pool: 300, structure: "top_3" }),
    [90, 180, 30, 0],
  );
  assert.deepEqual(
    groupAwardAmounts({ contributions, pool: 300, structure: "win_as_group" }),
    [92, 107, 65, 36],
  );
  assert.equal(
    groupAwardAmounts({ contributions: [10, 5], pool: 300, structure: "top_3" }),
    null,
  );
});

test("active group goals expire at their exclusive end-day boundary", () => {
  assert.equal(groupGoalStatusForDay({
    currentDayKey: "2026-09-11",
    endDayKey: "2026-09-12",
    status: "active",
    targetHit: false,
  }), "active");
  assert.equal(groupGoalStatusForDay({
    currentDayKey: "2026-09-12",
    endDayKey: "2026-09-12",
    status: "active",
    targetHit: false,
  }), "expired");
  assert.equal(groupGoalStatusForDay({
    currentDayKey: "2026-09-12",
    endDayKey: "2026-09-12",
    status: "active",
    targetHit: true,
  }), "active");
  assert.equal(groupGoalStatusForDay({
    currentDayKey: "2026-09-12",
    endDayKey: "2026-09-12",
    status: "completed",
    targetHit: true,
  }), "completed");
});

test("group contribution periods follow the goal time zone and cadence", () => {
  const sundayUtc = new Date("2026-09-06T20:00:00.000Z");
  assert.equal(
    groupContributionPeriodKey(sundayUtc, "Asia/Kolkata", "daily"),
    "day:2026-09-07",
  );
  assert.equal(
    groupContributionPeriodKey(sundayUtc, "Asia/Kolkata", "weekly"),
    "week:2026-09-07",
  );
  assert.equal(
    groupContributionPeriodKey(new Date("2026-09-13T12:00:00.000Z"), "Asia/Kolkata", "weekly"),
    "week:2026-09-07",
  );
});

test("the badge framework exposes 24 achievements and new users earn every badge", () => {
  assert.equal(badgeCatalog.length, 24);
  assert.equal(new Set(badgeCatalog.map((badge) => badge.id)).size, 24);
  assert.equal(initialBadgeIds.length, 0);
  assert.equal(initialBadgeIds.every((id) => badgeCatalog.some((badge) => badge.id === id)), true);
});

test("redeemable rewards use server-owned ids and prices", () => {
  assert.deepEqual(rewardCatalog, [{ id: "focus-garden", title: "Focus Garden skin", cost: 50 }]);
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

test("a habit pledge locks one daily amount for each day before the end date", () => {
  assert.deepEqual(
    habitPledgeSchedule({
      startDayKey: "2026-09-05",
      endDayKey: "2026-09-10",
      dailyPledge: 10,
    }),
    {
      dayKeys: [
        "2026-09-05",
        "2026-09-06",
        "2026-09-07",
        "2026-09-08",
        "2026-09-09",
      ],
      dayCount: 5,
      totalPledge: 50,
    },
  );
});

test("a habit pledge rejects invalid or empty commitment windows", () => {
  assert.equal(
    habitPledgeSchedule({ startDayKey: "2026-09-10", endDayKey: "2026-09-05", dailyPledge: 10 }),
    null,
  );
  assert.equal(
    habitPledgeSchedule({ startDayKey: "2026-09-05", endDayKey: "2026-09-05", dailyPledge: 10 }),
    null,
  );
  assert.equal(
    habitPledgeSchedule({ startDayKey: "not-a-date", endDayKey: "2026-09-10", dailyPledge: 10 }),
    null,
  );
  assert.equal(
    habitPledgeSchedule({ startDayKey: "2026-09-05", endDayKey: "2026-09-10", dailyPledge: 0 }),
    null,
  );
});

test("habit reconciliation sends only past unsettled days to Remorse", () => {
  const scheduled = [
    "2026-09-05",
    "2026-09-06",
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
  ];
  assert.deepEqual(
    missedHabitPledgeDayKeys(scheduled, ["2026-09-05", "2026-09-07"], "2026-09-08"),
    ["2026-09-06"],
  );
  assert.deepEqual(
    missedHabitPledgeDayKeys(scheduled, ["2026-09-05", "2026-09-07"], "2026-09-10"),
    ["2026-09-06", "2026-09-08", "2026-09-09"],
  );
});

test("a persisted wallet operation preserves its habit outcome across retries", () => {
  const transactions = [
    { operationId: "habit-pledge:abc:2026-09-05", kind: "habit" },
    { operationId: "habit-pledge:abc:2026-09-06", kind: "remorse" },
  ];
  assert.equal(
    habitPledgeDestinationForOperation(transactions, "habit-pledge:abc:2026-09-05"),
    "reward",
  );
  assert.equal(
    habitPledgeDestinationForOperation(transactions, "habit-pledge:abc:2026-09-06"),
    "remorse",
  );
  assert.equal(habitPledgeDestinationForOperation(transactions, "missing"), null);
});

test("a personal goal duration uses an exclusive finish boundary", () => {
  assert.deepEqual(goalDurationWindow("2026-09-05", 30), {
    startDayKey: "2026-09-05",
    endDayKey: "2026-10-05",
    durationDays: 30,
  });
  assert.deepEqual(goalDurationWindow("2026-09-05", 90), {
    startDayKey: "2026-09-05",
    endDayKey: "2026-12-04",
    durationDays: 90,
  });
  assert.equal(goalDurationWindow("2026-09-05", 0), null);
  assert.equal(goalDurationWindow("invalid", 30), null);
});

test("settled habit pledges return locked RDM to Reward or Remorse without changing Base", () => {
  const afterCompletion = releaseHabitPledgeBalances(
    { balance: 950, reward: 100, remorse: 20, peer: 5 },
    "reward",
    10,
  );
  assert.deepEqual(afterCompletion, { balance: 960, reward: 110, remorse: 20, peer: 5 });
  assert.equal(basePurseBalance(afterCompletion), 825);

  const afterMiss = releaseHabitPledgeBalances(afterCompletion, "remorse", 10);
  assert.deepEqual(afterMiss, { balance: 970, reward: 110, remorse: 30, peer: 5 });
  assert.equal(basePurseBalance(afterMiss), 825);
});

test("missed tree care moves RDM from Reward to Remorse without destroying it", () => {
  assert.deepEqual(rewardToRemorseTransfer(320, 40, 10), {
    appliedAmount: 10,
    rewardBalance: 310,
    remorseBalance: 50,
  });
  assert.equal(rewardToRemorseTransfer(4, 12, 10), null);
});

test("tree creation stakes RDM from the Base Purse", () => {
  assert.equal(basePurseAfterPledge(865, 100), 765);
  assert.equal(basePurseAfterPledge(40, 100), null);
});

test("base purse contains only RDM not allocated to another purse", () => {
  assert.equal(basePurseBalance({ balance: 1240, reward: 320, remorse: 40, peer: 15 }), 865);
  assert.equal(basePurseBalance({ balance: 30, reward: 20, remorse: 20, peer: 0 }), 0);
});

test("invite progress resets on ISO week boundaries", () => {
  assert.equal(inviteWeekKey(new Date("2026-08-19T23:59:59.000Z")), "2026-W34");
  assert.equal(inviteWeekKey(new Date("2027-01-01T10:00:00.000Z")), "2026-W53");
});

test("expired or completed game sessions cannot resume", () => {
  const expiresAt = new Date("2026-08-19T10:03:00.000Z");
  assert.equal(gameSessionCanResume("running", expiresAt, new Date("2026-08-19T10:03:00.000Z")), true);
  assert.equal(gameSessionCanResume("running", expiresAt, new Date("2026-08-19T10:03:00.001Z")), false);
  assert.equal(gameSessionCanResume("complete", expiresAt, new Date("2026-08-19T10:02:00.000Z")), false);
});

test("missed pledges move available Base RDM to Remorse without changing the total", () => {
  assert.deepEqual(
    baseToRemorseTransfer({ balance: 21, reward: 10, remorse: 5, peer: 2 }, 10),
    {
      appliedPenalty: 4,
      wallet: { balance: 21, reward: 10, remorse: 9, peer: 2 },
    },
  );
  assert.deepEqual(
    baseToRemorseTransfer({ balance: 40, reward: 10, remorse: 5, peer: 5 }, 10),
    {
      appliedPenalty: 10,
      wallet: { balance: 40, reward: 10, remorse: 15, peer: 5 },
    },
  );
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
