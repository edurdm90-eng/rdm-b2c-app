import { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

import { focusedColors as palette } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";

export type GoalProgressControlProps = { value: number; onChange: (value: number) => void; disabled?: boolean };

export function GoalProgressControl({ value, onChange, disabled = false }: GoalProgressControlProps) {
  const width = useRef(1);
  const startX = useRef(0);
  const current = useRef({ value, onChange, disabled });
  current.current = { value, onChange, disabled };
  const pan = useMemo(() => {
    const change = (x: number) => current.current.onChange(Math.round(Math.min(1, Math.max(0, x / width.current)) * 99));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !current.current.disabled,
      onMoveShouldSetPanResponder: () => !current.current.disabled,
      onPanResponderGrant: (event) => { startX.current = event.nativeEvent.locationX; change(startX.current); },
      onPanResponderMove: (_, gesture) => change(startX.current + gesture.dx),
      onPanResponderTerminationRequest: () => false,
    });
  }, []);
  return (
    <View>
      <View accessible accessibilityRole="adjustable" accessibilityLabel="Target progress" accessibilityValue={{ min: 0, max: 99, now: value, text: value + " percent" }}
        accessibilityState={{ disabled }} accessibilityActions={[{ name: "increment", label: "Increase progress" }, { name: "decrement", label: "Decrease progress" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (disabled || !["increment", "decrement"].includes(nativeEvent.actionName)) return;
          onChange(Math.max(0, Math.min(99, value + (nativeEvent.actionName === "increment" ? 1 : -1))));
        }}
        onLayout={(event) => { width.current = event.nativeEvent.layout.width; }} {...pan.panHandlers} style={[styles.touchArea, disabled && styles.disabled]}>
        <View pointerEvents="none" style={styles.track}><View style={[styles.fill, { width: `${value / 99 * 100}%` }]} /></View>
        <View pointerEvents="none" style={[styles.thumb, { left: `${value / 99 * 100}%` }]} />
      </View>
      <View style={styles.labels}>{[0, 25, 50, 75, 99].map((tick) => <Text key={tick} style={styles.tick}>{tick}%</Text>)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: { minHeight: 44, justifyContent: "center", marginHorizontal: 12 },
  disabled: { opacity: 0.5 },
  track: { height: 12, backgroundColor: "#293642", borderRadius: 6, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: palette.gold },
  thumb: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: palette.text, marginLeft: -12 },
  labels: { flexDirection: "row", justifyContent: "space-between" },
  tick: { color: palette.muted, fontFamily: fonts.body, fontSize: 11 },
});
