import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusedButton, FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { GoalProgressControl } from "@/components/goal-progress-control";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { formatDayKey } from "@/lib/date";
import { canSubmitGoalReflection, getGoalPresentation, type Goal } from "@/lib/goal-presentation";
import { STANDARD_REFRESH_MS } from "@/lib/query-policy";
import { fonts, formatRdm } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type GoalAction = "progress" | "complete" | "miss";
type Confirmation = { action: GoalAction; dayKey: string; version: number; remaining: number };
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function ProgressBar({ value }: { value: number }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="Target progress" accessibilityValue={{ min: 0, max: 100, now: value }} style={styles.track}><View style={[styles.fill, { width: `${value}%` }]} /></View>;
}

function LedgerValue({ icon, value, label, hint, color = palette.text }: { icon: IconName; value: number; label: string; hint: string; color?: string }) {
  return <View style={styles.ledgerValue}><View style={styles.ledgerNumber}><MaterialCommunityIcons name={icon} size={27} color={color} /><Text style={styles.amount}>{formatRdm(value)}</Text></View><Text style={styles.ledgerLabel}>{label}</Text><Text style={styles.small}>{hint}</Text></View>;
}

export default function GoalDetailScreen() {
  const { id = "", view: requestedView } = useLocalSearchParams<{ id: string; view?: string }>();
  const focused = useIsFocused();
  const goal = useQuery({ ...trpc.rdm.goals.byId.queryOptions({ id }), enabled: focused && Boolean(id), refetchInterval: focused ? STANDARD_REFRESH_MS : false });
  const [view, setView] = useState<"overview" | "reflect">(requestedView === "reflect" ? "reflect" : "overview");
  const [tab, setTab] = useState<"overview" | "reflections">("overview");
  const [reflection, setReflection] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(0);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const reflectionAttempt = useRef<{ fingerprint: string; operationId: string } | null>(null);
  const reflectionDay = useRef<string | null>(null);
  const scrollToDay = useRef<string | null>(null);
  const inFlight = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setView(requestedView === "reflect" ? "reflect" : "overview");
    setReflection(""); setNote(""); setError(null); setNotice(null);
    setConfirmation(null); setTab("overview"); setExpandedDay(null);
    attempt.current = null; reflectionAttempt.current = null;
    reflectionDay.current = null;
    scrollToDay.current = null;
  }, [id, requestedView]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [view, tab]);

  async function accept(saved: Goal) {
    queryClient.setQueryData(trpc.rdm.goals.byId.queryOptions({ id }).queryKey, saved);
    await queryClient.invalidateQueries();
  }
  async function failed(problem: { message: string }) {
    setError(problem.message);
    await goal.refetch();
  }
  const updateGoal = useMutation(trpc.rdm.goals.update.mutationOptions({
    onSuccess: async (saved) => {
      const action = confirmation?.action;
      setConfirmation(null); setNote(""); attempt.current = null;
      setNotice(action === "progress" ? "Target progress saved. Daily RDM is unchanged."
        : saved.fundingMode === "daily"
          ? saved.status === "completed" ? "Goal completed. All daily RDM was already allocated; no extra payout was made."
            : "Goal ended. Remaining allocations moved to Remorse; previous Reward is unchanged."
          : formatRdm(saved.pledgeAmount) + " RDM moved to " + (saved.status === "completed" ? "Reward." : "Remorse."));
      await accept(saved);
    },
    onError: failed, onSettled: () => { inFlight.current = false; },
  }));
  const reflectGoal = useMutation(trpc.rdm.goals.reflect.mutationOptions({
    onSuccess: async (saved) => {
      setReflection(""); reflectionAttempt.current = null; reflectionDay.current = null; setView("overview"); setTab("overview");
      setNotice("Reflection saved. " + formatRdm(saved.pledgePerDay ?? 0) + " RDM moved to Reward from your pledge.");
      await accept(saved);
    },
    onError: failed, onSettled: () => { inFlight.current = false; },
  }));
  const busy = updateGoal.isPending || reflectGoal.isPending;
  const reflectionActive = view === "reflect" && Boolean(goal.data && getGoalPresentation(goal.data).canReflect);
  usePreventRemove(busy || reflectionActive || confirmation !== null, () => {
    if (busy) return;
    if (confirmation) { setConfirmation(null); setError(null); }
    else setView("overview");
  });

  if (goal.isLoading) return <LoadingState label="Opening your goal…" />;
  if (!goal.data) return <ErrorState message={goal.error?.message ?? "Goal not found."} onRetry={() => void goal.refetch()} />;

  const data = goal.data;
  const presentation = getGoalPresentation(data);
  const daily = data.fundingMode === "daily";
  const reflecting = reflectionActive;
  const staleDraft = Boolean(reflection.trim() && reflectionDay.current && reflectionDay.current !== presentation.todayDayKey);
  const editable = data.status === "active" && !presentation.upcoming && !presentation.ended;
  const canComplete = editable && data.canComplete;
  const dayLabel = presentation.upcoming ? "Starts " + formatDayKey(data.startDayKey) : "Day " + presentation.dayNumber + " of " + data.durationDays;
  const todayEntry = data.dayEntries.find((entry) => entry.dayKey === presentation.todayDayKey);
  const recent = [...data.dayEntries].filter((entry) => entry.outcome === "completed").sort((a, b) => b.dayKey.localeCompare(a.dayKey))[0];
  const entries = [...data.dayEntries].sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  const remainingDays = daily ? Math.max(0, data.durationDays - data.completedDayCount - data.missedDayCount) : 0;
  const reflectedRdm = data.completedDayCount * (data.pledgePerDay ?? 0);
  const missedRdm = data.missedDayCount * (data.pledgePerDay ?? 0);
  const modalBusy = busy || inFlight.current;

  function back() {
    if (busy) return;
    if (reflecting) { setView("overview"); setError(null); return; }
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/goals");
  }
  function openEditor(action: GoalAction) {
    if (busy || !editable || (action === "complete" && !canComplete)) return;
    setError(null); setNote(""); setProgress(Math.min(99, presentation.progress));
    setConfirmation({ action, dayKey: presentation.todayDayKey, version: data.progressVersion, remaining: data.remainingPledge });
  }
  function submitReflection() {
    if (busy || inFlight.current) return;
    setError(null); setNotice(null);
    if (!canSubmitGoalReflection(data, presentation.todayDayKey, reflectionDay.current)) {
      setError("The day or goal changed. Refresh before reflecting."); void goal.refetch(); return;
    }
    const trimmed = reflection.trim();
    if (trimmed.length < 2) { setError("Write a short, honest reflection about today's progress."); return; }
    const values = { id, note: trimmed, expectedVersion: data.progressVersion };
    const fingerprint = JSON.stringify({ ...values, dayKey: presentation.todayDayKey });
    if (reflectionAttempt.current?.fingerprint !== fingerprint) reflectionAttempt.current = { fingerprint, operationId: Crypto.randomUUID() };
    inFlight.current = true;
    reflectGoal.mutate({ ...values, operationId: reflectionAttempt.current.operationId });
  }
  function submitUpdate() {
    if (!confirmation || busy || inFlight.current) return;
    setError(null); setNotice(null);
    const live = getGoalPresentation(data);
    if (live.todayDayKey !== confirmation.dayKey || confirmation.version !== data.progressVersion
      || confirmation.remaining !== data.remainingPledge || !editable || live.upcoming || live.ended) {
      setError("This goal changed. Close this panel and review its current details before confirming.");
      void goal.refetch(); return;
    }
    if (confirmation.action === "complete" && !canComplete) { setError("Settle every daily allocation before confirming the final target."); return; }
    if (note.trim().length < 2) { setError("Add a short note about your progress or outcome."); return; }
    const values = { id, action: confirmation.action, note: note.trim(), expectedVersion: confirmation.version,
      ...(confirmation.action === "progress" ? { progress } : {}) };
    const fingerprint = JSON.stringify(values);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, requestId: Crypto.randomUUID() };
    inFlight.current = true;
    updateGoal.mutate({ ...values, requestId: attempt.current.requestId });
  }

  const confirmationCopy = confirmation?.action === "progress" ? "Save your overall target progress separately. This does not complete today's reflection or move RDM. Confirm 100% only when the goal is complete."
    : confirmation?.action === "complete"
      ? daily ? "Confirm that you reached your target. All daily RDM is already allocated; completing the goal does not issue another payout."
        : "Confirm your target is achieved. Your " + formatRdm(data.pledgeAmount) + " RDM pledge will move to Reward."
      : daily ? "All remaining " + formatRdm(confirmation?.remaining ?? 0) + " RDM will move to Remorse, including future days. Previous Reward stays yours. This cannot be undone."
        : "Your full " + formatRdm(data.pledgeAmount) + " RDM pledge will move to Remorse and this goal will close. This cannot be undone.";

  return (
    <FocusedScreen scroll={false} bottomSafe contentStyle={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={reflecting ? "Back to goal progress" : "Go back"} disabled={busy} onPress={back} style={styles.iconButton}><MaterialCommunityIcons name="arrow-left" size={28} color={palette.muted} /></Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>{data.title}</Text>
          {reflecting ? <Text style={styles.headerDay}>{dayLabel}</Text> : null}
        </View>
        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={[styles.content, !reflecting && styles.overviewContent]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {notice ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
          {reflecting ? (
            <>
              <View style={styles.reflectionField}>
                <Text accessibilityRole="header" style={styles.question}>{data.reflectionPrompt || "What moved you closer today?"}</Text>
                <View style={[styles.textArea, fieldFocused && styles.textAreaFocused]}>
                  <TextInput accessibilityLabel="Today's goal reflection" editable={!busy} value={reflection} onChangeText={(value) => {
                    if (!value.trim()) reflectionDay.current = null;
                    else if (!reflectionDay.current) reflectionDay.current = getGoalPresentation(data).todayDayKey;
                    setReflection(value);
                  }} onFocus={() => setFieldFocused(true)} onBlur={() => setFieldFocused(false)}
                    multiline maxLength={500} textAlignVertical="top" placeholder="A small step or an honest observation…" placeholderTextColor={palette.muted} style={[styles.input, Platform.OS === "web" && styles.webInput]} />
                  <Text style={styles.counter}>{reflection.length}/500</Text>
                </View>
                {staleDraft ? <View><Text accessibilityRole="alert" style={styles.error}>This unsaved draft belongs to {formatDayKey(reflectionDay.current!)}. Copy anything you need before starting today's reflection.</Text><Pressable accessibilityRole="button" disabled={busy} style={styles.textButton} onPress={() => { setReflection(""); reflectionDay.current = null; setError(null); }}><Text style={styles.link}>Start today's reflection</Text></Pressable></View> : null}
              </View>
              <View style={styles.optionalProgress}>
                <View style={styles.between}><Text style={styles.label}>Target progress <Text style={styles.small}>(optional)</Text></Text><Text style={styles.progressValue}>{presentation.progress}%</Text></View>
                <ProgressBar value={presentation.progress} />
                <Pressable accessibilityRole="button" accessibilityLabel="Update target progress" disabled={busy} onPress={() => openEditor("progress")} style={styles.textButton}><Text style={styles.link}>Update target progress</Text><MaterialCommunityIcons name="chevron-right" size={20} color={palette.link} /></Pressable>
                <Text style={styles.small}>Saved separately from your daily reflection.</Text>
              </View>
              <View style={styles.reflectionAllocation}>
                <View style={styles.allocationHeading}><View style={styles.allocationIcon}><MaterialCommunityIcons name="database-outline" size={30} color={palette.text} /></View><View style={styles.flex}><Text style={styles.muted}>Today's allocation</Text><Text style={styles.largeAmount}>{formatRdm(data.pledgePerDay ?? 0)} RDM</Text></View></View>
                <Text style={styles.copy}>Completing this reflection moves {formatRdm(data.pledgePerDay ?? 0)} RDM from your pledge to Reward.</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.goalSummary}>
                <View style={styles.goalTitleRow}><MaterialCommunityIcons name="bullseye-arrow" size={42} color={palette.gold} /><View style={styles.flex}><Text style={styles.goalTitle}>{data.title}</Text><Text style={styles.muted}>{data.target}</Text></View></View>
                <View style={styles.between}><Text style={styles.muted}>{dayLabel}</Text><Text style={styles.progressValue}>{presentation.progress}%</Text></View>
                <ProgressBar value={presentation.progress} />
                {data.status !== "active" || presentation.ended ? <Text style={[styles.small, { color: data.status === "completed" ? palette.green : palette.coral }]}>{data.status === "completed" ? "Goal completed" : "Goal ended · target not confirmed complete"}</Text> : null}
              </View>
              <View accessibilityRole="tablist" style={styles.tabs}>
                {(["overview", "reflections"] as const).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} aria-selected={tab === item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.selectedTab]}><Text style={[styles.tabText, tab === item && styles.selectedTabText]}>{item === "overview" ? "Overview" : "Reflections"}</Text></Pressable>)}
              </View>
              {tab === "overview" ? (
                <>
                  <View style={styles.roadmap}>
                    <View style={styles.between}><Text style={styles.label}>Goal roadmap</Text>{editable ? <Pressable accessibilityRole="button" accessibilityLabel="Update target progress" onPress={() => openEditor("progress")} disabled={busy} style={styles.textButton}><Text style={styles.link}>Update progress</Text><MaterialCommunityIcons name="chevron-right" size={20} color={palette.link} /></Pressable> : null}</View>
                    {data.why ? <Text style={styles.copy}>{data.why}</Text> : null}
                    {data.steps.length > 0 ? data.steps.map((step, index) => <View key={index} style={styles.stepRow}>
                      <View style={styles.stepRail}>{index < data.steps.length - 1 ? <View style={styles.stepLine} /> : null}<View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View></View>
                      <Text style={[styles.copy, styles.flex]}>{step}</Text>
                    </View>) : <Text style={styles.copy}>No roadmap steps were added. Use your target and daily reflections to guide your next small step.</Text>}
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.label}>RDM ledger</Text>
                    <View style={styles.ledgerRow}>
                      <LedgerValue icon="database-outline" value={daily ? reflectedRdm : data.status === "completed" ? data.pledgeAmount : 0} label={daily ? "RDM to Reward" : "Reward"} hint={daily ? data.completedDayCount + " reflected days" : "From your original pledge"} color={palette.gold} />
                      <View style={styles.divider} />
                      <LedgerValue icon="lock-outline" value={data.remainingPledge} label="RDM remaining" hint="Held in pledge" />
                    </View>
                    {daily && data.missedDayCount > 0 ? <Text style={[styles.small, styles.coral]}>{formatRdm(missedRdm)} RDM to Remorse · {data.missedDayCount} missed or forfeited allocations</Text> : null}
                    {!daily ? <Text style={styles.small}>This older goal uses a whole-goal pledge. Completing moves it to Reward; ending or missing the deadline moves it to Remorse.</Text> : null}
                  </View>

                  <View style={styles.section}>
                    <View style={styles.between}><Text style={styles.label}>Recent reflection</Text>{recent ? <Text style={styles.small}>{formatDayKey(recent.dayKey)}</Text> : null}</View>
                    {recent ? <Pressable accessibilityRole="button" accessibilityLabel="View recent reflection" onPress={() => { scrollToDay.current = recent.dayKey; setExpandedDay(recent.dayKey); setShowAll(true); setTab("reflections"); }} style={styles.recent}>
                      <MaterialCommunityIcons name="file-document-outline" size={25} color={palette.muted} /><Text numberOfLines={3} style={[styles.copy, styles.flex]}>{recent.note}</Text><MaterialCommunityIcons name="chevron-right" size={21} color={palette.muted} />
                    </Pressable> : <Text style={styles.small}>{daily ? "Your first saved reflection will appear here." : "Progress and outcome notes appear in Reflections."}</Text>}
                  </View>

                  <View style={styles.statusCard}><MaterialCommunityIcons name={canComplete ? "check-circle-outline" : "clock-outline"} size={24} color={canComplete ? palette.green : palette.muted} /><View style={styles.flex}>
                    <Text style={styles.label}>{presentation.upcoming ? "Your goal starts " + formatDayKey(data.startDayKey) : data.status !== "active" || presentation.ended ? "Your records are saved" : daily ? remainingDays + " daily allocations remaining" : "Working toward your target"}</Text>
                    <Text style={styles.small}>{canComplete ? daily ? "All daily allocations are settled. Confirm your final target before the end date." : "Confirm target achievement to move your whole pledge to Reward." : todayEntry?.outcome === "completed" && remainingDays > 0 ? "Today's reflection is saved. Come back tomorrow." : daily ? "Reflections settle RDM; final target completion is separate." : "Record progress, then confirm the final outcome."}</Text>
                  </View></View>
                  <Text style={styles.small}>{formatDayKey(data.startDayKey)} → {formatDayKey(data.endDayKey)} · end date excluded · {data.timeZone}</Text>
                  {editable ? <Pressable accessibilityRole="button" disabled={busy} accessibilityLabel={daily ? "End goal early" : "Mark goal as missed"} onPress={() => openEditor("miss")} style={styles.endCard}><MaterialCommunityIcons name="alert-outline" size={27} color={palette.coral} /><View style={styles.flex}><Text style={[styles.label, styles.coral]}>{daily ? "End goal early" : "Mark goal as missed"}</Text><Text style={[styles.small, styles.coral]}>{daily ? "Ending early moves remaining pledge to Remorse." : "Your original pledge moves to Remorse."}</Text></View><MaterialCommunityIcons name="chevron-right" size={20} color={palette.coral} /></Pressable> : null}
                </>
              ) : (
                <>
                  {daily ? <><Text style={styles.label}>Daily reflections</Text>{entries.length === 0 ? <Text style={styles.copy}>No daily reflections yet. Your completed, missed and forfeited days will appear here.</Text> : (showAll ? entries : entries.slice(0, 7)).map((entry) => {
                    const saved = entry.outcome === "completed";
                    const forfeited = !saved && entry.dayKey > presentation.todayDayKey;
                    const expanded = expandedDay === entry.dayKey;
                    return <View key={entry.dayKey} style={styles.historyItem} onLayout={(event) => {
                      if (scrollToDay.current === entry.dayKey) {
                        scrollToDay.current = null;
                        scroll.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: true });
                      }
                    }}>
                      <Text style={styles.small}>{formatDayKey(entry.dayKey)}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={formatDayKey(entry.dayKey) + ". " + (saved ? "Reflected" : forfeited ? "Forfeited" : "Missed") + ". " + (expanded ? "Hide" : "View") + " entry"} aria-expanded={expanded} accessibilityState={{ expanded }} onPress={() => setExpandedDay(expanded ? null : entry.dayKey)} style={styles.historyRow}>
                        <MaterialCommunityIcons name={saved ? "check-circle" : "close-circle"} size={29} color={saved ? palette.green : palette.coral} />
                        <View style={styles.flex}><Text style={styles.label}>{saved ? "Reflected" : forfeited ? "Forfeited on early closure" : "Missed"}</Text><Text style={[styles.small, { color: saved ? palette.green : palette.coral }]}>{formatRdm(data.pledgePerDay ?? 0)} RDM to {saved ? "Reward" : "Remorse"}</Text></View>
                        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-right"} size={21} color={palette.muted} />
                      </Pressable>
                      {expanded ? <View style={styles.historyDetail}><Text style={styles.copy}>{entry.note || "No reflection was recorded for this day."}</Text><Text style={styles.small}>This allocation is settled. Saved entries cannot be changed.</Text></View> : null}
                    </View>;
                  })}{entries.length > 7 && !showAll ? <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={styles.textButton}><Text style={styles.link}>Show all {entries.length} days</Text></Pressable> : null}</> : null}
                  <Text style={styles.label}>Target progress & outcomes</Text>
                  {data.progressUpdates.length === 0 ? <Text style={styles.small}>Your target-progress and final-outcome notes will appear here.</Text> : [...data.progressUpdates].reverse().map((entry) => <View key={entry.requestId} style={styles.historyDetail}><View style={styles.between}><Text style={styles.label}>{entry.progress}% · {entry.status}</Text><Text style={styles.small}>{new Date(entry.recordedAt).toLocaleDateString("en-IN", { timeZone: data.timeZone })}</Text></View><Text style={styles.copy}>{entry.note}</Text></View>)}
                </>
              )}
            </>
          )}
        </ScrollView>
        {reflecting || presentation.canReflect || canComplete || goal.error || error ? <View style={styles.footer}>
          {goal.error ? <Pressable accessibilityRole="button" onPress={() => void goal.refetch()} style={styles.textButton}><Text style={styles.error}>Couldn't refresh your goal. Your draft is kept here. Tap to retry.</Text></Pressable> : null}
          {error && !confirmation ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {reflecting ? <><FocusedButton label="Complete reflection" loading={busy} disabled={staleDraft} onPress={submitReflection} /><Pressable accessibilityRole="button" disabled={busy} onPress={() => { setView("overview"); setError(null); }} style={styles.skip}><Text style={styles.link}>Not today</Text></Pressable></>
            : presentation.canReflect ? <FocusedButton label="Daily reflection" disabled={busy} onPress={() => { setView("reflect"); setError(null); setNotice(null); }} />
              : canComplete ? <FocusedButton label="Confirm goal complete" disabled={busy} onPress={() => openEditor("complete")} />
                : <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.dismissTo("/(app)/(tabs)/goals")} style={styles.outlineButton}><Text style={styles.outlineLabel}>Back to goals</Text></Pressable>}
        </View> : null}
      </KeyboardAvoidingView>
      <Modal animationType="slide" transparent visible={confirmation !== null} onRequestClose={() => { if (!busy) { setConfirmation(null); setError(null); } }}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close goal action" disabled={modalBusy} onPress={() => { setConfirmation(null); setError(null); }} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal role="dialog" aria-modal style={styles.sheet}>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]} keyboardShouldPersistTaps="handled">
              <View style={styles.handle} />
              <Text accessibilityRole="header" style={styles.sheetTitle}>{confirmation?.action === "progress" ? "Update target progress" : confirmation?.action === "complete" ? "Complete this goal?" : daily ? "End this goal early?" : "Mark this goal as missed?"}</Text>
              <Text style={styles.copy}>{confirmationCopy}</Text>
              {confirmation?.action === "progress" ? <><View style={styles.between}><Text style={styles.label}>Overall progress</Text><Text style={styles.progressValue}>{progress}%</Text></View><GoalProgressControl value={progress} onChange={setProgress} disabled={busy} /></> : null}
              <Text style={styles.label}>{confirmation?.action === "progress" ? "What changed?" : "Outcome note"}</Text>
              <TextInput accessibilityLabel="Goal progress or outcome note" editable={!busy} multiline maxLength={500} value={note} onChangeText={setNote} placeholder="A short, honest note…" placeholderTextColor={palette.muted} textAlignVertical="top" style={[styles.sheetInput, Platform.OS === "web" && styles.webInput]} />
              <Text style={styles.counter}>{note.length}/500</Text>
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <FocusedButton label={confirmation?.action === "progress" ? "Save progress" : confirmation?.action === "complete" ? "Confirm goal complete" : "Confirm end goal"} onPress={submitUpdate} loading={busy} style={confirmation?.action === "miss" ? styles.dangerButton : undefined} />
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setConfirmation(null); setError(null); }} style={styles.outlineButton}><Text style={styles.outlineLabel}>Keep working</Text></Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 11 },
  iconButton: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 25, flex: 1 },
  headerDay: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, maxWidth: 94, textAlign: "right" },
  content: { paddingHorizontal: 18, paddingBottom: 14, gap: 14 },
  overviewContent: { gap: 11 },
  footer: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: 14, gap: 7 },
  reflectionField: { gap: 12, marginTop: 3 },
  question: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 24 },
  textArea: { minHeight: 150, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, padding: 12, borderRadius: 8, gap: 8 },
  textAreaFocused: { borderColor: palette.link },
  input: { flex: 1, minHeight: 105, padding: 0, color: palette.text, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 22 },
  webInput: { outlineStyle: "solid", outlineWidth: 0, outlineColor: "transparent" },
  counter: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, textAlign: "right" },
  optionalProgress: { gap: 10, paddingTop: 14, paddingBottom: 18 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  small: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  muted: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  copy: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  progressValue: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22 },
  track: { height: 12, backgroundColor: "#293642", borderRadius: 6, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: palette.gold, borderRadius: 6 },
  textButton: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  reflectionAllocation: { borderTopWidth: 1, borderColor: palette.line, paddingTop: 16, gap: 13 },
  allocationHeading: { flexDirection: "row", alignItems: "center", gap: 14 },
  allocationIcon: { height: 52, width: 52, borderRadius: 26, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, justifyContent: "center", alignItems: "center" },
  largeAmount: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 29 },
  skip: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  goalSummary: { gap: 9 },
  goalTitleRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  goalTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 23, marginBottom: 2 },
  tabs: { flexDirection: "row", borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 3 },
  tab: { minHeight: 36, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  selectedTab: { backgroundColor: "#263542" },
  tabText: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  selectedTabText: { color: palette.text, fontFamily: fonts.bodyBold },
  roadmap: { gap: 10 },
  stepRow: { flexDirection: "row", gap: 14, minHeight: 34 },
  stepRail: { width: 28, alignItems: "center" },
  stepNumber: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: palette.link, alignItems: "center", justifyContent: "center", backgroundColor: palette.background },
  stepNumberText: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 12 },
  stepLine: { position: "absolute", top: 24, bottom: -12, width: 1, backgroundColor: palette.line },
  section: { borderTopWidth: 1, borderColor: palette.line, paddingTop: 12, gap: 9 },
  ledgerRow: { flexDirection: "row", gap: 14 },
  ledgerValue: { flex: 1, gap: 3 },
  ledgerNumber: { flexDirection: "row", gap: 11, alignItems: "center" },
  amount: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 28 },
  ledgerLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 19 },
  divider: { width: 1, backgroundColor: palette.line },
  recent: { flexDirection: "row", gap: 12, alignItems: "center", minHeight: 40 },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 11, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel },
  endCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 10, borderWidth: 1, borderColor: palette.line, borderRadius: 8, minHeight: 48 },
  coral: { color: palette.coral },
  historyItem: { gap: 6 },
  historyRow: { minHeight: 56, padding: 11, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.line, borderRadius: 8 },
  historyDetail: { padding: 12, gap: 8, backgroundColor: palette.panel, borderRadius: 8 },
  outlineButton: { minHeight: 44, borderWidth: 1, borderColor: "#46515F", borderRadius: 8, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 },
  outlineLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  error: { color: palette.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  notice: { color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "flex-end" },
  sheet: { maxWidth: 480, width: "100%", maxHeight: "90%", backgroundColor: palette.panel, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: palette.line, overflow: "hidden" },
  sheetScroll: { flexShrink: 1, width: "100%" },
  sheetContent: { gap: 12, paddingHorizontal: 18, paddingTop: 12 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#40505E", alignSelf: "center", marginBottom: 4 },
  sheetTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 27 },
  sheetInput: { minHeight: 96, borderWidth: 1, borderColor: "#46515F", backgroundColor: palette.background, borderRadius: 8, padding: 12, color: palette.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  dangerButton: { backgroundColor: palette.coral },
});
