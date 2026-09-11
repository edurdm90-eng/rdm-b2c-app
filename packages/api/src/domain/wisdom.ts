export const haraHachiBu = {
  id: "hara-hachi-bu",
  title: "Hara Hachi Bu",
  japaneseName: "腹八分目",
  category: "Health",
  icon: "rice",
  cadence: "Daily",
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  description: "A Japanese-inspired mindful-eating practice: pause, notice your experience, and reflect without judging yourself.",
  target: "Notice one eating experience and write an honest daily reflection.",
  pledge: "I will pause to notice an eating experience and reflect honestly each day, including difficult days.",
  reflectionPrompt: "What did you notice about your eating experience today?",
} as const;

export const wisdomDisabledBonusPolicy = "disabled-v1";

type WisdomHabitState = {
  practiceId?: string | null;
  fundingStatus?: string;
  schedule: { dayKeys: readonly string[]; endDayKey: string } | null;
  currentDayKey: string;
  completedDayKeys: readonly string[];
  settledDayKeys: readonly string[];
  remainingPledge: number;
};

type ConsistencyStatus = "pending_funding" | "upcoming" | "in_progress" | "missed" | "perfect";

type WisdomHabitView = {
  practiceId: typeof haraHachiBu.id;
  completedDays: number;
  totalDays: number;
  missedDays: number;
  unresolvedDays: number;
  consistencyStatus: ConsistencyStatus;
  bonus: { eligible: false; status: "disabled"; amount: 0 };
};

export function wisdomHabitView(state: WisdomHabitState): WisdomHabitView | null {
  if (state.practiceId !== haraHachiBu.id) return null;
  const days = [...new Set(state.schedule?.dayKeys ?? [])];
  const completed = new Set(state.completedDayKeys);
  const settled = new Set(state.settledDayKeys);
  const completedDays = days.filter((day) => completed.has(day) && settled.has(day)).length;
  const missedDays = days.filter((day) => settled.has(day) && !completed.has(day)).length;
  const unresolvedDays = days.length - completedDays - missedDays;
  const perfect = Boolean(state.schedule && state.currentDayKey >= state.schedule.endDayKey
    && days.length > 0 && completedDays === days.length && state.remainingPledge === 0);
  const consistencyStatus: ConsistencyStatus = state.fundingStatus !== "funded" ? "pending_funding"
    : missedDays > 0 ? "missed" : perfect ? "perfect"
      : days[0] && state.currentDayKey < days[0] ? "upcoming" : "in_progress";
  return {
    practiceId: haraHachiBu.id,
    completedDays,
    totalDays: days.length,
    missedDays,
    unresolvedDays,
    consistencyStatus,
    // No payout path exists until a bonus amount and funding policy are approved.
    bonus: { eligible: false as const, status: "disabled" as const, amount: 0 as const },
  };
}
