import assert from "node:assert/strict";
import test from "node:test";

import { groupLoginReturnParams, postLoginDestination } from "../../native/lib/auth-return";

test("a group invite survives the login redirect with its normalized code", () => {
  const params = groupLoginReturnParams("/group/new", { code: "fam7qx", mode: "join" });
  assert.deepEqual(postLoginDestination(params), {
    pathname: "/(app)/group/new",
    params: { mode: "join", code: "FAM7QX" },
  });
});

test("existing group destinations keep only the validated group id", () => {
  const id = "507f1f77bcf86cd799439011";
  for (const suffix of ["", "/invite", "/winners", "/result"]) {
    const params = groupLoginReturnParams(`/(app)/group/${id}${suffix}`, { next: "https://outside.test" });
    assert.deepEqual(postLoginDestination(params), {
      pathname: `/(app)/group/[id]${suffix}`,
      params: { id },
    });
  }
});

test("login destinations reject URLs, unknown routes, duplicate params, and malformed ids", () => {
  for (const returnTo of ["https://outside.test", "//outside.test", "/wallet", "__proto__", ["group"]]) {
    assert.deepEqual(postLoginDestination({ returnTo, groupId: "507f1f77bcf86cd799439011" }), {
      pathname: "/(app)/(tabs)",
    });
  }
  assert.deepEqual(postLoginDestination({ returnTo: "group", groupId: "../wallet" }), { pathname: "/(app)/(tabs)" });
  assert.deepEqual(groupLoginReturnParams("//outside.test/group/new", { code: "FAM7QX" }), {});
  assert.deepEqual(postLoginDestination({ returnTo: "group-join", code: ["FAM7QX", "ABC123"] }), {
    pathname: "/(app)/group/new", params: { mode: "join" },
  });
});
