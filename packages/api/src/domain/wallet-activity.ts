type Purse = "base" | "reward" | "remorse" | "peer";
type Direction = "in" | "out";

export function walletActivity(kind: string, amount: number): { purse: Purse | null; direction: Direction | null } {
  // Historical missed-day transactions store a negative amount, but the
  // allocation is credited TO Remorse; the sign is not a purse debit.
  if (kind === "remorse") return { purse: "remorse", direction: amount === 0 ? null : "in" };
  const purseByKind: Record<string, Purse> = {
    airdrop: "base", stake: "base", habit: "reward", goal: "reward",
    game: "reward", gratitude: "reward", deed: "reward", peer: "peer",
    charity: "remorse", redeem: "reward",
  };
  const purse = purseByKind[kind] ?? null;
  return { purse, direction: purse && amount !== 0 ? amount > 0 ? "in" : "out" : null };
}
