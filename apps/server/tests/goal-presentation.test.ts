import assert from "node:assert/strict";
import test from "node:test";

import { canSubmitGoalReflection, getGoalPresentation, type Goal } from "../../native/lib/goal-presentation";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "507f1f77bcf86cd799439011", title: "Finish one book", category: "Focus", target: "Write five useful takeaways",
    durationDays: 20, startDayKey: "2026-09-11", endDayKey: "2026-10-01", timeZone: "Asia/Kolkata",
    pledgeAmount: 20, pledgePerDay: 1, remainingPledge: 20, fundingMode: "daily",
    why: null, steps: [], reflectionPrompt: null, progress: 25, progressVersion: 0,
    status: "active", active: true, upcoming: false, settled: false, outcomeAt: null,
    completedDayCount: 0, missedDayCount: 0, dayEntries: [], todayStatus: "pending", canReflect: true,
    canComplete: false, progressUpdates: [], ...overrides,
  };
}

test("goal calendar uses start-inclusive/end-exclusive days without Day 0 for an active goal", () => {
  const value = goal();
  const before = getGoalPresentation(value, new Date("2026-09-10T12:00:00Z"));
  assert.equal(before.upcoming, true);
  assert.equal(before.dayNumber, 0);
  assert.equal(before.canReflect, false);
  const first = getGoalPresentation(value, new Date("2026-09-11T12:00:00Z"));
  assert.equal(first.dayNumber, 1);
  assert.equal(first.canReflect, true);
  const final = getGoalPresentation(value, new Date("2026-09-30T12:00:00Z"));
  assert.equal(final.dayNumber, 20);
  assert.equal(final.canReflect, true);
  const after = getGoalPresentation(value, new Date("2026-10-01T12:00:00Z"));
  assert.equal(after.dayNumber, 20);
  assert.equal(after.ended, true);
  assert.equal(after.canReflect, false);
});

test("goal ordinal uses the saved timezone across a UTC date boundary", () => {
  const now = new Date("2026-09-11T20:00:00Z");
  assert.equal(getGoalPresentation(goal(), now).dayNumber, 2);
  assert.equal(getGoalPresentation(goal({ timeZone: "America/Los_Angeles" }), now).dayNumber, 1);
});

test("a settled day, completed goal, outcome-funded goal or server lock cannot expose reflection", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  for (const override of [
    { active: false }, { status: "completed" as const }, { status: "missed" as const },
    { canReflect: false }, { fundingMode: "outcome" as const },
    { dayEntries: [{ dayKey: "2026-09-11", outcome: "completed" as const, note: "Done", operationId: null, settledAt: now.toISOString() }] },
    { dayEntries: [{ dayKey: "2026-09-11", outcome: "missed" as const, note: "Missed", operationId: null, settledAt: now.toISOString() }] },
  ]) assert.equal(getGoalPresentation(goal(override), now).canReflect, false);
});

test("goal progress comes from the saved progress, not the elapsed-day percentage", () => {
  const view = getGoalPresentation(goal({ progress: 15 }), new Date("2026-09-20T12:00:00Z"));
  assert.equal(view.dayNumber, 10);
  assert.equal(view.progress, 15);
});

test("reflection submission rejects an overnight stale rendered day", () => {
  const afterMidnight = new Date("2026-09-11T18:31:00Z");
  assert.equal(canSubmitGoalReflection(goal(), "2026-09-11", null, afterMidnight), false);
});

test("reflection submission rejects yesterday's draft even after fresh goal data arrives", () => {
  const afterMidnight = new Date("2026-09-11T18:31:00Z");
  const refreshed = goal({ progressVersion: 1, missedDayCount: 1, remainingPledge: 19,
    dayEntries: [{ dayKey: "2026-09-11", outcome: "missed", note: "Day ended", operationId: null, settledAt: afterMidnight.toISOString() }],
  });
  assert.equal(getGoalPresentation(refreshed, afterMidnight).canReflect, true);
  assert.equal(canSubmitGoalReflection(refreshed, "2026-09-12", "2026-09-11", afterMidnight), false);
});

test("reflection submission permits the current rendered day with a current draft or no draft", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  assert.equal(canSubmitGoalReflection(goal(), "2026-09-11", "2026-09-11", now), true);
  assert.equal(canSubmitGoalReflection(goal(), "2026-09-11", null, now), true);
});

test("reflection submission still rejects a completed goal despite matching day keys", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  assert.equal(canSubmitGoalReflection(goal({ status: "completed", active: false }), "2026-09-11", "2026-09-11", now), false);
});
