import { Goal, Habit, MedaaConversation, MedaaUsage, type MedaaConversationRecord } from "@rdm-b2c/db";
import { env } from "@rdm-b2c/env/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  medaaDraftContentSchema,
  medaaPrepareSchema,
  medaaResponseSchema,
  medaaTimeZoneSchema,
  type MedaaConversation as ConversationView,
  type MedaaDraft,
  type MedaaProvider,
  type MedaaReview,
} from "../domain/medaa";
import { goalCreateInputSchema, habitCreateInputSchema } from "../domain/commitment-input";
import { dayKeyForTimeZone, goalDurationWindow, habitPledgeSchedule } from "../domain/rdm";
import { protectedProcedure, router } from "../index";
import { medaaProvider, MedaaProviderError } from "../services/medaa-provider";
import { rdmRouter } from "./rdm";

const conversationId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid conversation");
const MAX_MESSAGES = 100;
const MAX_DRAFTS = 30;
const LEASE_MS = 45_000;
const randomUUID = () => globalThis.crypto.randomUUID();
type StoredConversation = MedaaConversationRecord & { _id: unknown };

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
    failureMessage: timedOut ? "The reply was interrupted. Retry your last message." : stored.failureMessage ?? null,
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
    code: "TOO_MANY_REQUESTS", message: "You have reached today's Medaa Ai message limit. Your drafts are saved; please return tomorrow.",
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
            stored = await MedaaConversation.create({ userId, creationId: input.creationId, timeZone: input.timeZone });
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

    send: protectedProcedure.input(z.object({
      conversationId, requestId: z.string().uuid(), message: z.string().trim().min(1).max(2_000),
    })).mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const stored = await ownedConversation(input.conversationId, userId);
      const previous = stored.messages.find((message) => message.id === input.requestId);
      if (previous && previous.text !== input.message) {
        throw new TRPCError({ code: "CONFLICT", message: "This message was already sent with different text. Retry the original message." });
      }
      if (stored.messages.some((message) => message.id === `assistant:${input.requestId}`)) {
        return viewConversation(input.conversationId, userId);
      }
      if (!provider.configured()) throw new TRPCError({
        code: "PRECONDITION_FAILED", message: "Medaa Ai is not connected yet. Your saved conversations and drafts are still available.",
      });
      if (/sk-[A-Za-z0-9_-]{20,}/u.test(input.message)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please do not share API keys in chat." });
      }
      if (stored.messages.length + (previous ? 1 : 2) > MAX_MESSAGES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This conversation is full. Start a new chat; your existing plan stays saved." });
      }
      if (stored.failedRequestId && stored.failedRequestId !== input.requestId) {
        throw new TRPCError({ code: "CONFLICT", message: "Retry the previous message or start a new conversation." });
      }
      if (stored.pendingRequestId && (stored.pendingRequestId !== input.requestId
        || (stored.leaseExpiresAt?.getTime() ?? 0) > Date.now())) {
        throw new TRPCError({ code: "CONFLICT", message: "Medaa Ai is still preparing your previous reply." });
      }
      const leaseToken = randomUUID();
      const userMessage = { id: input.requestId, role: "user" as const, text: input.message, createdAt: new Date() };
      const claimed = await MedaaConversation.findOneAndUpdate(
        { _id: stored._id, userId, revision: stored.revision },
        { $set: {
          pendingRequestId: input.requestId, leaseToken, leaseExpiresAt: new Date(Date.now() + LEASE_MS),
          failedRequestId: null, failureMessage: null,
          ...(stored.messages.length === 0 ? { title: input.message.slice(0, 64) } : {}),
        }, $inc: { revision: 1 }, ...(previous ? {} : { $push: { messages: userMessage } }) },
        { returnDocument: "after" },
      );
      if (!claimed) throw new TRPCError({ code: "CONFLICT", message: "The conversation changed. Reload it and retry." });
      try {
        await reserveGeneration(userId);
        const snapshot = serializeConversation(claimed.toObject());
        const generated = medaaResponseSchema.parse(await provider.generate({
          messages: snapshot.messages.map(({ role, text }) => ({ role, text })),
          drafts: snapshot.drafts,
          todayDayKey: dayKeyForTimeZone(new Date(), stored.timeZone),
          timeZone: stored.timeZone,
        }));
        const current = await ownedConversation(input.conversationId, userId);
        if (current.leaseToken !== leaseToken) throw new TRPCError({ code: "CONFLICT", message: "A newer retry is preparing this reply." });
        const drafts = serializeConversation(current).drafts;
        for (const suggestion of generated.suggestions) {
          const existing = suggestion.replaceDraftId
            ? drafts.find((draft) => draft.id === suggestion.replaceDraftId)
            : drafts.find((draft) => draft.status === "draft" && draft.content.type === suggestion.content.type
              && draft.content.title.toLocaleLowerCase() === suggestion.content.title.toLocaleLowerCase());
          if (suggestion.replaceDraftId && (!existing || existing.status !== "draft")) {
            throw new TRPCError({ code: "BAD_GATEWAY", message: "Medaa Ai could not safely update that draft. Please retry." });
          }
          if (existing) {
            existing.content = suggestion.content;
            existing.version += 1;
            existing.review = null;
          } else {
            drafts.push({ id: randomUUID(), content: suggestion.content, version: 0, status: "draft", review: null, entityId: null });
          }
        }
        if (drafts.length > MAX_DRAFTS) throw new TRPCError({ code: "BAD_REQUEST", message: "This conversation has enough drafts. Start a new chat for more suggestions." });
        const completed = await MedaaConversation.findOneAndUpdate(
          { _id: current._id, userId, leaseToken },
          { $set: { drafts, pendingRequestId: null, leaseToken: null, leaseExpiresAt: null },
            $inc: { revision: 1 }, $push: { messages: {
              id: `assistant:${input.requestId}`, role: "assistant", text: generated.message, createdAt: new Date(),
            } } },
          { returnDocument: "after" },
        );
        if (!completed) throw new TRPCError({ code: "CONFLICT", message: "The reply was interrupted. Please retry." });
        return viewConversation(input.conversationId, userId);
      } catch (error) {
        const message = error instanceof TRPCError || error instanceof MedaaProviderError ? error.message
          : "Medaa Ai could not finish the reply. Your message is saved; please retry.";
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
      if (draft.status !== "draft" || draft.version !== input.expectedVersion) {
        throw new TRPCError({ code: "CONFLICT", message: "This draft changed or was already submitted. Reload before editing." });
      }
      if (input.content.type !== draft.content.type) throw new TRPCError({ code: "BAD_REQUEST", message: "Ask Medaa Ai to change the draft type before reviewing it." });
      const days = Math.round((Date.parse(`${input.endDayKey}T00:00:00Z`) - Date.parse(`${input.startDayKey}T00:00:00Z`)) / 86_400_000);
      const window = goalDurationWindow(input.startDayKey, days);
      if (!window || window.endDayKey !== input.endDayKey || days > (draft.content.type === "habit" ? 365 : 3_650)
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

    set: protectedProcedure.input(z.object({ conversationId, draftId: z.string().uuid(), reviewId: z.string().uuid() }))
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
        requireIdle(stored);
        const normal = rdmRouter.createCaller(ctx);
        if (draft.status === "draft") {
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
