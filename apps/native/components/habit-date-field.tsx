import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
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

export function HabitDateField({ label, value, minimumDayKey, onChange, disabled = false }: HabitDateFieldProps) {
  const [open, setOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const insets = useSafeAreaInsets();
  const selectedDate = parseDayKey(value);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const minimumDate = parseDayKey(minimumDayKey) ?? today;
  const pickerDate = new Date(Math.max((pendingDate ?? selectedDate ?? minimumDate).getTime(), minimumDate.getTime()));

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function close() {
    setOpen(false);
    setPendingDate(null);
  }

  const picker = (
    <DateTimePicker
      accessibilityLabel={label}
      display={Platform.OS === "ios" ? "spinner" : "default"}
      minimumDate={minimumDate}
      mode="date"
      themeVariant="dark"
      value={pickerDate}
      onChange={(event, date) => {
        if (disabled) return;
        if (event.type !== "set") {
          close();
          return;
        }
        if (!date || Number.isNaN(date.getTime()) || dateToDayKey(date) < dateToDayKey(minimumDate)) return;
        if (Platform.OS === "ios") {
          setPendingDate(parseDayKey(dateToDayKey(date)));
        } else {
          onChange(dateToDayKey(date));
          close();
        }
      }}
    />
  );

  return (
    <>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open && !disabled }}
        accessibilityValue={{ text: selectedDate ? selectedDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Choose date" }}
        disabled={disabled}
        onPress={() => {
          setPendingDate(null);
          setOpen(true);
        }}
        style={({ pressed }) => [styles.field, disabled && styles.disabled, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="calendar-month-outline" size={20} color={focusedColors.muted} />
        <Text style={styles.date} numberOfLines={1}>
          {selectedDate ? selectedDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Choose date"}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={focusedColors.muted} />
      </Pressable>
      {open && !disabled && Platform.OS !== "ios" ? picker : null}
      {Platform.OS === "ios" ? (
        <Modal animationType="fade" onRequestClose={close} transparent visible={open && !disabled}>
          <View style={styles.modal}>
            <Pressable accessible={false} onPress={close} style={StyleSheet.absoluteFill} />
            <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.toolbar}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Cancel ${label.toLowerCase()} selection`} onPress={close} style={styles.toolbarButton}>
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.sheetTitle}>{label}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm ${label.toLowerCase()}`}
                  onPress={() => {
                    if (!disabled) onChange(dateToDayKey(pickerDate));
                    close();
                  }}
                  style={styles.toolbarButton}
                >
                  <Text style={styles.done}>Done</Text>
                </Pressable>
              </View>
              {open && !disabled ? picker : null}
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: focusedColors.line, borderRadius: 8, backgroundColor: focusedColors.panel, paddingHorizontal: 10 },
  date: { flex: 1, color: focusedColors.text, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.8 },
  modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.6)" },
  sheet: { backgroundColor: focusedColors.panel, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 12 },
  toolbar: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: focusedColors.line },
  toolbarButton: { minHeight: 48, minWidth: 64, alignItems: "center", justifyContent: "center" },
  sheetTitle: { flex: 1, textAlign: "center", color: focusedColors.text, fontFamily: fonts.bodyMedium, fontSize: 16 },
  cancel: { color: focusedColors.muted, fontFamily: fonts.bodyMedium, fontSize: 15 },
  done: { color: focusedColors.green, fontFamily: fonts.bodyBold, fontSize: 15 },
});
