import { grantSignupAirdrop } from "@rdm-b2c/auth/signup-airdrop";
import {
  GameSession,
  Goal,
  GoalGroup,
  GoodDeedEntry,
  GratitudeEntry,
  Habit,
  RdmProfile,
  Referral,
  TreeCareActivity,
  goodDeedIds,
  gratitudeCategoryIds,
  habitOutcomes,
  habitSources,
  habitStages,
  treeCareKinds,
} from "@rdm-b2c/db";
import { env } from "@rdm-b2c/env/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { savedLeaderboard } from "../services/leaderboard";
import { hasMedaaCommitmentApproval } from "../services/medaa-commitment-approval";
import { dailyGoalView, reconcileDailyGoal, reflectDailyGoal } from "../services/daily-goals";
import { goalCreateInputSchema, habitCreateInputSchema } from "../domain/commitment-input";
import { wisdomHabitView, wisdomDisabledBonusPolicy } from "../domain/wisdom";
import { dailyFocus } from "../domain/daily-focus";
import { walletActivity } from "../domain/wallet-activity";
import {
  awardSplitIsValid,
  badgeCatalog,
  basePurseAfterPledge,
  basePurseBalance,
  baseToRemorseTransfer,
  calendarDayKeysAfter,
  dayKeyForTimeZone,
  gameDayKey,
  gameCatalog,
  gameIds,
  gameSessionCanResume,
  goodDeedById,
  goodDeedCatalog,
  goodDeedRewardMessage,
  goodDeedSubmissionResult,
  gratitudeCategories,
  gratitudeCategoryById,
  goalCategories,
  goalDurationWindow,
  groupAwardAmounts,
  groupAwardCredits,
  groupContributionPeriodKey,
  groupGoalCategories,
  groupGoalRewardStructures,
  groupGoalStatusForDay,
  groupPledgeTotal,
  habitCanStartNextCycle,
  habitCategories,
  habitPledgeDestinationForOperation,
  habitPledgeSchedule,
  habitScheduleProgress,
  habitWeekProgress,
  habitTemplates,
  initialBadgeIds,
  inviteWeekKey,
  isValidTimeZone,
  levelForXp,
  missedHabitPledgeDayKeys,
  previousDayKeyForTimeZone,
  rewardForGame,
  releaseHabitPledgeBalances,
  treeGrowthFor,
  treeMissedDayPenalty,
  type GameId,
  type WalletBalances,
} from "../domain/rdm";
import { evaluateGameAction, FOCUS_FLOW_CELL_COUNT, gamePromptFor, memoryBoardForSeed } from "../domain/game-rules";
import { availableTreePenalty, treeCareProgress } from "../domain/tree-progress";
import { personalGoalTransition, type PersonalGoalCommand, type PersonalGoalStatus } from "../domain/goal-lifecycle";

const nowIso = () => new Date().toISOString();
const GROUP_FUNDING_RESERVATION_MS = 5 * 60_000;
const numberArray = (value: unknown) => Array.isArray(value) ? value.map(Number) : [];
const mongoId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(isValidTimeZone, "Invalid time zone");
const goodDeedSelection = z
  .array(z.enum(goodDeedIds))
  .min(1)
  .max(goodDeedIds.length)
  .refine((ids) => new Set(ids).size === ids.length, "Choose each deed only once");
const gameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("focus_tap"), targetIndex: z.number().int().min(0).max(FOCUS_FLOW_CELL_COUNT - 1).optional() }),
  z.object({ type: z.literal("breath_cycle") }),
  z.object({ type: z.literal("gratitude_tap"), value: z.string().trim().min(1).max(40) }),
  z.object({ type: z.literal("answer"), value: z.string().max(80) }),
  z.object({
    type: z.literal("memory_pair"),
    first: z.number().int().min(0).max(15),
    second: z.number().int().min(0).max(15),
  }),
]);
const gameIdSchema = z.enum(gameIds);
const createInviteCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

function walletBalancesForProfile(profile: any): WalletBalances {
  return {
    balance: Number(profile?.walletBalance ?? 0),
    reward: Number(profile?.rewardBalance ?? 0),
    remorse: Number(profile?.remorseBalance ?? 0),
    peer: Number(profile?.peerBalance ?? 0),
  };
}

function nonNegativeIntegerBalanceExpression(field: string) {
  return {
    $max: [0, { $floor: { $ifNull: [field, 0] } }],
  };
}

function basePurseBalanceExpression() {
  return {
    $max: [
      0,
      {
        $subtract: [
          nonNegativeIntegerBalanceExpression("$walletBalance"),
          {
            $add: [
              nonNegativeIntegerBalanceExpression("$rewardBalance"),
              nonNegativeIntegerBalanceExpression("$remorseBalance"),
              nonNegativeIntegerBalanceExpression("$peerBalance"),
            ],
          },
        ],
      },
    ],
  };
}

function scheduledHabitPledge(habit: any) {
  const perDay = Number(habit.rdmPledgePerDay ?? 0);
  const startDayKey = String(habit.rdmPledgeStartDayKey ?? "");
  const endDayKey = String(habit.rdmPledgeEndDayKey ?? "");
  // A missing stored schedule is an existing daily commitment, irrespective of its label.
  const weekdays = habit.rdmPledgeWeekdays == null
    ? [1, 2, 3, 4, 5, 6, 7]
    : Array.from(habit.rdmPledgeWeekdays, Number);
  const schedule = habitPledgeSchedule({ startDayKey, endDayKey, dailyPledge: perDay, weekdays });
  if (!schedule) return null;
  return {
    ...schedule,
    perDay,
    startDayKey,
    endDayKey,
    weekdays,
    timeZone: String(habit.rdmPledgeTimeZone ?? "Asia/Kolkata"),
  };
}

function serializeHabit(habit: any) {
  const pledgeSchedule = scheduledHabitPledge(habit);
  const todayDayKey = dayKeyForTimeZone(
    new Date(),
    pledgeSchedule?.timeZone ?? "Asia/Kolkata",
  );
  const settledDayKeys = Array.from(habit.rdmPledgeSettledDayKeys ?? [], String);
  const completedDayKeys = [...new Set([
    ...Array.from(habit.rdmPledgeCompletedDayKeys ?? [], String),
    ...(habit.lastCompletedDayKey ? [String(habit.lastCompletedDayKey)] : []),
  ])];
  const weekProgress = habitWeekProgress(completedDayKeys, todayDayKey);
  const scheduleProgress = pledgeSchedule ? habitScheduleProgress({
    scheduledDayKeys: pledgeSchedule.dayKeys,
    settledDayKeys,
    completedDayKeys,
    currentDayKey: todayDayKey,
  }) : null;
  const persistedEntries = Array.from(habit.dayEntries ?? []) as any[];
  const entryDayKeys = [...new Set([
    ...settledDayKeys,
    ...completedDayKeys,
    ...persistedEntries.map((entry) => String(entry.dayKey)),
  ])].sort().reverse();
  const pledgeStatus: "upcoming" | "active" | "finished" = pledgeSchedule
    ? todayDayKey < (pledgeSchedule.dayKeys[0] ?? pledgeSchedule.startDayKey)
      ? "upcoming"
      : todayDayKey >= pledgeSchedule.endDayKey || Number(habit.rdmPledgeRemaining) <= 0
        ? "finished"
        : "active"
    : "finished";

  return {
    id: String(habit._id),
    wisdomPracticeId: habit.wisdomPracticeId ? String(habit.wisdomPracticeId) : null,
    wisdom: wisdomHabitView({
      practiceId: habit.wisdomPracticeId,
      schedule: pledgeSchedule,
      currentDayKey: todayDayKey,
      completedDayKeys,
      settledDayKeys,
      remainingPledge: Number(habit.rdmPledgeRemaining ?? 0),
      fundingStatus: String(habit.rdmPledgeFundingStatus ?? ""),
    }),
    title: String(habit.title),
    category: String(habit.category),
    icon: String(habit.icon),
    cadence: String(habit.cadence),
    target: String(habit.target),
    pledge: String(habit.pledge),
    rdmPledge: pledgeSchedule
      ? {
        perDay: Number(habit.rdmPledgePerDay),
        total: Number(habit.rdmPledgeTotal),
        remaining: Number(habit.rdmPledgeRemaining),
        startDayKey: pledgeSchedule.startDayKey,
        endDayKey: pledgeSchedule.endDayKey,
        timeZone: pledgeSchedule.timeZone,
        weekdays: pledgeSchedule.weekdays,
        scheduledToday: scheduleProgress!.scheduledToday,
        settledToday: scheduleProgress!.settledToday,
        nextDayKey: scheduleProgress!.nextDayKey,
        dayCount: pledgeSchedule.dayCount,
        settledDayKeys,
        completedDayKeys,
        currentDayKey: habit.currentDayKey ? String(habit.currentDayKey) : null,
        status: pledgeStatus,
      }
      : null,
    source: String(habit.source) as (typeof habitSources)[number],
    stage: String(habit.stage) as (typeof habitStages)[number],
    streak: scheduleProgress?.streak ?? Number(habit.streak),
    lastAction: habit.lastAction ? String(habit.lastAction) : null,
    reflection: habit.reflection ? String(habit.reflection) : null,
    lastOutcome: habit.lastOutcome ? String(habit.lastOutcome) as (typeof habitOutcomes)[number] : null,
    lastCompletedDayKey: habit.lastCompletedDayKey
      ? String(habit.lastCompletedDayKey)
      : null,
    completedDays: weekProgress.flatMap((day, index) => day.completed ? [index + 1] : []),
    weekProgress,
    history: entryDayKeys.map((dayKey) => {
      const entry = persistedEntries.find((item) => String(item.dayKey) === dayKey);
      return {
        dayKey,
        outcome: completedDayKeys.includes(dayKey) ? "completed" as const : "missed" as const,
        note: entry?.note ? String(entry.note) : null,
        reflection: entry?.reflection ? String(entry.reflection) : null,
        settledAt: entry?.settledAt ? new Date(entry.settledAt).toISOString() : null,
      };
    }),
    active: Boolean(habit.active),
  };
}

async function savedTreeCare(profile: any) {
  await reconcileTreeCareRecords(profile);
  const care = profile.treePledgedAt
    ? await TreeCareActivity.find({ userId: profile.userId, occurredAt: { $gte: profile.treePledgedAt } })
      .select("kind dayKey occurredAt operationId").lean()
    : [];
  // Legacy retries can have different operation IDs for the same habit/day.
  return [...new Map(care.map((entry) => {
    const habitId = String(entry.operationId).match(/^habit(?:-pledge)?:([^:]+):/u)?.[1];
    return [habitId ? `habit:${habitId}:${entry.dayKey}` : entry.operationId, entry];
  })).values()];
}

async function serializeProfile(profile: any) {
  const timeZone = String(profile.treeTimeZone ?? "Asia/Kolkata");
  const uniqueCare = await savedTreeCare(profile);
  const todayDayKey = dayKeyForTimeZone(new Date(), timeZone);
  const { streak, fertilizerCount, waterCount, sunlightCount } = treeCareProgress(uniqueCare, todayDayKey);
  const todayCare = uniqueCare.filter((entry) => entry.dayKey === todayDayKey);
  const growth = treeGrowthFor(fertilizerCount, waterCount + sunlightCount);
  const lastCareAt = (kind: string) => {
    const dates = uniqueCare.filter((entry) => entry.kind === kind).map((entry) => new Date(entry.occurredAt).getTime());
    return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
  };
  const wallet = walletBalancesForProfile(profile);

  return {
    xp: Number(profile.xp),
    level: Number(profile.level),
    streak,
    plantStage: growth.stage,
    tree: {
      pledgeAmount: Number(profile.treePledgeAmount ?? 0),
      pledgedAt: profile.treePledgedAt ? new Date(profile.treePledgedAt).toISOString() : null,
      timeZone,
      careDays: new Set(uniqueCare.map((entry) => entry.dayKey)).size,
      todayCare: {
        dayKey: todayDayKey,
        fertilizerCount: todayCare.filter((entry) => entry.kind === "fertilizer").length,
        waterCount: todayCare.filter((entry) => entry.kind === "water").length,
        sunlightCount: todayCare.filter((entry) => entry.kind === "sunlight").length,
        caredFor: todayCare.length > 0,
      },
      dayNumber: profile.treePledgedAt
        ? Math.max(1, Math.round((Date.parse(`${dayKeyForTimeZone(new Date(), timeZone)}T00:00:00Z`) - Date.parse(`${dayKeyForTimeZone(new Date(profile.treePledgedAt), timeZone)}T00:00:00Z`)) / 86_400_000) + 1)
        : 0,
      fertilizerCount,
      waterCount,
      lastWateredAt: lastCareAt("water"),
      sunlightCount,
      lastSunlightAt: lastCareAt("sunlight"),
      lastMissedDayKey: profile.treeLastMissedDayKey
        ? String(profile.treeLastMissedDayKey)
        : null,
      growth,
    },
    weeklyInvites: Number(profile.weeklyInvites ?? 0),
    referralCode: String(profile.referralCode ?? ""),
    wallet: {
      ...wallet,
      base: basePurseBalance(wallet),
    },
    unlockedBadges: Array.from(profile.unlockedBadges ?? [], String),
    unlockedRewards: Array.from(profile.unlockedRewards ?? [], String),
    collectibles: Array.from(profile.collectibles ?? []).map((collectible: any) => ({
      id: String(collectible.collectibleId),
      groupId: String(collectible.groupId),
      title: String(collectible.title),
      recipientName: String(collectible.recipientName),
      awardedAt: new Date(collectible.awardedAt).toISOString(),
    })),
    transactions: Array.from(profile.transactions ?? []).map((transaction: any) => ({
      id: String(transaction._id),
      title: String(transaction.title),
      amount: Number(transaction.amount),
      kind: String(transaction.kind),
      ...walletActivity(String(transaction.kind), Number(transaction.amount)),
      createdAt: new Date(transaction.createdAt).toISOString(),
    })),
  };
}

function serializeGratitudeEntry(entry: any) {
  return {
    id: String(entry._id),
    category: String(entry.category),
    categoryTitle: String(entry.categoryTitle),
    prompt: String(entry.prompt),
    body: String(entry.body),
    dayKey: String(entry.dayKey),
    reward: Number(entry.reward),
    growthPoints: Number(entry.growthPoints),
    processedAt: entry.processedAt ? new Date(entry.processedAt).toISOString() : null,
    createdAt: new Date(entry.createdAt).toISOString(),
  };
}

function serializeGoodDeedEntry(entry: any) {
  return {
    id: String(entry._id),
    deedId: String(entry.deedId),
    deedTitle: String(entry.deedTitle),
    dayKey: String(entry.dayKey),
    reward: Number(entry.reward),
    processedAt: entry.processedAt ? new Date(entry.processedAt).toISOString() : null,
    createdAt: new Date(entry.createdAt).toISOString(),
  };
}

function serializeGroup(group: any, currentUserId: string) {
  const members = Array.from(group.members ?? [])
    .filter((member: any) => member.fundingStatus !== "pending");
  const timeZone = String(group.timeZone ?? "Asia/Kolkata");
  const endDayKey = String(group.endDayKey ?? "");
  const cadence = String(group.cadence ?? "daily") as "daily" | "weekly";
  const currentDayKey = dayKeyForTimeZone(new Date(), timeZone);
  const currentPeriodKey = groupContributionPeriodKey(new Date(), timeZone, cadence);
  const daysRemaining = /^\d{4}-\d{2}-\d{2}$/.test(endDayKey)
    ? calendarDayKeysAfter(currentDayKey, endDayKey).length
    : 0;
  return {
    id: String(group._id),
    name: String(group.name),
    category: String(group.category ?? "Family") as (typeof groupGoalCategories)[number],
    activityId: String(group.activityId ?? "custom"),
    description: String(group.description ?? ""),
    target: Number(group.target),
    current: Number(group.current),
    unit: String(group.unit),
    rewardPool: Number(group.rewardPool),
    durationDays: Number(group.durationDays ?? 30),
    startDayKey: String(group.startDayKey ?? ""),
    endDayKey,
    timeZone,
    daysRemaining: group.targetHit || group.status === "expired" ? 0 : daysRemaining,
    cadence,
    pledgeBasis: String(group.pledgeBasis ?? "per_day") as "per_day" | "per_activity",
    pledgePerUnit: Number(group.pledgePerUnit ?? 5),
    expectedActivities: Number(group.expectedActivities ?? 30),
    minimumPledge: Number(group.minimumPledge ?? 0),
    rewardStructure: String(group.rewardStructure ?? "top_3") as (typeof groupGoalRewardStructures)[number],
    status: String(group.status ?? (group.awarded ? "completed" : "active")) as "pending" | "active" | "completed" | "expired",
    targetHit: Boolean(group.targetHit),
    awarded: Boolean(group.awarded),
    specialAwarded: Boolean(group.specialAwarded),
    specialCollectible: group.specialCollectible
      ? {
        id: String(group.specialCollectible.collectibleId),
        title: String(group.specialCollectible.title),
        recipientName: String(group.specialCollectible.recipientName),
        awardedAt: new Date(group.specialCollectible.awardedAt).toISOString(),
      }
      : null,
    inviteCode: String(group.inviteCode),
    canAward: String(group.creatorId) === currentUserId,
    members: members.map((member: any) => ({
      name: String(member.name),
      initials: String(member.initials),
      contribution: Number(member.contribution),
      loggedCurrentPeriod: Array.from(member.contributionPeriodKeys ?? [], String)
        .includes(currentPeriodKey),
      pledgeAmount: Number(member.pledgeAmount ?? 0),
      award: Number(member.award),
      currentUser: member.userId ? String(member.userId) === currentUserId : false,
      lastNote: String(member.lastNote ?? ""),
    })),
  };
}

function serializeGoal(goal: any) {
  const status = String(goal.status ?? "active") as PersonalGoalStatus;
  const currentDayKey = dayKeyForTimeZone(new Date(), String(goal.timeZone));
  const dailyView = dailyGoalView(goal);
  let streak: number | null = null;
  if (dailyView.fundingMode === "daily") {
    streak = 0;
    const completed = new Set(dailyView.dayEntries.filter((entry) => entry.outcome === "completed").map((entry) => entry.dayKey));
    const cursor = new Date(`${currentDayKey}T00:00:00Z`);
    if (!completed.has(currentDayKey)) cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (dailyView.todayStatus !== "missed" && completed.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }
  return {
    ...dailyView,
    streak,
    id: String(goal._id),
    title: String(goal.title),
    category: String(goal.category) as (typeof goalCategories)[number],
    target: String(goal.target),
    durationDays: Number(goal.durationDays),
    startDayKey: String(goal.startDayKey),
    endDayKey: String(goal.endDayKey),
    timeZone: String(goal.timeZone),
    pledgeAmount: Number(goal.pledgeAmount),
    why: goal.why ? String(goal.why) : null,
    steps: Array.from(goal.steps ?? [], String),
    reflectionPrompt: goal.reflectionPrompt ? String(goal.reflectionPrompt) : null,
    progress: Number(goal.progress),
    progressVersion: Number(goal.progressVersion ?? 0),
    status,
    active: status === "active",
    upcoming: status === "active" && currentDayKey < String(goal.startDayKey),
    settled: Boolean(goal.settledAt),
    outcomeAt: goal.outcomeAt ? new Date(goal.outcomeAt).toISOString() : null,
    progressUpdates: Array.from(goal.progressUpdates ?? [], (entry: any) => ({
      requestId: String(entry.requestId),
      progress: Number(entry.progress),
      note: String(entry.note),
      status: String(entry.status) as PersonalGoalStatus,
      recordedAt: new Date(entry.recordedAt).toISOString(),
    })),
  };
}

function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "YO";
}

function unlockBadges(profile: any, badgeIds: ReadonlyArray<string>) {
  const unlocked = new Set(Array.from(profile.unlockedBadges ?? [], String));
  badgeIds.forEach((badgeId) => unlocked.add(badgeId));
  profile.unlockedBadges = Array.from(unlocked);
}

async function normalizeProfileLevel(profile: any) {
  const level = levelForXp(profile.xp);
  if (profile.level === level) return profile;
  return await RdmProfile.findOneAndUpdate(
    { _id: profile._id },
    { $max: { level } },
    { returnDocument: "after" },
  ) ?? profile;
}

async function creditProfile({
  userId,
  amount,
  title,
  kind,
  purse,
  operationId,
  badgeIds = [],
  streak,
}: {
  userId: string;
  amount: number;
  title: string;
  kind: "habit" | "game" | "gratitude" | "deed" | "peer";
  purse: "reward" | "peer";
  operationId: string;
  badgeIds?: ReadonlyArray<string>;
  streak?: number;
}) {
  await getProfile(userId);
  const increments: Record<string, number> = { xp: amount, walletBalance: amount };
  increments[purse === "reward" ? "rewardBalance" : "peerBalance"] = amount;
  const addToSet: Record<string, unknown> = { creditedOperations: operationId };
  if (badgeIds.length > 0) addToSet.unlockedBadges = { $each: badgeIds };
  const update: Record<string, unknown> = {
    $inc: increments,
    $addToSet: addToSet,
    $push: { transactions: { $each: [{ title, amount, kind, operationId, createdAt: new Date() }], $position: 0 } },
  };
  if (streak !== undefined) update.$max = { streak };

  let profile = await RdmProfile.findOneAndUpdate(
    { userId, creditedOperations: { $ne: operationId } },
    update,
    { returnDocument: "after" },
  );
  profile ??= await getProfile(userId);
  return normalizeProfileLevel(profile);
}

function serializeGameProgressReceipt(session: any, gameId: GameId, operationId: string) {
  const receipt = (session.actionReceipts as Array<any>).find(
    (item) => item.operationId === operationId,
  );
  if (!receipt) return null;
  return {
    accepted: receipt.accepted,
    actionCount: receipt.actionCount,
    correct: receipt.correct,
    matchedIndexes: numberArray(receipt.matchedIndexes),
    moves: receipt.moves,
    prompt: gamePromptFor(gameId, receipt.actionCount),
    score: receipt.score,
  };
}

function rewardForRecordedGame(session: any, minutes: number) {
  const hasActivity = Number(session.actionCount ?? 0) > 0
    || Number(session.moves ?? 0) > 0
    || (session.actionReceipts as Array<{ accepted: boolean }> | undefined)?.some((receipt) => receipt.accepted);
  return hasActivity ? rewardForGame(minutes, Number(session.score ?? 0)) : 0;
}

async function settleGameSession(session: any, userId: string, completedAt = new Date()) {
  const game = gameCatalog.find((item) => item.id === session.gameId);
  if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
  // List/catch-up may supply a projection; eligibility always uses persisted activity.
  let settled: any = await GameSession.findOne({ _id: session._id, userId });

  for (let attempt = 0; settled?.status === "running" && attempt < 5; attempt += 1) {
    const revision = Number(settled.revision ?? 0);
    const revisionFilter = revision === 0
      ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
      : { revision };
    const reward = rewardForRecordedGame(settled, game.durationSeconds / 60);
    settled = await GameSession.findOneAndUpdate(
      { _id: settled._id, userId, status: "running", ...revisionFilter },
      { $set: { status: "complete", completedAt, reward } },
      { returnDocument: "after" },
    ) ?? await GameSession.findOne({ _id: settled._id, userId });
  }

  if (settled?.status === "complete" && settled.reward <= 0) {
    const reward = rewardForRecordedGame(settled, game.durationSeconds / 60);
    if (reward > 0) {
      settled = await GameSession.findOneAndUpdate(
        { _id: settled._id, userId, status: "complete", reward: { $lte: 0 } },
        { $set: { reward } },
        { returnDocument: "after" },
      ) ?? settled;
    }
  }

  if (!settled || settled.status !== "complete") {
    throw new TRPCError({ code: "CONFLICT", message: "This game session could not be locked" });
  }
  if (settled.reward <= 0) {
    return { game, profile: await getProfile(userId), session: settled };
  }
  const profile = await creditProfile({
    userId,
    amount: settled.reward,
    title: `${game.title} game`,
    kind: "game",
    purse: "reward",
    operationId: `game:${settled._id}`,
    badgeIds: ["first-game"],
  });
  return { game, profile, session: settled };
}

async function settleScheduledHabitWallet({
  userId,
  habit,
  dayKey,
  destination,
}: {
  userId: string;
  habit: any;
  dayKey: string;
  destination: "reward" | "remorse";
}) {
  const amount = Number(habit.rdmPledgePerDay ?? 0);
  const operationId = `habit-pledge:${habit._id}:${dayKey}`;
  const title = destination === "reward"
    ? `${habit.title} — ${dayKey} completed`
    : `Missed pledge — ${habit.title} — ${dayKey}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await getProfile(userId);
    if (current.creditedOperations.includes(operationId)) {
      const recordedDestination = habitPledgeDestinationForOperation(
        current.transactions as unknown as Array<{ kind: string; operationId?: string }>,
        operationId,
      );
      if (!recordedDestination) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `The habit pledge ledger is incomplete for ${dayKey}`,
        });
      }
      return { profile: current, destination: recordedDestination };
    }

    const currentWallet = walletBalancesForProfile(current);
    const nextWallet = releaseHabitPledgeBalances(currentWallet, destination, amount);
    const increments: Record<string, number> = {
      walletBalance: nextWallet.balance - currentWallet.balance,
      [destination === "reward" ? "rewardBalance" : "remorseBalance"]:
        nextWallet[destination] - currentWallet[destination],
    };

    const update: Record<string, unknown> = {
      $inc: increments,
      $addToSet: { creditedOperations: operationId },
      $push: {
        transactions: {
          $each: [{
            title,
            amount: destination === "reward" ? amount : -amount,
            kind: destination === "reward" ? "habit" : "remorse",
            operationId,
            createdAt: new Date(),
          }],
          $position: 0,
        },
      },
    };

    const profile = await RdmProfile.findOneAndUpdate(
      {
        userId,
        walletBalance: currentWallet.balance,
        rewardBalance: currentWallet.reward,
        remorseBalance: currentWallet.remorse,
        peerBalance: currentWallet.peer,
        creditedOperations: { $ne: operationId },
      },
      update,
      { returnDocument: "after" },
    );
    if (!profile) continue;

    return { profile, destination };
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Could not settle the habit pledge for ${dayKey}`,
  });
}

function scheduledHabitOutcomeUpdate({
  amount,
  dayKey,
  destination,
  missedAction = "Missed pledge recorded honestly",
  reflection,
  note,
  settledAt = new Date(),
}: {
  amount: number;
  dayKey: string;
  destination: "reward" | "remorse";
  missedAction?: string;
  reflection?: string;
  note?: string;
  settledAt?: Date;
}) {
  if (destination === "reward") {
    const [year, month, calendarDay] = dayKey.split("-").map(Number);
    const weekday = new Date(Date.UTC(
      year ?? 0,
      (month ?? 1) - 1,
      calendarDay ?? 1,
    )).getUTCDay() || 7;
    return {
      $set: {
        ...(reflection ? { reflection } : {}),
        ...(note ? { lastAction: note } : {}),
        stage: "reward",
        lastOutcome: "completed",
        lastCompletedDayKey: dayKey,
        lastSettledDayKey: dayKey,
        currentDayKey: dayKey,
      },
      $inc: { streak: 1, rdmPledgeRemaining: -amount },
      $addToSet: {
        completedDays: weekday,
        rdmPledgeSettledDayKeys: dayKey,
        rdmPledgeCompletedDayKeys: dayKey,
      },
      $push: { dayEntries: { dayKey, outcome: "completed", note, reflection, settledAt } },
    };
  }
  return {
    $set: {
      stage: "reward",
      streak: 0,
      lastOutcome: "missed",
      lastAction: missedAction,
      lastSettledDayKey: dayKey,
      currentDayKey: dayKey,
    },
    $inc: { rdmPledgeRemaining: -amount },
    $addToSet: { rdmPledgeSettledDayKeys: dayKey },
    $push: { dayEntries: { dayKey, outcome: "missed", note: missedAction, settledAt } },
    $unset: { reflection: 1 },
  };
}

async function settleEligibleScheduledHabitDay({
  dayKey,
  destination,
  expectedStage,
  habit,
  userId,
}: {
  dayKey: string;
  destination: "reward" | "remorse";
  expectedStage: "act" | "reflect";
  habit: any;
  userId: string;
}) {
  const amount = Number(habit.rdmPledgePerDay ?? 0);
  const settledDayKeys = Array.from(habit.rdmPledgeSettledDayKeys ?? [], String);
  const schedule = scheduledHabitPledge(habit);
  if (schedule?.dayKeys.includes(dayKey) && settledDayKeys.includes(dayKey)) {
    return settleScheduledHabitWallet({ userId, habit, dayKey, destination });
  }
  if (
    !schedule?.dayKeys.includes(dayKey)
    || habit.rdmPledgeFundingStatus === "pending"
    || habit.stage !== expectedStage
    || !habit.active
    || String(habit.currentDayKey ?? "") !== dayKey
    || settledDayKeys.includes(dayKey)
    || Number(habit.rdmPledgeRemaining) < amount
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: expectedStage === "reflect"
        ? "This habit is not ready for reflection"
        : "This habit is not ready to be marked missed",
    });
  }
  return settleScheduledHabitWallet({ userId, habit, dayKey, destination });
}

async function debitMissedPledge({
  userId,
  operationId,
  title,
  penalty,
}: {
  userId: string;
  operationId: string;
  title: string;
  penalty: number;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await getProfile(userId);
    if (current.creditedOperations.includes(operationId)) {
      const prior = (current.transactions as unknown as Array<any>).find((transaction) => transaction.title === title && transaction.kind === "remorse");
      return { profile: current, appliedPenalty: Math.abs(Number(prior?.amount ?? 0)) };
    }
    const currentWallet = walletBalancesForProfile(current);
    const { appliedPenalty } = baseToRemorseTransfer(currentWallet, penalty);
    const profile = await RdmProfile.findOneAndUpdate(
      {
        userId,
        walletBalance: currentWallet.balance,
        rewardBalance: currentWallet.reward,
        remorseBalance: currentWallet.remorse,
        peerBalance: currentWallet.peer,
        creditedOperations: { $ne: operationId },
      },
      {
        $inc: { remorseBalance: appliedPenalty },
        $set: { streak: 0 },
        $addToSet: { creditedOperations: operationId, unlockedBadges: "honest-reset" },
        $push: { transactions: { $each: [{ title, amount: -appliedPenalty, kind: "remorse", createdAt: new Date() }], $position: 0 } },
      },
      { returnDocument: "after" },
    );
    if (profile) return { profile, appliedPenalty };
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not reconcile the missed pledge" });
}

type TreeCareKind = (typeof treeCareKinds)[number];

async function careDayContext(userId: string, requestedTimeZone: string) {
  const profile = await RdmProfile.findOne({ userId }).select("treePledgedAt treeTimeZone");
  const timeZone = profile?.treePledgedAt ? String(profile.treeTimeZone) : requestedTimeZone;
  return { dayKey: dayKeyForTimeZone(new Date(), timeZone), timeZone };
}

async function recordTreeCareActivity({
  userId,
  kind,
  operationId,
  dayKey,
  timeZone,
  occurredAt = new Date(),
}: {
  userId: string;
  kind: TreeCareKind;
  operationId: string;
  dayKey: string;
  timeZone: string;
  occurredAt?: Date;
}) {
  const activeTree = await RdmProfile.findOne({
    userId,
    treePledgedAt: { $lte: occurredAt },
  }).select("treeTimeZone");
  if (!activeTree) return;
  const treeTimeZone = String(activeTree.treeTimeZone ?? timeZone);
  const treeDayKey = treeTimeZone === timeZone ? dayKey : dayKeyForTimeZone(occurredAt, treeTimeZone);
  try {
    await TreeCareActivity.create({ userId, kind, operationId, dayKey: treeDayKey, timeZone: treeTimeZone, occurredAt });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
  }
}

async function reconcileTreeCareRecords(profile: any) {
  if (!profile.treePledgedAt) return;
  const userId = String(profile.userId);
  const timeZone = String(profile.treeTimeZone ?? "Asia/Kolkata");
  const creditedOperations = new Set(Array.from(profile.creditedOperations ?? [], String));
  const processedFilter = { userId, processedAt: { $gte: new Date(profile.treePledgedAt) } };
  const [gratitude, deeds] = await Promise.all([
    GratitudeEntry.find(processedFilter).select("_id processedAt").lean(),
    GoodDeedEntry.find(processedFilter).select("_id processedAt").lean(),
  ]);
  const completedCare = [
    ...gratitude.map((entry) => ({ kind: "water" as const, operationId: `gratitude:${entry._id}`, occurredAt: entry.processedAt! })),
    ...deeds.map((entry) => ({ kind: "sunlight" as const, operationId: `good-deed:${entry._id}`, occurredAt: entry.processedAt! })),
  ].filter((entry) => creditedOperations.has(entry.operationId));
  if (completedCare.length === 0) return;
  const existing = await TreeCareActivity.find({
    userId, operationId: { $in: completedCare.map((entry) => entry.operationId) },
  }).select("operationId").lean();
  const recorded = new Set(existing.map((entry) => entry.operationId));
  const missing = completedCare.filter((entry) => !recorded.has(entry.operationId));
  if (missing.length === 0) return;
  try {
    await TreeCareActivity.bulkWrite(missing.map((entry) => ({
      updateOne: {
        filter: { userId, operationId: entry.operationId },
        update: { $setOnInsert: {
          userId,
          operationId: entry.operationId,
          kind: entry.kind,
          occurredAt: entry.occurredAt,
          timeZone,
          dayKey: dayKeyForTimeZone(new Date(entry.occurredAt), timeZone),
        } },
        upsert: true,
      },
    })), { ordered: false });
  } catch (error: any) {
    // A concurrent request may have inserted the same unique care operations.
    const writeErrors = Array.isArray(error?.writeErrors) ? error.writeErrors : [];
    const onlyDuplicates = error?.code === 11000 && writeErrors.length > 0
      && writeErrors.every((failure: { code?: number }) => failure.code === 11000)
      && !error?.writeConcernError && !error?.writeConcernErrors?.length;
    if (!onlyDuplicates) throw error;
  }
}

function serializeTreeMissedDay(profile: any) {
  if (!profile.treeLastMissedDayKey || profile.treeMissedAcknowledgedAt) return null;
  const dayKey = String(profile.treeLastMissedDayKey);
  const timeZone = String(profile.treeTimeZone ?? "Asia/Kolkata");
  const transferredAmount = Number(profile.treeLastMissedPenalty ?? 0);
  const rewardAfter = Number(
    profile.treeMissedRewardAfter ?? profile.rewardBalance ?? 0,
  );
  const remorseAfter = Number(
    profile.treeMissedRemorseAfter ?? profile.remorseBalance ?? 0,
  );
  return {
    dayKey,
    missedYesterday: dayKey === previousDayKeyForTimeZone(new Date(), timeZone),
    dayNumber: profile.treePledgedAt
      ? Math.max(1, Math.round((Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${dayKeyForTimeZone(new Date(profile.treePledgedAt), timeZone)}T00:00:00Z`)) / 86_400_000) + 1)
      : 1,
    transferredAmount,
    rewardBefore: Number(
      profile.treeMissedRewardBefore ?? rewardAfter + transferredAmount,
    ),
    rewardAfter,
    remorseBefore: Number(
      profile.treeMissedRemorseBefore
        ?? Math.max(0, remorseAfter - transferredAmount),
    ),
    remorseAfter,
    processedAt: profile.treeMissedProcessedAt
      ? new Date(profile.treeMissedProcessedAt).toISOString()
      : null,
  };
}

async function reconcileTreeMissedDay(userId: string, timeZone: string) {
  let profile = await getProfile(userId);
  if (profile.treePledgedAt) timeZone = String(profile.treeTimeZone);
  if (!profile.treePledgedAt && profile.treeTimeZone !== timeZone) {
    profile = await RdmProfile.findOneAndUpdate(
      { userId },
      { $set: { treeTimeZone: timeZone } },
      { returnDocument: "after" },
    ) ?? profile;
  }
  if (!profile.treePledgedAt) return { profile, missedDay: null };
  await reconcileTreeCareRecords(profile);

  const now = new Date();
  const pledgedAt = new Date(profile.treePledgedAt);
  const pledgedDayKey = dayKeyForTimeZone(pledgedAt, timeZone);
  const yesterdayKey = previousDayKeyForTimeZone(now, timeZone);
  if (!profile.treeLastEvaluatedDayKey) {
    profile = await RdmProfile.findOneAndUpdate(
      { userId, treeLastEvaluatedDayKey: { $exists: false } },
      { $set: { treeLastEvaluatedDayKey: yesterdayKey } },
      { returnDocument: "after" },
    ) ?? profile;
    return { profile, missedDay: serializeTreeMissedDay(profile) };
  }
  const lastEvaluatedDayKey = String(profile.treeLastEvaluatedDayKey);
  const pendingDayKeys = calendarDayKeysAfter(
    lastEvaluatedDayKey,
    yesterdayKey,
  ).filter((dayKey) => dayKey >= pledgedDayKey);
  if (pendingDayKeys.length === 0) {
    return { profile, missedDay: serializeTreeMissedDay(profile) };
  }

  const recordedCare = await TreeCareActivity.find({
      userId,
      dayKey: { $in: pendingDayKeys },
      occurredAt: { $gte: pledgedAt },
    }).select("dayKey");
  const caredForDayKeys = new Set(recordedCare.map((entry) => String(entry.dayKey)));

  for (const dayKey of pendingDayKeys) {
    if (caredForDayKeys.has(dayKey)) {
      profile = await RdmProfile.findOneAndUpdate(
        { userId },
        { $max: { treeLastEvaluatedDayKey: dayKey } },
        { returnDocument: "after" },
      ) ?? profile;
      continue;
    }

    const operationId = `tree-miss:${dayKey}`;
    let reconciled = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      profile = await getProfile(userId);
      if (profile.creditedOperations.includes(operationId)) {
        profile = await RdmProfile.findOneAndUpdate(
          { userId },
          { $max: { treeLastEvaluatedDayKey: dayKey } },
          { returnDocument: "after" },
        ) ?? profile;
        reconciled = true;
        break;
      }

      const transfer = availableTreePenalty(
        profile.rewardBalance,
        profile.remorseBalance,
        treeMissedDayPenalty,
      );
      const processedAt = new Date();
      const updated = await RdmProfile.findOneAndUpdate(
        {
          userId,
          rewardBalance: profile.rewardBalance,
          remorseBalance: profile.remorseBalance,
          creditedOperations: { $ne: operationId },
        },
        {
          $set: {
            rewardBalance: transfer.rewardBalance,
            remorseBalance: transfer.remorseBalance,
            treeLastMissedDayKey: dayKey,
            treeLastMissedPenalty: transfer.appliedAmount,
            treeMissedRewardBefore: Number(profile.rewardBalance),
            treeMissedRewardAfter: transfer.rewardBalance,
            treeMissedRemorseBefore: Number(profile.remorseBalance),
            treeMissedRemorseAfter: transfer.remorseBalance,
            treeMissedProcessedAt: processedAt,
            treeLastEvaluatedDayKey: dayKey,
          },
          $unset: { treeMissedAcknowledgedAt: 1 },
          $addToSet: { creditedOperations: operationId },
          $push: {
            transactions: {
              $each: [{
                title: `Tree care missed — ${dayKey}`,
                amount: -transfer.appliedAmount,
                kind: "remorse",
                operationId,
                createdAt: processedAt,
              }],
              $position: 0,
            },
          },
        },
        { returnDocument: "after" },
      );
      if (updated) {
        profile = updated;
        reconciled = true;
        break;
      }
    }

    if (!reconciled) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Could not evaluate tree care for ${dayKey}`,
      });
    }
  }

  const missedDay = serializeTreeMissedDay(profile);
  return { profile, missedDay };
}

async function reconcileScheduledHabitOutcome(habit: any, userId: string) {
  const pledge = scheduledHabitPledge(habit);
  if (!pledge || habit.rdmPledgeFundingStatus === "pending") return habit;

  let current = habit;
  let profile = await getProfile(userId);
  let processedOperations = new Set(Array.from(profile.creditedOperations ?? [], String));
  const completedDayKeys = new Set(
    Array.from(current.rdmPledgeCompletedDayKeys ?? [], String),
  );
  for (const dayKey of Array.from(current.rdmPledgeSettledDayKeys ?? [], String)) {
    if (processedOperations.has(`habit-pledge:${current._id}:${dayKey}`)) continue;
    await settleScheduledHabitWallet({
      userId,
      habit: current,
      dayKey,
      destination: completedDayKeys.has(dayKey) ? "reward" : "remorse",
    });
  }

  profile = await getProfile(userId);
  processedOperations = new Set(Array.from(profile.creditedOperations ?? [], String));
  const walletTransactions = profile.transactions as unknown as Array<{
    kind: string;
    operationId?: string;
    createdAt: Date;
  }>;
  const persistedSettledDayKeys = new Set(
    Array.from(current.rdmPledgeSettledDayKeys ?? [], String),
  );
  for (const dayKey of pledge.dayKeys) {
    if (persistedSettledDayKeys.has(dayKey)) continue;
    const operationId = `habit-pledge:${current._id}:${dayKey}`;
    if (!processedOperations.has(operationId)) continue;
    const destination = habitPledgeDestinationForOperation(walletTransactions, operationId);
    if (!destination) continue;
    const recovered = await Habit.findOneAndUpdate(
      {
        _id: current._id,
        userId,
        rdmPledgeSettledDayKeys: { $ne: dayKey },
        rdmPledgeRemaining: { $gte: pledge.perDay },
      },
      scheduledHabitOutcomeUpdate({
        amount: pledge.perDay,
        dayKey,
        destination,
        note: current.currentDayKey === dayKey ? current.lastAction : undefined,
        reflection: current.currentDayKey === dayKey ? current.reflection : undefined,
        settledAt: walletTransactions.find((entry) => entry.operationId === operationId)?.createdAt,
      }),
      { returnDocument: "after" },
    );
    if (!recovered) continue;
    current = recovered;
    persistedSettledDayKeys.add(dayKey);
  }

  const currentDayKey = dayKeyForTimeZone(new Date(), pledge.timeZone);
  const missedDayKeys = missedHabitPledgeDayKeys(
    pledge.dayKeys,
    Array.from(current.rdmPledgeSettledDayKeys ?? [], String),
    currentDayKey,
  );
  for (const dayKey of missedDayKeys) {
    const settlement = await settleScheduledHabitWallet({
      userId,
      habit: current,
      dayKey,
      destination: "remorse",
    });
    const missed = await Habit.findOneAndUpdate(
      {
        _id: current._id,
        userId,
        rdmPledgeSettledDayKeys: { $ne: dayKey },
        rdmPledgeRemaining: { $gte: pledge.perDay },
      },
      scheduledHabitOutcomeUpdate({
        amount: pledge.perDay,
        dayKey,
        destination: settlement.destination,
        missedAction: "Scheduled day missed",
      }),
      { returnDocument: "after" },
    );
    if (!missed) continue;
    current = missed;
  }

  current = await Habit.findById(current._id) ?? current;
  profile = await getProfile(userId);
  for (const dayKey of Array.from(current.rdmPledgeCompletedDayKeys ?? [], String)) {
    const operationId = `habit-pledge:${current._id}:${dayKey}`;
    const transaction = (profile.transactions as unknown as Array<{ operationId?: string; createdAt: Date }>).find((entry) => entry.operationId === operationId);
    if (!transaction?.createdAt) continue;
    await recordTreeCareActivity({
      userId,
      kind: "fertilizer",
      operationId,
      dayKey,
      timeZone: pledge.timeZone,
      occurredAt: new Date(transaction.createdAt),
    });
  }
  const settledDayKeys = new Set(
    Array.from(current.rdmPledgeSettledDayKeys ?? [], String),
  );
  if (currentDayKey < (pledge.dayKeys[0] ?? pledge.startDayKey)) {
    return await Habit.findOneAndUpdate(
      { _id: current._id, userId },
      {
        $set: { stage: "pledge", cycle: 1 },
        $unset: { currentDayKey: 1, lastAction: 1, reflection: 1, lastOutcome: 1 },
      },
      { returnDocument: "after" },
    ) ?? current;
  }
  if (currentDayKey >= pledge.endDayKey || Number(current.rdmPledgeRemaining) <= 0) {
    return await Habit.findOneAndUpdate(
      { _id: current._id, userId },
      { $set: { active: false, stage: "reward" }, $unset: { currentDayKey: 1 } },
      { returnDocument: "after" },
    ) ?? current;
  }
  if (!pledge.dayKeys.includes(currentDayKey)) {
    return await Habit.findOneAndUpdate(
      { _id: current._id, userId },
      { $set: { stage: "pledge" }, $unset: { currentDayKey: 1, lastAction: 1, reflection: 1, lastOutcome: 1 } },
      { returnDocument: "after" },
    ) ?? current;
  }
  if (settledDayKeys.has(currentDayKey)) return current;
  if (String(current.currentDayKey ?? "") === currentDayKey) return current;

  return await Habit.findOneAndUpdate(
    { _id: current._id, userId },
    {
      $set: {
        stage: "act",
        currentDayKey,
        cycle: pledge.dayKeys.indexOf(currentDayKey) + 1,
      },
      $unset: { lastAction: 1, reflection: 1, lastOutcome: 1 },
    },
    { returnDocument: "after" },
  ) ?? current;
}

async function reconcileHabitOutcome(habit: any, userId: string) {
  if (scheduledHabitPledge(habit)) {
    return reconcileScheduledHabitOutcome(habit, userId);
  }
  if (habit.stage !== "reward") return habit;
  if (habit.lastOutcome === "completed") {
    await creditProfile({
      userId,
      amount: 25,
      title: `${habit.title} — reflection`,
      kind: "habit",
      purse: "reward",
      operationId: `habit:${habit._id}:${habit.cycle}`,
      badgeIds: ["first-sprout", ...(habit.streak >= 7 ? ["seven-day-streak"] : [])],
      streak: habit.streak,
    });
  }
  if (habit.lastOutcome === "missed") {
    await debitMissedPledge({
      userId,
      operationId: `miss:${habit._id}:${habit.cycle}`,
      title: `Missed pledge — ${habit.title}`,
      penalty: 10,
    });
  }
  return habit;
}

async function reconcileGroupAwards(group: any) {
  if (!group.awarded || group.awardsSettledAt) return;
  const members = group.members as Array<{ userId?: string; award: number }>;
  const credits = groupAwardCredits(members, members.map((member) => member.award));
  for (const credit of credits) {
    await creditProfile({
      userId: credit.userId,
      amount: credit.amount,
      title: `Awarded by ${group.name}`,
      kind: "peer",
      purse: "peer",
      operationId: `group:${group._id}:${credit.userId}`,
      badgeIds: ["group-finisher"],
    });
  }

  const collectible = group.specialCollectible;
  if (collectible?.recipientUserId) {
    const operationId = `group-collectible:${group._id}:${collectible.recipientUserId}`;
    await getProfile(String(collectible.recipientUserId));
    await RdmProfile.findOneAndUpdate(
      {
        userId: String(collectible.recipientUserId),
        creditedOperations: { $ne: operationId },
      },
      {
        $addToSet: { creditedOperations: operationId },
        $push: { collectibles: collectible.toObject?.() ?? collectible },
      },
    );
  }
  await GoalGroup.updateOne(
    { _id: group._id, awarded: true, awardsSettledAt: { $exists: false } },
    { $set: { awardsSettledAt: new Date() } },
  );
}

async function persistGroupAward({
  creatorId,
  group,
  specialAwarded,
}: {
  creatorId?: string;
  group: any;
  specialAwarded: boolean;
}) {
  const members = group.members as unknown as Array<{
    award: number;
    contribution: number;
    fundingStatus?: string;
    name?: string;
    userId?: string;
  }>;
  if (members.some((member) => member.fundingStatus === "pending")) return null;
  const amounts = groupAwardAmounts({
    contributions: members.map((member) => Number(member.contribution)),
    pool: Number(group.rewardPool),
    structure: group.rewardStructure ?? "top_3",
  });
  if (!amounts || !awardSplitIsValid(amounts, Number(group.rewardPool))) return null;

  const awardedAt = new Date();
  const specialRecipient = members
    .filter((member) => member.userId)
    .sort((left, right) => Number(right.contribution) - Number(left.contribution))[0];
  const specialCollectible = specialAwarded && specialRecipient
    ? {
      collectibleId: `group-goal-${group._id}`,
      groupId: String(group._id),
      title: `${group.name} Champion`,
      recipientUserId: String(specialRecipient.userId),
      recipientName: String(specialRecipient.name),
      awardedAt,
    }
    : null;

  const persisted = group.awarded
    ? group
    : await GoalGroup.findOneAndUpdate(
      {
        _id: group._id,
        ...(creatorId ? { creatorId } : {}),
        creationId: { $type: "string" },
        targetHit: true,
        awarded: false,
        rewardPool: group.rewardPool,
        members: { $size: amounts.length },
      },
      [
        {
          $set: {
            awarded: true,
            specialAwarded: Boolean(specialCollectible),
            specialCollectible,
            status: "completed",
            members: {
              $map: {
                input: { $range: [0, { $size: "$members" }] },
                as: "memberIndex",
                in: {
                  $mergeObjects: [
                    { $arrayElemAt: ["$members", "$$memberIndex"] },
                    { award: { $arrayElemAt: [amounts, "$$memberIndex"] } },
                  ],
                },
              },
            },
          },
        },
      ],
      { returnDocument: "after", updatePipeline: true },
    ) ?? await GoalGroup.findById(group._id);
  if (!persisted?.awarded) return null;
  return { amounts, group: persisted };
}

async function returnGroupPledge({
  amount,
  group,
  lockOperationId,
  userId,
}: {
  amount: number;
  group: any;
  lockOperationId: string;
  userId: string;
}) {
  if (!userId || !lockOperationId || !Number.isInteger(amount) || amount <= 0) return;
  const operationId = `group-refund:${group._id}:${userId}`;
  await getProfile(userId);
  await RdmProfile.findOneAndUpdate(
    {
      userId,
      creditedOperations: { $all: [lockOperationId], $ne: operationId },
    },
    [{
      $set: {
        walletBalance: { $add: ["$walletBalance", amount] },
        creditedOperations: {
          // Keep the debit receipt: an in-flight duplicate must never debit again after a refund.
          $setUnion: ["$creditedOperations", [operationId]],
        },
        transactions: {
          $concatArrays: [
            [{
              title: `Group pledge returned — ${group.name}`,
              amount,
              kind: "stake",
              operationId,
              createdAt: new Date(),
            }],
            { $ifNull: ["$transactions", []] },
          ],
        },
      },
    }],
    { updatePipeline: true },
  );
}

async function reconcileGroupLifecycle(group: any): Promise<any> {
  let current = group;
  if (["active", "completed", "expired"].includes(String(current.status))) {
    const now = new Date();
    const pendingMembers = (current.members as unknown as Array<any>).filter(
      (member) => member.userId && member.fundingStatus === "pending",
    );
    for (const member of pendingMembers) {
      const closed = current.targetHit || current.awarded || current.status === "expired"
        || dayKeyForTimeZone(now, String(current.timeZone)) >= String(current.endDayKey);
      const hasDebitReceipt = Boolean(await RdmProfile.exists({
        userId: String(member.userId),
        creditedOperations: String(member.pledgeOperationId),
      }));
      if (!closed && !hasDebitReceipt) {
        const joinedAt = new Date(member.joinedAt ?? 0);
        const stale = Number.isFinite(joinedAt.getTime())
          && now.getTime() - joinedAt.getTime() >= GROUP_FUNDING_RESERVATION_MS;
        if (stale) {
          await GoalGroup.updateOne(
            { _id: current._id },
            { $pull: { members: { userId: String(member.userId), fundingStatus: "pending" } } },
          );
          current = await GoalGroup.findById(current._id) ?? current;
        }
        continue;
      }
      await fundPendingGroupMember(current, String(member.userId));
      current = await GoalGroup.findById(current._id) ?? current;
    }
  }
  const endDayKey = String(current.endDayKey ?? "");
  const timeZone = String(current.timeZone ?? "Asia/Kolkata");
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDayKey)) {
    const currentDayKey = dayKeyForTimeZone(new Date(), timeZone);
    if (current.targetHit && !current.awarded && currentDayKey >= endDayKey) {
      const automaticAward = await persistGroupAward({ group: current, specialAwarded: false });
      if (automaticAward) current = automaticAward.group;
    }
    const status = groupGoalStatusForDay({
      currentDayKey,
      endDayKey,
      status: String(current.status ?? "active") as "pending" | "active" | "completed" | "expired",
      targetHit: Boolean(current.targetHit),
    });
    if (status === "expired") {
      current = await GoalGroup.findOneAndUpdate(
        {
          _id: current._id,
          status: "active",
          targetHit: false,
          awarded: false,
        },
        {
          $set: { status: "expired", expiredAt: new Date(), rewardPool: 0 },
        },
        { returnDocument: "after" },
      ) ?? await GoalGroup.findById(current._id) ?? current;
    }
  }

  if (current.status === "expired") {
    const members = current.members as unknown as Array<any>;
    for (const member of members) {
      if (member.fundingStatus !== "funded") continue;
      await returnGroupPledge({
        amount: Number(member.pledgeAmount ?? 0),
        group: current,
        lockOperationId: String(member.pledgeOperationId ?? ""),
        userId: String(member.userId ?? ""),
      });
    }
  }
  await reconcileGroupAwards(current);
  return current;
}

async function lockBasePledge({
  amount,
  operationId,
  title,
  userId,
}: {
  amount: number;
  operationId: string;
  title: string;
  userId: string;
}) {
  let profile = await getProfile(userId);
  if (profile.creditedOperations.includes(operationId)) return profile;

  const lockedProfile = await RdmProfile.findOneAndUpdate(
    {
      userId,
      creditedOperations: { $ne: operationId },
      $expr: { $gte: [basePurseBalanceExpression(), amount] },
    },
    {
      $inc: { walletBalance: -amount },
      $addToSet: { creditedOperations: operationId },
      $push: {
        transactions: {
          $each: [{
            title,
            amount: -amount,
            kind: "stake",
            operationId,
            createdAt: new Date(),
          }],
          $position: 0,
        },
      },
    },
    { returnDocument: "after" },
  );
  if (lockedProfile) return lockedProfile;

  profile = await getProfile(userId);
  return profile.creditedOperations.includes(operationId) ? profile : null;
}

async function fundPendingRecord({
  activatePending,
  amount,
  findFunded,
  operationId,
  title,
  userId,
}: {
  activatePending: () => Promise<any>;
  amount: number;
  findFunded: () => Promise<any>;
  operationId: string;
  title: string;
  userId: string;
}) {
  const profile = await lockBasePledge({ amount, operationId, title, userId });
  // Keep failed attempts so a simultaneous successful stake cannot lose its record.
  // Recovery only activates attempts backed by an existing stake ledger operation.
  if (!profile) return null;

  return await activatePending() ?? await findFunded();
}

async function fundPendingHabit(habit: any, userId: string) {
  const pledge = scheduledHabitPledge(habit);
  if (!pledge || habit.rdmPledgeFundingStatus !== "pending") return habit;

  return fundPendingRecord({
    activatePending: () => Habit.findOneAndUpdate(
      { _id: habit._id, userId, rdmPledgeFundingStatus: "pending" },
      { $set: { rdmPledgeFundingStatus: "funded", active: true } },
      { returnDocument: "after" },
    ),
    amount: pledge.totalPledge,
    findFunded: () => Habit.findOne({
      _id: habit._id,
      userId,
      rdmPledgeFundingStatus: "funded",
    }),
    operationId: `habit-stake:${habit._id}`,
    title: `Habit pledge locked — ${habit.title}`,
    userId,
  });
}

async function reconcilePendingHabitFunding(userId: string) {
  const pendingHabits = await Habit.find({ userId, rdmPledgeFundingStatus: "pending" });
  for (const habit of pendingHabits) {
    if (await RdmProfile.exists({ userId, creditedOperations: `habit-stake:${habit._id}` })) {
      await fundPendingHabit(habit, userId);
    }
  }
}

async function fundPendingGoal(goal: any, userId: string) {
  if (goal.fundingStatus !== "pending") return goal;
  const profile = await lockBasePledge({
    amount: Number(goal.pledgeAmount),
    operationId: `goal-stake:${goal._id}`,
    title: `Goal pledge locked — ${goal.title}`,
    userId,
  });
  if (!profile) return null;
  return await Goal.findOneAndUpdate(
    { _id: goal._id, userId, fundingStatus: "pending" },
    { $set: { fundingStatus: "funded", active: true, status: "active" } },
    { returnDocument: "after" },
  ) ?? await Goal.findOne({ _id: goal._id, userId, fundingStatus: "funded" });
}

async function reconcilePendingGoalFunding(userId: string) {
  const pendingGoals = await Goal.find({ userId, fundingStatus: "pending" });
  if (pendingGoals.length === 0) return;
  const profile = await getProfile(userId);
  for (const goal of pendingGoals) {
    // Recover a stake already deducted, without charging an abandoned failed attempt.
    if (profile.creditedOperations.includes(`goal-stake:${goal._id}`)) {
      await fundPendingGoal(goal, userId);
    }
  }
}

async function settlePersonalGoal(goal: any, userId: string) {
  if (goal.fundingMode === "daily") return reconcileDailyGoal(goal, userId, recordTreeCareActivity);
  if (goal.fundingStatus !== "funded" || goal.status === "active" || !goal.status || goal.settledAt) return goal;
  const destination = goal.status === "completed" ? "rewardBalance" : "remorseBalance";
  const operationId = `goal-settle:${goal._id}`;
  const lockOperationId = `goal-stake:${goal._id}`;
  const amount = Number(goal.pledgeAmount);
  const outcomeAt = new Date(goal.outcomeAt);
  if (Number.isNaN(outcomeAt.getTime())) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The goal outcome is missing its completion date." });
  }
  const profile = await RdmProfile.findOneAndUpdate(
    { userId, creditedOperations: { $all: [lockOperationId], $ne: operationId } },
    {
      $inc: { walletBalance: amount, [destination]: amount },
      $addToSet: { creditedOperations: operationId },
      $push: {
        transactions: {
          $each: [{
            title: `${goal.status === "completed" ? "Goal completed" : "Goal missed"} — ${goal.title}`,
            amount: goal.status === "completed" ? amount : -amount,
            kind: goal.status === "completed" ? "goal" : "remorse",
            operationId,
            createdAt: outcomeAt,
          }],
          $position: 0,
        },
      },
    },
    { returnDocument: "after" },
  );
  if (!profile && !await RdmProfile.exists({ userId, creditedOperations: { $all: [lockOperationId, operationId] } })) {
    throw new TRPCError({ code: "CONFLICT", message: "This goal's original pledge could not be verified. Your wallet has not been credited." });
  }
  if (goal.status === "completed") {
    await recordTreeCareActivity({
      userId,
      kind: "fertilizer",
      operationId,
      dayKey: dayKeyForTimeZone(outcomeAt, String(goal.timeZone)),
      timeZone: String(goal.timeZone),
      occurredAt: outcomeAt,
    });
  }
  return await Goal.findOneAndUpdate(
    { _id: goal._id, userId, status: goal.status, settledAt: { $exists: false } },
    { $set: { settledAt: new Date() } },
    { returnDocument: "after" },
  ) ?? await Goal.findOne({ _id: goal._id, userId }) ?? goal;
}

async function reconcilePersonalGoal(goal: any, userId: string) {
  if (goal.fundingMode === "daily") return reconcileDailyGoal(goal, userId, recordTreeCareActivity);
  let current = goal;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();
    const currentDayKey = dayKeyForTimeZone(now, String(current.timeZone));
    if (current.fundingStatus !== "funded" || ["completed", "missed"].includes(String(current.status)) || currentDayKey < String(current.endDayKey)) break;
    const transition = personalGoalTransition({
      goal: {
        status: "active",
        progress: Number(current.progress),
        startDayKey: String(current.startDayKey),
        endDayKey: String(current.endDayKey),
      },
      command: { type: "expire" },
      currentDayKey,
    });
    const expired = await Goal.findOneAndUpdate(
      {
        _id: current._id,
        userId,
        fundingStatus: "funded",
        status: { $nin: ["completed", "missed"] },
        $expr: { $eq: [{ $ifNull: ["$progressVersion", 0] }, Number(current.progressVersion ?? 0)] },
      },
      {
        $set: { status: transition.status, active: false, outcomeAt: now },
        $inc: { progressVersion: 1 },
        $push: {
          progressUpdates: {
            requestId: `goal-expire:${current._id}`,
            progress: transition.progress,
            status: transition.status,
            note: "Deadline reached before the goal was completed.",
            recordedAt: now,
          },
        },
      },
      { returnDocument: "after" },
    );
    current = expired ?? await Goal.findOne({ _id: current._id, userId }) ?? current;
    if (expired) break;
  }
  return settlePersonalGoal(current, userId);
}

async function reconcilePersonalGoals(userId: string) {
  await reconcilePendingGoalFunding(userId);
  const goals = await Goal.find({
    userId,
    fundingStatus: "funded",
    $or: [{ status: { $nin: ["completed", "missed"] } }, { settledAt: { $exists: false } }],
  });
  for (const goal of goals) await reconcilePersonalGoal(goal, userId);
}

async function updatePersonalGoal({
  userId,
  id,
  requestId,
  expectedVersion,
  command,
  note,
}: {
  userId: string;
  id: string;
  requestId: string;
  expectedVersion: number;
  command: Exclude<PersonalGoalCommand, { type: "expire" }>;
  note: string;
}) {
  const found = await Goal.findOne({ _id: id, userId, fundingStatus: "funded" });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  const current = await reconcilePersonalGoal(found, userId);
  if (Array.from(current.progressUpdates ?? [], (entry: any) => String(entry.requestId)).includes(requestId)) return serializeGoal(current);
  if (Number(current.progressVersion ?? 0) !== expectedVersion) {
    throw new TRPCError({ code: "CONFLICT", message: "This goal was updated elsewhere. Refresh it before saving again." });
  }
  if (current.fundingMode === "daily" && command.type === "complete" && Number(current.remainingPledge) > 0) {
    throw new TRPCError({ code: "CONFLICT", message: "Complete the daily reflection commitment before marking the goal complete. Future daily allocations cannot be paid out early." });
  }
  const now = new Date();
  let transition;
  try {
    transition = personalGoalTransition({
      goal: {
        status: (current.status ?? "active") as PersonalGoalStatus,
        progress: Number(current.progress),
        startDayKey: String(current.startDayKey),
        endDayKey: String(current.endDayKey),
      },
      command,
      currentDayKey: dayKeyForTimeZone(now, String(current.timeZone)),
    });
  } catch (error) {
    throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "This goal cannot be updated." });
  }
  const updated = await Goal.findOneAndUpdate(
    {
      _id: id,
      userId,
      fundingStatus: "funded",
      status: { $nin: ["completed", "missed"] },
      "progressUpdates.requestId": { $ne: requestId },
      $expr: { $eq: [{ $ifNull: ["$progressVersion", 0] }, expectedVersion] },
    },
    {
      $set: {
        progress: transition.progress,
        status: transition.status,
        active: transition.status === "active",
        ...(transition.destination ? { outcomeAt: now } : {}),
      },
      $inc: { progressVersion: 1 },
      $push: { progressUpdates: { requestId, progress: transition.progress, status: transition.status, note, recordedAt: now } },
    },
    { returnDocument: "after" },
  );
  if (updated) return serializeGoal(await settlePersonalGoal(updated, userId));
  const latest = await Goal.findOne({ _id: id, userId, fundingStatus: "funded" });
  if (latest && serializeGoal(latest).progressUpdates.some((entry) => entry.requestId === requestId)) {
    return serializeGoal(await reconcilePersonalGoal(latest, userId));
  }
  throw new TRPCError({ code: "CONFLICT", message: "This goal changed while you were saving. Refresh it and try again." });
}

function pendingGroupMember(group: any, userId: string) {
  return (group.members as unknown as Array<any>).find(
    (member) => member.userId === userId && member.fundingStatus === "pending",
  );
}

async function fundPendingGroupMember(group: any, userId: string) {
  const member = pendingGroupMember(group, userId);
  if (!member) return group;
  const amount = Number(member.pledgeAmount);
  const operationId = String(member.pledgeOperationId ?? `group-stake:${group._id}:${userId}`);

  const expectedStatus = String(group.creatorId) === userId ? "pending" : "active";
  const currentDayKey = dayKeyForTimeZone(new Date(), String(group.timeZone ?? "Asia/Kolkata"));
  if (group.targetHit || group.awarded || group.status === "expired" || currentDayKey >= String(group.endDayKey)) {
    // A target hit closes membership. Pending debits may still be in flight; their
    // activation CAS below will fail and their own retry path returns the stake.
    const profile = await getProfile(userId);
    if (profile.creditedOperations.includes(operationId)) {
      await returnGroupPledge({ amount, group, lockOperationId: operationId, userId });
    }
    if (String(group.creatorId) === userId && group.status === "pending") {
      // Keep the creation identity reserved so a refunded creation cannot be replayed
      // into a new group using the original debit receipt.
      await GoalGroup.updateOne(
        { _id: group._id, creatorId: userId, status: "pending" },
        { $set: { status: "expired", expiredAt: new Date(), rewardPool: 0 }, $pull: { members: { userId, fundingStatus: "pending" } } },
      );
    } else {
      await GoalGroup.updateOne(
        { _id: group._id },
        { $pull: { members: { userId, fundingStatus: "pending" } } },
      );
    }
    return null;
  }
  const fundedGroup = await fundPendingRecord({
    activatePending: () => GoalGroup.findOneAndUpdate(
      {
        _id: group._id,
        status: expectedStatus,
        targetHit: false,
        awarded: false,
        endDayKey: { $gt: currentDayKey },
        "members": {
          $elemMatch: { userId, fundingStatus: "pending", pledgeAmount: amount },
        },
      },
      {
        $inc: { rewardPool: amount },
        $set: {
          "members.$[member].fundingStatus": "funded",
          ...(String(group.creatorId) === userId ? { status: "active" } : {}),
        },
      },
      {
        arrayFilters: [{
          "member.userId": userId,
          "member.fundingStatus": "pending",
          "member.pledgeAmount": amount,
        }],
        returnDocument: "after",
      },
    ),
    amount,
    findFunded: () => GoalGroup.findOne({
      _id: group._id,
      members: { $elemMatch: { userId, fundingStatus: "funded" } },
    }),
    operationId,
    title: `Group pledge locked — ${group.name}`,
    userId,
  });
  if (fundedGroup) return fundedGroup;

  const profile = await getProfile(userId);
  const pledgeWasDebited = profile.creditedOperations.includes(operationId);
  if (pledgeWasDebited) {
    await returnGroupPledge({ amount, group, lockOperationId: operationId, userId });
  }
  if (String(group.creatorId) === userId && group.status === "pending") {
    if (pledgeWasDebited) {
      await GoalGroup.updateOne(
        { _id: group._id, creatorId: userId, status: "pending" },
        { $set: { status: "expired", expiredAt: new Date(), rewardPool: 0 }, $pull: { members: { userId, fundingStatus: "pending" } } },
      );
    }
    // Preserve an unfunded creation reservation so an explicit retry can use the
    // same idempotency key after the creator tops up their Base Purse.
    return null;
  }
  await GoalGroup.updateOne(
    { _id: group._id },
    { $pull: { members: { userId, fundingStatus: "pending" } } },
  );
  return null;
}

async function reconcilePendingGroupFunding(userId: string) {
  const pendingGroups = await GoalGroup.find({
    "members": { $elemMatch: { userId, fundingStatus: "pending" } },
  });
  for (const group of pendingGroups) {
    const member = pendingGroupMember(group, userId);
    if (member && await RdmProfile.exists({ userId, creditedOperations: String(member.pledgeOperationId) })) {
      await fundPendingGroupMember(group, userId);
    }
  }

  // A join debit can finish after a closed group's pending slot was removed.
  // Its persisted wallet receipt remains enough to recover a crashed refund.
  const profile = await getProfile(userId);
  const operations = new Set(Array.from(profile.creditedOperations ?? [], String));
  const transactions = profile.transactions as unknown as Array<{ operationId?: string; amount: number; kind: string }>;
  for (const transaction of transactions) {
    const operationId = transaction.operationId ?? "";
    const stake = /^group-stake:([a-f\d]{24}):(.+)$/i.exec(operationId);
    const creationPrefix = `group-create:${userId}:`;
    const creationId = operationId.startsWith(creationPrefix) ? operationId.slice(creationPrefix.length) : "";
    if ((!stake?.[1] || stake[2] !== userId) && !creationId) continue;
    if (transaction.kind !== "stake" || transaction.amount >= 0 || !operations.has(operationId)) continue;
    const group = creationId
      ? await GoalGroup.findOne({ creatorId: userId, creationId })
      : await GoalGroup.findById(stake![1]);
    if (!group) continue;
    const groupId = String(group._id);
    if (operations.has(`group-refund:${groupId}:${userId}`)) continue;
    const member = (group.members as unknown as Array<any>).find((entry) => entry.userId === userId);
    if (member?.fundingStatus === "funded") continue;
    const closed = group.targetHit || group.awarded || group.status === "expired"
      || dayKeyForTimeZone(new Date(), String(group.timeZone)) >= String(group.endDayKey);
    if (member && !closed) continue;
    await returnGroupPledge({ amount: -transaction.amount, group, lockOperationId: operationId, userId });
    await GoalGroup.updateOne({ _id: group._id }, { $pull: { members: { userId, fundingStatus: "pending" } } });
  }
}

async function ensureUserData(userId: string, _userName: string) {
  let profile = await getProfile(userId);
  await reconcilePendingHabitFunding(userId);
  await reconcilePersonalGoals(userId);
  await reconcilePendingGroupFunding(userId);

  let habits = await Habit.find({ userId, active: true }).sort({ createdAt: 1 });
  for (let index = 0; index < habits.length; index += 1) {
    const habit = habits[index];
    if (habit) habits[index] = await reconcileHabitOutcome(habit, userId);
  }
  profile = await getProfile(userId);

  const groups = await GoalGroup.find({ creatorId: userId, creationId: { $type: "string" } }).sort({ createdAt: 1 });

  return { profile, habits, groups };
}

// A bounded sweep also settles commitments when the user leaves the app closed.
// Individual settlement operations are replay-safe, including across server processes.
export async function reconcileCommitmentsBatch(afterId?: string) {
  const profiles = await RdmProfile.find(afterId ? { _id: { $gt: afterId } } : {})
    .sort({ _id: 1 }).limit(50).select("userId treeTimeZone");
  let failed = 0;
  for (const profile of profiles) {
    try {
      const userId = String(profile.userId);
      await ensureUserData(userId, "");
      await reconcileTreeMissedDay(userId, String(profile.treeTimeZone));
      const groups = await GoalGroup.find({ creatorId: userId, creationId: { $type: "string" } });
      for (const group of groups) await reconcileGroupLifecycle(group);
    } catch (error) {
      failed += 1;
      console.error("Commitment settlement failed; it will be retried", {
        profileId: String(profile._id),
        message: error instanceof Error ? error.message : "Unknown settlement failure",
      });
    }
  }
  return {
    processed: profiles.length,
    failed,
    nextCursor: profiles.length === 50 ? String(profiles.at(-1)!._id) : undefined,
  };
}

export async function reconcileDueGroupGoalsBatch(afterId?: string) {
  // Group day keys are saved in each group's time zone. UTC tomorrow safely
  // includes every zone that may already have crossed its exclusive deadline;
  // reconcileGroupLifecycle performs the authoritative per-zone comparison.
  const latestPossibleDayKey = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const groups = await GoalGroup.find({
    ...(afterId ? { _id: { $gt: afterId } } : {}),
    creationId: { $type: "string" },
    $or: [
      { endDayKey: { $lte: latestPossibleDayKey }, status: "active" },
      { awarded: true, awardsSettledAt: { $exists: false }, status: "completed" },
    ],
  }).sort({ _id: 1 }).limit(100);
  let failed = 0;
  for (const group of groups) {
    try {
      await reconcileGroupLifecycle(group);
    } catch (error) {
      failed += 1;
      console.error("Group settlement failed; it will be retried", {
        groupId: String(group._id),
        message: error instanceof Error ? error.message : "Unknown settlement failure",
      });
    }
  }
  return {
    processed: groups.length,
    failed,
    nextCursor: groups.length === 100 ? String(groups.at(-1)!._id) : undefined,
  };
}

async function getProfile(userId: string) {
  try {
    await grantSignupAirdrop(userId);
  } catch {
    console.error("Signup airdrop is pending and will be retried on the next profile access.");
  }
  let profile = await RdmProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, unlockedBadges: initialBadgeIds } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
  profile = await resetWeeklyInvites(profile);
  await ensureReferralCode(profile);
  return profile;
}

async function resetWeeklyInvites(profile: any) {
  const currentWeek = inviteWeekKey();
  if (profile.inviteWeek === currentWeek) return profile;
  return await RdmProfile.findOneAndUpdate(
    { _id: profile._id, inviteWeek: { $ne: currentWeek } },
    { $set: { inviteWeek: currentWeek, weeklyInvites: 0 } },
    { returnDocument: "after" },
  ) ?? await RdmProfile.findById(profile._id) ?? profile;
}

async function ensureReferralCode(profile: any) {
  if (profile.referralCode) return;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    profile.referralCode = createInviteCode();
    try {
      await profile.save();
      return;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create an invite code" });
}

export const rdmRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const { profile: currentProfile, habits, groups } = await ensureUserData(
      ctx.session.user.id,
      ctx.session.user.name,
    );
    const { profile } = await reconcileTreeMissedDay(
      ctx.session.user.id,
      String(currentProfile.treeTimeZone ?? "Asia/Kolkata"),
    );
    const [focusHabits, focusGoals] = await Promise.all([
      Habit.find({ userId: ctx.session.user.id, rdmPledgeFundingStatus: { $ne: "pending" } }),
      Goal.find({ userId: ctx.session.user.id, fundingStatus: "funded" }),
    ]);
    return {
      user: { name: ctx.session.user.name, email: ctx.session.user.email },
      profile: await serializeProfile(profile),
      habits: habits.map(serializeHabit),
      today: dailyFocus(focusHabits.map(serializeHabit), focusGoals.map(serializeGoal), new Date()),
      groups: groups.map((group) => serializeGroup(group, ctx.session.user.id)),
      games: gameCatalog,
      serverTime: nowIso(),
    };
  }),

  templates: protectedProcedure.query(() => ({
    categories: habitCategories,
    templates: habitTemplates,
  })),

  tree: router({
    history: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).default(20), beforeDayKey: dayKeySchema.optional() }))
      .query(async ({ ctx, input }) => {
        const profile = await getProfile(ctx.session.user.id);
        const timeZone = String(profile.treeTimeZone ?? "Asia/Kolkata");
        type HistoryDay = {
          dayKey: string; fertilizerCount: number; waterCount: number; sunlightCount: number;
          status: "cared" | "missed"; transferredToRemorse: number | null;
        };
        const days = new Map<string, HistoryDay>();
        for (const entry of await savedTreeCare(profile)) {
          const day = days.get(entry.dayKey) ?? {
            dayKey: entry.dayKey, fertilizerCount: 0, waterCount: 0, sunlightCount: 0,
            status: "cared" as const, transferredToRemorse: null,
          };
          if (entry.kind === "fertilizer") day.fertilizerCount += 1;
          if (entry.kind === "water") day.waterCount += 1;
          if (entry.kind === "sunlight") day.sunlightCount += 1;
          days.set(entry.dayKey, day);
        }
        const pledgedAt = profile.treePledgedAt;
        if (pledgedAt) {
          const firstDay = dayKeyForTimeZone(new Date(pledgedAt), timeZone);
          const receipts = z.array(z.object({
            operationId: z.string().nullish(), amount: z.number(), createdAt: z.date(),
          })).parse(profile.transactions);
          for (const transaction of receipts) {
            const dayKey = String(transaction.operationId ?? "").match(/^tree-miss:(\d{4}-\d{2}-\d{2})$/u)?.[1];
            if (!dayKey || dayKey < firstDay || transaction.createdAt < pledgedAt) continue;
            const day = days.get(dayKey) ?? {
              dayKey, fertilizerCount: 0, waterCount: 0, sunlightCount: 0,
              status: "missed" as const, transferredToRemorse: null,
            };
            day.transferredToRemorse = Math.max(0, -Number(transaction.amount));
            days.set(dayKey, day);
          }
        }
        const eligible = [...days.values()].filter((day) => !input.beforeDayKey || day.dayKey < input.beforeDayKey)
          .sort((left, right) => right.dayKey.localeCompare(left.dayKey));
        const entries = eligible.slice(0, input.limit);
        return { timeZone, entries, nextBeforeDayKey: eligible.length > input.limit ? entries.at(-1)!.dayKey : null };
      }),
    overview: protectedProcedure
      .input(z.object({ timeZone: timeZoneSchema }))
      .query(async ({ ctx, input }) => {
        await ensureUserData(ctx.session.user.id, ctx.session.user.name);
        const result = await reconcileTreeMissedDay(ctx.session.user.id, input.timeZone);
        return {
          profile: await serializeProfile(result.profile),
          missedDay: result.missedDay,
        };
      }),
    missedDay: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getProfile(ctx.session.user.id);
      return {
        profile: await serializeProfile(profile),
        missedDay: serializeTreeMissedDay(profile),
      };
    }),
    acknowledgeMissedDay: protectedProcedure
      .input(z.object({ dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const profile = await RdmProfile.findOneAndUpdate(
          {
            userId: ctx.session.user.id,
            treeLastMissedDayKey: input.dayKey,
          },
          { $set: { treeMissedAcknowledgedAt: new Date() } },
          { returnDocument: "after" },
        );
        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This missed tree day is no longer pending.",
          });
        }
        return serializeProfile(profile);
      }),
    pledge: protectedProcedure
      .input(z.object({
        amount: z.number().int().min(10).max(100_000),
        timeZone: timeZoneSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        await ensureUserData(ctx.session.user.id, ctx.session.user.name);
        const pledgedAt = new Date();
        const previousPledgeDayKey = previousDayKeyForTimeZone(
          pledgedAt,
          input.timeZone,
        );
        const profile = await RdmProfile.findOneAndUpdate(
          {
            userId: ctx.session.user.id,
            $expr: {
              $gte: [basePurseBalanceExpression(), input.amount],
            },
            $or: [
              { treePledgeAmount: 0 },
              { treePledgeAmount: { $exists: false } },
            ],
          },
          {
            $inc: { walletBalance: -input.amount },
            $addToSet: { unlockedBadges: "first-sprout" },
            $set: {
              treePledgeAmount: input.amount,
              treePledgedAt: pledgedAt,
              treeTimeZone: input.timeZone,
              treeLastEvaluatedDayKey: previousPledgeDayKey,
            },
            $push: {
              transactions: {
                $each: [{
                  title: "Tree pledge staked",
                  amount: -input.amount,
                  kind: "stake",
                  operationId: `tree-stake:${ctx.session.user.id}`,
                  createdAt: pledgedAt,
                }],
                $position: 0,
              },
            },
          },
          { returnDocument: "after" },
        );
        if (profile) return serializeProfile(profile);

        const current = await RdmProfile.findOne({ userId: ctx.session.user.id });
        if (Number(current?.treePledgeAmount ?? 0) > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This tree already has an active pledge.",
          });
        }
        const availableBase = basePurseBalance(walletBalancesForProfile(current));
        if (basePurseAfterPledge(availableBase, input.amount) === null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Your Base Purse balance is lower than this pledge.",
          });
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: "The wallet changed while creating the tree. Please try again.",
        });
      }),
  }),

  goodDeeds: router({
    today: protectedProcedure
      .input(z.object({ timeZone: timeZoneSchema }))
      .query(async ({ ctx, input }) => {
        await ensureUserData(ctx.session.user.id, ctx.session.user.name);
        const { dayKey, timeZone } = await careDayContext(ctx.session.user.id, input.timeZone);
        const entries = await GoodDeedEntry.find({
          userId: ctx.session.user.id,
          dayKey,
        });
        const entriesByDeedId = new Map(
          entries.map((entry) => [String(entry.deedId), entry]),
        );

        return {
          dayKey,
          timeZone,
          earnedToday: entries.reduce(
            (total, entry) => total + (entry.processedAt ? Number(entry.reward) : 0),
            0,
          ),
          deeds: goodDeedCatalog.map((deed) => {
            const entry = entriesByDeedId.get(deed.id);
            return {
              ...deed,
              completed: Boolean(entry?.processedAt),
              completedAt: entry?.processedAt
                ? new Date(entry.processedAt).toISOString()
                : null,
            };
          }),
        };
      }),
    submit: protectedProcedure
      .input(z.object({ deedIds: goodDeedSelection, timeZone: timeZoneSchema, expectedDayKey: dayKeySchema.optional() }))
      .mutation(async ({ ctx, input }) => {
        await ensureUserData(ctx.session.user.id, ctx.session.user.name);
        const { dayKey, timeZone } = await careDayContext(ctx.session.user.id, input.timeZone);
        if (input.expectedDayKey && input.expectedDayKey !== dayKey) {
          throw new TRPCError({ code: "CONFLICT", message: "The care day has changed. Refresh the day and confirm your good deeds again." });
        }
        const submissionActions: Array<{ completedNow: boolean; reward: number }> = [];
        const entries: Array<ReturnType<typeof serializeGoodDeedEntry>> = [];

        for (const deedId of input.deedIds) {
          const deed = goodDeedById(deedId);
          if (!deed) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Good deed not found" });
          }

          let entry = await GoodDeedEntry.findOne({
            userId: ctx.session.user.id,
            deedId,
            dayKey,
          });
          if (!entry) {
            try {
              entry = await GoodDeedEntry.create({
                userId: ctx.session.user.id,
                deedId,
                deedTitle: deed.title,
                dayKey,
                reward: deed.reward,
              });
            } catch (error: any) {
              if (error?.code !== 11000) throw error;
              entry = await GoodDeedEntry.findOne({
                userId: ctx.session.user.id,
                deedId,
                dayKey,
              });
            }
          }

          if (!entry) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not save the good deed",
            });
          }

          const sunlightOperationId = `tree-sunlight:${entry._id}`;
          await RdmProfile.findOneAndUpdate(
            {
              userId: ctx.session.user.id,
              treePledgedAt: { $exists: true },
              treeCareOperations: { $ne: sunlightOperationId },
            },
            {
              $inc: { treeSunlightCount: 1 },
              $set: { treeLastSunlightAt: new Date() },
              $addToSet: { treeCareOperations: sunlightOperationId },
            },
          );

          await creditProfile({
            userId: ctx.session.user.id,
            amount: entry.reward,
            title: `${deed.title} — good deed`,
            kind: "deed",
            purse: "reward",
            operationId: `good-deed:${entry._id}`,
            badgeIds: ["community-hand"],
          });

          let completedNow = false;
          if (!entry.processedAt) {
            const processedAt = new Date();
            const processingResult = await GoodDeedEntry.updateOne(
              { _id: entry._id, processedAt: { $exists: false } },
              { $set: { processedAt } },
            );
            if (processingResult.modifiedCount === 1) {
              entry.processedAt = processedAt;
              completedNow = true;
            }
          }
          if (entry.processedAt) {
            await recordTreeCareActivity({
              userId: ctx.session.user.id,
              kind: "sunlight",
              operationId: `good-deed:${entry._id}`,
              dayKey,
              timeZone: input.timeZone,
              occurredAt: new Date(entry.processedAt),
            });
          }
          submissionActions.push({ completedNow, reward: Number(entry.reward) });
          entries.push(serializeGoodDeedEntry(entry));
        }

        const submissionResult = goodDeedSubmissionResult(submissionActions);

        return {
          dayKey,
          timeZone,
          entries,
          ...submissionResult,
          rewardMessage: goodDeedRewardMessage,
          profile: await serializeProfile(await getProfile(ctx.session.user.id)),
        };
      }),
  }),

  gratitude: router({
    categories: protectedProcedure.query(() => gratitudeCategories),
    byCategory: protectedProcedure
      .input(z.object({
        category: z.enum(gratitudeCategoryIds),
        timeZone: timeZoneSchema,
      }))
      .query(async ({ ctx, input }) => {
        const category = gratitudeCategoryById(input.category);
        if (!category) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gratitude category not found" });
        }
        const { dayKey, timeZone } = await careDayContext(ctx.session.user.id, input.timeZone);
        const filter = { userId: ctx.session.user.id, category: input.category };
        const [entry, previousEntries] = await Promise.all([
          GratitudeEntry.findOne({ ...filter, dayKey }),
          GratitudeEntry.find({ ...filter, dayKey: { $lt: dayKey }, processedAt: { $exists: true } })
            .sort({ dayKey: -1, _id: -1 }).limit(20),
        ]);
        return {
          category,
          dayKey,
          timeZone,
          todayEntry: entry ? serializeGratitudeEntry(entry) : null,
          previousEntries: previousEntries.map(serializeGratitudeEntry),
        };
      }),
    save: protectedProcedure
      .input(z.object({
        category: z.enum(gratitudeCategoryIds),
        body: z.string().trim().min(4).max(1000),
        timeZone: timeZoneSchema,
        expectedDayKey: dayKeySchema.optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await ensureUserData(ctx.session.user.id, ctx.session.user.name);
        const category = gratitudeCategoryById(input.category);
        if (!category) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gratitude category not found" });
        }

        const { dayKey, timeZone } = await careDayContext(ctx.session.user.id, input.timeZone);
        if (input.expectedDayKey && input.expectedDayKey !== dayKey) {
          throw new TRPCError({ code: "CONFLICT", message: "The care day has changed. Refresh the day and confirm your reflection again." });
        }
        let entry = await GratitudeEntry.findOne({
          userId: ctx.session.user.id,
          category: input.category,
          dayKey,
        });
        if (!entry) {
          try {
            entry = await GratitudeEntry.create({
              userId: ctx.session.user.id,
              category: input.category,
              categoryTitle: category.title,
              prompt: category.prompt,
              body: input.body,
              dayKey,
              reward: 15,
              growthPoints: 1,
            });
          } catch (error: any) {
            if (error?.code !== 11000) throw error;
            entry = await GratitudeEntry.findOne({
              userId: ctx.session.user.id,
              category: input.category,
              dayKey,
            });
          }
        }

        if (!entry) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not save the gratitude entry",
          });
        }

        const wasProcessed = Boolean(entry.processedAt);
        if (!wasProcessed && entry.body !== input.body) {
          entry.body = input.body;
          await entry.save();
        }

        const waterOperationId = `tree-water:${entry._id}`;
        await RdmProfile.findOneAndUpdate(
          {
            userId: ctx.session.user.id,
            treePledgedAt: { $exists: true },
            treeCareOperations: { $ne: waterOperationId },
          },
          {
            $inc: { treeWaterCount: entry.growthPoints },
            $set: { treeLastWateredAt: new Date() },
            $addToSet: { treeCareOperations: waterOperationId },
          },
        );

        await creditProfile({
          userId: ctx.session.user.id,
          amount: entry.reward,
          title: `${category.title} — gratitude entry`,
          kind: "gratitude",
          purse: "reward",
          operationId: `gratitude:${entry._id}`,
          badgeIds: ["reflection-journal"],
        });

        let processedNow = false;
        if (!wasProcessed) {
          const processedAt = new Date();
          const processingResult = await GratitudeEntry.updateOne(
            { _id: entry._id, processedAt: { $exists: false } },
            { $set: { processedAt } },
          );
          processedNow = processingResult.modifiedCount === 1;
          if (processedNow) entry.processedAt = processedAt;
        }
        if (entry.processedAt) {
          await recordTreeCareActivity({
            userId: ctx.session.user.id,
            kind: "water",
            operationId: `gratitude:${entry._id}`,
            dayKey,
            timeZone: input.timeZone,
            occurredAt: new Date(entry.processedAt),
          });
        }

        return {
          category,
          dayKey,
          timeZone,
          entry: serializeGratitudeEntry(entry),
          profile: await serializeProfile(await getProfile(ctx.session.user.id)),
          reward: processedNow ? entry.reward : 0,
          alreadySaved: !processedNow,
        };
      }),
  }),

  habits: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureUserData(ctx.session.user.id, ctx.session.user.name);
      const habits = await Habit.find({
        userId: ctx.session.user.id,
        rdmPledgeFundingStatus: { $ne: "pending" },
      }).sort({ active: -1, createdAt: -1 });
      const reconciled = [];
      for (const habit of habits) {
        reconciled.push(await reconcileHabitOutcome(habit, ctx.session.user.id));
      }
      return reconciled.map(serializeHabit);
    }),
    byId: protectedProcedure
      .input(z.object({ id: mongoId }))
      .query(async ({ ctx, input }) => {
        let habit = await Habit.findOne({ _id: input.id, userId: ctx.session.user.id });
        if (!habit) throw new TRPCError({ code: "NOT_FOUND", message: "Habit not found" });
        habit = await reconcileHabitOutcome(habit, ctx.session.user.id);
        return serializeHabit(habit);
      }),
    create: protectedProcedure
      .input(habitCreateInputSchema)
      .mutation(async ({ ctx, input }) => {
        const existingHabit = await Habit.findOne({
          userId: ctx.session.user.id,
          rdmPledgeCreationId: input.creationId,
        });
        const validateWisdomRetry = async (candidate: NonNullable<typeof existingHabit>) => {
          if (!candidate.wisdomPracticeId && !input.wisdomPracticeId) return;
          const sameWeekdays = numberArray(candidate.rdmPledgeWeekdays).sort((left, right) => left - right).join(",")
            === [...input.rdmPledgeWeekdays].sort((left, right) => left - right).join(",");
          if (candidate.wisdomPracticeId !== input.wisdomPracticeId
            || candidate.title !== input.title || candidate.category !== input.category
            || candidate.icon !== input.icon || candidate.cadence !== input.cadence
            || candidate.target !== input.target || candidate.pledge !== input.pledge
            || candidate.source !== input.source || candidate.rdmPledgePerDay !== input.rdmPledgePerDay
            || candidate.rdmPledgeStartDayKey !== input.rdmPledgeStartDayKey
            || candidate.rdmPledgeEndDayKey !== input.rdmPledgeEndDayKey
            || candidate.rdmPledgeTimeZone !== input.timeZone || !sameWeekdays) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This creation attempt already has different practice details. Open a new practice form to change them.",
            });
          }
          if (candidate.rdmPledgeFundingStatus === "pending"
            && input.rdmPledgeStartDayKey < dayKeyForTimeZone(new Date(), input.timeZone)
            && !(await RdmProfile.exists({
              userId: ctx.session.user.id,
              creditedOperations: `habit-stake:${candidate._id}`,
            }))) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This unfunded practice starts in the past. Open a new practice form and confirm new dates.",
            });
          }
        };
        if (existingHabit) {
          await validateWisdomRetry(existingHabit);
          const fundedHabit = await fundPendingHabit(existingHabit, ctx.session.user.id);
          if (!fundedHabit) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Your Base Purse cannot fund this habit." });
          }
          return serializeHabit(fundedHabit);
        }
        const schedule = habitPledgeSchedule({
          startDayKey: input.rdmPledgeStartDayKey,
          endDayKey: input.rdmPledgeEndDayKey,
          dailyPledge: input.rdmPledgePerDay,
          weekdays: input.rdmPledgeWeekdays,
        });
        const currentDayKey = dayKeyForTimeZone(new Date(), input.timeZone);
        if (!schedule || schedule.dayCount > 365) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose at least one scheduled day in a commitment window of 1–365 calendar days.",
          });
        }
        if (input.rdmPledgeStartDayKey < currentDayKey
          && !(await hasMedaaCommitmentApproval(ctx.session.user.id, { type: "habit", input }))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The habit start date cannot be in the past.",
          });
        }
        if (schedule.totalPledge > 100_000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The total habit pledge cannot exceed 100,000 RDM.",
          });
        }

        await getProfile(ctx.session.user.id);
        const weekdays = [...input.rdmPledgeWeekdays].sort((left, right) => left - right);
        const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const habit = new Habit({
          ...input,
          wisdomBonusPolicyId: input.wisdomPracticeId ? wisdomDisabledBonusPolicy : undefined,
          cadence: weekdays.length === 7 ? "Daily"
            : weekdays.join(",") === "1,2,3,4,5" ? "Weekdays"
              : weekdays.map((day) => weekdayLabels[day - 1]).join(", "),
          rdmPledgeWeekdays: weekdays,
          userId: ctx.session.user.id,
          active: false,
          stage: schedule.dayKeys.includes(currentDayKey) ? "act" : "pledge",
          streak: 0,
          completedDays: [],
          rdmPledgeCreationId: input.creationId,
          rdmPledgeTotal: schedule.totalPledge,
          rdmPledgeRemaining: schedule.totalPledge,
          rdmPledgeTimeZone: input.timeZone,
          rdmPledgeFundingStatus: "pending",
          rdmPledgeSettledDayKeys: [],
          rdmPledgeCompletedDayKeys: [],
          currentDayKey: schedule.dayKeys.includes(currentDayKey)
            ? currentDayKey
            : undefined,
        });
        let savedHabit = habit;
        try {
          await savedHabit.save();
        } catch (error: any) {
          if (error?.code !== 11000) throw error;
          const concurrentHabit = await Habit.findOne({
            userId: ctx.session.user.id,
            rdmPledgeCreationId: input.creationId,
          });
          if (!concurrentHabit) throw error;
          await validateWisdomRetry(concurrentHabit);
          savedHabit = concurrentHabit;
        }
        const fundedHabit = await fundPendingHabit(savedHabit, ctx.session.user.id);
        if (!fundedHabit) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `You need ${schedule.totalPledge} RDM in your Base Purse for this habit.`,
          });
        }
        return serializeHabit(fundedHabit);
      }),
    logAction: protectedProcedure
      .input(z.object({ id: mongoId, note: z.string().trim().min(2).max(240) }))
      .mutation(async ({ ctx, input }) => {
        let current = await Habit.findOne({ _id: input.id, userId: ctx.session.user.id });
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Habit not found" });
        current = await reconcileHabitOutcome(current, ctx.session.user.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Habit not found" });
        const scheduledPledge = scheduledHabitPledge(current);
        const currentDayKey = scheduledPledge
          ? dayKeyForTimeZone(new Date(), scheduledPledge.timeZone)
          : null;
        if (scheduledPledge && currentDayKey && !scheduledPledge.dayKeys.includes(currentDayKey)) {
          throw new TRPCError({ code: "CONFLICT", message: "Today is not a scheduled habit day." });
        }
        const habit = await Habit.findOneAndUpdate(
          {
            _id: input.id,
            userId: ctx.session.user.id,
            stage: "act",
            active: true,
            ...(currentDayKey
              ? {
                currentDayKey,
                rdmPledgeSettledDayKeys: { $ne: currentDayKey },
              }
              : {}),
          },
          { $set: { stage: "reflect", lastAction: input.note } },
          { returnDocument: "after" },
        );
        if (!habit) {
          throw new TRPCError({
            code: "CONFLICT",
            message: scheduledPledge
              ? "This habit is not available for completion today."
              : "This habit is not ready for an action log",
          });
        }
        return serializeHabit(habit);
      }),
    reflect: protectedProcedure
      .input(z.object({
        id: mongoId,
        reflection: z.string().trim().min(4).max(500),
        timeZone: timeZoneSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        let current = await Habit.findOne({ _id: input.id, userId: ctx.session.user.id });
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Habit not found" });
        current = await reconcileHabitOutcome(current, ctx.session.user.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Habit not found" });
        const scheduledPledge = scheduledHabitPledge(current);
        const timeZone = scheduledPledge?.timeZone ?? input.timeZone;
        const reward = scheduledPledge?.perDay ?? 25;
        const dayKey = dayKeyForTimeZone(new Date(), timeZone);
        const [year, month, calendarDay] = dayKey.split("-").map(Number);
        const day = new Date(Date.UTC(
          year ?? 0,
          (month ?? 1) - 1,
          calendarDay ?? 1,
        )).getUTCDay() || 7;
        let scheduledSettlement: Awaited<ReturnType<typeof settleScheduledHabitWallet>> | null = null;
        if (scheduledPledge) {
          // Retain the reflection if the wallet commits but the response is interrupted.
          await Habit.updateOne(
            {
              _id: current._id,
              userId: ctx.session.user.id,
              active: true,
              stage: "reflect",
              currentDayKey: dayKey,
              rdmPledgeSettledDayKeys: { $ne: dayKey },
            },
            { $set: { reflection: input.reflection } },
          );
          scheduledSettlement = await settleEligibleScheduledHabitDay({
            userId: ctx.session.user.id,
            habit: current,
            dayKey,
            destination: "reward",
            expectedStage: "reflect",
          });
        }
        let habit = await Habit.findOneAndUpdate(
          {
            _id: input.id,
            userId: ctx.session.user.id,
            stage: "reflect",
            active: true,
            ...(scheduledPledge
              ? {
                currentDayKey: dayKey,
                rdmPledgeSettledDayKeys: { $ne: dayKey },
                rdmPledgeRemaining: { $gte: reward },
              }
              : { lastCompletedDayKey: { $ne: dayKey } }),
          },
          scheduledPledge
            ? scheduledHabitOutcomeUpdate({
              amount: reward,
              dayKey,
              destination: scheduledSettlement?.destination ?? "reward",
              reflection: input.reflection,
              note: current.lastAction ?? undefined,
            })
            : {
              $set: {
                reflection: input.reflection,
                stage: "reward",
                lastOutcome: "completed",
                lastCompletedDayKey: dayKey,
                lastSettledDayKey: dayKey,
              },
              $inc: { streak: 1 },
              $addToSet: { completedDays: day, rdmPledgeCompletedDayKeys: dayKey },
              $push: { dayEntries: { dayKey, outcome: "completed", note: current.lastAction, reflection: input.reflection, settledAt: new Date() } },
            },
          { returnDocument: "after" },
        );
        habit ??= await Habit.findOne({ _id: input.id, userId: ctx.session.user.id });
        const expectedOutcome = scheduledSettlement?.destination === "remorse"
          ? "missed"
          : "completed";
        if (!habit || habit.stage !== "reward" || habit.lastOutcome !== expectedOutcome) {
          throw new TRPCError({ code: "CONFLICT", message: "This habit is not ready for reflection" });
        }

        const profile = scheduledSettlement?.profile
          ?? await creditProfile({
            userId: ctx.session.user.id,
            amount: reward,
            title: `${habit.title} — reflection`,
            kind: "habit",
            purse: "reward",
            operationId: `habit:${habit._id}:${habit.cycle}`,
            badgeIds: ["first-sprout", ...(habit.streak >= 7 ? ["seven-day-streak"] : [])],
            streak: habit.streak,
          });
        if (expectedOutcome === "completed") {
          const operationId = scheduledPledge
            ? `habit-pledge:${habit._id}:${dayKey}`
            : `habit:${habit._id}:${habit.cycle}`;
          const transaction = profile.transactions.find((entry: any) => entry.operationId === operationId);
          await recordTreeCareActivity({
            userId: ctx.session.user.id,
            kind: "fertilizer",
            operationId,
            dayKey,
            timeZone,
            occurredAt: transaction?.createdAt ? new Date(transaction.createdAt) : new Date(),
          });
        }
        return {
          habit: serializeHabit(habit),
          profile: await serializeProfile(profile),
          reward: expectedOutcome === "completed" ? reward : 0,
        };
      }),
    miss: protectedProcedure
      .input(z.object({ id: mongoId }))
      .mutation(async ({ ctx, input }) => {
        let current = await Habit.findOne({ _id: input.id, userId: ctx.session.user.id });
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Habit not found" });
        current = await reconcileHabitOutcome(current, ctx.session.user.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Habit not found" });
        const scheduledPledge = scheduledHabitPledge(current);
        const dayKey = scheduledPledge
          ? dayKeyForTimeZone(new Date(), scheduledPledge.timeZone)
          : dayKeyForTimeZone(new Date(), "Asia/Kolkata");
        const penalty = scheduledPledge?.perDay ?? 10;
        let scheduledSettlement: Awaited<ReturnType<typeof settleScheduledHabitWallet>> | null = null;
        if (scheduledPledge && dayKey) {
          scheduledSettlement = await settleEligibleScheduledHabitDay({
            userId: ctx.session.user.id,
            habit: current,
            dayKey,
            destination: "remorse",
            expectedStage: "act",
          });
        }
        let habit = await Habit.findOneAndUpdate(
          {
            _id: input.id,
            userId: ctx.session.user.id,
            stage: "act",
            active: true,
            ...(scheduledPledge
              ? {
                currentDayKey: dayKey,
                rdmPledgeSettledDayKeys: { $ne: dayKey },
                rdmPledgeRemaining: { $gte: penalty },
              }
              : {}),
          },
          scheduledPledge
            ? scheduledHabitOutcomeUpdate({
              amount: penalty,
              dayKey,
              destination: scheduledSettlement?.destination ?? "remorse",
            })
            : {
              $set: {
                stage: "reward",
                streak: 0,
                lastOutcome: "missed",
                lastAction: "Missed pledge recorded honestly",
                lastSettledDayKey: dayKey,
              },
              $push: { dayEntries: { dayKey, outcome: "missed", note: "Missed pledge recorded honestly", settledAt: new Date() } },
            },
          { returnDocument: "after" },
        );
        habit ??= await Habit.findOne({ _id: input.id, userId: ctx.session.user.id });
        const expectedOutcome = scheduledSettlement?.destination === "reward"
          ? "completed"
          : "missed";
        if (!habit || habit.stage !== "reward" || habit.lastOutcome !== expectedOutcome) {
          throw new TRPCError({ code: "CONFLICT", message: "This habit is not ready to be marked missed" });
        }

        const profile = scheduledSettlement?.profile
          ?? (await debitMissedPledge({
            userId: ctx.session.user.id,
            operationId: `miss:${habit._id}:${habit.cycle}`,
            title: `Missed pledge — ${habit.title}`,
            penalty,
          })).profile;
        return {
          habit: serializeHabit(habit),
          profile: await serializeProfile(profile),
          penalty: expectedOutcome === "missed" ? penalty : 0,
        };
      }),
    startNextCycle: protectedProcedure
      .input(z.object({ id: mongoId, timeZone: timeZoneSchema }))
      .mutation(async ({ ctx, input }) => {
        const current = await Habit.findOne({ _id: input.id, userId: ctx.session.user.id, stage: "reward" });
        if (!current) throw new TRPCError({ code: "CONFLICT", message: "Claim the current cycle before starting another" });
        const reconciled = await reconcileHabitOutcome(current, ctx.session.user.id);
        const scheduledPledge = scheduledHabitPledge(reconciled);
        if (scheduledPledge) {
          const scheduledDayKey = dayKeyForTimeZone(new Date(), scheduledPledge.timeZone);
          if (Array.from(reconciled.rdmPledgeSettledDayKeys ?? [], String).includes(scheduledDayKey)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This habit is settled for today. Come back on the next scheduled day.",
            });
          }
          return serializeHabit(reconciled);
        }
        const currentDayKey = dayKeyForTimeZone(new Date(), input.timeZone);
        if (!habitCanStartNextCycle(current.lastSettledDayKey ?? current.lastCompletedDayKey, currentDayKey)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This habit is complete for today. Come back tomorrow to continue the streak.",
          });
        }
        const habit = await Habit.findOneAndUpdate(
          { _id: input.id, userId: ctx.session.user.id, stage: "reward", cycle: current.cycle },
          { $set: { stage: "act" }, $inc: { cycle: 1 }, $unset: { lastAction: 1, reflection: 1, lastOutcome: 1 } },
          { returnDocument: "after" },
        );
        if (!habit) throw new TRPCError({ code: "CONFLICT", message: "Claim the current cycle before starting another" });
        return serializeHabit(habit);
      }),
  }),

  goals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await reconcilePersonalGoals(ctx.session.user.id);
      const goals = await Goal.find({
        userId: ctx.session.user.id,
        fundingStatus: "funded",
      }).sort({ createdAt: -1 });
      return goals.map(serializeGoal);
    }),
    byId: protectedProcedure
      .input(z.object({ id: mongoId }))
      .query(async ({ ctx, input }) => {
        await reconcilePendingGoalFunding(ctx.session.user.id);
        const goal = await Goal.findOne({ _id: input.id, userId: ctx.session.user.id, fundingStatus: "funded" });
        if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
        return serializeGoal(await reconcilePersonalGoal(goal, ctx.session.user.id));
      }),
    reflect: protectedProcedure
      .input(z.object({
        id: mongoId,
        operationId: z.string().uuid(),
        expectedVersion: z.number().int().min(0).optional(),
        note: z.string().trim().min(2).max(500),
      }))
      .mutation(async ({ ctx, input }) => serializeGoal(await reflectDailyGoal({
        ...input, userId: ctx.session.user.id, recordCare: recordTreeCareActivity,
      }))),
    update: protectedProcedure
      .input(z.object({
        id: mongoId,
        requestId: z.string().uuid(),
        expectedVersion: z.number().int().min(0),
        action: z.enum(["progress", "complete", "miss"]),
        progress: z.number().int().min(0).max(99).optional(),
        note: z.string().trim().min(2).max(500),
      }).refine((input) => input.action !== "progress" || input.progress !== undefined, {
        message: "Enter a progress percentage.", path: ["progress"],
      }))
      .mutation(({ ctx, input }) => updatePersonalGoal({
        userId: ctx.session.user.id,
        id: input.id,
        requestId: input.requestId,
        expectedVersion: input.expectedVersion,
        command: input.action === "progress"
          ? { type: "progress", progress: input.progress ?? 0 }
          : { type: input.action },
        note: input.note,
      })),
    create: protectedProcedure
      .input(goalCreateInputSchema)
      .mutation(async ({ ctx, input }) => {
        const window = goalDurationWindow(input.startDayKey, input.durationDays);
        const currentDayKey = dayKeyForTimeZone(new Date(), input.timeZone);
        if (!window) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid goal duration." });
        }
        if (input.startDayKey < currentDayKey
          && !(await hasMedaaCommitmentApproval(ctx.session.user.id, { type: "goal", input }))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The goal start date cannot be in the past.",
          });
        }

        await getProfile(ctx.session.user.id);
        const existingGoal = await Goal.findOne({
          userId: ctx.session.user.id,
          creationId: input.creationId,
        });
        const matchesCreation = (candidate: typeof existingGoal) => candidate
          && candidate.title === input.title && candidate.category === input.category
          && candidate.target === input.target && candidate.startDayKey === input.startDayKey
          && candidate.durationDays === input.durationDays && candidate.timeZone === input.timeZone
          && candidate.pledgeAmount === input.pledgeAmount
          && (candidate.pledgePerDay ?? undefined) === input.rdmPledgePerDay
          && candidate.fundingMode === (input.rdmPledgePerDay === undefined ? "outcome" : "daily")
          && (candidate.why ?? undefined) === input.why
          && JSON.stringify(candidate.steps ?? []) === JSON.stringify(input.steps ?? [])
          && (candidate.reflectionPrompt ?? undefined) === input.reflectionPrompt;
        if (existingGoal) {
          if (!matchesCreation(existingGoal)) {
            throw new TRPCError({ code: "CONFLICT", message: "This creation attempt already has different goal details. Open a new goal form to change them." });
          }
          const fundedGoal = await fundPendingGoal(existingGoal, ctx.session.user.id);
          if (!fundedGoal) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `You need ${input.pledgeAmount} RDM in your Base Purse for this goal.`,
            });
          }
          return serializeGoal(await reconcilePersonalGoal(fundedGoal, ctx.session.user.id));
        }

        let goal = new Goal({
          userId: ctx.session.user.id,
          creationId: input.creationId,
          title: input.title,
          category: input.category,
          target: input.target,
          durationDays: window.durationDays,
          startDayKey: window.startDayKey,
          endDayKey: window.endDayKey,
          timeZone: input.timeZone,
          pledgeAmount: input.pledgeAmount,
          fundingMode: input.rdmPledgePerDay === undefined ? "outcome" : "daily",
          pledgePerDay: input.rdmPledgePerDay,
          remainingPledge: input.rdmPledgePerDay === undefined ? undefined : input.pledgeAmount,
          why: input.why,
          steps: input.steps,
          reflectionPrompt: input.reflectionPrompt,
          fundingStatus: "pending",
          status: "active",
          progress: 0,
          progressVersion: 0,
          progressUpdates: [],
          active: false,
        });
        try {
          await goal.save();
        } catch (error: any) {
          if (error?.code !== 11000) throw error;
          const concurrentGoal = await Goal.findOne({
            userId: ctx.session.user.id,
            creationId: input.creationId,
          });
          if (!concurrentGoal) throw error;
          if (!matchesCreation(concurrentGoal)) {
            throw new TRPCError({ code: "CONFLICT", message: "This creation attempt already has different goal details. Open a new goal form to change them." });
          }
          goal = concurrentGoal;
        }
        const fundedGoal = await fundPendingGoal(goal, ctx.session.user.id);
        if (!fundedGoal) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `You need ${input.pledgeAmount} RDM in your Base Purse for this goal.`,
          });
        }
        return serializeGoal(await reconcilePersonalGoal(fundedGoal, ctx.session.user.id));
      }),
  }),

  games: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const dayKey = gameDayKey();
      const now = new Date();
      const expired = await GameSession.find({
        userId: ctx.session.user.id,
        status: "running",
        expiresAt: { $lt: now },
      });
      for (const session of expired) {
        await settleGameSession(session, ctx.session.user.id, now);
      }
      const completed = await GameSession.find({ userId: ctx.session.user.id, dayKey, status: "complete" }).select("gameId reward score status");
      for (const session of completed) {
        await settleGameSession(session, ctx.session.user.id, now);
      }
      const lockedIds = new Set(completed.map((session) => session.gameId));
      return gameCatalog.map((game) => ({ ...game, locked: lockedIds.has(game.id) }));
    }),
    start: protectedProcedure
      .input(z.object({ gameId: gameIdSchema }))
      .mutation(async ({ ctx, input }) => {
        const game = gameCatalog.find((item) => item.id === input.gameId);
        if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
        await ensureUserData(ctx.session.user.id, ctx.session.user.name);

        const startedAt = new Date();
        const expiresAt = new Date(startedAt.getTime() + game.durationSeconds * 1_000);
        const dayKey = gameDayKey(startedAt);
        let session = await GameSession.findOne({
          userId: ctx.session.user.id,
          gameId: game.id,
          status: "running",
          expiresAt: { $gte: startedAt },
        }).sort({ startedAt: -1 });
        session ??= await GameSession.findOneAndUpdate(
          { userId: ctx.session.user.id, gameId: game.id, dayKey },
          { $setOnInsert: { userId: ctx.session.user.id, gameId: game.id, dayKey, startedAt, expiresAt, status: "running" } },
          { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
        );
        if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Game session could not be started" });
        if (!gameSessionCanResume(session.status, session.expiresAt)) {
          if (session.status === "running") {
            await settleGameSession(session, ctx.session.user.id);
          }
          throw new TRPCError({ code: "CONFLICT", message: "This game is locked after today's completed session" });
        }
        return {
          sessionId: String(session._id),
          expiresAt: session.expiresAt.toISOString(),
          secondsRemaining: Math.max(0, Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000)),
          score: session.score,
          actionCount: session.actionCount,
          moves: session.moves ?? 0,
          matchedIndexes: numberArray(session.matchedIndexes),
          memoryBoard: game.id === "memory-match" ? memoryBoardForSeed(String(session._id)) : null,
          prompt: gamePromptFor(game.id, session.actionCount),
        };
      }),
    progress: protectedProcedure
      .input(z.object({
        sessionId: mongoId,
        operationId: z.string().uuid(),
        action: gameActionSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        const actionAt = new Date();
        const replay = await GameSession.findOne({
          _id: input.sessionId,
          userId: ctx.session.user.id,
          "actionReceipts.operationId": input.operationId,
        });
        if (replay) {
          const game = gameCatalog.find((item) => item.id === replay.gameId);
          if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
          const receipt = serializeGameProgressReceipt(replay, game.id, input.operationId);
          if (receipt) return receipt;
        }
        const current = await GameSession.findOne({
          _id: input.sessionId,
          userId: ctx.session.user.id,
          status: "running",
          expiresAt: { $gte: actionAt },
        });
        if (!current) {
          throw new TRPCError({ code: "CONFLICT", message: "This game session has ended" });
        }
        const game = gameCatalog.find((item) => item.id === current.gameId);
        if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
        if (
          game.id === "box-breathing"
          && input.action.type === "breath_cycle"
          && actionAt.getTime() - current.startedAt.getTime() < (current.actionCount + 1) * 16_000
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Complete the full breathing cycle first" });
        }
        const memoryBoard = game.id === "memory-match" ? memoryBoardForSeed(String(current._id)) : undefined;
        const result = evaluateGameAction({
          action: input.action,
          actionCount: current.actionCount,
          allowLegacyFocusTap: actionAt < env.LEGACY_FOCUS_TAP_CUTOFF,
          focusSeed: String(current._id),
          gameId: game.id,
          matchedIndexes: numberArray(current.matchedIndexes),
          memoryBoard,
        });
        if (!result.accepted) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That action is not valid for the current game state" });
        }
        const nextActionCount = current.actionCount + result.actionDelta;
        const nextMatchedIndexes = result.matchedIndexes;
        const nextMoves = (current.moves ?? 0) + result.movesDelta;
        const nextScore = current.score + result.scoreDelta;
        const session = await GameSession.findOneAndUpdate(
          {
            _id: input.sessionId,
            userId: ctx.session.user.id,
            status: "running",
            expiresAt: { $gte: actionAt },
            revision: current.revision ?? 0,
            "actionReceipts.operationId": { $ne: input.operationId },
            $or: [
              { lastActionAt: { $exists: false } },
              { lastActionAt: { $lte: new Date(actionAt.getTime() - 350) } },
            ],
          },
          {
            $inc: {
              score: result.scoreDelta,
              actionCount: result.actionDelta,
              moves: result.movesDelta,
              revision: 1,
            },
            $set: {
              lastActionAt: actionAt,
              matchedIndexes: nextMatchedIndexes,
            },
            $push: {
              actionReceipts: {
                $each: [{
                  operationId: input.operationId,
                  accepted: true,
                  actionCount: nextActionCount,
                  correct: result.correct,
                  matchedIndexes: nextMatchedIndexes,
                  moves: nextMoves,
                  score: nextScore,
                }],
                $slice: -600,
              },
            },
          },
          { returnDocument: "after" },
        );
        if (session) {
          const receipt = serializeGameProgressReceipt(session, game.id, input.operationId);
          if (receipt) return receipt;
        }
        const concurrent = await GameSession.findOne({
          _id: input.sessionId,
          userId: ctx.session.user.id,
          "actionReceipts.operationId": input.operationId,
        });
        const receipt = concurrent
          ? serializeGameProgressReceipt(concurrent, game.id, input.operationId)
          : null;
        if (receipt) return receipt;
        throw new TRPCError({ code: "CONFLICT", message: "Wait for the next prompt or the timer has ended" });
      }),
    complete: protectedProcedure
      .input(z.object({ sessionId: mongoId }))
      .mutation(async ({ ctx, input }) => {
        const existing = await GameSession.findOne({ _id: input.sessionId, userId: ctx.session.user.id });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Game session not found" });
        const settlement = await settleGameSession(existing, ctx.session.user.id);
        const completed = settlement.session;
        if (!completed) throw new TRPCError({ code: "CONFLICT", message: "This game session could not be locked" });
        const gameId = settlement.game.id;
        const reward = completed.reward;
        const profile = settlement.profile;
        const best = await GameSession.findOne({
          userId: ctx.session.user.id,
          gameId,
          status: "complete",
        }).sort({ score: -1 }).select("score");
        return {
          reward,
          profile: await serializeProfile(profile),
          locked: true,
          score: completed.score,
          actionCount: completed.actionCount,
          moves: completed.moves ?? 0,
          matchedCount: Math.floor(numberArray(completed.matchedIndexes).length / 2),
          bestScore: best?.score ?? completed.score,
        };
      }),
  }),

  groups: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureUserData(ctx.session.user.id, ctx.session.user.name);
      await reconcilePendingGroupFunding(ctx.session.user.id);
      const groups = await GoalGroup.find({
        creationId: { $type: "string" },
        $or: [
          { creatorId: ctx.session.user.id },
          { "members.userId": ctx.session.user.id },
        ],
      }).sort({ createdAt: -1 });
      const currentGroups = [];
      for (const group of groups) currentGroups.push(await reconcileGroupLifecycle(group));
      return currentGroups
        .filter((group) => (
          group.status !== "pending"
          && (
            String(group.creatorId) === ctx.session.user.id
            || (group.members as unknown as Array<any>).some(
              (member) => member.userId === ctx.session.user.id && member.fundingStatus !== "pending",
            )
          )
        ))
        .map((group) => serializeGroup(group, ctx.session.user.id));
    }),
    detail: protectedProcedure
      .input(z.object({ id: mongoId }))
      .query(async ({ ctx, input }) => {
        await reconcilePendingGroupFunding(ctx.session.user.id);
        const foundGroup = await GoalGroup.findOne({
          _id: input.id,
          creationId: { $type: "string" },
          $or: [
            { creatorId: ctx.session.user.id },
            { members: { $elemMatch: { userId: ctx.session.user.id, fundingStatus: "funded" } } },
          ],
        });
        if (!foundGroup) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        const group = await reconcileGroupLifecycle(foundGroup);
        return serializeGroup(group, ctx.session.user.id);
      }),
    preview: protectedProcedure
      .input(z.object({
        inviteCode: z.string().trim().length(6).transform((value) => value.toUpperCase()),
      }))
      .query(async ({ ctx, input }) => {
        const foundGroup = await GoalGroup.findOne({
          inviteCode: input.inviteCode,
          creationId: { $type: "string" },
          awarded: false,
          targetHit: false,
          status: "active",
        });
        if (!foundGroup) throw new TRPCError({ code: "NOT_FOUND", message: "This invite is no longer available" });
        const group = await reconcileGroupLifecycle(foundGroup);
        if (group.status !== "active") {
          throw new TRPCError({ code: "NOT_FOUND", message: "This invite is no longer available" });
        }
        const serialized = serializeGroup(group, ctx.session.user.id);
        const alreadyJoined = serialized.members.some((member) => member.currentUser);
        if ((group.members as unknown as Array<any>).length >= 50 && !alreadyJoined) {
          throw new TRPCError({ code: "CONFLICT", message: "This group already has 50 members" });
        }
        const profile = await getProfile(ctx.session.user.id);
        return {
          group: serialized,
          profile: await serializeProfile(profile),
          alreadyJoined,
        };
      }),
    create: protectedProcedure
      .input(z.object({
        creationId: z.string().uuid(),
        category: z.enum(groupGoalCategories),
        activityId: z.string().trim().min(1).max(80),
        name: z.string().trim().min(3).max(80),
        description: z.string().trim().max(240),
        target: z.number().positive().max(100000),
        unit: z.string().trim().min(1).max(20),
        durationDays: z.number().int().min(1).max(365),
        startDayKey: dayKeySchema,
        timeZone: timeZoneSchema,
        cadence: z.enum(["daily", "weekly"]),
        pledgeBasis: z.enum(["per_day", "per_activity"]),
        pledgePerUnit: z.number().int().min(1).max(100000),
        expectedActivities: z.number().int().min(1).max(365),
        rewardStructure: z.enum(groupGoalRewardStructures),
      }))
      .mutation(async ({ ctx, input }) => {
        const window = goalDurationWindow(input.startDayKey, input.durationDays);
        const totalPledge = groupPledgeTotal({
          basis: input.pledgeBasis,
          durationDays: input.durationDays,
          expectedActivities: input.expectedActivities,
          pledgePerUnit: input.pledgePerUnit,
        });
        const todayDayKey = dayKeyForTimeZone(new Date(), input.timeZone);
        if (!window || input.startDayKey < todayDayKey) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid start date that is not in the past" });
        }
        if (!totalPledge || totalPledge > 100000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The total group pledge must be between 1 and 100,000 RDM" });
        }

        let group = await GoalGroup.findOne({
          creatorId: ctx.session.user.id,
          creationId: input.creationId,
        });
        for (let attempt = 0; !group && attempt < 4; attempt += 1) {
          try {
            group = await GoalGroup.create({
              creatorId: ctx.session.user.id,
              creationId: input.creationId,
              inviteCode: createInviteCode(),
              name: input.name,
              category: input.category,
              activityId: input.activityId,
              description: input.description,
              target: input.target,
              current: 0,
              unit: input.unit,
              durationDays: input.durationDays,
              startDayKey: input.startDayKey,
              endDayKey: window.endDayKey,
              timeZone: input.timeZone,
              cadence: input.cadence,
              pledgeBasis: input.pledgeBasis,
              pledgePerUnit: input.pledgePerUnit,
              expectedActivities: input.expectedActivities,
              minimumPledge: totalPledge,
              rewardStructure: input.rewardStructure,
              rewardPool: 0,
              status: "pending",
              targetHit: false,
              members: [{
                userId: ctx.session.user.id,
                name: ctx.session.user.name,
                initials: initialsForName(ctx.session.user.name),
                contribution: 0,
                pledgeAmount: totalPledge,
                pledgeOperationId: `group-create:${ctx.session.user.id}:${input.creationId}`,
                fundingStatus: "pending",
                award: 0,
              }],
            });
          } catch (error: any) {
            if (error?.code !== 11000) throw error;
            group = await GoalGroup.findOne({
              creatorId: ctx.session.user.id,
              creationId: input.creationId,
            });
          }
        }
        if (!group) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not reserve a group invite code" });
        }
        const matchesCreationRequest = (
          String(group.category) === input.category
          && String(group.activityId) === input.activityId
          && String(group.name) === input.name
          && String(group.description) === input.description
          && Number(group.target) === input.target
          && String(group.unit) === input.unit
          && Number(group.durationDays) === input.durationDays
          && String(group.startDayKey) === input.startDayKey
          && String(group.endDayKey) === window.endDayKey
          && String(group.timeZone) === input.timeZone
          && String(group.cadence) === input.cadence
          && String(group.pledgeBasis) === input.pledgeBasis
          && Number(group.pledgePerUnit) === input.pledgePerUnit
          && Number(group.expectedActivities) === input.expectedActivities
          && Number(group.minimumPledge) === totalPledge
          && String(group.rewardStructure) === input.rewardStructure
        );
        if (!matchesCreationRequest) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This creation request was already used for a different group",
          });
        }
        if (group.status === "expired" && !(group.members as unknown as Array<any>).some(
          (member) => member.userId === ctx.session.user.id && member.fundingStatus === "funded",
        )) {
          throw new TRPCError({ code: "CONFLICT", message: "This group creation has expired. Start a new group." });
        }

        const fundedGroup = await fundPendingGroupMember(group, ctx.session.user.id);
        if (!fundedGroup) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Your Base Purse does not have enough RDM for this pledge" });
        }
        const profile = await getProfile(ctx.session.user.id);
        unlockBadges(profile, ["group-starter"]);
        await profile.save();
        return serializeGroup(fundedGroup, ctx.session.user.id);
      }),
    join: protectedProcedure
      .input(z.object({
        inviteCode: z.string().trim().length(6).transform((value) => value.toUpperCase()),
        pledgeAmount: z.number().int().min(1).max(100000),
      }))
      .mutation(async ({ ctx, input }) => {
        await getProfile(ctx.session.user.id);
        const foundGroup = await GoalGroup.findOne({
          inviteCode: input.inviteCode,
          creationId: { $type: "string" },
          awarded: false,
          targetHit: false,
          status: "active",
        });
        if (!foundGroup) throw new TRPCError({ code: "NOT_FOUND", message: "This invite is no longer available" });
        let group = await reconcileGroupLifecycle(foundGroup);
        if (group.status !== "active") {
          throw new TRPCError({ code: "NOT_FOUND", message: "This invite is no longer available" });
        }
        const currentDayKey = dayKeyForTimeZone(new Date(), String(group.timeZone));
        const existingMember = (group.members as unknown as Array<any>).find(
          (member) => member.userId === ctx.session.user.id,
        );
        if (existingMember && Number(existingMember.pledgeAmount) !== input.pledgeAmount) {
          throw new TRPCError({ code: "CONFLICT", message: "This join request already has a different pledge" });
        }
        if (existingMember && existingMember.fundingStatus !== "pending") {
          return serializeGroup(group, ctx.session.user.id);
        }
        const minimumPledge = Number(group.minimumPledge ?? 0);
        if (input.pledgeAmount < minimumPledge) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `This group requires a minimum pledge of ${minimumPledge} RDM`,
          });
        }
        if (!existingMember) {
          group = await GoalGroup.findOneAndUpdate(
            {
              _id: group._id,
              status: "active",
              endDayKey: { $gt: currentDayKey },
              awarded: false,
              targetHit: false,
              "members.userId": { $ne: ctx.session.user.id },
              $expr: { $lt: [{ $size: "$members" }, 50] },
            },
            {
              $push: {
                members: {
                  userId: ctx.session.user.id,
                  name: ctx.session.user.name,
                  initials: initialsForName(ctx.session.user.name),
                  contribution: 0,
                  pledgeAmount: input.pledgeAmount,
                  pledgeOperationId: `group-stake:${group._id}:${ctx.session.user.id}`,
                  fundingStatus: "pending",
                  joinedAt: new Date(),
                  award: 0,
                },
              },
            },
            { returnDocument: "after" },
          );
          if (!group) {
            throw new TRPCError({ code: "CONFLICT", message: "The group changed before you could join" });
          }
        }
        const fundedGroup = await fundPendingGroupMember(group, ctx.session.user.id);
        if (!fundedGroup) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Your Base Purse does not have enough RDM for this pledge" });
        }
        return serializeGroup(fundedGroup, ctx.session.user.id);
      }),
    logContribution: protectedProcedure
      .input(z.object({
        id: mongoId,
        operationId: z.string().uuid(),
        amount: z.number().positive().max(1000),
        note: z.string().trim().max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const fundedMembership = {
          $elemMatch: {
            userId: ctx.session.user.id,
            fundingStatus: "funded",
          },
        };
        const foundGroup = await GoalGroup.findOne({
          _id: input.id,
          creationId: { $type: "string" },
          members: fundedMembership,
        });
        if (!foundGroup) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        }
        const currentGroup = await reconcileGroupLifecycle(foundGroup);
        if (Array.from(currentGroup.loggedOperations ?? [], String).includes(input.operationId)) {
          return serializeGroup(currentGroup, ctx.session.user.id);
        }
        const currentDayKey = dayKeyForTimeZone(new Date(), String(currentGroup.timeZone));
        const currentPeriodKey = groupContributionPeriodKey(
          new Date(),
          String(currentGroup.timeZone),
          currentGroup.cadence === "weekly" ? "weekly" : "daily",
        );
        const currentMember = (currentGroup.members as unknown as Array<any>).find(
          (member) => member.userId === ctx.session.user.id && member.fundingStatus === "funded",
        );
        if (Array.from(currentMember?.contributionPeriodKeys ?? [], String).includes(currentPeriodKey)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `You have already logged this ${currentGroup.cadence === "weekly" ? "week" : "day"}`,
          });
        }
        if (currentDayKey < String(currentGroup.startDayKey)) {
          throw new TRPCError({ code: "CONFLICT", message: "This group goal has not started yet" });
        }
        if (currentGroup.status !== "active" || currentDayKey >= String(currentGroup.endDayKey)) {
          throw new TRPCError({ code: "CONFLICT", message: "This group has ended and is not accepting more progress" });
        }
        const group = await GoalGroup.findOneAndUpdate(
          {
            _id: input.id,
            creationId: { $type: "string" },
            awarded: false,
            targetHit: false,
            status: "active",
            startDayKey: { $lte: currentDayKey },
            endDayKey: { $gt: currentDayKey },
            loggedOperations: { $ne: input.operationId },
            members: {
              $elemMatch: {
                userId: ctx.session.user.id,
                fundingStatus: "funded",
                contributionPeriodKeys: { $ne: currentPeriodKey },
              },
            },
          },
          [
            {
              $set: {
                current: { $min: ["$target", { $add: ["$current", input.amount] }] },
                targetHit: { $or: ["$targetHit", { $gte: [{ $add: ["$current", input.amount] }, "$target"] }] },
                loggedOperations: {
                  $concatArrays: [{ $ifNull: ["$loggedOperations", []] }, [input.operationId]],
                },
                members: {
                  $map: {
                    input: "$members",
                    as: "member",
                    in: {
                      $cond: [
                        { $eq: ["$$member.userId", ctx.session.user.id] },
                        {
                          $mergeObjects: [
                            "$$member",
                            {
                              contribution: {
                                $add: [
                                  "$$member.contribution",
                                  { $min: [input.amount, { $subtract: ["$target", "$current"] }] },
                                ],
                              },
                              contributionPeriodKeys: {
                                $concatArrays: [
                                  { $ifNull: ["$$member.contributionPeriodKeys", []] },
                                  [currentPeriodKey],
                                ],
                              },
                              lastNote: input.note ?? "",
                            },
                          ],
                        },
                        "$$member",
                      ],
                    },
                  },
                },
              },
            },
          ],
          { returnDocument: "after", updatePipeline: true },
        );
        if (!group) {
          const existing = await GoalGroup.findOne({
            _id: input.id,
            loggedOperations: input.operationId,
            members: fundedMembership,
          });
          if (existing) return serializeGroup(existing, ctx.session.user.id);
          throw new TRPCError({ code: "CONFLICT", message: "This group is not accepting more progress" });
        }
        return serializeGroup(group, ctx.session.user.id);
      }),
    awardPreview: protectedProcedure
      .input(z.object({ id: mongoId }))
      .query(async ({ ctx, input }) => {
        let group = await GoalGroup.findOne({
          _id: input.id,
          creatorId: ctx.session.user.id,
          creationId: { $type: "string" },
        });
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        group = await reconcileGroupLifecycle(group);
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        if (!group.targetHit) throw new TRPCError({ code: "BAD_REQUEST", message: "The group target is not complete" });
        const members = group.members as unknown as Array<any>;
        if (members.some((member) => member.fundingStatus === "pending")) {
          throw new TRPCError({ code: "CONFLICT", message: "A member pledge is still being processed" });
        }
        const amounts = groupAwardAmounts({
          contributions: members.map((member) => Number(member.contribution)),
          pool: Number(group.rewardPool),
          structure: group.rewardStructure ?? "top_3",
        });
        if (!amounts) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This reward structure needs more participant progress" });
        }
        return { group: serializeGroup(group, ctx.session.user.id), amounts };
      }),
    award: protectedProcedure
      .input(z.object({ id: mongoId, specialAwarded: z.boolean().default(false) }))
      .mutation(async ({ ctx, input }) => {
        let group = await GoalGroup.findOne({
          _id: input.id,
          creatorId: ctx.session.user.id,
          creationId: { $type: "string" },
        });
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        group = await reconcileGroupLifecycle(group);
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        if (!group.targetHit) throw new TRPCError({ code: "BAD_REQUEST", message: "The group target is not complete" });
        const members = group.members as unknown as Array<any>;
        if (members.some((member) => member.fundingStatus === "pending")) {
          throw new TRPCError({ code: "CONFLICT", message: "A member pledge is still being processed" });
        }
        const award = await persistGroupAward({
          creatorId: ctx.session.user.id,
          group,
          specialAwarded: input.specialAwarded,
        });
        if (!award) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The reward pool cannot be distributed yet" });
        }
        const awardedGroup = award.group;
        const storedAmounts = (awardedGroup.members as unknown as Array<{ award: number }>).map((member) => member.award);
        if (storedAmounts.some((amount, index) => amount !== award.amounts[index])) {
          throw new TRPCError({ code: "CONFLICT", message: "Awards have already been distributed with a different split" });
        }

        await reconcileGroupAwards(awardedGroup);
        const creatorProfile = await getProfile(ctx.session.user.id);
        return { group: serializeGroup(awardedGroup, ctx.session.user.id), profile: await serializeProfile(creatorProfile) };
      }),
  }),

  social: router({
    leaderboard: protectedProcedure
      .input(z.object({ scope: z.enum(["friends", "groups", "global"]).default("friends") }))
      .query(async ({ ctx, input }) => {
        const entries = await savedLeaderboard(ctx.session.user.id, input.scope);
        return { currentUserName: ctx.session.user.name, scope: input.scope, period: "all-time" as const, entries };
      }),
    badges: protectedProcedure.query(async ({ ctx }) => {
      await ensureUserData(ctx.session.user.id, ctx.session.user.name);
      const profile = await getProfile(ctx.session.user.id);
      return {
        unlockedCount: profile.unlockedBadges.length,
        badges: badgeCatalog.map((badge) => ({
          ...badge,
          unlocked: profile.unlockedBadges.includes(badge.id),
        })),
      };
    }),
    acceptReferral: protectedProcedure
      .input(z.object({ inviteCode: z.string().trim().length(6).transform((value) => value.toUpperCase()) }))
      .mutation(async ({ ctx, input }) => {
        const accountCreatedAt = new Date(String(ctx.session.user.createdAt));
        let referral = await Referral.findOne({ inviteeId: ctx.session.user.id });
        if (!referral && (!Number.isFinite(accountCreatedAt.getTime()) || Date.now() - accountCreatedAt.getTime() > 10 * 60_000)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Invite codes can only be accepted during account creation" });
        }
        const currentInviteWeek = inviteWeekKey();
        await getProfile(ctx.session.user.id);
        const inviter = await RdmProfile.findOne({ referralCode: input.inviteCode });
        if (!inviter || String(inviter.userId) === ctx.session.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invite code not found" });
        }
        if (!referral) {
          try {
            referral = await Referral.create({
              inviteeId: ctx.session.user.id,
              inviterId: inviter.userId,
              inviteCode: input.inviteCode,
            });
          } catch (error: any) {
            if (error?.code !== 11000) throw error;
            referral = await Referral.findOne({ inviteeId: ctx.session.user.id });
          }
        }
        if (!referral || String(referral.inviterId) !== String(inviter.userId)) {
          throw new TRPCError({ code: "CONFLICT", message: "This account already accepted another invite" });
        }

        let inviterProfile = await RdmProfile.findOneAndUpdate(
          { userId: inviter.userId, creditedReferrals: { $ne: ctx.session.user.id } },
          [
            {
              $set: {
                creditedReferrals: { $setUnion: [{ $ifNull: ["$creditedReferrals", []] }, [ctx.session.user.id]] },
                inviteWeek: currentInviteWeek,
                weeklyInvites: {
                  $min: [
                    3,
                    {
                      $add: [
                        { $cond: [{ $eq: ["$inviteWeek", currentInviteWeek] }, { $ifNull: ["$weeklyInvites", 0] }, 0] },
                        1,
                      ],
                    },
                  ],
                },
              },
            },
          ],
          { returnDocument: "after", updatePipeline: true },
        );
        inviterProfile ??= await getProfile(String(inviter.userId));
        const unlocked = inviterProfile.weeklyInvites >= 3;
        if (unlocked && !inviterProfile.unlockedBadges.includes("golden-bloom")) {
          inviterProfile = await RdmProfile.findOneAndUpdate(
            { _id: inviterProfile._id },
            { $addToSet: { unlockedBadges: "golden-bloom" } },
            { returnDocument: "after" },
          ) ?? inviterProfile;
        }
        return {
          weeklyInvites: inviterProfile.weeklyInvites,
          remaining: Math.max(0, 3 - inviterProfile.weeklyInvites),
          unlocked,
          accepted: true,
        };
      }),
  }),

  wallet: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      await ensureUserData(ctx.session.user.id, ctx.session.user.name);
      return serializeProfile(await getProfile(ctx.session.user.id));
    }),
    donate: protectedProcedure
      .input(z.object({ charity: z.enum(["Plant a Tree Trust", "Rural Education Fund"]), amount: z.number().int().min(1).max(1000) }))
      .mutation(() => {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Charity donations are not available yet. Your RDM stays in your Remorse Purse." });
      }),
    redeem: protectedProcedure
      .input(z.object({ rewardId: z.enum(["focus-garden"]) }))
      .mutation(() => {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reward redemption is not available yet. Your RDM stays in your Reward Purse." });
      }),
  }),
});
