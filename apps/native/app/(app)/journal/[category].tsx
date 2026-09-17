import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { GratitudeCategoryId } from "@rdm-b2c/api/domain/rdm";
import type { AppRouter } from "@rdm-b2c/api/routers/index";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { FocusedButton, focusedColors as palette } from "@/components/focused-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { TreeActionDialog } from "@/components/tree-action-dialog";
import { formatTreeDay, TreeNotice, TreePage } from "@/components/tree-ui";
import { fonts } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { queryClient, trpc } from "@/utils/trpc";

type JournalDetail = inferRouterOutputs<AppRouter>["rdm"]["gratitude"]["byCategory"];
type JournalEntry = NonNullable<JournalDetail["todayEntry"]>;
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const dateLabel = (dayKey: string) => formatTreeDay(dayKey, true);

function JournalForm({ detail, onRefresh }: { detail: JournalDetail; onRefresh: () => void }) {
  const { category } = detail;
  const [body, setBody] = useState(detail.todayEntry?.body ?? "");
  const [formDayKey, setFormDayKey] = useState(detail.dayKey);
  const [formTimeZone, setFormTimeZone] = useState(detail.timeZone);
  const [savedEntry, setSavedEntry] = useState<JournalEntry | null>(detail.todayEntry?.processedAt ? detail.todayEntry : null);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ reward: number; alreadySaved: boolean; message: string } | null>(null);
  const submitting = useRef(false);
  const dayChanged = detail.dayKey !== formDayKey || detail.timeZone !== formTimeZone;
  const persistedEntry = !dayChanged && detail.todayEntry?.processedAt ? detail.todayEntry : savedEntry;
  const displayedBody = persistedEntry?.body ?? body;
  const saved = Boolean(persistedEntry?.processedAt);
  const saveEntry = useMutation(trpc.rdm.gratitude.save.mutationOptions({
    onSuccess: (result) => {
      setSavedEntry(result.entry);
      setBody(result.entry.body);
      setConfirmation({ reward: result.reward, alreadySaved: result.alreadySaved,
        message: result.profile.tree.pledgedAt ? "Your gratitude entry watered your tree." : "Your gratitude is saved. Plant your tree to start recording its growth." });
      void queryClient.invalidateQueries();
    },
    onError: (failure) => { setError(failure.message); onRefresh(); },
    onSettled: () => { submitting.current = false; },
  }));
  const busy = saveEntry.isPending;

  function submit() {
    if (busy || submitting.current || saved || dayChanged) return;
    setError(null);
    const trimmedBody = body.trim();
    if (trimmedBody.length < 4) { setError("Write a few honest words before saving your entry."); return; }
    submitting.current = true;
    saveEntry.mutate({ category: category.id, body: trimmedBody, timeZone: formTimeZone, expectedDayKey: formDayKey });
  }

  function useCurrentDay() {
    if (busy || submitting.current) return;
    setFormDayKey(detail.dayKey);
    setFormTimeZone(detail.timeZone);
    setSavedEntry(detail.todayEntry?.processedAt ? detail.todayEntry : null);
    setBody(detail.todayEntry?.body ?? (saved ? "" : body));
    setError(null);
  }

  function backToTree() {
    if (busy || submitting.current) return;
    setConfirmation(null);
    router.dismissTo("/(app)/tree");
  }

  const history = (
    <View style={styles.history}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous entries" accessibilityState={{ expanded: historyOpen, disabled: busy }} aria-expanded={historyOpen} disabled={busy} onPress={() => setHistoryOpen((open) => !open)} style={styles.historyToggle}>
        <MaterialCommunityIcons name="file-document-outline" color={palette.muted} size={29} />
        <View style={styles.historyCopy}><Text style={styles.historyTitle}>Previous entries</Text><Text style={styles.historySubtitle}>View and reflect on your past gratitude journal entries</Text></View>
        <MaterialCommunityIcons name={historyOpen ? "chevron-down" : "chevron-right"} color={palette.muted} size={23} />
      </Pressable>
      {historyOpen ? <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent} nestedScrollEnabled>
        {detail.previousEntries.length ? detail.previousEntries.map((entry) => {
          const expanded = expandedEntryId === entry.id;
          return <View key={entry.id} style={styles.historyEntry}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Saved entry: ${dateLabel(entry.dayKey)}`} accessibilityState={{ expanded }} aria-expanded={expanded} onPress={() => setExpandedEntryId(expanded ? null : entry.id)} style={styles.entryToggle}>
              <Text style={styles.entryDate}>{dateLabel(entry.dayKey)}</Text><MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} color={palette.muted} size={20} />
            </Pressable>
            {expanded ? <Text selectable style={styles.entryBody}>{entry.body}</Text> : null}
          </View>;
        }) : <Text style={styles.historySubtitle}>No earlier entries in this category yet. Your saved reflections will appear here.</Text>}
        {detail.previousEntries.length > 0 ? <Text style={styles.historySubtitle}>Most recent {detail.previousEntries.length} earlier entries · read-only</Text> : null}
      </ScrollView> : null}
    </View>
  );

  return (
    <>
      <TreePage title={category.journalTitle} busy={busy} footer={<View style={styles.footer}>
        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <FocusedButton disabled={saved || dayChanged} label={saved ? "Saved for this day" : "Save entry"} loading={busy} onPress={submit} />
        {history}
      </View>}>
        <View style={styles.categoryRow}><View style={styles.categoryIcon}><MaterialCommunityIcons name={category.id === "life" ? "star" : category.icon as IconName} size={22} color={palette.link} /></View><Text style={styles.categoryLabel}>{category.journalSubtitle}</Text></View>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.question}>{category.prompt}</Text><Text style={styles.date}>{dateLabel(formDayKey)}</Text></View>
        {dayChanged ? <View style={styles.dayNotice}><Text style={styles.dayNoticeText}>The care day has changed to {dateLabel(detail.dayKey)}. Your text is kept; review it before saving with today’s date.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={useCurrentDay} style={styles.useDayButton}><Text style={styles.link}>Use today’s date</Text></Pressable></View> : null}
        <View style={[styles.journalBox, inputFocused && styles.journalFocused]}>
          <TextInput accessibilityLabel={category.prompt} editable={!saved && !busy && !dayChanged} maxLength={1000} multiline onChangeText={setBody} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} placeholder={category.placeholder} placeholderTextColor={palette.muted} style={[styles.journalInput, Platform.OS === "web" && styles.webInput, saved && styles.savedInput]} textAlignVertical="top" value={displayedBody} />
          <Text style={styles.characterCount}>{displayedBody.length}/1000</Text>
        </View>
        {saved ? <View accessibilityRole="alert" style={styles.savedNotice}><MaterialCommunityIcons name="check-circle" color={palette.green} size={20} /><Text style={styles.savedText}>Saved for this day · your entry is read-only.</Text></View> : <TreeNotice>Notice the small things, too.</TreeNotice>}
        <Text style={styles.timeZone}>Care time zone: {formTimeZone}. Each category can be saved once per day.</Text>
      </TreePage>
      <TreeActionDialog visible={confirmation !== null} kind="water" reward={confirmation?.reward ?? 0} title={confirmation?.alreadySaved ? "Already saved" : "Entry saved"} message={confirmation?.message ?? ""} busy={busy} onDone={() => setConfirmation(null)} onBackToTree={backToTree} />
    </>
  );
}

export default function JournalEntryScreen() {
  const [timeZone] = useState(getDeviceTimeZone);
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ category?: string }>();
  const categoryId = String(params.category ?? "") as GratitudeCategoryId;
  const detail = useQuery({ ...trpc.rdm.gratitude.byCategory.queryOptions({ category: categoryId, timeZone }), enabled: focused, refetchInterval: focused ? 30_000 : false, refetchIntervalInBackground: false });
  if (detail.isLoading) return <LoadingState label="Opening your journal…" />;
  if (!detail.data) return <ErrorState message={detail.error?.message ?? "This journal prompt is unavailable."} onRetry={() => void detail.refetch()} />;
  return <JournalForm key={detail.data.category.id} detail={detail.data} onRefresh={() => void detail.refetch()} />;
}

const styles = StyleSheet.create({
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  categoryIcon: { width: 40, height: 40, borderRadius: 16, backgroundColor: "#1C3650", alignItems: "center", justifyContent: "center" },
  categoryLabel: { flex: 1, color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 19 },
  heading: { gap: 11 },
  question: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 28 },
  date: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  journalBox: { minHeight: 260, padding: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 10, backgroundColor: palette.panel, gap: 10 },
  journalFocused: { borderColor: palette.link },
  journalInput: { minHeight: 210, color: palette.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 23, padding: 0 },
  webInput: { outlineStyle: "solid", outlineWidth: 0, outlineColor: "transparent" },
  savedInput: { color: palette.muted },
  characterCount: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, textAlign: "right" },
  savedNotice: { flexDirection: "row", gap: 9, alignItems: "center" },
  savedText: { flex: 1, color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  timeZone: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  footer: { gap: 14 },
  history: { borderTopWidth: 1, borderTopColor: palette.line },
  historyToggle: { minHeight: 74, paddingTop: 14, flexDirection: "row", alignItems: "center", gap: 14 },
  historyCopy: { flex: 1, gap: 3 },
  historyTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  historySubtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  historyList: { maxHeight: 200 },
  historyListContent: { paddingTop: 8, gap: 10 },
  historyEntry: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 2 },
  entryToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 },
  entryDate: { flex: 1, color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  entryBody: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 21, paddingBottom: 8 },
  error: { color: palette.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  dayNotice: { padding: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 8, gap: 5 },
  dayNoticeText: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 19 },
  useDayButton: { minHeight: 44, justifyContent: "center" },
  link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 13 },
});
