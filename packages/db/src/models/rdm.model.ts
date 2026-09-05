import mongoose from "mongoose";

import { goodDeedIds } from "../good-deeds";

const { Schema, model, models } = mongoose;

export const transactionKinds = ["habit", "game", "gratitude", "deed", "remorse", "peer", "charity", "redeem", "stake"] as const;
export const habitSources = ["template", "custom"] as const;
export const habitStages = ["pledge", "act", "reflect", "reward"] as const;
export const habitOutcomes = ["completed", "missed"] as const;
export const gratitudeCategoryIds = ["life", "helper", "loved-ones", "friends", "colleagues"] as const;
export const treeCareKinds = ["fertilizer", "water", "sunlight"] as const;

const transactionSchema = new Schema(
  {
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    operationId: { type: String },
    kind: {
      type: String,
      enum: transactionKinds,
      required: true,
    },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true },
);

const profileSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    xp: { type: Number, required: true, default: 640 },
    level: { type: Number, required: true, default: 7 },
    streak: { type: Number, required: true, default: 18 },
    plantStage: { type: String, required: true, default: "Budding" },
    treePledgeAmount: { type: Number, required: true, default: 0 },
    treePledgedAt: { type: Date },
    treeTimeZone: { type: String, required: true, default: "Asia/Kolkata" },
    treeWaterCount: { type: Number, required: true, default: 0 },
    treeLastWateredAt: { type: Date },
    treeSunlightCount: { type: Number, required: true, default: 0 },
    treeLastSunlightAt: { type: Date },
    treeCareOperations: { type: [String], required: true, default: [] },
    treeLastMissedDayKey: { type: String },
    treeLastMissedPenalty: { type: Number, required: true, default: 0 },
    treeMissedRewardBefore: { type: Number },
    treeMissedRewardAfter: { type: Number },
    treeMissedRemorseBefore: { type: Number },
    treeMissedRemorseAfter: { type: Number },
    treeMissedProcessedAt: { type: Date },
    treeMissedAcknowledgedAt: { type: Date },
    treeLastEvaluatedDayKey: { type: String },
    walletBalance: { type: Number, required: true, default: 1240 },
    rewardBalance: { type: Number, required: true, default: 320 },
    remorseBalance: { type: Number, required: true, default: 40 },
    peerBalance: { type: Number, required: true, default: 15 },
    weeklyInvites: { type: Number, required: true, default: 0 },
    inviteWeek: { type: String, required: true, default: "" },
    referralCode: { type: String, unique: true, sparse: true },
    creditedReferrals: { type: [String], required: true, default: [] },
    creditedOperations: { type: [String], required: true, default: [] },
    unlockedRewards: { type: [String], required: true, default: [] },
    unlockedBadges: {
      type: [String],
      required: true,
      default: [],
    },
    transactions: {
      type: [transactionSchema],
      required: true,
      default: () => [
        { title: "Deep Work Focus — reflection", amount: 25, kind: "habit", createdAt: new Date() },
        { title: "Word Sprint game", amount: 8, kind: "game", createdAt: new Date(Date.now() - 3.6e6) },
        { title: "Missed pledge — Hydration", amount: -10, kind: "remorse", createdAt: new Date(Date.now() - 8.64e7) },
        { title: "Awarded by Family group", amount: 15, kind: "peer", createdAt: new Date(Date.now() - 1.728e8) },
        { title: "Gift to Plant a Tree Trust", amount: -20, kind: "charity", createdAt: new Date(Date.now() - 3.456e8) },
      ],
    },
  },
  { timestamps: true },
);

const habitSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    icon: { type: String, required: true, default: "target" },
    cadence: { type: String, required: true },
    target: { type: String, required: true },
    pledge: { type: String, required: true },
    rdmPledgeCreationId: { type: String },
    rdmPledgePerDay: { type: Number, min: 1 },
    rdmPledgeTotal: { type: Number, min: 1 },
    rdmPledgeRemaining: { type: Number, min: 0 },
    rdmPledgeStartDayKey: { type: String },
    rdmPledgeEndDayKey: { type: String },
    rdmPledgeTimeZone: { type: String },
    rdmPledgeFundingStatus: { type: String, enum: ["pending", "funded"] },
    rdmPledgeSettledDayKeys: { type: [String], required: true, default: [] },
    rdmPledgeCompletedDayKeys: { type: [String], required: true, default: [] },
    currentDayKey: { type: String },
    lastSettledDayKey: { type: String },
    source: { type: String, enum: habitSources, required: true },
    stage: { type: String, enum: habitStages, required: true, default: "act" },
    cycle: { type: Number, required: true, default: 1 },
    streak: { type: Number, required: true, default: 0 },
    lastAction: { type: String },
    reflection: { type: String },
    lastOutcome: { type: String, enum: habitOutcomes },
    lastCompletedDayKey: { type: String },
    completedDays: { type: [Number], required: true, default: [] },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

habitSchema.index(
  { userId: 1, rdmPledgeCreationId: 1 },
  {
    unique: true,
    partialFilterExpression: { rdmPledgeCreationId: { $type: "string" } },
  },
);

const goalSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    creationId: { type: String, required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    target: { type: String, required: true },
    durationDays: { type: Number, required: true, min: 1 },
    startDayKey: { type: String, required: true },
    endDayKey: { type: String, required: true },
    timeZone: { type: String, required: true },
    pledgeAmount: { type: Number, required: true, min: 1 },
    fundingStatus: { type: String, enum: ["pending", "funded"], required: true },
    progress: { type: Number, required: true, min: 0, max: 100, default: 0 },
    active: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

goalSchema.index({ userId: 1, creationId: 1 }, { unique: true });
goalSchema.index({ userId: 1, active: 1, createdAt: -1 });

const gratitudeEntrySchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    category: { type: String, enum: gratitudeCategoryIds, required: true },
    categoryTitle: { type: String, required: true },
    prompt: { type: String, required: true },
    body: { type: String, required: true, maxlength: 1000 },
    dayKey: { type: String, required: true },
    reward: { type: Number, required: true, default: 15 },
    growthPoints: { type: Number, required: true, default: 1 },
    processedAt: { type: Date },
  },
  { timestamps: true },
);

gratitudeEntrySchema.index({ userId: 1, category: 1, dayKey: 1 }, { unique: true });
gratitudeEntrySchema.index({ userId: 1, createdAt: -1 });

const goodDeedEntrySchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    deedId: { type: String, enum: goodDeedIds, required: true },
    deedTitle: { type: String, required: true },
    dayKey: { type: String, required: true },
    reward: { type: Number, required: true },
    processedAt: { type: Date },
  },
  { timestamps: true },
);

goodDeedEntrySchema.index({ userId: 1, deedId: 1, dayKey: 1 }, { unique: true });
goodDeedEntrySchema.index({ userId: 1, createdAt: -1 });

const treeCareActivitySchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    kind: { type: String, enum: treeCareKinds, required: true },
    operationId: { type: String, required: true },
    dayKey: { type: String, required: true },
    timeZone: { type: String, required: true },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

treeCareActivitySchema.index({ userId: 1, operationId: 1 }, { unique: true });
treeCareActivitySchema.index({ userId: 1, dayKey: 1, kind: 1 });

const memberSchema = new Schema(
  {
    userId: { type: String },
    name: { type: String, required: true },
    initials: { type: String, required: true },
    contribution: { type: Number, required: true, default: 0 },
    award: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const groupSchema = new Schema(
  {
    creatorId: { type: String, required: true, index: true },
    inviteCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    target: { type: Number, required: true },
    current: { type: Number, required: true },
    unit: { type: String, required: true },
    rewardPool: { type: Number, required: true, default: 300 },
    targetHit: { type: Boolean, required: true, default: false },
    awarded: { type: Boolean, required: true, default: false },
    members: { type: [memberSchema], required: true },
  },
  { timestamps: true },
);

const gameSessionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    gameId: { type: String, required: true },
    dayKey: { type: String, required: true },
    status: { type: String, enum: ["running", "complete"], required: true, default: "running" },
    startedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date },
    score: { type: Number, required: true, default: 0 },
    actionCount: { type: Number, required: true, default: 0 },
    lastActionAt: { type: Date },
    reward: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

gameSessionSchema.index({ userId: 1, gameId: 1, dayKey: 1 }, { unique: true });

const referralSchema = new Schema(
  {
    inviteeId: { type: String, required: true, unique: true, index: true },
    inviterId: { type: String, required: true, index: true },
    inviteCode: { type: String, required: true },
  },
  { timestamps: true },
);

type RdmProfileShape = mongoose.InferSchemaType<typeof profileSchema>;
type HabitShape = mongoose.InferSchemaType<typeof habitSchema>;
type GoalShape = mongoose.InferSchemaType<typeof goalSchema>;
type GratitudeEntryShape = mongoose.InferSchemaType<typeof gratitudeEntrySchema>;
type GoodDeedEntryShape = mongoose.InferSchemaType<typeof goodDeedEntrySchema>;
type TreeCareActivityShape = mongoose.InferSchemaType<typeof treeCareActivitySchema>;
type GoalGroupShape = mongoose.InferSchemaType<typeof groupSchema>;
type GameSessionShape = mongoose.InferSchemaType<typeof gameSessionSchema>;
type ReferralShape = mongoose.InferSchemaType<typeof referralSchema>;

const RdmProfile =
  (models.RdmProfile as mongoose.Model<RdmProfileShape> | undefined) ??
  model<RdmProfileShape>("RdmProfile", profileSchema);
const Habit =
  (models.Habit as mongoose.Model<HabitShape> | undefined) ??
  model<HabitShape>("Habit", habitSchema);
const Goal =
  (models.Goal as mongoose.Model<GoalShape> | undefined) ??
  model<GoalShape>("Goal", goalSchema);
const GratitudeEntry =
  (models.GratitudeEntry as mongoose.Model<GratitudeEntryShape> | undefined) ??
  model<GratitudeEntryShape>("GratitudeEntry", gratitudeEntrySchema);
const GoodDeedEntry =
  (models.GoodDeedEntry as mongoose.Model<GoodDeedEntryShape> | undefined) ??
  model<GoodDeedEntryShape>("GoodDeedEntry", goodDeedEntrySchema);
const TreeCareActivity =
  (models.TreeCareActivity as mongoose.Model<TreeCareActivityShape> | undefined) ??
  model<TreeCareActivityShape>("TreeCareActivity", treeCareActivitySchema);
const GoalGroup =
  (models.GoalGroup as mongoose.Model<GoalGroupShape> | undefined) ??
  model<GoalGroupShape>("GoalGroup", groupSchema);
const GameSession =
  (models.GameSession as mongoose.Model<GameSessionShape> | undefined) ??
  model<GameSessionShape>("GameSession", gameSessionSchema);
const Referral =
  (models.Referral as mongoose.Model<ReferralShape> | undefined) ??
  model<ReferralShape>("Referral", referralSchema);

export { GameSession, Goal, GoalGroup, GoodDeedEntry, GratitudeEntry, Habit, RdmProfile, Referral, TreeCareActivity };
