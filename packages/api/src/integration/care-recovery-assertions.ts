import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { AppRouter } from "../routers/index";

export async function verifyCareRecovery({ db, caller }: {
  db: typeof import("@rdm-b2c/db");
  caller: (userId: string) => ReturnType<AppRouter["createCaller"]>;
}) {
  const userId = randomUUID();
  await db.RdmProfile.create({ userId, walletBalance: 20 });
  const api = caller(userId);
  const preTree = await api.rdm.gratitude.save({ category: "life", body: "A genuine entry before creating a tree.", timeZone: "UTC" });
  // Explicitly set the pre-tree fixture timestamp so the boundary is deterministic.
  const beforePledge = new Date(Date.now() - 86_400_000);
  await db.GratitudeEntry.updateOne({ _id: preTree.entry.id }, { $set: { processedAt: beforePledge } });
  await api.rdm.tree.pledge({ amount: 10, timeZone: "America/Los_Angeles" });
  await api.rdm.gratitude.save({ category: "friends", body: "A friend helped me during a difficult morning.", timeZone: "Pacific/Kiritimati" });
  const deeds = await api.rdm.goodDeeds.today({ timeZone: "UTC" });
  await api.rdm.goodDeeds.submit({ deedIds: [deeds.deeds[0]!.id], timeZone: "UTC" });
  const beforeLoss = await api.rdm.wallet.summary();
  assert.equal(beforeLoss.tree.waterCount, 1);
  assert.equal(beforeLoss.tree.sunlightCount, 1);

  // Simulate an interruption after reward/entry commits but before care persistence.
  await db.TreeCareActivity.deleteMany({ userId });
  // A processed-looking entry without a credited operation must not earn growth.
  await db.GratitudeEntry.create({
    userId, category: "colleagues", categoryTitle: "Your colleagues", prompt: "Appreciate a colleague",
    body: "This fixture has no committed wallet operation.", dayKey: new Date().toISOString().slice(0, 10),
    processedAt: new Date(),
  });

  const restored = await caller(userId).rdm.wallet.summary();
  assert.equal(restored.tree.waterCount, 1);
  assert.equal(restored.tree.sunlightCount, 1);
  assert.equal(restored.tree.growth.points, beforeLoss.tree.growth.points);
  assert.equal(restored.streak, beforeLoss.streak);
  assert.equal(restored.tree.lastWateredAt, beforeLoss.tree.lastWateredAt);
  assert.equal(restored.tree.lastSunlightAt, beforeLoss.tree.lastSunlightAt);
  assert.deepEqual(restored.wallet, beforeLoss.wallet);
  assert.equal(restored.transactions.length, beforeLoss.transactions.length);
  await db.TreeCareActivity.deleteMany({ userId });
  await Promise.all([api.rdm.wallet.summary(), api.rdm.dashboard(), api.rdm.tree.overview({ timeZone: "UTC" })]);
  const retried = await caller(userId).rdm.wallet.summary();
  assert.deepEqual(retried.wallet, beforeLoss.wallet);
  assert.equal(retried.tree.growth.points, beforeLoss.tree.growth.points);
  assert.equal(retried.tree.lastWateredAt, beforeLoss.tree.lastWateredAt);
}
