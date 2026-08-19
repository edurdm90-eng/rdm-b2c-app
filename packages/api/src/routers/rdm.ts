import { GameSession, GoalGroup, Habit, RdmProfile, Referral, habitOutcomes, habitSources, habitStages } from "@rdm-b2c/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  awardSplitIsValid,
  badgeCatalog,
  gameDayKey,
  gameCatalog,
  gameSessionCanReward,
  groupAwardCredits,
  habitCategories,
  habitTemplates,
  initialBadgeIds,
  inviteWeekKey,
  levelForXp,
  rewardCatalog,
  rewardForGame,
} from "../domain/rdm";

const nowIso = () => new Date().toISOString();
const mongoId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const createInviteCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

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
    completedDays: Array.from(habit.completedDays ?? [], Number),
    active: Boolean(habit.active),
  };
}

function serializeProfile(profile: any) {
  return {
    xp: Number(profile.xp),
    level: Number(profile.level),
    streak: Number(profile.streak),
    plantStage: String(profile.plantStage),
    weeklyInvites: Number(profile.weeklyInvites ?? 0),
    referralCode: String(profile.referralCode ?? ""),
    wallet: {
      balance: Number(profile.walletBalance),
      reward: Number(profile.rewardBalance),
      remorse: Number(profile.remorseBalance),
      peer: Number(profile.peerBalance),
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
  kind: "habit" | "game" | "peer";
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
    const appliedPenalty = Math.min(Math.max(0, current.walletBalance), penalty);
    const profile = await RdmProfile.findOneAndUpdate(
      {
        userId,
        walletBalance: current.walletBalance,
        creditedOperations: { $ne: operationId },
      },
      {
        $inc: { walletBalance: -appliedPenalty, remorseBalance: appliedPenalty },
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
    const { profile, habits, groups } = await ensureSeedData(
      ctx.session.user.id,
      ctx.session.user.name,
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
      .input(z.object({ id: mongoId, reflection: z.string().trim().min(4).max(500) }))
      .mutation(async ({ ctx, input }) => {
        const reward = 25;
        const day = new Date().getDay() || 7;
        let habit = await Habit.findOneAndUpdate(
          { _id: input.id, userId: ctx.session.user.id, stage: "reflect" },
          {
            $set: { reflection: input.reflection, stage: "reward", lastOutcome: "completed" },
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
      .input(z.object({ id: mongoId }))
      .mutation(async ({ ctx, input }) => {
        const current = await Habit.findOne({ _id: input.id, userId: ctx.session.user.id, stage: "reward" });
        if (!current) throw new TRPCError({ code: "CONFLICT", message: "Claim the current cycle before starting another" });
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
        const profile = await getProfile(ctx.session.user.id);
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
