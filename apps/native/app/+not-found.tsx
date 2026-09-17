import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FocusedButton, FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { fonts } from "@/lib/theme";

export default function NotFoundScreen() {
  return (
    <FocusedScreen scroll={false} contentStyle={styles.screen}>
      <View style={styles.illustration}>
        <View style={styles.ringOuter} />
        <View style={styles.ringInner}>
          <MaterialCommunityIcons name="compass-off-outline" size={40} color={palette.muted} />
        </View>
      </View>
      <Text accessibilityElementsHidden style={styles.code}>404</Text>
      <Text accessibilityRole="header" style={styles.title}>This page isn’t here.</Text>
      <Text style={styles.copy}>The link may have changed, or this item may no longer be available. Your progress is safe.</Text>
      <View style={styles.actions}>
        <FocusedButton label="Go to Home" onPress={() => router.replace("/")} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryLabel}>Go back</Text>
        </Pressable>
      </View>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 30 },
  illustration: { width: 132, height: 132, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  ringOuter: { position: "absolute", width: 132, height: 132, borderRadius: 66, borderWidth: 2, borderStyle: "dashed", borderColor: palette.line },
  ringInner: { width: 88, height: 88, borderRadius: 44, borderWidth: 1.5, borderColor: palette.line, backgroundColor: palette.panel, alignItems: "center", justifyContent: "center" },
  code: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 56, lineHeight: 62, letterSpacing: -1 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 23, lineHeight: 30, textAlign: "center", marginTop: 6 },
  copy: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 6, marginBottom: 10, maxWidth: 290 },
  actions: { width: "100%", gap: 12 },
  secondary: { minHeight: 54, borderRadius: 10, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, alignItems: "center", justifyContent: "center" },
  secondaryLabel: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 23 },
  pressed: { opacity: 0.8 },
});
