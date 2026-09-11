import { dayKeyForTimeZone } from "./rdm";

type FocusItem = {
  id: string;
  kind: "habit" | "goal";
  title: string;
  icon: string;
  perDay: number | null;
  stage: "act" | "reflect" | "progress";
};

type FocusHabit = {
  id: string; title: string; icon: string; active: boolean; stage: string;
  rdmPledge: {
    timeZone: string; scheduledToday: boolean; settledToday: boolean;
    completedDayKeys: string[]; perDay: number;
  } | null;
};
type FocusGoal = {
  id: string; title: string; fundingMode: "daily" | "outcome";
  startDayKey: string; endDayKey: string; timeZone: string;
  todayStatus: string; canReflect: boolean; active: boolean;
  outcomeAt: string | null;
  pledgePerDay: number | null;
};

// Count the saved schedule, not just active records: finishing the last day's
// reflection must not remove that commitment from today's denominator.
export function dailyFocus(habits: FocusHabit[], goals: FocusGoal[], now: Date) {
  let total = 0;
  let completed = 0;
  const items: FocusItem[] = [];
  for (const habit of habits) {
    const pledge = habit.rdmPledge;
    if (pledge) {
      if (!pledge.scheduledToday) continue;
      total += 1;
      if (pledge.completedDayKeys.includes(dayKeyForTimeZone(now, pledge.timeZone))) completed += 1;
      if (pledge.settledToday) continue;
    }
    if (habit.active && (habit.stage === "act" || habit.stage === "reflect")) {
      items.push({ id: habit.id, kind: "habit", title: habit.title, icon: habit.icon, perDay: pledge?.perDay ?? null, stage: habit.stage });
    }
  }
  for (const goal of goals) {
    const today = dayKeyForTimeZone(now, goal.timeZone);
    if (today < goal.startDayKey || today >= goal.endDayKey) continue;
    if (!goal.active && goal.outcomeAt && today > dayKeyForTimeZone(new Date(goal.outcomeAt), goal.timeZone)) continue;
    if (goal.fundingMode === "daily") {
      total += 1;
      if (goal.todayStatus === "completed") completed += 1;
      if (!goal.canReflect) continue;
    } else if (!goal.active) continue;
    items.push({ id: goal.id, kind: "goal", title: goal.title, icon: "bullseye-arrow", perDay: goal.pledgePerDay, stage: goal.fundingMode === "daily" ? "reflect" : "progress" });
  }
  items.sort((a, b) => Number(b.stage === "reflect") - Number(a.stage === "reflect") || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { completed, total, items };
}
