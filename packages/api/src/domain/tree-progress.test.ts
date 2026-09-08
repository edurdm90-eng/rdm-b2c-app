import assert from "node:assert/strict";
import test from "node:test";

import { treeCareProgress, availableTreePenalty } from "./tree-progress";

test("tree growth starts empty and counts actual fertilizer, water and sunlight", () => {
  assert.deepEqual(treeCareProgress([], "2026-09-08"), {
    fertilizerCount: 0, waterCount: 0, sunlightCount: 0, streak: 0,
  });
  assert.deepEqual(treeCareProgress([
    { kind: "fertilizer", dayKey: "2026-09-07" },
    { kind: "water", dayKey: "2026-09-07" },
    { kind: "sunlight", dayKey: "2026-09-08" },
  ], "2026-09-08"), {
    fertilizerCount: 1, waterCount: 1, sunlightCount: 1, streak: 2,
  });
});

test("care streak survives today's unfinished day but resets after a missed day", () => {
  const care = [
    { kind: "water", dayKey: "2026-09-06" },
    { kind: "fertilizer", dayKey: "2026-09-07" },
  ];
  assert.equal(treeCareProgress(care, "2026-09-08").streak, 2);
  assert.equal(treeCareProgress(care, "2026-09-09").streak, 0);
  assert.equal(treeCareProgress([...care, { kind: "water", dayKey: "2026-09-09" }], "2026-09-09").streak, 1);
});

test("a missed tree day transfers available Reward RDM without overdrawing or blocking care", () => {
  assert.deepEqual(availableTreePenalty(4, 2, 10), { appliedAmount: 4, rewardBalance: 0, remorseBalance: 6 });
  assert.deepEqual(availableTreePenalty(0, 2, 10), { appliedAmount: 0, rewardBalance: 0, remorseBalance: 2 });
  assert.deepEqual(availableTreePenalty(15, 2, 10), { appliedAmount: 10, rewardBalance: 5, remorseBalance: 12 });
});
