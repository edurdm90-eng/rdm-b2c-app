import DateTimePicker from "@react-native-community/datetimepicker";
import {
  dayKeyForTimeZone,
  goalCategories,
  goalDurationWindow,
  type GoalCategory,
} from "@rdm-b2c/api/domain/rdm";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  AppScreen,
  ErrorState,
  PageHeader,
  Pill,
  PrimaryButton,
  SectionLabel,
  SurfaceCard,
} from "@/components/rdm-ui";
import { formatDayKey } from "@/lib/date";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { queryClient, trpc } from "@/utils/trpc";

type DurationChoice = "30" | "90" | "custom";

export default function NewGoalScreen() {
  const timeZone = getDeviceTimeZone();
  const [creationId, setCreationId] = useState(() => Crypto.randomUUID());
  const todayDayKey = dayKeyForTimeZone(new Date(), timeZone);
  const [startDayKey, setStartDayKey] = useState(todayDayKey);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<GoalCategory>("Money");
  const [target, setTarget] = useState("");
  const [durationChoice, setDurationChoice] = useState<DurationChoice>("90");
  const [customDays, setCustomDays] = useState("120");
  const [pledgeAmount, setPledgeAmount] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions());
  const durationDays = durationChoice === "custom" ? Number(customDays) : Number(durationChoice);
  const window = useMemo(
    () => goalDurationWindow(startDayKey, durationDays),
    [durationDays, startDayKey],
  );
  const numericPledge = Number(pledgeAmount);
  const availableBase = wallet.data?.wallet.base ?? 0;
  const validPledge = Number.isInteger(numericPledge) && numericPledge > 0;
  const canAfford = validPledge && numericPledge <= availableBase;

  const createGoal = useMutation(trpc.rdm.goals.create.mutationOptions({
    onSuccess: async (goal) => {
      await queryClient.invalidateQueries();
      router.replace({ pathname: "/(app)/goal/[id]", params: { id: goal.id } });
    },
    onError: (mutationError) => {
      setError(mutationError.message);
      if (mutationError.data?.code === "BAD_REQUEST") setCreationId(Crypto.randomUUID());
    },
  }));

  function submit() {
    if (title.trim().length < 3 || target.trim().length < 2) {
      setError("Add a clear goal title and a measurable target.");
      return;
    }
    if (!window || window.durationDays > 3_650) {
      setError("Choose a duration between 1 and 3,650 days.");
      return;
    }
    if (startDayKey < todayDayKey) {
      setError("The goal start date cannot be in the past.");
      return;
    }
    if (!validPledge) {
      setError("Enter a whole-number RDM pledge of at least 1.");
      return;
    }
    if (!canAfford) {
      setError(`You need ${formatRdm(numericPledge)} RDM in your Base Purse.`);
      return;
    }
    setError(null);
    createGoal.mutate({
      creationId,
      title: title.trim(),
      category,
      target: target.trim(),
      durationDays: window.durationDays,
      startDayKey,
      timeZone,
      pledgeAmount: numericPledge,
    });
  }

  if (wallet.error) return <ErrorState message={wallet.error.message} onRetry={() => void wallet.refetch()} />;

  return (
    <AppScreen>
      <PageHeader back title="Add a Goal" subtitle="GOALS · DEFINE THE FINISH LINE" />

      <SectionLabel>Goal title</SectionLabel>
      <TextInput
        accessibilityLabel="Goal title"
        onChangeText={setTitle}
        placeholder="e.g. Save ₹20,000 by December"
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        value={title}
      />

      <SectionLabel>Category</SectionLabel>
      <View style={styles.chips}>
        {goalCategories.map((item) => (
          <Pill
            key={item}
            active={category === item}
            color={colors.plum}
            label={item}
            onPress={() => setCategory(item)}
          />
        ))}
      </View>

      <SectionLabel>Target</SectionLabel>
      <TextInput
        accessibilityLabel="Goal target"
        onChangeText={setTarget}
        placeholder="e.g. ₹20,000 saved"
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        value={target}
      />

      <SectionLabel>Start date</SectionLabel>
      {Platform.OS === "web" ? (
        <TextInput accessibilityLabel="Goal start date" autoCapitalize="none" maxLength={10}
          onChangeText={setStartDayKey} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkSoft}
          style={styles.input} value={startDayKey} />
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Goal start date"
            onPress={() => setDatePickerOpen(true)} style={styles.dateButton}>
            <Text style={styles.dateValue}>{formatDayKey(startDayKey)}</Text>
            <Text style={styles.dateAction}>Choose date</Text>
          </Pressable>
          {datePickerOpen ? (
            <View>
              <DateTimePicker display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date(`${todayDayKey}T12:00:00`)} mode="date"
                value={new Date(`${startDayKey}T12:00:00`)} onChange={(event, date) => {
                  if (Platform.OS === "android") setDatePickerOpen(false);
                  if (event.type === "set" && date) {
                    setStartDayKey([date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"));
                  }
                }} />
              {Platform.OS === "ios" ? <PrimaryButton label="Done" variant="outline" onPress={() => setDatePickerOpen(false)} /> : null}
            </View>
          ) : null}
        </>
      )}

      <SectionLabel>Duration</SectionLabel>
      <View style={styles.chips}>
        {([
          { id: "30", label: "30 days" },
          { id: "90", label: "90 days" },
          { id: "custom", label: "Custom" },
        ] as const).map((item) => (
          <Pill
            key={item.id}
            active={durationChoice === item.id}
            color={colors.plum}
            label={item.label}
            onPress={() => setDurationChoice(item.id)}
          />
        ))}
      </View>
      {durationChoice === "custom" ? (
        <TextInput
          accessibilityLabel="Custom goal duration in days"
          keyboardType="number-pad"
          maxLength={4}
          onChangeText={setCustomDays}
          placeholder="Number of days"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
          value={customDays}
        />
      ) : null}

      <SectionLabel>RDM pledge</SectionLabel>
      <TextInput
        accessibilityLabel="Goal RDM pledge"
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={setPledgeAmount}
        placeholder="50"
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        value={pledgeAmount}
      />

      <SurfaceCard style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Base Purse</Text>
            <Text style={styles.summaryValue}>{formatRdm(availableBase)} RDM available</Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryLabel}>Locked now</Text>
            <Text style={[styles.summaryValue, !canAfford && styles.summaryError]}>
              {validPledge ? `${formatRdm(numericPledge)} RDM` : "—"}
            </Text>
          </View>
        </View>
        <Text style={styles.summaryCopy}>
          {window
            ? `${window.durationDays} days · ${formatDayKey(window.startDayKey)} to ${formatDayKey(window.endDayKey)}. The finish date is the deadline boundary.`
            : "Enter a valid duration to calculate the goal window."}
        </Text>
        <Text style={styles.summaryCopy}>Complete the goal to move the full pledge to Reward. An incomplete goal moves the pledge to Remorse at the deadline.</Text>
      </SurfaceCard>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        disabled={wallet.isLoading || !window || !canAfford}
        label="Lock RDM & save goal"
        loading={createGoal.isPending}
        onPress={submit}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingHorizontal: 14,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dateButton: { minHeight: 52, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateValue: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 14 },
  dateAction: { color: colors.growth, fontFamily: fonts.bodyBold, fontSize: 11 },
  summaryCard: { gap: 10, backgroundColor: colors.growthTint },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryRight: { alignItems: "flex-end" },
  summaryLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase" },
  summaryValue: { color: colors.growth, fontFamily: fonts.monoBold, fontSize: 12.5, marginTop: 3 },
  summaryError: { color: colors.coral },
  summaryCopy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12 },
});
