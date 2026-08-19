import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { Share, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import { AppScreen, ErrorState, LoadingState, PageHeader, Pill, PrimaryButton, SurfaceCard } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function LeaderboardScreen() {
  const [scope, setScope] = useState<"friends" | "groups" | "global">("friends");
  const leaderboard = useQuery(trpc.rdm.social.leaderboard.queryOptions({ scope }));

  if (leaderboard.isLoading) return <LoadingState label="Loading this week's climb…" />;
  if (leaderboard.error || !leaderboard.data) return <ErrorState message={leaderboard.error?.message ?? "Leaderboard unavailable."} onRetry={() => void leaderboard.refetch()} />;

  const topThree = leaderboard.data.entries.slice(0, 3);
  const podium = [topThree[2], topThree[0], topThree[1]].filter((entry) => entry !== undefined);
  const rest = leaderboard.data.entries.slice(3);

  return (
    <AppScreen>
      <PageHeader back title="Leaderboard" subtitle="This week" />
      <View style={styles.tabs}>
        <Pill active={scope === "friends"} color={colors.plum} label="Friends" onPress={() => setScope("friends")} />
        <Pill active={scope === "groups"} color={colors.plum} label="My Groups" onPress={() => setScope("groups")} />
        <Pill active={scope === "global"} color={colors.plum} label="Global" onPress={() => setScope("global")} />
      </View>
      <View style={styles.podium}>
        {podium.map((entry) => (
          <View key={entry.rank} style={[styles.podiumItem, entry.rank === 1 && styles.firstItem]}>
            <View style={[styles.podiumAvatar, entry.rank === 1 && styles.firstAvatar]}>
              {entry.rank === 1 ? <MaterialCommunityIcons name="crown" size={22} color={colors.gold} /> : <Text style={styles.avatarText}>{entry.initials}</Text>}
            </View>
            <View style={[styles.podiumBar, entry.rank === 1 && styles.firstBar]}>
              <Text style={styles.points}>{entry.points.toLocaleString()}</Text>
              <Text numberOfLines={1} style={styles.name}>{entry.currentUser ? "You" : entry.name}</Text>
            </View>
          </View>
        ))}
      </View>
      <SurfaceCard style={styles.listCard}>
        {rest.map((entry) => (
          <View key={entry.rank} style={[styles.row, entry.currentUser && styles.meRow]}>
            <Text style={styles.rank}>{entry.rank}</Text>
            <View style={styles.rowAvatar}><Text style={styles.rowAvatarText}>{entry.initials}</Text></View>
            <Text style={styles.rowName}>{entry.currentUser ? "You" : entry.name}</Text>
            <Text style={styles.rowPoints}>{entry.points.toLocaleString()}</Text>
          </View>
        ))}
      </SurfaceCard>
      <PrimaryButton label="Invite friends to climb faster" color={colors.plum} icon="account-multiple-plus-outline" onPress={() => void Share.share({ message: "Join my weekly RDM leaderboard." })} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8 },
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
