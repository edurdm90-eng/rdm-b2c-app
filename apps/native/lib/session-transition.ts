type PreparePostLoginSessionOptions = {
  isNative: boolean;
  refreshSession: () => Promise<void>;
  verifySession: () => Promise<boolean>;
};

/**
 * Confirms that Better Auth accepted the persisted credential, then refreshes
 * its mounted React session state before Expo Router enters protected routes.
 */
export async function preparePostLoginSession({
  isNative,
  refreshSession,
  verifySession,
}: PreparePostLoginSessionOptions): Promise<boolean> {
  if (!await verifySession()) return false;
  if (isNative) await refreshSession();
  return true;
}
