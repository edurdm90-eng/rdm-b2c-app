import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { MedaaConversation } from "@rdm-b2c/api/domain/medaa";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MedaaDraftCard } from "@/components/medaa-draft-card";
import { PageHeader, PrimaryButton, SurfaceCard } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { queryClient, trpc } from "@/utils/trpc";

type SendAttempt = { conversationId: string; requestId: string; message: string };

export default function AiCoachScreen() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const conversationId = typeof params.conversationId === "string" ? params.conversationId : "";
  const isFocused = useIsFocused();
  const [message, setMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState<SendAttempt | null>(null);
  const startId = useRef(Crypto.randomUUID());
  const scroll = useRef<ScrollView>(null);
  const sending = useRef(false);

  const status = useQuery(trpc.medaa.status.queryOptions(undefined, { enabled: isFocused }));
  const history = useQuery(trpc.medaa.conversations.queryOptions(undefined, { enabled: isFocused }));
  const conversation = useQuery(trpc.medaa.conversation.queryOptions({ id: conversationId }, {
    enabled: Boolean(conversationId) && isFocused,
    refetchInterval: (query) => query.state.data?.pendingRequestId ? 2_000 : false,
    refetchIntervalInBackground: false,
  }));
  const data = conversation.data;
  const pending = Boolean(data?.pendingRequestId);
  const configured = status.data?.configured === true;
  const lastMessageId = data?.messages[data.messages.length - 1]?.id;

  function receiveConversation(next: MedaaConversation) {
    queryClient.setQueryData(trpc.medaa.conversation.queryKey({ id: next.id }), next);
    void queryClient.invalidateQueries({ queryKey: trpc.medaa.conversations.queryKey() });
  }

  const start = useMutation(trpc.medaa.start.mutationOptions());
  const send = useMutation(trpc.medaa.send.mutationOptions());
  const busy = start.isPending || send.isPending;

  const retryResolved = Boolean(retryAttempt && data?.messages.some((item) => item.id === `assistant:${retryAttempt.requestId}`));
  useEffect(() => {
    if (retryResolved) {
      setRetryAttempt(null);
      setMessage("");
      setError(null);
    }
  }, [retryResolved]);

  function selectConversation(id: string) {
    if (busy) return;
    setMessage("");
    setRetryAttempt(null);
    setError(null);
    setHistoryOpen(false);
    startId.current = Crypto.randomUUID();
    router.setParams({ conversationId: id });
  }

  async function submit(attempt?: SendAttempt) {
    if (sending.current || !configured) return;
    const text = (attempt?.message ?? message).trim();
    if (!text) return;
    sending.current = true;
    setError(null);
    let nextAttempt = attempt;
    try {
      let id = attempt?.conversationId ?? conversationId;
      if (!id) {
        const created = await start.mutateAsync({ creationId: startId.current, timeZone: getDeviceTimeZone() });
        receiveConversation(created);
        id = created.id;
        router.setParams({ conversationId: id });
      }
      nextAttempt = attempt ?? { conversationId: id, requestId: Crypto.randomUUID(), message: text };
      setRetryAttempt(nextAttempt);
      const result = await send.mutateAsync(nextAttempt);
      receiveConversation(result);
      setMessage("");
      setRetryAttempt(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The message could not be sent. Your text is still here.");
      if (nextAttempt) {
        // A lost response is not permission to generate again under a new request ID.
        const latest = await queryClient.fetchQuery(trpc.medaa.conversation.queryOptions({ id: nextAttempt.conversationId })).catch(() => null);
        if (latest && !latest.pendingRequestId && !latest.failedRequestId) {
          const requestId = nextAttempt.requestId;
          if (latest.messages.some((item) => item.id === `assistant:${requestId}`)) {
            setMessage("");
            setRetryAttempt(null);
            setError(null);
          }
        }
      }
    } finally {
      sending.current = false;
    }
  }

  const lastUserMessage = data?.messages.slice().reverse().find((item) => item.role === "user");
  const failedAttempt = retryAttempt ?? (data?.failedRequestId && lastUserMessage ? {
    conversationId: data.id,
    requestId: data.failedRequestId,
    message: lastUserMessage.text,
  } : null);
  const composerDisabled = busy || pending || Boolean(failedAttempt)
    || !configured || Boolean(conversationId && !data);
  const notice = error ?? data?.failureMessage ?? conversation.error?.message ?? status.error?.message;

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <PageHeader back title="Medaa Ai" subtitle="YOUR HABIT & GOAL COACH"
            onBack={() => router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)")}
            trailing={<Pressable accessibilityRole="button" accessibilityLabel="Conversation history"
              accessibilityState={{ expanded: historyOpen }} onPress={() => setHistoryOpen(!historyOpen)} style={styles.iconButton}>
              <MaterialCommunityIcons name="history" size={23} color={colors.ai} />
            </Pressable>} />
        </View>

        {historyOpen ? (
          <View style={styles.history}>
            <PrimaryButton label="New conversation" variant="outline" color={colors.ai} icon="plus"
              disabled={busy} onPress={() => selectConversation("")} />
            <ScrollView style={styles.historyList} keyboardShouldPersistTaps="handled">
              {history.isPending ? <ActivityIndicator color={colors.ai} /> : null}
              {history.error ? <Text style={styles.error}>{history.error.message}</Text> : null}
              {history.data?.length === 0 ? <Text style={styles.helper}>Your conversations will appear here.</Text> : null}
              {history.data?.map((item) => (
                <Pressable key={item.id} accessibilityRole="button" disabled={busy}
                  accessibilityState={{ selected: item.id === conversationId }}
                  onPress={() => selectConversation(item.id)} style={[styles.historyItem, item.id === conversationId && styles.selectedHistory]}>
                  <Text numberOfLines={2} style={styles.historyTitle}>{item.title}</Text>
                  <Text style={styles.helper}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          {!configured && status.data ? (
            <SurfaceCard style={styles.notice}>
              <Text style={styles.noticeTitle}>Medaa Ai is waiting to connect</Text>
              <Text style={styles.helper}>AI chat is not configured yet. Your saved conversations and drafts remain available. No simulated replies are used.</Text>
            </SurfaceCard>
          ) : null}
          {!conversationId || data?.messages.length === 0 ? (
            <View style={styles.welcome}>
              <View style={styles.spark}><MaterialCommunityIcons name="creation-outline" color={colors.ai} size={34} /></View>
              <Text style={styles.welcomeTitle}>A little clarity.{"\n"}A meaningful next step.</Text>
              <Text style={styles.welcomeCopy}>What would you like to achieve or improve? We’ll shape it into a realistic habit or goal, together.</Text>
              <View style={styles.starters}>
                {["Help me build a habit", "Help me define a goal"].map((text) => (
                  <Pressable key={text} accessibilityRole="button" disabled={composerDisabled}
                    onPress={() => setMessage(text)} style={styles.starter}>
                    <Text style={styles.starterText}>{text}</Text>
                    <MaterialCommunityIcons name="arrow-top-right" color={colors.ai} size={17} />
                  </Pressable>
                ))}
              </View>
              <Text style={styles.helper}>Chat → Review → Set. You choose the pledge. Nothing is created until you tap Set.</Text>
            </View>
          ) : null}
          {conversationId && conversation.isPending ? <ActivityIndicator color={colors.ai} style={styles.loader} /> : null}
          {data?.messages.map((item) => (
            <View key={item.id} style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}
              onLayout={item.id === lastMessageId ? (event) => {
                scroll.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true });
              } : undefined}>
              <Text style={[styles.speaker, item.role === "user" && styles.userSpeaker]}>{item.role === "user" ? "YOU" : "MEDAA AI"}</Text>
              <Text selectable style={styles.messageText}>{item.text}</Text>
            </View>
          ))}
          {busy || pending ? (
            <View accessibilityLiveRegion="polite" style={styles.thinking}>
              <ActivityIndicator color={colors.ai} size="small" />
              <Text style={styles.helper}>{start.isPending ? "Saving your conversation…" : "Medaa Ai is thinking…"}</Text>
            </View>
          ) : null}
          {notice ? (
            <View accessibilityLiveRegion="polite" style={styles.failure}>
              <Text style={styles.error}>{notice}</Text>
              {failedAttempt && !pending ? <PrimaryButton label="Retry this message" icon="refresh" variant="outline"
                color={colors.ai} disabled={!configured || busy} onPress={() => void submit(failedAttempt)} /> : null}
              {conversation.error ? <PrimaryButton label="Reload conversation" variant="outline" color={colors.ai}
                onPress={() => void conversation.refetch()} /> : null}
              {status.error ? <PrimaryButton label="Retry connection" variant="outline" color={colors.ai}
                onPress={() => void status.refetch()} /> : null}
            </View>
          ) : null}
          {data?.drafts.length ? <Text style={styles.draftHeading}>YOUR HABITS & GOALS</Text> : null}
          {data?.drafts.map((draft) => (
            <MedaaDraftCard key={`${draft.id}:${draft.version}:${draft.status}`} conversationId={data.id}
              timeZone={data.timeZone} draft={draft} disabled={busy || pending}
              onConversation={receiveConversation} onRefine={() => {
                setMessage(`Let’s refine the ${draft.content.type} “${draft.content.title}”: `);
                scroll.current?.scrollToEnd({ animated: true });
              }} />
          ))}
        </ScrollView>

        <View style={styles.composerArea}>
          {failedAttempt || pending ? <Text style={styles.helper}>{pending || busy
            ? "Your message is saved. You can return while the response finishes."
            : "Retry the saved message, or start a new conversation from History."}</Text> : null}
          <View style={styles.composer}>
            <TextInput accessibilityLabel="Message Medaa Ai" value={message} onChangeText={setMessage}
              placeholder="Tell Medaa what’s on your mind…" placeholderTextColor={colors.inkSoft}
              multiline maxLength={2_000} editable={!composerDisabled} style={styles.composerInput} />
            <Pressable accessibilityRole="button" accessibilityLabel="Send message"
              accessibilityState={{ disabled: composerDisabled || !message.trim() }}
              disabled={composerDisabled || !message.trim()} onPress={() => void submit()}
              style={[styles.send, (composerDisabled || !message.trim()) && styles.disabled]}>
              <MaterialCommunityIcons name="arrow-up" size={23} color={colors.backgroundDeep} />
            </Pressable>
          </View>
          <Text style={styles.disclaimer}>AI can make mistakes. Review every commitment before setting it.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  iconButton: { padding: 10, borderRadius: radii.small, backgroundColor: colors.aiTint },
  messages: { padding: 20, gap: 16, flexGrow: 1 },
  notice: { backgroundColor: colors.aiTint, gap: 6 },
  noticeTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ai },
  welcome: { paddingVertical: 22, gap: 18 },
  spark: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.aiTint, alignItems: "center", justifyContent: "center" },
  welcomeTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38, color: colors.ink },
  welcomeCopy: { fontFamily: fonts.body, fontSize: 15, lineHeight: 24, color: colors.inkSoft },
  starters: { gap: 10 },
  starter: { padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: radii.medium, flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.panel },
  starterText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
  bubble: { gap: 8, borderRadius: radii.medium, padding: 16, maxWidth: "94%" },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.aiTint, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.panel, borderBottomLeftRadius: 4 },
  speaker: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.ai },
  userSpeaker: { color: colors.inkSoft },
  messageText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.ink },
  thinking: { flexDirection: "row", gap: 10, alignItems: "center" },
  helper: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.inkSoft },
  failure: { gap: 10, padding: 14, borderRadius: radii.medium, backgroundColor: colors.coralTint },
  error: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.danger },
  draftHeading: { fontFamily: fonts.mono, fontSize: 11, color: colors.ai, letterSpacing: 1 },
  loader: { padding: 24 },
  composerArea: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8, borderTopWidth: 1, borderTopColor: colors.line },
  composer: { flexDirection: "row", alignItems: "flex-end", backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radii.large, padding: 8, gap: 8 },
  composerInput: { flex: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, paddingHorizontal: 6, paddingVertical: 10, minHeight: 42, maxHeight: 120 },
  send: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.ai, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.35 },
  disclaimer: { fontFamily: fonts.body, fontSize: 10, lineHeight: 15, color: colors.inkSoft, textAlign: "center" },
  history: { padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.panel },
  historyList: { maxHeight: 200 },
  historyItem: { padding: 12, gap: 4, borderRadius: radii.small },
  selectedHistory: { backgroundColor: colors.aiTint },
  historyTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
});
