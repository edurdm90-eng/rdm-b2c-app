# Google authentication

RDM uses Better Auth's Expo integration for Google OAuth. Authentication opens
the system browser and returns to the mobile app through the `rdm-b2c://` deep
link; Google credentials never enter the app bundle.

## Required server configuration

Create a **Web application** OAuth client in Google Cloud. Set these server
environment variables locally and in Vercel:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Set this public build variable to show the Google button in the native app only
after both server variables are present in the matching server environment:

```text
EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true
```

Register these exact authorized redirect URIs in Google Cloud:

```text
http://localhost:3000/api/auth/callback/google
https://rdm-b2c-server-rho.vercel.app/api/auth/callback/google
```

`BETTER_AUTH_URL` must match the active server origin. Better Auth derives the
callback URL from it, so a mismatched value causes `redirect_uri_mismatch`.

Google login remains intentionally disabled in the server when neither Google
variable is present, and hidden in the app until its public feature flag is
enabled. Providing only one server variable fails startup rather than exposing
a button that will always fail.

## Security and session behavior

- Only `openid`, `email`, and `profile` scopes are requested.
- Google always shows account selection, which is safer on shared devices.
- OAuth tokens are encrypted at rest; they are not exposed to the native app.
- Google accounts with a verified matching email can be linked to an existing
  RDM account. Different-email linking is blocked.
- Sessions last 14 days and refresh no more than once per day. The app stores
  the signed session token only in Expo SecureStore and sends it as a signed
  bearer token for API calls.
