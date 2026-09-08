import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  ActionDialog,
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  PrimaryButton,
  ProgressBar,
  SectionLabel,
  SurfaceCard,
  rdmStyles,
} from "@/components/rdm-ui";
import { formatDayKey } from "@/lib/date";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type GoalAction = "progress" | "complete" | "miss";

export default function GoalDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const goal = useQuery(trpc.rdm.goals.byId.queryOptions({ id }));
  const [progress, setProgress] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"complete" | "miss" | null>(null);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(null);

  useEffect(() => {
    if (goal.data) setProgress(String(goal.data.progress));
  }, [goal.data?.id, goal.data?.progressVersion]);

  const updateGoal = useMutation(trpc.rdm.goals.update.mutationOptions({
    onSuccess: async (saved) => {
      setNote("");
      setProgress(String(saved.progress));
      attempt.current = null;
      setNotice(saved.status === "completed"
        ? `${formatRdm(saved.pledgeAmount)} RDM moved to your Reward Purse.`
        : saved.status === "missed"
          ? `${formatRdm(saved.pledgeAmount)} RDM moved to your Remorse Purse.`
          : "Progress saved.");
      await queryClient.invalidateQueries();
    },
    onError: async (mutationError) => {
      setError(mutationError.message);
      await goal.refetch();
    },
  }));

  function submit(action: GoalAction) {
    const data = goal.data;
    if (!data || updateGoal.isPending) return;
    setError(null);
    setNotice(null);
    if (note.trim().length < 2) {
      setError("Add a short note about your progress or outcome.");
      return;
    }
    const numericProgress = Number(progress);
    if (action === "progress" && (!progress.trim() || !Number.isInteger(numericProgress) || numericProgress < 0 || numericProgress > 99)) {
      setError("Enter progress from 0 to 99. Choose Complete goal when you have reached your target.");
      return;
    }
    const values = {
      id,
      action,
      note: note.trim(),
      expectedVersion: data.progressVersion,
      ...(action === "progress" ? { progress: numericProgress } : {}),
    };
    const fingerprint = JSON.stringify(values);
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, requestId: Crypto.randomUUID() };
    }
    updateGoal.mutate({ ...values, requestId: attempt.current.requestId });
  }

  if (goal.isLoading) return <LoadingState label="Opening your goal…" />;
  if (goal.error || !goal.data) {
    return <ErrorState message={goal.error?.message ?? "Goal not found."} onRetry={() => void goal.refetch()} />;
  }

  const data = goal.data;
  const editable = data.status === "active" && !data.upcoming;
  const outcomeColor = data.status === "missed" ? colors.coral : colors.growth;
  const statusLabel = data.upcoming ? "Upcoming" : data.status.charAt(0).toUpperCase() + data.status.slice(1);

  return (
    <AppScreen>
      <PageHeader back title={data.title} subtitle={`${data.category} · ${statusLabel}`}
        onBack={() => router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)/goals")} />

      <SurfaceCard style={styles.card}>
        <SectionLabel>Your target</SectionLabel>
        <Text style={styles.target}>{data.target}</Text>
        <View style={styles.progressRow}>
          <Text style={styles.progress}>{data.progress}%</Text>
          <Text style={rdmStyles.muted}>{statusLabel}</Text>
        </View>
        <ProgressBar color={outcomeColor} progress={data.progress / 100} />
        <Text style={rdmStyles.muted}>{formatDayKey(data.startDayKey)} → {formatDayKey(data.endDayKey)} · {data.durationDays} days</Text>
        <Text style={styles.hint}>Complete before {formatDayKey(data.endDayKey)} ({data.timeZone}). The finish date is not included.</Text>
      </SurfaceCard>

      <SurfaceCard style={styles.card}>
        <Text style={[styles.pledge, { color: outcomeColor }]}>
          {formatRdm(data.pledgeAmount)} RDM {data.status === "active" ? "locked" : data.status === "completed" ? "in Reward" : "in Remorse"}
        </Text>
        <Text style={rdmStyles.muted}>
          {data.status === "active"
            ? "Your Base pledge moves to Reward when you complete the goal, or to Remorse if the deadline is missed."
            : data.status === "completed"
              ? "You reached your target. Your full pledge was returned to Reward, and this completion counts as fertilizer for an active tree."
              : "This goal has ended. Your progress and notes remain here, and the pledged RDM has moved to Remorse."}
        </Text>
      </SurfaceCard>

      {data.upcoming ? <Text style={styles.hint}>You can record progress from {formatDayKey(data.startDayKey)}.</Text> : null}
      {editable ? (
        <>
          <SectionLabel>Progress percentage</SectionLabel>
          <TextInput accessibilityLabel="Goal progress percentage" editable={!updateGoal.isPending}
            keyboardType="number-pad" maxLength={3} onChangeText={setProgress}
            placeholder="0–99" placeholderTextColor={colors.inkSoft} style={styles.input} value={progress} />
          <SectionLabel>Progress or outcome note</SectionLabel>
          <TextInput accessibilityLabel="Goal progress note" editable={!updateGoal.isPending}
            maxLength={500} multiline onChangeText={setNote} placeholder="What have you accomplished?"
            placeholderTextColor={colors.inkSoft} style={[styles.input, styles.multiline]} textAlignVertical="top" value={note} />
          <PrimaryButton label="Save progress" loading={updateGoal.isPending} onPress={() => submit("progress")} />
          <PrimaryButton label="Complete goal" color={colors.gold} disabled={updateGoal.isPending}
            onPress={() => setConfirmAction("complete")} />
          <PrimaryButton label="Mark goal as missed" color={colors.coral} variant="outline" disabled={updateGoal.isPending}
            onPress={() => setConfirmAction("miss")} />
        </>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      <SectionLabel>Progress history</SectionLabel>
      {data.progressUpdates.length === 0 ? (
        <Text style={rdmStyles.muted}>Your progress notes will appear here once you save an update.</Text>
      ) : [...data.progressUpdates].reverse().map((entry) => (
        <SurfaceCard key={entry.requestId} style={styles.card}>
          <View style={styles.progressRow}>
            <Text style={styles.historyStatus}>{entry.progress}% · {entry.status}</Text>
            <Text style={styles.hint}>{new Date(entry.recordedAt).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.historyNote}>{entry.note}</Text>
        </SurfaceCard>
      ))}

      <ActionDialog visible={confirmAction !== null} title={confirmAction === "complete" ? "Complete this goal?" : "Mark this goal as missed?"}
        message={confirmAction === "complete"
          ? `Confirm that you reached your target. Your full ${formatRdm(data.pledgeAmount)} RDM pledge will move to Reward.`
          : `Your ${formatRdm(data.pledgeAmount)} RDM pledge will move to Remorse and this goal will be closed.`}
        confirmLabel={confirmAction === "complete" ? "Complete goal" : "Record missed goal"}
        confirmColor={confirmAction === "complete" ? colors.gold : colors.coral}
        cancelLabel="Keep working" loading={updateGoal.isPending}
        onCancel={() => setConfirmAction(null)} onConfirm={() => {
          const action = confirmAction;
          setConfirmAction(null);
          if (action) submit(action);
        }} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  target: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 23 },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  progress: { color: colors.growth, fontFamily: fonts.monoBold, fontSize: 28 },
  pledge: { fontFamily: fonts.bodyBold, fontSize: 16 },
  hint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, lineHeight: 16 },
  input: { minHeight: 52, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 14 },
  multiline: { minHeight: 105, paddingVertical: 12 },
  historyStatus: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 11, textTransform: "capitalize" },
  historyNote: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12 },
  notice: { color: colors.growth, fontFamily: fonts.bodyMedium, fontSize: 12 },
});
