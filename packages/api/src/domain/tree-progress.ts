type CareRecord = { kind: string; dayKey: string };

export function treeCareProgress(care: ReadonlyArray<CareRecord>, todayDayKey: string) {
  const days = new Set(care.map((entry) => entry.dayKey));
  const cursor = new Date(`${todayDayKey}T00:00:00.000Z`);
  if (!days.has(todayDayKey)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return {
    fertilizerCount: care.filter((entry) => entry.kind === "fertilizer").length,
    waterCount: care.filter((entry) => entry.kind === "water").length,
    sunlightCount: care.filter((entry) => entry.kind === "sunlight").length,
    streak,
  };
}

export function availableTreePenalty(reward: number, remorse: number, requested: number) {
  const available = Math.max(0, Math.floor(reward));
  const appliedAmount = Math.min(available, Math.max(0, Math.floor(requested)));
  return {
    appliedAmount,
    rewardBalance: available - appliedAmount,
    remorseBalance: Math.max(0, Math.floor(remorse)) + appliedAmount,
  };
}
