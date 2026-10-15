import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_APPLICATION_NAME,
  authBaseURLConfig,
} from "@rdm-b2c/auth/branding";
import { googleAccountLinkingConfig, googleProviderConfig } from "@rdm-b2c/auth/google";
import { sessionTokenFromCookie } from "../../native/lib/bearer-session";

test("auth presents the RDM product identity", () => {
  assert.equal(AUTH_APPLICATION_NAME, "RDM");
});

test("production OAuth callbacks stay on the branded public domain", () => {
  assert.equal(
    authBaseURLConfig("https://rdm-b2c-app-xi.vercel.app", "production"),
    "https://www.rdmtoken.org",
  );
});

test("local auth keeps the configured development origin", () => {
  assert.equal(
    authBaseURLConfig("http://localhost:3000", "development"),
    "http://localhost:3000",
  );
});

test("Google OAuth is disabled unless both server credentials are configured", () => {
  assert.equal(googleProviderConfig({}), undefined);
  assert.throws(() => googleProviderConfig({ clientId: "client-id" }), /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);
  assert.throws(() => googleProviderConfig({ clientSecret: "client-secret" }), /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);
});

test("Google OAuth credentials are mandatory for a runnable Google-only auth server", () => {
  assert.throws(
    () => googleProviderConfig({}, { required: true }),
    /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required/,
  );
});

test("Google OAuth uses the minimum identity scopes and deliberate account selection", () => {
  assert.deepEqual(googleProviderConfig({ clientId: "client-id", clientSecret: "client-secret" }), {
    clientId: "client-id",
    clientSecret: "client-secret",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
  });
});

test("Google OAuth can safely link matching legacy credential accounts", () => {
  assert.deepEqual(googleAccountLinkingConfig(), {
    enabled: true,
    trustedProviders: ["google"],
    requireLocalEmailVerified: false,
    allowDifferentEmails: false,
    updateUserInfoOnLink: false,
  });
});

test("the native client can turn the Better Auth session cookie into its bearer session", () => {
  assert.equal(
    sessionTokenFromCookie("theme=dark; __Secure-better-auth.session_token=signed-token; locale=en"),
    "signed-token",
  );
  assert.equal(
    sessionTokenFromCookie("theme=dark; Path=/, __Secure-better-auth.session_token=callback-token; Path=/; HttpOnly"),
    "callback-token",
  );
  assert.equal(sessionTokenFromCookie("better-auth.session_token=plain-token"), "plain-token");
  assert.equal(sessionTokenFromCookie("theme=dark"), null);
});
