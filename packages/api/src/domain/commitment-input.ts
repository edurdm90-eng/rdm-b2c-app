import { z } from "zod";

import { goalCategories, habitCategories, isValidTimeZone } from "./rdm";
import { HARA_HACHI_BU } from "./wisdom";

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(isValidTimeZone, "Invalid time zone");

export const habitCreateInputSchema = z.object({
  wisdomPracticeId: z.literal(HARA_HACHI_BU.id).optional(),
  title: z.string().trim().min(2).max(80),
  category: z.enum(habitCategories),
  icon: z.string().min(1).default("target"),
  cadence: z.string().trim().min(2).max(40),
  target: z.string().trim().min(2).max(120),
  pledge: z.string().trim().min(8).max(500),
  creationId: z.string().uuid(),
  rdmPledgePerDay: z.number().int().min(1).max(100_000),
  rdmPledgeWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
    .refine((days) => new Set(days).size === days.length, "Choose each weekday once")
    .default([1, 2, 3, 4, 5, 6, 7]),
  rdmPledgeStartDayKey: dayKeySchema,
  rdmPledgeEndDayKey: dayKeySchema,
  timeZone: timeZoneSchema,
  source: z.enum(["template", "custom"]),
}).superRefine((input, context) => {
  if (!input.wisdomPracticeId) return;
  for (const field of ["title", "category", "icon", "cadence", "target", "pledge"] as const) {
    if (input[field] !== HARA_HACHI_BU[field]) {
      context.addIssue({ code: "custom", path: [field], message: "Use the confirmed Hara Hachi Bu practice terms." });
    }
  }
  if (input.source !== "template") {
    context.addIssue({ code: "custom", path: ["source"], message: "Hara Hachi Bu uses the Japanese Wisdom practice template." });
  }
  if (input.rdmPledgeWeekdays.length !== HARA_HACHI_BU.weekdays.length) {
    context.addIssue({ code: "custom", path: ["rdmPledgeWeekdays"], message: "Hara Hachi Bu requires a daily commitment." });
  }
});

export const goalCreateInputSchema = z.object({
  creationId: z.string().uuid(),
  title: z.string().trim().min(3).max(80),
  category: z.enum(goalCategories),
  target: z.string().trim().min(2).max(120),
  durationDays: z.number().int().min(1).max(3_650),
  startDayKey: dayKeySchema,
  timeZone: timeZoneSchema,
  pledgeAmount: z.number().int().min(1).max(100_000),
  rdmPledgePerDay: z.number().int().min(1).max(100_000).optional(),
  why: z.string().trim().min(1).max(500).optional(),
  steps: z.array(z.string().trim().min(1).max(200)).min(1).max(5).optional(),
  reflectionPrompt: z.string().trim().min(1).max(240).optional(),
}).superRefine((input, context) => {
  if (input.rdmPledgePerDay === undefined) return;
  if (input.durationDays > 90) {
    context.addIssue({ code: "custom", path: ["durationDays"], message: "Daily goals can last at most 90 days." });
  }
  if (input.pledgeAmount !== input.durationDays * input.rdmPledgePerDay) {
    context.addIssue({ code: "custom", path: ["pledgeAmount"], message: "The total pledge must equal daily RDM multiplied by commitment days." });
  }
});

export type HabitCreateInput = z.input<typeof habitCreateInputSchema>;
export type GoalCreateInput = z.input<typeof goalCreateInputSchema>;
