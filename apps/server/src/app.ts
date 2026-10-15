import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@rdm-b2c/api/context";
import { appRouter } from "@rdm-b2c/api/routers/index";
import {
  reconcileCommitmentById,
  reconcileCommitmentsBatch,
  reconcileDueGroupGoalById,
  reconcileDueGroupGoalsBatch,
} from "@rdm-b2c/api/routers/rdm";
import { auth } from "@rdm-b2c/auth";
import { PRODUCTION_AUTH_ORIGIN } from "@rdm-b2c/auth/branding";
import { client } from "@rdm-b2c/db";
import { env } from "@rdm-b2c/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { canonicalAuthRedirect } from "./auth-origin";
import { cronAuthorizationStatus } from "./cron-auth";
import {
  advancePersistedSettlementSweep,
  nextSettlementFailureState,
} from "./settlement-progress";

type SettlementCheckpoint = {
  _id: string;
  cursor?: string;
  updatedAt: Date;
};

type SettlementKind = "commitments" | "groups";

type SettlementFailure = {
  _id: string;
  attempts: number;
  createdAt: Date;
  kind: SettlementKind;
  recordId: string;
  status: "pending" | "quarantined";
  updatedAt: Date;
};

const settlementCheckpoints = client.collection<SettlementCheckpoint>("settlementCheckpoints");
const settlementFailures = client.collection<SettlementFailure>("settlementFailures");

async function loadSettlementCursor(name: string) {
  return (await settlementCheckpoints.findOne({ _id: name }))?.cursor;
}

async function saveSettlementCursor(name: string, cursor?: string) {
  await settlementCheckpoints.updateOne(
    { _id: name },
    cursor
      ? { $set: { cursor, updatedAt: new Date() } }
      : { $set: { updatedAt: new Date() }, $unset: { cursor: "" } },
    { upsert: true },
  );
}

async function syncSettlementFailures(
  kind: SettlementKind,
  recordIds: string[] = [],
  failedIds: string[] = [],
) {
  const failed = new Set(failedIds);
  const succeededIds = recordIds.filter((recordId) => !failed.has(recordId));
  if (succeededIds.length > 0) {
    await settlementFailures.deleteMany({
      _id: { $in: succeededIds.map((recordId) => `${kind}:${recordId}`) },
    });
  }
  if (failedIds.length === 0) return;

  const now = new Date();
  await Promise.all(failedIds.map((recordId) => settlementFailures.updateOne(
    { _id: `${kind}:${recordId}` },
    {
      $set: { updatedAt: now },
      $setOnInsert: {
        attempts: 0,
        createdAt: now,
        kind,
        recordId,
        status: "pending",
      },
    },
    { upsert: true },
  )));
}

async function retrySettlementFailures(
  kind: SettlementKind,
  reconcileRecord: (recordId: string) => Promise<void>,
  stopAt: number,
) {
  const queued = await settlementFailures.find({ kind, status: "pending" })
    .sort({ updatedAt: 1 }).limit(25).toArray();
  let failed = 0;
  let quarantined = 0;
  let resolved = 0;

  for (const failure of queued) {
    if (Date.now() >= stopAt) break;
    try {
      await reconcileRecord(failure.recordId);
      await settlementFailures.deleteOne({ _id: failure._id });
      resolved += 1;
    } catch (error) {
      failed += 1;
      const next = nextSettlementFailureState(failure.attempts);
      await settlementFailures.updateOne(
        { _id: failure._id },
        { $set: { ...next, updatedAt: new Date() } },
      );
      if (next.status === "quarantined") {
        quarantined += 1;
        console.error("Settlement record quarantined after repeated failures", {
          kind,
          message: error instanceof Error ? error.message : "Unknown settlement failure",
          recordId: failure.recordId,
        });
      }
    }
  }

  return { failed, quarantined, resolved };
}

export const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: (origin) => {
      const allowedOrigins = new Set([
        env.CORS_ORIGIN,
        PRODUCTION_AUTH_ORIGIN,
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
app.use("/api/auth/*", async (c, next) => {
  const redirect = canonicalAuthRedirect(c.req.raw, env.NODE_ENV);
  if (redirect) return redirect;
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/cron/settlements", async (c) => {
  const authorizationStatus = cronAuthorizationStatus(c.req.header("authorization"), env.CRON_SECRET);
  if (authorizationStatus === 503) return c.json({ error: "Settlement cron is not configured" }, 503);
  if (authorizationStatus === 401) return c.json({ error: "Unauthorized" }, 401);
  const stopAt = Date.now() + 240_000;
  const commitmentRetries = await retrySettlementFailures(
    "commitments",
    reconcileCommitmentById,
    stopAt,
  );
  const groupRetries = Date.now() < stopAt
    ? await retrySettlementFailures("groups", reconcileDueGroupGoalById, stopAt)
    : { failed: 0, quarantined: 0, resolved: 0 };
  let commitmentsComplete = false;
  let groupsComplete = false;
  let commitmentFailed = 0;
  let commitmentProcessed = 0;
  let groupFailed = 0;
  let groupProcessed = 0;

  while ((!commitmentsComplete || !groupsComplete) && Date.now() < stopAt) {
    if (!commitmentsComplete) {
      const result = await advancePersistedSettlementSweep("commitments", {
        beforeAdvance: (batch) => syncSettlementFailures(
          "commitments",
          batch.recordIds,
          batch.failedIds,
        ),
        loadCursor: loadSettlementCursor,
        runBatch: reconcileCommitmentsBatch,
        saveCursor: saveSettlementCursor,
      });
      commitmentProcessed += result.processed;
      commitmentFailed += result.failed;
      commitmentsComplete = result.complete;
    }

    if (!groupsComplete && Date.now() < stopAt) {
      const result = await advancePersistedSettlementSweep("groups", {
        beforeAdvance: (batch) => syncSettlementFailures(
          "groups",
          batch.recordIds,
          batch.failedIds,
        ),
        loadCursor: loadSettlementCursor,
        runBatch: reconcileDueGroupGoalsBatch,
        saveCursor: saveSettlementCursor,
      });
      groupProcessed += result.processed;
      groupFailed += result.failed;
      groupsComplete = result.complete;
    }
  }

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
    retries: {
      commitments: commitmentRetries,
      groups: groupRetries,
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
