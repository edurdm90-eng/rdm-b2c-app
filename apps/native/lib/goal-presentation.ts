import { dayKeyForTimeZone } from "@rdm-b2c/api/domain/rdm";
import type { AppRouter } from "@rdm-b2c/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

export type Goal = inferRouterOutputs<AppRouter>["rdm"]["goals"]["list"][number];

/** Calendar labels must use the goal's saved day boundary, not the device zone. */
export function getGoalPresentation(goal: Goal, now = new Date()) {
  const todayDayKey = dayKeyForTimeZone(now, goal.timeZone);
  const upcoming = todayDayKey < goal.startDayKey;
  const ended = todayDayKey >= goal.endDayKey;
  const elapsedDays = Math.floor((Date.parse(`${todayDayKey}T00:00:00Z`) - Date.parse(`${goal.startDayKey}T00:00:00Z`)) / 86_400_000);
  const dayNumber = Math.max(0, Math.min(goal.durationDays, elapsedDays + 1));
  return {
    todayDayKey,
    dayNumber,
    upcoming,
    ended,
    canReflect: goal.fundingMode === "daily" && goal.active && goal.status === "active"
      && goal.canReflect && !upcoming && !ended
      && !goal.dayEntries.some((entry) => entry.dayKey === todayDayKey),
    progress: Math.max(0, Math.min(100, goal.progress)),
  };
}

/** Keep an open reflection attached to the day the user saw and began writing. */
export function canSubmitGoalReflection(goal: Goal, displayedDayKey: string, draftDayKey: string | null, now = new Date()) {
  const live = getGoalPresentation(goal, now);
  return live.canReflect && live.todayDayKey === displayedDayKey
    && (!draftDayKey || draftDayKey === live.todayDayKey);
}
