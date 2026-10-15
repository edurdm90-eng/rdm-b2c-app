import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@rdm-b2c/api/context";
import { appRouter } from "@rdm-b2c/api/routers/index";
import {
  reconcileCommitmentsBatch,
  reconcileDueGroupGoalsBatch,
} from "@rdm-b2c/api/routers/rdm";
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
  let commitmentCursor: string | undefined;
  let groupCursor: string | undefined;
  let commitmentsComplete = false;
  let groupsComplete = false;
  let commitmentFailed = 0;
  let commitmentProcessed = 0;
  let groupFailed = 0;
  let groupProcessed = 0;

  do {
    if (!commitmentsComplete) {
      const result = await reconcileCommitmentsBatch(commitmentCursor);
      commitmentProcessed += result.processed;
      commitmentFailed += result.failed;
      commitmentCursor = result.nextCursor;
      commitmentsComplete = !commitmentCursor;
    }

    if (!groupsComplete && Date.now() < stopAt) {
      const result = await reconcileDueGroupGoalsBatch(groupCursor);
      groupProcessed += result.processed;
      groupFailed += result.failed;
      groupCursor = result.nextCursor;
      groupsComplete = !groupCursor;
    }
  } while ((!commitmentsComplete || !groupsComplete) && Date.now() < stopAt);

  return c.json({
    complete: commitmentsComplete && groupsComplete,
    failed: commitmentFailed + groupFailed,
    processed: commitmentProcessed + groupProcessed,
    commitments: {
      complete: commitmentsComplete,
      failed: commitmentFailed,
      processed: commitmentProcessed,
    },
    groups: {
      complete: groupsComplete,
      failed: groupFailed,
      processed: groupProcessed,
    },
  });
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
