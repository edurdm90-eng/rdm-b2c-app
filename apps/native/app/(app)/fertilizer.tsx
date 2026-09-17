import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { GoalCategory } from "@rdm-b2c/api/domain/rdm";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { focusedColors as palette } from "@/components/focused-ui";
import { formatTreeDay, TreeNotice, TreePage, treeStyles } from "@/components/tree-ui";
import { getGoalPresentation, type Goal } from "@/lib/goal-presentation";
import { getHabitDetailPresentation, type HabitDetail } from "@/lib/habit-detail";
import { fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type Tab = "habits" | "goals";

const goalVisuals: Record<GoalCategory, { icon: IconName; color: string }> = {
  Focus: { icon: "bullseye-arrow", color: palette.gold },
  Health: { icon: "run", color: palette.green },
  Money: { icon: "cash-multiple", color: palette.link },
  Family: { icon: "account-heart-outline", color: palette.purple },
  Sustainability: { icon: "leaf", color: palette.green },
};

function CommitmentCard({ title, icon, color, streak, rate, status, completed, canReflect, onOpen, onReflect }: {
  title: string;
  icon: IconName;
  color: string;
  streak: number | null;
  rate: string;
  status: string | null;
  completed: boolean;
  canReflect: boolean;
  onOpen: () => void;
  onReflect: () => void;
}) {
  const label = completed ? "Done today" : canReflect ? "Reflect" : "View details";
  return <View style={styles.card}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${streak === null ? "" : `, ${streak} day streak`}, ${rate}${status ? `, ${status}` : ""}, view details`}
      onPress={onOpen}
      style={({ pressed }) => [styles.cardHeader, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={31} color={color} />
      <View style={styles.cardCopy}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {streak !== null ? <View style={styles.streak}>
            <MaterialCommunityIcons name="fire" size={18} color={palette.gold} />
            <Text style={styles.streakText}>{streak} day streak</Text>
          </View> : null}
        </View>
        <Text style={styles.rate}>{rate}</Text>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={23} color={palette.muted} />
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${title}`}
      onPress={canReflect && !completed ? onReflect : onOpen}
      style={({ pressed }) => [styles.cardButton, completed ? styles.completedButton : canReflect ? styles.reflectButton : styles.viewButton, pressed && styles.pressed]}
    >
      {completed ? <MaterialCommunityIcons name="check-circle" size={18} color={palette.onGreen} /> : null}
      <Text style={[styles.cardButtonLabel, !completed && !canReflect && styles.viewButtonLabel]}>{label}</Text>
    </Pressable>
  </View>;
}

function HabitCard({ habit, now, allowReflection }: { habit: HabitDetail; now: Date; allowReflection: boolean }) {
  const view = getHabitDetailPresentation(habit, now);
  const pledge = habit.rdmPledge;
  const canReflect = allowReflection && (view.state === "act" || view.state === "reflect");
  const status = view.state === "rest" ? `Rest day${view.nextDayKey ? ` · Next ${formatTreeDay(view.nextDayKey)}` : ""}`
    : view.state === "upcoming" ? `Starts ${formatTreeDay(view.nextDayKey ?? pledge!.startDayKey)}`
      : view.state === "finished" ? "Commitment finished"
        : view.state === "missed" ? "Missed today · View your saved record"
          : view.state === "inactive" ? "View your saved progress" : null;
  const color = habit.wisdomPracticeId ? palette.purple : habit.category === "Focus" ? palette.link : habit.category === "Money" ? palette.gold : palette.green;
  const open = () => router.push({ pathname: "/(app)/habit/[id]", params: { id: habit.id } });
  return <CommitmentCard
    title={habit.title}
    icon={habit.icon as IconName}
    color={color}
    streak={habit.streak}
    rate={pledge ? `${formatRdm(pledge.perDay)} RDM per ${pledge.weekdays.length === 7 ? "day" : "scheduled day"}` : "Existing habit · original reward rules"}
    status={status}
    completed={view.state === "completed"}
    canReflect={canReflect}
    onOpen={open}
    onReflect={open}
  />;
}

function GoalCard({ goal, now, allowReflection }: { goal: Goal; now: Date; allowReflection: boolean }) {
  const view = getGoalPresentation(goal, now);
  const todayEntry = goal.dayEntries.find((entry) => entry.dayKey === view.todayDayKey);
  const visual = goalVisuals[goal.category] ?? goalVisuals.Focus;
  const completed = todayEntry?.outcome === "completed";
  const status = todayEntry?.outcome === "missed" ? "Missed today · View your saved record"
    : goal.status === "completed" ? "Goal completed"
      : goal.status === "missed" ? "Ended · not completed"
        : view.ended ? "Commitment ended"
          : view.upcoming ? `Starts ${formatTreeDay(goal.startDayKey)}`
            : goal.fundingMode === "outcome" ? "Whole-goal pledge · View progress" : null;
  const open = () => router.push({ pathname: "/(app)/goal/[id]", params: { id: goal.id } });
  return <CommitmentCard
    title={goal.title}
    icon={visual.icon}
    color={visual.color}
    streak={goal.streak}
    rate={goal.fundingMode === "daily" && goal.pledgePerDay !== null ? `${formatRdm(goal.pledgePerDay)} RDM per day` : `${formatRdm(goal.pledgeAmount)} RDM pledged`}
    status={status}
    completed={completed}
    canReflect={allowReflection && view.canReflect}
    onOpen={open}
    onReflect={() => router.push({ pathname: "/(app)/goal/[id]", params: { id: goal.id, view: "reflect" } })}
  />;
}

export default function FertilizerScreen() {
  const focused = useIsFocused();
  const [tab, setTab] = useState<Tab>("habits");
  const habits = useQuery({
    ...trpc.rdm.habits.list.queryOptions(),
    enabled: focused && tab === "habits",
    refetchInterval: focused && tab === "habits" ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const goals = useQuery({
    ...trpc.rdm.goals.list.queryOptions(),
    enabled: focused && tab === "goals",
    refetchInterval: focused && tab === "goals" ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const query = tab === "habits" ? habits : goals;
  const now = new Date();
  const singular = tab === "habits" ? "habit" : "goal";
  const add = () => router.push(tab === "habits" ? "/(app)/framework" : "/(app)/goal/new");

  return <TreePage
    title="Grow Every Day"
    onBack={() => router.dismissTo("/(app)/tree")}
    footer={<Pressable accessibilityRole="button" accessibilityLabel={`Add ${singular}`} onPress={add} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="plus-circle-outline" size={23} color={palette.muted} />
      <Text style={styles.addLabel}>Add {singular}</Text>
    </Pressable>}
  >
    <View style={styles.intro}>
      <Text accessibilityRole="header" style={treeStyles.heading}>Add Fertilizer</Text>
      <Text style={treeStyles.body}>Grow through the commitments you already made.</Text>
    </View>
    <View accessibilityRole="tablist" accessibilityLabel="Commitment type" style={styles.tabs}>
      {(["habits", "goals"] as const).map((item) => <Pressable
        key={item}
        accessibilityRole="tab"
        accessibilityState={{ selected: tab === item }}
        aria-selected={tab === item}
        onPress={() => setTab(item)}
        style={({ pressed }) => [styles.tab, tab === item && styles.selectedTab, pressed && styles.pressed]}
      ><Text style={[styles.tabLabel, tab === item && styles.selectedTabLabel]}>{item === "habits" ? "Habits" : "Goals"}</Text></Pressable>)}
    </View>

    <View style={styles.list}>
      <Text accessibilityRole="header" style={treeStyles.section}>Your {tab}</Text>
      {query.error ? <View accessibilityRole="alert" style={[treeStyles.panel, styles.errorPanel]}>
        <Text style={treeStyles.error}>{query.data ? `Couldn't refresh your ${tab}. Showing saved records; open a record to check its latest status.` : `Couldn't load your ${tab}. Please try again.`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Retry loading ${tab}`} accessibilityState={{ disabled: query.isFetching }} disabled={query.isFetching} onPress={() => void query.refetch()} style={treeStyles.textButton}>
          <Text style={treeStyles.link}>{query.isFetching ? "Retrying…" : "Try again"}</Text>
        </Pressable>
      </View> : null}
      {!query.data && !query.error ? <View accessibilityLiveRegion="polite" style={styles.loading}>
        <ActivityIndicator color={palette.green} />
        <Text style={treeStyles.body}>Loading your {tab}…</Text>
      </View> : null}
      {query.data?.length === 0 ? <View style={[treeStyles.panel, styles.empty]}>
        <MaterialCommunityIcons name={tab === "habits" ? "leaf" : "bullseye-arrow"} size={36} color={palette.green} />
        <Text style={styles.emptyTitle}>Your next small step starts here</Text>
        <Text style={[treeStyles.body, styles.centered]}>Create a {singular}, then return here for your daily action and reflection.</Text>
      </View> : null}
      {tab === "habits"
        ? habits.data?.map((habit) => <HabitCard key={habit.id} habit={habit} now={now} allowReflection={!habits.error} />)
        : goals.data?.map((goal) => <GoalCard key={goal.id} goal={goal} now={now} allowReflection={!goals.error} />)}
    </View>
    <TreeNotice>Your existing reflections nourish your tree. RDM follows the original commitment rules; no extra pledge or duplicate reward is added here.</TreeNotice>
  </TreePage>;
}

const styles = StyleSheet.create({
  intro: { gap: 6 },
  tabs: { flexDirection: "row", padding: 3, borderWidth: 1, borderColor: palette.line, borderRadius: 10 },
  tab: { flex: 1, minHeight: 40, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  selectedTab: { backgroundColor: "#263541" },
  tabLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  selectedTabLabel: { color: palette.text, fontFamily: fonts.bodyMedium },
  list: { gap: 10 },
  card: { borderWidth: 1, borderColor: palette.line, borderRadius: 8, paddingBottom: 12 },
  cardHeader: { paddingHorizontal: 11, paddingTop: 14, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64 },
  cardCopy: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  cardTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  streak: { flexDirection: "row", alignItems: "center", gap: 3 },
  streakText: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  rate: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  status: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  cardButton: { marginLeft: 53, marginRight: 38, minHeight: 42, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  reflectButton: { backgroundColor: palette.link },
  completedButton: { backgroundColor: palette.green },
  viewButton: { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel },
  cardButtonLabel: { color: palette.onGreen, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, textAlign: "center" },
  viewButtonLabel: { color: palette.text },
  addButton: { minHeight: 48, padding: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.line, borderRadius: 9 },
  addLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22 },
  errorPanel: { gap: 4 },
  loading: { alignItems: "center", paddingVertical: 28, gap: 12 },
  empty: { alignItems: "center", paddingVertical: 25, gap: 10 },
  emptyTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, textAlign: "center" },
  centered: { textAlign: "center" },
  pressed: { opacity: 0.76 },
});
