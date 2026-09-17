import { StyleSheet, Text, View } from "react-native";

import { focusedColors as palette } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";

type GoalProgressControlProps = { value: number; onChange: (value: number) => void; disabled?: boolean };

export function GoalProgressControl({ value, onChange, disabled = false }: GoalProgressControlProps) {
  return (
    <View style={styles.control}>
      <input aria-label="Target progress" aria-valuetext={value + " percent"} type="range" min={0} max={99} step={1} value={value} disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={{ width: "100%", minHeight: 44, margin: 0, accentColor: palette.gold, cursor: disabled ? "not-allowed" : "pointer" }} />
      <View style={styles.labels}>{[0, 25, 50, 75, 99].map((tick) => <Text key={tick} style={styles.tick}>{tick}%</Text>)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  control: { gap: 2 },
  labels: { flexDirection: "row", justifyContent: "space-between" },
  tick: { color: palette.muted, fontFamily: fonts.body, fontSize: 11 },
});
