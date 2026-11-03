import assert from "node:assert/strict";
import test from "node:test";

import { resolveRevenueCatPublicApiKey } from "./revenuecat-api-key";

test("release builds ignore RevenueCat Test Store keys so the app does not force-close", () => {
  assert.equal(resolveRevenueCatPublicApiKey("test_abc", { isDev: false }), undefined);
  assert.equal(resolveRevenueCatPublicApiKey("goog_live", { isDev: false }), "goog_live");
  assert.equal(resolveRevenueCatPublicApiKey("appl_live", { isDev: false }), "appl_live");
});

test("dev builds may use Test Store keys", () => {
  assert.equal(resolveRevenueCatPublicApiKey("test_abc", { isDev: true }), "test_abc");
  assert.equal(resolveRevenueCatPublicApiKey(undefined, { isDev: true }), undefined);
});
