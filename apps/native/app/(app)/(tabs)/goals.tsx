import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { goalCategories, type GoalCategory } from "@rdm-b2c/api/domain/rdm";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  ErrorState,
  IconBubble,
  LoadingState,
  PageHeader,
  Pill,
  ProgressBar,
  SurfaceCard,
  rdmStyles,
} from "@/components/rdm-ui";
import { formatDayKey } from "@/lib/date";
import { colors, fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const categoryPresentation: Record<GoalCategory, {
  backgroundColor: string;
  color: string;
  icon: IconName;
}> = {
  Focus: { icon: "target", color: colors.growth, backgroundColor: colors.growthTint },
  Health: { icon: "run", color: colors.coral, backgroundColor: colors.coralTint },
  Money: { icon: "cash-multiple", color: colors.gold, backgroundColor: colors.goldTint },
  Family: { icon: "account-heart-outline", color: colors.ai, backgroundColor: colors.aiTint },
  Sustainability: { icon: "leaf", color: colors.plum, backgroundColor: colors.plumTint },
};

export default function GoalsScreen() {
  const goals = useQuery(trpc.rdm.goals.list.queryOptions());
  const [category, setCategory] = useState<"All" | GoalCategory>("All");
  const [status, setStatus] = useState<"all" | "active" | "completed" | "missed">("all");

  if (goals.isLoading) return <LoadingState label="Loading your goals…" />;
  if (goals.error || !goals.data) {
    return (
      <ErrorState
        message={goals.error?.message ?? "Goals are unavailable."}
        onRetry={() => void goals.refetch()}
      />
    );
  }

  const visibleGoals = goals.data.filter((goal) =>
    (category === "All" || goal.category === category)
    && (status === "all" || goal.status === status));
  const activeCount = goals.data.filter((goal) => goal.status === "active").length;

  return (
    <View style={styles.screen}>
      <AppScreen contentStyle={styles.content}>
        <PageHeader
          title="My Goals"
          subtitle={`${activeCount} active · ${goals.data.length - activeCount} in history`}
        />
        <View style={styles.statusFilters}>
          {(["all", "active", "completed", "missed"] as const).map((item) => (
            <Pill key={item} active={status === item} color={colors.plum}
              label={item === "all" ? "All goals" : item.charAt(0).toUpperCase() + item.slice(1)}
              onPress={() => setStatus(item)} />
          ))}
        </View>
        <ScrollView
          horizontal
          contentContainerStyle={styles.categories}
          showsHorizontalScrollIndicator={false}
        >
          {(["All", ...goalCategories] as const).map((item) => (
            <Pill
              key={item}
              active={category === item}
              color={colors.plum}
              label={item}
              onPress={() => setCategory(item)}
            />
          ))}
        </ScrollView>

        {visibleGoals.map((goal) => {
          const presentation = categoryPresentation[goal.category];
          return (
            <SurfaceCard key={goal.id} style={styles.goalCard}
              onPress={() => router.push({ pathname: "/(app)/goal/[id]", params: { id: goal.id } })}>
              <View style={styles.goalHeader}>
                <IconBubble
                  backgroundColor={presentation.backgroundColor}
                  color={presentation.color}
                  name={presentation.icon}
                />
                <View style={styles.goalCopy}>
                  <Text style={styles.goalTitle}>{goal.title}</Text>
                  <Text style={rdmStyles.muted}>
                    {goal.upcoming ? "Upcoming" : goal.status.charAt(0).toUpperCase() + goal.status.slice(1)} · {goal.progress}% complete
                  </Text>
                </View>
                <Text style={styles.category}>{goal.category}</Text>
              </View>
              <Text style={styles.target}>{goal.target}</Text>
              <ProgressBar color={presentation.color} progress={goal.progress / 100} />
              <View style={styles.goalFooter}>
                <Text style={styles.duration}>
                  {goal.durationDays} days · ends {formatDayKey(goal.endDayKey)}
                </Text>
                <Text style={[styles.pledge, goal.status === "missed" && styles.missed]}>
                  {formatRdm(goal.pledgeAmount)} RDM {goal.status === "active" ? "locked" : goal.status === "completed" ? "→ Reward" : "→ Remorse"}
                </Text>
              </View>
            </SurfaceCard>
          );
        })}

        {visibleGoals.length === 0 ? (
          <SurfaceCard style={styles.emptyCard}>
            <IconBubble name="flag-checkered" color={colors.plum} backgroundColor={colors.plumTint} />
            <Text style={styles.emptyTitle}>
              {goals.data.length === 0 ? "Set your first goal" : "No goals match these filters"}
            </Text>
            <Text style={[rdmStyles.muted, styles.emptyCopy]}>
              {goals.data.length === 0
                ? "Define the finish line, choose a duration, and back the commitment with Base RDM."
                : "Try another category or status to see your saved goals."}
            </Text>
          </SurfaceCard>
        ) : null}
      </AppScreen>

      <Pressable
        accessibilityLabel="Add goal"
        accessibilityRole="button"
        onPress={() => router.push("/(app)/goal/new")}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <MaterialCommunityIcons color={colors.backgroundDeep} name="plus" size={28} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 96 },
  categories: { gap: 8, paddingRight: 18 },
  statusFilters: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  goalCard: { gap: 12 },
  goalHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  goalCopy: { flex: 1, gap: 3 },
  goalTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13.5 },
  category: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 8.5, textTransform: "uppercase" },
  target: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  goalFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  duration: { flex: 1, color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9.5 },
  pledge: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 9.5 },
  missed: { color: colors.coral },
  emptyCard: { alignItems: "center", gap: 10, paddingVertical: 28 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18 },
  emptyCopy: { textAlign: "center" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.growth,
    shadowColor: colors.growth,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  fabPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
});
