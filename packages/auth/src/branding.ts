export const AUTH_APPLICATION_NAME = "RDM";
export const PRODUCTION_AUTH_ORIGIN = "https://www.rdmtoken.org";

type RuntimeEnvironment = "development" | "production" | "test";

export function authBaseURLConfig(baseURL: string, nodeEnv: RuntimeEnvironment) {
  if (nodeEnv !== "production") return baseURL;
  return PRODUCTION_AUTH_ORIGIN;
}
