type SearchParams = Record<string, unknown>;

const groupDestinations = {
  group: "/(app)/group/[id]",
  "group-invite": "/(app)/group/[id]/invite",
  "group-winners": "/(app)/group/[id]/winners",
  "group-result": "/(app)/group/[id]/result",
} as const;

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
  if (params.returnTo === "group-new") return { pathname: "/(app)/group/new" } as const;
  if (params.returnTo === "group-join") {
    const code = typeof params.code === "string" ? params.code.trim().toUpperCase() : "";
    return {
      pathname: "/(app)/group/new",
      params: { mode: "join", ...(/^[A-Z0-9]{6}$/.test(code) ? { code } : {}) },
    } as const;
  }
  if (
    typeof params.returnTo === "string"
    && Object.hasOwn(groupDestinations, params.returnTo)
    && typeof params.groupId === "string"
    && /^[a-f\d]{24}$/i.test(params.groupId)
  ) {
    return {
      pathname: groupDestinations[params.returnTo as keyof typeof groupDestinations],
      params: { id: params.groupId },
    };
  }
  return { pathname: "/(app)/(tabs)" } as const;
}
