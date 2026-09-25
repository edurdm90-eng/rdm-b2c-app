import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FocusedScreen, focusedColors as c, focusedStyles as f } from "@/components/focused-ui";
import { GameArt, GameIcon, GamesNote, GamesTabs, gameOrder, gamesStyles as g } from "@/components/games-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { STANDARD_REFRESH_MS } from "@/lib/query-policy";
import { fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GamesScreen() {
  const focused = useIsFocused();
  const games = useQuery({ ...trpc.rdm.games.list.queryOptions(), enabled: focused, refetchInterval: focused ? STANDARD_REFRESH_MS : false });
  const [filter, setFilter] = useState<number | "all">("all");
  const visible = [...(games.data ?? [])].filter((game) => game.id !== "gratitude-tap" && (filter === "all" || game.filterMinutes === filter)).sort((a, b) => gameOrder.indexOf(a.id) - gameOrder.indexOf(b.id));

  return <FocusedScreen contentStyle={[g.screen, { gap: 12 }]}>
    <View style={s.heading}><Text style={f.title}>Games</Text><Pressable accessibilityRole="button" onPress={() => router.push("/(app)/badges")} style={s.badges}><GameIcon name="medal-outline" color={c.gold} size={21} /><Text style={s.badgeLabel}>Badges</Text></Pressable></View>
    <Text style={[f.body, { marginTop: -6 }]}>A reset, not a rabbit hole.</Text>
    <GamesTabs value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: 1, label: "1 min" }, { value: 2, label: "2 min" }, { value: 3, label: "3 min" }]} />
    {games.isLoading ? <LoadingState label="Loading games…" /> : games.error ? <ErrorState message={games.error.message} onRetry={() => void games.refetch()} /> : <View style={s.grid}>{visible.map((game) => <Pressable key={game.id} accessibilityRole="button" accessibilityLabel={`${game.title}, ${game.locked ? "completed today, locked" : "play"}`} accessibilityState={{ disabled: game.locked }} disabled={game.locked} onPress={() => router.push({ pathname: "/(app)/game/[id]", params: { id: game.id } })} style={({ pressed }) => [s.tile, pressed && { opacity: 0.75 }]}>
      <GameArt id={game.id} /><View style={{ flex: 1 }}><Text style={s.name}>{game.title}</Text><Text style={g.muted}>{game.locked ? "Done today" : game.durationSeconds === 90 ? "90 sec" : `${game.durationSeconds / 60} min`}</Text></View>{game.locked ? <View style={s.lock}><GameIcon name="lock" size={16} color={c.green} /></View> : null}
    </Pressable>)}</View>}
    <View style={s.links}><Pressable accessibilityRole="button" onPress={() => router.push("/(app)/leaderboard")} style={s.link}><GameIcon name="trophy-outline" /><Text style={f.link}>Leaderboard</Text><GameIcon name="arrow-right" size={19} color={c.link} /></Pressable><Pressable accessibilityRole="button" onPress={() => router.push("/(app)/badges")} style={s.link}><GameIcon name="medal-outline" color={c.gold} /><Text style={f.link}>Your badges</Text><GameIcon name="chevron-right" size={19} color={c.link} /></Pressable></View>
    <GamesNote icon="timer-lock-outline">One session per game, per day. Finishing locks it for today. Games reset at 00:00 UTC.</GamesNote>
  </FocusedScreen>;
}
const s = StyleSheet.create({
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badges: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: c.line, borderRadius: 9 },
  badgeLabel: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48.4%", borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: "#171F26", padding: 10, gap: 5, minHeight: 140, overflow: "hidden" },
  name: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  lock: { position: "absolute", right: 8, top: 8, backgroundColor: c.background, padding: 4, borderRadius: 12 },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 6 },
  link: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 44 },
});
