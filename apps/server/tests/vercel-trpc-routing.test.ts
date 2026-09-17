import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the Vercel tRPC function preserves the rewritten /trpc route", () => {
  const source = readFileSync(new URL("../api/trpc/[...path].ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\.slice\("\/api"\.length\)/,
    "Vercel rewrites /trpc/* to this function but retains the original /trpc URL. Removing '/api' changes /trpc into /c and produces a non-JSON 404 response.");
  assert.match(source, /toWebRequest\(request\)/,
    "The Hono app must receive the original /trpc request path.");
});
