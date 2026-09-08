import { Goal, Habit, MedaaConversation, MedaaUsage, type MedaaConversationRecord } from "@rdm-b2c/db";
import { env } from "@rdm-b2c/env/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  medaaDraftContentSchema,
  medaaPrepareSchema,
  medaaActionResponseSchema,
  medaaTimeZoneSchema,
  medaaAiActionSchema,
  medaaJourneyStages,
  medaaLongTermGoalSchema,
  medaaGoalSelectionLimit,
  isMedaaShortCommitment,
  MEDAA_JOURNEY_GENERATION_LIMIT,
  MEDAA_MAX_COMMITMENT_DAYS,
  MEDAA_PLAN_ITEM_LIMIT,
  type MedaaConversation as ConversationView,
  type MedaaDraft,
  type MedaaProvider,
  type MedaaReview,
  type MedaaJourney,
} from "../domain/medaa";
import { goalCreateInputSchema, habitCreateInputSchema } from "../domain/commitment-input";
import { dayKeyForTimeZone, goalCategories, goalDurationWindow, habitPledgeSchedule } from "../domain/rdm";
import { protectedProcedure, router } from "../index";
import { medaaProvider, MedaaProviderError } from "../services/medaa-provider";
import { rdmRouter } from "./rdm";

const conversationId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid conversation");
const MAX_MESSAGES = 100;
const MAX_DRAFTS = 30;
const LEASE_MS = 45_000;
const randomUUID = () => globalThis.crypto.randomUUID();
type StoredConversation = MedaaConversationRecord & { _id: unknown };
const revisionInput = z.object({ conversationId, expectedRevision: z.number().int().min(0) });

function newJourney(): MedaaJourney {
  return { horizonYears: null, longTermGoal: "", category: null, stage: "horizon",
    selectedGoalIds: [], goalSuggestionIds: [], habitSuggestionIds: [],
    goalSuggestionsReady: false, habitSuggestionsReady: false, generations: 0 };
}

function serializeConversation(stored: StoredConversation): ConversationView {
  const timedOut = Boolean(stored.pendingRequestId && stored.leaseExpiresAt
    && stored.leaseExpiresAt.getTime() <= Date.now());
  return {
    id: String(stored._id),
    title: stored.title,
    timeZone: stored.timeZone,
    messages: stored.messages.map((message) => ({
      id: message.id, role: message.role, text: message.text, createdAt: message.createdAt.toISOString(),
    })),
    drafts: stored.drafts.map((draft) => ({
      id: draft.id,
      origin: draft.origin ?? "ai",
      content: medaaDraftContentSchema.parse(draft.content),
      version: draft.version,
      status: draft.status,
      review: draft.review ? {
        id: draft.review.id,
        startDayKey: draft.review.startDayKey,
        endDayKey: draft.review.endDayKey,
        timeZone: draft.review.timeZone,
        pledgeAmount: draft.review.pledgeAmount,
        scheduledDays: draft.review.scheduledDays,
        totalPledge: draft.review.totalPledge,
      } : null,
      entityId: draft.entityId ?? null,
    })),
    pendingRequestId: timedOut ? null : stored.pendingRequestId ?? null,
    failedRequestId: timedOut ? stored.pendingRequestId ?? null : stored.failedRequestId ?? null,
    failureMessage: timedOut ? "The reply was interrupted. Retry your last AI request." : stored.failureMessage ?? null,
    journey: stored.journey ? { ...stored.journey,
      goalSuggestionsReady: stored.journey.goalSuggestionsReady ?? false,
      habitSuggestionsReady: stored.journey.habitSuggestionsReady ?? false,
      category: stored.journey.category ? z.enum(goalCategories).parse(stored.journey.category) : null } : null,
    lastRequest: stored.lastRequest ? { ...stored.lastRequest, action: medaaAiActionSchema.parse(stored.lastRequest.action) } : null,
    revision: stored.revision,
  };
}

async function ownedConversation(id: string, userId: string) {
  const stored = await MedaaConversation.findOne({ _id: id, userId }).lean();
  if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
  return stored;
}

async function viewConversation(id: string, userId: string) {
  let stored = await ownedConversation(id, userId);
  // If a process exited after the normal creation succeeded, repair only its link.
  // Reading chat history never funds a pending commitment or calls OpenAI.
  for (const draft of stored.drafts) {
    if (draft.status !== "setting" || !draft.review) continue;
    const entity = draft.content.type === "habit"
      ? await Habit.findOne({ userId, rdmPledgeCreationId: draft.review.id, rdmPledgeFundingStatus: "funded" }).select("_id").lean()
      : await Goal.findOne({ userId, creationId: draft.review.id, fundingStatus: "funded" }).select("_id").lean();
    if (!entity) continue;
    await MedaaConversation.updateOne(
      { _id: id, userId },
      { $set: { "drafts.$[draft].entityId": String(entity._id), "drafts.$[draft].status": "created" }, $inc: { revision: 1 } },
      { arrayFilters: [{ "draft.id": draft.id, "draft.status": "setting", "draft.review.id": draft.review.id }] },
    );
  }
  stored = await ownedConversation(id, userId);
  return serializeConversation(stored);
}

function requireIdle(stored: StoredConversation) {
  if (stored.pendingRequestId) {
    throw new TRPCError({ code: "CONFLICT", message: "Finish or retry the pending reply before changing this draft." });
  }
}

function requireJourney(stored: StoredConversation, ready = true) {
  const journey = serializeConversation(stored).journey;
  if (!journey) throw new TRPCError({ code: "BAD_REQUEST", message: "This is an older chat. Start a new guided journey to use AI help." });
  if (ready && (!journey.horizonYears || !journey.category || !medaaLongTermGoalSchema.safeParse(journey.longTermGoal).success)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose your horizon and confirm a long-term goal first." });
  }
  return journey;
}

function requireSelectedGoalsCreated(stored: StoredConversation, journey: MedaaJourney) {
  if (journey.selectedGoalIds.length === 0 || journey.selectedGoalIds.some((id) =>
    !stored.drafts.some((draft) => draft.id === id && draft.status === "created"))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Create your chosen short-term goals before continuing to supporting habits." });
  }
}

function requireSelectedDraft(stored: StoredConversation, draft: MedaaDraft) {
  if (!stored.journey) return; // Existing reviewed commitments remain usable.
  const journey = requireJourney(stored);
  if (draft.content.type === "goal" && !journey.selectedGoalIds.includes(draft.id)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose this short-term goal before reviewing it." });
  }
  if (draft.content.type === "habit") requireSelectedGoalsCreated(stored, journey);
}

async function saveJourney(stored: StoredConversation, userId: string, expectedRevision: number, journey: MedaaJourney) {
  requireIdle(stored);
  if (expectedRevision !== stored.revision) throw new TRPCError({ code: "CONFLICT", message: "Your journey changed. Reload it before continuing." });
  const updated = await MedaaConversation.findOneAndUpdate(
    { _id: stored._id, userId, revision: expectedRevision },
    { $set: { journey, title: journey.longTermGoal || "New journey" }, $inc: { revision: 1 } },
    { returnDocument: "after" },
  );
  if (!updated) throw new TRPCError({ code: "CONFLICT", message: "Your journey changed. Reload it before continuing." });
  return serializeConversation(updated.toObject());
}

async function reserveGeneration(userId: string) {
  const dayKey = new Date().toISOString().slice(0, 10);
  try {
    await MedaaUsage.updateOne({ userId, dayKey }, { $setOnInsert: {
      userId, dayKey, requests: 0, expiresAt: new Date(Date.now() + 7 * 86_400_000),
    } }, { upsert: true });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === 11000)) throw error;
  }
  const reserved = await MedaaUsage.findOneAndUpdate(
    { userId, dayKey, requests: { $lt: env.MEDAA_DAILY_REQUEST_LIMIT } },
    { $inc: { requests: 1 } },
  );
  if (!reserved) throw new TRPCError({
    code: "TOO_MANY_REQUESTS", message: "You have reached today's Medaa Ai request limit. Your drafts are saved; please return tomorrow.",
  });
}

function creationInput(draft: MedaaDraft, review: MedaaReview) {
  const content = draft.content;
  const durationDays = Math.round((Date.parse(`${review.endDayKey}T00:00:00Z`)
    - Date.parse(`${review.startDayKey}T00:00:00Z`)) / 86_400_000);
  if (content.type === "goal") {
    return { type: "goal" as const, input: goalCreateInputSchema.parse({
      creationId: review.id, title: content.title, category: content.category, target: content.target,
      startDayKey: review.startDayKey, durationDays, timeZone: review.timeZone, pledgeAmount: review.pledgeAmount,
    }) };
  }
  return { type: "habit" as const, input: habitCreateInputSchema.parse({
    creationId: review.id, title: content.title, category: content.category, target: content.target,
    pledge: content.pledge, cadence: "Custom weekly", rdmPledgeWeekdays: content.weekdays,
    rdmPledgePerDay: review.pledgeAmount, rdmPledgeStartDayKey: review.startDayKey,
    rdmPledgeEndDayKey: review.endDayKey, timeZone: review.timeZone, source: "custom", icon: "target",
  }) };
}

export function createMedaaRouter(provider: MedaaProvider = medaaProvider) {
  return router({
    status: protectedProcedure.query(() => ({ configured: provider.configured(), model: env.OPENAI_MODEL })),

    conversations: protectedProcedure.query(async ({ ctx }) => {
      const stored = await MedaaConversation.find({ userId: ctx.session.user.id })
        .sort({ updatedAt: -1 }).limit(50).select("title updatedAt").lean();
      return stored.map((item) => ({ id: String(item._id), title: item.title, updatedAt: item.updatedAt.toISOString() }));
    }),

    start: protectedProcedure.input(z.object({ creationId: z.string().uuid(), timeZone: medaaTimeZoneSchema }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.session.user.id;
        let stored = await MedaaConversation.findOne({ userId, creationId: input.creationId });
        if (!stored) {
          try {
            stored = await MedaaConversation.create({ userId, creationId: input.creationId, timeZone: input.timeZone, journey: newJourney(), title: "New journey" });
          } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === 11000)) throw error;
            stored = await MedaaConversation.findOne({ userId, creationId: input.creationId });
          }
        }
        if (!stored) throw new TRPCError({ code: "CONFLICT", message: "Could not start the conversation. Please retry." });
        return viewConversation(String(stored._id), userId);
      }),

    conversation: protectedProcedure.input(z.object({ id: conversationId }))
      .query(({ ctx, input }) => viewConversation(input.id, ctx.session.user.id)),

    setHorizon: protectedProcedure.input(revisionInput.extend({ horizonYears: z.union([z.literal(1), z.literal(2), z.literal(3)]) }))
      .mutation(async ({ ctx, input }) => {
        const stored = await ownedConversation(input.conversationId, ctx.session.user.id);
        const journey = requireJourney(stored, false);
        if (stored.drafts.length && journey.horizonYears !== input.horizonYears) {
          throw new TRPCError({ code: "CONFLICT", message: "Start a new journey to change the horizon once suggestions have been saved." });
        }
        return saveJourney(stored, ctx.session.user.id, input.expectedRevision, { ...journey,
          ...(journey.horizonYears !== input.horizonYears ? { goalSuggestionsReady: false, habitSuggestionsReady: false } : {}),
          horizonYears: input.horizonYears, stage: "long-term" });
      }),

    defineLongTerm: protectedProcedure.input(revisionInput.extend({ longTermGoal: medaaLongTermGoalSchema, category: z.enum(goalCategories) }))
      .mutation(async ({ ctx, input }) => {
        const stored = await ownedConversation(input.conversationId, ctx.session.user.id);
        const journey = requireJourney(stored, false);
        if (!journey.horizonYears) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a 1-, 2-, or 3-year horizon first." });
        if (stored.drafts.length && (journey.longTermGoal !== input.longTermGoal || journey.category !== input.category)) {
          throw new TRPCError({ code: "CONFLICT", message: "Start a new journey for a different ambition. Your current plan will remain saved." });
        }
        return saveJourney(stored, ctx.session.user.id, input.expectedRevision,
          { ...journey,
            ...(journey.longTermGoal !== input.longTermGoal || journey.category !== input.category
              ? { goalSuggestionsReady: false, habitSuggestionsReady: false } : {}),
            longTermGoal: input.longTermGoal, category: input.category, stage: "short-term" });
      }),

    navigate: protectedProcedure.input(revisionInput.extend({ stage: z.enum(medaaJourneyStages) }))
      .mutation(async ({ ctx, input }) => {
        const stored = await ownedConversation(input.conversationId, ctx.session.user.id);
        const journey = requireJourney(stored, !["horizon", "long-term"].includes(input.stage));
        if (input.stage === "long-term" && !journey.horizonYears) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a horizon first." });
        if (input.stage === "goals" && !journey.selectedGoalIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one short-term goal." });
        if (input.stage === "habits" || input.stage === "next") requireSelectedGoalsCreated(stored, journey);
        return saveJourney(stored, ctx.session.user.id, input.expectedRevision, { ...journey, stage: input.stage });
      }),

    chooseGoals: protectedProcedure.input(revisionInput.extend({ draftIds: z.array(z.string().uuid()).max(MEDAA_PLAN_ITEM_LIMIT)
      .refine((ids) => new Set(ids).size === ids.length, "Choose each goal once"), continueToGoals: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        const stored = await ownedConversation(input.conversationId, ctx.session.user.id);
        const journey = requireJourney(stored);
        const selectionLimit = medaaGoalSelectionLimit(journey.selectedGoalIds, stored.drafts);
        if (input.draftIds.length > selectionLimit) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose up to two goals first. Create them before adding a third goal to this plan." });
        }
        if (input.continueToGoals && input.draftIds.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one short-term goal." });
        const available = stored.drafts.filter((draft) => draft.content.type === "goal");
        if (input.draftIds.some((id) => !available.some((draft) => draft.id === id))
          || available.some((draft) => draft.status !== "draft" && !input.draftIds.includes(draft.id))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose your saved goals. Submitted goals cannot be deselected." });
        }
        return saveJourney(stored, ctx.session.user.id, input.expectedRevision,
          { ...journey, selectedGoalIds: input.draftIds, stage: input.continueToGoals ? "goals" : "short-term" });
      }),

    addManual: protectedProcedure.input(z.object({ conversationId, requestId: z.string().uuid(), content: medaaDraftContentSchema }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.session.user.id;
        const stored = await ownedConversation(input.conversationId, userId);
        const journey = requireJourney(stored);
        const existing = stored.drafts.find((draft) => draft.id === input.requestId);
        if (existing) return viewConversation(input.conversationId, userId);
        requireIdle(stored);
        if (stored.drafts.length >= MAX_DRAFTS) throw new TRPCError({ code: "BAD_REQUEST", message: "This journey has enough drafts. Start another journey for a new plan." });
        if (input.content.type === "habit") requireSelectedGoalsCreated(stored, journey);
        const updated = { ...journey };
        if (input.content.type === "goal") {
          const initialGoalsCreated = journey.selectedGoalIds.length > 0 && journey.selectedGoalIds.every((id) =>
            stored.drafts.some((draft) => draft.id === id && draft.status === "created"));
          const limit = ["plan", "next"].includes(journey.stage) && initialGoalsCreated ? MEDAA_PLAN_ITEM_LIMIT : 2;
          if (journey.selectedGoalIds.length >= limit) throw new TRPCError({ code: "BAD_REQUEST", message: `You can choose up to ${limit} goals at this step.` });
          updated.selectedGoalIds = [...journey.selectedGoalIds, input.requestId];
          updated.goalSuggestionIds = [...journey.goalSuggestionIds, input.requestId];
        } else {
          if (stored.drafts.filter((draft) => draft.content.type === "habit" && draft.status !== "draft").length >= MEDAA_PLAN_ITEM_LIMIT) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "This plan already has three submitted habits." });
          }
          updated.habitSuggestionIds = [...journey.habitSuggestionIds, input.requestId];
        }
        const saved = await MedaaConversation.findOneAndUpdate(
          { _id: stored._id, userId, revision: stored.revision },
          { $set: { journey: updated }, $inc: { revision: 1 }, $push: { drafts: {
            id: input.requestId, origin: "manual", content: input.content, version: 0, status: "draft", review: null, entityId: null,
          } } }, { returnDocument: "after" },
        );
        if (!saved) throw new TRPCError({ code: "CONFLICT", message: "The journey changed. Reload and retry your draft." });
        return serializeConversation(saved.toObject());
      }),

    dismissGeneration: protectedProcedure.input(z.object({ conversationId })).mutation(async ({ ctx, input }) => {
      const stored = await ownedConversation(input.conversationId, ctx.session.user.id);
      if (stored.pendingRequestId && (stored.leaseExpiresAt?.getTime() ?? 0) > Date.now()) {
        throw new TRPCError({ code: "CONFLICT", message: "The request is still running. Please wait for it to finish." });
      }
      const saved = await MedaaConversation.findOneAndUpdate(
        { _id: stored._id, userId: ctx.session.user.id, revision: stored.revision },
        { $set: { pendingRequestId: null, leaseToken: null, leaseExpiresAt: null, failedRequestId: null, failureMessage: null },
          $inc: { revision: 1 } }, { returnDocument: "after" },
      );
      if (!saved) throw new TRPCError({ code: "CONFLICT", message: "The journey changed. Please reload." });
      return serializeConversation(saved.toObject());
    }),

    // No public free-text send endpoint: a button selects a finite, server-owned task.
    generate: protectedProcedure.input(z.object({
      conversationId, requestId: z.string().uuid(), action: medaaAiActionSchema, regenerate: z.boolean().default(false),
    }).strict()).mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await viewConversation(input.conversationId, userId);
      const stored = await ownedConversation(input.conversationId, userId);
      const journey = requireJourney(stored);
      const signature = JSON.stringify({ action: input.action, regenerate: input.regenerate });
      const previous = stored.messages.find((message) => message.id === input.requestId);
      if (previous && previous.text !== signature) {
        throw new TRPCError({ code: "CONFLICT", message: "Retry the original AI action with its saved request identifier." });
      }
      if (stored.messages.some((message) => message.id === `assistant:${input.requestId}`)) {
        return viewConversation(input.conversationId, userId);
      }
      if (stored.drafts.some((draft) => draft.status === "setting")) throw new TRPCError({ code: "CONFLICT", message: "Resolve your submitted commitment before requesting more AI help." });
      if (input.action.kind === "suggest-habits") requireSelectedGoalsCreated(stored, journey);
      if (input.action.kind === "refine") {
        const draftId = input.action.draftId;
        if (!stored.drafts.some((draft) => draft.id === draftId && draft.status === "draft")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only an unsubmitted draft in this journey can be refined." });
        }
      }
      const batchIds = input.action.kind === "suggest-goals" ? journey.goalSuggestionIds
        : input.action.kind === "suggest-habits" ? journey.habitSuggestionIds : [];
      const hasSavedSuggestions = input.action.kind === "suggest-goals" ? journey.goalSuggestionsReady
        : input.action.kind === "suggest-habits" ? journey.habitSuggestionsReady : false;
      if (!previous && !input.regenerate && hasSavedSuggestions) return viewConversation(input.conversationId, userId);
      if (!provider.configured()) throw new TRPCError({
        code: "PRECONDITION_FAILED", message: "Medaa Ai is not connected yet. Your saved drafts remain available; use the Habits or Goals tab to create your own.",
      });
      if (journey.generations >= MEDAA_JOURNEY_GENERATION_LIMIT) throw new TRPCError({
        code: "TOO_MANY_REQUESTS", message: "This journey has used its 12 AI requests. Your saved suggestions remain available to review and edit.",
      });
      if (stored.messages.length + (previous ? 1 : 2) > MAX_MESSAGES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This journey is full. Start a new journey; your existing plan stays saved." });
      }
      if (stored.failedRequestId && stored.failedRequestId !== input.requestId) {
        throw new TRPCError({ code: "CONFLICT", message: "Retry or dismiss the previous AI request before continuing." });
      }
      if (stored.pendingRequestId && (stored.pendingRequestId !== input.requestId
        || (stored.leaseExpiresAt?.getTime() ?? 0) > Date.now())) {
        throw new TRPCError({ code: "CONFLICT", message: "Medaa Ai is still preparing your previous reply." });
      }
      const leaseToken = randomUUID();
      const userMessage = { id: input.requestId, role: "user" as const, text: signature, createdAt: new Date() };
      const claimed = await MedaaConversation.findOneAndUpdate(
        { _id: stored._id, userId, revision: stored.revision },
        { $set: {
          pendingRequestId: input.requestId, leaseToken, leaseExpiresAt: new Date(Date.now() + LEASE_MS),
          failedRequestId: null, failureMessage: null,
          lastRequest: { requestId: input.requestId, action: input.action, regenerate: input.regenerate },
        }, $inc: { revision: 1 }, ...(previous ? {} : { $push: { messages: userMessage } }) },
        { returnDocument: "after" },
      );
      if (!claimed) throw new TRPCError({ code: "CONFLICT", message: "The conversation changed. Reload it and retry." });
      try {
        await reserveGeneration(userId);
        const admitted = await MedaaConversation.findOneAndUpdate(
          { _id: stored._id, userId, leaseToken, "journey.generations": { $lt: MEDAA_JOURNEY_GENERATION_LIMIT } },
          { $inc: { revision: 1, "journey.generations": 1 } }, { returnDocument: "after" },
        );
        if (!admitted) throw new TRPCError({ code: "CONFLICT", message: "The request was interrupted before generation. Reload your journey." });
        const snapshot = serializeConversation(admitted.toObject());
        const relevantDrafts = snapshot.drafts.filter((draft) => draft.status === "created"
          || journey.selectedGoalIds.includes(draft.id)
          || (input.action.kind === "suggest-goals" && journey.goalSuggestionIds.includes(draft.id))
          || (input.action.kind === "suggest-habits" && journey.habitSuggestionIds.includes(draft.id))
          || (input.action.kind === "refine" && input.action.draftId === draft.id));
        const generated = medaaActionResponseSchema(input.action, relevantDrafts).parse(await provider.generate({
          messages: [],
          drafts: relevantDrafts,
          todayDayKey: dayKeyForTimeZone(new Date(), stored.timeZone),
          timeZone: stored.timeZone,
          journey: { horizonYears: journey.horizonYears!, longTermGoal: journey.longTermGoal, category: journey.category! },
          action: input.action,
        }));
        const current = await ownedConversation(input.conversationId, userId);
        if (current.leaseToken !== leaseToken) throw new TRPCError({ code: "CONFLICT", message: "A newer retry is preparing this reply." });
        let drafts = serializeConversation(current).drafts;
        const currentJourney = requireJourney(current);
        const expectedType = input.action.kind === "suggest-goals" ? "goal" : input.action.kind === "suggest-habits" ? "habit"
          : drafts.find((draft) => input.action.kind === "refine" && draft.id === input.action.draftId)?.content.type;
        // Only discard superseded, untouched suggestions; never discard reviewed or submitted work.
        if (generated.suggestions.length && input.action.kind !== "refine") {
          drafts = drafts.filter((draft) => !batchIds.includes(draft.id) || draft.origin === "manual" || draft.version > 0 || draft.status !== "draft"
            || draft.review || currentJourney.selectedGoalIds.includes(draft.id));
        }
        const resultIds: string[] = [];
        for (const suggestion of generated.suggestions) {
          const existing = suggestion.replaceDraftId
            ? drafts.find((draft) => draft.id === suggestion.replaceDraftId)
            : drafts.find((draft) => draft.content.type === suggestion.content.type
              && isMedaaShortCommitment(draft.content)
              && draft.content.title.toLocaleLowerCase() === suggestion.content.title.toLocaleLowerCase());
          if (suggestion.replaceDraftId && (!existing || existing.status !== "draft")) {
            throw new TRPCError({ code: "BAD_GATEWAY", message: "Medaa Ai could not safely update that draft. Please retry." });
          }
          if (existing) {
            if (input.action.kind === "refine") {
              existing.content = suggestion.content;
              existing.version += 1;
              existing.review = null;
            }
            resultIds.push(existing.id);
          } else {
            const id = randomUUID();
            drafts.push({ id, origin: "ai", content: suggestion.content, version: 0, status: "draft", review: null, entityId: null });
            resultIds.push(id);
          }
        }
        if (drafts.length > MAX_DRAFTS) throw new TRPCError({ code: "BAD_REQUEST", message: "This journey has enough drafts. Start a new journey for more suggestions." });
        const updatedJourney = { ...currentJourney };
        if (input.action.kind === "suggest-goals") updatedJourney.goalSuggestionsReady = true;
        if (input.action.kind === "suggest-habits") updatedJourney.habitSuggestionsReady = true;
        if (resultIds.length && input.action.kind !== "refine") {
          const retained = drafts.filter((draft) => draft.content.type === expectedType
            && (draft.origin === "manual" || draft.version > 0 || draft.status !== "draft" || draft.review || currentJourney.selectedGoalIds.includes(draft.id))).map((draft) => draft.id);
          if (input.action.kind === "suggest-goals") {
            updatedJourney.goalSuggestionIds = [...new Set([...retained, ...resultIds])];
            updatedJourney.goalSuggestionsReady = true;
          } else {
            updatedJourney.habitSuggestionIds = [...new Set([...retained, ...resultIds])];
            updatedJourney.habitSuggestionsReady = true;
          }
        }
        const completed = await MedaaConversation.findOneAndUpdate(
          { _id: current._id, userId, leaseToken, revision: current.revision },
          { $set: { drafts, journey: updatedJourney, pendingRequestId: null, leaseToken: null, leaseExpiresAt: null },
            $inc: { revision: 1 }, $push: { messages: {
              id: `assistant:${input.requestId}`, role: "assistant", text: generated.message, createdAt: new Date(),
            } } },
          { returnDocument: "after" },
        );
        if (!completed) throw new TRPCError({ code: "CONFLICT", message: "The reply was interrupted. Please retry." });
        return viewConversation(input.conversationId, userId);
      } catch (error) {
        const message = error instanceof TRPCError || error instanceof MedaaProviderError ? error.message
          : "Medaa Ai could not finish the reply. Your request is saved; please retry.";
        await MedaaConversation.updateOne(
          { _id: stored._id, userId, leaseToken },
          { $set: { pendingRequestId: null, leaseToken: null, leaseExpiresAt: null,
            failedRequestId: input.requestId, failureMessage: message }, $inc: { revision: 1 } },
        );
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_GATEWAY", message });
      }
    }),

    prepare: protectedProcedure.input(medaaPrepareSchema).mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const stored = await ownedConversation(input.conversationId, userId);
      requireIdle(stored);
      const draft = serializeConversation(stored).drafts.find((item) => item.id === input.draftId);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      requireSelectedDraft(stored, draft);
      if (draft.status !== "draft" || draft.version !== input.expectedVersion) {
        throw new TRPCError({ code: "CONFLICT", message: "This draft changed or was already submitted. Reload before editing." });
      }
      if (input.content.type !== draft.content.type) throw new TRPCError({ code: "BAD_REQUEST", message: "A goal cannot become a habit or vice versa. Add a separate draft instead." });
      const days = Math.round((Date.parse(`${input.endDayKey}T00:00:00Z`) - Date.parse(`${input.startDayKey}T00:00:00Z`)) / 86_400_000);
      const window = goalDurationWindow(input.startDayKey, days);
      if (days > MEDAA_MAX_COMMITMENT_DAYS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Keep Medaa commitments within ${MEDAA_MAX_COMMITMENT_DAYS} calendar days. Shorten the target and review the dates again.` });
      }
      if (!window || window.endDayKey !== input.endDayKey
        || input.startDayKey < dayKeyForTimeZone(new Date(), input.timeZone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose valid future dates. The end date is the exclusive finish boundary." });
      }
      const schedule = draft.content.type === "habit" ? habitPledgeSchedule({
        startDayKey: input.startDayKey, endDayKey: input.endDayKey, dailyPledge: input.pledgeAmount, weekdays: input.content.weekdays,
      }) : null;
      if (draft.content.type === "habit" && !schedule) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one scheduled habit day within the commitment dates." });
      }
      const review: MedaaReview = {
        id: randomUUID(), startDayKey: input.startDayKey, endDayKey: input.endDayKey, timeZone: input.timeZone,
        pledgeAmount: input.pledgeAmount, scheduledDays: schedule?.dayCount ?? days,
        totalPledge: schedule?.totalPledge ?? input.pledgeAmount,
      };
      if (review.totalPledge > 100_000) throw new TRPCError({ code: "BAD_REQUEST", message: "The total pledge cannot exceed 100,000 RDM." });
      const updatedDraft: MedaaDraft = { ...draft, content: { ...input.content, durationDays: days }, version: draft.version + 1, review };
      try { creationInput(updatedDraft, review); } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Complete the target, category, and habit commitment statement before reviewing." });
      }
      const wallet = await rdmRouter.createCaller(ctx).wallet.summary();
      const saved = await MedaaConversation.findOneAndUpdate(
        { _id: stored._id, userId, revision: stored.revision },
        { $set: { "drafts.$[draft]": updatedDraft }, $inc: { revision: 1 } },
        { arrayFilters: [{ "draft.id": draft.id, "draft.version": draft.version, "draft.status": "draft" }], returnDocument: "after" },
      );
      if (!saved) throw new TRPCError({ code: "CONFLICT", message: "The draft changed. Reload it and review again." });
      return { conversation: serializeConversation(saved.toObject()), review,
        availableBase: wallet.wallet.base, canAfford: wallet.wallet.base >= review.totalPledge };
    }),

    set: protectedProcedure.input(z.object({ conversationId, draftId: z.string().uuid(), reviewId: z.string().uuid(), confirmElapsedDates: z.boolean().default(false) }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.session.user.id;
        const current = await viewConversation(input.conversationId, userId);
        const stored = await ownedConversation(input.conversationId, userId);
        let draft = serializeConversation(stored).drafts.find((item) => item.id === input.draftId);
        if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
        if (!draft.review || draft.review.id !== input.reviewId) {
          throw new TRPCError({ code: "CONFLICT", message: "Review the latest draft before setting it." });
        }
        if (draft.status === "created") return current;
        if (draft.status === "setting" && draft.review.startDayKey < dayKeyForTimeZone(new Date(), draft.review.timeZone)
          && !input.confirmElapsedDates) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The original start date has passed. Confirm the original schedule and any missed-day settlement before retrying Set." });
        }
        requireIdle(stored);
        requireSelectedDraft(stored, draft);
        const normal = rdmRouter.createCaller(ctx);
        if (draft.status === "draft") {
          const reviewedDays = Math.round((Date.parse(`${draft.review.endDayKey}T00:00:00Z`)
            - Date.parse(`${draft.review.startDayKey}T00:00:00Z`)) / 86_400_000);
          if (reviewedDays > MEDAA_MAX_COMMITMENT_DAYS) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `This saved review exceeds ${MEDAA_MAX_COMMITMENT_DAYS} calendar days. Shorten the target and dates, then review again before Set.` });
          }
          if (stored.journey && stored.drafts.filter((item) => item.content.type === draft!.content.type
            && item.status !== "draft").length >= MEDAA_PLAN_ITEM_LIMIT) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Each journey supports at most three ${draft.content.type === "habit" ? "habits" : "goals"}. Your draft is saved.` });
          }
          if (draft.review.startDayKey < dayKeyForTimeZone(new Date(), draft.review.timeZone)) {
            throw new TRPCError({
              code: "BAD_REQUEST", message: "The reviewed start date has passed. Edit the dates and review again before setting this commitment.",
            });
          }
          const wallet = await normal.wallet.summary();
          if (wallet.wallet.base < draft.review.totalPledge) throw new TRPCError({
            code: "BAD_REQUEST", message: `You need ${draft.review.totalPledge} RDM in your Base Purse. Your draft is saved.`,
          });
          // Freeze the reviewed payload before its first funding attempt. Retries use
          // the same creation UUID even after a timeout, process exit, or reload.
          const frozen = await MedaaConversation.findOneAndUpdate(
            { _id: stored._id, userId, revision: stored.revision, drafts: { $elemMatch: {
              id: draft.id, version: draft.version, status: "draft", "review.id": input.reviewId,
            } } },
            { $set: { "drafts.$[draft].status": "setting" }, $inc: { revision: 1, "drafts.$[draft].version": 1 } },
            { arrayFilters: [{ "draft.id": draft.id, "draft.version": draft.version, "draft.status": "draft", "draft.review.id": input.reviewId }], returnDocument: "after" },
          );
          if (!frozen) throw new TRPCError({ code: "CONFLICT", message: "This draft is being updated. Reload and retry Set." });
          draft = serializeConversation(frozen.toObject()).drafts.find((item) => item.id === input.draftId)!;
        }
        const commitment = creationInput(draft, draft.review!);
        const entity = commitment.type === "habit"
          ? await normal.habits.create(commitment.input)
          : await normal.goals.create(commitment.input);
        await MedaaConversation.updateOne(
          { _id: input.conversationId, userId },
          { $set: { "drafts.$[draft].status": "created", "drafts.$[draft].entityId": entity.id }, $inc: { revision: 1 } },
          { arrayFilters: [{ "draft.id": draft.id, "draft.review.id": input.reviewId, "draft.status": "setting" }] },
        );
        return viewConversation(input.conversationId, userId);
      }),
  });
}

export const medaaRouter = createMedaaRouter();
