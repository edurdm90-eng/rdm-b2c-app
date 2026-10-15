import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalAuthRedirect } from "../src/auth-origin";

test("production auth starts on the branded host before OAuth state is created", () => {
  const redirect = canonicalAuthRedirect(
    new Request("https://rdm-b2c-app-xi.vercel.app/api/auth/sign-in/social?returnTo=home", {
      method: "POST",
    }),
    "production",
  );

  assert.equal(redirect?.status, 308);
  assert.equal(
    redirect?.headers.get("location"),
    "https://www.rdmtoken.org/api/auth/sign-in/social?returnTo=home",
  );
});

test("canonical production and local development auth requests are not redirected", () => {
  assert.equal(
    canonicalAuthRedirect(
      new Request("https://www.rdmtoken.org/api/auth/sign-in/social", { method: "POST" }),
      "production",
    ),
    null,
  );
  assert.equal(
    canonicalAuthRedirect(
      new Request("http://localhost:3000/api/auth/sign-in/social", { method: "POST" }),
      "development",
    ),
    null,
  );
});

test("CORS handles browser preflights before auth host canonicalization", () => {
  const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const corsMiddleware = source.indexOf("cors({");
  const canonicalMiddleware = source.indexOf('app.use("/api/auth/*"');

  assert.notEqual(corsMiddleware, -1);
  assert.notEqual(canonicalMiddleware, -1);
  assert.ok(corsMiddleware < canonicalMiddleware);
  assert.match(source, /PRODUCTION_AUTH_ORIGIN/);
});
