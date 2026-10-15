import assert from "node:assert/strict";
import test from "node:test";

import {
  advancePersistedSettlementSweep,
  nextSettlementFailureState,
} from "../src/settlement-progress";

test("a timed-out settlement sweep resumes from its durable cursor", async () => {
  let persistedCursor: string | undefined;
  const visited: Array<string | undefined> = [];
  const batches = new Map<string | undefined, string | undefined>([
    [undefined, "profile-50"],
    ["profile-50", undefined],
  ]);
  const dependencies = {
    loadCursor: async () => persistedCursor,
    saveCursor: async (_name: string, cursor: string | undefined) => {
      persistedCursor = cursor;
    },
    runBatch: async (cursor: string | undefined) => {
      visited.push(cursor);
      return { failed: 0, nextCursor: batches.get(cursor), processed: 50 };
    },
  };

  const firstInvocation = await advancePersistedSettlementSweep("commitments", dependencies);
  assert.equal(firstInvocation.complete, false);
  assert.equal(persistedCursor, "profile-50");

  const nextInvocation = await advancePersistedSettlementSweep("commitments", dependencies);
  assert.equal(nextInvocation.complete, true);
  assert.equal(persistedCursor, undefined);
  assert.deepEqual(visited, [undefined, "profile-50"]);
});

test("a failed batch never advances its durable cursor", async () => {
  let saved = false;

  await assert.rejects(
    advancePersistedSettlementSweep("groups", {
      loadCursor: async () => "group-100",
      saveCursor: async () => {
        saved = true;
      },
      runBatch: async () => {
        throw new Error("database unavailable");
      },
    }),
    /database unavailable/,
  );
  assert.equal(saved, false);
});

test("a cursor is not advanced unless failed-record persistence succeeds", async () => {
  let saved = false;

  await assert.rejects(
    advancePersistedSettlementSweep("groups", {
      beforeAdvance: async () => {
        throw new Error("retry queue unavailable");
      },
      loadCursor: async () => "group-100",
      saveCursor: async () => {
        saved = true;
      },
      runBatch: async () => ({
        failed: 1,
        failedIds: ["broken-group"],
        nextCursor: "group-200",
        processed: 100,
      }),
    }),
    /retry queue unavailable/,
  );
  assert.equal(saved, false);
});

test("an individually failed settlement advances the scan and exposes a retry id", async () => {
  let persistedCursor: string | undefined = "profile-50";

  const result = await advancePersistedSettlementSweep("commitments", {
    loadCursor: async () => persistedCursor,
    saveCursor: async (_name, cursor) => {
      persistedCursor = cursor;
    },
    runBatch: async () => ({
      failed: 1,
      failedIds: ["broken-profile"],
      nextCursor: "profile-100",
      processed: 50,
    }),
  });

  assert.equal(result.complete, false);
  assert.deepEqual(result.failedIds, ["broken-profile"]);
  assert.equal(result.nextCursor, "profile-100");
  assert.equal(persistedCursor, "profile-100");
});

test("settlement failures are quarantined after bounded retries", () => {
  assert.deepEqual(nextSettlementFailureState(0), { attempts: 1, status: "pending" });
  assert.deepEqual(nextSettlementFailureState(4), { attempts: 5, status: "quarantined" });
});
