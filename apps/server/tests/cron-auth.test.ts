import assert from "node:assert/strict";
import test from "node:test";

import { cronAuthorizationStatus } from "../src/cron-auth";

test("settlement cron authorization fails closed and accepts only its bearer secret", () => {
  const secret = "a".repeat(32);

  assert.equal(cronAuthorizationStatus(undefined, undefined), 503);
  assert.equal(cronAuthorizationStatus(undefined, secret), 401);
  assert.equal(cronAuthorizationStatus("Bearer wrong", secret), 401);
  assert.equal(cronAuthorizationStatus(`Bearer ${secret}`, secret), 200);
});
