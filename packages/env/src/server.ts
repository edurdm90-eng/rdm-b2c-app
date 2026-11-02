import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const server = {
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CORS_ORIGIN: z.url(),
  CRON_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(1).optional(),
  LEGACY_FOCUS_TAP_CUTOFF: z.coerce.date().default(new Date("2026-10-25T00:00:00.000Z")),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_MODEL: z.string().trim().min(1).max(100).default("gpt-5-mini"),
  MEDAA_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(1_000).default(30),
  // Secret REST key only — never EXPO_PUBLIC_*. Required before PREMIUM_FREE_UNTIL for paid users.
  REVENUECAT_SECRET_API_KEY: z.string().trim().min(1).optional(),
  REVENUECAT_ENTITLEMENT_ID: z.string().trim().min(1).default("premium"),
  // Integration tests only (`RDM_TEST_PREMIUM_ACTIVE=1|0`). Ignored outside NODE_ENV=test.
  RDM_TEST_PREMIUM_ACTIVE: z.enum(["0", "1"]).optional(),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
};

export const env = createEnv<undefined, typeof server>({
  server,
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
