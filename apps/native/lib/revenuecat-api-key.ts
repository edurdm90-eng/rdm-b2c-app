/**
 * RevenueCat `test_…` Test Store keys force-close release/preview binaries.
 * Only use them in __DEV__; production-signed APKs need appl_/goog_ public keys.
 */
export function resolveRevenueCatPublicApiKey(
  key: string | undefined,
  options: { isDev?: boolean } = {},
): string | undefined {
  if (!key) return undefined;
  const isDev = options.isDev ?? __DEV__;
  if (key.startsWith("test_") && !isDev) return undefined;
  return key;
}
