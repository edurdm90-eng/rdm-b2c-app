import { gameDurationLabel } from "@rdm-b2c/api/domain/rdm";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen, ErrorState, LoadingState, PageHeader, Pill, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { colors, fonts } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function GamesScreen() {
  const games = useQuery(trpc.rdm.games.list.queryOptions());
  const [filter, setFilter] = useState<number | "all">("all");

  if (games.isLoading) return <LoadingState label="Preparing responsible games…" />;
  if (games.error || !games.data) return <ErrorState message={games.error?.message ?? "Games are unavailable."} onRetry={() => void games.refetch()} />;

  const visibleGames = filter === "all" ? games.data : games.data.filter((game) => game.filterMinutes === filter);

  return (
    <AppScreen>
      <PageHeader title="Responsible Games" subtitle="Max 3 minutes. Always." />
      <View style={styles.filters}>
        <Pill active={filter === "all"} color={colors.ai} label="All" onPress={() => setFilter("all")} />
        {[1, 2, 3].map((minutes) => <Pill key={minutes} active={filter === minutes} color={colors.ai} label={`${minutes} min`} onPress={() => setFilter(minutes)} />)}
      </View>
      <View style={styles.grid}>
        {visibleGames.map((game) => (
          <SurfaceCard key={game.id} onPress={game.locked ? undefined : () => router.push({ pathname: "/(app)/game/[id]", params: { id: game.id } })} style={[styles.gameTile, game.locked && styles.lockedTile]}>
            <View style={styles.gameTop}>
              <Text style={styles.timer}>{gameDurationLabel(game.durationSeconds)} MIN</Text>
              <MaterialCommunityIcons name={game.icon as IconName} size={22} color={colors.ai} />
            </View>
            <Text style={styles.title}>{game.title}</Text>
            <Text style={rdmStyles.muted}>{game.description}</Text>
            {game.locked ? <Text style={styles.locked}>Locked today</Text> : <Text style={styles.ready}>Ready to play</Text>}
          </SurfaceCard>
        ))}
      </View>
      <View style={styles.lockNote}>
        <MaterialCommunityIcons name="timer-lock-outline" size={22} color={colors.ai} />
        <Text style={styles.lockText}>Every game auto-locks when its timer ends—there is no endless “one more round.”</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gameTile: { width: "48.4%", minHeight: 150, gap: 7 },
  gameTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timer: { color: colors.ai, backgroundColor: colors.aiTint, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, fontFamily: fonts.monoBold, fontSize: 9 },
  title: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13, marginTop: 3 },
  ready: { color: colors.ai, fontFamily: fonts.bodyBold, fontSize: 10, marginTop: "auto" },
  locked: { color: colors.growth, fontFamily: fonts.monoBold, fontSize: 9, marginTop: "auto", textTransform: "uppercase" },
  lockedTile: { opacity: 0.55 },
  lockNote: { flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 10 },
  lockText: { flex: 1, color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 },
});
