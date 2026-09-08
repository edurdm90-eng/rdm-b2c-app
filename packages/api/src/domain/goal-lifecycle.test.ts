import assert from "node:assert/strict";
import test from "node:test";

import { personalGoalTransition } from "./goal-lifecycle";

test("a personal goal records partial progress without releasing its pledge", () => {
  assert.deepEqual(personalGoalTransition({
    goal: { status: "active", progress: 0, startDayKey: "2026-09-05", endDayKey: "2026-10-05" },
    command: { type: "progress", progress: 45 },
    currentDayKey: "2026-09-08",
  }), { progress: 45, status: "active", destination: null });
});

test("a completed goal settles once to Reward and cannot become missed", () => {
  const goal = { status: "active" as const, progress: 45, startDayKey: "2026-09-05", endDayKey: "2026-10-05" };
  const completed = personalGoalTransition({ goal, command: { type: "complete" }, currentDayKey: "2026-10-04" });
  assert.deepEqual(completed, { progress: 100, status: "completed", destination: "reward" });
  assert.throws(() => personalGoalTransition({
    goal: { ...goal, ...completed }, command: { type: "miss" }, currentDayKey: "2026-10-06",
  }), /already completed/);
});

test("an incomplete goal expires at its exclusive deadline and preserves recorded progress", () => {
  const goal = { status: "active" as const, progress: 60, startDayKey: "2026-09-05", endDayKey: "2026-09-10" };
  assert.deepEqual(personalGoalTransition({ goal, command: { type: "expire" }, currentDayKey: "2026-09-10" }), {
    progress: 60, status: "missed", destination: "remorse",
  });
  assert.throws(() => personalGoalTransition({ goal, command: { type: "complete" }, currentDayKey: "2026-09-10" }), /deadline/);
  assert.throws(() => personalGoalTransition({ goal, command: { type: "expire" }, currentDayKey: "2026-09-09" }), /not ended/);
});

test("a user can acknowledge a missed goal but cannot complete it before it starts", () => {
  const goal = { status: "active" as const, progress: 35, startDayKey: "2026-09-05", endDayKey: "2026-09-10" };
  assert.deepEqual(personalGoalTransition({ goal, command: { type: "miss" }, currentDayKey: "2026-09-08" }), {
    progress: 35, status: "missed", destination: "remorse",
  });
  assert.throws(() => personalGoalTransition({ goal, command: { type: "complete" }, currentDayKey: "2026-09-04" }), /not started/);
  for (const progress of [-1, 100, 101, 1.5, Number.NaN]) {
    assert.throws(() => personalGoalTransition({ goal, command: { type: "progress", progress }, currentDayKey: "2026-09-08" }), /0 and 99/);
  }
});
