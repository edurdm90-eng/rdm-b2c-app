import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifySavedLeaderboard({ db, auth, appRouter }: {
  db: typeof import("@rdm-b2c/db");
  auth: typeof import("@rdm-b2c/auth")["auth"];
  appRouter: typeof import("../routers/index")["appRouter"];
}) {
  const prefix = `Board${randomUUID().slice(0, 8)}`;
  const accounts = [];
  for (const role of ["Viewer", "Friend", "Teammate", "Outsider"]) {
    const result = await auth.api.signUpEmail({ body: {
      name: `${prefix} ${role}`,
      email: `${role.toLowerCase()}-${randomUUID()}@example.test`,
      password: randomUUID(),
    } });
    accounts.push(result.user);
  }
  const [viewer, friend, teammate, outsider] = accounts;
  assert.ok(viewer && friend && teammate && outsider);
  const caller = (user: typeof viewer) => appRouter.createCaller({ auth: null, session: {
    user,
    session: { id: randomUUID(), token: randomUUID(), userId: user.id, expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(), updatedAt: new Date() },
  } });
  const api = caller(viewer);
  await Promise.all([
    { userId: viewer.id, xp: 100, walletBalance: 100 },
    { userId: friend.id, xp: 300, walletBalance: 100 },
    { userId: teammate.id, xp: 500, walletBalance: 100 },
    { userId: outsider.id, xp: 1000, walletBalance: 100 },
  ].map(({ userId, ...progress }) => db.RdmProfile.updateOne({ userId }, { $set: progress })));
  await db.Referral.create({ inviterId: viewer.id, inviteeId: friend.id, inviteCode: "AB23CD" });
  const group = await api.rdm.groups.create({
    creationId: randomUUID(), category: "Friends", activityId: "custom", name: `${prefix} group`,
    description: "Persisted group for leaderboard scope verification", target: 50, unit: "pages", durationDays: 7,
    startDayKey: new Date().toISOString().slice(0, 10), timeZone: "UTC", cadence: "daily",
    pledgeBasis: "per_day", pledgePerUnit: 1, expectedActivities: 7, rewardStructure: "win_as_group",
  });
  await caller(teammate).rdm.groups.join({ inviteCode: group.inviteCode, pledgeAmount: 7 });

  const friends = await api.rdm.social.leaderboard({ scope: "friends" });
  assert.equal(friends.period, "all-time");
  assert.deepEqual(friends.entries.map(({ points, currentUser, rank }) => ({ points, currentUser, rank })), [
    { points: 300, currentUser: false, rank: 1 },
    { points: 100, currentUser: true, rank: 2 },
  ]);
  const groups = await api.rdm.social.leaderboard({ scope: "groups" });
  assert.deepEqual(groups.entries.map(({ points }) => points), [500, 100]);
  assert.equal(groups.entries.filter(({ currentUser }) => currentUser).length, 1);
  const global = await api.rdm.social.leaderboard({ scope: "global" });
  const ourEntries = global.entries.filter(({ name }) => name.startsWith(prefix));
  assert.deepEqual(ourEntries.map(({ points }) => points), [1000, 500, 300, 100]);
  assert.ok(ourEntries.every((entry) => !Object.hasOwn(entry, "email") && !entry.name.includes("@")));

  await db.RdmProfile.updateOne({ userId: friend.id }, { $set: { xp: 350 } });
  const refreshed = await caller(viewer).rdm.social.leaderboard({ scope: "friends" });
  assert.equal(refreshed.entries[0]?.points, 350);
}
