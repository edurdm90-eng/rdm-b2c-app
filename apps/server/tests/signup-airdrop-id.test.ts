import assert from "node:assert/strict";
import test from "node:test";

import { signupAirdropUserFilter } from "@rdm-b2c/auth/signup-airdrop-id";

test("signup airdrops find hex-shaped string user ids without changing their type", () => {
  const userId = "68c9d6d4a4f1e6b5836d49a6";
  const filter = signupAirdropUserFilter(userId);

  assert.equal(filter.signupAirdropEligible, true);
  assert.ok(filter._id.$in.includes(userId),
    "Better Auth stores the user id as a string even when its value looks like an ObjectId.");
});
