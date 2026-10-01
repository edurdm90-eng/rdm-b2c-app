import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { dayKeyForTimeZone, goalCategories, goalDurationWindow, type GoalCategory } from "@rdm-b2c/api/domain/rdm";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { FocusedButton, FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { HabitDateField } from "@/components/habit-date-field";
import { fonts, formatRdm } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { invalidateQueriesInBackground, trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const categoryIcons: Record<GoalCategory, IconName> = {
  Focus: "book-open-variant-outline",
  Health: "leaf",
  Money: "wallet-outline",
  Family: "account-group-outline",
  Sustainability: "sprout-outline",
};

function dateWindow(startDayKey: string, endDayKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDayKey)) return null;
  const durationDays = (Date.parse(`${endDayKey}T00:00:00.000Z`) - Date.parse(`${startDayKey}T00:00:00.000Z`)) / 86_400_000;
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 90) return null;
  const schedule = goalDurationWindow(startDayKey, durationDays);
  return schedule?.endDayKey === endDayKey ? schedule : null;
}

export default function NewGoalScreen() {
  const [timeZone] = useState(getDeviceTimeZone);
  const [creationId, setCreationId] = useState(() => Crypto.randomUUID());
  const [createdGoalId, setCreatedGoalId] = useState<string | null>(null);
  const todayDayKey = dayKeyForTimeZone(new Date(), timeZone);
  const [startDayKey, setStartDayKey] = useState(todayDayKey);
  const [endDayKey, setEndDayKey] = useState(() => goalDurationWindow(todayDayKey, 45)!.endDayKey);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<GoalCategory>("Money");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [pledgeAmount, setPledgeAmount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const submissionInFlight = useRef(false);
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions());
  const schedule = useMemo(() => dateWindow(startDayKey, endDayKey), [startDayKey, endDayKey]);
  const numericPledge = Number(pledgeAmount);
  const availableBase = wallet.data?.wallet.base;
  const validPledge = Number.isInteger(numericPledge) && numericPledge >= 1 && numericPledge <= 100_000;
  const totalPledge = validPledge && schedule ? numericPledge * schedule.durationDays : null;
  const validTotal = totalPledge !== null && totalPledge <= 100_000;
  const canAfford = totalPledge !== null && availableBase !== undefined && totalPledge <= availableBase;
  const minimumEndDayKey = goalDurationWindow(startDayKey, 1)?.endDayKey ?? todayDayKey;

  const createGoal = useMutation(trpc.rdm.goals.create.mutationOptions({
    onSuccess: (goal) => {
      setCreatedGoalId(goal.id);
      invalidateQueriesInBackground(
        trpc.rdm.goals.list.queryKey(),
        trpc.rdm.wallet.summary.queryKey(),
        trpc.rdm.dashboard.queryKey(),
      );
    },
    onError: (mutationError) => {
      setError(mutationError.message);
      // A rejected funding attempt can leave an unfunded draft. Preserve the
      // existing retry policy, while retaining the same ID for uncertain errors.
      if (mutationError.data?.code === "BAD_REQUEST") setCreationId(Crypto.randomUUID());
    },
    onSettled: () => { submissionInFlight.current = false; },
  }));
  const busy = createGoal.isPending || Boolean(createdGoalId);

  usePreventRemove(busy && !createdGoalId, () => {});
  useEffect(() => {
    if (createdGoalId) router.replace({ pathname: "/(app)/goal/[id]", params: { id: createdGoalId } });
  }, [createdGoalId]);

  function goBack() {
    if (busy || submissionInFlight.current) return;
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/goals");
  }

  function changeStart(dayKey: string) {
    if (busy) return;
    setStartDayKey(dayKey);
    if (dayKey && endDayKey && endDayKey <= dayKey) {
      setEndDayKey(goalDurationWindow(dayKey, schedule?.durationDays ?? 45)?.endDayKey ?? "");
    }
  }

  function changePledge(amount: number) {
    if (busy) return;
    setPledgeAmount(String(Math.max(1, Math.min(100_000, amount))));
    setError(null);
  }

  function submit() {
    if (busy || submissionInFlight.current) return;
    setError(null);
    if (title.trim().length < 3 || target.trim().length < 2) {
      setError("Add a goal name of at least 3 characters and a clear, measurable target.");
      return;
    }
    if (!schedule) {
      setError("Choose valid start and end dates for 1–90 days. The end date is not included.");
      return;
    }
    if (startDayKey < todayDayKey) { setError("The goal start date cannot be in the past."); return; }
    if (!validPledge) { setError("Enter a whole-number daily pledge of at least 1 RDM."); return; }
    if (!validTotal || totalPledge === null) { setError("The total commitment must be 100,000 RDM or less."); return; }
    if (availableBase === undefined || wallet.error) {
      setError("Your Base balance could not be checked. Retry before creating your goal.");
      return;
    }
    if (!canAfford) {
      setError(`You need ${formatRdm(totalPledge)} Base RDM. Lower the daily pledge or choose a smaller target and shorter period.`);
      return;
    }
    submissionInFlight.current = true;
    setCategoryOpen(false);
    createGoal.mutate({
      creationId,
      title: title.trim(),
      category,
      target: target.trim(),
      durationDays: schedule.durationDays,
      startDayKey: schedule.startDayKey,
      timeZone,
      pledgeAmount: totalPledge,
      rdmPledgePerDay: numericPledge,
    });
  }

  return (
    <FocusedScreen scroll={false} bottomSafe contentStyle={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={goBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={palette.muted} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>Add goal</Text>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.field}>
            <Text style={styles.label}>Goal name</Text>
            <TextInput accessibilityLabel="Goal name" editable={!busy} maxLength={80} onChangeText={setTitle} placeholder="e.g. Finish one book" placeholderTextColor={palette.muted} style={styles.input} value={title} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Category</Text>
            <Pressable accessibilityLabel={`Category: ${category}`} accessibilityRole="button" accessibilityState={{ disabled: busy, expanded: categoryOpen }} aria-expanded={categoryOpen} disabled={busy} onPress={() => setCategoryOpen((open) => !open)} style={styles.categoryButton}>
              <MaterialCommunityIcons name={categoryIcons[category]} size={25} color={palette.muted} />
              <Text style={[styles.inputText, styles.flex]}>{category}</Text>
              <MaterialCommunityIcons name={categoryOpen ? "chevron-up" : "chevron-down"} size={22} color={palette.muted} />
            </Pressable>
            {categoryOpen ? (
              <View accessibilityRole="radiogroup" style={styles.categoryMenu}>
                {goalCategories.map((item) => (
                  <Pressable key={item} accessibilityLabel={item} accessibilityRole="radio" accessibilityState={{ disabled: busy, checked: category === item }} aria-checked={category === item} disabled={busy} onPress={() => { setCategory(item); setCategoryOpen(false); }} style={styles.categoryOption}>
                    <MaterialCommunityIcons name={categoryIcons[item]} size={22} color={category === item ? palette.green : palette.muted} />
                    <Text style={[styles.inputText, styles.flex]}>{item}</Text>
                    {category === item ? <MaterialCommunityIcons name="check" size={20} color={palette.green} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Target</Text>
            <View style={styles.targetBox}>
              <TextInput accessibilityLabel="Goal target" editable={!busy} maxLength={120} multiline onChangeText={setTarget} placeholder="What will you achieve by the end?" placeholderTextColor={palette.muted} style={styles.targetInput} textAlignVertical="top" value={target} />
              <Text style={styles.counter}>{target.length}/120</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Start date</Text>
            <HabitDateField disabled={busy} label="Goal start date" minimumDayKey={todayDayKey} onChange={changeStart} value={startDayKey} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>End date <Text style={styles.muted}>(exclusive)</Text></Text>
            <HabitDateField disabled={busy} label="Goal end date" minimumDayKey={minimumEndDayKey} onChange={setEndDayKey} value={endDayKey} />
            <Text style={[styles.caption, (!schedule || startDayKey < todayDayKey) && styles.error]}>{startDayKey < todayDayKey ? "The start date cannot be in the past."
              : schedule ? `${schedule.durationDays} days · End date not included` : "Choose a valid 1–90 day period."}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Daily pledge (RDM)</Text>
            <View style={styles.stepper}>
              <Pressable accessibilityLabel="Decrease daily pledge" accessibilityRole="button" accessibilityState={{ disabled: busy || numericPledge <= 1 }} disabled={busy || numericPledge <= 1} onPress={() => changePledge((Number.isFinite(numericPledge) ? numericPledge : 1) - 1)} style={({ pressed }) => [styles.stepperButton, numericPledge <= 1 && styles.disabled, pressed && styles.pressed]}>
                <MaterialCommunityIcons name="minus" size={25} color={palette.text} />
              </Pressable>
              <View style={styles.pledgeValue}>
                <TextInput accessibilityLabel="Goal daily RDM pledge" editable={!busy} keyboardType="number-pad" maxLength={6} onChangeText={(value) => { setPledgeAmount(value.replace(/\D/g, "")); setError(null); }} selectTextOnFocus style={styles.rdmInput} value={pledgeAmount} />
                <Text style={styles.rdmUnit}>RDM</Text>
              </View>
              <Pressable accessibilityLabel="Increase daily pledge" accessibilityRole="button" accessibilityState={{ disabled: busy || numericPledge >= 100_000 }} disabled={busy || numericPledge >= 100_000} onPress={() => changePledge((Number.isFinite(numericPledge) ? numericPledge : 0) + 1)} style={({ pressed }) => [styles.stepperButton, numericPledge >= 100_000 && styles.disabled, pressed && styles.pressed]}>
                <MaterialCommunityIcons name="plus" size={25} color={palette.text} />
              </Pressable>
            </View>
            {!validPledge ? <Text style={styles.error}>Enter a whole number from 1 to 100,000 RDM per day.</Text> : null}
          </View>

          <View style={styles.summary}>
            <View style={styles.commitment}>
              <Text style={styles.caption}>Total commitment</Text>
              <Text style={styles.summaryEquation}>{schedule && validPledge ? `${schedule.durationDays} days × ${formatRdm(numericPledge)} RDM` : "Choose dates and daily RDM"}</Text>
              <Text style={[styles.total, totalPledge !== null && !validTotal && styles.errorColor]}>{totalPledge === null ? "—" : formatRdm(totalPledge)} <Text style={styles.rdmUnit}>RDM</Text></Text>
            </View>
            <View style={styles.balances}>
              <Text style={styles.caption}>Base available</Text>
              <Text style={styles.balance}>{availableBase === undefined ? "Checking…" : `${formatRdm(availableBase)} RDM`}</Text>
              <Text style={[styles.caption, styles.afterLabel]}>After this goal</Text>
              <Text style={[styles.balance, canAfford ? styles.green : totalPledge !== null && availableBase !== undefined ? styles.errorColor : undefined]}>{totalPledge === null || availableBase === undefined ? "—" : `${formatRdm(availableBase - totalPledge)} RDM`}</Text>
            </View>
          </View>

          {wallet.error ? (
            <View style={styles.balanceError}>
              <Text accessibilityRole="alert" style={styles.error}>Your balance could not be refreshed. Your goal details are still here.</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: wallet.isFetching }} disabled={wallet.isFetching} onPress={() => void wallet.refetch()} style={styles.retry}>
                <Text style={styles.link}>{wallet.isFetching ? "Checking balance…" : "Retry balance"}</Text>
              </Pressable>
            </View>
          ) : totalPledge !== null && !validTotal ? <Text style={styles.error}>The total commitment must be 100,000 RDM or less.</Text>
            : totalPledge !== null && availableBase !== undefined && !canAfford ? (
              <Text style={styles.error}>Not enough Base RDM. At this daily pledge, your balance supports up to {Math.min(90, Math.floor(availableBase / numericPledge))} days. Choose a shorter period or lower pledge.</Text>
            ) : null}
          <Text style={styles.caption}>Saved time zone: {timeZone}. Completed daily reflections move that day's allocation to Reward; missed days go to Remorse. No second charge.</Text>
        </ScrollView>

        <View style={styles.footer}>
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          <Text style={styles.caption}>Reflect every day. Up to 90 days. Minimum 1 RDM/day.</Text>
          <FocusedButton disabled={wallet.isLoading || Boolean(wallet.error) || !schedule || startDayKey < todayDayKey || !validTotal || !canAfford} label={totalPledge === null ? "Lock RDM & create goal" : `Lock ${formatRdm(totalPledge)} RDM & create goal`} loading={busy} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  flex: { flex: 1 },
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8 },
  back: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: palette.text, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 26 },
  content: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 14, gap: 11 },
  field: { gap: 6 },
  label: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  muted: { color: palette.muted, fontFamily: fonts.body },
  input: { minHeight: 44, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel, color: palette.text, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 12, paddingVertical: 9 },
  inputText: { color: palette.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  categoryButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel, paddingHorizontal: 12 },
  categoryMenu: { paddingHorizontal: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel },
  categoryOption: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 },
  targetBox: { minHeight: 90, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel, gap: 4 },
  targetInput: { minHeight: 51, color: palette.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, padding: 0 },
  counter: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, textAlign: "right" },
  caption: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  stepper: { flexDirection: "row", minHeight: 48, alignItems: "center", borderWidth: 1, borderColor: palette.line, borderRadius: 8 },
  stepperButton: { minWidth: 58, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: palette.line, borderRadius: 7, backgroundColor: palette.panel },
  pledgeValue: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  rdmInput: { flexShrink: 1, minWidth: 32, maxWidth: 100, minHeight: 44, paddingVertical: 6, paddingHorizontal: 0, color: palette.text, fontFamily: fonts.bodyBold, fontSize: 22, textAlign: "center" },
  rdmUnit: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 22 },
  summary: { flexDirection: "row", gap: 16, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel, padding: 12 },
  commitment: { flex: 1, minWidth: 0, gap: 4 },
  summaryEquation: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  total: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 27, lineHeight: 35 },
  balances: { flex: 1, minWidth: 0, paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: palette.line, gap: 2 },
  balance: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  afterLabel: { marginTop: 3 },
  green: { color: palette.green },
  balanceError: { gap: 2 },
  retry: { minHeight: 44, justifyContent: "center" },
  link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 13 },
  footer: { paddingHorizontal: 20, paddingTop: 9, paddingBottom: 16, gap: 9 },
  error: { color: palette.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  errorColor: { color: palette.coral },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
