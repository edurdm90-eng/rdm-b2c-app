import { Goal, RdmProfile } from "@rdm-b2c/db";
import { TRPCError } from "@trpc/server";

import { dayKeyForTimeZone, goalDurationWindow } from "../domain/rdm";

type GoalDocument = ReturnType<typeof Goal.hydrate>;
type DayEntry = {
  dayKey: string; outcome: "completed" | "missed"; note: string;
  operationId?: string | null; settledAt: Date;
};
const entriesFor = (goal: GoalDocument) => Array.from(goal.dayEntries as unknown as ArrayLike<DayEntry>);
type RecordCare = (input: {
  userId: string; kind: "fertilizer"; operationId: string; dayKey: string;
  timeZone: string; occurredAt: Date;
}) => Promise<unknown>;

function commitmentDayKeys(goal: GoalDocument) {
  const window = goalDurationWindow(goal.startDayKey, goal.durationDays);
  if (!window || window.endDayKey !== goal.endDayKey || !goal.pledgePerDay
    || goal.pledgeAmount !== goal.durationDays * goal.pledgePerDay) {
    throw new TRPCError({ code: "CONFLICT", message: "This goal's daily allocation could not be verified." });
  }
  const start = new Date(`${goal.startDayKey}T00:00:00.000Z`).getTime();
  return Array.from({ length: goal.durationDays }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

export function dailyGoalView(goal: GoalDocument) {
  const daily = goal.fundingMode === "daily";
  const currentDayKey = dayKeyForTimeZone(new Date(), goal.timeZone);
  const dayEntries = entriesFor(goal).map((entry) => ({
    dayKey: entry.dayKey, outcome: entry.outcome, note: entry.note,
    operationId: entry.operationId ?? null, settledAt: entry.settledAt.toISOString(),
  }));
  const todayEntry = dayEntries.find((entry) => entry.dayKey === currentDayKey);
  const todayStatus = currentDayKey < goal.startDayKey ? "upcoming" as const
    : todayEntry ? todayEntry.outcome
      : currentDayKey >= goal.endDayKey || goal.status !== "active" ? "ended" as const : "pending" as const;
  return {
    fundingMode: daily ? "daily" as const : "outcome" as const,
    pledgePerDay: daily ? goal.pledgePerDay ?? null : null,
    remainingPledge: daily ? Number(goal.remainingPledge ?? goal.pledgeAmount) : goal.settledAt ? 0 : goal.pledgeAmount,
    completedDayCount: dayEntries.filter((entry) => entry.outcome === "completed").length,
    missedDayCount: dayEntries.filter((entry) => entry.outcome === "missed").length,
    dayEntries,
    todayStatus,
    canReflect: daily && goal.status === "active" && todayStatus === "pending",
    canComplete: goal.status === "active" && currentDayKey >= goal.startDayKey && currentDayKey < goal.endDayKey
      && (!daily || goal.remainingPledge === 0),
  };
}

async function settleDayWallet(goal: GoalDocument, entry: DayEntry, userId: string, recordCare: RecordCare) {
  const operationId = `goal-day:${goal._id}:${entry.dayKey}`;
  const lockOperationId = `goal-stake:${goal._id}`;
  const amount = Number(goal.pledgePerDay);
  const completed = entry.outcome === "completed";
  const credited = await RdmProfile.findOneAndUpdate(
    { userId, creditedOperations: { $all: [lockOperationId], $ne: operationId } },
    {
      $inc: { walletBalance: amount, [completed ? "rewardBalance" : "remorseBalance"]: amount },
      $addToSet: { creditedOperations: operationId },
      $push: { transactions: { $each: [{
        title: `${completed ? "Goal reflection" : "Goal day missed"} — ${goal.title} (${entry.dayKey})`,
        amount: completed ? amount : -amount, kind: completed ? "goal" : "remorse",
        operationId, createdAt: entry.settledAt,
      }], $position: 0 } },
    },
    { returnDocument: "after" },
  );
  if (!credited && !await RdmProfile.exists({ userId, creditedOperations: { $all: [lockOperationId, operationId] } })) {
    throw new TRPCError({ code: "CONFLICT", message: "This goal's funded daily pledge could not be verified." });
  }
  if (completed) {
    await recordCare({ userId, kind: "fertilizer", operationId, dayKey: entry.dayKey, timeZone: goal.timeZone, occurredAt: entry.settledAt });
  }
}

// Persist the day's decision before crediting it. The immutable decision and wallet
// receipt let reads safely recover an interruption without choosing a new outcome.
export async function reconcileDailyGoal(goal: GoalDocument, userId: string, recordCare: RecordCare) {
  if (goal.fundingStatus !== "funded") return goal;
  const dayKeys = commitmentDayKeys(goal);
  let current = goal;
  const currentDayKey = dayKeyForTimeZone(new Date(), goal.timeZone);
  for (const dayKey of dayKeys) {
    if (dayKey >= currentDayKey && current.status !== "missed") continue;
    if (entriesFor(current).some((entry) => entry.dayKey === dayKey)) continue;
    const updated = await Goal.findOneAndUpdate(
      {
        _id: current._id, userId, fundingMode: "daily", fundingStatus: "funded",
        "dayEntries.dayKey": { $ne: dayKey }, remainingPledge: { $gte: Number(current.pledgePerDay) },
      },
      {
        $inc: { remainingPledge: -Number(current.pledgePerDay), progressVersion: 1 },
        $push: { dayEntries: {
          dayKey, outcome: "missed", settledAt: new Date(),
          note: current.status === "missed" ? "Remaining day forfeited when the goal was marked missed." : "Daily reflection was not submitted before the day ended.",
        } },
      },
      { returnDocument: "after" },
    );
    current = updated ?? await Goal.findOne({ _id: current._id, userId }) ?? current;
  }
  // Reload because a parallel reflection or explicit outcome may have won a day.
  current = await Goal.findOne({ _id: current._id, userId }) ?? current;
  for (const entry of entriesFor(current)) await settleDayWallet(current, entry, userId, recordCare);
  if (current.status === "active" && currentDayKey >= current.endDayKey) {
    current = await Goal.findOneAndUpdate(
      { _id: current._id, userId, status: "active" },
      {
        $set: { status: "missed", active: false, outcomeAt: new Date() },
        $inc: { progressVersion: 1 },
        $push: { progressUpdates: {
          requestId: `goal-expire:${current._id}`, progress: current.progress, status: "missed",
          note: "The goal deadline was reached. Daily Reward allocations remain unchanged.", recordedAt: new Date(),
        } },
      },
      { returnDocument: "after" },
    ) ?? await Goal.findOne({ _id: current._id, userId }) ?? current;
  }
  if (current.status !== "active" && current.remainingPledge === 0 && !current.settledAt) {
    current = await Goal.findOneAndUpdate(
      { _id: current._id, userId, settledAt: { $exists: false }, remainingPledge: 0 },
      { $set: { settledAt: new Date() } },
      { returnDocument: "after" },
    ) ?? current;
  }
  return current;
}

export async function reflectDailyGoal({ id, userId, operationId, note, expectedVersion, recordCare }: {
  id: string; userId: string; operationId: string; note: string; expectedVersion?: number; recordCare: RecordCare;
}) {
  const found = await Goal.findOne({ _id: id, userId, fundingStatus: "funded" });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  if (found.fundingMode !== "daily") throw new TRPCError({ code: "BAD_REQUEST", message: "This existing goal uses a whole-goal pledge, not daily reflection funding." });
  const current = await reconcileDailyGoal(found, userId, recordCare);
  const previous = entriesFor(current).find((entry) => entry.operationId === operationId);
  if (previous) {
    if (previous.note !== note) throw new TRPCError({ code: "CONFLICT", message: "This reflection attempt already has different details." });
    return current;
  }
  const now = new Date();
  const dayKey = dayKeyForTimeZone(now, current.timeZone);
  if (!dailyGoalView(current).canReflect) throw new TRPCError({ code: "CONFLICT", message: "Today's reflection is already recorded or this goal is outside its active dates." });
  if (expectedVersion !== undefined && current.progressVersion !== expectedVersion) {
    throw new TRPCError({ code: "CONFLICT", message: "This goal was updated elsewhere. Refresh it before reflecting." });
  }
  const updated = await Goal.findOneAndUpdate(
    {
      _id: id, userId, fundingMode: "daily", fundingStatus: "funded", status: "active",
      progressVersion: current.progressVersion, "dayEntries.dayKey": { $ne: dayKey },
      "dayEntries.operationId": { $ne: operationId }, remainingPledge: { $gte: Number(current.pledgePerDay) },
    },
    {
      $inc: { remainingPledge: -Number(current.pledgePerDay), progressVersion: 1 },
      $push: { dayEntries: { dayKey, outcome: "completed", note, operationId, settledAt: now } },
    },
    { returnDocument: "after" },
  );
  if (updated) return reconcileDailyGoal(updated, userId, recordCare);
  const latest = await Goal.findOne({ _id: id, userId });
  const recorded = latest ? entriesFor(latest).find((entry) => entry.operationId === operationId) : undefined;
  if (latest && recorded?.note === note) return reconcileDailyGoal(latest, userId, recordCare);
  throw new TRPCError({ code: "CONFLICT", message: "This goal changed or today's reflection was already recorded. Refresh it before continuing." });
}
