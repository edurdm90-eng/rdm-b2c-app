import { useQuery } from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FocusedScreen, focusedColors as c, focusedStyles as f } from "@/components/focused-ui";
import { GameIcon, GamesHeader, GamesNote, GamesTabs, gamesStyles as g, type GameIconName } from "@/components/games-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

const tiers = ["Bronze", "Silver", "Gold"] as const;
const tierColors = { Bronze: "#E7A969", Silver: "#C0D5EB", Gold: "#FFCD62" };
export default function BadgesScreen() {
  const focused = useIsFocused();
  const badges = useQuery({ ...trpc.rdm.social.badges.queryOptions(), enabled: focused });
  const [tier, setTier] = useState<typeof tiers[number]>("Bronze");
  return <FocusedScreen bottomSafe contentStyle={g.screen}>
    <GamesHeader title="Badges" />
    {badges.isLoading ? <LoadingState label="Loading your badges…" /> : badges.error || !badges.data ? <ErrorState message={badges.error?.message ?? "Badges unavailable."} onRetry={() => void badges.refetch()} /> : <>
      <View style={{ gap: 4 }}><Text style={f.body}>{badges.data.unlockedCount} of {badges.data.badges.length} unlocked</Text><Text style={[f.title, { fontSize: 25 }]}>Small wins, remembered.</Text></View>
      <GamesTabs options={tiers.map((value) => ({ value, label: value }))} value={tier} onChange={setTier} />
      <View style={s.grid}>{badges.data.badges.filter((badge) => badge.tier === tier).map((badge) => <View key={badge.id} accessible accessibilityLabel={`${badge.title}, ${tier}, ${badge.unlocked ? "unlocked" : "locked"}`} style={s.badge}>
        <View style={[s.ring, { borderColor: badge.unlocked ? tierColors[tier] : "#697586", backgroundColor: badge.unlocked ? `${tierColors[tier]}24` : "#222C35" }]}><GameIcon name={badge.icon as GameIconName} size={33} color={badge.unlocked ? tierColors[tier] : "#9BA6B6"} />{!badge.unlocked ? <View style={s.lock}><GameIcon name="lock" size={16} color={c.text} /></View> : null}</View>
        <Text style={s.name}>{badge.title}</Text><Text style={[s.status, { color: badge.unlocked ? c.green : c.muted }]}>{badge.unlocked ? "Unlocked" : "Locked"}</Text>
      </View>)}</View>
      <GamesNote>Earned through your recorded progress. Keep showing up, one small step at a time.</GamesNote>
    </>}
  </FocusedScreen>;
}
const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  badge: { width: "48%", alignItems: "center", gap: 6, borderColor: c.line, borderWidth: 1, borderRadius: 10, padding: 13, minHeight: 143 },
  ring: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  lock: { position: "absolute", right: -5, bottom: -2, backgroundColor: c.panel, borderRadius: 14, padding: 5 },
  name: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, textAlign: "center" },
  status: { fontFamily: fonts.body, fontSize: 12 },
});
