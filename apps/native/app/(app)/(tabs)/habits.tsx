import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen, ErrorState, IconBubble, LoadingState, PageHeader, PrimaryButton, SectionLabel, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function HabitsScreen() {
  const habits = useQuery(trpc.rdm.habits.list.queryOptions());

  if (habits.isLoading) return <LoadingState label="Loading your habits…" />;
  if (habits.error || !habits.data) return <ErrorState message={habits.error?.message ?? "Habits are unavailable."} onRetry={() => void habits.refetch()} />;

  return (
    <AppScreen>
      <PageHeader title="My Habits" subtitle={`${habits.data.length} active · keep the promise small`} />
      <PrimaryButton label="Create a habit" icon="plus" onPress={() => router.push("/(app)/framework")} />
      <SectionLabel>Active habits</SectionLabel>
      {habits.data.map((habit) => (
        <SurfaceCard key={habit.id} onPress={() => router.push({ pathname: "/(app)/habit/[id]", params: { id: habit.id } })} style={styles.habitCard}>
          <IconBubble name={habit.icon as IconName} color={colors.growth} />
          <View style={styles.habitCopy}>
            <Text style={styles.habitTitle}>{habit.title}</Text>
            <Text style={rdmStyles.muted}>{habit.target} · {habit.cadence}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.stage}>{habit.stage}</Text>
              <View
                accessibilityLabel={`${habit.streak} day streak`}
                style={styles.streakBadge}
              >
                <MaterialCommunityIcons color={colors.gold} name="fire" size={14} />
                <Text style={styles.streak}>{habit.streak}</Text>
              </View>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkSoft} />
        </SurfaceCard>
      ))}
      {habits.data.length === 0 ? (
        <SurfaceCard style={styles.emptyCard}>
          <IconBubble name="sprout-outline" />
          <Text style={styles.emptyTitle}>Your first promise starts here</Text>
          <Text style={rdmStyles.muted}>Choose a proven framework or write one in your own words.</Text>
        </SurfaceCard>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  habitCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  habitCopy: { flex: 1, gap: 4 },
  habitTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  stage: { color: colors.gold, backgroundColor: colors.goldTint, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, fontFamily: fonts.monoBold, fontSize: 9, textTransform: "uppercase" },
  streakBadge: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(240,180,41,0.25)",
    backgroundColor: colors.goldTint,
    paddingHorizontal: 7,
  },
  streak: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 10 },
  emptyCard: { alignItems: "center", gap: 10, paddingVertical: 26 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18 },
});
