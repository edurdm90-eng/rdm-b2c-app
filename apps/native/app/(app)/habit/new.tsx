import DateTimePicker from "@react-native-community/datetimepicker";
import {
  dayKeyForTimeZone,
  habitCategories,
  habitPledgeSchedule,
  habitTemplates,
  type HabitCategory,
} from "@rdm-b2c/api/domain/rdm";
import { haraHachiBu } from "@rdm-b2c/api/domain/wisdom";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ActionDialog, AppScreen, ErrorState, PageHeader, Pill, PrimaryButton, SectionLabel, SurfaceCard } from "@/components/rdm-ui";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { goBackToJapaneseWisdom } from "@/lib/wisdom-navigation";
import { queryClient, trpc } from "@/utils/trpc";

function dayKeyToDate(dayKey: string) {
  return new Date(`${dayKey}T12:00:00`);
}

function dateToDayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(dayKey: string, days: number) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function DateField({
  label,
  value,
  minimumDayKey,
  onChange,
}: {
  label: string;
  value: string;
  minimumDayKey: string;
  onChange: (dayKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === "web") {
    return (
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        maxLength={10}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        value={value}
      />
    );
  }

  return (
    <>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.dateButton, pressed && styles.dateButtonPressed]}
      >
        <Text style={styles.dateValue}>
          {dayKeyToDate(value).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </Text>
        <Text style={styles.dateAction}>Choose date</Text>
      </Pressable>
      {open ? (
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={dayKeyToDate(minimumDayKey)}
            mode="date"
            onChange={(event, selectedDate) => {
              if (Platform.OS === "android") setOpen(false);
              if (event.type === "set" && selectedDate) onChange(dateToDayKey(selectedDate));
            }}
            value={dayKeyToDate(value)}
          />
          {Platform.OS === "ios" ? (
            <PrimaryButton label="Done" onPress={() => setOpen(false)} variant="outline" />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

export default function NewHabitScreen() {
  const [timeZone] = useState(getDeviceTimeZone);
  const [creationId] = useState(() => Crypto.randomUUID());
  const params = useLocalSearchParams<{ template?: string; wisdomPracticeId?: string }>();
  const wisdomPractice = params.wisdomPracticeId === haraHachiBu.id ? haraHachiBu : null;
  const template = useMemo(() => habitTemplates.find((item) => item.id === params.template), [params.template]);
  const todayDayKey = dayKeyForTimeZone(new Date(), timeZone);
  const [title, setTitle] = useState(wisdomPractice?.title ?? template?.title ?? "");
  const [category, setCategory] = useState<HabitCategory>(wisdomPractice?.category ?? template?.category ?? "Focus");
  const [cadence, setCadence] = useState<"Daily" | "Weekdays" | "Custom weekly">(
    wisdomPractice ? "Daily" : template?.id === "deep-work" ? "Weekdays"
      : template && template.cadence !== "Daily" ? "Custom weekly" : "Daily",
  );
  const [customWeekdays, setCustomWeekdays] = useState<number[]>([]);
  const weekdays = useMemo(() => wisdomPractice ? [...wisdomPractice.weekdays] : cadence === "Daily" ? [1, 2, 3, 4, 5, 6, 7]
    : cadence === "Weekdays" ? [1, 2, 3, 4, 5] : customWeekdays, [cadence, customWeekdays, wisdomPractice]);
  const [target, setTarget] = useState(wisdomPractice?.target ?? template?.target ?? "");
  const [pledge, setPledge] = useState(wisdomPractice?.pledge ?? template?.pledge ?? "");
  const [rdmPledgePerDay, setRdmPledgePerDay] = useState(wisdomPractice ? "1" : "10");
  const [startDayKey, setStartDayKey] = useState(todayDayKey);
  const [endDayKey, setEndDayKey] = useState(() => addDays(todayDayKey, 5));
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions());
  const numericDailyPledge = Number(rdmPledgePerDay);
  const pledgeSchedule = useMemo(
    () => habitPledgeSchedule({
      startDayKey,
      endDayKey,
      dailyPledge: numericDailyPledge,
      weekdays,
    }),
    [endDayKey, numericDailyPledge, startDayKey, weekdays],
  );
  const availableBase = wallet.data?.wallet.base ?? 0;
  const canAfford = Boolean(pledgeSchedule && pledgeSchedule.totalPledge <= availableBase);
  const createHabit = useMutation(trpc.rdm.habits.create.mutationOptions({
    onSuccess: async (habit) => {
      await queryClient.invalidateQueries();
      router.replace({ pathname: "/(app)/habit/[id]", params: { id: habit.id } });
    },
    onError: (mutationError) => setError(mutationError.message),
  }));

  function submit(confirmed = false) {
    if (createHabit.isPending) return;
    setError(null);
    if (title.trim().length < 2 || target.trim().length < 2 || pledge.trim().length < 8) {
      setError("Give the habit a name, a measurable target, and a clear pledge.");
      return;
    }
    if (!pledgeSchedule || pledgeSchedule.dayCount > 365) {
      setError("Choose your weekdays, an RDM amount, and at least one scheduled date within 365 calendar days.");
      return;
    }
    if (startDayKey < todayDayKey) {
      setError("The habit start date cannot be in the past.");
      return;
    }
    if (pledgeSchedule.totalPledge > availableBase) {
      setError(`You need ${formatRdm(pledgeSchedule.totalPledge)} RDM in your Base Purse.`);
      return;
    }
    if (wisdomPractice && !confirmed) {
      setConfirmOpen(true);
      return;
    }
    setConfirmOpen(false);
    createHabit.mutate({
      title: title.trim(),
      creationId,
      category,
      cadence: cadence.trim(),
      target: target.trim(),
      pledge: pledge.trim(),
      rdmPledgePerDay: numericDailyPledge,
      rdmPledgeWeekdays: weekdays,
      rdmPledgeStartDayKey: startDayKey,
      rdmPledgeEndDayKey: endDayKey,
      timeZone,
      icon: wisdomPractice?.icon ?? template?.icon ?? "target",
      source: wisdomPractice || template ? "template" : "custom",
      ...(wisdomPractice ? { wisdomPracticeId: wisdomPractice.id } : {}),
    });
  }

  if (wallet.error) {
    return <ErrorState message={wallet.error.message} onRetry={() => void wallet.refetch()} />;
  }

  return (
    <AppScreen>
      <PageHeader
        back
        onBack={wisdomPractice ? goBackToJapaneseWisdom : undefined}
        title={wisdomPractice?.title ?? (template ? "Shape this habit" : "Build your habit")}
        subtitle={wisdomPractice ? "Japanese Wisdom · daily practice" : template ? `Starting from ${template.title}` : "Your framework, your words"}
      />
      {wisdomPractice ? (
        <SurfaceCard style={styles.practiceSummary}>
          <Text style={styles.promiseTitle}>A mindful moment, every day</Text>
          <Text style={styles.promiseCopy}>{wisdomPractice.description}</Text>
          <Text style={styles.promiseCopy}>{wisdomPractice.target}</Text>
          <Text style={styles.promiseCopy}>“{wisdomPractice.pledge}”</Text>
          <Text style={styles.promiseCopy}>An honest reflection counts even if the practice was difficult. No food quantity, calorie, or weight target. Follow your individual nutritional needs and professional guidance.</Text>
          <Text style={styles.promiseCopy}>Bonus payouts are not enabled for this commitment.</Text>
        </SurfaceCard>
      ) : (
        <>
          <SectionLabel>Habit name</SectionLabel>
          <TextInput accessibilityLabel="Habit name" onChangeText={setTitle} placeholder="e.g. Read before bed" placeholderTextColor={colors.inkSoft} style={styles.input} value={title} />
          <SectionLabel>Category</SectionLabel>
          <View style={styles.pills}>{habitCategories.map((item) => <Pill key={item} active={category === item} label={item} onPress={() => setCategory(item)} />)}</View>
          <SectionLabel>Cadence</SectionLabel>
          <View style={styles.pills}>
            {(["Daily", "Weekdays", "Custom weekly"] as const).map((item) => (
              <Pill key={item} active={cadence === item} label={item} onPress={() => setCadence(item)} />
            ))}
          </View>
          {cadence === "Custom weekly" ? (
            <View style={styles.pills}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => (
                <Pill key={label} active={customWeekdays.includes(index + 1)} label={label} onPress={() => {
                  const day = index + 1;
                  setCustomWeekdays((current) => current.includes(day)
                    ? current.filter((item) => item !== day) : [...current, day].sort());
                }} />
              ))}
            </View>
          ) : null}
          <Text style={styles.scheduleHint}>Only selected days are charged. Rest days keep your streak and carry no penalty.</Text>
          <SectionLabel>Measurable target</SectionLabel>
          <TextInput accessibilityLabel="Target" onChangeText={setTarget} placeholder="What counts as done?" placeholderTextColor={colors.inkSoft} style={styles.input} value={target} />
          <SectionLabel>Your pledge</SectionLabel>
          <TextInput accessibilityLabel="Pledge" multiline onChangeText={setPledge} placeholder="I pledge to…" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.multiline]} textAlignVertical="top" value={pledge} />
          <View style={styles.promiseNote}><Text style={styles.promiseTitle}>Keep it fair</Text><Text style={styles.promiseCopy}>A good pledge is specific enough to check and small enough to repeat on a difficult day.</Text></View>
        </>
      )}
      <SectionLabel>RDM pledge per day</SectionLabel>
      <TextInput
        accessibilityLabel="RDM pledge per day"
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={setRdmPledgePerDay}
        placeholder={wisdomPractice ? "1" : "10"}
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        value={rdmPledgePerDay}
      />
      <SectionLabel>Start date</SectionLabel>
      <DateField
        label="Habit start date"
        minimumDayKey={todayDayKey}
        onChange={(dayKey) => {
          setStartDayKey(dayKey);
          if (endDayKey <= dayKey) setEndDayKey(addDays(dayKey, 5));
        }}
        value={startDayKey}
      />
      <SectionLabel>End date</SectionLabel>
      <DateField
        label="Habit end date"
        minimumDayKey={addDays(startDayKey, 1)}
        onChange={setEndDayKey}
        value={endDayKey}
      />
      <Text style={styles.endDateHint}>The end date is the finish boundary and is not charged.</Text>
      {wisdomPractice ? <Text style={styles.scheduleHint}>Every day is a commitment day. Saved time zone: {timeZone}.</Text> : null}
      <SurfaceCard style={styles.rdmSummary}>
        <View style={styles.rdmSummaryRow}>
          <View>
            <Text style={styles.rdmSummaryLabel}>Base Purse</Text>
            <Text style={styles.rdmSummaryValue}>{formatRdm(availableBase)} RDM available</Text>
          </View>
          <View style={styles.rdmSummaryRight}>
            <Text style={styles.rdmSummaryLabel}>{wisdomPractice ? "Lock on confirmation" : "Locked now"}</Text>
            <Text style={[styles.rdmSummaryValue, !canAfford && styles.rdmSummaryError]}>
              {pledgeSchedule ? `${formatRdm(pledgeSchedule.totalPledge)} RDM` : "—"}
            </Text>
          </View>
        </View>
        <Text style={styles.rdmSummaryCopy}>
          {pledgeSchedule
            ? `${pledgeSchedule.dayCount} scheduled ${pledgeSchedule.dayCount === 1 ? "day" : "days"} × ${formatRdm(numericDailyPledge)} RDM. Each scheduled day moves to Reward when completed or Remorse when missed.`
            : "Choose weekdays and a valid amount/date window containing at least one scheduled day."}
        </Text>
      </SurfaceCard>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton disabled={wallet.isLoading || !canAfford} label={wisdomPractice ? "Review commitment" : "Lock RDM & create habit"} loading={createHabit.isPending} onPress={() => submit()} />
      {wisdomPractice ? (
        <ActionDialog
          title="Confirm Hara Hachi Bu"
          visible={confirmOpen}
          message={`${startDayKey} to ${endDayKey} (end excluded), in ${timeZone}. ${pledgeSchedule?.dayCount ?? 0} days × ${formatRdm(numericDailyPledge)} RDM = ${formatRdm(pledgeSchedule?.totalPledge ?? 0)} RDM locked from Base. Each daily check-in and reflection moves its allocation to Reward; a missed day moves it to Remorse. Bonus payouts are not enabled.`}
          confirmLabel="Lock RDM & start"
          loading={createHabit.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => submit(true)}
        />
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 14 },
  multiline: { minHeight: 118, paddingTop: 14, lineHeight: 20 },
  dateButton: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateButtonPressed: { opacity: 0.8 },
  dateValue: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 14 },
  dateAction: { color: colors.growth, fontFamily: fonts.bodyBold, fontSize: 11 },
  datePickerWrap: { borderRadius: radii.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, overflow: "hidden", padding: 8, gap: 8 },
  endDateHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: -8 },
  scheduleHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  promiseNote: { borderRadius: radii.medium, padding: 14, backgroundColor: colors.plumTint, borderWidth: 1, borderColor: "rgba(179,154,232,0.22)", gap: 4 },
  promiseTitle: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 12 },
  promiseCopy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  practiceSummary: { gap: 10, backgroundColor: colors.plumTint },
  rdmSummary: { gap: 10, backgroundColor: colors.growthTint },
  rdmSummaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rdmSummaryRight: { alignItems: "flex-end" },
  rdmSummaryLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase" },
  rdmSummaryValue: { color: colors.growth, fontFamily: fonts.monoBold, fontSize: 13, marginTop: 3 },
  rdmSummaryError: { color: colors.coral },
  rdmSummaryCopy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12 },
});
