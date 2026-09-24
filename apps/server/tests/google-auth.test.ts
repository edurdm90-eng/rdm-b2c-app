import assert from "node:assert/strict";
import test from "node:test";

import { googleProviderConfig } from "@rdm-b2c/auth/google";
import { sessionTokenFromCookie } from "../../native/lib/bearer-session";

test("Google OAuth is disabled unless both server credentials are configured", () => {
  assert.equal(googleProviderConfig({}), undefined);
  assert.throws(() => googleProviderConfig({ clientId: "client-id" }), /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);
  assert.throws(() => googleProviderConfig({ clientSecret: "client-secret" }), /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);
});

test("Google OAuth uses the minimum identity scopes and deliberate account selection", () => {
  assert.deepEqual(googleProviderConfig({ clientId: "client-id", clientSecret: "client-secret" }), {
    clientId: "client-id",
    clientSecret: "client-secret",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
  });
});

test("the native client can turn the Better Auth session cookie into its bearer session", () => {
  assert.equal(
    sessionTokenFromCookie("theme=dark; __Secure-better-auth.session_token=signed-token; locale=en"),
    "signed-token",
  );
  assert.equal(sessionTokenFromCookie("better-auth.session_token=plain-token"), "plain-token");
  assert.equal(sessionTokenFromCookie("theme=dark"), null);
});
