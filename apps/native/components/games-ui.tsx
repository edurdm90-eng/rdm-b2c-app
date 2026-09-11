import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FocusedScreen, focusedColors as c, focusedStyles as f } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";

export type GameIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
export const gameBlue = "#63AEF5";
export const gameOrder = ["memory-match", "aptitude-bliss", "focus-flow", "unscramble-word", "gratitude-tap", "box-breathing", "sort-sprint"];

export function GameIcon({ name, size = 24, color = c.muted }: { name: GameIconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons accessible={false} name={name} size={size} color={color} />;
}
export function GamesFrame({ title, onBack, children, footer }: { title: string; onBack: () => void; children: ReactNode; footer: ReactNode }) {
  return <FocusedScreen scroll={false} bottomSafe contentStyle={[gamesStyles.screen, { gap: 0, paddingBottom: 14 }]}>
    <GamesHeader title={title} onBack={onBack} />
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingTop: 12, paddingBottom: 16, flexGrow: 1 }}>{children}</ScrollView>
    <View style={{ gap: 10, paddingTop: 12 }}>{footer}</View>
  </FocusedScreen>;
}
export function GamesHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return <View style={s.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)/games"))} style={s.back}><GameIcon name="arrow-left" size={26} color={c.text} /></Pressable>
    <View style={{ flex: 1 }}><Text style={s.headerTitle}>{title}</Text>{subtitle ? <Text style={f.body}>{subtitle}</Text> : null}</View>
  </View>;
}
export function GamesTabs<T extends string | number>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <View accessibilityRole="tablist" style={s.tabs}>{options.map((option) => <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: option.value === value }} onPress={() => onChange(option.value)} style={[s.tab, option.value === value && s.activeTab]}><Text style={[s.tabLabel, option.value === value && s.activeLabel]}>{option.label}</Text></Pressable>)}</View>;
}
export function GamesOutlineButton({ label, onPress, disabled = false, icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: GameIconName }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.outline, (disabled || pressed) && { opacity: 0.5 }]}>{icon ? <GameIcon name={icon} /> : null}<Text style={s.outlineLabel}>{label}</Text></Pressable>;
}
export function GamesNote({ children, icon = "information-outline", color = c.muted }: { children: ReactNode; icon?: GameIconName; color?: string }) {
  return <View style={s.note}><GameIcon name={icon} size={22} color={color} /><Text style={s.noteText}>{children}</Text></View>;
}
export function GameArt({ id, intro = false, large = false }: { id: string; intro?: boolean; large?: boolean }) {
  if (id === "memory-match") return <Image accessible={false} source={intro ? require("@/assets/images/games-memory-intro.png") : require("@/assets/images/games-memory-complete.png")} resizeMode="contain" style={{ width: "100%", height: large ? intro ? 180 : 140 : 76 }} />;
  const icons: Record<string, GameIconName> = { "aptitude-bliss": "calculator-variant-outline", "focus-flow": "bullseye", "unscramble-word": "alphabetical-variant", "gratitude-tap": "hand-heart-outline", "box-breathing": "square-outline", "sort-sprint": "shape" };
  return <View style={{ height: large ? 180 : 68, alignItems: "center", justifyContent: "center" }}><GameIcon name={icons[id] ?? "gamepad-variant-outline"} size={large ? 132 : 66} color={id === "gratitude-tap" ? c.green : id === "sort-sprint" ? c.gold : gameBlue} /></View>;
}
export function GamesProgress({ value, color = c.green }: { value: number; color?: string }) {
  const progress = Math.min(1, Math.max(0, value));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={s.track}><View style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 9, backgroundColor: color }} /></View>;
}
export const gamesStyles = StyleSheet.create({
  screen: { paddingTop: 16, paddingHorizontal: 20, gap: 18 },
  card: { backgroundColor: "#171F26", borderColor: c.line, borderWidth: 1, borderRadius: 10, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  footer: { marginTop: "auto", paddingTop: 18, gap: 10 },
  muted: { color: c.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  label: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22 },
  rule: { height: 1, backgroundColor: c.line },
});
const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, marginBottom: 6 },
  back: { width: 40, height: 44, justifyContent: "center", marginLeft: -6 },
  headerTitle: { color: c.text, fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 26 },
  tabs: { flexDirection: "row", padding: 3, minHeight: 44, borderWidth: 1, borderColor: c.line, borderRadius: 10 },
  tab: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 8, paddingHorizontal: 3 },
  activeTab: { backgroundColor: "#273542" },
  tabLabel: { color: c.muted, fontFamily: fonts.body, fontSize: 12 },
  activeLabel: { color: c.text, fontFamily: fonts.bodyBold },
  outline: { minHeight: 52, borderColor: "#465360", borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, padding: 12 },
  outlineLabel: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: 15, textAlign: "center" },
  note: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  noteText: { flex: 1, color: c.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 19 },
  track: { height: 13, borderRadius: 9, overflow: "hidden", backgroundColor: c.line },
});
