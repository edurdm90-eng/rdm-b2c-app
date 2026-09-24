const SESSION_COOKIE_NAMES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
];

/** Extracts Better Auth's signed session token from Expo's stored cookie jar. */
export function sessionTokenFromCookie(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name && SESSION_COOKIE_NAMES.includes(name) && value.length > 0) {
      return value.join("=");
    }
  }
  return null;
}
