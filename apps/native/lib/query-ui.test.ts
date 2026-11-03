import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowInitialQueryLoader } from "./query-ui";

test("initial loader shows only when pending without data", () => {
  assert.equal(shouldShowInitialQueryLoader(false, true), true);
  assert.equal(shouldShowInitialQueryLoader(true, true), false);
  assert.equal(shouldShowInitialQueryLoader(false, false), false);
  assert.equal(shouldShowInitialQueryLoader(true, false), false);
});
