import { z } from "zod";

import { goalCategories, habitCategories, isValidTimeZone } from "./rdm";

export const medaaDraftContentSchema = z.object({
  type: z.enum(["habit", "goal"]),
  title: z.string().trim().min(3).max(80),
  category: z.enum(goalCategories),
  target: z.string().trim().min(2).max(120),
  pledge: z.string().trim().min(8).max(500).nullable(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  durationDays: z.number().int().min(1).max(3_650).nullable(),
}).strict().superRefine((draft, ctx) => {
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

export type MedaaConversation = {
  id: string;
  title: string;
  timeZone: string;
  messages: MedaaMessage[];
  drafts: MedaaDraft[];
  pendingRequestId: string | null;
  failedRequestId: string | null;
  failureMessage: string | null;
};

export type MedaaGenerationContext = {
  messages: Array<Pick<MedaaMessage, "role" | "text">>;
  drafts: MedaaDraft[];
  todayDayKey: string;
  timeZone: string;
};

/** External model boundary. Production never substitutes fixture responses. */
export interface MedaaProvider {
  configured(): boolean;
  generate(context: MedaaGenerationContext): Promise<MedaaResponse>;
}
