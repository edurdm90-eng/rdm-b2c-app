import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { MEDAA_JOURNEY_GENERATION_LIMIT, type MedaaAiAction, type MedaaAiRequest, type MedaaConversation, type MedaaJourneyStage } from "@rdm-b2c/api/domain/medaa";
import type { GoalCategory } from "@rdm-b2c/api/domain/rdm";
import { replaceEqualDeep, useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusedButton, FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { MedaaDraftCard } from "@/components/medaa-draft-card";
import { MedaaJourneyStep } from "@/components/medaa-journey";
import { fonts, formatRdm } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { queryClient, trpc } from "@/utils/trpc";

function keepNewestConversation(previous: MedaaConversation | undefined, incoming: MedaaConversation): MedaaConversation {
  // Reads that began before a mutation must never roll its saved revision back.
  if (previous?.id === incoming.id && previous.revision > incoming.revision) return previous;
  return replaceEqualDeep(previous, incoming);
}

export default function AiCoachScreen() {
  const params = useLocalSearchParams<{ conversationId?: string; draftId?: string }>();
  const conversationId = typeof params.conversationId === "string" ? params.conversationId : "";
  const draftId = typeof params.draftId === "string" ? params.draftId : "";
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [childBusy, setChildBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [localAttempt, setLocalAttempt] = useState<MedaaAiRequest | null>(null);
  const operationLock = useRef(false);
  const childOperationLock = useRef(false);
  const startId = useRef(Crypto.randomUUID());

  const status = useQuery(trpc.medaa.status.queryOptions(undefined, { enabled: focused }));
  const history = useQuery(trpc.medaa.conversations.queryOptions(undefined, { enabled: focused && historyOpen }));
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions(undefined, { enabled: focused && !conversationId }));
  const budget = useQuery(trpc.medaa.budget.queryOptions({ conversationId }, {
    enabled: focused && Boolean(conversationId), refetchInterval: focused ? 30_000 : false,
  }));
  const conversation = useQuery(trpc.medaa.conversation.queryOptions({ id: conversationId }, {
    enabled: Boolean(conversationId) && focused,
    structuralSharing: (previous, incoming) => keepNewestConversation(previous as MedaaConversation | undefined, incoming as MedaaConversation),
    refetchInterval: (query) => query.state.data?.pendingRequestId ? 2_000 : false,
    refetchIntervalInBackground: false,
  }));
  const data = conversation.data;
  const journey = data?.journey;
  const stage = journey?.stage ?? "horizon";
  const selectedDraft = data?.drafts.find((draft) => draft.id === draftId);
  const pending = Boolean(data?.pendingRequestId);
  const configured = status.data?.configured === true;
  const attemptsRemaining = Math.max(0, MEDAA_JOURNEY_GENERATION_LIMIT - (journey?.generations ?? 0));
  const failedRequest = localAttempt ?? (data?.failedRequestId ? data.lastRequest : null);
  const failedAction = failedRequest?.action;
  const retryableGoalRequest = failedAction && (failedAction.kind === "suggest-goals"
    || (failedAction.kind === "refine" && data?.drafts.some((draft) => draft.id === failedAction.draftId && draft.content.type === "goal")));
  const locked = busy || pending;
  const navigationLocked = locked || childBusy;
  const aiDisabled = navigationLocked || !configured || attemptsRemaining === 0 || Boolean(failedRequest);
  const availableBase = conversationId ? budget.data?.baseRdm : wallet.data?.wallet.base;
  const directionStep = stage === "horizon" || stage === "long-term";
  const progressStep = directionStep ? 0 : stage === "short-term" ? 1 : 2;

  const start = useMutation(trpc.medaa.start.mutationOptions());
  const setHorizon = useMutation(trpc.medaa.setHorizon.mutationOptions());
  const defineLongTerm = useMutation(trpc.medaa.defineLongTerm.mutationOptions());
  const navigate = useMutation(trpc.medaa.navigate.mutationOptions());
  const chooseGoals = useMutation(trpc.medaa.chooseGoals.mutationOptions());
  const generate = useMutation(trpc.medaa.generate.mutationOptions());
  const dismiss = useMutation(trpc.medaa.dismissGeneration.mutationOptions());

  function receive(next: MedaaConversation) {
    queryClient.setQueryData<MedaaConversation>(trpc.medaa.conversation.queryKey({ id: next.id }),
      (previous) => keepNewestConversation(previous, next));
    void queryClient.invalidateQueries({ queryKey: trpc.medaa.conversations.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.medaa.budget.queryKey() });
  }

  const receiveChildBusy = useCallback((value: boolean) => {
    childOperationLock.current = value;
    setChildBusy(value);
  }, []);

  const resolvedAttempt = Boolean(localAttempt && data?.messages.some((item) => item.id === "assistant:" + localAttempt.requestId));
  useEffect(() => {
    if (resolvedAttempt) { setLocalAttempt(null); setError(null); }
  }, [resolvedAttempt]);
  useEffect(() => {
    if (leaving) router.dismissTo("/(app)/(tabs)/goals");
  }, [leaving]);

  usePreventRemove(!leaving && (navigationLocked || historyOpen || Boolean(draftId) || Boolean(journey && stage !== "horizon")), () => {
    if (!navigationLocked) back();
  });

  async function run(operation: () => Promise<MedaaConversation>) {
    if (operationLock.current || childOperationLock.current) return null;
    operationLock.current = true;
    setBusy(true); setError(null);
    try {
      const result = await operation();
      receive(result);
      return result;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your progress could not be saved. Please retry.");
      if (conversationId) await conversation.refetch();
      return null;
    } finally { operationLock.current = false; setBusy(false); }
  }

  async function chooseHorizon(horizonYears: 1 | 2 | 3) {
    await run(async () => {
      let current = data;
      if (!current) {
        current = await start.mutateAsync({ creationId: startId.current, timeZone: getDeviceTimeZone() });
        receive(current);
        router.setParams({ conversationId: current.id, draftId: "" });
      }
      return setHorizon.mutateAsync({ conversationId: current.id, horizonYears, expectedRevision: current.revision });
    });
  }

  function goTo(nextStage: MedaaJourneyStage) {
    if (!data || navigationLocked) return;
    setError(null);
    void run(() => navigate.mutateAsync({ conversationId: data.id, stage: nextStage, expectedRevision: data.revision }));
  }

  async function requestAi(action: MedaaAiAction, regenerate = false, retry?: MedaaAiRequest, dailyPledgeRdm = 1, current = data) {
    if (!current || operationLock.current || childOperationLock.current || pending || !configured) return;
    const attempt = retry ?? { requestId: Crypto.randomUUID(), action, regenerate, dailyPledgeRdm };
    setLocalAttempt(attempt);
    const result = await run(() => generate.mutateAsync({ conversationId: current.id, ...attempt }));
    if (result) setLocalAttempt(null);
  }

  async function saveAimAndSuggest(longTermGoal: string, category: GoalCategory) {
    if (!data || navigationLocked) return;
    const saved = await run(() => defineLongTerm.mutateAsync({
      conversationId: data.id, longTermGoal, category, expectedRevision: data.revision,
    }));
    // This explicit Get AI help click uses the just-saved journey, not the prior render's revision.
    if (saved && configured && !saved.journey?.goalSuggestionsReady) await requestAi({ kind: "suggest-goals" }, false, undefined, 1, saved);
  }

  async function dismissFailed() {
    if (!data || navigationLocked || childOperationLock.current) return;
    const result = await run(() => dismiss.mutateAsync({ conversationId: data.id }));
    if (result) setLocalAttempt(null);
  }

  function openDraft(id: string) {
    if (navigationLocked) return;
    setError(null); router.setParams({ draftId: id });
  }
  function closeDraft() { setError(null); router.setParams({ draftId: "" }); }
  function finish() { if (!navigationLocked) setLeaving(true); }

  function selectJourney(id: string) {
    if (navigationLocked) return;
    setLocalAttempt(null); setError(null); setHistoryOpen(false);
    startId.current = Crypto.randomUUID();
    router.setParams({ conversationId: id, draftId: "" });
  }

  function back() {
    if (navigationLocked) return;
    if (historyOpen) { setHistoryOpen(false); return; }
    if (draftId) { closeDraft(); return; }
    if (!journey || stage === "horizon") { finish(); return; }
    const previous: Record<MedaaJourneyStage, MedaaJourneyStage> = {
      horizon: "horizon", "long-term": "horizon", "short-term": "long-term", goals: "short-term",
      habits: "goals", plan: "goals", next: "plan",
    };
    goTo(stage === "plan" && !journey.selectedGoalIds.length ? "short-term" : previous[stage]);
  }

  function moreGoals() {
    if (!data || navigationLocked) return;
    closeDraft();
    goTo("short-term");
  }

  const notice = error ?? data?.failureMessage ?? conversation.error?.message ?? status.error?.message;
  const latestReply = data?.lastRequest ? data.messages.find((item) => item.id === "assistant:" + data.lastRequest?.requestId) : null;
  const emptyAiReply = !draftId && stage === "short-term" && journey?.goalSuggestionsReady && !journey.goalSuggestionIds.length ? latestReply?.text : null;
  const simpleHeader = historyOpen || Boolean(selectedDraft) || Boolean(data && !journey);
  const showHeader = historyOpen || selectedDraft?.status !== "created";
  const loadingJourney = Boolean(conversationId && conversation.isPending);
  const planBudget = budget.data ?? (!conversationId && availableBase !== undefined
    ? { baseRdm: availableBase, selectedPledgeRdm: 0, remainingBaseRdm: availableBase, maxAffordableDays: Math.min(90, availableBase) } : null);

  return (
    <FocusedScreen scroll={false} contentStyle={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {showHeader ? <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={historyOpen ? "Back from saved journeys" : "Go back"} disabled={navigationLocked} onPress={back} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={26} color={palette.text} /></Pressable>
          {!simpleHeader ? <MaterialCommunityIcons name="creation" size={27} color={palette.link} /> : null}
          <Text accessibilityRole="header" style={[styles.brand, simpleHeader && styles.simpleBrand]}>Medaa Ai</Text>
          {!simpleHeader ? <View accessibilityLabel={availableBase === undefined ? "Checking Base RDM" : formatRdm(availableBase) + " Base RDM available"} style={styles.balance}>
            <MaterialCommunityIcons name="wallet-outline" size={21} color={palette.text} /><View><Text style={styles.balanceValue}>{availableBase === undefined ? "…" : formatRdm(availableBase) + " RDM"}</Text><Text style={styles.small}>available</Text></View>
          </View> : null}
        </View> : null}
        {!historyOpen && !selectedDraft && (!data || journey) ? <View accessibilityLabel={["Direction", "Plan", "Review"][progressStep] + ", step " + (progressStep + 1) + " of 3"} style={styles.progress}>
          {["Direction", "Plan", "Review"].map((label, index) => <View key={label} style={styles.step}>
            {index < 2 ? <View style={[styles.connector, index < progressStep && styles.activeConnector]} /> : null}
            <MaterialCommunityIcons name={index < progressStep ? "check-circle" : index === progressStep ? "radiobox-marked" : "checkbox-blank-circle-outline"} size={22} color={index <= progressStep ? palette.link : palette.line} style={styles.stepIcon} />
            <Text style={[styles.stepLabel, index <= progressStep && styles.activeLabel]}>{label}</Text>
          </View>)}
        </View> : null}
        {!historyOpen && ((!configured && status.data) || notice || locked || emptyAiReply) ? <ScrollView style={styles.notices} contentContainerStyle={styles.noticeContent}>
          {!configured && status.data ? <Text style={styles.small}>AI suggestions are not connected yet. Saved plans and drafts remain available.</Text> : null}
          {notice ? <View style={styles.alert}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{notice}</Text>
            {failedRequest && !pending ? <View style={styles.noticeActions}>
              {retryableGoalRequest ? <Pressable accessibilityRole="button" disabled={!configured || navigationLocked || attemptsRemaining === 0} onPress={() => void requestAi(failedRequest.action, failedRequest.regenerate, failedRequest)} style={styles.textButton}><Text style={styles.link}>Retry this AI request</Text></Pressable> : null}
              <Pressable accessibilityRole="button" disabled={navigationLocked} onPress={() => void dismissFailed()} style={styles.textButton}><Text style={styles.link}>Continue without this reply</Text></Pressable>
            </View> : null}
            {conversation.error ? <Pressable accessibilityRole="button" onPress={() => void conversation.refetch()} style={styles.textButton}><Text style={styles.link}>Reload journey</Text></Pressable> : null}
            {status.error ? <Pressable accessibilityRole="button" onPress={() => void status.refetch()} style={styles.textButton}><Text style={styles.link}>Retry connection</Text></Pressable> : null}
          </View> : null}
          {locked ? <View style={styles.saving}><ActivityIndicator color={palette.link} size="small" /><Text style={styles.helper}>{generate.isPending || pending ? "Preparing your plan… Your journey is saved." : "Saving your progress…"}</Text></View> : null}
          {emptyAiReply ? <Text style={styles.helper}>{emptyAiReply}</Text> : null}
        </ScrollView> : null}
        {historyOpen ? <View style={styles.flex}>
          <ScrollView contentContainerStyle={styles.historyContent} showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.hero}>Pick up where you left off</Text><Text style={styles.helper}>Your saved plans stay here when you leave.</Text>
            <Text style={styles.sectionTitle}>Saved journeys</Text>
            {history.isPending ? <ActivityIndicator color={palette.link} /> : null}
            {history.error ? <Pressable accessibilityRole="button" onPress={() => void history.refetch()} style={styles.textButton}><Text style={styles.error}>Couldn't load saved journeys. Tap to retry.</Text></Pressable> : null}
            {history.data?.length === 0 ? <Text style={styles.helper}>No saved journeys yet. Start with a direction that matters to you.</Text> : null}
            {history.data?.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={"Resume journey: " + item.title} disabled={navigationLocked} onPress={() => selectJourney(item.id)} style={styles.historyItem}>
              <MaterialCommunityIcons name="book-open-variant-outline" size={32} color={palette.link} />
              <View style={styles.flex}><Text style={styles.itemTitle}>{item.title}</Text>
                <View style={styles.historyMeta}><Text style={styles.helper}>{item.horizonYears ? item.horizonYears + " year horizon" : "Saved conversation"}</Text>
                  <Text style={[styles.badge, item.createdGoalCount > 0 && styles.createdBadge]}>{item.createdGoalCount > 0 ? "Created" : item.settingGoalCount > 0 ? "Recover" : "Draft"}</Text></View>
                <Text style={styles.small}>Updated {new Date(item.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {item.createdGoalCount > 0 ? item.createdGoalCount + (item.createdGoalCount === 1 ? " goal created" : " goals created") : "Draft saved"}</Text>
              </View><MaterialCommunityIcons name="chevron-right" size={21} color={palette.muted} />
            </Pressable>)}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}><FocusedButton label="New journey" disabled={navigationLocked} onPress={() => selectJourney("")} style={styles.blueButton} /><Text style={styles.footnote}>Existing plans remain accessible here.</Text></View>
        </View> : loadingJourney ? <View style={styles.loading}><ActivityIndicator color={palette.link} /><Text style={styles.helper}>Opening your saved journey…</Text></View>
          : selectedDraft && data ? <MedaaDraftCard key={selectedDraft.id + ":" + selectedDraft.version + ":" + selectedDraft.status} conversationId={data.id} timeZone={data.timeZone} draft={selectedDraft}
            disabled={locked} initialEditing={!selectedDraft.review && selectedDraft.status === "draft"} onConversation={receive} onClose={closeDraft}
            aiDisabled={aiDisabled} onBusyChange={receiveChildBusy} onMore={moreGoals} onFinish={finish}
            onRefine={journey && selectedDraft.content.type === "goal" ? (direction, rate) => { void requestAi({ kind: "refine", draftId: selectedDraft.id, direction }, false, undefined, rate); } : undefined} />
            : data && !journey ? <ScrollView contentContainerStyle={styles.historyContent}>
              <Text accessibilityRole="header" style={styles.hero}>Your previous conversation is preserved</Text><Text style={styles.helper}>Medaa now guides you toward practical goals. You can still open your saved records.</Text>
              <FocusedButton label="Start a guided journey" onPress={() => selectJourney("")} />
              {data.drafts.map((draft) => <Pressable key={draft.id} accessibilityRole="button" onPress={() => openDraft(draft.id)} style={styles.historyItem}><View style={styles.flex}><Text style={styles.itemTitle}>{draft.content.title}</Text><Text style={styles.small}>{draft.status === "created" ? "Created · Open" : "Saved draft · Review"}</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={palette.muted} /></Pressable>)}
              {data.messages.map((item) => <View key={item.id} style={styles.legacyMessage}><Text style={styles.small}>{item.role === "user" ? "YOU" : "MEDAA AI"}</Text><Text style={styles.helper}>{item.text}</Text></View>)}
            </ScrollView> : !conversationId || data ? <MedaaJourneyStep key={conversationId + ":" + stage} data={data ?? null} disabled={locked} aiDisabled={aiDisabled} attemptsRemaining={attemptsRemaining} budget={planBudget}
              onHistory={() => { if (!navigationLocked) setHistoryOpen(true); }} onFinish={finish}
              onHorizon={(years) => void chooseHorizon(years)} onLongTerm={(aim, category) => void saveAimAndSuggest(aim, category)}
              onChooseGoals={(draftIds, continueToGoals = true) => { if (data) void run(() => chooseGoals.mutateAsync({ conversationId: data.id, draftIds, continueToGoals, expectedRevision: data.revision })); }}
              onNavigate={goTo} onGenerate={(action, regenerate) => void requestAi(action, regenerate)} onOpenDraft={openDraft}
              onRefine={(id, direction, rate) => void requestAi({ kind: "refine", draftId: id, direction }, false, undefined, rate)} />
              : <View style={styles.loading}><Text style={styles.helper}>This journey could not be opened.</Text><FocusedButton label="Saved journeys" onPress={() => setHistoryOpen(true)} /></View>}
      </KeyboardAvoidingView>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }, flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, minHeight: 72 },
  back: { minHeight: 44, minWidth: 32, justifyContent: "center" },
  brand: { flex: 1, color: palette.text, fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 25 },
  simpleBrand: { fontFamily: fonts.bodyMedium, fontSize: 16, color: palette.muted },
  balance: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: palette.line, borderRadius: 10, backgroundColor: palette.panel },
  balanceValue: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16, color: palette.text },
  small: { fontFamily: fonts.body, fontSize: 11, lineHeight: 17, color: palette.muted },
  progress: { flexDirection: "row", paddingHorizontal: 18, paddingTop: 3, paddingBottom: 24 },
  step: { flex: 1, alignItems: "center", gap: 5 },
  stepIcon: { backgroundColor: palette.background },
  connector: { position: "absolute", left: "50%", width: "100%", top: 10, height: 1, backgroundColor: palette.line },
  activeConnector: { backgroundColor: palette.link },
  stepLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  activeLabel: { color: palette.link },
  notices: { flexGrow: 0, maxHeight: 160 }, noticeContent: { paddingHorizontal: 18, paddingBottom: 10, gap: 10 },
  alert: { padding: 10, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel },
  noticeActions: { gap: 4 }, saving: { flexDirection: "row", alignItems: "center", gap: 10 },
  helper: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: palette.muted },
  error: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: palette.coral },
  textButton: { minHeight: 38, justifyContent: "center" }, link: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20, color: palette.link },
  historyContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24, gap: 14, flexGrow: 1 },
  hero: { fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 33, color: palette.text },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22, color: palette.text, paddingTop: 20, marginTop: 8, borderTopWidth: 1, borderColor: palette.line },
  historyItem: { flexDirection: "row", gap: 14, alignItems: "center", padding: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 8 },
  itemTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: palette.text },
  historyMeta: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginTop: 5, marginBottom: 8 },
  badge: { borderWidth: 1, borderColor: palette.line, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 2, color: palette.muted, fontFamily: fonts.body, fontSize: 11 },
  createdBadge: { color: palette.green, borderColor: "#2B7A59" },
  footer: { paddingHorizontal: 18, paddingTop: 12, gap: 10 },
  blueButton: { backgroundColor: palette.link },
  footnote: { textAlign: "center", fontFamily: fonts.body, fontSize: 11, lineHeight: 17, color: palette.muted },
  loading: { flex: 1, gap: 14, padding: 18, alignItems: "center", justifyContent: "center" },
  legacyMessage: { gap: 6, padding: 14, borderRadius: 8, backgroundColor: palette.panel },
});
