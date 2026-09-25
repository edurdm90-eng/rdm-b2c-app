import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fonts } from "@/lib/theme";

export const focusedColors = {
  background: "#131B20",
  panel: "#1B242C",
  text: "#F5F7FB",
  muted: "#B1BED1",
  line: "#2A3541",
  green: "#38D693",
  gold: "#FFBD37",
  coral: "#FF7964",
  purple: "#B788F1",
  link: "#66C7FF",
  mint: "#9BE7C1",
  onGreen: "#06160F",
} as const;

export const focusedTypography = {
  heroTitle: { fontSize: 26, lineHeight: 33 },
  pageTitle: { fontSize: 24, lineHeight: 31 },
} as const;

export function FocusedScreen({ children, scroll = true, bottomSafe = false, contentStyle }: {
  children: ReactNode;
  scroll?: boolean;
  bottomSafe?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={bottomSafe ? ["top", "left", "right", "bottom"] : ["top", "left", "right"]} style={styles.screen}>
      {scroll ? (
        <ScrollView style={styles.viewport} contentContainerStyle={[styles.content, contentStyle]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : <View style={[styles.viewport, styles.content, contentStyle]}>{children}</View>}
    </SafeAreaView>
  );
}

export function FocusedButton({ label, onPress, disabled = false, loading = false, style, accessibilityLabel }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, style, (disabled || loading) && styles.disabled, pressed && styles.pressed]}>
      {loading ? <ActivityIndicator color={focusedColors.onGreen} /> : <Text style={styles.buttonLabel}>{label}</Text>}
    </Pressable>
  );
}

export const focusedStyles = StyleSheet.create({
  title: { color: focusedColors.text, fontFamily: fonts.bodyBold, ...focusedTypography.pageTitle },
  body: { color: focusedColors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20 },
  sectionTitle: { color: focusedColors.text, fontFamily: fonts.bodyBold, fontSize: 15.5, lineHeight: 22 },
  link: { color: focusedColors.link, fontFamily: fonts.bodyMedium, fontSize: 13.5 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: focusedColors.background },
  viewport: { flex: 1, width: "100%", maxWidth: 480, alignSelf: "center" },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  button: { minHeight: 44, borderRadius: 10, backgroundColor: focusedColors.green, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  buttonLabel: { color: focusedColors.onGreen, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 19, textAlign: "center" },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.8 },
});
