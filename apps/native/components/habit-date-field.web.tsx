import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { StyleSheet, View } from "react-native";

import { focusedColors } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";

export interface HabitDateFieldProps {
  label: string;
  value: string;
  minimumDayKey: string;
  onChange: (dayKey: string) => void;
  disabled?: boolean;
}

function validDayKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime())
    && String(date.getFullYear()).padStart(4, "0") === value.slice(0, 4)
    && date.getMonth() + 1 === Number(value.slice(5, 7))
    && date.getDate() === Number(value.slice(8, 10));
}

export function HabitDateField({ label, value, minimumDayKey, onChange, disabled = false }: HabitDateFieldProps) {
  const [focused, setFocused] = useState(false);
  const lastReportedValue = useRef(value);

  useEffect(() => {
    lastReportedValue.current = value;
  }, [value]);

  function handleDateInput(event: SyntheticEvent<HTMLInputElement>) {
    const dayKey = event.currentTarget.value;
    if (disabled || (dayKey !== "" && !validDayKey(dayKey)) || dayKey === lastReportedValue.current) return;
    lastReportedValue.current = dayKey;
    onChange(dayKey);
  }

  return (
    <View style={[styles.field, focused && styles.focused, disabled && styles.disabled]}>
      <View pointerEvents="none" accessible={false}>
        <MaterialCommunityIcons name="calendar-month-outline" size={20} color={focusedColors.muted} />
      </View>
      <input
        aria-label={label}
        disabled={disabled}
        min={validDayKey(minimumDayKey) ? minimumDayKey : undefined}
        type="date"
        value={validDayKey(value) ? value : ""}
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onInput={handleDateInput}
        onChange={handleDateInput}
        style={{
          width: "100%",
          minWidth: 0,
          minHeight: 46,
          boxSizing: "border-box",
          border: 0,
          outline: "none",
          padding: 0,
          background: "transparent",
          color: focusedColors.text,
          colorScheme: "dark",
          fontFamily: `${fonts.body}, sans-serif`,
          fontSize: 13,
          lineHeight: "20px",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: focusedColors.line, borderRadius: 8, backgroundColor: focusedColors.panel, paddingHorizontal: 10 },
  focused: { borderColor: focusedColors.link },
  disabled: { opacity: 0.48 },
});
