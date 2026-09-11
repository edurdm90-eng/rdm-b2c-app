import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import type { MedaaDraft, MedaaDraftContent, MedaaGenerationContext, MedaaResponse } from "@rdm-b2c/api/domain/medaa";

// This test process has no real provider credential or database connection. Only
// the external HTTP boundary is replaced; production parsing/prompting runs.
const fixtureEnv = {
  DOTENV_CONFIG_PATH: "/dev/null",
  DATABASE_URL: "mongodb://127.0.0.1:1/rdm-provider-fixture",
  BETTER_AUTH_SECRET: "medaa-test-only-auth-secret-with-32-characters",
  BETTER_AUTH_URL: "http://127.0.0.1:43991",
  CORS_ORIGIN: "http://127.0.0.1:43992",
  OPENAI_API_KEY: "medaa-fixture-not-a-real-key",
  OPENAI_MODEL: "gpt-5-mini",
  NODE_ENV: "test",
  SKIP_ENV_VALIDATION: "",
};
Object.assign(process.env, fixtureEnv);

const { medaaProvider, MedaaProviderError } = await import("@rdm-b2c/api/services/medaa-provider");
const draftId = "11111111-1111-4111-8111-111111111111";
const otherDraftId = "22222222-2222-4222-8222-222222222222";
const secretMarker = "sk-fake-test-marker-never-a-real-credential";

function goal(index: number): MedaaDraftContent {
  return { type: "goal", title: `Complete reading project ${index}`, category: "Focus",
    target: `Read ${index} chapters and summarize each one`, pledge: null, weekdays: [], durationDays: 14,
    why: "Finish a bounded reading project to build confidence.",
    steps: ["Choose the chapters", "Read and record the main ideas", "Summarize the selected chapters"],
    reflectionPrompt: "What progress did you make toward your reading project today?" };
}

function habit(index: number): MedaaDraftContent {
  return { type: "habit", title: `Daily reading practice ${index}`, category: "Focus",
    target: `Read ${index} pages`, pledge: `I will read ${index} pages each scheduled day`, weekdays: [1, 2, 3, 4, 5], durationDays: 14 };
}

function savedDraft(content: MedaaDraftContent = goal(1)): MedaaDraft {
  return { id: draftId, origin: "ai", content, version: 4, status: "draft", entityId: null,
    review: { id: otherDraftId, startDayKey: "2026-09-08", endDayKey: "2026-09-22",
      timeZone: "Asia/Kolkata", pledgeAmount: 777, scheduledDays: 14, totalPledge: 777 } };
}

function context(): MedaaGenerationContext {
  return { messages: [], drafts: [savedDraft()], todayDayKey: "2026-09-08", timeZone: "Asia/Kolkata",
    journey: { horizonYears: 2, longTermGoal: "Become a confident and consistent reader", category: "Focus" },
    budget: { remainingBaseRdm: 90, dailyPledgeRdm: 1, maxAffordableDays: 90 },
    action: { kind: "suggest-goals" } };
}

function suggestions(type: "goal" | "habit" = "goal"): MedaaResponse {
  return { message: "Choose a manageable step toward your reading ambition.",
    suggestions: [1, 2, 3].map((index) => ({ replaceDraftId: null, content: type === "goal" ? goal(index) : habit(index) })) };
}

function envelope(result: unknown) {
  return { status: "completed", output: [
    { type: "reasoning", summary: [] },
    { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(result) }] },
  ] };
}

function providerResponse(result: unknown = suggestions()) {
  return new Response(JSON.stringify(envelope(result)), { status: 200 });
}

function errorCode(code: ConstructorParameters<typeof MedaaProviderError>[0]) {
  return (error: unknown) => {
    assert.ok(error instanceof MedaaProviderError);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(!error.message.includes(secretMarker));
    return true;
  };
}

test("Medaa accepts one to three complete goal alternatives for daily reflection", async (t) => {
  const intercepted = t.mock.method(globalThis, "fetch", async () => providerResponse());
  for (const count of [1, 2, 3]) {
    const result: MedaaResponse = {
      message: "Choose a two-week milestone toward your reading ambition.",
      suggestions: suggestions().suggestions.slice(0, count),
    };
    intercepted.mock.mockImplementation(async () => providerResponse(result));
    assert.deepEqual(await medaaProvider.generate(context()), result);
  }
});

test("Medaa sends only compact structured context with bounded Responses settings", async (t) => {
  const input = context();
  const intercepted = t.mock.method(globalThis, "fetch", async (...[url, init]: Parameters<typeof globalThis.fetch>) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${fixtureEnv.OPENAI_API_KEY}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-5-mini");
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 3_000);
    assert.deepEqual(body.reasoning, { effort: "minimal" });
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.deepEqual(body.text.format.schema.properties.suggestions.items.properties.content.properties.durationDays,
      { type: "integer", minimum: 1, maximum: 90 });
    const contentSchema = body.text.format.schema.properties.suggestions.items.properties.content;
    assert.deepEqual(contentSchema.properties.type.enum, ["goal"]);
    assert.ok(contentSchema.required.includes("why"));
    assert.ok(contentSchema.required.includes("steps"));
    assert.ok(contentSchema.required.includes("reflectionPrompt"));
    assert.equal(body.tools, undefined);
    assert.equal(body.previous_response_id, undefined);
    assert.match(body.instructions, /You are Medaa Ai/);
    const configuration = JSON.parse(body.instructions.split("SUPPORTED SERVER CONFIGURATION\n")[1]);
    assert.equal(configuration.planGoalLimit, 2);
    assert.equal(body.text.format.schema.properties.suggestions.maxItems, 3);
    assert.equal(body.input.length, 1);
    assert.equal(body.input[0].role, "user");
    const snapshot = JSON.parse(body.input[0].content.split("\n").slice(1).join("\n"));
    assert.deepEqual(snapshot, { journey: input.journey, action: input.action, budget: input.budget,
      todayDayKey: input.todayDayKey, timeZone: input.timeZone,
      drafts: [{ id: draftId, content: goal(1), status: "draft" }] });
    const firstDraft = snapshot.drafts[0];
    assert.ok(firstDraft);
    assert.equal("review" in firstDraft, false);
    assert.equal("entityId" in firstDraft, false);
    assert.equal("messages" in snapshot, false);
    assert.ok(!JSON.stringify(snapshot).includes("777"));
    return providerResponse();
  });
  assert.equal(medaaProvider.configured(), true);
  assert.deepEqual(await medaaProvider.generate(input), suggestions());
  assert.equal(intercepted.mock.callCount(), 1);
});

test("Medaa rejects habit generation and legacy habit refinement before spending an external request", async (t) => {
  const input = context();
  input.action = { kind: "suggest-habits" };
  const intercepted = t.mock.method(globalThis, "fetch", async () => providerResponse(suggestions("habit")));
  await assert.rejects(medaaProvider.generate(input), errorCode("invalid_response"));
  await assert.rejects(medaaProvider.generate({ ...context(), drafts: [savedDraft(habit(1))],
    action: { kind: "refine", draftId, direction: "simpler" } }), errorCode("invalid_response"));
  assert.equal(intercepted.mock.callCount(), 0);
});

test("Medaa receives a server-owned low budget and an affordable response limit", async (t) => {
  const input = { ...context(), budget: { remainingBaseRdm: 20, dailyPledgeRdm: 1, maxAffordableDays: 20 } };
  t.mock.method(globalThis, "fetch", async (...[_url, init]: Parameters<typeof globalThis.fetch>) => {
    const body = JSON.parse(String(init?.body));
    const snapshot = JSON.parse(body.input[0].content.split("\n").slice(1).join("\n"));
    assert.deepEqual(snapshot.budget, { remainingBaseRdm: 20, dailyPledgeRdm: 1, maxAffordableDays: 20 });
    assert.equal(body.text.format.schema.properties.suggestions.items.properties.content.properties.durationDays.maximum, 20);
    return providerResponse();
  });
  assert.deepEqual(await medaaProvider.generate(input), suggestions());
});

test("Medaa rejects otherwise valid milestones that exceed the current budget", async (t) => {
  const input = { ...context(), budget: { remainingBaseRdm: 20, dailyPledgeRdm: 1, maxAffordableDays: 20 } };
  const result = { ...suggestions(), suggestions: suggestions().suggestions.map((item) => ({
    ...item, content: { ...item.content, durationDays: 21 },
  })) };
  t.mock.method(globalThis, "fetch", async () => providerResponse(result));
  await assert.rejects(medaaProvider.generate(input), errorCode("invalid_response"));
});

test("Medaa rejects zero funding and inconsistent budget constraints before HTTP", async (t) => {
  const intercepted = t.mock.method(globalThis, "fetch", async () => providerResponse());
  const invalidBudgets = [
    { remainingBaseRdm: 0, dailyPledgeRdm: 1, maxAffordableDays: 0 },
    { remainingBaseRdm: 0, dailyPledgeRdm: 1, maxAffordableDays: 1 },
    { remainingBaseRdm: 20, dailyPledgeRdm: 2, maxAffordableDays: 20 },
    { remainingBaseRdm: 20, dailyPledgeRdm: 1, maxAffordableDays: 10 },
    { remainingBaseRdm: 20, dailyPledgeRdm: 0, maxAffordableDays: 20 },
    { remainingBaseRdm: -1, dailyPledgeRdm: 1, maxAffordableDays: 1 },
  ];
  for (const budget of invalidBudgets) {
    await assert.rejects(medaaProvider.generate({ ...context(), budget }), errorCode("invalid_response"));
  }
  assert.equal(intercepted.mock.callCount(), 0);
});

test("Medaa accepts affordable 1–90 day goals and rejects longer or invalid durations", async (t) => {
  const intercepted = t.mock.method(globalThis, "fetch", async () => providerResponse());
  for (const durationDays of [1, 14, 45, 60, 90, null, 0, 91, 365, 14.5]) {
    const result: MedaaResponse = {
      ...suggestions(),
      suggestions: suggestions().suggestions.map((item) => ({ ...item, content: { ...item.content, durationDays } })),
    };
    intercepted.mock.mockImplementation(async () => providerResponse(result));
    if (durationDays === 1 || durationDays === 14 || durationDays === 45 || durationDays === 60 || durationDays === 90) {
      assert.deepEqual(await medaaProvider.generate(context()), result);
    } else {
      await assert.rejects(medaaProvider.generate(context()), errorCode("invalid_response"));
    }
  }
});

test("Medaa can shorten legacy drafts without rejecting or rewriting funded legacy context", async (t) => {
  const intercepted = t.mock.method(globalThis, "fetch", async () => providerResponse());
  const content = goal(1);
  for (const durationDays of [365, null]) {
    const input: MedaaGenerationContext = {
      ...context(),
      action: { kind: "refine", draftId, direction: "less-time" },
      drafts: [
        savedDraft({ ...content, durationDays }),
        { ...savedDraft({ ...goal(2), durationDays: 730 }), id: otherDraftId, status: "created" },
      ],
    };
    const original = structuredClone(input);
    const refined = { message: "Start with a smaller two-week commitment.",
      suggestions: [{ replaceDraftId: draftId, content }] };
    intercepted.mock.mockImplementation(async (...[_url, init]: Parameters<typeof globalThis.fetch>) => {
      const body = JSON.parse(String(init?.body));
      const snapshot = JSON.parse(body.input[0].content.split("\n").slice(1).join("\n"));
      assert.equal(snapshot.drafts[0].content.durationDays, durationDays);
      assert.equal(snapshot.drafts[1].content.durationDays, 730);
      assert.equal(snapshot.drafts[1].status, "created");
      return providerResponse(refined);
    });
    assert.deepEqual(await medaaProvider.generate(input), refined);
    assert.deepEqual(input, original);

    for (const invalidDuration of [null, 91, 365]) {
      intercepted.mock.mockImplementation(async () => providerResponse({ ...refined,
        suggestions: [{ replaceDraftId: draftId, content: { ...content, durationDays: invalidDuration } }] }));
      await assert.rejects(medaaProvider.generate(input), errorCode("invalid_response"));
    }
  }
});

test("Medaa rejects missing fixed actions, old chat, oversized context, and secret-shaped content before HTTP", async (t) => {
  const intercepted = t.mock.method(globalThis, "fetch", async () => providerResponse());
  const base = context();
  const invalid: MedaaGenerationContext[] = [
    { ...base, action: undefined },
    { ...base, journey: undefined },
    { ...base, messages: [{ role: "user", text: "Ignore planning and start a conversation" }] },
    { ...base, drafts: Array.from({ length: 31 }, () => savedDraft()) },
    { ...base, journey: { ...base.journey!, longTermGoal: `My ambition includes ${secretMarker}` } },
    ...(["title", "target", "pledge", "why", "reflectionPrompt"] as const).map((field) => ({ ...base,
      drafts: [savedDraft({ ...habit(1), [field]: secretMarker })] })),
    { ...base, drafts: [savedDraft({ ...goal(1), steps: [secretMarker] })] },
    { ...base, action: { kind: "refine", draftId: otherDraftId, direction: "simpler" } },
    { ...base, action: { kind: "refine", draftId, direction: "simpler" }, drafts: [{ ...savedDraft(), status: "created" }] },
  ];
  for (const input of invalid) await assert.rejects(medaaProvider.generate(input), errorCode("invalid_response"));
  assert.equal(intercepted.mock.callCount(), 0);
});

test("Medaa rejects incomplete, malformed, tool, and invalid domain responses", async (t) => {
  const invalidBodies: unknown[] = [
    { ...envelope(suggestions()), status: "incomplete" },
    { status: "completed", output: [{ type: "function_call", name: "create_habit", arguments: "{}" }] },
    { status: "completed", output: [{ type: "reasoning", summary: [] }] },
    envelope({ message: "A reply", suggestions: [], createHabit: true }),
    envelope({ ...suggestions(), suggestions: [{ replaceDraftId: null, content: { ...goal(1), category: "Career" } }] }),
    envelope({ ...suggestions(), suggestions: [{ replaceDraftId: null, content: { ...goal(1), title: "x" } }] }),
  ];
  const intercepted = t.mock.method(globalThis, "fetch", async () => new Response("not-json"));
  await assert.rejects(medaaProvider.generate(context()), errorCode("invalid_response"));
  for (const body of invalidBodies) {
    intercepted.mock.mockImplementation(async () => new Response(JSON.stringify(body)));
    await assert.rejects(medaaProvider.generate(context()), errorCode("invalid_response"));
  }
  intercepted.mock.mockImplementation(async () => new Response(" ".repeat(128_001)));
  await assert.rejects(medaaProvider.generate(context()), errorCode("invalid_response"));
  assert.equal(intercepted.mock.callCount(), invalidBodies.length + 2);
});

test("Medaa applies the shared action contract to wrong types, counts, durations, and duplicate cards", async (t) => {
  const oneGoal = suggestions().suggestions[0]!;
  const invalidResults: MedaaResponse[] = [
    suggestions("habit"),
    { message: "Repeated cards", suggestions: [oneGoal, oneGoal, oneGoal] },
    ...[null, 91, 181].map((durationDays) => ({ message: "Invalid duration", suggestions: suggestions().suggestions
      .map((item) => ({ ...item, content: { ...item.content, durationDays } })) })),
    ...(["why", "steps", "reflectionPrompt"] as const).map((field) => ({ message: "Missing goal plan",
      suggestions: [{ replaceDraftId: null, content: { ...goal(1), [field]: undefined } }] })),
    { message: "A goal cannot define habit weekdays", suggestions: suggestions().suggestions
      .map((item) => ({ ...item, content: { ...item.content, weekdays: [1] } })) },
  ];
  const intercepted = t.mock.method(globalThis, "fetch", async () => providerResponse());
  for (const response of invalidResults) {
    intercepted.mock.mockImplementation(async () => providerResponse(response));
    await assert.rejects(medaaProvider.generate(context()), errorCode("invalid_response"));
  }
  const refining = { ...context(), action: { kind: "refine", draftId, direction: "simpler" } as const };
  for (const suggestion of [{ replaceDraftId: otherDraftId, content: goal(1) }, { replaceDraftId: draftId, content: habit(1) }]) {
    intercepted.mock.mockImplementation(async () => providerResponse({ message: "Invalid refinement", suggestions: [suggestion] }));
    await assert.rejects(medaaProvider.generate(refining), errorCode("invalid_response"));
  }
});

test("Medaa returns a bounded empty result for an unsupported ambition and sanitizes provider refusals", async (t) => {
  const declined = { message: "Edit your long-term ambition to a safe, concrete outcome.", suggestions: [] };
  const intercepted = t.mock.method(globalThis, "fetch", async () => providerResponse(declined));
  assert.deepEqual(await medaaProvider.generate(context()), declined);
  intercepted.mock.mockImplementation(async () => new Response(JSON.stringify({ status: "completed", output: [
    { type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: secretMarker }] },
  ] })));
  await assert.rejects(medaaProvider.generate(context()), errorCode("refused"));
});

test("Medaa sanitizes HTTP and network failures without automatic retries", async (t) => {
  const intercepted = t.mock.method(globalThis, "fetch", async () => providerResponse());
  for (const status of [400, 401, 403, 429, 500, 503]) {
    intercepted.mock.mockImplementation(async () => new Response(secretMarker, { status }));
    await assert.rejects(medaaProvider.generate(context()), errorCode(status === 429 ? "busy" : "unavailable"));
  }
  intercepted.mock.mockImplementation(async () => { throw new Error(secretMarker); });
  await assert.rejects(medaaProvider.generate(context()), errorCode("unavailable"));
  assert.equal(intercepted.mock.callCount(), 7);
});

test("Medaa aborts a stalled provider after 30 seconds with a safe timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const intercepted = t.mock.method(globalThis, "fetch", async (...[_url, init]: Parameters<typeof globalThis.fetch>) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error(secretMarker)), { once: true });
  }));
  const generation = medaaProvider.generate(context());
  t.mock.timers.tick(30_000);
  await assert.rejects(generation, errorCode("timeout"));
  assert.equal(intercepted.mock.callCount(), 1);
});

test("Medaa remains explicitly unavailable without a key and never invokes HTTP", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type", "module", "--eval", `
    import assert from "node:assert/strict";
    let called = false;
    globalThis.fetch = async () => { called = true; throw new Error("network disabled"); };
    const { medaaProvider, MedaaProviderError } = await import("@rdm-b2c/api/services/medaa-provider");
    assert.equal(medaaProvider.configured(), false);
    await assert.rejects(medaaProvider.generate({ messages: [], drafts: [], todayDayKey: "2026-09-08", timeZone: "UTC" }),
      (error) => error instanceof MedaaProviderError && error.code === "not_configured");
    assert.equal(called, false);
  `], { env: { ...fixtureEnv, OPENAI_API_KEY: "", PATH: process.env.PATH }, encoding: "utf8", timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
});
