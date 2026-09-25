import { expo } from "@better-auth/expo";
import { client } from "@rdm-b2c/db";
import { env } from "@rdm-b2c/env/server";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { bearer } from "better-auth/plugins";
import { ObjectId } from "mongodb";

import { googleProviderConfig } from "./google";
import { grantSignupAirdrop } from "./signup-airdrop";

export function createAuth() {
  const isProduction = env.NODE_ENV === "production";
  const google = googleProviderConfig({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });
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
    rateLimit: {
      enabled: isProduction,
      // Memory counters are isolated per serverless instance. Mongo-backed
      // counters keep login abuse limits consistent across every instance.
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/*": { window: 60, max: 12 },
        "/sign-up/*": { window: 60, max: 6 },
        "/callback/*": { window: 60, max: 30 },
      },
    },
    socialProviders: google ? { google } : undefined,
    session: {
      // A two-week rolling session is long enough for a routine app without
      // forcing frequent sign-ins. Refreshing at most once a day keeps normal
      // authenticated traffic from turning every request into a database write.
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60 * 24,
    },
    account: {
      // OAuth tokens are not exposed to RDM clients and stay encrypted at rest.
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // Do not force-link identities whose email is not verified by Google.
        // Better Auth links matching, verified Google emails by default.
        allowDifferentEmails: false,
        updateUserInfoOnLink: false,
      },
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
      database: {
        // The Mongoose-owned MongoDB driver can return ObjectId instances
        // from a different BSON module than Better Auth's adapter. A custom
        // string id generator tells the adapter to preserve existing ids
        // instead of trying to re-serialize those instances.
        generateId: () => new ObjectId().toHexString(),
      },
      defaultCookieAttributes: {
        sameSite: isProduction ? "none" : "lax",
        secure: isProduction,
        httpOnly: true,
      },
    },
    // React Native's fetch never exposes the Set-Cookie header to JS (same
    // restriction browsers apply), so the Expo client can't reliably persist
    // a cookie-based session. `bearer()` additionally returns the session
    // token via a plain `set-auth-token` header and accepts it back as
    // `Authorization: Bearer <token>`, sidestepping that restriction.
    plugins: [expo(), bearer({ requireSignature: true })],
  });
}

export const auth = createAuth();
