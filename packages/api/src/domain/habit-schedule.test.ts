import assert from "node:assert/strict";
import test from "node:test";

import { habitPledgeSchedule, habitScheduleProgress, habitWeekProgress, missedHabitPledgeDayKeys } from "./rdm";

test("weekday pledges charge only the selected dates before the end boundary", () => {
  const schedule = habitPledgeSchedule({
    startDayKey: "2026-09-04",
    endDayKey: "2026-09-09",
    dailyPledge: 10,
    weekdays: [1, 2, 3, 4, 5],
  });
  assert.deepEqual(schedule, {
    dayKeys: ["2026-09-04", "2026-09-07", "2026-09-08"],
    dayCount: 3,
    totalPledge: 30,
  });
  assert.deepEqual(
    missedHabitPledgeDayKeys(schedule!.dayKeys, ["2026-09-04"], "2026-09-08"),
    ["2026-09-07"],
  );
});

test("a rest day preserves a scheduled streak and never becomes a completion day", () => {
  assert.deepEqual(habitScheduleProgress({
    scheduledDayKeys: ["2026-09-04", "2026-09-07", "2026-09-09"],
    settledDayKeys: ["2026-09-04", "2026-09-04"],
    completedDayKeys: ["2026-09-04", "2026-09-04", "2026-09-05"],
    currentDayKey: "2026-09-05",
  }), { streak: 1, scheduledToday: false, settledToday: false, nextDayKey: "2026-09-07" });
});

test("this week shows actual dated completions rather than last week's weekdays", () => {
  const week = habitWeekProgress(["2026-08-31", "2026-09-01", "2026-09-07"], "2026-09-08");
  assert.deepEqual(week, [
    { dayKey: "2026-09-07", completed: true },
    { dayKey: "2026-09-08", completed: false },
    { dayKey: "2026-09-09", completed: false },
    { dayKey: "2026-09-10", completed: false },
    { dayKey: "2026-09-11", completed: false },
    { dayKey: "2026-09-12", completed: false },
    { dayKey: "2026-09-13", completed: false },
  ]);
});

test("reconciliation settles each missed scheduled date once even when inputs repeat", () => {
  assert.deepEqual(missedHabitPledgeDayKeys(
    ["2026-09-09", "2026-09-07", "2026-09-07", "2026-09-11"],
    ["2026-09-09", "2026-09-09"],
    "2026-09-11",
  ), ["2026-09-07"]);
});

test("commitments with no stored weekdays retain their original daily funding amount", () => {
  assert.deepEqual(habitPledgeSchedule({
    startDayKey: "2026-09-04", endDayKey: "2026-09-09", dailyPledge: 10,
  }), {
    dayKeys: ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"],
    dayCount: 5,
    totalPledge: 50,
  });
});

test("custom weekly schedules never charge their end date and reject empty commitments", () => {
  assert.deepEqual(habitPledgeSchedule({
    startDayKey: "2026-09-07", endDayKey: "2026-09-14", dailyPledge: 12, weekdays: [1, 3, 5],
  }), { dayKeys: ["2026-09-07", "2026-09-09", "2026-09-11"], dayCount: 3, totalPledge: 36 });
  assert.equal(habitPledgeSchedule({
    startDayKey: "2026-09-05", endDayKey: "2026-09-07", dailyPledge: 10, weekdays: [1, 2, 3, 4, 5],
  }), null);
  assert.equal(habitPledgeSchedule({
    startDayKey: "2026-09-05", endDayKey: "2026-09-10", dailyPledge: 10, weekdays: [],
  }), null);
  assert.equal(habitPledgeSchedule({
    startDayKey: "2026-09-05", endDayKey: "2026-09-10", dailyPledge: 10, weekdays: [0, 8],
  }), null);
});

test("missing a scheduled date resets the streak, while today's pending date does not", () => {
  const progress = habitScheduleProgress({
    scheduledDayKeys: ["2026-09-04", "2026-09-07", "2026-09-09", "2026-09-11"],
    settledDayKeys: ["2026-09-04", "2026-09-07", "2026-09-09"],
    completedDayKeys: ["2026-09-04", "2026-09-09"],
    currentDayKey: "2026-09-11",
  });
  assert.deepEqual(progress, {
    streak: 1, scheduledToday: true, settledToday: false, nextDayKey: "2026-09-11",
  });
  assert.equal(habitScheduleProgress({
    scheduledDayKeys: ["2026-09-04", "2026-09-07"],
    settledDayKeys: ["2026-09-04", "2026-09-07"],
    completedDayKeys: ["2026-09-04"],
    currentDayKey: "2026-09-07",
  }).streak, 0);
});
