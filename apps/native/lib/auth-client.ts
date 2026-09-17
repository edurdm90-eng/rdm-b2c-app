import { expoClient } from "@better-auth/expo/client";
import { env } from "@rdm-b2c/env/native";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const baseAuthClient = createAuthClient({
  baseURL: `${env.EXPO_PUBLIC_SERVER_URL.replace(/\/$/, "")}/api/auth`,
  plugins: [
    expoClient({
      scheme: Constants.expoConfig?.scheme as string,
      storagePrefix: Constants.expoConfig?.scheme as string,
      storage: SecureStore,
    }) as never,
  ],
});

export const authClient = baseAuthClient as typeof baseAuthClient & {
  getCookie(): string;
};
