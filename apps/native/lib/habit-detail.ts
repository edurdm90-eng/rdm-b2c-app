import { dayKeyForTimeZone, habitPledgeSchedule } from "@rdm-b2c/api/domain/rdm";
import type { AppRouter } from "@rdm-b2c/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

export type HabitDetail = inferRouterOutputs<AppRouter>["rdm"]["habits"]["byId"];
export type HabitDetailState = "act" | "reflect" | "completed" | "missed" | "rest" | "upcoming" | "finished" | "inactive";

export type HabitDetailPresentation = {
  todayDayKey: string;
  state: HabitDetailState;
  completedCount: number;
  missedCount: number;
  totalDays: number | null;
  remainingDays: number | null;
  nextDayKey: string | null;
  rewardAmount: number;
  missedAmount: number;
};

/** Presentation only: the API remains responsible for reconciliation and settlement. */
export function getHabitDetailPresentation(habit: HabitDetail, now = new Date()): HabitDetailPresentation {
  const pledge = habit.rdmPledge;
  const todayDayKey = dayKeyForTimeZone(now, pledge?.timeZone ?? "Asia/Kolkata");
  const schedule = pledge ? habitPledgeSchedule({
    startDayKey: pledge.startDayKey,
    endDayKey: pledge.endDayKey,
    dailyPledge: pledge.perDay,
    weekdays: pledge.weekdays,
  }) : null;
  const scheduled = schedule ? new Set(schedule.dayKeys) : null;
  const belongsToCommitment = (dayKey: string) => !scheduled || scheduled.has(dayKey);
  const completed = new Set([
    ...(pledge?.completedDayKeys ?? []),
    ...(habit.lastCompletedDayKey ? [habit.lastCompletedDayKey] : []),
    ...habit.history.filter((entry) => entry.outcome === "completed").map((entry) => entry.dayKey),
  ].filter(belongsToCommitment));
  const settled = new Set([
    ...(pledge?.settledDayKeys ?? []),
    ...habit.history.map((entry) => entry.dayKey),
    ...completed,
  ].filter(belongsToCommitment));
  const missed = new Set([...settled].filter((dayKey) => !completed.has(dayKey)));
  const nextDayKey = schedule?.dayKeys.find((dayKey) => dayKey >= todayDayKey && !settled.has(dayKey)) ?? null;

  let state: HabitDetailState;
  // The final settlement can deactivate a commitment immediately. Its actual
  // outcome still belongs on today's screen, but must not carry into later days.
  if (completed.has(todayDayKey)) state = "completed";
  else if (missed.has(todayDayKey)) state = "missed";
  else if (pledge && schedule) {
    if (todayDayKey >= pledge.endDayKey || pledge.remaining <= 0) state = "finished";
    else if (!habit.active) state = "inactive";
    else if (todayDayKey < (schedule.dayKeys[0] ?? pledge.startDayKey)) state = "upcoming";
    else if (!scheduled?.has(todayDayKey)) state = "rest";
    else if (pledge.currentDayKey !== todayDayKey) state = "inactive";
    else if (habit.stage === "act" || habit.stage === "reflect") state = habit.stage;
    else state = "inactive";
  } else if (!pledge && habit.active && (habit.stage === "act" || habit.stage === "reflect")) {
    state = habit.stage;
  } else state = "inactive";

  return {
    todayDayKey,
    state,
    completedCount: completed.size,
    missedCount: missed.size,
    totalDays: schedule?.dayCount ?? null,
    remainingDays: schedule ? schedule.dayKeys.filter((dayKey) => !settled.has(dayKey)).length : null,
    nextDayKey,
    rewardAmount: pledge?.perDay ?? 25,
    missedAmount: pledge?.perDay ?? 10,
  };
}
