import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { haraHachiBu } from "@rdm-b2c/api/domain/wisdom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusedButton, FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { HabitHistory } from "@/components/habit-history";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { getHabitDetailPresentation, type HabitDetail } from "@/lib/habit-detail";
import { fonts, formatRdm } from "@/lib/theme";
import { goBackToJapaneseWisdom } from "@/lib/wisdom-navigation";
import { queryClient, trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const steps = ["Pledge", "Act", "Reflect", "Reward"];
const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDay(dayKey: string, short = false) {
  return new Date(dayKey + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: short ? undefined : "long", day: "numeric", month: short ? "short" : "long",
    year: short ? undefined : "numeric", timeZone: "UTC",
  });
}

function nextDayCopy(today: string, next: string | null) {
  if (!next) return "Every scheduled day is settled.";
  const tomorrow = new Date(today + "T12:00:00Z");
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return next === tomorrow.toISOString().slice(0, 10)
    ? "Your next reflection is tomorrow."
    : "Your next reflection is " + formatDay(next, true) + ".";
}

function HabitSteps({ stage }: { stage: "act" | "reflect" }) {
  const current = stage === "act" ? 1 : 2;
  return (
    <View accessibilityLabel={"Habit progress: " + steps[current]} style={styles.steps}>
      {steps.map((label, index) => (
        <View key={label} style={styles.step}>
          {index < 3 ? <View style={[styles.stepLine, index < current && styles.stepLineDone]} /> : null}
          <View style={[styles.stepCircle, index < current && styles.stepDone, index === current && styles.stepCurrent]}>
            {index < current ? <MaterialCommunityIcons name="check" size={21} color={palette.onGreen} /> : <Text style={[styles.stepNumber, index === current && styles.stepCurrentNumber]}>{index + 1}</Text>}
          </View>
          <Text style={[styles.stepLabel, index === current && styles.stepLabelCurrent]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function AllocationCard({ amount, title, description, reward = false }: { amount?: number; title: string; description: string; reward?: boolean }) {
  return (
    <View style={[styles.allocation, reward && styles.rewardAllocation]}>
      <MaterialCommunityIcons name="database-outline" size={31} color={reward ? palette.gold : palette.link} />
      <View style={styles.flex}>
        <Text style={styles.allocationTitle}>{title}</Text>
        {amount !== undefined ? <Text style={styles.allocationAmount}>{formatRdm(amount)} RDM</Text> : null}
        <Text style={styles.smallCopy}>{description}</Text>
      </View>
    </View>
  );
}

function Metric({ icon, label, value, hint, color = palette.muted }: { icon: IconName; label: string; value: string; hint: string; color?: string }) {
  return (
    <View style={styles.metric}>
      <MaterialCommunityIcons name={icon} size={28} color={color} />
      <View style={styles.flex}>
        <View style={styles.metricHeading}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>
        <Text style={styles.smallCopy}>{hint}</Text>
      </View>
    </View>
  );
}

function WeekProgress({ habit, todayDayKey }: { habit: HabitDetail; todayDayKey: string }) {
  return (
    <View style={styles.weekSection}>
      <Text style={styles.label}>This week</Text>
      <View style={styles.week}>
        {habit.weekProgress.map((day, index) => {
          const missed = habit.history.some((entry) => entry.dayKey === day.dayKey && entry.outcome === "missed");
          return (
            <View key={day.dayKey} accessibilityLabel={formatDay(day.dayKey) + ": " + (day.completed ? "completed" : missed ? "missed" : "not completed")} style={styles.weekDay}>
              <Text style={styles.weekLabel}>{weekLabels[index]}</Text>
              <View style={[styles.weekDate, day.dayKey === todayDayKey && styles.weekToday]}><Text style={[styles.weekNumber, day.dayKey === todayDayKey && styles.weekTodayText]}>{Number(day.dayKey.slice(-2))}</Text></View>
              <View style={[styles.weekDot, day.completed && styles.weekHit, missed && styles.weekMiss]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function HabitDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const focused = useIsFocused();
  const habit = useQuery({ ...trpc.rdm.habits.byId.queryOptions({ id }), enabled: focused && Boolean(id), refetchInterval: focused ? 30_000 : false });
  const [actionNote, setActionNote] = useState("");
  const [reflection, setReflection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actionExpanded, setActionExpanded] = useState(false);
  const [focusedField, setFocusedField] = useState<"action" | "reflection" | null>(null);
  const [missDayKey, setMissDayKey] = useState<string | null>(null);
  const inFlight = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setActionNote(habit.data?.lastAction ?? "");
    setReflection(habit.data?.reflection ?? "");
  }, [habit.data?.id, habit.data?.lastAction, habit.data?.reflection, habit.data?.rdmPledge?.currentDayKey]);
  useEffect(() => {
    setError(null);
    setActionExpanded(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [habit.data?.stage, historyOpen]);
  useEffect(() => {
    setHistoryOpen(false);
    setMissDayKey(null);
  }, [id]);

  async function refresh(updated: HabitDetail) {
    queryClient.setQueryData(trpc.rdm.habits.byId.queryOptions({ id }).queryKey, updated);
    await queryClient.invalidateQueries();
  }
  function mutationError(problem: { message: string }) { setError(problem.message); }
  function settled() { inFlight.current = false; }
  const logAction = useMutation(trpc.rdm.habits.logAction.mutationOptions({ onSuccess: refresh, onError: mutationError, onSettled: settled }));
  const reflect = useMutation(trpc.rdm.habits.reflect.mutationOptions({ onSuccess: (result) => refresh(result.habit), onError: mutationError, onSettled: settled }));
  const miss = useMutation(trpc.rdm.habits.miss.mutationOptions({
    onSuccess: async (result) => { setMissDayKey(null); setHistoryOpen(false); await refresh(result.habit); },
    onError: mutationError, onSettled: settled,
  }));
  const startNext = useMutation(trpc.rdm.habits.startNextCycle.mutationOptions({ onSuccess: refresh, onError: mutationError, onSettled: settled }));
  const busy = logAction.isPending || reflect.isPending || miss.isPending || startNext.isPending;
  usePreventRemove(historyOpen || busy, () => { if (!busy) setHistoryOpen(false); });

  if (habit.isLoading) return <LoadingState label="Opening your habit…" />;
  if (!habit.data) return <ErrorState message={habit.error?.message ?? "Habit not found."} onRetry={() => void habit.refetch()} />;

  const data = habit.data;
  const presentation = getHabitDetailPresentation(data);
  const state = presentation.state;
  const pledge = data.rdmPledge;
  const wisdom = data.wisdomPracticeId === haraHachiBu.id;
  const icon = (data.icon === "book-open" ? "book-open-variant-outline" : data.icon) as IconName;
  const isAction = state === "act";
  const isReflection = state === "reflect";
  const completed = state === "completed";
  const missed = state === "missed";
  const resultScreen = completed || missed;
  const legacyNext = !pledge && data.active && data.stage === "reward" && state === "inactive";
  const destination = wisdom ? "/(app)/(tabs)/japanese-wisdom" : "/(app)/(tabs)/habits";

  function back() {
    if (busy) return;
    if (historyOpen) { setHistoryOpen(false); return; }
    if (wisdom) { goBackToJapaneseWisdom(); return; }
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/habits");
  }
  function backToHabits() {
    if (!busy) router.dismissTo(destination);
  }
  function openHistory() {
    setError(null);
    setHistoryOpen(true);
  }
  function saveAction() {
    if (busy || inFlight.current || !isAction) return;
    setError(null);
    const current = getHabitDetailPresentation(data);
    if (current.state !== "act" || current.todayDayKey !== presentation.todayDayKey) {
      setError("The day changed. Refresh today's habit before saving your action.");
      void habit.refetch();
      return;
    }
    if (actionNote.trim().length < 2) { setError("Add a short, honest note about today's action."); return; }
    inFlight.current = true;
    logAction.mutate({ id, note: actionNote.trim() });
  }
  function saveReflection() {
    if (busy || inFlight.current || !isReflection) return;
    setError(null);
    const current = getHabitDetailPresentation(data);
    if (current.state !== "reflect" || current.todayDayKey !== presentation.todayDayKey) {
      setError("The day changed. Refresh today's habit before saving your reflection.");
      void habit.refetch();
      return;
    }
    if (reflection.trim().length < 4) { setError("Write a short, honest reflection before completing today."); return; }
    inFlight.current = true;
    reflect.mutate({ id, reflection: reflection.trim(), timeZone: pledge?.timeZone ?? "Asia/Kolkata" });
  }
  function confirmMiss() {
    if (busy || inFlight.current) return;
    const current = getHabitDetailPresentation(data);
    if (current.state !== "act" || current.todayDayKey !== missDayKey) {
      setMissDayKey(null);
      setError("This day's availability changed. Review your current habit before continuing.");
      void habit.refetch();
      return;
    }
    setError(null);
    inFlight.current = true;
    miss.mutate({ id });
  }

  return (
    <FocusedScreen scroll={false} bottomSafe contentStyle={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Pressable accessibilityLabel={historyOpen ? "Back to today's habit" : "Go back"} accessibilityRole="button" disabled={busy} onPress={back} style={styles.iconButton}><MaterialCommunityIcons name="arrow-left" size={28} color={palette.text} /></Pressable>
            <Text accessibilityRole="header" style={styles.headerTitle}>{data.title}</Text>
            {!historyOpen ? <Pressable accessibilityLabel="View habit history" accessibilityRole="button" disabled={busy} onPress={openHistory} style={styles.iconButton}><MaterialCommunityIcons name="history" size={23} color={palette.muted} /></Pressable> : null}
          </View>
          <View style={styles.headerMeta}><Text style={styles.subtitle}>{data.category} · {data.cadence}</Text><MaterialCommunityIcons name={icon} size={32} color={palette.text} /></View>
        </View>

        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={[styles.content, resultScreen && !historyOpen && styles.resultContent]} keyboardShouldPersistTaps="handled">
          {historyOpen ? (
            <HabitHistory habit={data} todayDayKey={presentation.todayDayKey} canOpenToday={isAction || isReflection} canMissToday={isAction && !busy} onOpenToday={() => setHistoryOpen(false)} onMissToday={() => { setError(null); setMissDayKey(presentation.todayDayKey); }} />
          ) : isAction || isReflection ? (
            <>
              <HabitSteps stage={isAction ? "act" : "reflect"} />
              {isAction ? (
                <>
                  <View style={styles.streakRow}>
                    <MaterialCommunityIcons name="fire" size={35} color={palette.gold} />
                    <View style={styles.flex}><Text style={styles.metricValue}>{data.streak} day streak</Text><Text style={styles.smallCopy}>{data.streak ? "Keep going. Small steps add up." : "Start with one small step today."}</Text></View>
                  </View>
                  <View style={styles.todayRow}><Text style={styles.label}>Today</Text><Text style={styles.dateLabel}>{formatDay(presentation.todayDayKey)}</Text></View>
                  <View style={styles.field}>
                    <Text accessibilityRole="header" style={styles.prompt}>{wisdom ? "What did you notice during a meal today?" : "What did you do today?"}</Text>
                    {wisdom ? <Text style={styles.smallCopy}>An honest check-in counts, even on a difficult day. This is not about eating less, calories, or weight. Follow your nutritional needs and professional guidance.</Text> : null}
                    <View style={[styles.textArea, focusedField === "action" && styles.focusedTextArea]}>
                      <TextInput accessibilityLabel={wisdom ? "Mindful eating check-in" : "Action log"} editable={!busy} maxLength={240} multiline onFocus={() => setFocusedField("action")} onBlur={() => setFocusedField(null)} onChangeText={setActionNote} placeholder={wisdom ? "Describe a moment you noticed, without judging it." : "Write a short note about " + data.target.toLowerCase() + "."} placeholderTextColor={palette.muted} style={[styles.input, Platform.OS === "web" && styles.webInput]} textAlignVertical="top" value={actionNote} />
                      <Text style={styles.counter}>{actionNote.length}/240</Text>
                    </View>
                    <Text style={[styles.smallCopy, styles.linkColor]}>A short, honest note is enough.</Text>
                  </View>
                  <AllocationCard title={pledge ? formatRdm(pledge.perDay) + " RDM reserved for today" : "Complete your action, then reflect"} description={pledge ? "From your habit pledge." : "Your reward follows a completed reflection."} />
                </>
              ) : (
                <>
                  <View style={styles.field}>
                    <Text accessibilityRole="header" style={styles.prompt}>{wisdom ? haraHachiBu.reflectionPrompt : "What made this easier or harder today?"}</Text>
                    <View style={[styles.textArea, styles.reflectionArea, focusedField === "reflection" && styles.focusedTextArea]}>
                      <TextInput accessibilityLabel="Reflection" editable={!busy} maxLength={500} multiline onFocus={() => setFocusedField("reflection")} onBlur={() => setFocusedField(null)} onChangeText={setReflection} placeholder={wisdom ? "What felt comfortable or difficult? Any honest reflection counts." : "Notice what helped and what you might try next time."} placeholderTextColor={palette.muted} style={[styles.input, Platform.OS === "web" && styles.webInput]} textAlignVertical="top" value={reflection} />
                      <Text style={styles.counter}>{reflection.length}/500</Text>
                    </View>
                    <Text style={styles.smallCopy}>A short, honest reflection helps you build the habit.</Text>
                  </View>
                  <View style={styles.actionReviewSection}>
                    <Pressable accessibilityRole="button" accessibilityLabel="View your saved action" accessibilityState={{ expanded: actionExpanded }} aria-expanded={actionExpanded} onPress={() => setActionExpanded(!actionExpanded)} style={styles.actionReview}>
                      <View style={styles.flex}>
                        <Text style={styles.label}>Your action</Text>
                        <View style={styles.actionPreview}><MaterialCommunityIcons name={icon} size={32} color={palette.text} /><Text numberOfLines={actionExpanded ? undefined : 2} style={[styles.smallCopy, styles.flex]}>{data.lastAction}</Text></View>
                        {actionExpanded ? <Text style={styles.smallCopy}>Saved for today. Continue with your reflection below.</Text> : null}
                      </View>
                      <MaterialCommunityIcons name={actionExpanded ? "chevron-up" : "chevron-right"} size={22} color={palette.muted} />
                    </Pressable>
                  </View>
                  <AllocationCard reward amount={presentation.rewardAmount} title={pledge ? "Today's pledged RDM → Reward Purse" : "Today's reflection → Reward Purse"} description={pledge ? "From your existing habit pledge." : "Your existing habit reward."} />
                  {wisdom ? <Text style={styles.smallCopy}>Reflection counts regardless of food quantity or weight. Bonus payouts remain disabled.</Text> : null}
                </>
              )}
            </>
          ) : resultScreen ? (
            <>
              <View style={styles.resultHero}>
                <MaterialCommunityIcons name={completed ? "check-circle-outline" : "close-circle-outline"} size={88} color={completed ? palette.green : palette.coral} />
                <Text accessibilityRole="header" style={styles.resultTitle}>{completed ? "You showed up today." : "Today is recorded."}</Text>
                <Text style={styles.subtitle}>{completed ? data.title : "A missed day is part of the journey."}</Text>
              </View>
              <AllocationCard reward={completed} title={completed
                ? formatRdm(presentation.rewardAmount) + " RDM moved to Reward Purse"
                : pledge ? formatRdm(presentation.missedAmount) + " RDM moved to Remorse Purse" : "Today's missed pledge was recorded"}
                description={pledge ? "From your existing habit pledge." : completed ? "Your habit reflection reward." : "Available Base RDM moved to Remorse, up to 10 RDM."} />
              <View style={styles.metrics}>
                <Metric icon="fire" label="Current streak" value={data.streak + (data.streak === 1 ? " day" : " days")} hint={completed ? "Consistency builds change." : "A fresh start on your next scheduled day."} />
                <Metric icon="chart-bar" label="Reflections" value={String(presentation.completedCount) + (presentation.totalDays !== null ? " of " + presentation.totalDays : "")} hint="Keep reflecting daily." color={palette.link} />
                {pledge ? <Metric icon="chart-pie" label="Remaining pledge" value={formatRdm(pledge.remaining) + " RDM"} hint={presentation.remainingDays ? "For the next " + presentation.remainingDays + " scheduled days." : "Every daily allocation is settled."} color={palette.link} /> : null}
              </View>
              <WeekProgress habit={data} todayDayKey={presentation.todayDayKey} />
              {pledge ? <View style={styles.nextCard}><MaterialCommunityIcons name="calendar-month-outline" size={27} color={palette.text} /><View style={styles.flex}><Text style={styles.label}>{nextDayCopy(presentation.todayDayKey, presentation.nextDayKey)}</Text><Text style={styles.smallCopy}>{presentation.nextDayKey ? "Small steps, steady progress." : "Your history stays available below."}</Text></View></View> : <Text style={styles.smallCopy}>Come back on the next day to continue your routine.</Text>}
              {wisdom ? <Text style={styles.smallCopy}>Your practice progress is in History → Insights. Consistency is assessed across the full schedule; bonus payouts remain disabled.</Text> : null}
            </>
          ) : (
            <View style={styles.neutral}>
              <MaterialCommunityIcons name={state === "finished" ? "check-all" : "calendar-blank-outline"} size={65} color={palette.green} />
              <Text accessibilityRole="header" style={styles.resultTitle}>{state === "upcoming" ? "Your habit starts soon." : state === "rest" ? "A rest day for your habit." : state === "finished" ? "Commitment complete." : legacyNext ? "Ready for your next cycle?" : "Your progress is saved."}</Text>
              <Text style={styles.neutralCopy}>{state === "upcoming" ? "Your first scheduled day is " + formatDay(presentation.nextDayKey ?? pledge?.startDayKey ?? presentation.todayDayKey) + ". No daily RDM moves before then." : state === "rest" ? "No reflection or RDM settlement is due today. Rest days preserve your streak." : state === "finished" ? "Every scheduled day is settled. View your completed and missed reflections in History." : legacyNext ? "Start the next cycle when you are ready to log today's action." : "View your records and commitment details in History."}</Text>
              {state === "rest" && presentation.nextDayKey ? <Text style={styles.subtitle}>{nextDayCopy(presentation.todayDayKey, presentation.nextDayKey)}</Text> : null}
              {pledge ? <AllocationCard title={formatRdm(pledge.remaining) + " RDM still locked"} description="Only scheduled days move to Reward or Remorse." /> : null}
              <WeekProgress habit={data} todayDayKey={presentation.todayDayKey} />
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {habit.error ? <Pressable accessibilityRole="button" onPress={() => void habit.refetch()} style={styles.retry}><Text style={styles.error}>Couldn't refresh your habit. Your draft is kept here. Tap to retry.</Text></Pressable> : null}
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          {historyOpen ? <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(false)} disabled={busy} style={styles.outlineButton}><Text style={styles.outlineLabel}>Back to today's habit</Text></Pressable>
            : isAction ? <><FocusedButton label={wisdom ? "Save check-in & reflect" : "Save action & reflect"} onPress={saveAction} loading={busy} /><Pressable accessibilityRole="button" disabled={busy} onPress={() => { setError(null); setMissDayKey(presentation.todayDayKey); }} style={styles.missLink}><Text style={styles.link}>I missed today</Text></Pressable></>
              : isReflection ? <FocusedButton label="Complete reflection" onPress={saveReflection} loading={busy} />
                : <>{legacyNext ? <FocusedButton label="Start the next cycle" loading={busy} onPress={() => { if (!busy && !inFlight.current) { inFlight.current = true; startNext.mutate({ id, timeZone: "Asia/Kolkata" }); } }} /> : <FocusedButton label={wisdom ? "Back to Japanese Wisdom" : "Back to habits"} onPress={backToHabits} disabled={busy} />}<Pressable accessibilityRole="button" disabled={busy} onPress={openHistory} style={styles.outlineButton}><Text style={styles.outlineLabel}>View history</Text></Pressable></>}
        </View>
      </KeyboardAvoidingView>

      <Modal animationType="slide" transparent visible={missDayKey !== null} onRequestClose={() => { if (!busy) setMissDayKey(null); }}>
        <View style={styles.modalBackdrop}>
          <Pressable accessibilityLabel="Keep reflecting" accessibilityRole="button" disabled={busy} onPress={() => setMissDayKey(null)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal role="dialog" aria-modal style={styles.missSheet}>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHandle} />
            <MaterialCommunityIcons name="close-circle" size={40} color={palette.coral} />
            <Text accessibilityRole="header" style={styles.sheetTitle}>{wisdom ? "Record a missed check-in?" : "Mark today as missed?"}</Text>
            <Text style={styles.sheetCopy}>{pledge
              ? "Today's " + formatRdm(pledge.perDay) + " RDM will move from your habit pledge to your Remorse Purse.\nThis cannot be undone."
              : "Up to 10 available Base RDM will move to your Remorse Purse.\nThis cannot be undone."}</Text>
            {wisdom ? <Text style={styles.smallCopy}>This is not a judgement about what you ate. Honest reflections count even when the practice was difficult.</Text> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <FocusedButton label="Confirm missed day" loading={busy} onPress={confirmMiss} style={styles.confirmMiss} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setMissDayKey(null)} style={styles.outlineButton}><Text style={styles.outlineLabel}>Keep reflecting</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0 },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 3 },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconButton: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: palette.text, fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 26 },
  headerMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 2, paddingRight: 2 },
  subtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  content: { paddingHorizontal: 18, paddingBottom: 16, gap: 18 },
  resultContent: { gap: 10, paddingBottom: 8 },
  steps: { flexDirection: "row", paddingTop: 10, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: palette.line },
  step: { flex: 1, alignItems: "center" },
  stepCircle: { height: 30, width: 30, borderRadius: 15, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.background, alignItems: "center", justifyContent: "center", zIndex: 1 },
  stepDone: { backgroundColor: palette.green, borderColor: palette.green },
  stepCurrent: { borderColor: palette.green, borderWidth: 1.5 },
  stepNumber: { color: palette.muted, fontFamily: fonts.body, fontSize: 13 },
  stepCurrentNumber: { color: palette.green, fontFamily: fonts.bodyBold },
  stepLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 6 },
  stepLabelCurrent: { color: palette.text, fontFamily: fonts.bodyMedium },
  stepLine: { position: "absolute", top: 14, left: "50%", width: "100%", height: 1, backgroundColor: palette.line },
  stepLineDone: { backgroundColor: "#29684F" },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: palette.line },
  todayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  label: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  dateLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, flexShrink: 1, textAlign: "right" },
  field: { gap: 9 },
  prompt: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 27 },
  textArea: { minHeight: 174, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel, padding: 12, gap: 8 },
  reflectionArea: { minHeight: 160 },
  focusedTextArea: { borderColor: palette.link },
  webInput: { outlineStyle: "solid", outlineWidth: 0, outlineColor: "transparent" },
  input: { flex: 1, minHeight: 110, padding: 0, color: palette.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  counter: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, textAlign: "right" },
  smallCopy: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  linkColor: { color: palette.link },
  allocation: { minHeight: 72, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel, flexDirection: "row", alignItems: "center", padding: 14, gap: 18 },
  rewardAllocation: { borderColor: "#8F7631", backgroundColor: "#22251F" },
  allocationTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, marginBottom: 3 },
  allocationAmount: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 28, marginBottom: 3 },
  actionReviewSection: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12 },
  actionReview: { minHeight: 80, padding: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel, flexDirection: "row", alignItems: "center", gap: 8 },
  actionPreview: { flexDirection: "row", alignItems: "center", gap: 18, paddingTop: 8, paddingBottom: 3 },
  footer: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16, gap: 8 },
  missLink: { minHeight: 44, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" },
  link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  outlineButton: { width: "100%", minHeight: 44, borderWidth: 1, borderColor: "#46515F", borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  outlineLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, textAlign: "center" },
  resultHero: { alignItems: "center", paddingTop: 0, paddingBottom: 5, gap: 2 },
  resultTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 28, textAlign: "center", marginTop: 4 },
  metrics: { borderBottomWidth: 1, borderBottomColor: palette.line },
  metric: { minHeight: 60, paddingVertical: 11, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: "row", alignItems: "center", gap: 18 },
  metricHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  metricLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 19 },
  metricValue: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  weekSection: { gap: 10 },
  week: { flexDirection: "row" },
  weekDay: { flex: 1, alignItems: "center", gap: 4 },
  weekLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 9, lineHeight: 14 },
  weekDate: { height: 20, width: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  weekNumber: { color: palette.text, fontFamily: fonts.body, fontSize: 11 },
  weekToday: { backgroundColor: palette.green },
  weekTodayText: { color: palette.onGreen, fontFamily: fonts.bodyBold },
  weekDot: { height: 11, width: 11, borderRadius: 6, backgroundColor: "#4B5664" },
  weekHit: { backgroundColor: palette.green },
  weekMiss: { backgroundColor: palette.coral },
  nextCard: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, borderRadius: 8, padding: 12 },
  neutral: { gap: 18, paddingTop: 30 },
  neutralCopy: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 22, textAlign: "center" },
  error: { color: palette.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  retry: { minHeight: 44, justifyContent: "center" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.48)" },
  missSheet: { width: "100%", maxWidth: 480, maxHeight: "90%", backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.line, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: "hidden" },
  sheetScroll: { width: "100%", flexShrink: 1 },
  sheetContent: { paddingHorizontal: 18, paddingTop: 12, alignItems: "center", gap: 10 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#40505E", marginBottom: 4 },
  sheetTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 28, textAlign: "center" },
  sheetCopy: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, textAlign: "center" },
  confirmMiss: { width: "100%", minHeight: 44, backgroundColor: palette.coral },
});
