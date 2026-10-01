import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@rdm-b2c/api/context";
import { appRouter } from "@rdm-b2c/api/routers/index";
import { reconcileDueGroupGoalsBatch } from "@rdm-b2c/api/routers/rdm";
import { auth } from "@rdm-b2c/auth";
import { env } from "@rdm-b2c/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { cronAuthorizationStatus } from "./cron-auth";

export const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: (origin) => {
      const allowedOrigins = new Set([
        env.CORS_ORIGIN,
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
      ]);
      return allowedOrigins.has(origin) ? origin : env.CORS_ORIGIN;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["set-cookie", "set-auth-token"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/cron/settlements", async (c) => {
  const authorizationStatus = cronAuthorizationStatus(c.req.header("authorization"), env.CRON_SECRET);
  if (authorizationStatus === 503) return c.json({ error: "Settlement cron is not configured" }, 503);
  if (authorizationStatus === 401) return c.json({ error: "Unauthorized" }, 401);
  const stopAt = Date.now() + 240_000;
  let cursor: string | undefined;
  let failed = 0;
  let processed = 0;
  do {
    const result = await reconcileDueGroupGoalsBatch(cursor);
    processed += result.processed;
    failed += result.failed;
    cursor = result.nextCursor;
  } while (cursor && Date.now() < stopAt);
  return c.json({ complete: !cursor, failed, processed });
});

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});
