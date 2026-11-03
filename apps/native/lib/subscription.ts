import { env } from "@rdm-b2c/env/native";
import { Platform } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { resolveRevenueCatPublicApiKey } from "@/lib/revenuecat-api-key";
import { SubscriptionController, type SubscriptionAdapter } from "@/lib/subscription-core";

const configuredKey = Platform.OS === "ios"
  ? env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
  : Platform.OS === "android"
    ? env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
    : undefined;

const apiKey = resolveRevenueCatPublicApiKey(configuredKey);

// Import the native SDK only when a signed-in user and public platform key exist.
// Unconfigured builds (and Expo Go without native billing) keep free features usable.
async function createAdapter(): Promise<SubscriptionAdapter> {
  const { default: Purchases } = await import("react-native-purchases");
  const packages = new Map<string, PurchasesPackage>();
  return {
    configure: (key, userId) => Purchases.configure({ apiKey: key, appUserID: userId }),
    logIn: async (userId) => {
      packages.clear();
      const result = await Purchases.logIn(userId);
      return result.customerInfo;
    },
    getCustomerInfo: () => Purchases.getCustomerInfo(),
    getPlans: async () => {
      packages.clear();
      const offerings = await Purchases.getOfferings();
      const available = offerings.current?.availablePackages ?? [];
      for (const plan of available) packages.set(plan.identifier, plan);
      return available.map((plan) => ({
        id: plan.identifier,
        title: plan.product.title,
        description: plan.product.description,
        price: plan.product.priceString,
      }));
    },
    purchase: async (planId) => {
      const plan = packages.get(planId);
      if (!plan) throw new Error("Plan is no longer available");
      const result = await Purchases.purchasePackage(plan);
      return result.customerInfo;
    },
    restore: () => Purchases.restorePurchases(),
    addCustomerInfoListener: (listener) => Purchases.addCustomerInfoUpdateListener(listener),
  };
}

// Locked go-live default: entitlement id `premium` when a public SDK key exists.
const entitlementId = env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID
  ?? (apiKey ? "premium" : undefined);

export const subscriptionController = new SubscriptionController({
  apiKey,
  entitlementId,
  createAdapter,
});
