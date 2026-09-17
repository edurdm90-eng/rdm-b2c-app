import { MaterialCommunityIcons } from "@expo/vector-icons";
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
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusedButton, FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { HabitDateField } from "@/components/habit-date-field";
import { fonts, formatRdm } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { goBackToJapaneseWisdom } from "@/lib/wisdom-navigation";
import { queryClient, trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const categoryIcons: Record<HabitCategory, IconName> = {
  Focus: "book-open-variant-outline",
  Health: "leaf",
  Money: "wallet-outline",
  Sustainability: "sprout-outline",
};
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addDays(dayKey: string, days: number) {
  const date = new Date(dayKey + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime())) return dayKey;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function InfoNote({ children, card = false }: { children: React.ReactNode; card?: boolean }) {
  return (
    <View style={[styles.note, card && styles.noteCard]}>
      <MaterialCommunityIcons name="information-outline" size={24} color={palette.muted} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

export default function NewHabitScreen() {
  const params = useLocalSearchParams<{ template?: string; wisdomPracticeId?: string }>();
  const wisdomPractice = params.wisdomPracticeId === haraHachiBu.id ? haraHachiBu : null;
  const template = useMemo(() => habitTemplates.find((item) => item.id === params.template), [params.template]);
  const [timeZone] = useState(getDeviceTimeZone);
  const [creationId] = useState(() => Crypto.randomUUID());
  const todayDayKey = dayKeyForTimeZone(new Date(), timeZone);
  const [step, setStep] = useState<1 | 2>(1);
  const [createdHabitId, setCreatedHabitId] = useState<string | null>(null);
  const [title, setTitle] = useState(wisdomPractice?.title ?? template?.title ?? "");
  const [category, setCategory] = useState<HabitCategory>(wisdomPractice?.category ?? template?.category ?? "Focus");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [target, setTarget] = useState(wisdomPractice?.target ?? template?.target ?? "");
  const [pledge, setPledge] = useState(wisdomPractice?.pledge ?? template?.pledge ?? "");
  const [chooseDays, setChooseDays] = useState(!wisdomPractice && Boolean(template && (template.id === "deep-work" || template.cadence !== "Daily")));
  const [customWeekdays, setCustomWeekdays] = useState<number[]>(template?.id === "deep-work" ? [1, 2, 3, 4, 5] : []);
  const weekdays = useMemo(() => wisdomPractice ? [...wisdomPractice.weekdays]
    : chooseDays ? customWeekdays : [1, 2, 3, 4, 5, 6, 7], [chooseDays, customWeekdays, wisdomPractice]);
  const [dailyRdm, setDailyRdm] = useState("1");
  const [startDayKey, setStartDayKey] = useState(todayDayKey);
  const [endDayKey, setEndDayKey] = useState(() => addDays(todayDayKey, 5));
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const submissionInFlight = useRef(false);
  const insets = useSafeAreaInsets();
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions());
  const numericDailyPledge = Number(dailyRdm);
  const pledgeSchedule = useMemo(() => habitPledgeSchedule({
    startDayKey, endDayKey, dailyPledge: numericDailyPledge, weekdays,
  }), [endDayKey, numericDailyPledge, startDayKey, weekdays]);
  const availableBase = wallet.data?.wallet.base;
  const canAfford = Boolean(pledgeSchedule && availableBase !== undefined && pledgeSchedule.totalPledge <= availableBase);
  const cadence = weekdays.length === 7 ? "Daily" : weekdays.join(",") === "1,2,3,4,5" ? "Weekdays" : "Custom weekly";
  const icon = (wisdomPractice?.icon ?? template?.icon ?? categoryIcons[category]) as IconName;

  const createHabit = useMutation(trpc.rdm.habits.create.mutationOptions({
    onSuccess: async (habit) => {
      await queryClient.invalidateQueries();
      setCreatedHabitId(habit.id);
    },
    onError: (mutationError) => setError(mutationError.message),
    onSettled: () => { submissionInFlight.current = false; },
  }));
  const busy = createHabit.isPending || Boolean(createdHabitId);

  function showDetails() {
    setError(null);
    setConfirmOpen(false);
    setStep(1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  // Back from schedule edits the same draft. Release the guard before navigating
  // after a successful create so that it cannot intercept the success route.
  usePreventRemove(!createdHabitId && (step === 2 || busy), () => {
    if (!busy) showDetails();
  });
  useEffect(() => {
    if (createdHabitId) router.replace({ pathname: "/(app)/habit/[id]", params: { id: createdHabitId } });
  }, [createdHabitId]);

  function goBack() {
    if (busy) return;
    if (step === 2) { showDetails(); return; }
    if (wisdomPractice) { goBackToJapaneseWisdom(); return; }
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/habits");
  }

  function detailsAreValid() {
    if (title.trim().length < 2 || target.trim().length < 2 || pledge.trim().length < 8) {
      setError("Give the habit a name, a measurable target, and a clear pledge of at least 8 characters.");
      return false;
    }
    if (weekdays.length === 0) {
      setError("Choose at least one day to repeat your habit.");
      return false;
    }
    return true;
  }

  function continueToSchedule() {
    setError(null);
    if (!detailsAreValid()) return;
    setCategoryOpen(false);
    setStep(2);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function submit(confirmed = false) {
    if (busy || submissionInFlight.current) return;
    setError(null);
    if (!detailsAreValid()) return;
    if (!pledgeSchedule || numericDailyPledge > 100000) {
      setError("Choose at least one scheduled day within 365 calendar days and 1–100,000 RDM per day.");
      return;
    }
    if (startDayKey < todayDayKey) { setError("The habit start date cannot be in the past."); return; }
    if (pledgeSchedule.totalPledge > 100000) { setError("The total pledge must be 100,000 RDM or less."); return; }
    if (availableBase === undefined || wallet.error) {
      setError("Your Base balance could not be checked. Retry before creating your habit.");
      return;
    }
    if (!canAfford) { setError("You need " + formatRdm(pledgeSchedule.totalPledge) + " RDM in your Base Purse."); return; }
    if (wisdomPractice && !confirmed) { setConfirmOpen(true); return; }
    setConfirmOpen(false);
    submissionInFlight.current = true;
    createHabit.mutate({
      title: title.trim(),
      creationId,
      category,
      cadence,
      target: target.trim(),
      pledge: pledge.trim(),
      rdmPledgePerDay: numericDailyPledge,
      rdmPledgeWeekdays: weekdays,
      rdmPledgeStartDayKey: startDayKey,
      rdmPledgeEndDayKey: endDayKey,
      timeZone,
      icon,
      source: wisdomPractice || template ? "template" : "custom",
      ...(wisdomPractice ? { wisdomPracticeId: wisdomPractice.id } : {}),
    });
  }

  return (
    <FocusedScreen scroll={false} bottomSafe contentStyle={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable accessibilityLabel={step === 2 ? "Back to habit details" : "Back"} accessibilityRole="button" disabled={busy} onPress={goBack} style={styles.back}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={palette.muted} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>{step === 1 ? "Create habit" : "Schedule & pledge"}</Text>
        </View>
        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={[styles.content, step === 2 && styles.scheduleContent]} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Text style={styles.caption}>{step} of 2</Text>
            <Text accessibilityRole="header" style={styles.title}>{step === 1 ? "Details" : "Set schedule and pledge"}</Text>
            <Text style={styles.subtitle}>{step === 1 ? "Set up your habit, in your own words." : "Choose when to start and commit your RDM."}</Text>
          </View>
          {step === 1 ? (
            <>
              {wisdomPractice ? (
                <View style={styles.practiceCard}>
                  <View style={styles.practiceHeading}>
                    <View style={styles.practiceIcon}><MaterialCommunityIcons name="bowl-mix-outline" size={26} color={palette.purple} /></View>
                    <Text style={styles.cardTitle}>{wisdomPractice.title}</Text>
                  </View>
                  <Text style={styles.subtitle}>{wisdomPractice.description}</Text>
                  <View style={styles.practiceDescriptionBox}>
                    <Text style={styles.noteText}>{wisdomPractice.target}</Text>
                    <Text style={styles.noteText}>{wisdomPractice.pledge}</Text>
                  </View>
                  <Text style={styles.noteText}>An honest reflection counts even if the practice was difficult. No food quantity, calorie, or weight target. Follow your individual nutritional needs and professional guidance.</Text>
                  <Text style={styles.noteText}>Bonus payouts are not enabled for this commitment.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Habit name</Text>
                    <TextInput accessibilityLabel="Habit name" editable={!busy} maxLength={80} onChangeText={setTitle} placeholder="e.g. Read before bed" placeholderTextColor={palette.muted} style={styles.input} value={title} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Category</Text>
                    <Pressable accessibilityLabel={"Category: " + category} accessibilityRole="button" accessibilityState={{ expanded: categoryOpen }} aria-expanded={categoryOpen} onPress={() => setCategoryOpen(!categoryOpen)} style={styles.categoryButton}>
                      <MaterialCommunityIcons name={categoryIcons[category]} size={27} color={palette.link} />
                      <Text style={[styles.inputText, styles.flex]}>{category}</Text>
                      <MaterialCommunityIcons name={categoryOpen ? "chevron-up" : "chevron-down"} size={22} color={palette.muted} />
                    </Pressable>
                    {categoryOpen ? (
                      <View style={styles.categoryMenu}>
                        {habitCategories.map((item) => (
                          <Pressable key={item} accessibilityLabel={item} accessibilityRole="radio" accessibilityState={{ checked: category === item }} aria-checked={category === item} onPress={() => { setCategory(item); setCategoryOpen(false); }} style={styles.categoryOption}>
                            <Text style={styles.inputText}>{item}</Text>
                            {category === item ? <MaterialCommunityIcons name="check" size={20} color={palette.green} /> : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Target</Text>
                    <TextInput accessibilityLabel="Target" maxLength={120} onChangeText={setTarget} placeholder="What counts as done?" placeholderTextColor={palette.muted} style={styles.input} value={target} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>My pledge</Text>
                    <TextInput accessibilityLabel="Pledge" multiline maxLength={500} onChangeText={setPledge} placeholder="I pledge to…" placeholderTextColor={palette.muted} style={[styles.input, styles.multiline]} textAlignVertical="top" value={pledge} />
                    <Text style={styles.counter}>{pledge.length}/500</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Repeat</Text>
                    <View style={styles.segmented}>
                      {([{ label: "Daily", custom: false, icon: "calendar-month-outline" }, { label: "Choose days", custom: true, icon: "calendar-blank-outline" }] as const).map((item) => (
                        <Pressable key={item.label} accessibilityLabel={item.label} accessibilityRole="radio" accessibilityState={{ checked: chooseDays === item.custom }} aria-checked={chooseDays === item.custom} onPress={() => setChooseDays(item.custom)} style={[styles.segment, chooseDays === item.custom && styles.segmentSelected]}>
                          <MaterialCommunityIcons name={item.icon} size={22} color={palette.muted} />
                          <Text style={[styles.segmentLabel, chooseDays === item.custom && styles.segmentLabelSelected]}>{item.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {chooseDays ? (
                      <>
                        <View style={styles.weekdays}>
                          {weekdayLabels.map((day, index) => {
                            const selected = customWeekdays.includes(index + 1);
                            return <Pressable key={day} accessibilityLabel={day} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} aria-checked={selected} onPress={() => setCustomWeekdays((current) => selected ? current.filter((value) => value !== index + 1) : [...current, index + 1].sort((a, b) => a - b))} style={[styles.weekday, selected && styles.weekdaySelected]}><Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>{day}</Text></Pressable>;
                          })}
                        </View>
                        <Text style={styles.caption}>Only selected days are charged. Rest days keep your streak and carry no penalty.</Text>
                      </>
                    ) : null}
                  </View>
                </>
              )}
              <InfoNote>You'll log your action and reflect each scheduled day.</InfoNote>
            </>
          ) : (
            <>
              <View style={styles.habitSummary}>
                <MaterialCommunityIcons name={icon} size={35} color={palette.text} />
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{title}</Text>
                  <Text style={styles.caption}>{category} · {cadence}</Text>
                </View>
              </View>
              <View style={styles.field}>
                <View style={styles.dates}>
                  <View style={styles.dateColumn}>
                    <Text style={styles.label}>Start date</Text>
                    <HabitDateField label="Habit start date" minimumDayKey={todayDayKey} disabled={busy} value={startDayKey} onChange={(dayKey) => { setStartDayKey(dayKey); if (dayKey && endDayKey <= dayKey) setEndDayKey(addDays(dayKey, 5)); }} />
                  </View>
                  <View style={styles.dateColumn}>
                    <Text style={styles.label}>End date</Text>
                    <HabitDateField label="Habit end date" minimumDayKey={addDays(startDayKey, 1)} disabled={busy} value={endDayKey} onChange={setEndDayKey} />
                  </View>
                </View>
                <Text style={styles.caption}>End date not included{pledgeSchedule ? " · " + pledgeSchedule.dayCount + " scheduled reflections" : ""}</Text>
                <Text style={styles.caption}>Time zone: {timeZone}{chooseDays ? " · " + weekdays.map((day) => weekdayLabels[day - 1]).join(", ") : ""}</Text>
                {startDayKey && startDayKey < todayDayKey ? <Text style={styles.error}>Choose a start date from today onwards.</Text> : null}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>RDM per day</Text>
                <View style={styles.stepper}>
                  <Pressable accessibilityLabel="Decrease daily RDM" accessibilityRole="button" disabled={busy || numericDailyPledge <= 1} onPress={() => setDailyRdm(String(Math.max(1, numericDailyPledge - 1)))} style={[styles.stepperButton, (busy || numericDailyPledge <= 1) && styles.disabled]}>
                    <MaterialCommunityIcons name="minus" size={24} color={palette.text} />
                  </Pressable>
                  <TextInput accessibilityLabel="RDM pledge per day" editable={!busy} keyboardType="number-pad" maxLength={6} selectTextOnFocus onChangeText={(value) => setDailyRdm(value.replace(/[^0-9]/g, ""))} style={styles.rdmInput} value={dailyRdm} />
                  <Pressable accessibilityLabel="Increase daily RDM" accessibilityRole="button" disabled={busy || numericDailyPledge >= 100000} onPress={() => setDailyRdm(String(Math.min(100000, numericDailyPledge + 1)))} style={[styles.stepperButton, (busy || numericDailyPledge >= 100000) && styles.disabled]}>
                    <MaterialCommunityIcons name="plus" size={24} color={palette.text} />
                  </Pressable>
                </View>
                <Text style={styles.caption}>Minimum 1 RDM per scheduled day.</Text>
              </View>
              <View style={[styles.summary, wisdomPractice && styles.summaryWisdom]}>
                <Text style={[styles.label, styles.summaryHeading]}>Pledge summary</Text>
                <View style={styles.summaryRow}><Text style={styles.subtitle}>{pledgeSchedule ? pledgeSchedule.dayCount + " days × " + formatRdm(numericDailyPledge) + " RDM" : "Scheduled days × daily RDM"}</Text><Text style={styles.amount}>{pledgeSchedule ? formatRdm(pledgeSchedule.totalPledge) + " RDM" : "—"}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.subtitle}>Total pledge</Text><Text style={styles.amount}>{pledgeSchedule ? formatRdm(pledgeSchedule.totalPledge) + " RDM" : "—"}</Text></View>
                <View style={styles.divider} />
                <View style={styles.summaryRow}><Text style={styles.subtitle}>Base available</Text><Text style={styles.amount}>{availableBase !== undefined ? formatRdm(availableBase) + " RDM" : "Checking…"}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.subtitle}>Base after pledge</Text><Text style={[styles.amount, availableBase !== undefined && pledgeSchedule && !canAfford && styles.error]}>{availableBase !== undefined && pledgeSchedule ? formatRdm(availableBase - pledgeSchedule.totalPledge) + " RDM" : "—"}</Text></View>
                {wallet.error ? <Pressable accessibilityRole="button" onPress={() => void wallet.refetch()} style={styles.retry}><Text style={styles.error}>Unable to check your balance. Tap to retry.</Text></Pressable>
                  : availableBase !== undefined && pledgeSchedule && !canAfford ? <Text style={styles.error}>You need {formatRdm(pledgeSchedule.totalPledge - availableBase)} more Base RDM for this pledge. Reduce the daily amount or shorten the schedule.</Text> : null}
                {!pledgeSchedule || numericDailyPledge > 100000 ? <Text style={styles.error}>Choose valid dates within 365 days, at least one scheduled day, and 1–100,000 RDM per day.</Text> : null}
                {pledgeSchedule && pledgeSchedule.totalPledge > 100000 ? <Text style={styles.error}>The total pledge must be 100,000 RDM or less.</Text> : null}
              </View>
              <InfoNote card>Completed days → Reward.{"\n"}Missed days → Remorse.{wisdomPractice ? "\nBonus payouts are not enabled." : ""}</InfoNote>
            </>
          )}
        </ScrollView>
        <View style={styles.footer}>
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          <FocusedButton
            label={step === 1 ? "Continue to schedule" : wisdomPractice ? "Review commitment" : "Lock " + (pledgeSchedule ? formatRdm(pledgeSchedule.totalPledge) : "—") + " RDM & create habit"}
            loading={busy}
            disabled={step === 2 && (wallet.isLoading || Boolean(wallet.error) || !canAfford || startDayKey < todayDayKey || numericDailyPledge > 100000 || (pledgeSchedule?.totalPledge ?? 0) > 100000)}
            onPress={step === 1 ? continueToSchedule : () => submit()}
          />
        </View>
      </KeyboardAvoidingView>
      {wisdomPractice ? (
        <Modal animationType="slide" transparent visible={confirmOpen} onRequestClose={() => { if (!createHabit.isPending) setConfirmOpen(false); }}>
          <View style={styles.modalBackdrop}>
            <Pressable accessibilityLabel="Go back to schedule" accessibilityRole="button" disabled={createHabit.isPending} onPress={() => setConfirmOpen(false)} style={StyleSheet.absoluteFill} />
            <View accessibilityViewIsModal role="dialog" aria-modal style={styles.confirmSheet}>
              <ScrollView style={styles.flex} contentContainerStyle={[styles.confirmContent, { paddingBottom: Math.max(insets.bottom, 16) }]} keyboardShouldPersistTaps="handled">
                <View style={styles.sheetHandle} />
                <Text accessibilityRole="header" style={styles.confirmTitle}>Confirm {wisdomPractice.title}</Text>

                <View style={styles.confirmRows}>
                  <View style={styles.confirmRow}><Text style={styles.subtitle}>Start</Text><Text style={styles.amount}>{startDayKey}</Text></View>
                  <View style={styles.confirmRow}><Text style={styles.subtitle}>End</Text><Text style={styles.amount}>{endDayKey} (excluded)</Text></View>
                  <View style={styles.confirmRow}><Text style={styles.subtitle}>Daily pledge</Text><Text style={styles.amount}>{formatRdm(numericDailyPledge)} RDM</Text></View>
                </View>
                <View style={styles.divider} />
                <View style={styles.confirmRow}><Text style={styles.confirmTotalLabel}>{pledgeSchedule?.dayCount ?? 0} days · Total {formatRdm(pledgeSchedule?.totalPledge ?? 0)} RDM</Text></View>
                <View style={styles.confirmRow}><Text style={styles.subtitle}>Base after pledge</Text><Text style={styles.confirmTotalLabel}>{availableBase !== undefined && pledgeSchedule ? formatRdm(availableBase - pledgeSchedule.totalPledge) + " RDM" : "—"}</Text></View>
                <View style={styles.divider} />
                <View style={styles.confirmRow}><Text style={styles.subtitle}>Timezone</Text><Text style={styles.amount}>{timeZone}</Text></View>

                <InfoNote>Daily check-in + reflection → Reward.{"\n"}Missed day → Remorse.</InfoNote>
                <InfoNote>Bonus payouts are not enabled.</InfoNote>

                <FocusedButton label={"Lock " + formatRdm(pledgeSchedule?.totalPledge ?? 0) + " RDM & start"} loading={createHabit.isPending} onPress={() => submit(true)} style={styles.confirmPrimary} />
                <Pressable accessibilityRole="button" disabled={createHabit.isPending} onPress={() => setConfirmOpen(false)} style={styles.outlineButton}>
                  <Text style={styles.outlineLabel}>Go back</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 10 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 25, flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 16, gap: 15 },
  scheduleContent: { gap: 11 },
  intro: { gap: 3, marginBottom: 2 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 27 },
  subtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  caption: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  field: { gap: 7 },
  label: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  input: { minHeight: 45, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, color: palette.text, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: 14, paddingVertical: 10 },
  inputText: { color: palette.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  multiline: { minHeight: 80, lineHeight: 22 },
  counter: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, textAlign: "right" },
  categoryButton: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  categoryMenu: { borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, paddingHorizontal: 14 },
  categoryOption: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  segmented: { flexDirection: "row", borderWidth: 1, borderColor: palette.line, borderRadius: 8, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 6 },
  segmentSelected: { backgroundColor: "#263541" },
  segmentLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 14 },
  segmentLabelSelected: { color: palette.text },
  weekdays: { flexDirection: "row", flexWrap: "wrap", gap: 5, paddingTop: 3 },
  weekday: { minWidth: 40, minHeight: 44, borderWidth: 1, borderColor: palette.line, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  weekdaySelected: { backgroundColor: palette.green, borderColor: palette.green },
  weekdayText: { color: palette.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  weekdayTextSelected: { color: palette.onGreen },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  noteText: { flex: 1, color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 19 },
  noteCard: { padding: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, borderRadius: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 10 },
  practiceCard: { padding: 16, borderWidth: 1, borderColor: palette.line, borderRadius: 8, gap: 12 },
  practiceHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  practiceIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(183, 136, 241, 0.14)", borderWidth: 1, borderColor: "rgba(183, 136, 241, 0.3)", alignItems: "center", justifyContent: "center" },
  practiceDescriptionBox: { gap: 6, padding: 12, borderRadius: 8, backgroundColor: "#0E1620", borderWidth: 1, borderColor: palette.line },
  summaryWisdom: { borderWidth: 1, borderTopWidth: 1, borderColor: "rgba(183, 136, 241, 0.3)", backgroundColor: "rgba(183, 136, 241, 0.06)", borderRadius: 12, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 14, marginTop: 4 },
  cardTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22 },
  habitSummary: { minHeight: 66, padding: 14, gap: 18, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, flexDirection: "row", alignItems: "center" },
  dates: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  dateColumn: { flex: 1, minWidth: 150, gap: 7 },
  stepper: { flexDirection: "row", alignItems: "center", minHeight: 48, borderWidth: 1, borderColor: palette.line, borderRadius: 8, padding: 3 },
  stepperButton: { minWidth: 64, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#222E38", borderRadius: 5 },
  rdmInput: { flex: 1, minWidth: 0, textAlign: "center", color: palette.text, fontFamily: fonts.bodyBold, fontSize: 20, paddingVertical: 6 },
  summary: { borderTopWidth: 1, borderColor: palette.line, paddingTop: 14, gap: 5 },
  summaryHeading: { marginBottom: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  amount: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  divider: { borderTopWidth: 1, borderColor: palette.line, marginVertical: 3 },
  retry: { minHeight: 44, justifyContent: "center" },
  error: { color: palette.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.4 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.6)" },
  confirmSheet: { width: "100%", maxWidth: 480, maxHeight: "88%", backgroundColor: palette.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  confirmContent: { paddingHorizontal: 20, paddingTop: 10, alignItems: "center", gap: 10 },
  sheetHandle: { width: 46, height: 4, borderRadius: 99, backgroundColor: palette.line, marginBottom: 6 },
  confirmTitle: { width: "100%", color: palette.text, fontFamily: fonts.bodyBold, fontSize: 23, lineHeight: 30, marginBottom: 4 },
  confirmRows: { width: "100%", gap: 2 },
  confirmRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9 },
  confirmTotalLabel: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22 },
  confirmPrimary: { width: "100%", marginTop: 8 },
  outlineButton: { width: "100%", minHeight: 54, borderWidth: 1, borderColor: palette.line, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  outlineLabel: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 23 },
});
