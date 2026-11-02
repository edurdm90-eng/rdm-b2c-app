import { env } from "@rdm-b2c/env/server";
import { TRPCError } from "@trpc/server";

import {
  PREMIUM_ENTITLEMENT_ID,
  PREMIUM_REQUIRED_MESSAGE,
  isRevenueCatEntitlementActive,
  resolvePremiumAccess,
  type PremiumAccess,
  type RevenueCatSubscriberPayload,
} from "../domain/premium";

type CacheEntry = { expiresAt: number; active: boolean };

const membershipCache = new Map<string, CacheEntry>();
const CACHE_MS = 60_000;
const ERROR_CACHE_MS = 15_000;

/** Test seam — clears the short-lived membership cache. */
export function clearPremiumMembershipCache(): void {
  membershipCache.clear();
}

/** Test-only override so frozen-clock integration suites can exercise paid paths. */
function testMembershipOverride(): boolean | undefined {
  if (process.env.NODE_ENV !== "test") return undefined;
  if (process.env.RDM_TEST_PREMIUM_ACTIVE === "1") return true;
  if (process.env.RDM_TEST_PREMIUM_ACTIVE === "0") return false;
  return undefined;
}

async function fetchRevenueCatMembershipActive(appUserId: string, now: Date): Promise<boolean> {
  const testOverride = testMembershipOverride();
  if (testOverride !== undefined) return testOverride;

  const secret = env.REVENUECAT_SECRET_API_KEY;
  if (!secret) return false;

  const cached = membershipCache.get(appUserId);
  if (cached && cached.expiresAt > now.getTime()) return cached.active;

  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      membershipCache.set(appUserId, { active: false, expiresAt: now.getTime() + CACHE_MS });
      return false;
    }
    const body = await response.json() as RevenueCatSubscriberPayload;
    const entitlementId = env.REVENUECAT_ENTITLEMENT_ID || PREMIUM_ENTITLEMENT_ID;
    const active = isRevenueCatEntitlementActive(body, entitlementId, now);
    membershipCache.set(appUserId, { active, expiresAt: now.getTime() + CACHE_MS });
    return active;
  } catch {
    membershipCache.set(appUserId, { active: false, expiresAt: now.getTime() + ERROR_CACHE_MS });
    return false;
  }
}

export async function getPremiumAccessForUser(
  userId: string,
  now: Date = new Date(),
): Promise<PremiumAccess> {
  const provisional = resolvePremiumAccess({ now, membershipActive: false });
  if (provisional.allowed) return provisional;
  const membershipActive = await fetchRevenueCatMembershipActive(userId, now);
  return resolvePremiumAccess({ now, membershipActive });
}

export async function assertPremiumAccess(userId: string, now: Date = new Date()): Promise<PremiumAccess> {
  const access = await getPremiumAccessForUser(userId, now);
  if (!access.allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: PREMIUM_REQUIRED_MESSAGE });
  }
  return access;
}

export { PREMIUM_REQUIRED_MESSAGE };
