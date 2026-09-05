import { goodDeedCatalog } from "@rdm-b2c/db/good-deeds";

export { goodDeedCatalog } from "@rdm-b2c/db/good-deeds";
export type { GoodDeedId } from "@rdm-b2c/db/good-deeds";

export const habitCategories = ["Focus", "Health", "Money", "Sustainability"] as const;

export type HabitCategory = (typeof habitCategories)[number];

export const gratitudeCategories = [
  {
    id: "life",
    icon: "notebook-heart-outline",
    title: "All good things in your life",
    subtitle: "Opens a journal entry",
    journalTitle: "Gratitude Journal",
    journalSubtitle: "ALL GOOD THINGS IN YOUR LIFE",
    prompt: "What are you grateful for today?",
    placeholder: "Today I'm grateful for a calm morning, a good cup of coffee, and…",
    rewardMessage: "Added to your Reward Purse for today's gratitude entry.",
  },
  {
    id: "helper",
    icon: "handshake-outline",
    title: "Anyone who helped you this week",
    subtitle: "Pick a name, send thanks",
    journalTitle: "Helped Me This Week",
    journalSubtitle: "THANK SOMEONE WHO SHOWED UP",
    prompt: "Who helped you this week, and what would you like to thank them for?",
    placeholder: "This week, I'm thankful to… because…",
    rewardMessage: "Added to your Reward Purse for thanking someone who helped this week.",
  },
  {
    id: "loved-ones",
    icon: "heart-outline",
    title: "Your near and dear ones",
    subtitle: "Family, always first",
    journalTitle: "Loved Ones Journal",
    journalSubtitle: "YOUR NEAR AND DEAR ONES",
    prompt: "Who close to you are you grateful for today, and why?",
    placeholder: "Today, someone close to me made a difference by…",
    rewardMessage: "Added to your Reward Purse for appreciating someone close to you.",
  },
  {
    id: "friends",
    icon: "party-popper",
    title: "Your friends",
    subtitle: "A quick note goes a long way",
    journalTitle: "Friendship Journal",
    journalSubtitle: "APPRECIATE A FRIEND",
    prompt: "Which friend made life better recently, and how?",
    placeholder: "I'm grateful for my friend… because…",
    rewardMessage: "Added to your Reward Purse for celebrating a friend today.",
  },
  {
    id: "colleagues",
    icon: "briefcase-outline",
    title: "Your colleagues",
    subtitle: "Recognize a small assist",
    journalTitle: "Colleague Appreciation",
    journalSubtitle: "RECOGNIZE A SMALL ASSIST",
    prompt: "Which colleague helped you recently, and what did you appreciate?",
    placeholder: "A colleague helped me by… and I appreciated…",
    rewardMessage: "Added to your Reward Purse for recognizing a colleague today.",
  },
] as const;

export type GratitudeCategoryId = (typeof gratitudeCategories)[number]["id"];

export function gratitudeCategoryById(id: string) {
  return gratitudeCategories.find((category) => category.id === id) ?? null;
}

export const goodDeedRewardMessage = "Added to your Reward Purse for today's good deeds.";
export const treeMissedDayPenalty = 10;

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function dayKeyForTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function previousDayKeyForTimeZone(date: Date, timeZone: string) {
  const today = dayKeyForTimeZone(date, timeZone);
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - 1))
    .toISOString()
    .slice(0, 10);
}

export function calendarDayKeysAfter(startExclusive: string, endInclusive: string) {
  const cursor = new Date(`${startExclusive}T00:00:00.000Z`);
  const end = new Date(`${endInclusive}T00:00:00.000Z`);
  const days: string[] = [];
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function habitPledgeSchedule({
  startDayKey,
  endDayKey,
  dailyPledge,
}: {
  startDayKey: string;
  endDayKey: string;
  dailyPledge: number;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDayKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endDayKey)) {
    return null;
  }
  const start = new Date(`${startDayKey}T00:00:00.000Z`);
  const end = new Date(`${endDayKey}T00:00:00.000Z`);
  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || start.toISOString().slice(0, 10) !== startDayKey
    || end.toISOString().slice(0, 10) !== endDayKey
    || !Number.isInteger(dailyPledge)
    || dailyPledge <= 0
  ) {
    return null;
  }
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (dayCount <= 0) return null;
  const dayKeys = Array.from({ length: dayCount }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
  return {
    dayKeys,
    dayCount,
    totalPledge: dayCount * dailyPledge,
  };
}

export function missedHabitPledgeDayKeys(
  scheduledDayKeys: ReadonlyArray<string>,
  settledDayKeys: ReadonlyArray<string>,
  currentDayKey: string,
) {
  const settled = new Set(settledDayKeys);
  return scheduledDayKeys.filter((dayKey) => dayKey < currentDayKey && !settled.has(dayKey));
}

export function habitPledgeDestinationForOperation(
  transactions: ReadonlyArray<{ kind: string; operationId?: string }>,
  operationId: string,
) {
  const transaction = transactions.find((entry) => entry.operationId === operationId);
  if (transaction?.kind === "habit") return "reward" as const;
  if (transaction?.kind === "remorse") return "remorse" as const;
  return null;
}

export function missedTreeDayKey({
  pledgedAt,
  now,
  timeZone,
  caredForYesterday,
}: {
  pledgedAt: Date | null;
  now: Date;
  timeZone: string;
  caredForYesterday: boolean;
}) {
  if (!pledgedAt || caredForYesterday) return null;
  const previousDayKey = previousDayKeyForTimeZone(now, timeZone);
  return dayKeyForTimeZone(pledgedAt, timeZone) <= previousDayKey
    ? previousDayKey
    : null;
}

export function habitCanStartNextCycle(
  lastCompletedDayKey: string | null | undefined,
  currentDayKey: string,
) {
  return lastCompletedDayKey !== currentDayKey;
}

export function rewardToRemorseTransfer(
  rewardBalance: number,
  remorseBalance: number,
  requestedAmount: number,
) {
  const safeReward = Math.max(0, Math.floor(rewardBalance));
  const safeRemorse = Math.max(0, Math.floor(remorseBalance));
  const appliedAmount = Math.max(0, Math.floor(requestedAmount));
  if (safeReward < appliedAmount) return null;
  return {
    appliedAmount,
    rewardBalance: safeReward - appliedAmount,
    remorseBalance: safeRemorse + appliedAmount,
  };
}

export function basePurseAfterPledge(baseBalance: number, pledgeAmount: number) {
  const safeBase = Math.max(0, Math.floor(baseBalance));
  const safePledge = Math.max(0, Math.floor(pledgeAmount));
  return safeBase >= safePledge ? safeBase - safePledge : null;
}

export type WalletBalances = {
  balance: number;
  reward: number;
  remorse: number;
  peer: number;
};

export function basePurseBalance(wallet: WalletBalances) {
  const totalBalance = Math.max(0, Math.floor(wallet.balance));
  const allocatedBalance = [wallet.reward, wallet.remorse, wallet.peer]
    .reduce((total, balance) => total + Math.max(0, Math.floor(balance)), 0);
  return Math.max(0, totalBalance - allocatedBalance);
}

export function releaseHabitPledgeBalances(
  wallet: WalletBalances,
  destination: "reward" | "remorse",
  amount: number,
) {
  const releasedAmount = Math.max(0, Math.floor(amount));
  return {
    ...wallet,
    balance: wallet.balance + releasedAmount,
    [destination]: wallet[destination] + releasedAmount,
  };
}

export function baseToRemorseTransfer(wallet: WalletBalances, penalty: number) {
  const appliedPenalty = Math.min(
    basePurseBalance(wallet),
    Math.max(0, Math.floor(penalty)),
  );
  return {
    appliedPenalty,
    wallet: {
      ...wallet,
      remorse: wallet.remorse + appliedPenalty,
    },
  };
}

export function goodDeedById(id: string) {
  return goodDeedCatalog.find((deed) => deed.id === id) ?? null;
}

export function goodDeedSubmissionResult(
  actions: ReadonlyArray<{ completedNow: boolean; reward: number }>,
) {
  const completedActions = actions.filter((action) => action.completedNow);
  return {
    reward: completedActions.reduce((total, action) => total + action.reward, 0),
    completedCount: completedActions.length,
    alreadyCompleted: actions.length - completedActions.length,
  };
}

const treeGrowthStages = [
  { minimum: 0, stage: "Seedling" },
  { minimum: 3, stage: "Sprouting" },
  { minimum: 7, stage: "Growing" },
  { minimum: 14, stage: "Budding" },
  { minimum: 30, stage: "Flourishing" },
  { minimum: 60, stage: "Thriving" },
] as const;

export function treeGrowthFor(streak: number, careActionCount: number) {
  const safeStreak = Math.max(0, Math.floor(streak));
  const safeCareActionCount = Math.max(0, Math.floor(careActionCount));
  const points = safeStreak + safeCareActionCount;
  const stageIndex = treeGrowthStages.findLastIndex((item) => points >= item.minimum);
  const current = treeGrowthStages[Math.max(0, stageIndex)] ?? treeGrowthStages[0];
  const next = treeGrowthStages[stageIndex + 1];
  const progress = next
    ? Math.min(1, (points - current.minimum) / (next.minimum - current.minimum))
    : 1;

  return {
    points,
    stage: current.stage,
    progress,
    artworkWidth: Math.min(180, 96 + points * 3),
  };
}

export const habitTemplates = [
  {
    id: "deep-work",
    title: "Deep Work Focus",
    subtitle: "90 min undistracted blocks · Daily",
    category: "Focus",
    icon: "target",
    cadence: "Daily",
    target: "90 minutes",
    pledge: "90 minutes of undistracted work, phone in another room, every weekday after lunch.",
  },
  {
    id: "hydration",
    title: "Hydration Habit",
    subtitle: "8 glasses tracked · Daily",
    category: "Health",
    icon: "water-outline",
    cadence: "Daily",
    target: "8 glasses",
    pledge: "Drink eight glasses of water throughout the day and check in before bed.",
  },
  {
    id: "no-spend",
    title: "No-Spend Days",
    subtitle: "3 discretionary-free days/week",
    category: "Money",
    icon: "cash-remove",
    cadence: "3 days / week",
    target: "No discretionary spending",
    pledge: "Choose three days each week with no discretionary purchases.",
  },
  {
    id: "digital-sunset",
    title: "Digital Sunset",
    subtitle: "Screens off by 9:30pm · Daily",
    category: "Focus",
    icon: "cellphone-off",
    cadence: "Daily",
    target: "Screens off by 9:30pm",
    pledge: "Put every personal screen away by 9:30pm each night.",
  },
  {
    id: "movement",
    title: "Movement Streak",
    subtitle: "20 min activity · Daily",
    category: "Health",
    icon: "run",
    cadence: "Daily",
    target: "20 minutes",
    pledge: "Move intentionally for at least 20 minutes every day.",
  },
  {
    id: "community-hour",
    title: "Community Hour",
    subtitle: "1 volunteer hour · Weekly",
    category: "Sustainability",
    icon: "sprout",
    cadence: "Weekly",
    target: "1 volunteer hour",
    pledge: "Give one focused hour to a community or environmental cause each week.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  subtitle: string;
  category: HabitCategory;
  icon: string;
  cadence: string;
  target: string;
  pledge: string;
}>;

export const gameCatalog = [
  { id: "breath-reset", title: "Breath Reset", description: "Calm the mind", minutes: 1, icon: "weather-windy", mechanic: "breath", instruction: "Follow the guided breath and tap as each phase completes.", actionLabel: "Complete breath phase" },
  { id: "word-sprint", title: "Word Sprint", description: "Quick focus play", minutes: 2, icon: "format-letter-case", mechanic: "word", instruction: "Find one word that starts with the prompt letter, then bank it.", actionLabel: "Bank this word" },
  { id: "pattern-match", title: "Pattern Match", description: "Light mental reset", minutes: 3, icon: "shape-outline", mechanic: "pattern", instruction: "Match the highlighted symbol before the pattern changes.", actionLabel: "Match pattern" },
  { id: "gratitude-tap", title: "Gratitude Tap", description: "Reflect briefly", minutes: 2, icon: "heart-outline", mechanic: "gratitude", instruction: "Choose a small thing you appreciate right now.", actionLabel: "Add gratitude" },
  { id: "box-breathing", title: "Box Breathing", description: "4-4-4-4 pace", minutes: 1, icon: "square-outline", mechanic: "box", instruction: "Move through inhale, hold, exhale, and hold in equal beats.", actionLabel: "Advance one side" },
  { id: "sort-sprint", title: "Sort Sprint", description: "Beat your best", minutes: 3, icon: "sort", mechanic: "sort", instruction: "Pick the smallest visible number to clear each set.", actionLabel: "Choose smallest" },
] as const;

export const rewardCatalog = [
  { id: "focus-garden", title: "Focus Garden skin", cost: 50 },
] as const;

export const badgeCatalog = [
  { id: "first-sprout", title: "First Sprout", tier: "Bronze", icon: "sprout" },
  { id: "seven-day-streak", title: "7-Day Streak", tier: "Bronze", icon: "fire" },
  { id: "group-starter", title: "Group Starter", tier: "Bronze", icon: "account-group-outline" },
  { id: "first-game", title: "First Reset", tier: "Bronze", icon: "gamepad-variant-outline" },
  { id: "three-day", title: "Three Good Days", tier: "Bronze", icon: "calendar-check-outline" },
  { id: "community-hand", title: "Helping Hand", tier: "Bronze", icon: "hand-heart-outline" },
  { id: "hydration-start", title: "Hydration Start", tier: "Bronze", icon: "water-outline" },
  { id: "honest-reset", title: "Honest Reset", tier: "Bronze", icon: "backup-restore" },
  { id: "thirty-pledges", title: "30 Pledges", tier: "Silver", icon: "target" },
  { id: "first-charity", title: "First Charity Gift", tier: "Silver", icon: "heart" },
  { id: "full-bloom", title: "Full Bloom", tier: "Silver", icon: "flower" },
  { id: "focused-hour", title: "Focused Hour", tier: "Silver", icon: "timer-sand-complete" },
  { id: "group-finisher", title: "Group Finisher", tier: "Silver", icon: "account-multiple-check-outline" },
  { id: "reflection-journal", title: "Reflection Journal", tier: "Silver", icon: "book-open-page-variant-outline" },
  { id: "early-riser", title: "Early Riser", tier: "Silver", icon: "weather-sunset-up" },
  { id: "steady-month", title: "Steady Month", tier: "Silver", icon: "shield-star-outline" },
  { id: "top-ten", title: "Top 10 Weekly", tier: "Gold", icon: "crown-outline" },
  { id: "hundred-day", title: "100-Day Legend", tier: "Gold", icon: "temple-hindu" },
  { id: "ancient-growth", title: "Ancient Growth", tier: "Gold", icon: "tree-outline" },
  { id: "game-master", title: "Responsible Master", tier: "Gold", icon: "trophy-outline" },
  { id: "five-groups", title: "Community Builder", tier: "Gold", icon: "star-four-points-outline" },
  { id: "planet-positive", title: "Planet Positive", tier: "Gold", icon: "earth" },
  { id: "year-of-growth", title: "Year of Growth", tier: "Gold", icon: "infinity" },
  { id: "golden-bloom", title: "Golden Bloom", tier: "Gold", icon: "diamond-stone" },
] as const;

export const initialBadgeIds = [
  "first-sprout",
  "seven-day-streak",
  "group-starter",
  "first-game",
  "three-day",
  "community-hand",
  "hydration-start",
  "thirty-pledges",
  "first-charity",
] as const;

const gameChallenges: Partial<Record<(typeof gameCatalog)[number]["id"], string>> = {
  "word-sprint": "Beat Priya's 340",
  "sort-sprint": "Beat Ravi's 12",
};

export function challengeForGame(gameId: string) {
  return gameChallenges[gameId as (typeof gameCatalog)[number]["id"]] ?? null;
}

export function gameDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function inviteWeekKey(date = new Date()) {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function rewardForGame(minutes: number, score: number) {
  const safeMinutes = Math.min(3, Math.max(1, Math.round(minutes)));
  const safeScore = Math.max(0, score);
  return Math.min(12, safeMinutes * 2 + Math.floor(safeScore / 100));
}

export function levelForXp(xp: number) {
  return Math.max(1, Math.floor(Math.max(0, xp) / 100) + 1);
}

export function awardSplitIsValid(amounts: number[], pool: number) {
  return amounts.every((amount) => Number.isInteger(amount) && amount >= 0) &&
    amounts.reduce((total, amount) => total + amount, 0) === pool;
}

export function gameSessionCanReward(
  status: "running" | "complete",
  expiresAt: Date,
  now = new Date(),
) {
  return status === "running" && now.getTime() <= expiresAt.getTime();
}

export function debitPurseBalances(walletBalance: number, purseBalance: number, amount: number) {
  if (amount < 0 || purseBalance < amount || walletBalance < amount) return null;
  return { walletBalance: walletBalance - amount, purseBalance: purseBalance - amount };
}

export function groupAwardCredits(members: ReadonlyArray<{ userId?: string }>, amounts: ReadonlyArray<number>) {
  return members.flatMap((member, index) => {
    const amount = amounts[index] ?? 0;
    return member.userId && amount > 0 ? [{ userId: member.userId, amount }] : [];
  });
}
