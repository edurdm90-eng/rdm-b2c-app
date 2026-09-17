import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { focusedColors as palette } from "@/components/focused-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { TreePage, formatTreeDay, treeStyles as shared } from "@/components/tree-ui";
import { formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function TreeHistoryScreen() {
  const focused = useIsFocused();
  const [cursors, setCursors] = useState<string[]>([]);
  const query = useQuery(trpc.rdm.tree.history.queryOptions({ limit: 20, beforeDayKey: cursors.at(-1) }, { enabled: focused }));
  return <TreePage title="Care history">
    <Text style={shared.heading}>Small acts. Lasting growth.</Text>
    <Text style={shared.body}>Your saved reflections, gratitude and good deeds—all part of your tree&apos;s story.</Text>
    {query.isLoading ? <LoadingState label="Loading care history…" /> : query.error ? <ErrorState message={query.error.message} onRetry={() => void query.refetch()} /> : query.data ? <>
      <Text style={shared.small}>Care dates follow {query.data.timeZone}.</Text>
      {!query.data.entries.length ? <View style={shared.panel}><Text style={shared.body}>No care records here yet. Any care action after planting your tree starts its story.</Text></View> : query.data.entries.map((entry) => <View key={entry.dayKey} style={styles.day}>
        <Text style={shared.small}>{formatTreeDay(entry.dayKey, true)}</Text>
        <View style={[shared.panel, styles.row]}>
          <MaterialCommunityIcons name={entry.status === "cared" ? "check-circle" : "close-circle"} color={entry.status === "cared" ? palette.green : palette.coral} size={27} />
          <View style={styles.details}>
            <Text style={shared.section}>{entry.status === "cared" ? "Your tree was cared for" : "Care day missed"}</Text>
            {entry.fertilizerCount > 0 ? <Text style={shared.small}>{entry.fertilizerCount} habit / goal reflection{entry.fertilizerCount === 1 ? "" : "s"}</Text> : null}
            {entry.waterCount > 0 ? <Text style={shared.small}>{entry.waterCount} gratitude entr{entry.waterCount === 1 ? "y" : "ies"}</Text> : null}
            {entry.sunlightCount > 0 ? <Text style={shared.small}>{entry.sunlightCount} good deed{entry.sunlightCount === 1 ? "" : "s"}</Text> : null}
            {entry.transferredToRemorse !== null ? <Text style={[shared.small, { color: palette.coral }]}>{formatRdm(entry.transferredToRemorse)} RDM moved from Reward to Remorse</Text> : null}
          </View>
        </View>
      </View>)}
      <View style={styles.pagination}>
        {cursors.length ? <Pressable accessibilityRole="button" onPress={() => setCursors((value) => value.slice(0, -1))} style={shared.textButton}><Text style={shared.link}>Newer days</Text></Pressable> : null}
        {query.data.nextBeforeDayKey ? <Pressable accessibilityRole="button" onPress={() => setCursors((value) => [...value, query.data!.nextBeforeDayKey!])} style={shared.textButton}><Text style={shared.link}>Older days</Text></Pressable> : null}
      </View>
    </> : null}
  </TreePage>;
}

const styles = StyleSheet.create({
  day: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 13 },
  details: { flex: 1, gap: 4 },
  pagination: { flexDirection: "row", justifyContent: "space-between" },
});
