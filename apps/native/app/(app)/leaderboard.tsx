import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FocusedButton, FocusedScreen, focusedColors as c, focusedStyles as f } from "@/components/focused-ui";
import { GameIcon, GamesHeader, GamesNote, GamesTabs, gameBlue, gamesStyles as g } from "@/components/games-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { STANDARD_REFRESH_MS } from "@/lib/query-policy";
import { fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function LeaderboardScreen() {
  const focused = useIsFocused();
  const [scope, setScope] = useState<"friends" | "groups" | "global">("friends");
  const leaderboard = useQuery({ ...trpc.rdm.social.leaderboard.queryOptions({ scope }), enabled: focused, refetchInterval: focused ? STANDARD_REFRESH_MS : false, refetchIntervalInBackground: false });
  const entries = leaderboard.data?.entries ?? [];
  const podium = entries.length >= 3 ? [entries[1]!, entries[0]!, entries[2]!] : entries.slice(0, 3);
  return <FocusedScreen bottomSafe contentStyle={g.screen}>
    <GamesHeader title="Leaderboard" subtitle="All-time XP · Top 50" />
    <GamesTabs value={scope} onChange={setScope} options={[{ value: "friends", label: "Friends" }, { value: "groups", label: "Group members" }, { value: "global", label: "Global" }]} />
    {leaderboard.isLoading ? <LoadingState label="Loading saved rankings…" /> : leaderboard.error ? <ErrorState message={leaderboard.error.message} onRetry={() => void leaderboard.refetch()} /> : entries.length === 0 ? <View style={g.card}><Text style={f.sectionTitle}>No rankings yet</Text><Text style={f.body}>Recorded progress will appear here as members earn XP.</Text></View> : <>
      <View style={[g.card, s.podium]}>{podium.map((entry) => {
        const medal = entry.rank === 1 ? c.gold : entry.rank === 2 ? "#B4C7DF" : "#DDA471";
        return <View key={entry.rank} style={[s.podiumItem, entry.rank === 1 && { paddingBottom: 25 }]}><GameIcon name="crown" size={29} color={medal} /><View style={[s.avatar, { backgroundColor: entry.rank === 1 ? c.purple : gameBlue }]}><Text style={s.initials}>{entry.initials}</Text></View><Text numberOfLines={1} style={s.name}>{entry.currentUser ? "You" : entry.name}</Text><Text style={g.label}>{entry.points.toLocaleString()} XP</Text><Text style={[s.medal, { color: medal, borderColor: medal } ]}>#{entry.rank}</Text></View>;
      })}</View>
      {entries.length > 3 ? <View style={[g.card, { paddingVertical: 0 }]}>{entries.slice(3).map((entry) => <View key={entry.rank} style={s.row}><Text style={g.muted}>{entry.rank}</Text><View style={[s.smallAvatar, { backgroundColor: [c.purple, c.green, "#EC9960"][entry.rank % 3] }]}><Text style={s.initials}>{entry.initials}</Text></View><Text numberOfLines={1} style={[g.label, { flex: 1 }]}>{entry.currentUser ? "You" : entry.name}</Text><Text style={g.label}>{entry.points.toLocaleString()} XP</Text></View>)}</View> : null}
    </>}
    <View style={g.footer}><GamesNote icon="account-group-outline">{scope === "friends" ? "You and friends connected through accepted referral codes." : scope === "groups" ? "You and your group goal members, ranked by total earned XP." : "RDM members ranked by their total earned XP."}</GamesNote><FocusedButton label="Open group goals" onPress={() => router.push("/(app)/(tabs)/groups")} /></View>
  </FocusedScreen>;
}
const s = StyleSheet.create({
  podium: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 8, paddingTop: 24 },
  podiumItem: { flex: 1, alignItems: "center", gap: 7, maxWidth: 150 },
  avatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  initials: { color: "#FFFFFF", fontFamily: fonts.bodyMedium, fontSize: 17 },
  name: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: 14, maxWidth: "100%" },
  medal: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 15, paddingVertical: 3, fontFamily: fonts.bodyMedium, fontSize: 14 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", minHeight: 70, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  smallAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
