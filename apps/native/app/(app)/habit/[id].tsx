import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { ActionDialog, AppScreen, ErrorState, LoadingState, PageHeader, PrimaryButton, SectionLabel, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { queryClient, trpc } from "@/utils/trpc";

const steps = ["pledge", "act", "reflect", "reward"] as const;

export default function HabitDetailScreen() {
  const timeZone = getDeviceTimeZone();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const habit = useQuery(trpc.rdm.habits.byId.queryOptions({ id }));
  const [actionNote, setActionNote] = useState("");
  const [reflection, setReflection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [missOpen, setMissOpen] = useState(false);

  useEffect(() => {
    if (habit.data?.lastAction) setActionNote(habit.data.lastAction);
    if (habit.data?.reflection) setReflection(habit.data.reflection);
  }, [habit.data?.lastAction, habit.data?.reflection]);

  async function refresh() {
    await queryClient.invalidateQueries();
    await habit.refetch();
  }

  const logAction = useMutation(trpc.rdm.habits.logAction.mutationOptions({ onSuccess: refresh, onError: (mutationError) => setError(mutationError.message) }));
  const reflect = useMutation(trpc.rdm.habits.reflect.mutationOptions({ onSuccess: refresh, onError: (mutationError) => setError(mutationError.message) }));
  const miss = useMutation(trpc.rdm.habits.miss.mutationOptions({ onSuccess: refresh, onError: (mutationError) => setError(mutationError.message) }));
  const startNext = useMutation(trpc.rdm.habits.startNextCycle.mutationOptions({ onSuccess: refresh, onError: (mutationError) => setError(mutationError.message) }));

  if (habit.isLoading) return <LoadingState label="Opening your habit…" />;
  if (habit.error || !habit.data) return <ErrorState message={habit.error?.message ?? "Habit not found."} onRetry={() => void habit.refetch()} />;

  const data = habit.data;
  const currentIndex = steps.indexOf(data.stage);

  return (
    <AppScreen>
      <PageHeader back title={data.title} subtitle={`Day ${Math.max(1, data.streak)} · ${data.cadence}`} trailing={<View style={styles.streakPill}><MaterialCommunityIcons name="fire" size={17} color={colors.gold} /><Text style={styles.streakText}>{data.streak}</Text></View>} />
      <View style={styles.timeline}>
        {steps.map((step, index) => {
          const complete = index < currentIndex || (data.stage === "reward" && index === currentIndex);
          const current = index === currentIndex && !complete;
          return (
            <View key={step} style={styles.stepWrap}>
              <View style={[styles.stepCircle, complete && styles.stepComplete, current && styles.stepCurrent]}>
                {complete ? <MaterialCommunityIcons name="check" size={16} color={colors.backgroundDeep} /> : <Text style={[styles.stepNumber, current && styles.stepNumberCurrent]}>{index + 1}</Text>}
              </View>
              <Text style={styles.stepLabel}>{step}</Text>
              {index < steps.length - 1 ? <View style={[styles.stepLine, index < currentIndex && styles.stepLineComplete]} /> : null}
            </View>
          );
        })}
      </View>

      <SurfaceCard>
        <SectionLabel>Your pledge</SectionLabel>
        <Text style={styles.pledge}>“{data.pledge}”</Text>
      </SurfaceCard>

      <SurfaceCard>
        <SectionLabel>Today's act</SectionLabel>
        {data.stage === "act" ? (
          <>
            <TextInput accessibilityLabel="Action log" multiline onChangeText={setActionNote} placeholder={`How did ${data.target} go?`} placeholderTextColor={colors.inkSoft} style={styles.input} textAlignVertical="top" value={actionNote} />
            <PrimaryButton label="Log today's act" loading={logAction.isPending} onPress={() => {
              setError(null);
              if (actionNote.trim().length < 2) return setError("Add a short note about what you completed.");
              logAction.mutate({ id, note: actionNote.trim() });
            }} />
            <PrimaryButton color={colors.coral} label="I missed this pledge" loading={miss.isPending} variant="outline" onPress={() => setMissOpen(true)} />
          </>
        ) : <Text style={rdmStyles.muted}>{data.lastAction ?? "Action logged for today."}</Text>}
      </SurfaceCard>

      <SurfaceCard>
        <SectionLabel>Reflect</SectionLabel>
        <TextInput accessibilityLabel="Reflection" editable={data.stage === "reflect"} multiline onChangeText={setReflection} placeholder="What made this easier or harder today?" placeholderTextColor={colors.inkSoft} style={[styles.input, data.stage !== "reflect" && styles.inputDisabled]} textAlignVertical="top" value={reflection} />
      </SurfaceCard>

      <SurfaceCard>
        <SectionLabel>This week</SectionLabel>
        <View style={styles.weekRow}>
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => {
            const hit = data.completedDays.includes(index + 1);
            return <View key={`${day}-${index}`} style={[styles.day, hit && styles.dayHit]}><Text style={[styles.dayText, hit && styles.dayTextHit]}>{day}</Text></View>;
          })}
        </View>
      </SurfaceCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {data.stage === "reflect" ? (
        <PrimaryButton color={colors.gold} label="Complete reflection → claim reward" loading={reflect.isPending} onPress={() => {
          setError(null);
          if (reflection.trim().length < 4) return setError("Write one honest sentence before claiming the reward.");
          reflect.mutate({ id, reflection: reflection.trim(), timeZone });
        }} />
      ) : null}
      {data.stage === "reward" ? (
        <View style={[styles.rewardCard, data.lastOutcome === "missed" && styles.missedCard]}>
          <MaterialCommunityIcons name={data.lastOutcome === "missed" ? "backup-restore" : "trophy-outline"} size={32} color={data.lastOutcome === "missed" ? colors.coral : colors.gold} />
          <View style={styles.rewardCopy}>
            <Text style={[styles.rewardTitle, data.lastOutcome === "missed" && styles.missedTitle]}>{data.lastOutcome === "missed" ? "Honesty recorded" : "Reward claimed"}</Text>
            <Text style={rdmStyles.muted}>{data.lastOutcome === "missed" ? "The streak reset and 10 RDM moved to your Remorse Purse for a conscious decision." : "Your reflection added 25 RDM and moved the streak forward."}</Text>
          </View>
          <PrimaryButton label="Start the next cycle" loading={startNext.isPending} onPress={() => startNext.mutate({ id, timeZone })} />
        </View>
      ) : null}
      <ActionDialog
        cancelLabel="Keep working"
        confirmColor={colors.coral}
        confirmLabel="Record honestly"
        loading={miss.isPending}
        message="Your streak resets and 10 RDM moves into the Remorse Purse for you to decide on later."
        onCancel={() => setMissOpen(false)}
        onConfirm={() => {
          setMissOpen(false);
          miss.mutate({ id });
        }}
        title="Record a missed pledge?"
        visible={missOpen}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  streakPill: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.goldTint, borderRadius: radii.pill, paddingHorizontal: 10 },
  streakText: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 12 },
  timeline: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 6 },
  stepWrap: { flex: 1, alignItems: "center", position: "relative" },
  stepCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.panel, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center", zIndex: 2 },
  stepComplete: { backgroundColor: colors.growth, borderColor: colors.growth },
  stepCurrent: { backgroundColor: colors.goldTint, borderColor: colors.gold },
  stepNumber: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 12 },
  stepNumberCurrent: { color: colors.gold },
  stepLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 9, marginTop: 5, textTransform: "capitalize" },
  stepLine: { position: "absolute", top: 16, left: "67%", width: "66%", height: 2, backgroundColor: colors.line },
  stepLineComplete: { backgroundColor: colors.growth },
  pledge: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, lineHeight: 20, marginTop: 8 },
  input: { minHeight: 96, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, padding: 12, marginTop: 10, marginBottom: 12 },
  inputDisabled: { color: colors.inkSoft, fontStyle: "italic" },
  weekRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  day: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelRaised, alignItems: "center", justifyContent: "center" },
  dayHit: { backgroundColor: colors.growth, borderColor: colors.growth },
  dayText: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 10 },
  dayTextHit: { color: colors.backgroundDeep },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12 },
  rewardCard: { borderRadius: radii.large, padding: 16, backgroundColor: colors.goldTint, borderWidth: 1, borderColor: "rgba(240,180,41,0.28)", gap: 12 },
  missedCard: { backgroundColor: colors.coralTint, borderColor: "rgba(226,112,90,0.28)" },
  rewardCopy: { gap: 3 },
  rewardTitle: { color: colors.gold, fontFamily: fonts.display, fontSize: 18 },
  missedTitle: { color: colors.coral },
});
