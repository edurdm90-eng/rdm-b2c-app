import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { MEDAA_JOURNEY_GENERATION_LIMIT, medaaJourneyStages, type MedaaAiAction, type MedaaAiRequest, type MedaaConversation, type MedaaDraftContent, type MedaaJourneyStage } from "@rdm-b2c/api/domain/medaa";
import type { GoalCategory } from "@rdm-b2c/api/domain/rdm";
import { replaceEqualDeep, useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MedaaDraftCard } from "@/components/medaa-draft-card";
import { MedaaJourneyStep, MedaaLongTermBadge, MedaaManualForm, medaaStageTitles } from "@/components/medaa-journey";
import { PageHeader, PrimaryButton, SurfaceCard } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { queryClient, trpc } from "@/utils/trpc";

function keepNewestConversation(previous: MedaaConversation | undefined, incoming: MedaaConversation): MedaaConversation {
  // A read started before a save may arrive after it. Never roll that journey back.
  // Equal revisions still accept updates such as a serialized generation timeout.
  if (previous?.id === incoming.id && previous.revision > incoming.revision) return previous;
  return replaceEqualDeep(previous, incoming);
}

export default function AiCoachScreen() {
  const params = useLocalSearchParams<{ conversationId?: string; draftId?: string }>();
  const conversationId = typeof params.conversationId === "string" ? params.conversationId : "";
  const draftId = typeof params.draftId === "string" ? params.draftId : "";
  const focused = useIsFocused();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [manualType, setManualType] = useState<"habit" | "goal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localAttempt, setLocalAttempt] = useState<MedaaAiRequest | null>(null);
  const operationLock = useRef(false);
  const startId = useRef(Crypto.randomUUID());
  const scroll = useRef<ScrollView>(null);

  const status = useQuery(trpc.medaa.status.queryOptions(undefined, { enabled: focused }));
  const history = useQuery(trpc.medaa.conversations.queryOptions(undefined, { enabled: focused }));
  const conversation = useQuery(trpc.medaa.conversation.queryOptions({ id: conversationId }, {
    enabled: Boolean(conversationId) && focused,
    structuralSharing: (previous, incoming) => keepNewestConversation(
      previous as MedaaConversation | undefined, incoming as MedaaConversation,
    ),
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
  const locked = busy || pending;
  const aiDisabled = locked || !configured || attemptsRemaining === 0 || Boolean(failedRequest);

  const start = useMutation(trpc.medaa.start.mutationOptions());
  const setHorizon = useMutation(trpc.medaa.setHorizon.mutationOptions());
  const defineLongTerm = useMutation(trpc.medaa.defineLongTerm.mutationOptions());
  const navigate = useMutation(trpc.medaa.navigate.mutationOptions());
  const chooseGoals = useMutation(trpc.medaa.chooseGoals.mutationOptions());
  const generate = useMutation(trpc.medaa.generate.mutationOptions());
  const dismiss = useMutation(trpc.medaa.dismissGeneration.mutationOptions());
  const addManual = useMutation(trpc.medaa.addManual.mutationOptions());

  function receive(next: MedaaConversation) {
    queryClient.setQueryData<MedaaConversation>(trpc.medaa.conversation.queryKey({ id: next.id }),
      (previous) => keepNewestConversation(previous, next));
    void queryClient.invalidateQueries({ queryKey: trpc.medaa.conversations.queryKey() });
  }

  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [stage, draftId, manualType, conversationId]);
  const resolvedAttempt = Boolean(localAttempt && data?.messages.some((item) => item.id === `assistant:${localAttempt.requestId}`));
  useEffect(() => {
    if (resolvedAttempt) { setLocalAttempt(null); setError(null); }
  }, [resolvedAttempt]);

  async function run(operation: () => Promise<MedaaConversation>) {
    if (operationLock.current) return null;
    operationLock.current = true;
    setBusy(true);
    setError(null);
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
    if (!data || locked) return;
    void run(() => navigate.mutateAsync({ conversationId: data.id, stage: nextStage, expectedRevision: data.revision }));
  }

  async function requestAi(action: MedaaAiAction, regenerate = false, retry?: MedaaAiRequest) {
    if (!data || operationLock.current || !configured) return;
    const attempt = retry ?? { requestId: Crypto.randomUUID(), action, regenerate };
    setLocalAttempt(attempt);
    const result = await run(() => generate.mutateAsync({ conversationId: data.id, ...attempt }));
    if (result) setLocalAttempt(null);
  }

  async function dismissFailed() {
    if (!data) return;
    const result = await run(() => dismiss.mutateAsync({ conversationId: data.id }));
    if (result) setLocalAttempt(null);
  }

  function openDraft(id: string) { setError(null); setManualType(null); router.setParams({ draftId: id }); }
  function closeDraft() { setError(null); router.setParams({ draftId: "" }); }

  function selectJourney(id: string) {
    if (locked) return;
    setManualType(null); setLocalAttempt(null); setError(null); setHistoryOpen(false);
    startId.current = Crypto.randomUUID();
    router.setParams({ conversationId: id, draftId: "" });
  }

  function back() {
    if (busy) return;
    if (historyOpen) { setHistoryOpen(false); return; }
    if (manualType) { setManualType(null); return; }
    if (draftId) { closeDraft(); return; }
    if (!journey || stage === "horizon" || pending) { router.replace("/(app)/(tabs)"); return; }
    const previous: Record<MedaaJourneyStage, MedaaJourneyStage> = {
      horizon: "horizon", "long-term": "horizon", "short-term": "long-term", goals: "short-term",
      habits: "goals", plan: "goals", next: "plan",
    };
    if (stage === "goals" && journey.selectedGoalIds.length > 2) { goTo("plan"); return; }
    if (stage === "plan" && journey.selectedGoalIds.length === 0) { goTo("short-term"); return; }
    goTo(previous[stage]);
  }

  const title = manualType ? `Add a ${manualType === "habit" ? "Habit" : "Goal"}` : selectedDraft
    ? `${selectedDraft.status === "created" ? "Your" : "Add a"} ${selectedDraft.content.type === "habit" ? "Habit" : "Goal"}`
    : "Medaa Ai";
  const subtitle = selectedDraft || manualType ? "PART OF YOUR PLAN" : data && !journey ? "SAVED CONVERSATION" : medaaStageTitles[stage].toUpperCase();
  const notice = error ?? data?.failureMessage ?? conversation.error?.message ?? status.error?.message;
  const latestReply = data?.lastRequest ? data.messages.find((item) => item.id === `assistant:${data.lastRequest?.requestId}`) : null;
  const replyMatchesStep = (stage === "short-term" && data?.lastRequest?.action.kind === "suggest-goals" && !draftId)
    || (stage === "habits" && data?.lastRequest?.action.kind === "suggest-habits" && !draftId)
    || (selectedDraft && data?.lastRequest?.action.kind === "refine" && data.lastRequest.action.draftId === selectedDraft.id);

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <PageHeader back title={title} subtitle={subtitle} onBack={back} trailing={
            <Pressable accessibilityRole="button" accessibilityLabel="Saved journeys" accessibilityState={{ expanded: historyOpen }}
              onPress={() => setHistoryOpen(!historyOpen)} style={styles.iconButton}>
              <MaterialCommunityIcons name="history" size={23} color={colors.ai} />
            </Pressable>} />
          {!draftId && !manualType && (!data || journey) ? <View accessibilityLabel={`Step ${medaaJourneyStages.indexOf(stage) + 1} of 7`} style={styles.progress}>
            {medaaJourneyStages.map((item, index) => <View key={item} style={[styles.progressSegment, index <= medaaJourneyStages.indexOf(stage) && styles.progressActive]} />)}
          </View> : null}
        </View>
        {historyOpen ? <View style={styles.history}>
          <PrimaryButton label="Start a new journey" icon="plus" color={colors.ai} variant="outline" disabled={locked} onPress={() => selectJourney("")} />
          <ScrollView style={styles.historyList} keyboardShouldPersistTaps="handled">
            {history.isPending ? <ActivityIndicator color={colors.ai} /> : null}
            {history.error ? <PrimaryButton label="Retry saved journeys" variant="outline" color={colors.ai} onPress={() => void history.refetch()} /> : null}
            {history.data?.length === 0 ? <Text style={styles.helper}>Your saved journeys will appear here.</Text> : null}
            {history.data?.map((item) => <Pressable key={item.id} accessibilityRole="button" disabled={locked}
              onPress={() => selectJourney(item.id)} style={[styles.historyItem, item.id === conversationId && styles.historySelected]}>
              <Text numberOfLines={2} style={styles.historyTitle}>{item.title}</Text>
              <Text style={styles.helper}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
            </Pressable>)}
          </ScrollView>
        </View> : null}
        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          {conversationId && conversation.isPending ? <ActivityIndicator color={colors.ai} /> : null}
          {!configured && status.data ? <View style={styles.connectionNotice}>
            <MaterialCommunityIcons name="information-outline" size={18} color={colors.ai} />
            <Text style={[styles.helper, styles.flex]}>AI suggestions are not connected yet. You can still build and save your plan manually.</Text>
          </View> : null}
          {notice ? <SurfaceCard style={styles.failure}>
            <Text accessibilityLiveRegion="polite" style={styles.error}>{notice}</Text>
            {failedRequest && !pending ? <>
              <PrimaryButton label="Retry this AI request" color={colors.ai} variant="outline" disabled={!configured || busy || attemptsRemaining === 0}
                onPress={() => void requestAi(failedRequest.action, failedRequest.regenerate, failedRequest)} />
              <PrimaryButton label="Continue without this reply" color={colors.ai} variant="outline" disabled={busy}
                onPress={() => void dismissFailed()} />
            </> : null}
            {conversation.error ? <PrimaryButton label="Reload journey" color={colors.ai} variant="outline" onPress={() => void conversation.refetch()} /> : null}
            {status.error ? <PrimaryButton label="Retry connection" color={colors.ai} variant="outline" onPress={() => void status.refetch()} /> : null}
          </SurfaceCard> : null}
          {locked ? <View style={styles.saving}><ActivityIndicator color={colors.ai} size="small" />
            <Text style={styles.helper}>{generate.isPending || pending ? "Preparing suggestions… Your journey is saved." : "Saving your progress…"}</Text>
          </View> : null}
          {journey?.longTermGoal && (draftId || manualType) ? <MedaaLongTermBadge journey={journey} /> : null}
          {latestReply && replyMatchesStep && !manualType ? <SurfaceCard><Text style={styles.messageRole}>MEDAA AI</Text><Text style={styles.message}>{latestReply.text}</Text></SurfaceCard> : null}
          {manualType && data ? <MedaaManualForm key={manualType} type={manualType} initialCategory={journey?.category ?? "Focus"} disabled={locked}
            onCancel={() => setManualType(null)} onSave={async (content: MedaaDraftContent, requestId: string) => {
              const result = await run(() => addManual.mutateAsync({ conversationId: data.id, requestId, content }));
              if (result) openDraft(requestId);
            }} /> : selectedDraft && data ? <>
            <MedaaDraftCard key={`${selectedDraft.id}:${selectedDraft.version}:${selectedDraft.status}`} conversationId={data.id} timeZone={data.timeZone}
              draft={selectedDraft} disabled={locked} initialEditing={!selectedDraft.review && selectedDraft.status === "draft"}
              onConversation={receive} onClose={closeDraft} aiDisabled={aiDisabled}
              onRefine={journey ? (direction) => void requestAi({ kind: "refine", draftId: selectedDraft.id, direction }) : undefined} />
          </> : data && !journey ? <>
            <SurfaceCard><Text style={styles.historyTitle}>Your previous conversation is preserved</Text>
              <Text style={styles.helper}>Chat is now a guided journey. Review your saved drafts below or start a new journey. No new chat messages will be sent.</Text>
            </SurfaceCard>
            <PrimaryButton label="Start a guided journey" color={colors.ai} onPress={() => selectJourney("")} />
            {data.messages.map((item) => <SurfaceCard key={item.id}><Text style={styles.messageRole}>{item.role === "user" ? "YOU" : "MEDAA AI"}</Text><Text style={styles.message}>{item.text}</Text></SurfaceCard>)}
            {data.drafts.map((draft) => <SurfaceCard key={draft.id} onPress={() => openDraft(draft.id)}><Text style={styles.historyTitle}>{draft.content.title}</Text>
              <Text style={styles.helper}>{draft.status === "created" ? "Created · Open" : "Saved draft · Review"}</Text></SurfaceCard>)}
          </> : !conversationId || data ? <MedaaJourneyStep key={`${conversationId}:${stage}`} data={data ?? null} disabled={locked}
            aiDisabled={aiDisabled} attemptsRemaining={attemptsRemaining}
            onHorizon={(years) => void chooseHorizon(years)}
            onLongTerm={(longTermGoal: string, category: GoalCategory) => { if (data) void run(() => defineLongTerm.mutateAsync({ conversationId: data.id, longTermGoal, category, expectedRevision: data.revision })); }}
            onChooseGoals={(draftIds, continueToGoals = true) => { if (data) void run(() => chooseGoals.mutateAsync({ conversationId: data.id, draftIds, continueToGoals, expectedRevision: data.revision })); }}
            onNavigate={goTo} onGenerate={(action, regenerate) => void requestAi(action, regenerate)} onOpenDraft={openDraft}
            onManual={(type) => { setError(null); setManualType(type); }} /> : null}
          {journey?.longTermGoal && !draftId && !manualType && stage !== "plan" && stage !== "next" ? <PrimaryButton label="View saved plan" variant="outline" color={colors.ai}
            disabled={locked} onPress={() => goTo("plan")} /> : null}
          <Text style={styles.disclaimer}>AI suggests. You decide. No RDM is locked until you review and tap Set.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  iconButton: { padding: 10, borderRadius: radii.small, backgroundColor: colors.aiTint },
  progress: { flexDirection: "row", gap: 5 }, progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.line }, progressActive: { backgroundColor: colors.ai },
  content: { padding: 20, gap: 16, paddingBottom: 28, width: "100%", maxWidth: 700, alignSelf: "center", flexGrow: 1 },
  connectionNotice: { padding: 12, gap: 9, flexDirection: "row", alignItems: "center", backgroundColor: colors.aiTint, borderRadius: radii.small },
  helper: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.inkSoft },
  saving: { flexDirection: "row", gap: 10, alignItems: "center" },
  failure: { gap: 10, backgroundColor: colors.coralTint }, error: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.danger },
  history: { padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.panel },
  historyList: { maxHeight: 200 }, historyItem: { padding: 12, gap: 4, borderRadius: radii.small }, historySelected: { backgroundColor: colors.aiTint },
  historyTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21, color: colors.ink },
  messageRole: { fontFamily: fonts.mono, fontSize: 10, color: colors.ai, marginBottom: 8 }, message: { fontFamily: fonts.body, fontSize: 13, lineHeight: 21, color: colors.ink },
  disclaimer: { fontFamily: fonts.body, fontSize: 10, lineHeight: 16, textAlign: "center", color: colors.inkSoft, marginTop: 12 },
});
