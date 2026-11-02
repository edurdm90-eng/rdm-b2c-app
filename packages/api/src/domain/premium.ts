/**
 * Free access is inclusive through 5 Jan 2027 in Asia/Kolkata.
 * Paywall starts at 2027-01-06T00:00:00+05:30.
 */
export const PREMIUM_FREE_UNTIL = new Date("2027-01-05T18:30:00.000Z");
/** Product-facing last free calendar day (Asia/Kolkata). */
export const PREMIUM_FREE_UNTIL_LABEL = "5 Jan 2027";

export const PREMIUM_MONTHLY_INR = 99;
export const PREMIUM_YEARLY_INR = 849;
export const PREMIUM_ENTITLEMENT_ID = "premium";

export const PREMIUM_FEATURES = [
  { id: "tree", title: "Grow Your Tree" },
  { id: "medaa", title: "AI Goal Setting" },
  { id: "games", title: "Games" },
  { id: "wisdom", title: "Wisdom (Japanese Habits)" },
] as const;

export const FREE_FEATURES = [
  { id: "habits", title: "Habits" },
  { id: "goals", title: "Goals" },
  { id: "groups", title: "Group goals" },
] as const;

export const PREMIUM_REQUIRED_MESSAGE =
  "This is part of RDM Premium. Habits, Goals, and Group goals stay free. Open Membership to continue.";

export type PremiumAccessInput = {
  now?: Date;
  membershipActive: boolean;
};

export type PremiumAccess = {
  allowed: boolean;
  inFreePeriod: boolean;
  freeUntilIso: string;
  reason: "free-period" | "membership" | "locked";
};

export type RevenueCatSubscriberPayload = {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string | null } | undefined>;
  };
};

export function isPremiumFreePeriod(now: Date = new Date()): boolean {
  return now.getTime() < PREMIUM_FREE_UNTIL.getTime();
}

export function resolvePremiumAccess(input: PremiumAccessInput): PremiumAccess {
  const now = input.now ?? new Date();
  const freeUntilIso = PREMIUM_FREE_UNTIL.toISOString();
  if (isPremiumFreePeriod(now)) {
    return { allowed: true, inFreePeriod: true, freeUntilIso, reason: "free-period" };
  }
  if (input.membershipActive) {
    return { allowed: true, inFreePeriod: false, freeUntilIso, reason: "membership" };
  }
  return { allowed: false, inFreePeriod: false, freeUntilIso, reason: "locked" };
}

/** Pure RevenueCat subscriber entitlement check — no I/O. */
export function isRevenueCatEntitlementActive(
  payload: RevenueCatSubscriberPayload,
  entitlementId: string,
  now: Date = new Date(),
): boolean {
  const entitlement = payload.subscriber?.entitlements?.[entitlementId];
  if (!entitlement) return false;
  const expires = entitlement.expires_date;
  if (expires == null) return true;
  const expiresAt = Date.parse(expires);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt > now.getTime();
}

export function formatPremiumPriceInr(amount: number): string {
  return `₹${amount}`;
}
