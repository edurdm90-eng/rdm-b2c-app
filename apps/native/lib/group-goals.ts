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
    { id: "friends-fitness", icon: "run", title: "Group Fitness Challenge", description: "Complete 30 minutes of physical activity together 5 times this week.", target: "150", unit: "minutes" },
    { id: "friends-study", icon: "book-education-outline", title: "Study Together Challenge", description: "Complete 1 hour of focused study together for 5 days.", target: "5", unit: "hours" },
    { id: "friends-gaming", icon: "gamepad-variant-outline", title: "Gaming Session Goal", description: "Organize and complete 2 group gaming sessions this week.", target: "8", unit: "sessions" },
    { id: "friends-movie", icon: "popcorn", title: "Movie Night Challenge", description: "Watch one movie together as a group this week.", target: "4", unit: "movies" },
    { id: "friends-adventure", icon: "campfire", title: "Weekend Adventure Challenge", description: "Complete one outdoor activity together every weekend.", target: "4", unit: "adventures" },
    { id: "friends-quiz", icon: "head-question-outline", title: "Quiz Challenge", description: "Complete 3 group quiz sessions this week.", target: "12", unit: "quizzes" },
    { id: "friends-check-in", icon: "message-text-outline", title: "Daily Check-In Challenge", description: "Check in with the group every day for 7 consecutive days.", target: "7", unit: "check-ins" },
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
  winner_takes_all: { title: "Winner takes all", description: "100% of the pool goes to the top contributor." },
  top_3: { title: "Top 3 · 60 / 30 / 10", description: "The pool is split across first, second, and third place." },
  win_as_group: { title: "Win as a group", description: "Everyone shares the pool in proportion to their contribution." },
};

export const groupRewardStructures = groupGoalRewardStructureIds.map((id) => ({
  id,
  ...rewardStructurePresentation[id],
}));

export function groupRewardStructureTitle(structure: GroupGoalRewardStructure) {
  return groupRewardStructures.find((option) => option.id === structure)?.title ?? "Group reward";
}

export function ordinalRank(rank: number) {
  const remainder100 = rank % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${rank}th`;
  if (rank % 10 === 1) return `${rank}st`;
  if (rank % 10 === 2) return `${rank}nd`;
  if (rank % 10 === 3) return `${rank}rd`;
  return `${rank}th`;
}
