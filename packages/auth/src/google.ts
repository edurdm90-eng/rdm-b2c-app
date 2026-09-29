export type GoogleOAuthEnvironment = {
  clientId?: string;
  clientSecret?: string;
};

type GoogleProviderOptions = {
  required?: boolean;
};

/**
 * Google is the production identity provider, so a verified Google identity
 * may claim an existing legacy credential user with the same email address.
 * Different-email linking remains disabled to prevent account takeover.
 */
export function googleAccountLinkingConfig() {
  return {
    enabled: true,
    trustedProviders: ["google"],
    allowDifferentEmails: false,
    updateUserInfoOnLink: false,
  };
}

/**
 * Keeps OAuth disabled in environments without credentials, while refusing a
 * partial configuration that would otherwise fail only after a user taps the
 * Google button.
 */
export function googleProviderConfig(environment: GoogleOAuthEnvironment, options: GoogleProviderOptions = {}) {
  const { clientId, clientSecret } = environment;
  if (!clientId && !clientSecret) {
    if (options.required) {
      throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required when Google is the production login method.");
    }
    return undefined;
  }
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together.");
  }

  return {
    clientId,
    clientSecret,
    // Avoid silently choosing a shared device's last-used Google account.
    prompt: "select_account" as const,
    // RDM needs only the verified identity, not Drive/Gmail access or an
    // offline refresh token.
    scope: ["openid", "email", "profile"],
  };
}
