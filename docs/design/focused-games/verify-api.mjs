/**
 * Manual regression check against the isolated Games QA server ONLY.
 * Start that server with a disposable database and no provider key first.
 * Run: node docs/design/focused-games/verify-api.mjs
 * Never point this script at an existing user's database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseURL = "http://127.0.0.1:39131";
const origin = "http://127.0.0.1:8085";
const account = {
  name: "Games API regression",
  email: `games-regression-${randomUUID()}@example.test`,
  password: randomUUID() + randomUUID(),
};
const signup = await fetch(baseURL + "/api/auth/sign-up/email", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify(account),
});
assert.equal(signup.ok, true, "Isolated account creation must succeed");
const cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
assert.ok(cookie, "The test requires a genuine authenticated session");

async function call(path, input, query = false) {
  const response = await fetch(baseURL + "/trpc/" + path + (query && input ? "?input=" + encodeURIComponent(JSON.stringify(input)) : ""), {
    method: query ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie },
    ...(query ? {} : { body: JSON.stringify(input) }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message ?? "API request failed");
  return body.result.data;
}
const catalog = await call("rdm.games.list", undefined, true);
assert.equal(catalog.length, 7);
const checked = [];
for (const game of catalog) {
  const [first, concurrent] = await Promise.all([
    call("rdm.games.start", { gameId: game.id }),
    call("rdm.games.start", { gameId: game.id }),
  ]);
  assert.equal(first.sessionId, concurrent.sessionId, "Concurrent starts must share one session");
  assert.equal(first.expiresAt, concurrent.expiresAt, "Starting twice must not reset the timer");
  const resumed = await call("rdm.games.start", { gameId: game.id });
  assert.equal(resumed.sessionId, first.sessionId);
  assert.equal(resumed.expiresAt, first.expiresAt);
  const results = await Promise.all([
    call("rdm.games.complete", { sessionId: first.sessionId }),
    call("rdm.games.complete", { sessionId: first.sessionId }),
  ]);
  assert.deepEqual(results[0], results[1], "Concurrent completion must be idempotent");
  assert.equal(results[0].reward, 0, "Empty sessions must not earn RDM");
  await assert.rejects(() => call("rdm.games.start", { gameId: game.id }), /locked/i);
  checked.push(game.id);
}
const locked = await call("rdm.games.list", undefined, true);
assert.ok(locked.every((game) => game.locked));
const wallet = await call("rdm.wallet.summary", undefined, true);
assert.equal(wallet.wallet.base, 500);
assert.equal(wallet.wallet.reward, 0);
assert.equal(wallet.xp, 0);
const badges = await call("rdm.social.badges", undefined, true);
assert.equal(badges.unlockedCount, 0);
console.log(JSON.stringify({ passed: true, checked, dailySessions: 7, reward: 0, baseUnchanged: true, badgesUnchanged: true }, null, 2));
