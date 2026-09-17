import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FocusedButton, focusedColors as palette } from "@/components/focused-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { TreeArtwork, TreePage, formatTreeDay, treeStyles as shared } from "@/components/tree-ui";
import { fonts, formatRdm } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

export default function StreakMissedScreen() {
  const focused = useIsFocused();
  const query = useQuery(trpc.rdm.tree.missedDay.queryOptions(undefined, { enabled: focused }));
  const acknowledge = useMutation(trpc.rdm.tree.acknowledgeMissedDay.mutationOptions());
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState("");
  const missedDay = query.data?.missedDay;
  useEffect(() => {
    if (focused && !busy && (resolved || (query.data && !missedDay))) router.replace("/(app)/tree");
  }, [busy, focused, missedDay, query.data, resolved]);

  async function tend() {
    if (submitting.current || !missedDay) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await acknowledge.mutateAsync({ dayKey: missedDay.dayKey });
      await queryClient.invalidateQueries({ queryKey: trpc.rdm.pathKey() });
      setResolved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open your tree. Please try again.");
      void query.refetch();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <TreePage title="Grow Every Day" busy={busy} onBack={() => router.replace("/(app)/(tabs)")} footer={missedDay ? <>
    {error ? <Text accessibilityRole="alert" style={shared.error}>{error}</Text> : null}
    <FocusedButton label="Tend the tree now" onPress={() => void tend()} loading={busy} />
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.push("/(app)/(tabs)/wallet")} style={styles.secondary}><Text style={shared.section}>Open wallet</Text></Pressable>
  </> : undefined}>
    {query.isLoading || resolved ? <LoadingState label="Checking your tree care…" /> : query.error || !missedDay ? <ErrorState message={query.error?.message ?? "Checking your latest care record."} onRetry={() => void query.refetch()} /> : <>
      <TreeArtwork variant="resting" height={185} />
      <View style={styles.intro}><Text style={[shared.heading, styles.center]}>Missed a day?{"\n"}Start again today.</Text><Text style={shared.body}>{missedDay.missedYesterday ? "Yesterday · " : ""}{formatTreeDay(missedDay.dayKey)}</Text></View>
      <View style={[shared.panel, styles.receipt]}>
        <Text style={styles.receiptTitle}>{formatRdm(missedDay.transferredAmount)} RDM moved to Remorse</Text>
        <Text style={shared.body}>{missedDay.transferredAmount > 0 ? "A missed tree-care day moved available RDM from Reward to Remorse." : "Your Reward Purse was empty, so no RDM moved."}</Text>
        <View style={styles.purses}>
          <PurseRow title="Reward Purse" before={missedDay.rewardBefore} after={missedDay.rewardAfter} color={palette.gold} />
          <PurseRow title="Remorse Purse" before={missedDay.remorseBefore} after={missedDay.remorseAfter} color={palette.coral} />
        </View>
        <Text style={shared.small}>Only available Reward RDM is moved. Your Base Purse is unchanged.</Text>
      </View>
      <View style={styles.support}><MaterialCommunityIcons name="sprout" size={29} color={palette.green} /><Text style={[shared.body, { flex: 1 }]}>One act of care is enough to begin again.</Text></View>
    </>}
  </TreePage>;
}

function PurseRow({ title, before, after, color }: { title: string; before: number; after: number; color: string }) {
  return <View style={styles.row}><MaterialCommunityIcons name="circle" color={color} size={24} /><Text style={styles.purseTitle}>{title}</Text><Text style={styles.before}>{formatRdm(before)}</Text><MaterialCommunityIcons name="arrow-right" size={17} color={palette.muted} /><Text style={styles.after}>{formatRdm(after)}</Text></View>;
}

const styles = StyleSheet.create({
  center: { textAlign: "center" },
  intro: { alignItems: "center", gap: 8 },
  receipt: { gap: 10 },
  receiptTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 27 },
  purses: { borderRadius: 8, padding: 10, backgroundColor: palette.background, gap: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  purseTitle: { flex: 1, color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  before: { color: palette.muted, fontFamily: fonts.body, fontSize: 13 },
  after: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13 },
  support: { padding: 12, gap: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: palette.line, borderRadius: 8 },
  secondary: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: palette.line },
});
