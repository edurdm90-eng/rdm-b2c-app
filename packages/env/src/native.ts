import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_SERVER_URL: z.url(),
    // Public SDK keys only. Entitlement id should be `premium` (app defaults to that when a key is set).
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: z.string().trim().min(1).optional(),
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: z.string().trim().min(1).optional(),
    EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: z.string().trim().min(1).optional(),
  },
  // Expo production bundles inline direct EXPO_PUBLIC_* property reads only.
  runtimeEnv: {
    EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID,
  },
  emptyStringAsUndefined: true,
});
