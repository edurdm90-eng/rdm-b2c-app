import assert from "node:assert/strict";
import test from "node:test";

import { googleAccountLinkingConfig } from "@rdm-b2c/auth/google";
import { betterAuth } from "better-auth";

const baseURL = "http://localhost:3000";
const callbackURL = "rdm-b2c://login";

type TestAuth = {
  handler(request: Request): Promise<Response>;
};

function createTestAuth(googleEmail: string) {
  return betterAuth({
    account: { accountLinking: googleAccountLinkingConfig() },
    baseURL,
    emailAndPassword: { enabled: true },
    secret: "google-account-linking-integration-test-secret",
    socialProviders: {
      google: {
        clientId: "test-google-client",
        clientSecret: "test-google-secret",
        getUserInfo: async () => ({
          user: {
            id: `google:${googleEmail}`,
            email: googleEmail,
            emailVerified: true,
            name: "Google User",
          },
          data: {},
        }),
      },
    },
    trustedOrigins: [callbackURL],
  });
}

async function authRequest(auth: TestAuth, path: string, init: RequestInit) {
  return auth.handler(new Request(`${baseURL}/api/auth${path}`, init));
}

function responseCookie(response: Response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

async function createLegacyUser(auth: TestAuth, email: string) {
  const response = await authRequest(auth, "/sign-up/email", {
    body: JSON.stringify({ email, name: "Legacy User", password: "legacy-password-123" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 200);
  return responseCookie(response);
}

async function completeGoogleCallback(auth: TestAuth) {
  const start = await authRequest(auth, "/sign-in/social", {
    body: JSON.stringify({ provider: "google", callbackURL }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(start.status, 200);
  const startBody = await start.json() as { url: string };
  const state = new URL(startBody.url).searchParams.get("state");
  assert.ok(state);

  const callback = await authRequest(auth, `/callback/google?state=${encodeURIComponent(state)}&code=test-code`, {
    headers: { cookie: responseCookie(start) },
    method: "GET",
  });
  assert.equal(callback.status, 302);
  return callback;
}

async function linkedProviders(auth: TestAuth, cookie: string) {
  const response = await authRequest(auth, "/list-accounts", {
    headers: { cookie },
    method: "GET",
  });
  assert.equal(response.status, 200);
  const accounts = await response.json() as Array<{ providerId: string }>;
  return accounts.map((account) => account.providerId).sort();
}

async function withMockGoogleTokenResponse(run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: "test-access-token",
    expires_in: 3600,
    token_type: "Bearer",
  }), { headers: { "content-type": "application/json" }, status: 200 });

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("verified Google OAuth links an unverified same-email legacy account", async () => {
  const legacyEmail = "legacy@example.com";
  const auth = createTestAuth(legacyEmail);
  const legacyCookie = await createLegacyUser(auth, legacyEmail);

  await withMockGoogleTokenResponse(async () => {
    const callback = await completeGoogleCallback(auth);
    assert.equal(new URL(callback.headers.get("location") ?? callbackURL).searchParams.get("error"), null);
    assert.deepEqual(await linkedProviders(auth, legacyCookie), ["credential", "google"]);
  });
});

test("Google OAuth with a different email does not claim the legacy account", async () => {
  const legacyEmail = "legacy@example.com";
  const auth = createTestAuth("different@example.com");
  const legacyCookie = await createLegacyUser(auth, legacyEmail);

  await withMockGoogleTokenResponse(async () => {
    await completeGoogleCallback(auth);
    assert.deepEqual(await linkedProviders(auth, legacyCookie), ["credential"]);
  });
});
