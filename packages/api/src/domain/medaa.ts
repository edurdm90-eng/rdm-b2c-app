import { z } from "zod";

import { goalCategories, habitCategories, isValidTimeZone } from "./rdm";

export const MEDAA_DEFAULT_COMMITMENT_DAYS = 45;
export const MEDAA_MAX_COMMITMENT_DAYS = 90;

function containsApiKey(value: string) {
  return /sk-[A-Za-z0-9_-]{20,}/u.test(value);
}

export const medaaDraftContentSchema = z.object({
  type: z.enum(["habit", "goal"]),
  title: z.string().trim().min(3).max(80),
  category: z.enum(goalCategories),
  target: z.string().trim().min(2).max(120),
  pledge: z.string().trim().min(8).max(500).nullable(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  durationDays: z.number().int().min(1).max(3_650).nullable(),
  why: z.string().trim().min(1).max(500).optional(),
  steps: z.array(z.string().trim().min(1).max(200)).min(1).max(5).optional(),
  reflectionPrompt: z.string().trim().min(1).max(240).optional(),
}).strict().superRefine((draft, ctx) => {
  if ([draft.title, draft.target, draft.pledge ?? "", draft.why ?? "", ...(draft.steps ?? []), draft.reflectionPrompt ?? ""].some(containsApiKey)) {
    ctx.addIssue({ code: "custom", message: "Do not include API keys in your plan." });
  }
  if (new Set(draft.weekdays).size !== draft.weekdays.length) {
    ctx.addIssue({ code: "custom", message: "Choose each weekday once", path: ["weekdays"] });
  }
  if (draft.type === "habit" && !habitCategories.some((category) => category === draft.category)) {
    ctx.addIssue({ code: "custom", message: "Choose a supported habit category", path: ["category"] });
  }
  if (draft.type === "habit" && draft.durationDays !== null && draft.durationDays > 365) {
    ctx.addIssue({ code: "custom", message: "A habit commitment cannot exceed 365 calendar days", path: ["durationDays"] });
  }
});

export type MedaaDraftContent = z.infer<typeof medaaDraftContentSchema>;

/** New suggestions are short commitments; stored/frozen legacy drafts stay readable. */
export function isMedaaShortCommitment(content: MedaaDraftContent) {
  return content.durationDays !== null && content.durationDays >= 1
    && content.durationDays <= MEDAA_MAX_COMMITMENT_DAYS;
}

export const medaaResponseSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  suggestions: z.array(z.object({
    replaceDraftId: z.string().uuid().nullable(),
    content: medaaDraftContentSchema,
  }).strict()).max(3),
}).strict();

export type MedaaResponse = z.infer<typeof medaaResponseSchema>;

export const medaaTimeZoneSchema = z.string().trim().min(1).max(80)
  .refine(isValidTimeZone, "Invalid time zone");

export const medaaPrepareSchema = z.object({
  conversationId: z.string().regex(/^[a-f\d]{24}$/i),
  draftId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  content: medaaDraftContentSchema,
  startDayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: medaaTimeZoneSchema,
  pledgeAmount: z.number().int().min(1).max(100_000),
});

export type MedaaPrepareInput = z.infer<typeof medaaPrepareSchema>;

export type MedaaReview = {
  /** Missing on legacy frozen approvals: never reinterpret their whole-goal pledge. */
  fundingMode?: "daily" | "outcome";
  id: string;
  startDayKey: string;
  endDayKey: string;
  timeZone: string;
  pledgeAmount: number;
  scheduledDays: number;
  totalPledge: number;
};

export type MedaaDraft = {
  id: string;
  dailyPledgeRdm?: number;
  origin: "ai" | "manual";
  content: MedaaDraftContent;
  version: number;
  status: "draft" | "setting" | "created";
  review: MedaaReview | null;
  entityId: string | null;
};

export type MedaaMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export const medaaJourneyStages = ["horizon", "long-term", "short-term", "goals", "habits", "plan", "next"] as const;
export type MedaaJourneyStage = typeof medaaJourneyStages[number];

export const medaaAiActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("suggest-goals") }).strict(),
  z.object({ kind: z.literal("suggest-habits") }).strict(),
  z.object({ kind: z.literal("refine"), draftId: z.string().uuid(),
    direction: z.enum(["simpler", "more-specific", "less-time"]) }).strict(),
]);
export type MedaaAiAction = z.infer<typeof medaaAiActionSchema>;

/** One semantic contract for the transport adapter and the authenticated API. */
export function medaaActionResponseSchema(action: MedaaAiAction, drafts: ReadonlyArray<Pick<MedaaDraft, "id" | "content" | "status">>, budget?: MedaaBudget) {
  return medaaResponseSchema.superRefine((result, ctx) => {
    if (result.suggestions.length === 0) return;
    const invalid = () => ctx.addIssue({ code: "custom", message: "Suggestions do not match the requested journey action." });
    if (action.kind === "suggest-habits" || result.suggestions.some(({ content }) => !isMedaaShortCommitment(content)
      || content.type !== "goal" || content.weekdays.length !== 0 || content.pledge !== null
      || !content.why || !content.steps?.length || !content.reflectionPrompt
      || (budget && (content.durationDays ?? 0) > budget.maxAffordableDays))) invalid();
    if (action.kind === "refine") {
      const original = drafts.find((draft) => draft.id === action.draftId);
      const suggestion = result.suggestions[0];
      if (result.suggestions.length !== 1 || original?.status !== "draft"
        || suggestion?.replaceDraftId !== action.draftId || suggestion.content.type !== original.content.type) invalid();
      return;
    }
    const titles = result.suggestions.map((suggestion) => suggestion.content.title.toLocaleLowerCase());
    if (new Set(titles).size !== titles.length
      || result.suggestions.some(({ replaceDraftId, content }) => replaceDraftId !== null || content.type !== "goal")) invalid();
  });
}

export type MedaaJourney = {
  horizonYears: 1 | 2 | 3 | null;
  longTermGoal: string;
  category: typeof goalCategories[number] | null;
  stage: MedaaJourneyStage;
  selectedGoalIds: string[];
  goalSuggestionIds: string[];
  habitSuggestionIds: string[];
  goalSuggestionsReady: boolean;
  habitSuggestionsReady: boolean;
  generations: number;
};

export type MedaaAiRequest = { requestId: string; action: MedaaAiAction; regenerate: boolean; dailyPledgeRdm?: number };

export const medaaLongTermGoalSchema = z.string().trim().min(12, "Describe a meaningful long-term outcome (at least 12 characters).")
  .max(300).refine((value) => !containsApiKey(value), "Do not include API keys.")
  .refine((value) => !/^(?:(?:hey|hi|hello)[,!. ]*)?(?:(?:i(?:'m| am)?|im)\s+)?(?:feeling\s+)?(?:bored?|lonely|sad|happy)[.! ]*$/iu.test(value),
    "Describe what you want to achieve, such as building a skill or improving your fitness.");

export const MEDAA_JOURNEY_GENERATION_LIMIT = 12;
export const MEDAA_PLAN_ITEM_LIMIT = 2;

export function medaaGoalSelectionLimit(selectedGoalIds: readonly string[], drafts: ReadonlyArray<Pick<MedaaDraft, "id" | "status">>) {
  return Math.max(MEDAA_PLAN_ITEM_LIMIT, drafts.filter((draft) =>
    selectedGoalIds.includes(draft.id) && draft.status !== "draft").length);
}

export const medaaGoalExamples = [
  { title: "Build a sustainable business", category: "Money" },
  { title: "Develop a consistent fitness routine", category: "Health" },
  { title: "Become confident in a new professional skill", category: "Focus" },
  { title: "Build a stronger connection with my family", category: "Family" },
] as const;

export type MedaaConversation = {
  id: string;
  title: string;
  timeZone: string;
  messages: MedaaMessage[];
  drafts: MedaaDraft[];
  pendingRequestId: string | null;
  failedRequestId: string | null;
  failureMessage: string | null;
  journey: MedaaJourney | null;
  lastRequest: MedaaAiRequest | null;
  revision: number;
};

export type MedaaGenerationContext = {
  messages: Array<Pick<MedaaMessage, "role" | "text">>;
  drafts: MedaaDraft[];
  todayDayKey: string;
  timeZone: string;
  journey?: { horizonYears: 1 | 2 | 3; longTermGoal: string; category: typeof goalCategories[number] };
  action?: MedaaAiAction;
  budget: MedaaBudget;
};

export type MedaaBudget = {
  remainingBaseRdm: number;
  dailyPledgeRdm: number;
  maxAffordableDays: number;
};

export function medaaBudgetFor(remainingBaseRdm: number, dailyPledgeRdm = 1): MedaaBudget {
  const remaining = Math.max(0, Math.floor(remainingBaseRdm));
  return { remainingBaseRdm: remaining, dailyPledgeRdm,
    maxAffordableDays: Math.min(MEDAA_MAX_COMMITMENT_DAYS, Math.floor(remaining / dailyPledgeRdm)) };
}

/** External model boundary. Production never substitutes fixture responses. */
export interface MedaaProvider {
  configured(): boolean;
  generate(context: MedaaGenerationContext): Promise<MedaaResponse>;
}
