import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { AppRouter } from "../routers/index";

type Dependencies = {
  db: typeof import("@rdm-b2c/db");
  auth: typeof import("@rdm-b2c/auth")["auth"];
  caller: (userId: string) => ReturnType<AppRouter["createCaller"]>;
};

export const signupAirdropCases: Array<{ name: string; run: (dependencies: Dependencies) => Promise<void> }> = [
  {
    name: "signup survives an interrupted airdrop and concurrent wallet reads recover its credit exactly once",
    async run({ db, auth, caller }) {
      // A real database-boundary failure interrupts only the credit in this isolated fixture.
      const created = await (async () => {
        await db.client.command({ collMod: "rdmprofiles", validator: { "transactions.kind": { $ne: "airdrop" } } });
        try {
          return await auth.api.signUpEmail({ body: {
            email: `airdrop-recovery-${randomUUID()}@example.test`, password: randomUUID(), name: "Airdrop Recovery Tester",
          } });
        } finally {
          await db.client.command({ collMod: "rdmprofiles", validator: {} });
        }
      })();
      assert.ok(created.token);
      const api = caller(created.user.id);
      const recovered = await Promise.all([api.rdm.wallet.summary(), api.rdm.wallet.summary(), api.rdm.dashboard()]);
      assert.deepEqual(recovered[0].wallet, { balance: 500, base: 500, reward: 0, remorse: 0, peer: 0 });
      const reload = await caller(created.user.id).rdm.wallet.summary();
      assert.deepEqual(reload.wallet, { balance: 500, base: 500, reward: 0, remorse: 0, peer: 0 });
      assert.equal(reload.transactions.filter((transaction) => transaction.kind === "airdrop").length, 1);
      assert.equal(reload.xp, 0);
    },
  },
  {
    name: "signup airdrop is not repeated by concurrent sign-ins after its Base funds are pledged",
    async run({ auth, caller }) {
      const email = `airdrop-signin-${randomUUID()}@example.test`;
      const password = randomUUID();
      const created = await auth.api.signUpEmail({ body: { email, password, name: "Airdrop Sign-in Tester" } });
      assert.equal(Object.hasOwn(created.user, "signupAirdropEligible"), false);
      const api = caller(created.user.id);
      const goal = await api.rdm.goals.create({
        creationId: randomUUID(), title: "Use welcome funds", category: "Focus", target: "Finish one chapter",
        durationDays: 5, startDayKey: new Date().toISOString().slice(0, 10), timeZone: "UTC", pledgeAmount: 100,
      });
      assert.equal((await api.rdm.wallet.summary()).wallet.base, 400);
      const sessions = await Promise.all(Array.from({ length: 4 }, () => auth.api.signInEmail({ body: { email, password } })));
      assert.ok(sessions.every((result) => result.user.id === created.user.id));
      const afterSignIn = await caller(created.user.id).rdm.wallet.summary();
      assert.deepEqual(afterSignIn.wallet, { balance: 400, base: 400, reward: 0, remorse: 0, peer: 0 });
      assert.equal(afterSignIn.transactions.filter((transaction) => transaction.kind === "airdrop").length, 1);
      await api.rdm.goals.update({
        id: goal.id, requestId: randomUUID(), expectedVersion: goal.progressVersion, action: "complete", note: "Finished the chapter",
      });
      await auth.api.signInEmail({ body: { email, password } });
      const settled = await caller(created.user.id).rdm.wallet.summary();
      assert.deepEqual(settled.wallet, { balance: 500, base: 400, reward: 100, remorse: 0, peer: 0 });
      assert.equal(settled.transactions.filter((transaction) => transaction.kind === "airdrop").length, 1);
    },
  },
  {
    name: "signup airdrop never backfills legacy accounts or accepts client eligibility updates",
    async run({ db, auth, caller }) {
      for (const hasUsedProfile of [true, false]) {
        const email = `airdrop-legacy-${randomUUID()}@example.test`;
        const password = randomUUID();
        const created = await auth.api.signUpEmail({ body: { email, password, name: "Legacy Account Tester" } });
        // Model pre-feature accounts, whose auth records never received the server-owned marker.
        await db.client.collection("user").updateOne({ email }, { $unset: { signupAirdropEligible: "" } });
        if (hasUsedProfile) {
          await db.RdmProfile.updateOne({ userId: created.user.id }, { $set: {
            walletBalance: 0, xp: 80, creditedOperations: ["legacy-effort"],
            transactions: [{ title: "Previous effort", amount: 0, kind: "goal", operationId: "legacy-effort", createdAt: new Date() }],
          } });
        } else {
          await db.RdmProfile.deleteOne({ userId: created.user.id });
        }
        const signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
        const cookie = signedIn.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
        assert.ok(cookie);
        const forgedEligibility = await auth.handler(new Request("http://127.0.0.1:43991/api/auth/update-user", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie, origin: "http://127.0.0.1:43992" },
          body: JSON.stringify({ signupAirdropEligible: true }),
        }));
        assert.equal(forgedEligibility.status, 400);
        await auth.api.signInEmail({ body: { email, password } });
        const state = await caller(created.user.id).rdm.wallet.summary();
        assert.deepEqual(state.wallet, { balance: 0, base: 0, reward: 0, remorse: 0, peer: 0 });
        assert.equal(state.xp, hasUsedProfile ? 80 : 0);
        assert.equal(state.transactions.length, hasUsedProfile ? 1 : 0);
        assert.equal(state.transactions.filter((transaction) => transaction.kind === "airdrop").length, 0);
      }
    },
  },
  {
    name: "signup airdrop follows successful registration only and cannot be selected by signup input",
    async run({ auth, caller }) {
      const email = `airdrop-failed-${randomUUID()}@example.test`;
      const password = randomUUID();
      const body = { email, password, name: "Signup Validation Tester", signupAirdropEligible: false };
      await assert.rejects(() => auth.api.signUpEmail({ body: { ...body, password: "short" } }));
      await assert.rejects(() => auth.api.signInEmail({ body: { email, password } }));
      const created = await auth.api.signUpEmail({ body });
      assert.equal(Object.hasOwn(created.user, "signupAirdropEligible"), false);
      const state = await caller(created.user.id).rdm.wallet.summary();
      assert.deepEqual(state.wallet, { balance: 500, base: 500, reward: 0, remorse: 0, peer: 0 });
      const repeatedBody = { ...body, signupAirdropEligible: true };
      await assert.rejects(() => auth.api.signUpEmail({ body: repeatedBody }));
      const unchanged = await caller(created.user.id).rdm.wallet.summary();
      assert.deepEqual(unchanged.wallet, state.wallet);
      assert.deepEqual(unchanged.transactions, state.transactions);
      assert.equal(unchanged.transactions.filter((transaction) => transaction.kind === "airdrop").length, 1);
    },
  },
  {
    name: "signup airdrop first-session repair creates a missing profile and credits once across concurrent sessions",
    async run({ db, auth, caller }) {
      const email = `airdrop-first-session-${randomUUID()}@example.test`;
      const password = randomUUID();
      const created = await auth.api.signUpEmail({ body: { email, password, name: "First Session Recovery Tester" } });
      // Model the earlier interruption point: the eligible account exists but no profile was created.
      await db.RdmProfile.deleteOne({ userId: created.user.id });
      const sessions = await Promise.all(Array.from({ length: 4 }, () => auth.api.signInEmail({ body: { email, password } })));
      assert.ok(sessions.every((result) => result.user.id === created.user.id));
      const state = await caller(created.user.id).rdm.wallet.summary();
      assert.deepEqual(state.wallet, { balance: 500, base: 500, reward: 0, remorse: 0, peer: 0 });
      assert.equal(state.transactions.length, 1);
      assert.equal(state.transactions[0]?.amount, 500);
      assert.equal(state.transactions[0]?.kind, "airdrop");
      assert.equal(state.xp, 0);
    },
  },
];
