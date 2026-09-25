import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { haraHachiBu } from "@rdm-b2c/api/domain/wisdom";
import type { AppRouter } from "@rdm-b2c/api/routers/index";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FocusedButton, FocusedScreen, focusedColors as palette, focusedTypography } from "@/components/focused-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { WisdomProgress } from "@/components/wisdom-progress";
import { fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type Habit = inferRouterOutputs<AppRouter>["rdm"]["habits"]["list"][number];

function CommitmentCard({ habit }: { habit: Habit }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/(app)/habit/[id]", params: { id: habit.id } })}
      style={({ pressed }) => [styles.commitmentCard, pressed && styles.pressed]}
    >
      <View style={styles.commitmentIcon}><MaterialCommunityIcons name="bowl-mix-outline" size={22} color={palette.purple} /></View>
      <View style={styles.flex}>
        <View style={styles.commitmentHeading}>
          <Text style={styles.cardTitle} numberOfLines={1}>{habit.rdmPledge?.status === "finished" ? "Finished window" : habit.rdmPledge?.status === "upcoming" ? "Upcoming practice" : "Continue your practice"}</Text>
          {habit.streak > 0 ? (
            <View accessibilityLabel={`${habit.streak} day streak`} style={styles.streakPill}>
              <MaterialCommunityIcons name="fire" size={13} color={palette.gold} />
              <Text style={styles.streakText}>{habit.streak} day streak</Text>
            </View>
          ) : null}
        </View>
        {habit.rdmPledge ? <Text style={styles.caption}>{habit.rdmPledge.startDayKey} → {habit.rdmPledge.endDayKey} (end excluded)</Text> : null}
        {habit.wisdom ? (
          <View style={styles.progressGap}>
            <WisdomProgress wisdom={habit.wisdom} textStyle={styles.caption} />
            {habit.wisdom.consistencyStatus === "perfect" ? <Text style={styles.perfect}>Perfect consistency · every day reflected</Text> : null}
          </View>
        ) : null}
        <View style={styles.commitmentHeading}>
          <Text style={styles.balance}>{habit.rdmPledge?.remaining ?? 0} RDM still locked</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color={palette.purple} />
        </View>
      </View>
    </Pressable>
  );
}

export default function JapaneseWisdomScreen() {
  const habits = useQuery(trpc.rdm.habits.list.queryOptions());

  if (habits.isLoading) return <LoadingState label="Opening Japanese Wisdom…" />;
  if (habits.error || !habits.data) return <ErrorState message={habits.error?.message ?? "Your practices are unavailable."} onRetry={() => void habits.refetch()} />;

  const commitments = habits.data.filter((habit) => habit.wisdomPracticeId === haraHachiBu.id);
  const activeCommitments = commitments.filter((habit) => habit.active && habit.rdmPledge?.status !== "finished");
  const finishedCommitments = commitments.filter((habit) => !habit.active || habit.rdmPledge?.status === "finished");

  return (
    <FocusedScreen contentStyle={styles.content}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Japanese Wisdom</Text>
        <Text style={styles.subtitle}>Small ideas, steady growth</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.bowl}>
          <MaterialCommunityIcons name="bowl-mix-outline" size={46} color={palette.purple} />
        </View>
        <Text style={styles.practiceTitle}>{haraHachiBu.title}</Text>
        <Text style={styles.japaneseName}>{haraHachiBu.japaneseName}</Text>
        <Text style={styles.practiceSubtitle}>A daily moment of mindful eating</Text>
      </View>

      <Text style={styles.body}>{haraHachiBu.description}</Text>
      <Text style={styles.muted}>Notice your eating experience and write an honest reflection. A difficult day is valid too—there is no food quantity, calorie, or weight target.</Text>

      <FocusedButton
        label="Set up Hara Hachi Bu"
        style={styles.purpleButton}
        onPress={() => router.push({ pathname: "/(app)/habit/new", params: { wisdomPracticeId: haraHachiBu.id } })}
      />

      <View style={styles.noteRow}>
        <MaterialCommunityIcons name="information-outline" size={19} color={palette.muted} />
        <Text style={styles.muted}>From 1 RDM per day · Choose your dates</Text>
      </View>
      <View style={styles.noteRow}>
        <MaterialCommunityIcons name="star-four-points" size={17} color={palette.purple} />
        <Text style={styles.muted}>No bonus payouts</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Your commitments</Text>
        {activeCommitments.length === 0 ? <Text style={styles.muted}>No active commitments yet. Read the practice and choose a manageable window.</Text> : null}
        {activeCommitments.map((habit) => <CommitmentCard key={habit.id} habit={habit} />)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Practice history</Text>
        {finishedCommitments.length === 0 ? <Text style={styles.muted}>Finished commitments and their reflections will appear here.</Text> : null}
        {finishedCommitments.map((habit) => <CommitmentCard key={habit.id} habit={habit} />)}
      </View>

      <View style={styles.termsCard}>
        <Text style={styles.cardTitle}>Your usual habit flow</Text>
        <Text style={styles.muted}>Choose dates and pledge from 1 RDM per day. The full pledge locks from Base after you confirm. Daily check-in and reflection → Reward. Missed day → Remorse.</Text>
        <Text style={styles.muted}>Bonus payouts are not enabled for these commitments.</Text>
        <View style={styles.noteRow}>
          <MaterialCommunityIcons name="information-outline" size={19} color={palette.muted} />
          <Text style={styles.muted}>This practice is optional. Follow your individual nutritional needs and any professional guidance; it is not a diet or medical advice.</Text>
        </View>
      </View>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16, gap: 16 },
  heading: { gap: 4, marginBottom: 4 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, ...focusedTypography.pageTitle },
  subtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  hero: { alignItems: "center", gap: 4, paddingVertical: 6 },
  bowl: { width: 84, height: 72, borderRadius: 22, backgroundColor: "rgba(183, 136, 241, 0.14)", borderWidth: 1, borderColor: "rgba(183, 136, 241, 0.3)", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  practiceTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 23, lineHeight: 30, textAlign: "center" },
  japaneseName: { color: palette.purple, fontFamily: fonts.body, fontSize: 16, marginTop: 2 },
  practiceSubtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 4, textAlign: "center" },
  body: { color: palette.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  muted: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  purpleButton: { backgroundColor: palette.purple },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  divider: { height: 1, backgroundColor: palette.line, marginTop: 2 },
  section: { gap: 12 },
  sectionLabel: { color: palette.muted, fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  commitmentCard: { flexDirection: "row", gap: 13, padding: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 13, backgroundColor: palette.panel },
  pressed: { opacity: 0.8 },
  commitmentIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: "rgba(183, 136, 241, 0.14)", borderWidth: 1, borderColor: "rgba(183, 136, 241, 0.3)", alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0, gap: 8 },
  commitmentHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { flex: 1, flexShrink: 1, color: palette.text, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20 },
  caption: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  progressGap: { gap: 6 },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, backgroundColor: "rgba(255, 189, 55, 0.12)", borderWidth: 1, borderColor: "rgba(255, 189, 55, 0.3)" },
  streakText: { color: palette.gold, fontFamily: fonts.bodyBold, fontSize: 11 },
  balance: { color: palette.purple, fontFamily: fonts.bodyBold, fontSize: 12 },
  perfect: { color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 12 },
  termsCard: { gap: 10, padding: 16, borderWidth: 1, borderColor: palette.line, borderRadius: 13, backgroundColor: palette.panel },
});
