type RawRecord = Record<string, unknown>;

const initialTransactions = [
  { title: "Deep Work Focus — reflection", amount: 25, kind: "habit" },
  { title: "Word Sprint game", amount: 8, kind: "game" },
  { title: "Missed pledge — Hydration", amount: -10, kind: "remorse" },
  { title: "Awarded by Family group", amount: 15, kind: "peer" },
  { title: "Gift to Plant a Tree Trust", amount: -20, kind: "charity" },
];

const initialBadges = new Set([
  "first-sprout", "seven-day-streak", "group-starter", "first-game", "three-day",
  "community-hand", "hydration-start", "thirty-pledges", "first-charity",
]);

function matches(record: RawRecord, expected: RawRecord) {
  return Object.entries(expected).every(([key, value]) => record[key] === value);
}

function emptyArray(value: unknown) {
  return value === undefined || Array.isArray(value) && value.length === 0;
}

export function isUnmodifiedDemoHabit(habit: RawRecord) {
  const neverStartedFields = [
    "rdmPledgeCreationId", "rdmPledgePerDay", "rdmPledgeTotal", "rdmPledgeRemaining",
    "rdmPledgeStartDayKey", "rdmPledgeEndDayKey", "rdmPledgeTimeZone", "rdmPledgeFundingStatus",
    "rdmPledgeWeekdays", "lastCompletedDayKey", "lastSettledDayKey", "currentDayKey", "lastOutcome",
  ];
  return matches(habit, {
    title: "Deep Work Focus", category: "Focus", icon: "target", cadence: "Daily",
    target: "90 minutes",
    pledge: "90 minutes of undistracted work, phone in another room, every weekday after lunch.",
    source: "template", stage: "reflect", streak: 18, cycle: 1, active: true,
    lastAction: "Logged today · 92 minutes · No interruptions",
    reflection: "Felt easier today — putting the phone in the other room really helped.",
  })
    && neverStartedFields.every((key) => habit[key] === undefined)
    && ["rdmPledgeSettledDayKeys", "rdmPledgeCompletedDayKeys", "dayEntries"].every((key) => emptyArray(habit[key]))
    && Array.isArray(habit.completedDays)
    && habit.completedDays.length === 3
    && habit.completedDays.every((day, index) => day === index + 1);
}

export function planLegacyDemoCleanup({ profile, habits, relatedActivityCount }: {
  profile: RawRecord;
  habits: ReadonlyArray<RawRecord>;
  relatedActivityCount: number;
}): { action: "reset" | "review" | "skip"; demoHabitCount: number } {
  const demoHabitCount = habits.filter(isUnmodifiedDemoHabit).length;
  if (Object.hasOwn(profile, "dataVersion")) return { action: "skip", demoHabitCount };
  const transactions = profile.transactions;
  const badges = profile.unlockedBadges;
  const pristine = matches(profile, {
    xp: 640, level: 7, streak: 18, plantStage: "Budding",
    walletBalance: 1240, rewardBalance: 320, remorseBalance: 40, peerBalance: 15,
    treePledgeAmount: 0, treeWaterCount: 0, treeSunlightCount: 0,
  })
    && profile.treePledgedAt === undefined
    && ["treeLastWateredAt", "treeLastSunlightAt", "treeLastMissedDayKey", "treeLastEvaluatedDayKey", "treeMissedProcessedAt"].every((key) => profile[key] === undefined)
    && (profile.weeklyInvites === undefined || profile.weeklyInvites === 0)
    && ["creditedOperations", "treeCareOperations", "creditedReferrals", "unlockedRewards", "collectibles"].every((key) => emptyArray(profile[key]))
    && (emptyArray(badges) || Array.isArray(badges) && badges.length === initialBadges.size
      && new Set(badges).size === initialBadges.size && badges.every((badge) => initialBadges.has(String(badge))))
    && Array.isArray(transactions) && transactions.length === initialTransactions.length
    && transactions.every((transaction, index) => {
      if (!transaction || typeof transaction !== "object") return false;
      const raw = transaction as RawRecord;
      return raw.operationId === undefined && matches(raw, initialTransactions[index]!);
    });
  return {
    action: pristine && relatedActivityCount === 0 && habits.length === demoHabitCount && demoHabitCount <= 1
      && typeof profile.userId === "string" && profile.userId.length > 0
      && habits.every((habit) => habit.userId === profile.userId)
      ? "reset" : "review",
    demoHabitCount,
  };
}
