import { expo } from "@better-auth/expo";
import { client } from "@rdm-b2c/db";
import { env } from "@rdm-b2c/env/server";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

import { grantSignupAirdrop } from "./signup-airdrop";

export function createAuth() {
  const isProduction = env.NODE_ENV === "production";
  return betterAuth({
    database: mongodbAdapter(client),
    trustedOrigins: [
      env.CORS_ORIGIN,
      "rdm-b2c://",
      "exp://",
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "http://localhost:8082",
      "http://127.0.0.1:8082",
    ],
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        signupAirdropEligible: { type: "boolean", required: false, defaultValue: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({ data: { ...user, signupAirdropEligible: true } }),
        },
      },
      session: {
        create: {
          after: async (session) => {
            try {
              await grantSignupAirdrop(session.userId);
            } catch {
              // The account/session already exists. Leave recovery to a later sign-in or profile access.
              console.error("Signup airdrop is pending and will be retried on the next sign-in or profile access.");
            }
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: isProduction ? "none" : "lax",
        secure: isProduction,
        httpOnly: true,
      },
    },
    plugins: [expo()],
  });
}

export const auth = createAuth();
