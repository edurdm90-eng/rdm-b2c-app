/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { shouldRetryQuery } from "./query-policy";

test("shouldRetryQuery retries one transient network failure", () => {
  assert.equal(shouldRetryQuery(0, new TypeError("Network request failed")), true);
  assert.equal(shouldRetryQuery(1, new TypeError("Network request failed")), false);
});

test("shouldRetryQuery retries transient server and throttling failures", () => {
  assert.equal(shouldRetryQuery(0, { data: { httpStatus: 503 } }), true);
  assert.equal(shouldRetryQuery(0, { shape: { data: { httpStatus: 429 } } }), true);
});

test("shouldRetryQuery does not retry permanent client failures", () => {
  assert.equal(shouldRetryQuery(0, { data: { httpStatus: 401 } }), false);
  assert.equal(shouldRetryQuery(0, { shape: { data: { httpStatus: 404 } } }), false);
});
