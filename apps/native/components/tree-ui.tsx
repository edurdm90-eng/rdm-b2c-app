import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusedScreen, focusedColors as palette, focusedTypography } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";

export function TreePage({ title, children, footer, onBack, busy = false }: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
  busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  usePreventRemove(busy, () => {});
  function back() {
    if (busy) return;
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace("/(app)/tree");
  }
  return <FocusedScreen scroll={false} contentStyle={styles.screen}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" accessibilityState={{ disabled: busy }} disabled={busy} onPress={back} style={styles.back}>
          <MaterialCommunityIcons name="arrow-left" size={26} color={palette.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, !footer && { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  </FocusedScreen>;
}

export function TreeNotice({ children }: { children: ReactNode }) {
  return <View style={styles.notice}><MaterialCommunityIcons name="information-outline" size={23} color={palette.link} /><Text style={styles.noticeText}>{children}</Text></View>;
}

const treeImages = {
  seedling: require("@/assets/images/tree-seedling.png"),
  sapling: require("@/assets/images/tree-sapling.png"),
  resting: require("@/assets/images/tree-resting.png"),
};

export function TreeArtwork({ variant, height = 170 }: { variant: keyof typeof treeImages; height?: number }) {
  return <Image source={treeImages[variant]} accessibilityLabel={variant === "resting" ? "A resting tree ready for a fresh start" : variant === "sapling" ? "A growing green sapling" : "A new two-leaf seedling"} resizeMode="contain" style={{ width: "100%", height }} />;
}

export function formatTreeDay(dayKey: string, full = false) {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "numeric", month: full ? "long" : "short", year: "numeric", ...(full ? { weekday: "long" as const } : {}),
  });
}

export const treeStyles = StyleSheet.create({
  heading: { color: palette.text, fontFamily: fonts.bodyBold, ...focusedTypography.pageTitle },
  section: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 23 },
  body: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  small: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  error: { color: palette.coral, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  panel: { borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: palette.panel, padding: 14 },
  divider: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 18 },
  textButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
});

const styles = StyleSheet.create({
  screen: { padding: 0, paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0 },
  flex: { flex: 1 },
  header: { minHeight: 58, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 10 },
  back: { width: 42, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: palette.text, fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 25 },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, gap: 16 },
  footer: { paddingHorizontal: 18, paddingTop: 10, gap: 9, backgroundColor: palette.background },
  notice: { padding: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: palette.panel, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  noticeText: { flex: 1, color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
});
