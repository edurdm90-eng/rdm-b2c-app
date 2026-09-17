import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { GoalCategory } from "@rdm-b2c/api/domain/rdm";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FocusedButton, FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { formatDayKey } from "@/lib/date";
import { getGoalPresentation, type Goal } from "@/lib/goal-presentation";
import { fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const categoryPresentation: Record<GoalCategory, { color: string; icon: IconName }> = {
  Focus: { color: palette.gold, icon: "bullseye-arrow" },
  Health: { color: palette.green, icon: "run" },
  Money: { color: palette.link, icon: "cash-multiple" },
  Family: { color: palette.purple, icon: "account-heart-outline" },
  Sustainability: { color: palette.green, icon: "leaf" },
};

function openGoal(goal: Goal, reflect = false) {
  router.push({ pathname: "/(app)/goal/[id]", params: { id: goal.id, ...(reflect ? { view: "reflect" } : {}) } });
}

function GoalCard({ goal, now, allowReflection }: { goal: Goal; now: Date; allowReflection: boolean }) {
  const view = getGoalPresentation(goal, now);
  const presentation = categoryPresentation[goal.category] ?? categoryPresentation.Focus;
  const todayEntry = goal.dayEntries.find((entry) => entry.dayKey === view.todayDayKey);
  const historyLabel = goal.status === "completed" ? "Goal completed"
    : goal.status === "missed" ? "Ended · not completed" : view.ended ? "Deadline reached" : null;

  return (
    <View style={styles.goalCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${goal.title}, ${view.progress}% progress, open goal overview`}
        onPress={() => openGoal(goal)}
        style={({ pressed }) => [styles.overview, pressed && styles.pressed]}
      >
        <View style={styles.goalHeader}>
          <MaterialCommunityIcons name={presentation.icon} size={28} color={presentation.color} />
          <View style={styles.goalCopy}>
            <Text style={styles.goalTitle}>{goal.title}</Text>
            <Text numberOfLines={2} style={styles.target}>{goal.target}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={23} color={palette.muted} />
        </View>
        <View style={styles.progressSection}>
          <View style={styles.progressLabels}>
            <Text style={styles.dayLabel}>{view.upcoming ? `Starts ${formatDayKey(goal.startDayKey)}` : `Day ${view.dayNumber} of ${goal.durationDays}`}</Text>
            <Text style={styles.progressValue}>{view.progress}%</Text>
          </View>
          <View accessibilityRole="progressbar" accessibilityLabel={`${goal.title} progress`} accessibilityValue={{ min: 0, max: 100, now: view.progress }} style={styles.track}>
            <View style={[styles.fill, { width: `${view.progress}%`, backgroundColor: presentation.color }]} />
          </View>
        </View>
        <View style={styles.funding}>
          <View style={styles.fundingItem}>
            <MaterialCommunityIcons name="database-outline" size={18} color={palette.muted} />
            <Text style={styles.fundingText}>{goal.fundingMode === "daily" ? `${formatRdm(goal.pledgePerDay ?? 0)} RDM per day` : `${formatRdm(goal.pledgeAmount)} RDM pledged`}</Text>
          </View>
          <View style={styles.fundingItem}>
            <MaterialCommunityIcons name="lock-outline" size={19} color={palette.muted} />
            <Text style={styles.fundingText}>{formatRdm(goal.remainingPledge)} RDM remaining</Text>
          </View>
        </View>
        {historyLabel ? <Text style={[styles.status, goal.status === "completed" ? styles.completedText : styles.missedText]}>{historyLabel}{goal.fundingMode === "daily" ? ` · ${goal.completedDayCount} reflected · ${goal.missedDayCount} missed` : ""}</Text>
          : todayEntry ? <Text style={[styles.status, todayEntry.outcome === "completed" ? styles.completedText : styles.missedText]}>{todayEntry.outcome === "completed" ? "Today's reflection saved" : "Today's allocation moved to Remorse"}</Text>
            : view.upcoming ? <Text style={styles.status}>Daily reflections begin on your start date.</Text> : null}
      </Pressable>
      {view.canReflect && allowReflection ? <FocusedButton accessibilityLabel={`Daily reflection for ${goal.title}`} label="Daily reflection" onPress={() => openGoal(goal, true)} style={styles.reflectionButton} /> : null}
    </View>
  );
}

export default function GoalsScreen() {
  const focused = useIsFocused();
  const goals = useQuery({
    ...trpc.rdm.goals.list.queryOptions(),
    enabled: focused,
    refetchInterval: focused ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const [view, setView] = useState<"active" | "completed">("active");

  if (goals.isLoading && !goals.data) return <LoadingState label="Loading your goals…" />;
  if (!goals.data) return <ErrorState message={goals.error?.message ?? "Goals are unavailable."} onRetry={() => void goals.refetch()} />;

  const now = new Date();
  const activeGoals = goals.data.filter((goal) => goal.status === "active" && !getGoalPresentation(goal, now).ended);
  const completedGoals = goals.data.filter((goal) => goal.status === "completed");
  const endedGoals = goals.data.filter((goal) => goal.status === "missed" || (goal.status === "active" && getGoalPresentation(goal, now).ended));
  const visibleGoals = view === "active" ? activeGoals : completedGoals;

  return (
    <FocusedScreen contentStyle={styles.content}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Goals</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Create a goal" onPress={() => router.push("/(app)/goal/new")} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="plus" size={24} color={palette.text} />
        </Pressable>
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {(["active", "completed"] as const).map((tab) => (
          <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: view === tab }} aria-selected={view === tab} onPress={() => setView(tab)} style={[styles.tab, view === tab && styles.selectedTab]}>
            <Text style={[styles.tabLabel, view === tab && styles.selectedTabLabel]}>{tab === "active" ? "Active" : "Completed"}</Text>
          </Pressable>
        ))}
      </View>

      {goals.error ? <View accessibilityRole="alert" style={styles.errorBanner}>
        <Text style={styles.errorText}>Couldn't refresh your goals. Showing your last saved data.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading goals" onPress={() => void goals.refetch()} style={styles.retryButton}><Text style={styles.link}>Retry</Text></Pressable>
      </View> : null}

      <View style={styles.goalList}>
        {visibleGoals.map((goal) => <GoalCard key={goal.id} goal={goal} now={now} allowReflection={!goals.error} />)}
        {visibleGoals.length === 0 ? <View style={styles.emptyCard}>
          <MaterialCommunityIcons name={view === "active" ? "bullseye-arrow" : "check-circle-outline"} size={28} color={palette.muted} />
          <Text style={styles.emptyTitle}>{view === "active" ? "Give your next step a goal" : "No completed goals yet"}</Text>
          <Text style={styles.emptyCopy}>{view === "active" ? "Choose what matters, set your dates, and make a little progress each day." : "Your completed goals will be saved here. Every honest reflection counts along the way."}</Text>
          {view === "active" ? <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/goal/new")} style={styles.emptyAction}><Text style={styles.link}>Create a goal</Text><MaterialCommunityIcons name="arrow-right" size={19} color={palette.link} /></Pressable> : null}
        </View> : null}
        {view === "completed" && endedGoals.length > 0 ? <>
          <View style={styles.historyHeading}>
            <Text accessibilityRole="header" style={styles.historyTitle}>Missed & ended goals</Text>
            <Text style={styles.historyDescription}>Past commitments, kept separately from completed goals.</Text>
          </View>
          {endedGoals.map((goal) => <GoalCard key={goal.id} goal={goal} now={now} allowReflection={false} />)}
        </> : null}
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Need direction? Plan a goal with Medaa Ai" onPress={() => router.push("/(app)/ai-coach")} style={({ pressed }) => [styles.aiCard, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="creation" size={26} color={palette.link} />
        <View style={styles.aiCopy}>
          <Text style={styles.aiTitle}>Need direction?</Text>
          <Text style={styles.aiDescription}>Plan a goal with Medaa Ai</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={21} color={palette.link} />
      </Pressable>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 33 },
  addButton: { width: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", padding: 3, borderWidth: 1, borderColor: palette.line, borderRadius: 10, marginBottom: 16 },
  tab: { flex: 1, minHeight: 34, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  selectedTab: { backgroundColor: "#263541" },
  tabLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  selectedTabLabel: { color: palette.text, fontFamily: fonts.bodyMedium },
  goalList: { gap: 14 },
  goalCard: { borderWidth: 1, borderColor: palette.line, borderRadius: 9, overflow: "hidden" },
  overview: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 13, gap: 15 },
  goalHeader: { flexDirection: "row", gap: 13, alignItems: "center" },
  goalCopy: { flex: 1, gap: 3 },
  goalTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22 },
  target: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  progressSection: { gap: 9 },
  progressLabels: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dayLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  progressValue: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  track: { height: 12, backgroundColor: "#263541", borderRadius: 6, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 6 },
  funding: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", columnGap: 12, rowGap: 8 },
  fundingItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  fundingText: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  reflectionButton: { minHeight: 46, borderRadius: 8, marginHorizontal: 14, marginBottom: 14 },
  status: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: -8 },
  completedText: { color: palette.green },
  missedText: { color: palette.coral },
  aiCard: { flexDirection: "row", alignItems: "center", gap: 21, padding: 20, marginTop: 35, backgroundColor: "#142130", borderWidth: 1, borderColor: "#213950", borderRadius: 9, minHeight: 84 },
  aiCopy: { flex: 1, gap: 5 },
  aiTitle: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23 },
  aiDescription: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  emptyCard: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 30, gap: 13, borderWidth: 1, borderColor: palette.line, borderRadius: 9 },
  emptyTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 24, textAlign: "center" },
  emptyCopy: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: "center" },
  emptyAction: { flexDirection: "row", minHeight: 44, alignItems: "center", justifyContent: "center", gap: 8 },
  link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 14 },
  historyHeading: { gap: 5, marginTop: 12 },
  historyTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 24 },
  historyDescription: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  errorBanner: { marginBottom: 16, paddingHorizontal: 13, paddingTop: 10, borderRadius: 8, borderWidth: 1, borderColor: palette.coral },
  errorText: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  retryButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  pressed: { opacity: 0.76 },
});
