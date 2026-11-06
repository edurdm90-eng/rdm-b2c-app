export const AUTH_APPLICATION_NAME = "RDM";
/** Public API / OAuth host while the custom domain is unavailable. */
export const PRODUCTION_AUTH_ORIGIN = "https://rdm-b2c-app-xi.vercel.app";

type RuntimeEnvironment = "development" | "production" | "test";

export function authBaseURLConfig(baseURL: string, nodeEnv: RuntimeEnvironment) {
  if (nodeEnv !== "production") return baseURL;
  return PRODUCTION_AUTH_ORIGIN;
}
