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

Register these exact authorized redirect URIs in Google Cloud:

```text
http://localhost:3000/api/auth/callback/google
https://www.rdmtoken.org/api/auth/callback/google
```

Production must use `BETTER_AUTH_URL=https://www.rdmtoken.org`. Better Auth
derives the callback URL and OAuth state-cookie host from this value, so the
native server URL, Better Auth URL, and Google redirect origin must remain the
same. A mismatch can cause `redirect_uri_mismatch` or a rejected OAuth state
after Google sends the user back.

Production also pins Better Auth's public application name to `RDM` and its
OAuth callback host to `www.rdmtoken.org`. Production auth requests that reach
a Vercel preview or stale deployment URL are redirected to the branded public
domain before Better Auth creates its host-bound OAuth state cookie. This keeps
the provider hostname out of Google's account chooser without causing an OAuth
state mismatch.

## Google account chooser branding

The name and logo shown by Google's account chooser are controlled by the
Google Cloud project, not by Better Auth or the Expo app. In **Google Auth
Platform → Branding**, configure:

- App name: `RDM`
- Authorized domain: `rdmtoken.org`
- Homepage, privacy policy, and terms URLs hosted on `rdmtoken.org`
- The RDM logo and a monitored company support email

For a public production app, verify and publish the branding after saving it.
Unverified branding can cause Google to show only the callback domain instead
of the RDM product name. Keep the OAuth client's production redirect URI set to
`https://www.rdmtoken.org/api/auth/callback/google`; do not register or retain a
`vercel.app` redirect for production.

Google is the native app's only sign-in method, so its button is always visible.
Every runnable server requires both Google variables, preventing an environment
that looks healthy while its only native login method is unavailable. Automated
unit tests may omit them; local development, previews and production may not.
Email/password endpoints are disabled outside the test environment, and both the
native and web clients use the same Google provider.

## Security and session behavior

- Only `openid`, `email`, and `profile` scopes are requested.
- Google always shows account selection, which is safer on shared devices.
- OAuth tokens are encrypted at rest; they are not exposed to the native app.
- Google accounts with a verified matching email can be linked to an existing
  RDM account. Different-email linking is blocked.
- Sessions last 14 days and refresh no more than once per day. The app stores
  the signed session token only in Expo SecureStore and sends it as a signed
  bearer token for API calls.
