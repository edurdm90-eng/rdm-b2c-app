/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { preparePostLoginSession } from "./session-transition";

test("preparePostLoginSession verifies authentication before refreshing native session state", async () => {
  const events: string[] = [];
  const ready = await preparePostLoginSession({
    isNative: true,
    verifySession: async () => {
      events.push("verified");
      return true;
    },
    refreshSession: async () => {
      events.push("refreshed");
    },
  });

  assert.equal(ready, true);
  assert.deepEqual(events, ["verified", "refreshed"]);
});

test("preparePostLoginSession does not refresh an unauthenticated session", async () => {
  let refreshed = false;
  const ready = await preparePostLoginSession({
    isNative: true,
    verifySession: async () => false,
    refreshSession: async () => {
      refreshed = true;
    },
  });

  assert.equal(ready, false);
  assert.equal(refreshed, false);
});

test("preparePostLoginSession preserves the existing web session flow", async () => {
  let refreshed = false;
  const ready = await preparePostLoginSession({
    isNative: false,
    verifySession: async () => true,
    refreshSession: async () => {
      refreshed = true;
    },
  });

  assert.equal(ready, true);
  assert.equal(refreshed, false);
});
