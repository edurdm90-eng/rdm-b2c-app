import {
  GameSession,
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
  gameSessionCanReward,
  goodDeedById,
  goodDeedCatalog,
  goodDeedRewardMessage,
  goodDeedSubmissionResult,
  gratitudeCategories,
  gratitudeCategoryById,
  groupAwardCredits,
  habitCanStartNextCycle,
  habitCategories,
  habitTemplates,
  initialBadgeIds,
  inviteWeekKey,
  isValidTimeZone,
  levelForXp,
  previousDayKeyForTimeZone,
  rewardToRemorseTransfer,
  rewardCatalog,
  rewardForGame,
  treeGrowthFor,
  treeMissedDayPenalty,
  type WalletBalances,
} from "../domain/rdm";

const nowIso = () => new Date().toISOString();
const mongoId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
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

function serializeHabit(habit: any) {
  return {
    id: String(habit._id),
    title: String(habit.title),
    category: String(habit.category),
    icon: String(habit.icon),
    cadence: String(habit.cadence),
    target: String(habit.target),
    pledge: String(habit.pledge),
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
  return {
    id: String(group._id),
    name: String(group.name),
    target: Number(group.target),
    current: Number(group.current),
    unit: String(group.unit),
    rewardPool: Number(group.rewardPool),
    targetHit: Boolean(group.targetHit),
    awarded: Boolean(group.awarded),
    inviteCode: String(group.inviteCode),
    canAward: String(group.creatorId) === currentUserId,
    members: Array.from(group.members ?? []).map((member: any) => ({
      name: String(member.name),
      initials: String(member.initials),
      contribution: Number(member.contribution),
      award: Number(member.award),
      currentUser: member.userId ? String(member.userId) === currentUserId : false,
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
  const level = levelForXp(profile.xp);
  if (profile.level !== level) {
    profile = await RdmProfile.findOneAndUpdate(
      { _id: profile._id },
      { $max: { level } },
      { returnDocument: "after" },
    ) ?? profile;
  }
  return profile;
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

async function reconcileHabitOutcome(habit: any, userId: string) {
  if (habit.stage !== "reward") return;
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
}

async function ensureSeedData(userId: string, userName: string) {
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

  let habits = await Habit.find({ userId, active: true }).sort({ createdAt: 1 });
  if (habits.length === 0) {
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
  for (const habit of habits) await reconcileHabitOutcome(habit, userId);
  profile = await getProfile(userId);

  let groups = await GoalGroup.find({ creatorId: userId }).sort({ createdAt: 1 });
  if (groups.length === 0) {
    const seededGroup = await GoalGroup.create({
      creatorId: userId,
      inviteCode: createInviteCode(),
      name: "Family Fitness Streak",
      target: 500,
      current: 210,
      unit: "km",
      rewardPool: 300,
      targetHit: true,
      members: [
        { userId, name: userName, initials: initialsForName(userName), contribution: 72, award: 80 },
        { name: "Ravi A.", initials: "RA", contribution: 64, award: 120 },
        { name: "Priya K.", initials: "PK", contribution: 51, award: 60 },
        { name: "Others", initials: "+3", contribution: 23, award: 40 },
      ],
    });
    groups = [seededGroup];
  }

  for (const group of groups) {
    let changed = false;
    if (!group.inviteCode) {
      group.inviteCode = createInviteCode();
      changed = true;
    }
    const members = group.members as unknown as Array<any>;
    const owner = members.find((member) => member.name === "You" || member.userId === userId);
    if (owner && !owner.userId) {
      owner.userId = userId;
      owner.name = userName;
      group.markModified("members");
      changed = true;
    }
    if (changed) await group.save();
  }

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

async function requireBaseRdm(userId: string, purpose: string) {
  const profile = await getProfile(userId);
  if (basePurseBalance(walletBalancesForProfile(profile)) < 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `You need RDM in your Base Purse before creating ${purpose}.`,
    });
  }
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
      return habits.map(serializeHabit);
    }),
    byId: protectedProcedure
      .input(z.object({ id: mongoId }))
      .query(async ({ ctx, input }) => {
        const habit = await Habit.findOne({ _id: input.id, userId: ctx.session.user.id });
        if (!habit) throw new TRPCError({ code: "NOT_FOUND", message: "Habit not found" });
        await reconcileHabitOutcome(habit, ctx.session.user.id);
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
        source: z.enum(habitSources),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireBaseRdm(ctx.session.user.id, "a habit");
        const habit = await Habit.create({
          ...input,
          userId: ctx.session.user.id,
          stage: "act",
          streak: 0,
          completedDays: [],
        });
        return serializeHabit(habit);
      }),
    logAction: protectedProcedure
      .input(z.object({ id: mongoId, note: z.string().trim().min(2).max(240) }))
      .mutation(async ({ ctx, input }) => {
        const habit = await Habit.findOneAndUpdate(
          { _id: input.id, userId: ctx.session.user.id, stage: "act" },
          { $set: { stage: "reflect", lastAction: input.note } },
          { returnDocument: "after" },
        );
        if (!habit) throw new TRPCError({ code: "CONFLICT", message: "This habit is not ready for an action log" });
        return serializeHabit(habit);
      }),
    reflect: protectedProcedure
      .input(z.object({
        id: mongoId,
        reflection: z.string().trim().min(4).max(500),
        timeZone: timeZoneSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        const reward = 25;
        const dayKey = dayKeyForTimeZone(new Date(), input.timeZone);
        const [year, month, calendarDay] = dayKey.split("-").map(Number);
        const day = new Date(Date.UTC(
          year ?? 0,
          (month ?? 1) - 1,
          calendarDay ?? 1,
        )).getUTCDay() || 7;
        let habit = await Habit.findOneAndUpdate(
          {
            _id: input.id,
            userId: ctx.session.user.id,
            stage: "reflect",
            lastCompletedDayKey: { $ne: dayKey },
          },
          {
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
        if (!habit || habit.stage !== "reward" || habit.lastOutcome !== "completed") {
          throw new TRPCError({ code: "CONFLICT", message: "This habit is not ready for reflection" });
        }

        const profile = await creditProfile({
          userId: ctx.session.user.id,
          amount: reward,
          title: `${habit.title} — reflection`,
          kind: "habit",
          purse: "reward",
          operationId: `habit:${habit._id}:${habit.cycle}`,
          badgeIds: ["first-sprout", ...(habit.streak >= 7 ? ["seven-day-streak"] : [])],
          streak: habit.streak,
        });
        await recordTreeCareActivity({
          userId: ctx.session.user.id,
          kind: "fertilizer",
          operationId: `habit:${habit._id}:${habit.cycle}`,
          dayKey,
          timeZone: input.timeZone,
        });
        return { habit: serializeHabit(habit), profile: serializeProfile(profile), reward };
      }),
    miss: protectedProcedure
      .input(z.object({ id: mongoId }))
      .mutation(async ({ ctx, input }) => {
        const penalty = 10;
        let habit = await Habit.findOneAndUpdate(
          { _id: input.id, userId: ctx.session.user.id, stage: "act" },
          {
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
        if (!habit || habit.stage !== "reward" || habit.lastOutcome !== "missed") {
          throw new TRPCError({ code: "CONFLICT", message: "This habit is not ready to be marked missed" });
        }

        const result = await debitMissedPledge({
          userId: ctx.session.user.id,
          operationId: `miss:${habit._id}:${habit.cycle}`,
          title: `Missed pledge — ${habit.title}`,
          penalty,
        });
        return { habit: serializeHabit(habit), profile: serializeProfile(result.profile), penalty: result.appliedPenalty };
      }),
    startNextCycle: protectedProcedure
      .input(z.object({ id: mongoId, timeZone: timeZoneSchema }))
      .mutation(async ({ ctx, input }) => {
        const current = await Habit.findOne({ _id: input.id, userId: ctx.session.user.id, stage: "reward" });
        if (!current) throw new TRPCError({ code: "CONFLICT", message: "Claim the current cycle before starting another" });
        const currentDayKey = dayKeyForTimeZone(new Date(), input.timeZone);
        if (!habitCanStartNextCycle(current.lastCompletedDayKey, currentDayKey)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This habit is complete for today. Come back tomorrow to continue the streak.",
          });
        }
        await reconcileHabitOutcome(current, ctx.session.user.id);
        const habit = await Habit.findOneAndUpdate(
          { _id: input.id, userId: ctx.session.user.id, stage: "reward", cycle: current.cycle },
          { $set: { stage: "act" }, $inc: { cycle: 1 }, $unset: { lastAction: 1, reflection: 1, lastOutcome: 1 } },
          { returnDocument: "after" },
        );
        if (!habit) throw new TRPCError({ code: "CONFLICT", message: "Claim the current cycle before starting another" });
        return serializeHabit(habit);
      }),
  }),

  games: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const dayKey = gameDayKey();
      const now = new Date();
      await GameSession.updateMany(
        {
          userId: ctx.session.user.id,
          dayKey,
          status: "running",
          expiresAt: { $lt: now },
        },
        { $set: { status: "complete", completedAt: now, reward: 0 } },
      );
      const completed = await GameSession.find({ userId: ctx.session.user.id, dayKey, status: "complete" }).select("gameId reward");
      for (const session of completed) {
        if (session.reward <= 0) continue;
        const game = gameCatalog.find((item) => item.id === session.gameId);
        if (!game) continue;
        await creditProfile({
          userId: ctx.session.user.id,
          amount: session.reward,
          title: `${game.title} game`,
          kind: "game",
          purse: "reward",
          operationId: `game:${session._id}`,
          badgeIds: ["first-game"],
        });
      }
      const lockedIds = new Set(completed.map((session) => session.gameId));
      return gameCatalog.map((game) => ({ ...game, locked: lockedIds.has(game.id) }));
    }),
    start: protectedProcedure
      .input(z.object({ gameId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const game = gameCatalog.find((item) => item.id === input.gameId);
        if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
        await ensureSeedData(ctx.session.user.id, ctx.session.user.name);

        const startedAt = new Date();
        const expiresAt = new Date(startedAt.getTime() + game.minutes * 60_000);
        const dayKey = gameDayKey(startedAt);
        const session = await GameSession.findOneAndUpdate(
          { userId: ctx.session.user.id, gameId: game.id, dayKey },
          { $setOnInsert: { userId: ctx.session.user.id, gameId: game.id, dayKey, startedAt, expiresAt, status: "running" } },
          { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
        );
        if (!gameSessionCanReward(session.status, session.expiresAt)) {
          if (session.status === "running") {
            session.status = "complete";
            session.completedAt = new Date();
            session.reward = 0;
            await session.save();
          }
          throw new TRPCError({ code: "CONFLICT", message: "This game is locked after today's completed session" });
        }
        return {
          sessionId: String(session._id),
          expiresAt: session.expiresAt.toISOString(),
          secondsRemaining: Math.max(0, Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000)),
        };
      }),
    progress: protectedProcedure
      .input(z.object({ sessionId: mongoId }))
      .mutation(async ({ ctx, input }) => {
        const actionAt = new Date();
        const session = await GameSession.findOneAndUpdate(
          {
            _id: input.sessionId,
            userId: ctx.session.user.id,
            status: "running",
            expiresAt: { $gte: actionAt },
            $or: [
              { lastActionAt: { $exists: false } },
              { lastActionAt: { $lte: new Date(actionAt.getTime() - 350) } },
            ],
          },
          { $inc: { score: 10, actionCount: 1 }, $set: { lastActionAt: actionAt } },
          { returnDocument: "after" },
        );
        if (!session) throw new TRPCError({ code: "CONFLICT", message: "Wait for the next prompt or the timer has ended" });
        return { accepted: true, score: session.score };
      }),
    complete: protectedProcedure
      .input(z.object({ sessionId: mongoId }))
      .mutation(async ({ ctx, input }) => {
        let existing = await GameSession.findOne({ _id: input.sessionId, userId: ctx.session.user.id });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Game session not found" });
        if (existing.dayKey !== gameDayKey()) {
          throw new TRPCError({ code: "CONFLICT", message: "This game session has expired" });
        }
        const gameId = existing.gameId;
        const game = gameCatalog.find((item) => item.id === gameId);
        if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
        if (existing.status === "running") {
          const completedAt = new Date();
          const reward = rewardForGame(game.minutes, existing.score);
          existing = await GameSession.findOneAndUpdate(
            { _id: input.sessionId, userId: ctx.session.user.id, status: "running" },
            { $set: { status: "complete", completedAt, reward } },
            { returnDocument: "after" },
          ) ?? await GameSession.findOne({ _id: input.sessionId, userId: ctx.session.user.id });
        }
        if (!existing || existing.status !== "complete") throw new TRPCError({ code: "CONFLICT", message: "This game session could not be locked" });

        const reward = existing.reward;
        const profile = await creditProfile({
          userId: ctx.session.user.id,
          amount: reward,
          title: `${game.title} game`,
          kind: "game",
          purse: "reward",
          operationId: `game:${existing._id}`,
          badgeIds: ["first-game"],
        });
        return { reward, profile: serializeProfile(profile), locked: true };
      }),
  }),

  groups: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureSeedData(ctx.session.user.id, ctx.session.user.name);
      const groups = await GoalGroup.find({
        $or: [
          { creatorId: ctx.session.user.id },
          { "members.userId": ctx.session.user.id },
        ],
      }).sort({ createdAt: 1 });
      for (const group of groups) await reconcileGroupAwards(group);
      return groups.map((group) => serializeGroup(group, ctx.session.user.id));
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().trim().min(3).max(80),
        target: z.number().positive().max(100000),
        unit: z.string().trim().min(1).max(20),
      }))
      .mutation(async ({ ctx, input }) => {
        const profile = await requireBaseRdm(ctx.session.user.id, "a group goal");
        const group = await GoalGroup.create({
          creatorId: ctx.session.user.id,
          inviteCode: createInviteCode(),
          name: input.name,
          target: input.target,
          current: 0,
          unit: input.unit,
          rewardPool: 300,
          targetHit: false,
          members: [{ userId: ctx.session.user.id, name: ctx.session.user.name, initials: initialsForName(ctx.session.user.name), contribution: 0, award: 300 }],
        });
        unlockBadges(profile, ["group-starter"]);
        await profile.save();
        return serializeGroup(group, ctx.session.user.id);
      }),
    join: protectedProcedure
      .input(z.object({ inviteCode: z.string().trim().length(6).transform((value) => value.toUpperCase()) }))
      .mutation(async ({ ctx, input }) => {
        await getProfile(ctx.session.user.id);
        const group = await GoalGroup.findOneAndUpdate(
          {
            inviteCode: input.inviteCode,
            creatorId: { $ne: ctx.session.user.id },
            "members.userId": { $ne: ctx.session.user.id },
          },
          {
            $push: {
              members: {
                userId: ctx.session.user.id,
                name: ctx.session.user.name,
                initials: initialsForName(ctx.session.user.name),
                contribution: 0,
                award: 0,
              },
            },
          },
          { returnDocument: "after" },
        );
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Invite code not found or you already joined" });
        return serializeGroup(group, ctx.session.user.id);
      }),
    logContribution: protectedProcedure
      .input(z.object({ id: mongoId, amount: z.number().positive().max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const group = await GoalGroup.findOneAndUpdate(
          {
            _id: input.id,
            $or: [
              { creatorId: ctx.session.user.id },
              { "members.userId": ctx.session.user.id },
            ],
          },
          [
            {
              $set: {
                current: { $min: ["$target", { $add: ["$current", input.amount] }] },
                targetHit: { $or: ["$targetHit", { $gte: [{ $add: ["$current", input.amount] }, "$target"] }] },
                members: {
                  $map: {
                    input: "$members",
                    as: "member",
                    in: {
                      $cond: [
                        { $eq: ["$$member.userId", ctx.session.user.id] },
                        { $mergeObjects: ["$$member", { contribution: { $add: ["$$member.contribution", input.amount] } }] },
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
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        return serializeGroup(group, ctx.session.user.id);
      }),
    award: protectedProcedure
      .input(z.object({ id: mongoId, amounts: z.array(z.number().int().min(0)).min(1) }))
      .mutation(async ({ ctx, input }) => {
        let group = await GoalGroup.findOne({ _id: input.id, creatorId: ctx.session.user.id });
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        if (!group.targetHit) throw new TRPCError({ code: "BAD_REQUEST", message: "The group target is not complete" });
        let members = group.members as unknown as Array<{ userId?: string; contribution: number; award: number }>;
        if (input.amounts.length !== members.length || !awardSplitIsValid(input.amounts, group.rewardPool)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Awards must allocate the complete reward pool" });
        }
        if (!group.awarded) {
          group = await GoalGroup.findOneAndUpdate(
            {
              _id: input.id,
              creatorId: ctx.session.user.id,
              targetHit: true,
              awarded: false,
              members: { $size: input.amounts.length },
            },
            [
              {
                $set: {
                  awarded: true,
                  members: {
                    $map: {
                      input: { $range: [0, { $size: "$members" }] },
                      as: "memberIndex",
                      in: {
                        $mergeObjects: [
                          { $arrayElemAt: ["$members", "$$memberIndex"] },
                          { award: { $arrayElemAt: [input.amounts, "$$memberIndex"] } },
                        ],
                      },
                    },
                  },
                },
              },
            ],
            { returnDocument: "after", updatePipeline: true },
          ) ?? await GoalGroup.findOne({ _id: input.id, creatorId: ctx.session.user.id });
        }

        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        members = group.members as unknown as Array<{ userId?: string; contribution: number; award: number }>;
        const storedAmounts = members.map((member) => member.award);
        if (storedAmounts.some((amount, index) => amount !== input.amounts[index])) {
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
