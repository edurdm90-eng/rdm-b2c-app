import {
  groupGoalCategories as groupGoalCategoryIds,
  groupGoalRewardStructures as groupGoalRewardStructureIds,
  type GroupGoalCategory,
  type GroupGoalRewardStructure,
} from "@rdm-b2c/api/domain/rdm";

export type { GroupGoalCategory, GroupGoalRewardStructure } from "@rdm-b2c/api/domain/rdm";

const categoryPresentation: Record<GroupGoalCategory, { icon: string; description: string }> = {
  Family: { icon: "home-variant-outline", description: "People you live with" },
  Friends: { icon: "account-group-outline", description: "Close friends and peers" },
  Work: { icon: "briefcase-outline", description: "Colleagues and teammates" },
  Social: { icon: "earth", description: "A wider community" },
};

export const groupGoalCategories = groupGoalCategoryIds.map((id) => ({
  id,
  ...categoryPresentation[id],
}));

export type GroupGoalActivity = {
  id: string;
  icon: string;
  title: string;
  description: string;
  target: string;
  unit: string;
};

export const groupGoalActivities: Record<GroupGoalCategory, ReadonlyArray<GroupGoalActivity>> = {
  Family: [
    { id: "family-reading", icon: "book-open-variant", title: "Family Reading Challenge", description: "Read together for 30 minutes every day for 7 days.", target: "210", unit: "minutes" },
    { id: "family-dinner", icon: "silverware-fork-knife", title: "Family Dinner Challenge", description: "Have dinner together at least 5 times this week.", target: "5", unit: "dinners" },
    { id: "family-walk", icon: "walk", title: "Family Walk Challenge", description: "Complete a 30-minute family walk 5 times this week.", target: "150", unit: "minutes" },
    { id: "family-movie", icon: "movie-open-outline", title: "Family Movie Night Goal", description: "Have one screen-time session together as a family each week.", target: "4", unit: "sessions" },
    { id: "family-game", icon: "dice-multiple-outline", title: "Family Game Night Challenge", description: "Play a game together twice this week.", target: "8", unit: "games" },
    { id: "family-cooking", icon: "pot-steam-outline", title: "Cook Together Challenge", description: "Prepare and share 3 meals together this week.", target: "12", unit: "meals" },
    { id: "family-screen-free", icon: "cellphone-off", title: "Screen-Free Family Challenge", description: "Spend at least 1 hour together without personal screens every day.", target: "30", unit: "hours" },
  ],
  Friends: [
    { id: "friends-walk", icon: "run", title: "Morning walk", description: "Move together, at your own pace.", target: "56", unit: "walks" },
    { id: "friends-reading", icon: "book-open-variant", title: "Read a book", description: "Share progress, one page at a time.", target: "56", unit: "pages" },
    { id: "friends-skill", icon: "chart-bar", title: "Practice a skill", description: "Build together, step by step.", target: "7", unit: "sessions" },
  ],
  Work: [
    { id: "work-deep", icon: "target", title: "Deep Work Challenge", description: "Complete two 60-minute distraction-free work sessions every workday.", target: "40", unit: "sessions" },
    { id: "work-planning", icon: "calendar-month-outline", title: "Weekly Planning Goal", description: "Complete weekly planning before the start of each workweek.", target: "4", unit: "plans" },
    { id: "work-skill", icon: "lightbulb-outline", title: "Skill Development Challenge", description: "Spend 30 minutes developing a professional skill for 5 days.", target: "150", unit: "minutes" },
    { id: "work-milestone", icon: "rocket-launch-outline", title: "Project Milestone Challenge", description: "Complete one important project milestone every week.", target: "4", unit: "milestones" },
    { id: "work-collaboration", icon: "handshake-outline", title: "Team Collaboration Goal", description: "Complete 3 meaningful collaborative tasks with teammates each week.", target: "12", unit: "tasks" },
    { id: "work-inbox", icon: "inbox-arrow-down-outline", title: "Inbox Zero Challenge", description: "Clear and organize the work inbox at the end of every workday.", target: "20", unit: "days" },
    { id: "work-break", icon: "coffee-outline", title: "Healthy Break Challenge", description: "Take a proper 5–10 minute break after every focused work session.", target: "40", unit: "breaks" },
  ],
  Social: [
    { id: "social-new-person", icon: "account-plus-outline", title: "Meet Someone New Challenge", description: "Start a meaningful conversation with one new person each week.", target: "4", unit: "conversations" },
    { id: "social-dinner", icon: "silverware-fork-knife", title: "Group Dinner Challenge", description: "Organize one group dinner every week.", target: "4", unit: "dinners" },
    { id: "social-community", icon: "handshake-outline", title: "Community Activity Goal", description: "Participate in one community activity each month.", target: "1", unit: "activities" },
    { id: "social-game", icon: "dice-multiple-outline", title: "Game Night Challenge", description: "Organize and complete one social game night every week.", target: "4", unit: "games" },
    { id: "social-weekend", icon: "account-group-outline", title: "Weekend Social Challenge", description: "Complete one social activity with others every weekend.", target: "4", unit: "activities" },
    { id: "social-kindness", icon: "heart-outline", title: "Acts of Kindness Challenge", description: "Complete one thoughtful act for someone else every day for 7 days.", target: "7", unit: "acts" },
    { id: "social-reconnect", icon: "phone-outline", title: "Reconnect Challenge", description: "Reach out to one person you have not spoken to recently every week.", target: "4", unit: "reconnections" },
  ],
};

const rewardStructurePresentation: Record<GroupGoalRewardStructure, { title: string; description: string }> = {
  winner_takes_all: { title: "Winner takes all", description: "Entire pool to highest contributor." },
  top_3: { title: "Top 3 finishers", description: "Split pool among top 3." },
  win_as_group: { title: "Win as a group", description: "Everyone shares the pool in proportion to their contribution." },
};

const rewardStructureDisplayOrder = ["win_as_group", "top_3", "winner_takes_all"] satisfies ReadonlyArray<GroupGoalRewardStructure>;

export const groupRewardStructures = rewardStructureDisplayOrder
  .filter((id) => (groupGoalRewardStructureIds as ReadonlyArray<GroupGoalRewardStructure>).includes(id))
  .map((id) => ({
    id,
    ...rewardStructurePresentation[id],
  }));

export function groupRewardStructureTitle(structure: GroupGoalRewardStructure) {
  return groupRewardStructures.find((option) => option.id === structure)?.title ?? "Group reward";
}

export function groupRewardStructureDescription(structure: GroupGoalRewardStructure) {
  return groupRewardStructures.find((option) => option.id === structure)?.description ?? "";
}

export function initialsForGroupName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "GG";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

const irregularSingularUnits: Record<string, string> = {
  activities: "activity",
  quizzes: "quiz",
};

/**
 * Best-effort English singularization for a group's target unit, used only for
 * display (e.g. "Log 1 walk" vs "Log 3 walks"). Known irregular units from the
 * activity catalog are mapped explicitly; anything else falls back to a small
 * set of conservative suffix rules, or is returned unchanged if none apply.
 */
export function singularizeUnit(unit: string) {
  const lower = unit.toLowerCase();
  const irregular = irregularSingularUnits[lower];
  if (irregular) return irregular;
  if (lower.endsWith("ies") && lower.length > 3) return `${unit.slice(0, -3)}y`;
  if (lower.endsWith("zzes")) return unit.slice(0, -3);
  if (lower.endsWith("ses") || lower.endsWith("xes") || lower.endsWith("ches") || lower.endsWith("shes")) {
    return unit.slice(0, -2);
  }
  if (lower.endsWith("s") && !lower.endsWith("ss")) return unit.slice(0, -1);
  return unit;
}

const groupAvatarPalette = ["#B39AE8", "#E2708F", "#5FA6ED", "#F0B429", "#3FCB8B"] as const;

export function groupAvatarColor(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return groupAvatarPalette[hash % groupAvatarPalette.length];
}
