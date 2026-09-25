export const colors = {
  background: "#0E1117",
  backgroundDeep: "#05060A",
  panel: "#161B23",
  panelRaised: "#1B212B",
  ink: "#F3F1E9",
  inkSoft: "#8C93A1",
  line: "#262C38",
  growth: "#3FCB8B",
  growthTint: "rgba(63, 203, 139, 0.12)",
  ai: "#5FA6ED",
  aiTint: "rgba(95, 166, 237, 0.12)",
  gold: "#F0B429",
  goldTint: "rgba(240, 180, 41, 0.13)",
  coral: "#E2705A",
  coralTint: "rgba(226, 112, 90, 0.13)",
  plum: "#B39AE8",
  plumTint: "rgba(179, 154, 232, 0.14)",
  danger: "#EF6A6A",
} as const;

export const fonts = {
  body: "Inter_400Regular",
  bodyMedium: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  display: "Fraunces_600SemiBold",
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
} as const;

export const typography = {
  compactMeta: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    lineHeight: 15,
  },
} as const;

export const radii = {
  small: 10,
  medium: 16,
  large: 22,
  pill: 999,
} as const;

export function formatRdm(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatTransactionDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const dayDiff = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (dayDiff <= 0) {
    return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff} days ago`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}
