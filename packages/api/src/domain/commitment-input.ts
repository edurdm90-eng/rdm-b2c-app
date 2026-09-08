import { z } from "zod";

import { goalCategories, habitCategories, isValidTimeZone } from "./rdm";

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(isValidTimeZone, "Invalid time zone");

export const habitCreateInputSchema = z.object({
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
});

export type HabitCreateInput = z.input<typeof habitCreateInputSchema>;
export type GoalCreateInput = z.input<typeof goalCreateInputSchema>;
