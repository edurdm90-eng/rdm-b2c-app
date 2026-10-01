/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { focusFlowCellSize } from "./focus-flow-layout";

test("focusFlowCellSize reserves two gaps and returns an equal three-column size", () => {
  assert.equal(focusFlowCellSize(320), 101);
  assert.equal(focusFlowCellSize(480), 154);
  assert.equal(focusFlowCellSize(0), 0);
});
