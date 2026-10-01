/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { confirmationSheetHeight } from "./habit-confirmation-layout";

test("confirmationSheetHeight stays visible on compact Android screens and bounded on tall screens", () => {
  assert.equal(confirmationSheetHeight(480), 393);
  assert.equal(confirmationSheetHeight(700), 574);
  assert.equal(confirmationSheetHeight(960), 640);
});
