export function cronAuthorizationStatus(authorization: string | undefined, secret: string | undefined) {
  if (!secret) return 503 as const;
  return authorization === `Bearer ${secret}` ? 200 as const : 401 as const;
}
