# RevenueCat membership setup

The native app includes a Membership page under Account. It does not gate any
existing feature, alter RDM balances, or sell RDM. Until configured, it shows
“Subscriptions coming soon.” The selected entitlement ID and the features it
will eventually unlock are product decisions, not hard-coded business rules.

## Configuration to supply later

1. In RevenueCat, create one project with an iOS app matching
   `com.rdm.app` and an Android app matching `com.rdm.app`. Connect each to
   App Store Connect / Google Play Console as appropriate.
2. Create the store subscription products and pricing, mirror them in
   RevenueCat, attach them to a single entitlement, then add packages to a
   current/default offering. Decide the entitlement identifier and the exact
   premium benefits before any feature-gating work.
   In RevenueCat Project settings > General, decide the restore/transfer
   behavior before testing purchases. The default **transfers** a purchase
   from account A to account B if B restores it. If membership must stay bound
   to the original Better Auth account, select **Keep with original App User ID**
   for both production and sandbox, and plan for account-recovery support.
3. Set these **public** values for each Expo/EAS build environment that should
   expose subscriptions (and, optionally, in ignored `apps/native/.env` for
   local development):
   - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`: RevenueCat public SDK key for the
     iOS app.
   - `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`: RevenueCat public SDK key for
     the Android app.
   - `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`: exact entitlement identifier in
     RevenueCat, shared by both stores.
   A missing platform key or entitlement leaves that platform unconfigured.
   Do not place RevenueCat secret API keys, store credentials, or service
   account credentials in `EXPO_PUBLIC_*` variables.
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
