import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { subscriptionController } from "@/lib/subscription";
import type { SubscriptionSnapshot } from "@/lib/subscription-core";

const UserContext = createContext<string | null>(null);

export function SubscriptionProvider({ userId, children }: { userId: string; children: ReactNode }) {
  useEffect(() => {
    subscriptionController.setUser(userId);
    return () => subscriptionController.setUser(null);
  }, [userId]);
  return <UserContext.Provider value={userId}>{children}</UserContext.Provider>;
}

export function useSubscription(): SubscriptionSnapshot {
  const userId = useContext(UserContext);
  const snapshot = useSyncExternalStore(subscriptionController.subscribe, subscriptionController.getSnapshot);
  // Mask the previous user's status during the render before the effect switches identities.
  if (userId && snapshot.userId !== userId) {
    return { userId, status: "loading", plans: [], plansStatus: "idle", operation: null, message: null, managementUrl: null };
  }
  return snapshot;
}
