/** Extracts Better Auth's signed session token from a cookie jar or Set-Cookie header. */
export function sessionTokenFromCookie(cookie: string): string | null {
  const match = /(?:^|[,;]\s*)(?:__Secure-)?better-auth\.session_token=([^,;]+)/.exec(cookie);
  return match?.[1]?.trim() || null;
}
