import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import { AppScreen, ErrorState, LoadingState, PageHeader, Pill, PrimaryButton, SurfaceCard } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function LeaderboardScreen() {
  const focused = useIsFocused();
  const [scope, setScope] = useState<"friends" | "groups" | "global">("friends");
  const leaderboard = useQuery({
    ...trpc.rdm.social.leaderboard.queryOptions({ scope }),
    enabled: focused,
    refetchInterval: focused ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  const entries = leaderboard.data?.entries ?? [];
  const topThree = entries.slice(0, 3);
  const podium = [topThree[2], topThree[0], topThree[1]].filter((entry) => entry !== undefined);
  const rest = entries.slice(3);

  return (
    <AppScreen>
      <PageHeader back onBack={() => router.dismissTo("/(app)/(tabs)")} title="Leaderboard" subtitle="All-time XP · Top 50" />
      <View style={styles.tabs}>
        <Pill active={scope === "friends"} color={colors.plum} label="Friends" onPress={() => setScope("friends")} />
        <Pill active={scope === "groups"} color={colors.plum} label="Group members" onPress={() => setScope("groups")} />
        <Pill active={scope === "global"} color={colors.plum} label="Global" onPress={() => setScope("global")} />
      </View>
      <Text style={styles.description}>{scope === "friends" ? "You and friends connected through accepted referral codes." : scope === "groups" ? "You and members of your group goals, ranked by each person's total XP." : "RDM members ranked by their total earned XP."}</Text>
      {leaderboard.isLoading ? <LoadingState label="Loading saved rankings…" /> : leaderboard.error ? (
        <ErrorState message={leaderboard.error.message} onRetry={() => void leaderboard.refetch()} />
      ) : entries.length === 0 ? (
        <SurfaceCard><Text style={styles.emptyTitle}>No rankings yet</Text><Text style={styles.description}>Recorded progress will appear here as members earn XP.</Text></SurfaceCard>
      ) : (
        <>
      <View style={styles.podium}>
        {podium.map((entry) => (
          <View key={entry.rank} style={[styles.podiumItem, entry.rank === 1 && styles.firstItem]}>
            <View style={[styles.podiumAvatar, entry.rank === 1 && styles.firstAvatar]}>
              {entry.rank === 1 ? <MaterialCommunityIcons name="crown" size={22} color={colors.gold} /> : <Text style={styles.avatarText}>{entry.initials}</Text>}
            </View>
            <View style={[styles.podiumBar, entry.rank === 1 && styles.firstBar]}>
              <Text style={styles.points}>{entry.points.toLocaleString()} XP</Text>
              <Text numberOfLines={1} style={styles.name}>{entry.currentUser ? "You" : entry.name}</Text>
            </View>
          </View>
        ))}
      </View>
      {rest.length > 0 ? <SurfaceCard style={styles.listCard}>
        {rest.map((entry) => (
          <View key={entry.rank} style={[styles.row, entry.currentUser && styles.meRow]}>
            <Text style={styles.rank}>{entry.rank}</Text>
            <View style={styles.rowAvatar}><Text style={styles.rowAvatarText}>{entry.initials}</Text></View>
            <Text style={styles.rowName}>{entry.currentUser ? "You" : entry.name}</Text>
            <Text style={styles.rowPoints}>{entry.points.toLocaleString()}</Text>
          </View>
        ))}
      </SurfaceCard> : null}
        </>
      )}
      <PrimaryButton label="Open group goals" color={colors.plum} icon="account-multiple-plus-outline" onPress={() => router.push("/(app)/(tabs)/groups")} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, marginBottom: 7 },
  podium: { minHeight: 190, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8, paddingTop: 8 },
  podiumItem: { width: "30%", alignItems: "center" },
  firstItem: { width: "33%" },
  podiumAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.plum, alignItems: "center", justifyContent: "center", marginBottom: 7 },
  firstAvatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.goldTint, borderWidth: 3, borderColor: colors.gold },
  avatarText: { color: colors.backgroundDeep, fontFamily: fonts.bodyBold, fontSize: 13 },
  podiumBar: { width: "100%", minHeight: 70, borderRadius: 11, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", padding: 8 },
  firstBar: { minHeight: 92, backgroundColor: colors.goldTint, borderColor: "rgba(240,180,41,0.28)" },
  points: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 12 },
  name: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 10, marginTop: 3 },
  listCard: { padding: 6 },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 9, borderRadius: 11 },
  meRow: { backgroundColor: colors.plumTint },
  rank: { width: 20, color: colors.inkSoft, fontFamily: fonts.monoBold, fontSize: 11, textAlign: "center" },
  rowAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.plum, alignItems: "center", justifyContent: "center" },
  rowAvatarText: { color: colors.backgroundDeep, fontFamily: fonts.bodyBold, fontSize: 9 },
  rowName: { flex: 1, color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  rowPoints: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 11 },
});
