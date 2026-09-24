import { expoClient } from "@better-auth/expo/client";
import { env } from "@rdm-b2c/env/native";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { getStoredToken, setStoredToken } from "@/lib/auth-token";
import { sessionTokenFromCookie } from "@/lib/bearer-session";

export const googleAuthEnabled = env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

// Captures the `set-auth-token` header the server's bearer() plugin returns
// on every response and persists it. Unlike Set-Cookie, this is a plain
// header RN's fetch always exposes to JS, so it survives release builds
// where the Expo client's cookie-based capture silently fails.
const bearerTokenCapture = {
  id: "bearer-token-capture",
  // better-auth's client only wires up a plugin's `fetchPlugins` array into
  // the underlying better-fetch instance (see client/config.mjs), so the
  // actual better-fetch plugin (id/name/hooks) must be nested here rather
  // than placed on this outer object directly.
  fetchPlugins: [
    {
      id: "bearer-token-capture",
      name: "Bearer Token Capture",
      hooks: {
        async onSuccess(context: { response: Response; request: { url: string } }) {
          if (Platform.OS === "web") return;
          const token = context.response.headers.get("set-auth-token");
          if (token) {
            await setStoredToken(token);
          }
          if (context.request.url.toString().includes("/sign-out")) {
            await setStoredToken(null);
          }
        },
      },
    },
  ],
};

const baseAuthClient = createAuthClient({
  baseURL: `${env.EXPO_PUBLIC_SERVER_URL.replace(/\/$/, "")}/api/auth`,
  fetchOptions: {
    auth:
      Platform.OS === "web"
        ? undefined
        : {
            type: "Bearer",
            token: () => getStoredToken().then((token) => token ?? ""),
          },
  },
  plugins: [
    expoClient({
      scheme: Constants.expoConfig?.scheme as string,
      storagePrefix: Constants.expoConfig?.scheme as string,
      storage: SecureStore,
    }) as never,
    bearerTokenCapture as never,
  ],
});

export const authClient = baseAuthClient as typeof baseAuthClient & {
  getCookie(): string;
};

/**
 * OAuth completes in the system browser, so its session cookie is returned to
 * Expo's cookie store rather than an RN fetch response. Mirror its signed
 * session token into the bearer store used by tRPC before entering the app.
 */
export async function syncBearerTokenFromSessionCookie(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const token = sessionTokenFromCookie(authClient.getCookie());
  if (!token) return false;
  await setStoredToken(token);
  return true;
}
