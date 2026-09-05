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
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
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
  habitTemplates,
  initialBadgeIds,
  inviteWeekKey,
  isValidTimeZone,
  levelForXp,
  missedHabitPledgeDayKeys,
  previousDayKeyForTimeZone,
  rewardToRemorseTransfer,
  rewardCatalog,
  rewardForGame,
  releaseHabitPledgeBalances,
  treeGrowthFor,
  treeMissedDayPenalty,
  type GameId,
  type WalletBalances,
} from "../domain/rdm";
import { evaluateGameAction, gamePromptFor, memoryBoardForSeed } from "../domain/game-rules";

const nowIso = () => new Date().toISOString();
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
  z.object({ type: z.literal("focus_tap") }),
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
  const schedule = habitPledgeSchedule({ startDayKey, endDayKey, dailyPledge: perDay });
  if (!schedule) return null;
  return {
    ...schedule,
    perDay,
    startDayKey,
    endDayKey,
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
  const pledgeStatus: "upcoming" | "active" | "finished" = pledgeSchedule
    ? todayDayKey < pledgeSchedule.startDayKey
      ? "upcoming"
      : todayDayKey >= pledgeSchedule.endDayKey || Number(habit.rdmPledgeRemaining) <= 0
        ? "finished"
        : "active"
    : "finished";

  return {
    id: String(habit._id),
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
        dayCount: pledgeSchedule.dayCount,
        settledDayKeys,
        completedDayKeys: Array.from(habit.rdmPledgeCompletedDayKeys ?? [], String),
        currentDayKey: habit.currentDayKey ? String(habit.currentDayKey) : null,
        status: pledgeStatus,
      }
      : null,
    source: String(habit.source) as (typeof habitSources)[number],
    stage: String(habit.stage) as (typeof habitStages)[number],
    streak: Number(habit.streak),
    lastAction: habit.lastAction ? String(habit.lastAction) : null,
    reflection: habit.reflection ? String(habit.reflection) : null,
    lastOutcome: habit.lastOutcome ? String(habit.lastOutcome) as (typeof habitOutcomes)[number] : null,
    lastCompletedDayKey: habit.lastCompletedDayKey
      ? String(habit.lastCompletedDayKey)
      : null,
    completedDays: Array.from(habit.completedDays ?? [], Number),
    active: Boolean(habit.active),
  };
}

function serializeProfile(profile: any) {
  const streak = Number(profile.streak);
  const waterCount = Number(profile.treeWaterCount ?? 0);
  const sunlightCount = Number(profile.treeSunlightCount ?? 0);
  const growth = treeGrowthFor(streak, waterCount + sunlightCount);
  const wallet = walletBalancesForProfile(profile);

  return {
    xp: Number(profile.xp),
    level: Number(profile.level),
    streak,
    plantStage: growth.stage,
    tree: {
      pledgeAmount: Number(profile.treePledgeAmount ?? 0),
      pledgedAt: profile.treePledgedAt ? new Date(profile.treePledgedAt).toISOString() : null,
      timeZone: String(profile.treeTimeZone ?? "Asia/Kolkata"),
      waterCount,
      lastWateredAt: profile.treeLastWateredAt
        ? new Date(profile.treeLastWateredAt).toISOString()
        : null,
      sunlightCount,
      lastSunlightAt: profile.treeLastSunlightAt
        ? new Date(profile.treeLastSunlightAt).toISOString()
        : null,
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
    })),
  };
}

function serializeGoal(goal: any) {
  return {
    id: String(goal._id),
    title: String(goal.title),
    category: String(goal.category) as (typeof goalCategories)[number],
    target: String(goal.target),
    durationDays: Number(goal.durationDays),
    startDayKey: String(goal.startDayKey),
    endDayKey: String(goal.endDayKey),
    timeZone: String(goal.timeZone),
    pledgeAmount: Number(goal.pledgeAmount),
    progress: Number(goal.progress),
    active: Boolean(goal.active),
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
    $push: { transactions: { $each: [{ title, amount, kind, createdAt: new Date() }], $position: 0 } },
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

async function settleGameSession(session: any, userId: string, completedAt = new Date()) {
  const game = gameCatalog.find((item) => item.id === session.gameId);
  if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
  let settled = session;

  for (let attempt = 0; settled?.status === "running" && attempt < 5; attempt += 1) {
    const revision = Number(settled.revision ?? 0);
    const revisionFilter = revision === 0
      ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
      : { revision };
    const reward = rewardForGame(game.durationSeconds / 60, settled.score);
    settled = await GameSession.findOneAndUpdate(
      { _id: settled._id, userId, status: "running", ...revisionFilter },
      { $set: { status: "complete", completedAt, reward } },
      { returnDocument: "after" },
    ) ?? await GameSession.findOne({ _id: settled._id, userId });
  }

  if (settled?.status === "complete" && settled.reward <= 0) {
    const reward = rewardForGame(game.durationSeconds / 60, settled.score);
    settled = await GameSession.findOneAndUpdate(
      { _id: settled._id, userId, status: "complete", reward: { $lte: 0 } },
      { $set: { reward } },
      { returnDocument: "after" },
    ) ?? settled;
  }

  if (!settled || settled.status !== "complete") {
    throw new TRPCError({ code: "CONFLICT", message: "This game session could not be locked" });
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
}: {
  amount: number;
  dayKey: string;
  destination: "reward" | "remorse";
  missedAction?: string;
  reflection?: string;
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
  if (
    habit.stage !== expectedStage
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

async function recordTreeCareActivity({
  userId,
  kind,
  operationId,
  dayKey,
  timeZone,
}: {
  userId: string;
  kind: TreeCareKind;
  operationId: string;
  dayKey: string;
  timeZone: string;
}) {
  const activeTree = await RdmProfile.exists({
    userId,
    treePledgedAt: { $exists: true },
  });
  if (!activeTree) return;
  try {
    await TreeCareActivity.create({ userId, kind, operationId, dayKey, timeZone });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
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
    dayNumber: Math.max(1, Number(profile.streak ?? 0) + 1),
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
  if (profile.treeTimeZone !== timeZone) {
    profile = await RdmProfile.findOneAndUpdate(
      { userId },
      { $set: { treeTimeZone: timeZone } },
      { returnDocument: "after" },
    ) ?? profile;
  }
  if (!profile.treePledgedAt) return { profile, missedDay: null };

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

  const [recordedCare, gratitudeCare, goodDeedCare] = await Promise.all([
    TreeCareActivity.find({
      userId,
      dayKey: { $in: pendingDayKeys },
      occurredAt: { $gte: pledgedAt },
    }).select("dayKey"),
    GratitudeEntry.find({
      userId,
      dayKey: { $in: pendingDayKeys },
      processedAt: { $gte: pledgedAt },
    }).select("dayKey"),
    GoodDeedEntry.find({
      userId,
      dayKey: { $in: pendingDayKeys },
      processedAt: { $gte: pledgedAt },
    }).select("dayKey"),
  ]);
  const caredForDayKeys = new Set([
    ...recordedCare.map((entry) => String(entry.dayKey)),
    ...gratitudeCare.map((entry) => String(entry.dayKey)),
    ...goodDeedCare.map((entry) => String(entry.dayKey)),
  ]);

  let blockedByRewardBalance = false;
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

      const transfer = rewardToRemorseTransfer(
        profile.rewardBalance,
        profile.remorseBalance,
        treeMissedDayPenalty,
      );
      if (!transfer) {
        blockedByRewardBalance = true;
        break;
      }
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

    if (blockedByRewardBalance) break;
    if (!reconciled) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Could not evaluate tree care for ${dayKey}`,
      });
    }
  }

  const missedDay = serializeTreeMissedDay(profile);
  if (blockedByRewardBalance && !missedDay) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Keep at least ${treeMissedDayPenalty} RDM in Reward Purse while this tree is active.`,
    });
  }
  return { profile, missedDay };
}

async function reconcileScheduledHabitOutcome(habit: any, userId: string) {
  const pledge = scheduledHabitPledge(habit);
  if (!pledge) return habit;

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
  const settledDayKeys = new Set(
    Array.from(current.rdmPledgeSettledDayKeys ?? [], String),
  );
  if (currentDayKey < pledge.startDayKey) {
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
  if (!group.awarded) return;
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
          $setUnion: [
            {
              $filter: {
                input: "$creditedOperations",
                as: "creditedOperation",
                cond: { $ne: ["$$creditedOperation", lockOperationId] },
              },
            },
            [operationId],
          ],
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
  if (current.status === "active") {
    const pendingMembers = (current.members as unknown as Array<any>).filter(
      (member) => member.userId && member.fundingStatus === "pending",
    );
    for (const member of pendingMembers) {
      await fundPendingGroupMember(current, String(member.userId));
      current = await GoalGroup.findById(current._id) ?? current;
    }
  }
  const endDayKey = String(current.endDayKey ?? "");
  const timeZone = String(current.timeZone ?? "Asia/Kolkata");
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDayKey)) {
    const status = groupGoalStatusForDay({
      currentDayKey: dayKeyForTimeZone(new Date(), timeZone),
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
  deletePending,
  findFunded,
  operationId,
  title,
  userId,
}: {
  activatePending: () => Promise<any>;
  amount: number;
  deletePending: () => Promise<unknown>;
  findFunded: () => Promise<any>;
  operationId: string;
  title: string;
  userId: string;
}) {
  const profile = await lockBasePledge({ amount, operationId, title, userId });
  if (!profile) {
    await deletePending();
    return null;
  }

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
    deletePending: () => Habit.deleteOne({
      _id: habit._id,
      userId,
      rdmPledgeFundingStatus: "pending",
    }),
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
  for (const habit of pendingHabits) await fundPendingHabit(habit, userId);
}

async function fundPendingGoal(goal: any, userId: string) {
  if (goal.fundingStatus !== "pending") return goal;

  return fundPendingRecord({
    activatePending: () => Goal.findOneAndUpdate(
      { _id: goal._id, userId, fundingStatus: "pending" },
      { $set: { fundingStatus: "funded", active: true } },
      { returnDocument: "after" },
    ),
    amount: Number(goal.pledgeAmount),
    deletePending: () => Goal.deleteOne({
      _id: goal._id,
      userId,
      fundingStatus: "pending",
    }),
    findFunded: () => Goal.findOne({
      _id: goal._id,
      userId,
      fundingStatus: "funded",
    }),
    operationId: `goal-stake:${goal._id}`,
    title: `Goal pledge locked — ${goal.title}`,
    userId,
  });
}

async function reconcilePendingGoalFunding(userId: string) {
  const pendingGoals = await Goal.find({ userId, fundingStatus: "pending" });
  for (const goal of pendingGoals) await fundPendingGoal(goal, userId);
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
  if (currentDayKey >= String(group.endDayKey)) {
    const profile = await getProfile(userId);
    if (profile.creditedOperations.includes(operationId)) {
      await returnGroupPledge({ amount, group, lockOperationId: operationId, userId });
    }
    if (String(group.creatorId) === userId && group.status === "pending") {
      await GoalGroup.deleteOne({ _id: group._id, creatorId: userId, status: "pending" });
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
    deletePending: async () => {
      if (String(group.creatorId) === userId && group.status === "pending") {
        await GoalGroup.deleteOne({ _id: group._id, creatorId: userId, status: "pending" });
        return;
      }
      await GoalGroup.updateOne(
        { _id: group._id },
        { $pull: { members: { userId, fundingStatus: "pending" } } },
      );
    },
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
  if (profile.creditedOperations.includes(operationId)) {
    await returnGroupPledge({ amount, group, lockOperationId: operationId, userId });
    await GoalGroup.updateOne(
      { _id: group._id },
      { $pull: { members: { userId, fundingStatus: "pending" } } },
    );
  }
  return null;
}

async function reconcilePendingGroupFunding(userId: string) {
  const pendingGroups = await GoalGroup.find({
    "members": { $elemMatch: { userId, fundingStatus: "pending" } },
  });
  for (const group of pendingGroups) await fundPendingGroupMember(group, userId);
}

async function purgeLegacySeedGroups(userId: string) {
  const legacySeeds = await GoalGroup.find({
    creatorId: userId,
    creationId: { $exists: false },
    name: "Family Fitness Streak",
    "members.name": "Others",
  });
  for (const group of legacySeeds) {
    let safeToDelete = true;
    const members = group.members as unknown as Array<any>;
    for (const member of members) {
      const memberUserId = String(member.userId ?? "");
      const award = Number(member.award ?? 0);
      if (!memberUserId || !Number.isInteger(award) || award <= 0) continue;
      const awardOperationId = `group:${group._id}:${memberUserId}`;
      const collectibleOperationId = `group-collectible:${group._id}:${memberUserId}`;
      const profile = await RdmProfile.findOne({ userId: memberUserId });
      if (!profile?.creditedOperations.includes(awardOperationId)) continue;
      const reversed = await RdmProfile.findOneAndUpdate(
        {
          userId: memberUserId,
          creditedOperations: awardOperationId,
          walletBalance: { $gte: award },
          peerBalance: { $gte: award },
        },
        {
          $inc: { walletBalance: -award, peerBalance: -award },
          $pull: {
            collectibles: { groupId: String(group._id) },
            creditedOperations: { $in: [awardOperationId, collectibleOperationId] },
            transactions: { operationId: awardOperationId },
          },
        },
      );
      if (!reversed) safeToDelete = false;
    }
    if (safeToDelete) await GoalGroup.deleteOne({ _id: group._id });
  }
}

async function ensureSeedData(userId: string, _userName: string) {
  let profile = await RdmProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, unlockedBadges: initialBadgeIds } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
  if (profile.unlockedBadges.length < initialBadgeIds.length) {
    unlockBadges(profile, initialBadgeIds);
    await profile.save();
  }
  profile = await resetWeeklyInvites(profile);
  await ensureReferralCode(profile);
  await reconcilePendingHabitFunding(userId);
  await reconcilePendingGoalFunding(userId);
  await reconcilePendingGroupFunding(userId);

  let habits = await Habit.find({ userId, active: true }).sort({ createdAt: 1 });
  if (habits.length === 0 && await Habit.countDocuments({ userId }) === 0) {
    const template = habitTemplates[0];
    const seededHabit = await Habit.create({
      userId,
      title: template.title,
      category: template.category,
      icon: template.icon,
      cadence: template.cadence,
      target: template.target,
      pledge: template.pledge,
      source: "template",
      stage: "reflect",
      streak: 18,
      lastAction: "Logged today · 92 minutes · No interruptions",
      reflection: "Felt easier today — putting the phone in the other room really helped.",
      completedDays: [1, 2, 3],
    });
    habits = [seededHabit];
  }
  for (let index = 0; index < habits.length; index += 1) {
    const habit = habits[index];
    if (habit) habits[index] = await reconcileHabitOutcome(habit, userId);
  }
  profile = await getProfile(userId);

  await purgeLegacySeedGroups(userId);
  const groups = await GoalGroup.find({ creatorId: userId }).sort({ createdAt: 1 });

  return { profile, habits, groups };
}

async function getProfile(userId: string) {
  let profile = await RdmProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, unlockedBadges: initialBadgeIds } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
  if (profile.unlockedBadges.length < initialBadgeIds.length) {
    unlockBadges(profile, initialBadgeIds);
    await profile.save();
  }
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
    const { profile: seededProfile, habits, groups } = await ensureSeedData(
      ctx.session.user.id,
      ctx.session.user.name,
    );
    const { profile } = await reconcileTreeMissedDay(
      ctx.session.user.id,
      String(seededProfile.treeTimeZone ?? "Asia/Kolkata"),
    );
    return {
      user: { name: ctx.session.user.name, email: ctx.session.user.email },
      profile: serializeProfile(profile),
      habits: habits.map(serializeHabit),
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
    overview: protectedProcedure
      .input(z.object({ timeZone: timeZoneSchema }))
      .query(async ({ ctx, input }) => {
        await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
        const result = await reconcileTreeMissedDay(ctx.session.user.id, input.timeZone);
        return {
          profile: serializeProfile(result.profile),
          missedDay: result.missedDay,
        };
      }),
    missedDay: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getProfile(ctx.session.user.id);
      return {
        profile: serializeProfile(profile),
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
        await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
        const pledgedAt = new Date();
        const previousPledgeDayKey = previousDayKeyForTimeZone(
          pledgedAt,
          input.timeZone,
        );
        const profile = await RdmProfile.findOneAndUpdate(
          {
            userId: ctx.session.user.id,
            rewardBalance: { $gte: treeMissedDayPenalty },
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
          code: "BAD_REQUEST",
          message: `Keep at least ${treeMissedDayPenalty} RDM in Reward Purse before creating a tree.`,
        });
      }),
  }),

  goodDeeds: router({
    today: protectedProcedure
      .input(z.object({ timeZone: timeZoneSchema }))
      .query(async ({ ctx, input }) => {
        await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
        const dayKey = dayKeyForTimeZone(new Date(), input.timeZone);
        const entries = await GoodDeedEntry.find({
          userId: ctx.session.user.id,
          dayKey,
        });
        const entriesByDeedId = new Map(
          entries.map((entry) => [String(entry.deedId), entry]),
        );

        return {
          dayKey,
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
      .input(z.object({ deedIds: goodDeedSelection, timeZone: timeZoneSchema }))
      .mutation(async ({ ctx, input }) => {
        await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
        const dayKey = dayKeyForTimeZone(new Date(), input.timeZone);
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
          if (completedNow) {
            await recordTreeCareActivity({
              userId: ctx.session.user.id,
              kind: "sunlight",
              operationId: `good-deed:${entry._id}`,
              dayKey,
              timeZone: input.timeZone,
            });
          }
          submissionActions.push({ completedNow, reward: Number(entry.reward) });
          entries.push(serializeGoodDeedEntry(entry));
        }

        const submissionResult = goodDeedSubmissionResult(submissionActions);

        return {
          dayKey,
          entries,
          ...submissionResult,
          rewardMessage: goodDeedRewardMessage,
          profile: serializeProfile(await getProfile(ctx.session.user.id)),
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
        const entry = await GratitudeEntry.findOne({
          userId: ctx.session.user.id,
          category: input.category,
          dayKey: dayKeyForTimeZone(new Date(), input.timeZone),
        });
        return {
          category,
          todayEntry: entry ? serializeGratitudeEntry(entry) : null,
        };
      }),
    save: protectedProcedure
      .input(z.object({
        category: z.enum(gratitudeCategoryIds),
        body: z.string().trim().min(4).max(1000),
        timeZone: timeZoneSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
        const category = gratitudeCategoryById(input.category);
        if (!category) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gratitude category not found" });
        }

        const dayKey = dayKeyForTimeZone(new Date(), input.timeZone);
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

        const profile = await creditProfile({
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
        if (processedNow) {
          await recordTreeCareActivity({
            userId: ctx.session.user.id,
            kind: "water",
            operationId: `gratitude:${entry._id}`,
            dayKey,
            timeZone: input.timeZone,
          });
        }

        return {
          category,
          entry: serializeGratitudeEntry(entry),
          profile: serializeProfile(profile),
          reward: processedNow ? entry.reward : 0,
          alreadySaved: !processedNow,
        };
      }),
  }),

  habits: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
      const habits = await Habit.find({ userId: ctx.session.user.id, active: true }).sort({ createdAt: 1 });
      const reconciled = [];
      for (const habit of habits) {
        reconciled.push(await reconcileHabitOutcome(habit, ctx.session.user.id));
      }
      return reconciled.filter((habit) => habit.active).map(serializeHabit);
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
      .input(z.object({
        title: z.string().trim().min(2).max(80),
        category: z.enum(habitCategories),
        icon: z.string().min(1).default("target"),
        cadence: z.string().trim().min(2).max(40),
        target: z.string().trim().min(2).max(120),
        pledge: z.string().trim().min(8).max(500),
        creationId: z.string().uuid(),
        rdmPledgePerDay: z.number().int().min(1).max(100_000),
        rdmPledgeStartDayKey: dayKeySchema,
        rdmPledgeEndDayKey: dayKeySchema,
        timeZone: timeZoneSchema,
        source: z.enum(habitSources),
      }))
      .mutation(async ({ ctx, input }) => {
        const schedule = habitPledgeSchedule({
          startDayKey: input.rdmPledgeStartDayKey,
          endDayKey: input.rdmPledgeEndDayKey,
          dailyPledge: input.rdmPledgePerDay,
        });
        const currentDayKey = dayKeyForTimeZone(new Date(), input.timeZone);
        if (!schedule || schedule.dayCount > 365) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a commitment window between 1 and 365 days.",
          });
        }
        if (input.rdmPledgeStartDayKey < currentDayKey) {
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
        const existingHabit = await Habit.findOne({
          userId: ctx.session.user.id,
          rdmPledgeCreationId: input.creationId,
        });
        if (existingHabit) {
          const fundedHabit = await fundPendingHabit(existingHabit, ctx.session.user.id);
          if (!fundedHabit) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `You need ${schedule.totalPledge} RDM in your Base Purse for this habit.`,
            });
          }
          return serializeHabit(fundedHabit);
        }
        const habit = new Habit({
          ...input,
          userId: ctx.session.user.id,
          active: false,
          stage: input.rdmPledgeStartDayKey === currentDayKey ? "act" : "pledge",
          streak: 0,
          completedDays: [],
          rdmPledgeCreationId: input.creationId,
          rdmPledgeTotal: schedule.totalPledge,
          rdmPledgeRemaining: schedule.totalPledge,
          rdmPledgeTimeZone: input.timeZone,
          rdmPledgeFundingStatus: "pending",
          rdmPledgeSettledDayKeys: [],
          rdmPledgeCompletedDayKeys: [],
          currentDayKey: input.rdmPledgeStartDayKey === currentDayKey
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
            })
            : {
              $set: {
                reflection: input.reflection,
                stage: "reward",
                lastOutcome: "completed",
                lastCompletedDayKey: dayKey,
              },
              $inc: { streak: 1 },
              $addToSet: { completedDays: day },
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
          await recordTreeCareActivity({
            userId: ctx.session.user.id,
            kind: "fertilizer",
            operationId: `habit:${habit._id}:${habit.cycle}`,
            dayKey,
            timeZone,
          });
        }
        return {
          habit: serializeHabit(habit),
          profile: serializeProfile(profile),
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
          : null;
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
            ...(dayKey
              ? {
                currentDayKey: dayKey,
                rdmPledgeSettledDayKeys: { $ne: dayKey },
                rdmPledgeRemaining: { $gte: penalty },
              }
              : {}),
          },
          dayKey
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
              },
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
          profile: serializeProfile(profile),
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
        if (!habitCanStartNextCycle(current.lastCompletedDayKey, currentDayKey)) {
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
      await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
      const goals = await Goal.find({
        userId: ctx.session.user.id,
        active: true,
        fundingStatus: "funded",
      }).sort({ createdAt: -1 });
      return goals.map(serializeGoal);
    }),
    create: protectedProcedure
      .input(z.object({
        creationId: z.string().uuid(),
        title: z.string().trim().min(3).max(80),
        category: z.enum(goalCategories),
        target: z.string().trim().min(2).max(120),
        durationDays: z.number().int().min(1).max(3_650),
        startDayKey: dayKeySchema,
        timeZone: timeZoneSchema,
        pledgeAmount: z.number().int().min(1).max(100_000),
      }))
      .mutation(async ({ ctx, input }) => {
        const window = goalDurationWindow(input.startDayKey, input.durationDays);
        const currentDayKey = dayKeyForTimeZone(new Date(), input.timeZone);
        if (!window) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid goal duration." });
        }
        if (input.startDayKey < currentDayKey) {
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
        if (existingGoal) {
          const fundedGoal = await fundPendingGoal(existingGoal, ctx.session.user.id);
          if (!fundedGoal) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `You need ${input.pledgeAmount} RDM in your Base Purse for this goal.`,
            });
          }
          return serializeGoal(fundedGoal);
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
          fundingStatus: "pending",
          progress: 0,
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
          goal = concurrentGoal;
        }
        const fundedGoal = await fundPendingGoal(goal, ctx.session.user.id);
        if (!fundedGoal) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `You need ${input.pledgeAmount} RDM in your Base Purse for this goal.`,
          });
        }
        return serializeGoal(fundedGoal);
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
        await ensureSeedData(ctx.session.user.id, ctx.session.user.name);

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
          profile: serializeProfile(profile),
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
      await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
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
          String(group.creatorId) === ctx.session.user.id
          || (group.members as unknown as Array<any>).some(
            (member) => member.userId === ctx.session.user.id && member.fundingStatus !== "pending",
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
            { "members.userId": ctx.session.user.id },
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
        const profile = await getProfile(ctx.session.user.id);
        const serialized = serializeGroup(group, ctx.session.user.id);
        return {
          group: serialized,
          profile: serializeProfile(profile),
          alreadyJoined: serialized.members.some((member) => member.currentUser),
        };
      }),
    create: protectedProcedure
      .input(z.object({
        creationId: z.string().uuid(),
        category: z.enum(groupGoalCategories),
        activityId: z.string().trim().min(1).max(80),
        name: z.string().trim().min(3).max(80),
        description: z.string().trim().min(3).max(240),
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
        if (existingMember && Number(existingMember.pledgeAmount) !== input.pledgeAmount) {
          throw new TRPCError({ code: "CONFLICT", message: "This join request already has a different pledge" });
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
        if (
          currentGroup.rewardStructure === "top_3"
          && (currentGroup.members as unknown as Array<any>).filter(
            (member) => member.fundingStatus === "funded",
          ).length < 3
          && Number(currentGroup.current) + input.amount >= Number(currentGroup.target)
        ) {
          throw new TRPCError({ code: "CONFLICT", message: "Top 3 rewards need at least three funded members before the final progress is logged" });
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
        const group = await GoalGroup.findOne({
          _id: input.id,
          creatorId: ctx.session.user.id,
          creationId: { $type: "string" },
        });
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
        if (!group.targetHit) throw new TRPCError({ code: "BAD_REQUEST", message: "The group target is not complete" });
        let members = group.members as unknown as Array<any>;
        if (members.some((member) => member.fundingStatus === "pending")) {
          throw new TRPCError({ code: "CONFLICT", message: "A member pledge is still being processed" });
        }
        const amounts = groupAwardAmounts({
          contributions: members.map((member) => Number(member.contribution)),
          pool: Number(group.rewardPool),
          structure: group.rewardStructure ?? "top_3",
        });
        if (!amounts || !awardSplitIsValid(amounts, Number(group.rewardPool))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The reward pool cannot be distributed yet" });
        }
        const specialRecipient = members
          .filter((member) => member.userId)
          .sort((left, right) => Number(right.contribution) - Number(left.contribution))[0];
        const awardedAt = new Date();
        const specialCollectible = input.specialAwarded && specialRecipient
          ? {
            collectibleId: `group-goal-${group._id}`,
            groupId: String(group._id),
            title: `${group.name} Champion`,
            recipientUserId: String(specialRecipient.userId),
            recipientName: String(specialRecipient.name),
            awardedAt,
          }
          : null;
        if (!group.awarded) {
          group = await GoalGroup.findOneAndUpdate(
            {
              _id: input.id,
              creatorId: ctx.session.user.id,
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
          ) ?? await GoalGroup.findOne({
            _id: input.id,
            creatorId: ctx.session.user.id,
            creationId: { $type: "string" },
          });
        }

        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        members = group.members as unknown as Array<{ userId?: string; contribution: number; award: number }>;
        const storedAmounts = members.map((member) => member.award);
        if (storedAmounts.some((amount, index) => amount !== amounts[index])) {
          throw new TRPCError({ code: "CONFLICT", message: "Awards have already been distributed with a different split" });
        }

        await reconcileGroupAwards(group);
        const creatorProfile = await getProfile(ctx.session.user.id);
        return { group: serializeGroup(group, ctx.session.user.id), profile: serializeProfile(creatorProfile) };
      }),
  }),

  social: router({
    leaderboard: protectedProcedure
      .input(z.object({ scope: z.enum(["friends", "groups", "global"]).default("friends") }))
      .query(async ({ ctx, input }) => {
        const entriesByScope = {
          friends: [
            { name: "Ravi", initials: "RA", points: 2140 },
            { name: ctx.session.user.name, initials: initialsForName(ctx.session.user.name), points: 1980 },
            { name: "Priya", initials: "PK", points: 1760 },
            { name: "Meera J.", initials: "MJ", points: 1510 },
            { name: "Arun K.", initials: "AK", points: 1290 },
            { name: "Tara S.", initials: "TS", points: 1110 },
          ],
          groups: [
            { name: "Family Fitness", initials: "FF", points: 4820 },
            { name: "Morning Makers", initials: "MM", points: 4310 },
            { name: "Focus Circle", initials: "FC", points: 3970 },
            { name: "Green Steps", initials: "GS", points: 3440 },
            { name: "Study Crew", initials: "SC", points: 2980 },
            { name: "Kindness Club", initials: "KC", points: 2710 },
          ],
          global: [
            { name: "Aanya S.", initials: "AS", points: 9340 },
            { name: "Daniel K.", initials: "DK", points: 8890 },
            { name: "Mina R.", initials: "MR", points: 8470 },
            { name: ctx.session.user.name, initials: initialsForName(ctx.session.user.name), points: 1980 },
            { name: "Leo P.", initials: "LP", points: 7640 },
            { name: "Sofia T.", initials: "ST", points: 7310 },
          ],
        } as const;
        const entries = entriesByScope[input.scope]
          .map((entry) => ({
            ...entry,
            currentUser: entry.name === ctx.session.user.name,
          }))
          .sort((left, right) => right.points - left.points)
          .map((entry, index) => ({ ...entry, rank: index + 1 }));
        return { currentUserName: ctx.session.user.name, scope: input.scope, entries };
      }),
    badges: protectedProcedure.query(async ({ ctx }) => {
      await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
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
      await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
      return serializeProfile(await getProfile(ctx.session.user.id));
    }),
    donate: protectedProcedure
      .input(z.object({ charity: z.enum(["Plant a Tree Trust", "Rural Education Fund"]), amount: z.number().int().min(1).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        await getProfile(ctx.session.user.id);
        const profile = await RdmProfile.findOneAndUpdate(
          {
            userId: ctx.session.user.id,
            walletBalance: { $gte: input.amount },
            remorseBalance: { $gte: input.amount },
          },
          {
            $inc: { walletBalance: -input.amount, remorseBalance: -input.amount },
            $addToSet: { unlockedBadges: "first-charity" },
            $push: { transactions: { $each: [{ title: `Gift to ${input.charity}`, amount: -input.amount, kind: "charity", createdAt: new Date() }], $position: 0 } },
          },
          { returnDocument: "after" },
        );
        if (!profile) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Not enough remorse balance" });
        }
        return serializeProfile(profile);
      }),
    redeem: protectedProcedure
      .input(z.object({ rewardId: z.enum(["focus-garden"]) }))
      .mutation(async ({ ctx, input }) => {
        const reward = rewardCatalog.find((item) => item.id === input.rewardId);
        if (!reward) throw new TRPCError({ code: "NOT_FOUND", message: "Reward not found" });
        await getProfile(ctx.session.user.id);
        const profile = await RdmProfile.findOneAndUpdate(
          {
            userId: ctx.session.user.id,
            walletBalance: { $gte: reward.cost },
            rewardBalance: { $gte: reward.cost },
            unlockedRewards: { $ne: reward.id },
          },
          {
            $inc: { walletBalance: -reward.cost, rewardBalance: -reward.cost },
            $addToSet: { unlockedRewards: reward.id },
            $push: { transactions: { $each: [{ title: `Redeemed ${reward.title}`, amount: -reward.cost, kind: "redeem", createdAt: new Date() }], $position: 0 } },
          },
          { returnDocument: "after" },
        );
        if (!profile) throw new TRPCError({ code: "CONFLICT", message: "Reward is already unlocked or the reward purse is too low" });
        return serializeProfile(profile);
      }),
  }),
});
