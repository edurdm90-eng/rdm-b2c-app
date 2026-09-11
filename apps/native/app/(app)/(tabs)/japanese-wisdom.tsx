import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { haraHachiBu } from "@rdm-b2c/api/domain/wisdom";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen, ErrorState, IconBubble, LoadingState, PageHeader, PrimaryButton, SectionLabel, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { WisdomProgress } from "@/components/wisdom-progress";
import { colors, fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function JapaneseWisdomScreen() {
  const habits = useQuery(trpc.rdm.habits.list.queryOptions());

  if (habits.isLoading) return <LoadingState label="Opening Japanese Wisdom…" />;
  if (habits.error || !habits.data) return <ErrorState message={habits.error?.message ?? "Your practices are unavailable."} onRetry={() => void habits.refetch()} />;

  const commitments = habits.data.filter((habit) => habit.wisdomPracticeId === haraHachiBu.id);
  const activeCommitments = commitments.filter((habit) => habit.active && habit.rdmPledge?.status !== "finished");
  const finishedCommitments = commitments.filter((habit) => !habit.active || habit.rdmPledge?.status === "finished");

  return (
    <AppScreen>
      <PageHeader title="Japanese Wisdom" subtitle="Small ideas, steady growth" trailing={<IconBubble name="bowl-mix-outline" color={colors.plum} backgroundColor={colors.plumTint} />} />
      <SurfaceCard style={styles.practiceCard}>
        <View style={styles.practiceRow}>
          <View style={styles.japaneseIcon}><Text style={styles.japaneseCharacter}>腹</Text></View>
          <View style={styles.copy}>
            <Text style={styles.practiceTitle}>{haraHachiBu.title}</Text>
            <Text style={styles.japaneseName}>{haraHachiBu.japaneseName}</Text>
            <Text style={rdmStyles.muted}>A daily moment of mindful eating</Text>
          </View>
        </View>
        <Text style={rdmStyles.body}>{haraHachiBu.description}</Text>
        <Text style={rdmStyles.muted}>Notice your eating experience and write an honest reflection. A difficult day is valid too—there is no food quantity, calorie, or weight target.</Text>
        <PrimaryButton
          color={colors.plum}
          label="Set up Hara Hachi Bu"
          icon="plus"
          onPress={() => router.push({ pathname: "/(app)/habit/new", params: { wisdomPracticeId: haraHachiBu.id } })}
        />
      </SurfaceCard>

      <SurfaceCard style={styles.termsCard}>
        <Text style={styles.cardTitle}>Your usual habit flow</Text>
        <Text style={rdmStyles.muted}>Choose dates and pledge from 1 RDM per day. The full pledge locks from Base after you confirm. Daily check-in and reflection → Reward. Missed day → Remorse.</Text>
        <Text style={rdmStyles.muted}>Bonus payouts are not enabled for these commitments.</Text>
        <Text style={rdmStyles.muted}>This practice is optional. Follow your individual nutritional needs and any professional guidance; it is not a diet or medical advice.</Text>
      </SurfaceCard>

      {([
        { label: "Your commitments", items: activeCommitments, emptyMessage: "No active commitments yet. Read the practice and choose a manageable window." },
        { label: "Practice history", items: finishedCommitments, emptyMessage: "Finished commitments and their reflections will appear here." },
      ]).map(({ label, items, emptyMessage }) => (
        <View key={label} style={styles.section}>
          <SectionLabel>{label}</SectionLabel>
          {items.length === 0 ? <Text style={rdmStyles.muted}>{emptyMessage}</Text> : null}
          {items.map((habit) => (
            <SurfaceCard key={habit.id} style={styles.commitmentCard} onPress={() => router.push({ pathname: "/(app)/habit/[id]", params: { id: habit.id } })}>
              <View style={styles.commitmentHeading}>
                <Text style={styles.cardTitle}>{habit.rdmPledge?.status === "finished" ? "Finished window" : habit.rdmPledge?.status === "upcoming" ? "Upcoming practice" : "Continue your practice"}</Text>
                <View accessibilityLabel={`${habit.streak} day streak`} style={styles.streak}>
                  <MaterialCommunityIcons name="fire" size={16} color={colors.gold} />
                  <Text style={styles.streakText}>{habit.streak}</Text>
                </View>
              </View>
              {habit.rdmPledge ? <Text style={rdmStyles.muted}>{habit.rdmPledge.startDayKey} → {habit.rdmPledge.endDayKey} (end excluded)</Text> : null}
              {habit.wisdom ? (
                <>
                  <WisdomProgress wisdom={habit.wisdom} />
                  {habit.wisdom.consistencyStatus === "perfect" ? <Text style={styles.perfect}>Perfect consistency · every day reflected</Text> : null}
                </>
              ) : null}
              <View style={styles.commitmentHeading}>
                <Text style={styles.balance}>{habit.rdmPledge?.remaining ?? 0} RDM still locked</Text>
                <MaterialCommunityIcons name="arrow-right" size={19} color={colors.plum} />
              </View>
            </SurfaceCard>
          ))}
        </View>
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  practiceCard: { gap: 16 },
  practiceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  japaneseIcon: { width: 48, height: 48, borderRadius: 13, backgroundColor: colors.plumTint, alignItems: "center", justifyContent: "center" },
  japaneseCharacter: { color: colors.plum, fontSize: 26 },
  japaneseName: { color: colors.plum, fontSize: 12 },
  copy: { flex: 1, gap: 3 },
  practiceTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 19 },
  termsCard: { gap: 10 },
  cardTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13, flexShrink: 1 },
  section: { gap: 12 },
  commitmentCard: { gap: 11 },
  commitmentHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  streak: { flexDirection: "row", alignItems: "center", gap: 3 },
  streakText: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 12 },
  balance: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 11 },
  perfect: { color: colors.growth, fontFamily: fonts.bodyBold, fontSize: 12 },
});
