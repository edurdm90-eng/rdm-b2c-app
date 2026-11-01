/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  FOCUS_FLOW_COLUMNS,
  FOCUS_FLOW_GAP,
  focusFlowBoardFits,
  focusFlowCellSize,
  focusFlowTargetRingSize,
} from "./focus-flow-layout";

test("focusFlowCellSize reserves two gaps and returns an equal three-column size", () => {
  assert.equal(focusFlowCellSize(320), 101);
  assert.equal(focusFlowCellSize(480), 154);
  assert.equal(focusFlowCellSize(0), 0);
});

test("focusFlowCellSize never overflows the measured board width", () => {
  for (const width of [280, 319, 320, 321, 375, 390, 414, 480, 768]) {
    const cellSize = focusFlowCellSize(width);
    assert.equal(focusFlowBoardFits(width, cellSize), true);
    assert.ok(
      cellSize * FOCUS_FLOW_COLUMNS + FOCUS_FLOW_GAP * (FOCUS_FLOW_COLUMNS - 1) <= width,
      `board of ${width} overflowed with cell ${cellSize}`,
    );
  }
});

test("focusFlowTargetRingSize stays inside the cell", () => {
  assert.equal(focusFlowTargetRingSize(0), 0);
  assert.equal(focusFlowTargetRingSize(50), 36);
  assert.equal(focusFlowTargetRingSize(101), 70);
  assert.ok(focusFlowTargetRingSize(80) < 80);
});
