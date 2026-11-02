# RevenueCat membership setup

The native app includes a Membership page under Account. Membership does **not**
sell or mint RDM. Entitlement id is `premium`.

**Product (locked):** Premium = Grow Your Tree, AI Goal Setting (Medaa), Games,
Wisdom (Japanese Habits). Always free = Habits, Goals, Group goals. List prices
₹99/month · ₹849/year. Membership never sells or mints RDM. **Everyone keeps
premium surfaces free through 5 Jan 2027 (Asia/Kolkata)**; from 6 Jan 2027 local
midnight, active `premium` entitlement is required (client UI + server checks on
paid mutations). Set `REVENUECAT_SECRET_API_KEY` on the server before that date
so paying members keep access.

## Guided setup

Run the interactive wizard (opens store/RevenueCat URLs, writes public keys to
`apps/native/.env`):

```bash
pnpm --filter native setup:revenuecat
# or: bash apps/native/scripts/setup-revenuecat.sh
```

## Configuration checklist

1. In RevenueCat, create one project with an iOS app matching
   `com.rdm.app` and an Android app matching `com.rdm.app`. Connect each to
   App Store Connect / Google Play Console as appropriate.
2. Create store subscription products (suggested: monthly + yearly), mirror them
   in RevenueCat, attach them to entitlement **`premium`**, then add packages to
   the **current** offering (e.g. `$rc_monthly`, `$rc_annual`).
   In RevenueCat Project settings > General, set restore/transfer behavior to
   **Keep with original App User ID** for production and sandbox so membership
   stays bound to the Better Auth account that purchased it.
3. Set these **public** values for each Expo/EAS build environment that should
   expose subscriptions (and in ignored `apps/native/.env` for local
   development):
   - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`: RevenueCat public SDK key for the
     iOS app.
   - `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`: RevenueCat public SDK key for
     the Android app.
   - `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=premium`
   If a platform public key is set but the entitlement id env is omitted, the
   app defaults the entitlement id to `premium`. Do not place RevenueCat
   **secret** API keys, store credentials, or service account credentials in
   `EXPO_PUBLIC_*` variables.
4. Build a new native app after adding the SDK; OTA updates / Expo Go cannot
   add native billing modules to an existing APK. Expo Go's Preview API Mode
   can render the screen but cannot perform real purchases. Do not publish an
   APK until accounts, products, offering, and keys are ready.
5. For Google Play sandbox, upload a signed build with the matching package ID
   to a closed test track, add the Play account to license testing and the
   track, and opt in on the device. For Apple, create a sandbox tester in App
   Store Connect and test a native build / TestFlight. Verify purchase,
   cancellation, restore, expiration, restart, sign-out, and account switching
   against RevenueCat's customer dashboard on each platform.

## Phase 1 acceptance (per platform)

- Membership lists localized plans (not “coming soon”).
- Purchase → status Active; kill/relaunch still Active for the same user.
- Restore works; Manage opens `managementURL` when available.
- Sign-out / other account does not leak Active.
- Cancel / expire in sandbox → Inactive.

## Runtime notes

The mobile SDK is initialized once per process only after Better Auth provides
`session.user.id`. Switching to a different signed-in user uses RevenueCat
`logIn`; sign-out clears the app-visible state without creating an anonymous
RevenueCat ID. The Membership screen loads the current offering on demand and
uses RevenueCat's localized product prices and `CustomerInfo.managementURL`.

If paid server endpoints are added later, **do not trust an entitlement flag
from the app**. The Hono/tRPC server should authenticate the Better Auth user,
query RevenueCat's server-side subscriber/entitlement API using a secret key
held only on the server (or maintain a webhook-fed server cache with freshness
and reconciliation), and authorize the specific operation there. Decide
transfer behavior, webhook verification, caching/expiry, and outage policy
before launch. No backend feature gating is implemented today.

Relevant official guidance: [Expo installation](https://www.revenuecat.com/docs/getting-started/installation/expo),
[customer identity](https://www.revenuecat.com/docs/customers/identifying-customers),
[CustomerInfo](https://www.revenuecat.com/docs/customers/customer-info),
[restore](https://www.revenuecat.com/docs/getting-started/restoring-purchases),
[restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior),
[Google Play sandbox](https://www.revenuecat.com/docs/test-and-launch/sandbox/google-play-store),
[Apple sandbox](https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store).
