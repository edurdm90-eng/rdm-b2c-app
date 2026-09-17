import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { focusedColors } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";

export interface HabitDateFieldProps {
  label: string;
  value: string;
  minimumDayKey: string;
  onChange: (dayKey: string) => void;
  disabled?: boolean;
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabels = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateToDayKey(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDayKey(dayKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const date = new Date(`${dayKey}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateToDayKey(date) === dayKey ? date : null;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0);
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// Grid is Monday-first: shift Sunday (0) to the end of the week.
function leadingBlankCount(date: Date) {
  return (date.getDay() + 6) % 7;
}

function sameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function MonthCalendar({
  selectedDate,
  minimumDate,
  viewDate,
  onSelect,
  onChangeMonth,
}: {
  selectedDate: Date | null;
  minimumDate: Date;
  viewDate: Date;
  onSelect: (date: Date) => void;
  onChangeMonth: (date: Date) => void;
}) {
  const monthStart = startOfMonth(viewDate);
  const total = daysInMonth(monthStart);
  const blanks = leadingBlankCount(monthStart);
  const cells: (Date | null)[] = [...Array(blanks).fill(null), ...Array.from({ length: total }, (_, index) => new Date(monthStart.getFullYear(), monthStart.getMonth(), index + 1, 12, 0, 0))];
  const minimumMonth = startOfMonth(minimumDate);
  const prevDisabled = monthStart.getFullYear() === minimumMonth.getFullYear() && monthStart.getMonth() <= minimumMonth.getMonth();

  return (
    <View style={styles.calendar}>
      <View style={styles.calendarHeader}>
        <Pressable accessibilityLabel="Previous month" accessibilityRole="button" disabled={prevDisabled} onPress={() => onChangeMonth(addMonths(monthStart, -1))} style={[styles.monthNav, prevDisabled && styles.disabled]}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={focusedColors.text} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabels[monthStart.getMonth()]} {monthStart.getFullYear()}</Text>
        <Pressable accessibilityLabel="Next month" accessibilityRole="button" onPress={() => onChangeMonth(addMonths(monthStart, 1))} style={styles.monthNav}>
          <MaterialCommunityIcons name="chevron-right" size={22} color={focusedColors.text} />
        </Pressable>
      </View>
      <View style={styles.weekdayRow}>
        {weekdayLabels.map((day) => <Text key={day} style={styles.weekdayLabel}>{day}</Text>)}
      </View>
      <View style={styles.grid}>
        {cells.map((date, index) => {
          if (!date) return <View key={"blank-" + index} style={styles.cell} />;
          const dayKey = dateToDayKey(date);
          const isDisabled = dayKey < dateToDayKey(minimumDate);
          const isSelected = selectedDate ? dayKey === dateToDayKey(selectedDate) : false;
          return (
            <View key={dayKey} style={styles.cell}>
              <Pressable
                accessibilityLabel={date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                accessibilityRole="button"
                accessibilityState={{ disabled: isDisabled, selected: isSelected }}
                disabled={isDisabled}
                onPress={() => onSelect(date)}
                style={({ pressed }) => [styles.day, isSelected && styles.daySelected, pressed && !isDisabled && styles.dayPressed]}
              >
                <Text style={[styles.dayLabel, isDisabled && styles.dayLabelDisabled, isSelected && styles.dayLabelSelected]}>{date.getDate()}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function HabitDateField({ label, value, minimumDayKey, onChange, disabled = false }: HabitDateFieldProps) {
  const [open, setOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const [viewDate, setViewDate] = useState<Date | null>(null);
  const insets = useSafeAreaInsets();
  const selectedDate = parseDayKey(value);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const minimumDate = parseDayKey(minimumDayKey) ?? today;

  function openPicker() {
    if (disabled) return;
    setPendingDate(selectedDate);
    setViewDate(startOfMonth(selectedDate ?? minimumDate));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setPendingDate(null);
    setViewDate(null);
  }

  function confirm() {
    if (!disabled && pendingDate) onChange(dateToDayKey(pendingDate));
    close();
  }

  return (
    <>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open && !disabled }}
        accessibilityValue={{ text: selectedDate ? selectedDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Choose date" }}
        disabled={disabled}
        onPress={openPicker}
        style={({ pressed }) => [styles.field, disabled && styles.disabled, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="calendar-month-outline" size={20} color={focusedColors.muted} />
        <Text style={styles.date} numberOfLines={1}>
          {selectedDate ? selectedDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Choose date"}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={focusedColors.muted} />
      </Pressable>
      <Modal animationType="slide" onRequestClose={close} transparent visible={open && !disabled}>
        <View style={styles.modal}>
          <Pressable accessible={false} onPress={close} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.toolbar}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Cancel ${label.toLowerCase()} selection`} onPress={close} style={styles.toolbarButton}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Confirm ${label.toLowerCase()}`}
                disabled={!pendingDate}
                onPress={confirm}
                style={styles.toolbarButton}
              >
                <Text style={[styles.done, !pendingDate && styles.doneDisabled]}>Done</Text>
              </Pressable>
            </View>
            {viewDate ? (
              <MonthCalendar
                selectedDate={pendingDate}
                minimumDate={minimumDate}
                viewDate={viewDate}
                onSelect={setPendingDate}
                onChangeMonth={setViewDate}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: focusedColors.line, borderRadius: 8, backgroundColor: focusedColors.panel, paddingHorizontal: 10 },
  date: { flex: 1, color: focusedColors.text, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.8 },
  modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.6)" },
  sheet: { backgroundColor: focusedColors.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 12, alignItems: "center" },
  sheetHandle: { width: 46, height: 4, borderRadius: 99, backgroundColor: focusedColors.line, marginTop: 10, marginBottom: 4 },
  toolbar: { width: "100%", minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: focusedColors.line },
  toolbarButton: { minHeight: 48, minWidth: 64, alignItems: "center", justifyContent: "center" },
  sheetTitle: { flex: 1, textAlign: "center", color: focusedColors.text, fontFamily: fonts.bodyMedium, fontSize: 16 },
  cancel: { color: focusedColors.muted, fontFamily: fonts.bodyMedium, fontSize: 15 },
  done: { color: focusedColors.green, fontFamily: fonts.bodyBold, fontSize: 15 },
  doneDisabled: { opacity: 0.4 },
  calendar: { width: "100%", paddingVertical: 14, gap: 14 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthNav: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  monthLabel: { color: focusedColors.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22 },
  weekdayRow: { flexDirection: "row" },
  weekdayLabel: { flex: 1, textAlign: "center", color: focusedColors.muted, fontFamily: fonts.body, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", paddingVertical: 2 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dayPressed: { backgroundColor: "rgba(255, 255, 255, 0.08)" },
  daySelected: { backgroundColor: focusedColors.link },
  dayLabel: { color: focusedColors.text, fontFamily: fonts.body, fontSize: 14.5 },
  dayLabelDisabled: { color: focusedColors.line },
  dayLabelSelected: { color: focusedColors.onGreen, fontFamily: fonts.bodyBold },
});
