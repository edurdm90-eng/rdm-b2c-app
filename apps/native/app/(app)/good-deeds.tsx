import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { GoodDeedId } from "@rdm-b2c/api/domain/rdm";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FocusedButton, focusedColors as palette } from "@/components/focused-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { TreeActionDialog } from "@/components/tree-action-dialog";
import { formatTreeDay, TreePage } from "@/components/tree-ui";
import { STANDARD_REFRESH_MS } from "@/lib/query-policy";
import { fonts, formatRdm } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { invalidateQueriesInBackground, trpc } from "@/utils/trpc";

export default function GoodDeedsScreen() {
  const [timeZone] = useState(getDeviceTimeZone);
  const focused = useIsFocused();
  const [selected, setSelected] = useState<Set<GoodDeedId>>(() => new Set());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ reward: number; completedCount: number; message: string } | null>(null);
  const submitting = useRef(false);
  const goodDeeds = useQuery({ ...trpc.rdm.goodDeeds.today.queryOptions({ timeZone }), enabled: focused, refetchInterval: focused ? STANDARD_REFRESH_MS : false, refetchIntervalInBackground: false });
  const submitGoodDeeds = useMutation(trpc.rdm.goodDeeds.submit.mutationOptions({
    onSuccess: (result) => {
      setSelected(new Set());
      setSelectedDayKey(null);
      setConfirmation({ reward: result.reward, completedCount: result.completedCount,
        message: result.profile.tree.pledgedAt ? "Your good deeds added sunlight to your tree." : "Your good deeds are saved. Plant your tree to start recording its growth." });
      invalidateQueriesInBackground(
        trpc.rdm.goodDeeds.pathKey(),
        trpc.rdm.tree.pathKey(),
        trpc.rdm.wallet.summary.queryKey(),
        trpc.rdm.dashboard.queryKey(),
      );
    },
    onError: (failure) => { setError(failure.message); void goodDeeds.refetch(); },
    onSettled: () => { submitting.current = false; },
  }));
  const busy = submitGoodDeeds.isPending;
  if (goodDeeds.isLoading) return <LoadingState label="Opening your good deeds register…" />;
  if (!goodDeeds.data) return <ErrorState message={goodDeeds.error?.message ?? "Your good deeds register is unavailable."} onRetry={() => void goodDeeds.refetch()} />;
  const data = goodDeeds.data;
  const dayChanged = selectedDayKey !== null && selectedDayKey !== data.dayKey;
  const selectedDeeds = dayChanged ? [] : data.deeds.filter((deed) => !deed.completed && selected.has(deed.id));
  const selectedReward = selectedDeeds.reduce((sum, deed) => sum + deed.reward, 0);
  const completedCount = data.deeds.filter((deed) => deed.completed).length;

  function toggleDeed(deedId: GoodDeedId, completed: boolean) {
    if (completed || busy || submitting.current || dayChanged) return;
    setError(null);
    const next = new Set(selected);
    if (next.has(deedId)) next.delete(deedId); else next.add(deedId);
    setSelected(next);
    setSelectedDayKey(next.size ? data.dayKey : null);
  }

  function submit() {
    if (busy || submitting.current || dayChanged || selectedDeeds.length === 0) return;
    setError(null);
    submitting.current = true;
    submitGoodDeeds.mutate({ deedIds: selectedDeeds.map((deed) => deed.id), timeZone: data.timeZone, expectedDayKey: selectedDayKey ?? data.dayKey });
  }

  function backToTree() {
    if (busy || submitting.current) return;
    setConfirmation(null);
    router.dismissTo("/(app)/tree");
  }

  return (
    <>
      <TreePage title="Good Deeds Register" busy={busy} footer={<View style={styles.footer}>
        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <View accessibilityLiveRegion="polite" style={styles.selectionSummary}><Text style={styles.selectedCount}>{selectedDeeds.length} selected</Text><Text style={styles.selectedReward}>{formatRdm(selectedReward)} RDM</Text></View>
        <FocusedButton disabled={selectedDeeds.length === 0 || dayChanged} label="Submit today’s good deeds" loading={busy} onPress={submit} />
      </View>}>
        <View style={styles.hero}>
          <MaterialCommunityIcons name="white-balance-sunny" color={palette.gold} size={46} />
          <View style={styles.heroCopy}><Text accessibilityRole="header" style={styles.title}>A little kindness goes a long way.</Text><Text style={styles.date}>Today · {formatTreeDay(data.dayKey, true)}</Text></View>
        </View>
        <Text style={styles.intro}>These actions reward kindness in your community. Each deed can be recorded once per day.</Text>
        {dayChanged ? <View style={styles.dayNotice}><Text style={styles.intro}>The care day changed. Review today’s list before submitting; your earlier selections have not been submitted.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSelected(new Set()); setSelectedDayKey(null); setError(null); }} style={styles.reviewDay}><Text style={styles.link}>Review today’s deeds</Text></Pressable></View> : null}
        <View style={styles.deeds}>
          {data.deeds.map((deed) => {
            const checked = deed.completed || (!dayChanged && selected.has(deed.id));
            const disabled = deed.completed || busy || dayChanged;
            return <Pressable key={deed.id} accessibilityRole="checkbox" accessibilityLabel={`${deed.title}, ${deed.reward} RDM${deed.completed ? ", already recorded today" : ""}`} accessibilityState={{ checked, disabled }} aria-checked={checked} disabled={disabled} onPress={() => toggleDeed(deed.id, deed.completed)} style={({ pressed }) => [styles.deed, pressed && styles.pressed]}>
              <MaterialCommunityIcons name={checked ? "checkbox-marked" : "checkbox-blank-outline"} color={checked ? palette.green : palette.muted} size={28} />
              <View style={styles.deedCopy}><Text style={styles.deedTitle}>{deed.title}</Text>{deed.completed ? <Text style={styles.completed}>Recorded today</Text> : null}</View>
              <Text style={styles.deedReward}>{formatRdm(deed.reward)} RDM</Text>
            </Pressable>;
          })}
        </View>
        {completedCount > 0 ? <Text style={styles.savedSummary}>{completedCount} recorded today · {formatRdm(data.earnedToday)} RDM earned</Text> : null}
        <Text style={styles.timeZone}>Care time zone: {data.timeZone}. Only newly recorded deeds are included in the selected total.</Text>
      </TreePage>
      <TreeActionDialog visible={confirmation !== null} kind="sunlight" reward={confirmation?.reward ?? 0} title={confirmation?.completedCount ? "Good deeds saved" : "Already recorded"} message={confirmation?.message ?? ""} busy={busy} onDone={() => setConfirmation(null)} onBackToTree={backToTree} />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 15, paddingBottom: 6 },
  heroCopy: { flex: 1, gap: 6 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 26 },
  date: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  intro: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  deeds: { gap: 7 },
  deed: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel },
  deedCopy: { flex: 1, minWidth: 0, gap: 3 },
  deedTitle: { color: palette.text, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  deedReward: { color: palette.gold, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  completed: { color: palette.green, fontFamily: fonts.body, fontSize: 10, lineHeight: 15 },
  footer: { gap: 13 },
  selectionSummary: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel },
  selectedCount: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  selectedReward: { color: palette.gold, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22 },
  savedSummary: { color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  timeZone: { color: palette.muted, fontFamily: fonts.body, fontSize: 10, lineHeight: 16 },
  error: { color: palette.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  dayNotice: { padding: 12, gap: 3, borderWidth: 1, borderColor: palette.line, borderRadius: 8 },
  reviewDay: { minHeight: 44, justifyContent: "center" },
  link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 12 },
  pressed: { opacity: 0.75 },
});
