/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithTimeout } from "./network";

test("fetchWithTimeout aborts a request that exceeds its deadline", async () => {
  let observedSignal: AbortSignal | undefined;
  const neverFinishes: typeof fetch = (_input, init) => {
    observedSignal = init?.signal ?? undefined;
    return new Promise((_resolve, reject) => {
      observedSignal?.addEventListener("abort", () => reject(observedSignal?.reason), { once: true });
    });
  };

  await assert.rejects(
    fetchWithTimeout("https://example.com", {}, 5, neverFinishes),
    /timed out/i,
  );
  assert.equal(observedSignal?.aborted, true);
});

test("fetchWithTimeout keeps the caller's cancellation signal", async () => {
  const caller = new AbortController();
  let observedSignal: AbortSignal | undefined;
  const neverFinishes: typeof fetch = (_input, init) => {
    observedSignal = init?.signal ?? undefined;
    return new Promise((_resolve, reject) => {
      observedSignal?.addEventListener("abort", () => reject(observedSignal?.reason), { once: true });
    });
  };

  const request = fetchWithTimeout(
    "https://example.com",
    { signal: caller.signal },
    1_000,
    neverFinishes,
  );
  caller.abort(new Error("cancelled by caller"));

  await assert.rejects(request, /cancelled by caller/i);
  assert.equal(observedSignal?.aborted, true);
});

test("fetchWithTimeout returns successful responses unchanged", async () => {
  const expected = new Response("OK", { status: 200 });
  const response = await fetchWithTimeout(
    "https://example.com",
    {},
    1_000,
    async () => expected,
  );

  assert.equal(response, expected);
});
