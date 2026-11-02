import assert from "node:assert/strict";
import test from "node:test";

import {
  FREE_FEATURES,
  PREMIUM_ENTITLEMENT_ID,
  PREMIUM_FEATURES,
  PREMIUM_FREE_UNTIL,
  PREMIUM_FREE_UNTIL_LABEL,
  PREMIUM_MONTHLY_INR,
  PREMIUM_REQUIRED_MESSAGE,
  PREMIUM_YEARLY_INR,
  formatPremiumPriceInr,
  isPremiumFreePeriod,
  isRevenueCatEntitlementActive,
  resolvePremiumAccess,
} from "./premium";

test("free period includes all of 5 Jan 2027 Asia/Kolkata and locks at local midnight 6 Jan", () => {
  // 5 Jan 2027 23:59:59.999 IST
  assert.equal(isPremiumFreePeriod(new Date("2027-01-05T18:29:59.999Z")), true);
  // 6 Jan 2027 00:00:00 IST
  assert.equal(isPremiumFreePeriod(new Date("2027-01-05T18:30:00.000Z")), false);
  assert.equal(PREMIUM_FREE_UNTIL.toISOString(), "2027-01-05T18:30:00.000Z");
});

test("after free period, only an active membership unlocks premium content", () => {
  const after = new Date("2027-01-06T00:00:00.000Z");
  const locked = resolvePremiumAccess({ now: after, membershipActive: false });
  assert.equal(locked.allowed, false);
  assert.equal(locked.reason, "locked");
  assert.equal(locked.inFreePeriod, false);

  const member = resolvePremiumAccess({ now: after, membershipActive: true });
  assert.equal(member.allowed, true);
  assert.equal(member.reason, "membership");
  assert.equal(member.inFreePeriod, false);
});

test("during free period, users without membership still have premium access", () => {
  const before = new Date("2026-12-01T00:00:00.000Z");
  const access = resolvePremiumAccess({ now: before, membershipActive: false });
  assert.equal(access.allowed, true);
  assert.equal(access.reason, "free-period");
  assert.equal(access.inFreePeriod, true);
  assert.equal(access.freeUntilIso, PREMIUM_FREE_UNTIL.toISOString());
});

test("product catalog matches the locked premium plan", () => {
  assert.equal(PREMIUM_MONTHLY_INR, 99);
  assert.equal(PREMIUM_YEARLY_INR, 849);
  assert.equal(PREMIUM_ENTITLEMENT_ID, "premium");
  assert.equal(PREMIUM_FREE_UNTIL_LABEL, "5 Jan 2027");
  assert.equal(formatPremiumPriceInr(99), "₹99");
  assert.equal(formatPremiumPriceInr(849), "₹849");
  assert.deepEqual(
    PREMIUM_FEATURES.map((feature) => feature.id),
    ["tree", "medaa", "games", "wisdom"],
  );
  assert.deepEqual(
    FREE_FEATURES.map((feature) => feature.id),
    ["habits", "goals", "groups"],
  );
  assert.match(PREMIUM_REQUIRED_MESSAGE, /Habits, Goals, and Group goals stay free/i);
});

test("RevenueCat entitlement is active when missing expiry or expiry is in the future", () => {
  const now = new Date("2027-02-01T00:00:00.000Z");
  assert.equal(
    isRevenueCatEntitlementActive({
      subscriber: { entitlements: { premium: { expires_date: null } } },
    }, "premium", now),
    true,
  );
  assert.equal(
    isRevenueCatEntitlementActive({
      subscriber: { entitlements: { premium: { expires_date: "2027-03-01T00:00:00Z" } } },
    }, "premium", now),
    true,
  );
});

test("after free period without membership, access stays locked even if clocks are frozen in the future", () => {
  const frozen = new Date("2030-09-20T18:29:50Z");
  const access = resolvePremiumAccess({ now: frozen, membershipActive: false });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, "locked");
  assert.equal(
    resolvePremiumAccess({ now: frozen, membershipActive: true }).allowed,
    true,
  );
});

test("RevenueCat entitlement is inactive when missing, expired, or malformed", () => {
  const now = new Date("2027-02-01T00:00:00.000Z");
  assert.equal(isRevenueCatEntitlementActive({}, "premium", now), false);
  assert.equal(
    isRevenueCatEntitlementActive({
      subscriber: { entitlements: { other: { expires_date: null } } },
    }, "premium", now),
    false,
  );
  assert.equal(
    isRevenueCatEntitlementActive({
      subscriber: { entitlements: { premium: { expires_date: "2027-01-01T00:00:00Z" } } },
    }, "premium", now),
    false,
  );
  assert.equal(
    isRevenueCatEntitlementActive({
      subscriber: { entitlements: { premium: { expires_date: "not-a-date" } } },
    }, "premium", now),
    false,
  );
});
