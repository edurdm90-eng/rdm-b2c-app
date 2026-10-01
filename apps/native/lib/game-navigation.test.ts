/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { exitToGames } from "./game-navigation";

test("exitToGames replaces the game route with the Games tab", () => {
  const calls: string[] = [];

  exitToGames({
    replace: (href) => calls.push(`replace:${href}`),
  });

  assert.deepEqual(calls, ["replace:/(app)/(tabs)/games"]);
});
