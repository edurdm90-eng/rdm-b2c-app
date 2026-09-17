import assert from "node:assert/strict";
import test from "node:test";

import { getHabitDetailPresentation, type HabitDetail } from "../../native/lib/habit-detail";

const friday = new Date("2026-09-11T12:00:00.000Z");
type Pledge = NonNullable<HabitDetail["rdmPledge"]>;

function habit(overrides: Partial<HabitDetail> = {}, pledgeOverrides: Partial<Pledge> = {}): HabitDetail {
  return {
    id: "507f1f77bcf86cd799439011",
    wisdomPracticeId: null,
    wisdom: null,
    title: "Read a few pages",
    category: "Focus",
    icon: "book-open-variant-outline",
    cadence: "Daily",
    target: "Read every day",
    pledge: "I will read after breakfast.",
    source: "custom",
    stage: "act",
    streak: 0,
    lastAction: null,
    reflection: null,
    lastOutcome: null,
    lastCompletedDayKey: null,
    completedDays: [],
    weekProgress: [],
    history: [],
    active: true,
    rdmPledge: {
      perDay: 1,
      total: 7,
      remaining: 7,
      startDayKey: "2026-09-11",
      endDayKey: "2026-09-18",
      timeZone: "Asia/Kolkata",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      scheduledToday: true,
      settledToday: false,
      nextDayKey: "2026-09-11",
      dayCount: 7,
      settledDayKeys: [],
      completedDayKeys: [],
      currentDayKey: "2026-09-11",
      status: "active",
      ...pledgeOverrides,
    },
    ...overrides,
  };
}

function entry(dayKey: string, outcome: "completed" | "missed"): HabitDetail["history"][number] {
  return { dayKey, outcome, note: null, reflection: null, settledAt: null };
}

test("habit detail presents only active, current, scheduled action and reflection stages", () => {
  assert.equal(getHabitDetailPresentation(habit(), friday).state, "act");
  assert.equal(getHabitDetailPresentation(habit({ stage: "reflect" }), friday).state, "reflect");
  assert.equal(getHabitDetailPresentation(habit({ active: false }), friday).state, "inactive");
  assert.equal(getHabitDetailPresentation(habit({ stage: "reward" }), friday).state, "inactive");
  assert.equal(getHabitDetailPresentation(habit({}, { currentDayKey: "2026-09-10" }), friday).state, "inactive");
});

test("final-day completion wins over finished status and deactivation only on that day", () => {
  const completed = habit({ active: false, stage: "reward", lastOutcome: "completed", lastCompletedDayKey: "2026-09-11" }, {
    startDayKey: "2026-09-11", endDayKey: "2026-09-12", total: 1, remaining: 0, dayCount: 1,
    status: "finished", completedDayKeys: ["2026-09-11"], settledDayKeys: ["2026-09-11"],
  });
  const today = getHabitDetailPresentation(completed, friday);
  assert.equal(today.state, "completed");
  assert.equal(today.completedCount, 1);
  assert.equal(today.remainingDays, 0);
  assert.equal(today.nextDayKey, null);
  assert.equal(getHabitDetailPresentation(completed, new Date("2026-09-12T12:00:00Z")).state, "finished");
});

test("final-day missed settlement stays missed today, without inventing a completion", () => {
  const missed = habit({ active: false, stage: "reward", lastOutcome: "missed", history: [entry("2026-09-11", "missed")] }, {
    startDayKey: "2026-09-11", endDayKey: "2026-09-12", total: 1, remaining: 0, dayCount: 1,
    status: "finished", settledDayKeys: ["2026-09-11"],
  });
  const view = getHabitDetailPresentation(missed, friday);
  assert.equal(view.state, "missed");
  assert.equal(view.missedCount, 1);
  assert.equal(view.completedCount, 0);
  assert.equal(view.nextDayKey, null);
});

test("custom weekday schedule advances to the actual next day and preserves weekend rest", () => {
  const weekdays = habit({ stage: "reward", lastCompletedDayKey: "2026-09-11" }, {
    weekdays: [1, 2, 3, 4, 5], completedDayKeys: ["2026-09-11"], settledDayKeys: ["2026-09-11"], remaining: 4,
  });
  const doneFriday = getHabitDetailPresentation(weekdays, friday);
  assert.equal(doneFriday.state, "completed");
  assert.equal(doneFriday.nextDayKey, "2026-09-14");
  assert.equal(doneFriday.totalDays, 5);
  assert.equal(doneFriday.remainingDays, 4);
  const saturday = getHabitDetailPresentation(weekdays, new Date("2026-09-12T12:00:00Z"));
  assert.equal(saturday.state, "rest");
  assert.equal(saturday.nextDayKey, "2026-09-14");
});

test("upcoming uses the first scheduled weekday, not merely the start date", () => {
  const upcoming = habit({}, { startDayKey: "2026-09-12", endDayKey: "2026-09-19", weekdays: [1, 2, 3, 4, 5] });
  const view = getHabitDetailPresentation(upcoming, new Date("2026-09-13T12:00:00Z"));
  assert.equal(view.state, "upcoming");
  assert.equal(view.nextDayKey, "2026-09-14");
});

test("end-exclusive boundary never offers action or a later nonexistent scheduled day", () => {
  const finished = habit({}, { startDayKey: "2026-09-07", endDayKey: "2026-09-11" });
  const view = getHabitDetailPresentation(finished, friday);
  assert.equal(view.state, "finished");
  assert.equal(view.nextDayKey, null);
});

test("saved timezone determines today rather than the device or UTC date", () => {
  const midnight = new Date("2026-09-11T20:00:00Z");
  const india = getHabitDetailPresentation(habit({}, { currentDayKey: "2026-09-12" }), midnight);
  const la = getHabitDetailPresentation(habit({}, { timeZone: "America/Los_Angeles" }), midnight);
  assert.equal(india.todayDayKey, "2026-09-12");
  assert.equal(india.state, "act");
  assert.equal(la.todayDayKey, "2026-09-11");
  assert.equal(la.state, "act");
});

test("counts deduplicate persisted dates across history, completed keys and last completion", () => {
  const duplicated = habit({
    lastCompletedDayKey: "2026-09-11",
    history: [entry("2026-09-10", "missed"), entry("2026-09-10", "missed"), entry("2026-09-11", "completed"), entry("2026-09-11", "completed")],
  }, {
    startDayKey: "2026-09-10", endDayKey: "2026-09-13", perDay: 4,
    completedDayKeys: ["2026-09-11", "2026-09-11"],
    settledDayKeys: ["2026-09-10", "2026-09-11", "2026-09-11"],
  });
  const view = getHabitDetailPresentation(duplicated, friday);
  assert.equal(view.completedCount, 1);
  assert.equal(view.missedCount, 1);
  assert.equal(view.remainingDays, 1);
  assert.equal(view.rewardAmount, 4);
  assert.equal(view.missedAmount, 4);
});

test("legacy habits require today's persisted outcome and retain their fixed allocation", () => {
  const legacy = habit({ rdmPledge: null, stage: "reward", lastOutcome: "completed", lastCompletedDayKey: "2026-09-10" });
  const stale = getHabitDetailPresentation(legacy, friday);
  assert.equal(stale.state, "inactive");
  assert.equal(stale.totalDays, null);
  assert.equal(stale.nextDayKey, null);
  assert.equal(stale.rewardAmount, 25);
  assert.equal(stale.missedAmount, 10);
  assert.equal(getHabitDetailPresentation({ ...legacy, lastCompletedDayKey: "2026-09-11" }, friday).state, "completed");
  assert.equal(getHabitDetailPresentation({ ...legacy, history: [entry("2026-09-11", "missed")] }, friday).state, "missed");
  assert.equal(getHabitDetailPresentation({ ...legacy, stage: "act" }, friday).state, "act");
});

test("legacy timezone fallback matches the API's Asia/Kolkata day boundary", () => {
  const legacy = habit({ rdmPledge: null, stage: "reward", lastCompletedDayKey: "2026-09-12" });
  const view = getHabitDetailPresentation(legacy, new Date("2026-09-11T20:00:00Z"));
  assert.equal(view.todayDayKey, "2026-09-12");
  assert.equal(view.state, "completed");
});
