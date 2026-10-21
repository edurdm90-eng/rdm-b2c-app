import assert from "node:assert/strict";
import { test } from "node:test";

import { hasActiveEntitlement, SubscriptionController, type CustomerInfoSummary, type SubscriptionAdapter } from "./subscription-core";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fixture() {
  const calls: string[] = [];
  let onUpdate: ((info: CustomerInfoSummary) => void) | undefined;
  let active = false;
  let fail = false;
  let cancel = false;
  let pendingPurchase: Promise<CustomerInfoSummary> | null = null;
  const info = (): CustomerInfoSummary => ({ entitlements: { active: active ? { premium: { isActive: true } } : {} }, managementURL: active ? "https://example.com/manage" : null });
  const adapter: SubscriptionAdapter = {
    configure: (_key, id) => { calls.push(`configure:${id}`); },
    logIn: async (id) => { calls.push(`login:${id}`); return info(); },
    getCustomerInfo: async () => { calls.push("info"); if (fail) throw new Error("offline"); return info(); },
    getPlans: async () => { calls.push("plans"); return [{ id: "monthly", title: "Monthly", description: "", price: "$1.99" }]; },
    purchase: async () => { calls.push("purchase"); if (pendingPurchase) return pendingPurchase; if (cancel) throw { userCancelled: true }; if (fail) throw new Error("offline"); return info(); },
    restore: async () => { calls.push("restore"); if (fail) throw new Error("offline"); return info(); },
    addCustomerInfoListener: (listener) => { onUpdate = listener; },
  };
  const controller = new SubscriptionController({ apiKey: "public-key", entitlementId: "premium", createAdapter: async () => adapter });
  return { controller, calls, setActive: (value: boolean) => { active = value; }, setFail: (value: boolean) => { fail = value; }, setCancel: (value: boolean) => { cancel = value; }, setPendingPurchase: (value: Promise<CustomerInfoSummary>) => { pendingPurchase = value; }, update: () => onUpdate?.(info()) };
}

test("missing configuration stays unavailable and never loads the SDK", async () => {
  const controller = new SubscriptionController({ apiKey: undefined, entitlementId: undefined, createAdapter: async () => { throw new Error("must not load"); } });
  controller.setUser("user-1");
  await flush();
  assert.equal(controller.getSnapshot().status, "unavailable");
});

test("entitlement parsing requires the exact active identifier", () => {
  const info: CustomerInfoSummary = { entitlements: { active: { premium: { isActive: true }, other: { isActive: false } } } };
  assert.equal(hasActiveEntitlement(info, "premium"), true);
  assert.equal(hasActiveEntitlement(info, "other"), false);
  assert.equal(hasActiveEntitlement(info, "missing"), false);
});

test("configures once with authenticated ID, switches IDs without leaking entitlement", async () => {
  const { controller, calls, setActive, update } = fixture();
  controller.setUser("user-1");
  await flush();
  assert.equal(controller.getSnapshot().status, "inactive");
  controller.setUser("user-1");
  await flush();
  assert.equal(calls.filter((call) => call.startsWith("configure:")).length, 1);
  setActive(true);
  update();
  await flush();
  assert.equal(controller.getSnapshot().status, "active");
  controller.setUser(null);
  assert.equal(controller.getSnapshot().status, "signed-out");
  controller.setUser("user-2");
  assert.equal(controller.getSnapshot().status, "loading");
  setActive(false);
  await flush();
  assert.equal(controller.getSnapshot().status, "inactive");
  assert.deepEqual(calls.filter((call) => call.startsWith("configure:") || call.startsWith("login:")), ["configure:user-1", "login:user-2"]);
});

test("stale customer info updates and results cannot show old user's entitlement", async () => {
  const { controller, setActive, update } = fixture();
  controller.setUser("user-1");
  await flush();
  setActive(true);
  controller.setUser("user-2");
  update();
  assert.equal(controller.getSnapshot().status, "loading");
  setActive(false);
  await flush();
  assert.equal(controller.getSnapshot().status, "inactive");
});

test("purchase cancellation and network failures do not grant an entitlement", async () => {
  const { controller, setCancel, setFail } = fixture();
  controller.setUser("user-1");
  await flush();
  setCancel(true);
  assert.equal(await controller.purchase("monthly"), "cancelled");
  assert.equal(controller.getSnapshot().status, "inactive");
  setCancel(false);
  setFail(true);
  assert.equal(await controller.purchase("monthly"), "error");
  assert.equal(controller.getSnapshot().status, "inactive");
  assert.match(controller.getSnapshot().message ?? "", /connection|try again/i);
});

test("an in-flight purchase for a signed-out account never updates the next account", async () => {
  const { controller, setPendingPurchase } = fixture();
  controller.setUser("user-1");
  await flush();
  let resolvePurchase: (value: CustomerInfoSummary) => void = () => undefined;
  setPendingPurchase(new Promise<CustomerInfoSummary>((resolve) => { resolvePurchase = resolve; }));
  const purchase = controller.purchase("monthly");
  await flush();
  controller.setUser("user-2");
  resolvePurchase({ entitlements: { active: { premium: { isActive: true } } } });
  assert.equal(await purchase, "superseded");
  await flush();
  assert.equal(controller.getSnapshot().userId, "user-2");
  assert.equal(controller.getSnapshot().status, "inactive");
});

test("restore only reports active after RevenueCat returns the entitlement", async () => {
  const { controller, setActive } = fixture();
  controller.setUser("user-1");
  await flush();
  assert.equal(await controller.restore(), "inactive");
  setActive(true);
  assert.equal(await controller.restore(), "active");
  assert.equal(controller.getSnapshot().status, "active");
});

test("a new process loads the same authenticated user's membership", async () => {
  const { controller, setActive, calls } = fixture();
  setActive(true);
  controller.setUser("persisted-user-id");
  await flush();
  assert.equal(controller.getSnapshot().status, "active");
  assert.deepEqual(calls.slice(0, 2), ["configure:persisted-user-id", "info"]);
});

test("offerings are fetched on request and reused for the same user", async () => {
  const { controller, calls } = fixture();
  controller.setUser("user-1");
  await flush();
  await controller.loadPlans();
  await controller.loadPlans();
  assert.equal(calls.filter((call) => call === "plans").length, 1);
  assert.equal(controller.getSnapshot().plans[0]?.price, "$1.99");
});
