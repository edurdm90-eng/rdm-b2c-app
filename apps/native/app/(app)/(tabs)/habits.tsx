import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { dayKeyForTimeZone, habitWeekProgress } from "@rdm-b2c/api/domain/rdm";
import type { AppRouter } from "@rdm-b2c/api/routers/index";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { LinearGradient } from "expo-linear-gradient";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FocusedButton, FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { ErrorState, LoadingState } from "@/components/rdm-ui";
import { fonts, formatRdm } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { trpc } from "@/utils/trpc";

type Habit = inferRouterOutputs<AppRouter>["rdm"]["habits"]["list"][number];
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type DayState = "completed" | "missed" | "pending" | "not-recorded" | "rest";
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateLabel(dayKey: string) {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function habitDayState(habit: Habit, dayKey: string, now: Date): DayState {
  const pledge = habit.rdmPledge;
  if (pledge?.completedDayKeys.includes(dayKey) || habit.lastCompletedDayKey === dayKey) return "completed";
  const history = habit.history.find((entry) => entry.dayKey === dayKey);
  if (history) return history.outcome;
  if (!pledge) {
    return habit.active && dayKey === dayKeyForTimeZone(now, "Asia/Kolkata") ? "pending" : "rest";
  }
  const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay() || 7;
  if (dayKey < pledge.startDayKey || dayKey >= pledge.endDayKey || !pledge.weekdays.includes(weekday)) return "rest";
  if (pledge.settledDayKeys.includes(dayKey)) return "missed";
  if (dayKey < dayKeyForTimeZone(now, pledge.timeZone)) return "not-recorded";
  return habit.active ? "pending" : "not-recorded";
}

function habitColor(habit: Habit) {
  if (habit.wisdomPracticeId) return palette.purple;
  if (habit.category === "Focus") return palette.link;
  if (habit.category === "Money") return palette.gold;
  return palette.green;
}

function openHabit(habit: Habit) {
  router.push({ pathname: "/(app)/habit/[id]", params: { id: habit.id } });
}

function NoHabitsYet() {
  return (
    <FocusedScreen scroll={false} contentStyle={styles.emptyScreenContent}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Habits</Text>
        <Pressable accessibilityLabel="Create a habit" accessibilityRole="button" onPress={() => router.push("/(app)/framework")} style={({ pressed }) => [styles.plusButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons color={palette.text} name="plus" size={30} />
        </Pressable>
      </View>
      <View style={styles.emptyState}>
        <LinearGradient colors={["rgba(56, 214, 147, 0.2)", "rgba(56, 214, 147, 0.03)"]} style={styles.emptyIcon}>
          <MaterialCommunityIcons color={palette.green} name="sprout" size={56} />
        </LinearGradient>
        <Text accessibilityRole="header" style={styles.emptyTitle}>Your first small step starts here.</Text>
        <Text style={styles.emptySubtitle}>Choose one habit you can return to each day.</Text>
      </View>
      <View style={styles.emptyActions}>
        <FocusedButton label="Explore habit framework" onPress={() => router.push("/(app)/framework")} />
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(app)/habit/new", params: { template: "custom" } })} style={({ pressed }) => [styles.emptySecondary, pressed && styles.pressed]}>
          <Text style={styles.emptySecondaryLabel}>Create my own habit</Text>
        </Pressable>
      </View>
    </FocusedScreen>
  );
}

export default function HabitsScreen() {
  const focused = useIsFocused();
  const habits = useQuery({
    ...trpc.rdm.habits.list.queryOptions(),
    enabled: focused,
    refetchInterval: focused ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const [view, setView] = useState<"today" | "all">("today");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [historySelection, setHistorySelection] = useState<{ habitId: string; dayKey: string } | null>(null);

  if (habits.isLoading) return <LoadingState label="Loading your habits…" />;
  if (habits.error || !habits.data) return <ErrorState message={habits.error?.message ?? "Habits are unavailable."} onRetry={() => void habits.refetch()} />;
  if (habits.data.length === 0) return <NoHabitsYet />;

  const now = new Date();
  const localToday = dayKeyForTimeZone(now, getDeviceTimeZone());
  const selectedDay = selectedDayKey ?? localToday;
  const week = habitWeekProgress([], localToday);
  // Today follows each commitment's saved zone, not the device's current zone.
  const dayForHabit = (habit: Habit) => selectedDayKey ?? dayKeyForTimeZone(now, habit.rdmPledge?.timeZone ?? "Asia/Kolkata");
  const stateForHabit = (habit: Habit) => habitDayState(habit, dayForHabit(habit), now);
  const pending = habits.data.filter((habit) => stateForHabit(habit) === "pending");
  const completed = habits.data.filter((habit) => stateForHabit(habit) === "completed");
  const missed = habits.data.filter((habit) => ["missed", "not-recorded"].includes(stateForHabit(habit)));
  const active = habits.data.filter((habit) => habit.active && (!habit.rdmPledge || habit.rdmPledge.status === "active"));
  const upcoming = habits.data.filter((habit) => habit.active && habit.rdmPledge?.status === "upcoming");
  const finished = habits.data.filter((habit) => !habit.active || habit.rdmPledge?.status === "finished");
  const historicalHabit = historySelection ? habits.data.find((habit) => habit.id === historySelection.habitId) : undefined;
  const historicalEntry = historicalHabit?.history.find((entry) => entry.dayKey === historySelection?.dayKey);
  const historicalState = historicalHabit && historySelection ? habitDayState(historicalHabit, historySelection.dayKey, now) : null;

  function renderHabit(habit: Habit, all = false) {
    const rowDay = dayForHabit(habit);
    const state = stateForHabit(habit);
    const currentDay = dayKeyForTimeZone(now, habit.rdmPledge?.timeZone ?? "Asia/Kolkata");
    const progress = habitWeekProgress(habit.rdmPledge?.completedDayKeys ?? habit.history.filter((entry) => entry.outcome === "completed").map((entry) => entry.dayKey), all ? currentDay : rowDay);
    const canOpenToday = all || selectedDayKey === null;
    const status = all
      ? habit.rdmPledge?.status === "upcoming" ? `Starts ${dateLabel(habit.rdmPledge.nextDayKey ?? habit.rdmPledge.startDayKey)}`
        : !habit.active || habit.rdmPledge?.status === "finished" ? "Finished commitment"
          : habit.rdmPledge && !habit.rdmPledge.scheduledToday ? "Rest day today" : null
      : state === "missed" ? "Missed · settled to Remorse"
        : state === "not-recorded" ? "No reflection recorded" : null;

    return (
      <Pressable
        accessibilityLabel={`${habit.title}, ${habit.streak} day streak${state === "completed" && !all ? ", completed" : ""}${canOpenToday ? ", open habit" : `, view ${dateLabel(rowDay)} record`}`}
        accessibilityRole="button"
        key={habit.id}
        onPress={() => canOpenToday ? openHabit(habit) : setHistorySelection({ habitId: habit.id, dayKey: rowDay })}
        style={({ pressed }) => [styles.habitRow, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons color={habitColor(habit)} name={habit.icon as IconName} size={31} />
        <View style={styles.habitCopy}>
          <Text style={styles.habitTitle}>{habit.title}</Text>
          <Text style={styles.habitMeta}>{habit.rdmPledge ? `${formatRdm(habit.rdmPledge.perDay)} RDM${habit.rdmPledge.weekdays.length < 7 ? "/scheduled day" : " per day"} · ` : ""}{habit.streak} day streak</Text>
          {status ? <Text style={[styles.status, state === "missed" && !all && styles.missedText]}>{status}</Text> : null}
        </View>
        <View style={styles.progressSide}>
          <View accessibilityLabel={progress.map((day) => `${dateLabel(day.dayKey)}: ${habitDayState(habit, day.dayKey, now)}`).join(", ")} style={styles.progressDots}>
            {habit.streak > 0 ? <MaterialCommunityIcons color={palette.gold} name="fire" size={16} /> : null}
            {progress.map((day) => {
              const dayState = habitDayState(habit, day.dayKey, now);
              return <View key={day.dayKey} style={[styles.dot, dayState === "completed" && styles.completedDot, dayState === "missed" && styles.missedDot, dayState === "rest" && styles.restDot]} />;
            })}
          </View>
          {!all && state === "completed"
            ? <MaterialCommunityIcons color={palette.green} name="check-circle" size={27} />
            : <MaterialCommunityIcons color={palette.muted} name="chevron-right" size={21} />}
        </View>
      </Pressable>
    );
  }

  function renderSection(title: string, items: Habit[], all = false, empty?: string) {
    if (!items.length && !empty) return null;
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        {items.length ? items.map((habit) => renderHabit(habit, all)) : <Text style={styles.emptyCopy}>{empty}</Text>}
      </View>
    );
  }

  return (
    <FocusedScreen contentStyle={styles.content}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Habits</Text>
        <Pressable accessibilityLabel="Create a habit" accessibilityRole="button" onPress={() => router.push("/(app)/framework")} style={({ pressed }) => [styles.plusButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons color={palette.text} name="plus" size={30} />
        </Pressable>
      </View>

      <View accessibilityRole="tablist" style={styles.toggle}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === "today" }} aria-selected={view === "today"} onPress={() => { setView("today"); setSelectedDayKey(null); }} style={[styles.toggleOption, view === "today" && styles.toggleActive]}>
          <Text style={[styles.toggleLabel, view === "today" && styles.toggleLabelActive]}>Today</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === "all" }} aria-selected={view === "all"} onPress={() => setView("all")} style={[styles.toggleOption, view === "all" && styles.toggleActive]}>
          <Text style={[styles.toggleLabel, view === "all" && styles.toggleLabelActive]}>All habits</Text>
        </Pressable>
      </View>

      {view === "today" ? (
        <>
          <View style={styles.week}>
            {week.map((day, index) => (
              <Pressable accessibilityLabel={`${weekdays[index]}, ${dateLabel(day.dayKey)}${day.dayKey === localToday ? ", today" : ""}`} accessibilityRole="button" accessibilityState={{ selected: selectedDay === day.dayKey }} aria-pressed={selectedDay === day.dayKey} key={day.dayKey} onPress={() => setSelectedDayKey(day.dayKey === localToday ? null : day.dayKey)} style={styles.day}>
                <Text style={[styles.weekday, day.dayKey === localToday && styles.todayLabel]}>{weekdays[index]}</Text>
                <View style={[styles.dayNumber, day.dayKey === selectedDay && styles.selectedDay, day.dayKey === localToday && day.dayKey !== selectedDay && styles.todayOutline]}>
                  <Text style={[styles.dayNumberLabel, day.dayKey === selectedDay && styles.selectedDayLabel]}>{Number(day.dayKey.slice(-2))}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          {selectedDayKey !== null ? <Text style={styles.calendarNotice}>{dateLabel(selectedDay)} · Saved records and schedule only. Daily actions use each habit’s current day.</Text> : null}
          {renderSection(selectedDayKey && selectedDayKey > localToday ? "Scheduled" : "To reflect", pending, false,
            completed.length && !missed.length ? "All reflections are complete for this day." : habits.data.length ? "No habits are awaiting reflection for this day. Find all commitments in All habits." : "Start with one small action. Choose a habit to begin your routine.")}
          {renderSection("Completed", completed)}
          {renderSection("Missed or not recorded", missed)}
        </>
      ) : (
        <View style={styles.allSections}>
          {renderSection("Active habits", active, true, "No active habits. Choose one small action to begin.")}
          {renderSection("Upcoming", upcoming, true)}
          {renderSection("Finished commitments", finished, true)}
        </View>
      )}

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/framework")} style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons color={palette.muted} name="plus-circle-outline" size={23} />
          <Text style={styles.createLabel}>Create a habit</Text>
        </Pressable>
      </View>

      <Modal animationType="fade" onRequestClose={() => setHistorySelection(null)} transparent visible={Boolean(historicalHabit && historySelection)}>
        <View accessibilityViewIsModal style={styles.dialogOverlay}>
          <Pressable accessibilityLabel="Close saved day" accessibilityRole="button" onPress={() => setHistorySelection(null)} style={StyleSheet.absoluteFill} />
          <View style={styles.dialog}>
            <View style={styles.dialogHeading}>
              <Text accessibilityRole="header" style={styles.dialogTitle}>{historicalHabit?.title}</Text>
              <Pressable accessibilityLabel="Close saved day" accessibilityRole="button" onPress={() => setHistorySelection(null)} style={styles.closeButton}>
                <MaterialCommunityIcons color={palette.muted} name="close" size={23} />
              </Pressable>
            </View>
            <ScrollView style={styles.dialogScroll} contentContainerStyle={styles.dialogCopy}>
              <Text style={styles.habitMeta}>{historySelection ? dateLabel(historySelection.dayKey) : ""} · {historicalHabit?.rdmPledge?.timeZone ?? "Asia/Kolkata"}</Text>
              <Text style={styles.dialogState}>{historicalState === "completed" ? "Reflection completed" : historicalState === "missed" ? "Missed · allocation moved to Remorse" : historicalState === "pending" ? "Scheduled for this day" : "No reflection recorded"}</Text>
              {historicalEntry?.note ? <><Text style={styles.dialogLabel}>Action</Text><Text style={styles.dialogBody}>{historicalEntry.note}</Text></> : null}
              {historicalEntry?.reflection ? <><Text style={styles.dialogLabel}>Reflection</Text><Text style={styles.dialogBody}>{historicalEntry.reflection}</Text></> : null}
              <Text style={styles.dialogBody}>This day is read-only. Open the habit for its current daily action and full history.</Text>
            </ScrollView>
            <FocusedButton label="Open habit" onPress={() => { if (historicalHabit) openHabit(historicalHabit); setHistorySelection(null); }} />
          </View>
        </View>
      </Modal>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16 },
  emptyScreenContent: { flex: 1, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 8 },
  emptyIcon: { width: 132, height: 132, borderRadius: 34, borderWidth: 1, borderColor: "rgba(56, 214, 147, 0.28)", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 33, textAlign: "center", marginTop: 6 },
  emptySubtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 270 },
  emptyActions: { gap: 12, paddingTop: 12 },
  emptySecondary: { minHeight: 54, borderRadius: 10, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, alignItems: "center", justifyContent: "center" },
  emptySecondaryLabel: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 23 },
  heading: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 32, lineHeight: 40 },
  plusButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  toggle: { minHeight: 44, flexDirection: "row", borderWidth: 1, borderColor: palette.line, borderRadius: 11, padding: 3 },
  toggleOption: { flex: 1, minHeight: 38, justifyContent: "center", alignItems: "center", borderRadius: 8 },
  toggleActive: { backgroundColor: "#273642" },
  toggleLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 14 },
  toggleLabelActive: { color: palette.text, fontFamily: fonts.bodyBold },
  week: { flexDirection: "row", paddingTop: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: palette.line },
  day: { flex: 1, minHeight: 58, alignItems: "center", gap: 3 },
  weekday: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  todayLabel: { color: palette.green, fontFamily: fonts.bodyMedium },
  dayNumber: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  selectedDay: { backgroundColor: palette.green },
  todayOutline: { borderColor: palette.green },
  dayNumberLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 17 },
  selectedDayLabel: { color: palette.onGreen, fontFamily: fonts.bodyBold },
  calendarNotice: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 12 },
  allSections: { paddingTop: 2 },
  section: { marginTop: 20, borderBottomWidth: 1, borderBottomColor: palette.line },
  sectionTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 26, paddingBottom: 8 },
  habitRow: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: palette.line, paddingVertical: 13 },
  habitCopy: { flex: 1, minWidth: 0, gap: 4 },
  habitTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  habitMeta: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 },
  status: { color: palette.link, fontFamily: fonts.body, fontSize: 10, lineHeight: 15 },
  missedText: { color: palette.coral },
  progressSide: { alignItems: "center", flexDirection: "row", gap: 7 },
  progressDots: { flexDirection: "row", alignItems: "center", gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#3C4955" },
  completedDot: { backgroundColor: palette.green },
  missedDot: { backgroundColor: palette.coral },
  restDot: { backgroundColor: "transparent", borderWidth: 1, borderColor: palette.line },
  emptyCopy: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 21, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 17, paddingBottom: 12 },
  footer: { marginTop: "auto", paddingTop: 28 },
  createButton: { minHeight: 56, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.line, borderRadius: 9 },
  createLabel: { color: palette.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  pressed: { opacity: 0.75 },
  dialogOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.line, borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "80%", padding: 20, gap: 16 },
  dialogHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  dialogTitle: { flex: 1, color: palette.text, fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 26 },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  dialogScroll: { flexShrink: 1 },
  dialogCopy: { gap: 10 },
  dialogState: { color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  dialogLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, marginTop: 4 },
  dialogBody: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 21 },
});
