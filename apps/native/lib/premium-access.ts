import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  PREMIUM_FREE_UNTIL,
  PREMIUM_FREE_UNTIL_LABEL,
  PREMIUM_MONTHLY_INR,
  PREMIUM_YEARLY_INR,
  formatPremiumPriceInr,
  resolvePremiumAccess,
  type PremiumAccess,
} from "@rdm-b2c/api/domain/premium";

import { useSubscription } from "@/lib/subscription-context";

export type { PremiumAccess };

export {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  PREMIUM_FREE_UNTIL,
  PREMIUM_FREE_UNTIL_LABEL,
  PREMIUM_MONTHLY_INR,
  PREMIUM_YEARLY_INR,
  formatPremiumPriceInr,
  resolvePremiumAccess,
};

export function usePremiumAccess(serverAccess?: PremiumAccess | null): PremiumAccess {
  const membership = useSubscription();
  const local = resolvePremiumAccess({
    membershipActive: membership.status === "active",
  });
  // Prefer server clock/reason when dashboard (or another query) provided it.
  return serverAccess ?? local;
}
