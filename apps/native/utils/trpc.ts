import type { AppRouter } from "@rdm-b2c/api/routers/index";
import { env } from "@rdm-b2c/env/native";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { Platform } from "react-native";

import { getStoredToken } from "@/lib/auth-token";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
const serverUrl = env.EXPO_PUBLIC_SERVER_URL.replace(/\/$/, "");

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${serverUrl}/trpc`,
      fetch: function (url, options) {
        return fetch(url, {
          ...options,
          credentials: Platform.OS === "web" ? "include" : "omit",
        });
      },
      headers: async () => {
        if (Platform.OS === "web") {
          return {};
        }
        // RN's fetch never exposes Set-Cookie to JS, so native auth is
        // carried as a bearer token (persisted by the server's bearer()
        // plugin) instead of a cookie. See lib/auth-client.ts.
        const token = await getStoredToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
