import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("the Vercel tRPC function preserves the rewritten /trpc route", () => {
  const source = readFileSync(new URL("../api/trpc/[...path].ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\.slice\("\/api"\.length\)/,
    "Vercel rewrites /trpc/* to this function but retains the original /trpc URL. Removing '/api' changes /trpc into /c and produces a non-JSON 404 response.");
  assert.match(source, /toWebRequest\(request\)/,
    "The Hono app must receive the original /trpc request path.");
});

test("the Vercel deployment exposes the nested Google OAuth callback route", () => {
  const callbackHandler = new URL("../api/auth/callback/[...path].ts", import.meta.url);

  assert.equal(existsSync(callbackHandler), true,
    "Vercel does not reliably route /api/auth/callback/google through the parent auth catch-all. The callback needs its own nested function.");

  const source = readFileSync(callbackHandler, "utf8");
  assert.match(source, /toWebRequest\(request\)/,
    "The Google callback handler must preserve /api/auth/callback/google for Better Auth.");
});

test("the Vercel deployment schedules an authenticated group settlement sweep", () => {
  const cronHandler = new URL("../api/cron/settlements.ts", import.meta.url);
  const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

  assert.equal(existsSync(cronHandler), true, "Serverless deployments need a settlement function instead of the long-running worker.");
  assert.deepEqual(vercelConfig.crons, [{ path: "/api/cron/settlements", schedule: "0 0 * * *" }]);
  const handlerSource = readFileSync(cronHandler, "utf8");
  const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  assert.match(handlerSource, /toWebRequest\(request\)/);
  assert.match(appSource, /env\.CRON_SECRET/);
  assert.match(appSource, /reconcileDueGroupGoalsBatch/);
  assert.match(appSource, /authorization/iu);
});
