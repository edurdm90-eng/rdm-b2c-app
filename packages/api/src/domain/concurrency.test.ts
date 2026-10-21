import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { mapWithConcurrency } from "./concurrency";

test("mapWithConcurrency preserves order while respecting its work limit", async () => {
  let active = 0;
  let maximumActive = 0;

  const result = await mapWithConcurrency([4, 1, 3, 2], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await delay(value);
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(result, [40, 10, 30, 20]);
  assert.equal(maximumActive, 2);
});

test("mapWithConcurrency handles empty work without starting a worker", async () => {
  let called = false;
  const result = await mapWithConcurrency([], 3, async () => {
    called = true;
  });

  assert.deepEqual(result, []);
  assert.equal(called, false);
});
