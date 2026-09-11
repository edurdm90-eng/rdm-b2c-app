import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { AppRouter } from "@rdm-b2c/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { focusedColors as palette } from "@/components/focused-ui";
import { WisdomProgress } from "@/components/wisdom-progress";
import { fonts, formatRdm } from "@/lib/theme";

type Habit = inferRouterOutputs<AppRouter>["rdm"]["habits"]["byId"];
type HistoryEntry = Habit["history"][number];
type HistoryDay = Omit<HistoryEntry, "outcome"> & { outcome: HistoryEntry["outcome"] | "pending" };
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function dateLabel(dayKey: string, full = false) {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString("en-IN", {
    ...(full ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: full ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function historyDays(habit: Habit, todayDayKey: string): HistoryDay[] {
  const entries = new Map<string, HistoryDay>(habit.history.map((entry) => [entry.dayKey, entry]));
  const completed = new Set([
    ...(habit.rdmPledge?.completedDayKeys ?? []),
    ...(habit.lastCompletedDayKey ? [habit.lastCompletedDayKey] : []),
    ...habit.history.filter((entry) => entry.outcome === "completed").map((entry) => entry.dayKey),
  ]);
  const settled = new Set([...(habit.rdmPledge?.settledDayKeys ?? []), ...completed]);

  for (const dayKey of settled) {
    const saved = entries.get(dayKey);
    entries.set(dayKey, {
      dayKey,
      outcome: completed.has(dayKey) ? "completed" : "missed",
      note: saved?.note ?? null,
      reflection: saved?.reflection ?? null,
      settledAt: saved?.settledAt ?? null,
    });
  }

  const pendingToday = habit.active && (habit.rdmPledge
    ? habit.rdmPledge.scheduledToday && !habit.rdmPledge.settledToday && habit.rdmPledge.status === "active"
    : habit.stage === "act" || habit.stage === "reflect");
  if (pendingToday && !entries.has(todayDayKey)) {
    entries.set(todayDayKey, { dayKey: todayDayKey, outcome: "pending", note: habit.lastAction, reflection: null, settledAt: null });
  }
  return [...entries.values()].sort((left, right) => right.dayKey.localeCompare(left.dayKey));
}

function Metric({ icon, color = palette.muted, title, value, detail }: {
  icon: IconName;
  color?: string;
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <View style={styles.metric}>
      <MaterialCommunityIcons name={icon} color={color} size={27} />
      <View style={styles.metricCopy}>
        <Text style={styles.label}>{title}</Text>
        {detail ? <Text style={styles.caption}>{detail}</Text> : null}
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function HabitHistory({ habit, todayDayKey, canOpenToday, canMissToday, onOpenToday, onMissToday }: {
  habit: Habit;
  todayDayKey: string;
  canOpenToday: boolean;
  canMissToday: boolean;
  onOpenToday: () => void;
  onMissToday: () => void;
}) {
  const [tab, setTab] = useState<"history" | "insights">("history");
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const rows = historyDays(habit, todayDayKey);
  const completedCount = rows.filter((entry) => entry.outcome === "completed").length;
  const missedCount = rows.filter((entry) => entry.outcome === "missed").length;
  const pledge = habit.rdmPledge;
  const remainingDays = pledge ? Math.max(0, pledge.dayCount - new Set(pledge.settledDayKeys).size) : null;
  const wisdom = habit.wisdom;

  function renderHistoryDay(entry: HistoryDay) {
    const pending = entry.outcome === "pending";
    const completed = entry.outcome === "completed";
    const expanded = entry.dayKey === expandedDayKey && !pending;
    const amount = pledge?.perDay ?? 25;
    const title = pending ? habit.stage === "reflect" ? "Ready to reflect" : "Pending" : completed ? "Completed" : "Missed";
    const subtitle = pending
      ? habit.stage === "reflect" ? "Action saved. Add your reflection." : "No action logged yet."
      : completed ? `+${formatRdm(amount)} RDM to Reward`
        : pledge ? `${formatRdm(amount)} RDM to Remorse` : "Allocation to Remorse";
    const color = pending ? palette.muted : completed ? palette.green : palette.coral;

    return (
      <View key={entry.dayKey} style={styles.dayGroup}>
        <Text style={styles.dayLabel}>{dateLabel(entry.dayKey, true)}</Text>
        <View style={styles.historyCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${dateLabel(entry.dayKey, true)}. ${title}. ${subtitle}. ${pending ? "Open today" : expanded ? "Hide saved entry" : "View saved entry"}`}
            accessibilityState={{ disabled: pending && !canOpenToday, ...(pending ? {} : { expanded }) }}
            aria-expanded={pending ? undefined : expanded}
            disabled={pending && !canOpenToday}
            onPress={() => pending ? onOpenToday() : setExpandedDayKey(expanded ? null : entry.dayKey)}
            style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name={pending ? "clock-outline" : completed ? "check-circle" : "close-circle"} color={color} size={31} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{title}</Text>
              <Text style={[styles.caption, !pending && { color }]}>{subtitle}</Text>
            </View>
            <MaterialCommunityIcons name={expanded ? "chevron-down" : "chevron-right"} color={palette.muted} size={21} />
          </Pressable>
          {expanded ? (
            <View style={styles.entryDetail}>
              <Text style={styles.detailLabel}>{habit.wisdomPracticeId ? "Your practice check-in" : "Your action"}</Text>
              <Text style={styles.detailBody}>{entry.note ?? "No action note saved for this day."}</Text>
              <Text style={styles.detailLabel}>Your reflection</Text>
              <Text style={styles.detailBody}>{entry.reflection ?? "No reflection saved for this day."}</Text>
              <Text style={styles.readOnly}>{completed ? "This day's reflection and reward are already recorded." : "This missed day is already recorded."} Saved entries cannot be changed here.</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {(["history", "insights"] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === option }}
            aria-selected={tab === option}
            onPress={() => setTab(option)}
            style={[styles.tab, tab === option && styles.tabSelected]}
          >
            <Text style={[styles.tabText, tab === option && styles.tabTextSelected]}>{option === "history" ? "History" : "Insights"}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "history" ? (
        <View style={styles.history}>
          {rows.length ? rows.slice(0, showAll ? undefined : 7).map(renderHistoryDay) : (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="history" color={palette.muted} size={29} />
              <Text style={styles.rowTitle}>Your history starts here.</Text>
              <Text style={styles.detailBody}>{pledge?.status === "upcoming"
                ? `Your commitment starts on ${dateLabel(pledge.nextDayKey ?? pledge.startDayKey)}.`
                : pledge && !pledge.scheduledToday && pledge.status !== "finished"
                  ? "Today is a rest day. Your scheduled check-ins and reflections will appear here."
                  : "Saved actions, daily reflections, and settled missed days will appear here."}</Text>
            </View>
          )}
          {rows.length > 7 ? (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAll }} aria-expanded={showAll} onPress={() => setShowAll((current) => !current)} style={styles.textButton}>
              <Text style={styles.link}>{showAll ? "Show recent days" : `Show all ${rows.length} days`}</Text>
              <MaterialCommunityIcons name={showAll ? "chevron-up" : "chevron-down"} color={palette.link} size={20} />
            </Pressable>
          ) : null}
          {canMissToday ? (
            <Pressable accessibilityRole="button" onPress={onMissToday} style={styles.missButton}>
              <Text style={styles.link}>I missed today</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.insights}>
          <Text style={styles.sectionTitle}>Your progress</Text>
          <View>
            <Metric icon="fire" color={palette.gold} title="Current streak" value={`${habit.streak} ${habit.streak === 1 ? "day" : "days"}`} detail="Completed scheduled reflections" />
            <Metric icon="check-circle-outline" color={palette.green} title="Reflections" value={pledge ? `${completedCount} of ${pledge.dayCount}` : `${completedCount}`} detail="Saved completed days" />
            <Metric icon="close-circle-outline" color={palette.coral} title="Missed days" value={`${missedCount}`} detail="Settled to Remorse" />
            {pledge ? <Metric icon="chart-donut" color={palette.link} title="Remaining pledge" value={`${formatRdm(pledge.remaining)} RDM`} detail={`${remainingDays} scheduled ${remainingDays === 1 ? "day" : "days"} remaining`} /> : null}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Your commitment</Text>
            <Text style={styles.detailLabel}>Target</Text>
            <Text style={styles.detailBody}>{habit.target}</Text>
            <Text style={styles.detailLabel}>My pledge</Text>
            <Text style={styles.detailBody}>{habit.pledge}</Text>
            <Text style={styles.detailLabel}>Repeat</Text>
            <Text style={styles.detailBody}>{habit.cadence}{pledge && pledge.weekdays.length < 7 ? ` · ${pledge.weekdays.map((day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day - 1]).join(", ")}` : ""}</Text>
            {pledge ? (
              <>
                <Text style={styles.detailLabel}>Schedule & pledge</Text>
                <Text style={styles.detailBody}>{dateLabel(pledge.startDayKey)} → {dateLabel(pledge.endDayKey)}</Text>
                <Text style={styles.caption}>End date not included · {pledge.dayCount} scheduled days</Text>
                <Text style={styles.detailBody}>{formatRdm(pledge.perDay)} RDM per scheduled day · {formatRdm(pledge.total)} RDM total pledge</Text>
                <Text style={styles.caption}>Saved time zone: {pledge.timeZone}</Text>
                <Text style={styles.caption}>{pledge.status === "finished" ? "Every scheduled day is settled. This commitment is finished."
                  : pledge.nextDayKey ? `Next unsettled day: ${dateLabel(pledge.nextDayKey)}.` : "All scheduled days have been settled."}</Text>
              </>
            ) : <Text style={styles.caption}>This is a legacy commitment without a scheduled locked pledge.</Text>}
          </View>

          {wisdom ? (
            <View style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Practice consistency</Text>
              <WisdomProgress wisdom={wisdom} showRemaining textStyle={styles.detailBody} />
              <Text style={styles.detailBody}>{wisdom.consistencyStatus === "perfect" ? "Perfect consistency—every day reflected."
                : wisdom.consistencyStatus === "missed" ? wisdom.unresolvedDays > 0
                  ? "Your progress is saved. Keep reflecting on the remaining days."
                  : "All daily allocations are settled. Your completed and missed days are saved in History."
                  : wisdom.consistencyStatus === "upcoming" ? "Your practice starts on the confirmed date."
                    : wisdom.consistencyStatus === "pending_funding" ? "Funding confirmation is pending."
                      : "Consistency is recorded across the entire confirmed schedule."}</Text>
              <Text style={styles.caption}>Completion is based on an honest check-in and reflection, not food quantity, calories, or weight.</Text>
              <Text style={styles.caption}>Bonus payouts are not enabled for this commitment. Your daily pledge allocations are settled only once.</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18 },
  tabs: { flexDirection: "row", borderWidth: 1, borderColor: palette.line, borderRadius: 9, padding: 3, gap: 3 },
  tab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  tabSelected: { backgroundColor: "#263541" },
  tabText: { color: palette.muted, fontFamily: fonts.body, fontSize: 14 },
  tabTextSelected: { color: palette.text, fontFamily: fonts.bodyMedium },
  history: { gap: 18 },
  dayGroup: { gap: 6 },
  dayLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  historyCard: { borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel },
  historyRow: { minHeight: 62, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 14 },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  caption: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  entryDetail: { marginHorizontal: 14, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 14, paddingBottom: 16, gap: 7 },
  detailLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  detailBody: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  readOnly: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 6 },
  emptyCard: { padding: 18, borderWidth: 1, borderColor: palette.line, borderRadius: 8, gap: 12 },
  textButton: { minHeight: 44, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  missButton: { minHeight: 52, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: palette.line, marginTop: 2 },
  link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 14 },
  insights: { gap: 18 },
  sectionTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23 },
  metric: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.line },
  metricCopy: { flex: 1, minWidth: 0, gap: 4 },
  metricValue: { maxWidth: "42%", color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, textAlign: "right" },
  label: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  infoCard: { padding: 16, gap: 9, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.panel },
  pressed: { opacity: 0.75 },
});
