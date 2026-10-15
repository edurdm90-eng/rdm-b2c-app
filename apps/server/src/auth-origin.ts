import { PRODUCTION_AUTH_ORIGIN } from "@rdm-b2c/auth/branding";

type RuntimeEnvironment = "development" | "production" | "test";

export function canonicalAuthRedirect(
  request: Request,
  nodeEnv: RuntimeEnvironment,
): Response | null {
  if (nodeEnv !== "production") return null;

  const requestURL = new URL(request.url);
  if (requestURL.origin === PRODUCTION_AUTH_ORIGIN) return null;

  const canonicalURL = new URL(`${requestURL.pathname}${requestURL.search}`, PRODUCTION_AUTH_ORIGIN);
  return new Response(null, {
    headers: { location: canonicalURL.toString() },
    // Preserve POST and its body while moving the request to the canonical
    // host, before Better Auth creates a host-bound OAuth state cookie.
    status: 308,
  });
}
