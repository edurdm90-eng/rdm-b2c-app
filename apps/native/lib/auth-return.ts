type SearchParams = Record<string, unknown>;

const groupDestinations = {
  group: "/(app)/group/[id]",
  "group-invite": "/(app)/group/[id]/invite",
  "group-winners": "/(app)/group/[id]/winners",
  "group-result": "/(app)/group/[id]/result",
} as const;

function validatedLoginReturnParams(params: SearchParams): Record<string, string> {
  if (params.returnTo === "group-new") return { returnTo: "group-new" };
  if (params.returnTo === "group-join") {
    const code = typeof params.code === "string" ? params.code.trim().toUpperCase() : "";
    return { returnTo: "group-join", ...(/^[A-Z0-9]{6}$/.test(code) ? { code } : {}) };
  }
  if (
    typeof params.returnTo === "string"
    && Object.hasOwn(groupDestinations, params.returnTo)
    && typeof params.groupId === "string"
    && /^[a-f\d]{24}$/i.test(params.groupId)
  ) {
    return { returnTo: params.returnTo, groupId: params.groupId };
  }
  return {};
}

export function loginReferralCode(params: SearchParams): string | null {
  const code = typeof params.referralCode === "string" ? params.referralCode.trim().toUpperCase() : "";
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}

export function loginCallbackParams(params: SearchParams): Record<string, string> {
  const referralCode = loginReferralCode(params);
  return {
    ...validatedLoginReturnParams(params),
    ...(referralCode ? { referralCode } : {}),
  };
}

export function loginCallbackPath(params: SearchParams): string {
  const query = new URLSearchParams(loginCallbackParams(params)).toString();
  return query ? `/login?${query}` : "/login";
}

export function groupLoginReturnParams(pathname: string, params: SearchParams): Record<string, string> {
  const path = pathname.replace(/^\/\(app\)/, "");
  if (path === "/group/new") {
    const code = typeof params.code === "string" ? params.code.trim().toUpperCase() : "";
    if (/^[A-Z0-9]{6}$/.test(code)) return { returnTo: "group-join", code };
    return params.mode === "join" ? { returnTo: "group-join" } : { returnTo: "group-new" };
  }
  const groupPath = /^\/group\/([a-f\d]{24})(?:\/(invite|winners|result))?$/i.exec(path);
  if (!groupPath?.[1]) return {};
  return {
    returnTo: groupPath[2] ? `group-${groupPath[2]}` : "group",
    groupId: groupPath[1],
  };
}

export function postLoginDestination(params: SearchParams) {
  const validated = validatedLoginReturnParams(params);
  if (validated.returnTo === "group-new") return { pathname: "/(app)/group/new" } as const;
  if (validated.returnTo === "group-join") {
    return {
      pathname: "/(app)/group/new",
      params: { mode: "join", ...(validated.code ? { code: validated.code } : {}) },
    } as const;
  }
  if (
    validated.returnTo
    && Object.hasOwn(groupDestinations, validated.returnTo)
    && validated.groupId
  ) {
    return {
      pathname: groupDestinations[validated.returnTo as keyof typeof groupDestinations],
      params: { id: validated.groupId },
    };
  }
  return { pathname: "/(app)/(tabs)" } as const;
}
