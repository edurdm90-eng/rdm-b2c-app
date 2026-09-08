import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { GoalCreateInput, HabitCreateInput } from "../domain/commitment-input";
import type { MedaaConversation, MedaaDraftContent, MedaaGenerationContext, MedaaResponse } from "../domain/medaa";
import type { AppRouter } from "../routers/index";
import type { createMedaaRouter } from "../routers/medaa";

type Dependencies = {
  db: typeof import("@rdm-b2c/db");
  caller: (userId: string) => ReturnType<AppRouter["createCaller"]>;
};
type MedaaCaller = ReturnType<ReturnType<typeof createMedaaRouter>["createCaller"]>;
type ResponseFactory = (context: MedaaGenerationContext) => MedaaResponse;

const dayAfter = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const weekdays = [1, 2, 3, 4, 5, 6, 7];
const goalContent = (number: number): MedaaDraftContent => ({
  type: "goal", title: `Interview ${number} potential customers`, category: "Focus",
  target: `${number} customer interviews documented`, pledge: null, weekdays: [], durationDays: 14,
});
const habitContent = (): MedaaDraftContent => ({
  type: "habit", title: "Read one industry article", category: "Focus",
  target: "Record one useful takeaway", pledge: "I pledge to read one article and record one useful takeaway.",
  weekdays, durationDays: 14,
});
const goalBatch = (offset = 0): MedaaResponse => ({
  message: "Choose practical first steps toward your ambition.",
  suggestions: [1, 2, 3].map((number) => ({ replaceDraftId: null, content: goalContent(number + offset) })),
});

function sessionContext(userId: string) {
  const now = new Date();
  return { auth: null, session: {
    user: { id: userId, email: `${userId}@example.test`, name: "Medaa Regression Tester", emailVerified: false, createdAt: now, updatedAt: now },
    session: { id: randomUUID(), token: randomUUID(), userId, expiresAt: new Date(Date.now() + 86_400_000), createdAt: now, updatedAt: now },
  } };
}

async function rejectsCode(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: unknown) => error instanceof Error && "code" in error && error.code === code);
}

async function harness(dependencies: Dependencies, initialResponse: ResponseFactory = () => goalBatch()) {
  // Import runtime code only after the shared fixture installs its isolated database URL.
  const { createMedaaRouter: createRouter } = await import("../routers/medaa");
  const userId = randomUUID();
  await dependencies.db.RdmProfile.create({ userId, walletBalance: 100 });
  const calls: MedaaGenerationContext[] = [];
  let respond = initialResponse;
  const router = createRouter({
    configured: () => true,
    async generate(context) {
      calls.push(structuredClone(context));
      return respond(context);
    },
  });
  return {
    ...dependencies, userId, calls,
    medaa: router.createCaller(sessionContext(userId)),
    normal: dependencies.caller(userId),
    asUser: (id: string) => router.createCaller(sessionContext(id)),
    respondWith: (factory: ResponseFactory) => { respond = factory; },
  };
}
type Harness = Awaited<ReturnType<typeof harness>>;

async function readyJourney(medaa: MedaaCaller) {
  let journey = await medaa.start({ creationId: randomUUID(), timeZone: "UTC" });
  journey = await medaa.setHorizon({ conversationId: journey.id, expectedRevision: journey.revision, horizonYears: 3 });
  return medaa.defineLongTerm({ conversationId: journey.id, expectedRevision: journey.revision,
    longTermGoal: "Build a useful and sustainable small business", category: "Focus" });
}

async function quote(h: Harness, conversation: MedaaConversation, draftId: string, days: number, pledgeAmount = 1) {
  const draft = conversation.drafts.find((item) => item.id === draftId);
  assert.ok(draft);
  return h.medaa.prepare({ conversationId: conversation.id, draftId, expectedVersion: draft.version,
    content: draft.content, startDayKey: dayAfter(0), endDayKey: dayAfter(days), timeZone: "UTC", pledgeAmount });
}

async function withCreatedGoal(h: Harness) {
  let conversation = await readyJourney(h.medaa);
  const draftId = randomUUID();
  conversation = await h.medaa.addManual({ conversationId: conversation.id, requestId: draftId, content: goalContent(10) });
  const prepared = await quote(h, conversation, draftId, 14);
  return h.medaa.set({ conversationId: conversation.id, draftId, reviewId: prepared.review.id });
}

async function freezeBeforeCreation(h: Harness, conversationId: string, draftId: string, startDayKey: string, endDayKey: string) {
  // Persist the state left by a process exit immediately after Set freezes an approval.
  // Shift both dates equally to represent that approval being retried after a day rollover.
  await h.db.MedaaConversation.updateOne({ _id: conversationId, userId: h.userId }, {
    $set: { "drafts.$[draft].status": "setting", "drafts.$[draft].review.startDayKey": startDayKey,
      "drafts.$[draft].review.endDayKey": endDayKey },
    $inc: { revision: 1, "drafts.$[draft].version": 1 },
  }, { arrayFilters: [{ "draft.id": draftId, "draft.status": "draft" }] });
}

async function assertOperationOnce(h: Harness, operationId: string) {
  const profile = await h.db.RdmProfile.findOne({ userId: h.userId }).lean();
  assert.ok(profile);
  assert.equal(profile.creditedOperations.filter((id) => id === operationId).length, 1);
  assert.equal(profile.transactions.filter((entry) => entry.operationId === operationId).length, 1);
}

export const medaaRegressionCases: Array<{ name: string; run: (dependencies: Dependencies) => Promise<void> }> = [
  {
    name: "Medaa rejects a new review longer than 30 calendar days without changing its saved draft or wallet",
    async run(dependencies) {
      const h = await harness(dependencies);
      let conversation = await readyJourney(h.medaa);
      const draftId = randomUUID();
      conversation = await h.medaa.addManual({ conversationId: conversation.id, requestId: draftId,
        content: { ...goalContent(1), durationDays: 14 } });
      await rejectsCode(() => quote(h, conversation, draftId, 31), "BAD_REQUEST");
      assert.deepEqual(await h.medaa.conversation({ id: conversation.id }), conversation);
      assert.deepEqual(await h.normal.rdm.goals.list(), []);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 100);
      const goalBoundary = await quote(h, conversation, draftId, 30);
      assert.equal(goalBoundary.review.scheduledDays, 30);
      assert.equal(goalBoundary.review.totalPledge, 1);
      conversation = await h.medaa.set({ conversationId: conversation.id, draftId, reviewId: goalBoundary.review.id });
      const habitId = randomUUID();
      conversation = await h.medaa.addManual({ conversationId: conversation.id, requestId: habitId, content: habitContent() });
      await rejectsCode(() => quote(h, conversation, habitId, 31), "BAD_REQUEST");
      assert.deepEqual(await h.medaa.conversation({ id: conversation.id }), conversation);
      const habitBoundary = await quote(h, conversation, habitId, 30);
      assert.equal(habitBoundary.review.scheduledDays, 30);
      assert.equal(habitBoundary.review.totalPledge, 30);
      assert.equal(habitBoundary.review.endDayKey, dayAfter(30));
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 99);
    },
  },
  {
    name: "Medaa keeps an old long review readable but rejects its first Set until a shorter review replaces it",
    async run(dependencies) {
      const h = await harness(dependencies);
      let conversation = await readyJourney(h.medaa);
      const draftId = randomUUID();
      conversation = await h.medaa.addManual({ conversationId: conversation.id, requestId: draftId,
        content: { ...goalContent(1), durationDays: 14 } });
      const prepared = await quote(h, conversation, draftId, 14, 7);
      // Restore a genuine pre-policy review snapshot, without submitting or funding it.
      await h.db.MedaaConversation.updateOne({ _id: conversation.id, userId: h.userId }, { $set: {
        "drafts.$[draft].content.durationDays": 90,
        "drafts.$[draft].review.endDayKey": dayAfter(90),
        "drafts.$[draft].review.scheduledDays": 90,
      } }, { arrayFilters: [{ "draft.id": draftId }] });
      const legacy = await h.medaa.conversation({ id: conversation.id });
      assert.equal(legacy.drafts.find((draft) => draft.id === draftId)?.review?.endDayKey, dayAfter(90));
      await rejectsCode(() => h.medaa.set({ conversationId: conversation.id, draftId, reviewId: prepared.review.id }), "BAD_REQUEST");
      assert.deepEqual(await h.medaa.conversation({ id: conversation.id }), legacy);
      assert.deepEqual(await h.normal.rdm.goals.list(), []);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 100);
      const shorter = await quote(h, legacy, draftId, 14, 7);
      assert.notEqual(shorter.review.id, prepared.review.id);
      const request = { conversationId: conversation.id, draftId, reviewId: shorter.review.id };
      conversation = await h.medaa.set(request);
      await h.medaa.set(request);
      const entityId = conversation.drafts.find((draft) => draft.id === draftId)?.entityId;
      assert.ok(entityId);
      assert.equal((await h.normal.rdm.goals.byId({ id: entityId })).endDayKey, dayAfter(14));
      assert.equal((await h.normal.rdm.goals.list()).length, 1);
      assert.deepEqual((await h.normal.rdm.wallet.summary()).wallet, { balance: 93, base: 93, reward: 0, remorse: 0, peer: 0 });
    },
  },
  {
    name: "Medaa API contract guard: all horizons persist and invalid revisions cannot overwrite saved progress",
    async run({ db, caller }) {
      // This guards the public API contract; it does not reproduce or claim to
      // test the native client's delayed-query/cache race. No AI action is called.
      const userId = randomUUID();
      const medaa = caller(userId).medaa;
      for (const horizonYears of [1, 2, 3] as const) {
        const startInput = { creationId: randomUUID(), timeZone: "UTC" };
        const initial = await medaa.start(startInput);
        assert.equal(initial.journey?.stage, "horizon");
        assert.equal(initial.journey.horizonYears, null);
        assert.deepEqual(await medaa.start(startInput), initial);

        const selected = await medaa.setHorizon({ conversationId: initial.id,
          expectedRevision: initial.revision, horizonYears });
        assert.equal(selected.journey?.horizonYears, horizonYears);
        assert.equal(selected.journey.stage, "long-term");
        assert.equal(selected.revision, initial.revision + 1);
        assert.deepEqual(await caller(userId).medaa.conversation({ id: initial.id }), selected);
        assert.deepEqual(await medaa.start(startInput), selected);

        const otherHorizon = horizonYears === 3 ? 1 : 3;
        for (const expectedRevision of [initial.revision, selected.revision + 1]) {
          await rejectsCode(() => medaa.setHorizon({ conversationId: initial.id,
            expectedRevision, horizonYears: otherHorizon }), "CONFLICT");
          await rejectsCode(() => medaa.defineLongTerm({ conversationId: initial.id,
            expectedRevision, longTermGoal: "This conflicting ambition must not be saved", category: "Money" }), "CONFLICT");
          assert.deepEqual(await caller(userId).medaa.conversation({ id: initial.id }), selected);
        }

        const defined = await medaa.defineLongTerm({ conversationId: initial.id,
          expectedRevision: selected.revision, longTermGoal: "Build a sustainable independent business", category: "Focus" });
        assert.equal(defined.journey?.stage, "short-term");
        assert.equal(defined.journey.horizonYears, horizonYears);
        assert.equal(defined.revision, selected.revision + 1);
        assert.deepEqual(await caller(userId).medaa.conversation({ id: initial.id }), defined);
        assert.deepEqual(await medaa.start(startInput), defined);
        assert.equal(await db.MedaaConversation.countDocuments({ userId, creationId: startInput.creationId }), 1);
      }
      assert.equal((await medaa.conversations()).length, 3);
      assert.equal(await db.MedaaUsage.countDocuments({ userId }), 0);
    },
  },
  {
    name: "Medaa initially permits two AI goals and unlocks a third AI card only after the selected goals are created",
    async run(dependencies) {
      const h = await harness(dependencies);
      let conversation = await readyJourney(h.medaa);
      conversation = await h.medaa.navigate({ conversationId: conversation.id, expectedRevision: conversation.revision, stage: "plan" });
      conversation = await h.medaa.generate({ conversationId: conversation.id, requestId: randomUUID(), action: { kind: "suggest-goals" } });
      const ids = conversation.drafts.map((draft) => draft.id);
      assert.equal(ids.length, 3);
      assert.ok(conversation.drafts.every((draft) => draft.content.durationDays === 14));
      await rejectsCode(() => h.medaa.chooseGoals({ conversationId: conversation.id, expectedRevision: conversation.revision, draftIds: ids }), "BAD_REQUEST");
      await rejectsCode(() => h.medaa.navigate({ conversationId: conversation.id, expectedRevision: conversation.revision, stage: "habits" }), "BAD_REQUEST");
      conversation = await h.medaa.chooseGoals({ conversationId: conversation.id, expectedRevision: conversation.revision, draftIds: ids.slice(0, 2) });
      for (const id of ids.slice(0, 2)) {
        await rejectsCode(() => h.medaa.chooseGoals({ conversationId: conversation.id, expectedRevision: conversation.revision, draftIds: ids }), "BAD_REQUEST");
        const prepared = await quote(h, conversation, id, 14);
        conversation = await h.medaa.set({ conversationId: conversation.id, draftId: id, reviewId: prepared.review.id });
      }
      conversation = await h.medaa.navigate({ conversationId: conversation.id, expectedRevision: conversation.revision, stage: "next" });
      conversation = await h.medaa.chooseGoals({ conversationId: conversation.id, expectedRevision: conversation.revision, draftIds: ids });
      assert.deepEqual(conversation.journey?.selectedGoalIds, ids);
      conversation = await h.medaa.chooseGoals({ conversationId: conversation.id, expectedRevision: conversation.revision, draftIds: ids });
      await rejectsCode(() => h.medaa.chooseGoals({ conversationId: conversation.id, expectedRevision: conversation.revision, draftIds: ids.slice(1) }), "BAD_REQUEST");
      const third = await quote(h, conversation, ids[2]!, 14);
      conversation = await h.medaa.set({ conversationId: conversation.id, draftId: ids[2]!, reviewId: third.review.id });
      await rejectsCode(() => h.medaa.addManual({ conversationId: conversation.id, requestId: randomUUID(), content: goalContent(4) }), "BAD_REQUEST");
      assert.equal((await h.normal.rdm.goals.list()).length, 3);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 97);
      assert.equal(h.calls.length, 1);
    },
  },
  {
    name: "Medaa requires the first two saved steps, rejects open-ended actions, and reuses saved AI results",
    async run(dependencies) {
      const h = await harness(dependencies);
      let conversation = await h.medaa.start({ creationId: randomUUID(), timeZone: "UTC" });
      const request = { conversationId: conversation.id, requestId: randomUUID(), action: { kind: "suggest-goals" as const } };
      await rejectsCode(() => h.medaa.generate(request), "BAD_REQUEST");
      conversation = await h.medaa.setHorizon({ conversationId: conversation.id, expectedRevision: conversation.revision, horizonYears: 2 });
      await rejectsCode(() => h.medaa.generate(request), "BAD_REQUEST");
      assert.equal(h.calls.length, 0);
      conversation = await h.medaa.defineLongTerm({ conversationId: conversation.id, expectedRevision: conversation.revision,
        longTermGoal: "Develop a sustainable independent business", category: "Money" });
      await rejectsCode(() => h.medaa.generate({ ...request, action: { kind: "chat", message: "Hello" } } as unknown as Parameters<MedaaCaller["generate"]>[0]), "BAD_REQUEST");
      await rejectsCode(() => h.medaa.generate({ ...request, action: { kind: "suggest-habits" } }), "BAD_REQUEST");
      assert.equal(h.calls.length, 0);
      const generated = await h.medaa.generate(request);
      const retried = await h.medaa.generate(request);
      const cached = await h.medaa.generate({ ...request, requestId: randomUUID() });
      assert.deepEqual(retried.drafts, generated.drafts);
      assert.deepEqual(cached.drafts, generated.drafts);
      assert.equal(cached.messages.length, 2);
      assert.equal(h.calls.length, 1);
      assert.deepEqual(h.calls[0]?.messages, []);
      assert.equal(h.calls[0]?.journey?.horizonYears, 2);
      await rejectsCode(() => h.medaa.generate({ ...request, action: { kind: "suggest-habits" } }), "CONFLICT");
      const other = h.asUser(randomUUID());
      await rejectsCode(() => other.conversation({ id: conversation.id }), "NOT_FOUND");
      await rejectsCode(() => other.generate(request), "NOT_FOUND");
      assert.equal(h.calls.length, 1);
      assert.equal(await h.db.Goal.countDocuments({ userId: h.userId }), 0);
      assert.equal(await h.db.Habit.countDocuments({ userId: h.userId }), 0);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 100);
    },
  },
  {
    name: "Medaa explicitly regenerates a short same-title card while preserving an older selected review and cached retries",
    async run(dependencies) {
      const h = await harness(dependencies);
      let conversation = await readyJourney(h.medaa);
      const request = { conversationId: conversation.id, requestId: randomUUID(), action: { kind: "suggest-goals" as const } };
      conversation = await h.medaa.generate(request);
      const draftId = conversation.drafts[0]!.id;
      conversation = await h.medaa.chooseGoals({ conversationId: conversation.id,
        expectedRevision: conversation.revision, draftIds: [draftId] });
      const prepared = await quote(h, conversation, draftId, 14, 7);
      // Persist an older cached batch whose selected card had already been reviewed for 90 days.
      await h.db.MedaaConversation.updateOne({ _id: conversation.id, userId: h.userId }, { $set: {
        "drafts.$[draft].content.durationDays": 90,
        "drafts.$[draft].review.endDayKey": dayAfter(90),
        "drafts.$[draft].review.scheduledDays": 90,
      } }, { arrayFilters: [{ "draft.id": draftId }] });
      const legacy = await h.medaa.conversation({ id: conversation.id });
      const legacyDraft = legacy.drafts.find((draft) => draft.id === draftId)!;
      assert.equal(legacyDraft.review?.id, prepared.review.id);
      assert.deepEqual(await h.medaa.generate(request), legacy);
      assert.deepEqual(await h.medaa.generate({ ...request, requestId: randomUUID() }), legacy);
      assert.equal(h.calls.length, 1);
      const regenerated = await h.medaa.generate({ ...request, requestId: randomUUID(), regenerate: true });
      assert.deepEqual(regenerated.drafts.find((draft) => draft.id === draftId), legacyDraft);
      const shortCards = regenerated.drafts.filter((draft) => draft.content.title === legacyDraft.content.title
        && draft.content.durationDays === 14);
      assert.equal(shortCards.length, 1);
      assert.notEqual(shortCards[0]!.id, draftId);
      assert.ok(regenerated.journey?.goalSuggestionIds.includes(shortCards[0]!.id));
      assert.deepEqual((await h.medaa.generate(request)).drafts, regenerated.drafts);
      assert.equal(h.calls.length, 2);
      assert.deepEqual(await h.normal.rdm.goals.list(), []);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 100);
    },
  },
  {
    name: "Medaa caches empty replies, rejects invalid suggestions, and does not count denied daily admission",
    async run(dependencies) {
      const h = await harness(dependencies, () => ({ message: "Edit your ambition to describe a concrete outcome.", suggestions: [] }));
      let conversation = await readyJourney(h.medaa);
      const request = { conversationId: conversation.id, requestId: randomUUID(), action: { kind: "suggest-goals" as const } };
      conversation = await h.medaa.generate(request);
      assert.equal(conversation.journey?.goalSuggestionsReady, true);
      await h.medaa.generate({ ...request, requestId: randomUUID() });
      assert.equal(h.calls.length, 1);
      conversation = await h.medaa.defineLongTerm({ conversationId: conversation.id, expectedRevision: conversation.revision,
        longTermGoal: "Build a sustainable business through customer interviews", category: "Focus" });
      assert.equal(conversation.journey?.goalSuggestionsReady, false);
      const retryRequest = { ...request, requestId: randomUUID() };
      h.respondWith(() => ({ message: "Invalid repeated options", suggestions: [1, 2, 3].map(() => ({ replaceDraftId: null, content: goalContent(1) })) }));
      await rejectsCode(() => h.medaa.generate(retryRequest), "BAD_GATEWAY");
      conversation = await h.medaa.conversation({ id: conversation.id });
      assert.equal(conversation.drafts.length, 0);
      assert.equal(conversation.failedRequestId, retryRequest.requestId);
      const admittedBefore = conversation.journey?.generations;
      await h.db.MedaaUsage.updateOne({ userId: h.userId, dayKey: dayAfter(0) }, { $set: { requests: 1_000 } });
      await rejectsCode(() => h.medaa.generate(retryRequest), "TOO_MANY_REQUESTS");
      await rejectsCode(() => h.medaa.generate(retryRequest), "TOO_MANY_REQUESTS");
      conversation = await h.medaa.conversation({ id: conversation.id });
      assert.equal(conversation.journey?.generations, admittedBefore);
      assert.equal(h.calls.length, 2);
      await h.db.MedaaUsage.updateOne({ userId: h.userId, dayKey: dayAfter(0) }, { $set: { requests: 0 } });
      h.respondWith(() => goalBatch());
      conversation = await h.medaa.generate(retryRequest);
      assert.equal(h.calls.length, 3);
      assert.equal(conversation.drafts.length, 3);
      const original = conversation.drafts[0]!;
      h.respondWith(() => ({ message: "The target is now more specific.", suggestions: [{
        replaceDraftId: original.id, content: { ...original.content, target: "Document one interview with a potential customer" },
      }] }));
      conversation = await h.medaa.generate({ ...request, requestId: randomUUID(), action: { kind: "refine", draftId: original.id, direction: "more-specific" } });
      const refined = conversation.drafts.find((draft) => draft.id === original.id)!;
      h.respondWith(() => goalBatch(10));
      conversation = await h.medaa.generate({ ...request, requestId: randomUUID(), regenerate: true });
      assert.deepEqual(conversation.drafts.find((draft) => draft.id === original.id), refined);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 100);
    },
  },
  {
    name: "Medaa funds a 14-day habit at one RDM per scheduled day and cannot duplicate funding or reflection settlement",
    async run(dependencies) {
      const h = await harness(dependencies);
      let conversation = await withCreatedGoal(h);
      const draftId = randomUUID();
      conversation = await h.medaa.addManual({ conversationId: conversation.id, requestId: draftId, content: habitContent() });
      await rejectsCode(() => quote(h, conversation, draftId, 14, 0), "BAD_REQUEST");
      const unaffordable = await quote(h, conversation, draftId, 14, 20);
      assert.equal(unaffordable.canAfford, false);
      await rejectsCode(() => h.medaa.set({ conversationId: conversation.id, draftId, reviewId: unaffordable.review.id }), "BAD_REQUEST");
      conversation = await h.medaa.conversation({ id: conversation.id });
      assert.deepEqual(conversation.drafts.find((draft) => draft.id === draftId)?.review, unaffordable.review);
      assert.equal(conversation.drafts.find((draft) => draft.id === draftId)?.status, "draft");
      const prepared = await quote(h, conversation, draftId, 14);
      assert.equal(prepared.review.pledgeAmount, 1);
      assert.equal(prepared.review.scheduledDays, 14);
      assert.equal(prepared.review.totalPledge, 14);
      assert.equal(prepared.review.endDayKey, dayAfter(14));
      assert.equal(prepared.availableBase, 99);
      assert.equal(await h.db.Habit.countDocuments({ userId: h.userId }), 0);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 99);
      const setRequest = { conversationId: conversation.id, draftId, reviewId: prepared.review.id };
      const concurrent = await Promise.allSettled([h.medaa.set(setRequest), h.medaa.set(setRequest)]);
      assert.ok(concurrent.some((result) => result.status === "fulfilled"));
      conversation = await h.medaa.set(setRequest);
      const entityId = conversation.drafts.find((draft) => draft.id === draftId)?.entityId;
      assert.ok(entityId);
      assert.equal(await h.db.Habit.countDocuments({ userId: h.userId, rdmPledgeCreationId: prepared.review.id }), 1);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 85);
      const habit = await h.normal.rdm.habits.byId({ id: entityId });
      assert.equal(habit.rdmPledge?.dayCount, 14);
      assert.equal(habit.rdmPledge?.endDayKey, dayAfter(14));
      await h.normal.rdm.habits.logAction({ id: entityId, note: "Read one article and recorded a takeaway." });
      const reflection = { id: entityId, reflection: "A short article made the practice manageable.", timeZone: "UTC" };
      await h.normal.rdm.habits.reflect(reflection);
      await h.normal.rdm.habits.reflect(reflection);
      await h.medaa.set(setRequest);
      const wallet = await h.normal.rdm.wallet.summary();
      assert.equal(wallet.wallet.base, 85);
      assert.equal(wallet.wallet.reward, 1);
      assert.equal(wallet.wallet.remorse, 0);
      await assertOperationOnce(h, `habit-stake:${entityId}`);
      await assertOperationOnce(h, `habit-pledge:${entityId}:${dayAfter(0)}`);
    },
  },
  {
    name: "Medaa recovers an expired frozen goal only after confirmation and rejects different owners or changed approved fields",
    async run(dependencies) {
      const h = await harness(dependencies);
      let conversation = await readyJourney(h.medaa);
      const draftId = randomUUID();
      const content = { ...goalContent(1), durationDays: 1 };
      conversation = await h.medaa.addManual({ conversationId: conversation.id, requestId: draftId, content });
      const prepared = await quote(h, conversation, draftId, 1, 7);
      const request = { conversationId: conversation.id, draftId, reviewId: prepared.review.id };
      // A saved review whose date passed without Set is not a funding approval.
      await h.db.MedaaConversation.updateOne({ _id: conversation.id, userId: h.userId }, {
        $set: { "drafts.$[draft].review.startDayKey": dayAfter(-2), "drafts.$[draft].review.endDayKey": dayAfter(-1) },
      }, { arrayFilters: [{ "draft.id": draftId }] });
      await rejectsCode(() => h.medaa.set({ ...request, confirmElapsedDates: true }), "BAD_REQUEST");
      assert.equal(await h.db.Goal.countDocuments({ userId: h.userId }), 0);
      await freezeBeforeCreation(h, conversation.id, draftId, dayAfter(-2), dayAfter(-1));
      await rejectsCode(() => h.medaa.set(request), "BAD_REQUEST");
      await h.medaa.conversation({ id: conversation.id });
      assert.equal(await h.db.Goal.countDocuments({ userId: h.userId }), 0);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 100);
      const original: GoalCreateInput = { creationId: prepared.review.id, title: content.title, category: content.category,
        target: content.target, durationDays: 1, startDayKey: dayAfter(-2), timeZone: "UTC", pledgeAmount: 7 };
      const { hasMedaaCommitmentApproval } = await import("../services/medaa-commitment-approval");
      assert.equal(await hasMedaaCommitmentApproval(h.userId, { type: "goal", input: original }), true);
      const mismatches: Partial<GoalCreateInput>[] = [
        { creationId: randomUUID() }, { title: "Another title" }, { category: "Health" }, { target: "Another target" },
        { durationDays: 2 }, { startDayKey: dayAfter(-3) }, { timeZone: "Etc/UTC" }, { pledgeAmount: 8 },
      ];
      for (const mismatch of mismatches) {
        await rejectsCode(() => h.normal.rdm.goals.create({ ...original, ...mismatch }), "BAD_REQUEST");
      }
      const otherId = randomUUID();
      assert.equal(await hasMedaaCommitmentApproval(otherId, { type: "goal", input: original }), false);
      await rejectsCode(() => h.caller(otherId).rdm.goals.create(original), "BAD_REQUEST");
      await rejectsCode(() => h.asUser(otherId).set({ ...request, confirmElapsedDates: true }), "NOT_FOUND");
      const retriedTogether = await Promise.allSettled([
        h.medaa.set({ ...request, confirmElapsedDates: true }), h.medaa.set({ ...request, confirmElapsedDates: true }),
      ]);
      assert.ok(retriedTogether.some((result) => result.status === "fulfilled"));
      conversation = await h.medaa.set({ ...request, confirmElapsedDates: true });
      const entityId = conversation.drafts.find((draft) => draft.id === draftId)?.entityId;
      assert.ok(entityId);
      const goal = await h.normal.rdm.goals.byId({ id: entityId });
      assert.equal(goal.status, "missed");
      assert.equal(goal.startDayKey, original.startDayKey);
      assert.equal(goal.endDayKey, dayAfter(-1));
      await h.medaa.set(request);
      await h.medaa.set({ ...request, confirmElapsedDates: true });
      assert.equal(await h.db.Goal.countDocuments({ userId: h.userId, creationId: prepared.review.id }), 1);
      assert.deepEqual((await h.normal.rdm.wallet.summary()).wallet, { balance: 100, base: 93, reward: 0, remorse: 7, peer: 0 });
      await assertOperationOnce(h, `goal-stake:${entityId}`);
      await assertOperationOnce(h, `goal-settle:${entityId}`);
    },
  },
  {
    name: "Medaa preserves a legacy frozen 90-day goal through explicit recovery, settlement, reload and repeated Set",
    async run(dependencies) {
      const h = await harness(dependencies);
      let conversation = await readyJourney(h.medaa);
      const draftId = randomUUID();
      conversation = await h.medaa.addManual({ conversationId: conversation.id, requestId: draftId, content: goalContent(1) });
      const prepared = await quote(h, conversation, draftId, 14, 7);
      // Restore the exact approved payload of a pre-policy Set interrupted before normal creation.
      await h.db.MedaaConversation.updateOne({ _id: conversation.id, userId: h.userId }, { $set: {
        "drafts.$[draft].status": "setting", "drafts.$[draft].content.durationDays": 90,
        "drafts.$[draft].review.startDayKey": dayAfter(-91), "drafts.$[draft].review.endDayKey": dayAfter(-1),
        "drafts.$[draft].review.scheduledDays": 90,
      }, $inc: { revision: 1, "drafts.$[draft].version": 1 } }, { arrayFilters: [{ "draft.id": draftId }] });
      const frozen = await h.medaa.conversation({ id: conversation.id });
      const originalReview = frozen.drafts.find((draft) => draft.id === draftId)!.review;
      assert.equal(originalReview?.id, prepared.review.id);
      assert.equal(frozen.drafts.find((draft) => draft.id === draftId)?.content.durationDays, 90);
      assert.deepEqual(await h.normal.rdm.goals.list(), []);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 100);
      const request = { conversationId: conversation.id, draftId, reviewId: prepared.review.id };
      await rejectsCode(() => h.medaa.set(request), "BAD_REQUEST");
      conversation = await h.medaa.set({ ...request, confirmElapsedDates: true });
      const created = conversation.drafts.find((draft) => draft.id === draftId)!;
      assert.equal(created.status, "created");
      assert.equal(created.content.durationDays, 90);
      assert.deepEqual(created.review, originalReview);
      assert.ok(created.entityId);
      const goal = await h.normal.rdm.goals.byId({ id: created.entityId });
      assert.equal(goal.startDayKey, dayAfter(-91));
      assert.equal(goal.endDayKey, dayAfter(-1));
      assert.equal(goal.status, "missed");
      const wallet = await h.normal.rdm.wallet.summary();
      assert.deepEqual(wallet.wallet, { balance: 100, base: 93, reward: 0, remorse: 7, peer: 0 });
      assert.deepEqual(await h.medaa.conversation({ id: conversation.id }), conversation);
      await h.medaa.set(request);
      await h.medaa.set({ ...request, confirmElapsedDates: true });
      assert.equal((await h.normal.rdm.goals.list()).length, 1);
      const unchanged = await h.normal.rdm.wallet.summary();
      assert.deepEqual(unchanged.wallet, wallet.wallet);
      assert.deepEqual(unchanged.transactions, wallet.transactions);
      assert.deepEqual((await h.medaa.conversation({ id: conversation.id })).drafts.find((draft) => draft.id === draftId), created);
    },
  },
  {
    name: "Medaa recovers an overdue frozen habit using the exact weekday pledge and settles each day once",
    async run(dependencies) {
      const h = await harness(dependencies);
      let conversation = await withCreatedGoal(h);
      const draftId = randomUUID();
      const content = { ...habitContent(), durationDays: 3 };
      conversation = await h.medaa.addManual({ conversationId: conversation.id, requestId: draftId, content });
      const prepared = await quote(h, conversation, draftId, 3);
      await freezeBeforeCreation(h, conversation.id, draftId, dayAfter(-2), dayAfter(1));
      const request = { conversationId: conversation.id, draftId, reviewId: prepared.review.id };
      await rejectsCode(() => h.medaa.set(request), "BAD_REQUEST");
      await h.medaa.conversation({ id: conversation.id });
      assert.equal(await h.db.Habit.countDocuments({ userId: h.userId }), 0);
      assert.equal((await h.normal.rdm.wallet.summary()).wallet.base, 99);
      const original: HabitCreateInput = { creationId: prepared.review.id, title: content.title, category: "Focus",
        target: content.target, pledge: content.pledge!, cadence: "Custom weekly", icon: "target", source: "custom",
        rdmPledgePerDay: 1, rdmPledgeWeekdays: weekdays, rdmPledgeStartDayKey: dayAfter(-2), rdmPledgeEndDayKey: dayAfter(1), timeZone: "UTC" };
      const { hasMedaaCommitmentApproval } = await import("../services/medaa-commitment-approval");
      assert.equal(await hasMedaaCommitmentApproval(h.userId, { type: "habit", input: { ...original, rdmPledgeWeekdays: [...weekdays].reverse() } }), true);
      const mismatches: Partial<HabitCreateInput>[] = [
        { rdmPledgePerDay: 2 }, { pledge: "I pledge to do a different action." }, { rdmPledgeWeekdays: [1, 2, 3, 4, 5] },
        { rdmPledgeEndDayKey: dayAfter(2) }, { source: "template" }, { icon: "leaf" }, { cadence: "Daily" },
      ];
      for (const mismatch of mismatches) {
        await rejectsCode(() => h.normal.rdm.habits.create({ ...original, ...mismatch }), "BAD_REQUEST");
      }
      assert.equal(await hasMedaaCommitmentApproval(randomUUID(), { type: "habit", input: original }), false);
      conversation = await h.medaa.set({ ...request, confirmElapsedDates: true });
      const entityId = conversation.drafts.find((draft) => draft.id === draftId)?.entityId;
      assert.ok(entityId);
      let habit = await h.normal.rdm.habits.byId({ id: entityId });
      assert.equal(habit.rdmPledge?.remaining, 1);
      assert.equal(habit.rdmPledge?.endDayKey, dayAfter(1));
      assert.equal(habit.history.filter((entry) => entry.outcome === "missed").length, 2);
      const caughtUp = await h.normal.rdm.wallet.summary();
      assert.equal(caughtUp.wallet.base, 96);
      assert.equal(caughtUp.wallet.remorse, 2);
      await h.normal.rdm.habits.logAction({ id: entityId, note: "Recorded a takeaway from today's article." });
      const reflection = { id: entityId, reflection: "A specific takeaway helped me remember the article.", timeZone: "UTC" };
      await h.normal.rdm.habits.reflect(reflection);
      await h.normal.rdm.habits.reflect(reflection);
      await h.medaa.set(request);
      habit = await h.normal.rdm.habits.byId({ id: entityId });
      assert.equal(habit.history.length, 3);
      assert.equal(habit.rdmPledge?.remaining, 0);
      assert.equal(await h.db.Habit.countDocuments({ userId: h.userId, rdmPledgeCreationId: prepared.review.id }), 1);
      assert.deepEqual((await h.normal.rdm.wallet.summary()).wallet, { balance: 99, base: 96, reward: 1, remorse: 2, peer: 0 });
      await assertOperationOnce(h, `habit-stake:${entityId}`);
      for (const offset of [-2, -1, 0]) await assertOperationOnce(h, `habit-pledge:${entityId}:${dayAfter(offset)}`);
    },
  },
];
