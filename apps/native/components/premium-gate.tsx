import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { type Href, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  PREMIUM_FREE_UNTIL_LABEL,
  PREMIUM_MONTHLY_INR,
  PREMIUM_YEARLY_INR,
  formatPremiumPriceInr,
} from "@/lib/premium-access";
import { fonts } from "@/lib/theme";

export function PremiumPaywall({ title }: { title: string }) {
  return (
    <FocusedScreen bottomSafe contentStyle={styles.content}>
      <View style={styles.heroIcon}>
        <MaterialCommunityIcons name="crown-outline" size={30} color={palette.purple} />
      </View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        This is part of RDM Premium. Free access ended after {PREMIUM_FREE_UNTIL_LABEL}. Habits, Goals, and Group goals stay free.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>INCLUDED IN PREMIUM</Text>
        {PREMIUM_FEATURES.map((feature) => (
          <View key={feature.id} style={styles.row}>
            <MaterialCommunityIcons name="check" size={18} color={palette.green} />
            <Text style={styles.rowLabel}>{feature.title}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>ALWAYS FREE</Text>
        {FREE_FEATURES.map((feature) => (
          <View key={feature.id} style={styles.row}>
            <MaterialCommunityIcons name="check" size={18} color={palette.muted} />
            <Text style={styles.rowLabel}>{feature.title}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.price}>
        {formatPremiumPriceInr(PREMIUM_MONTHLY_INR)}/month · {formatPremiumPriceInr(PREMIUM_YEARLY_INR)}/year
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open membership"
        onPress={() => router.push("/(app)/membership" as Href)}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <Text style={styles.ctaLabel}>View membership</Text>
      </Pressable>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingTop: 28, paddingBottom: 28 },
  heroIcon: {
    alignItems: "center",
    backgroundColor: `${palette.purple}20`,
    borderRadius: 14,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 30 },
  subtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  cardEyebrow: { color: palette.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  rowLabel: { color: palette.text, flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  price: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, marginTop: 4 },
  cta: {
    alignItems: "center",
    backgroundColor: palette.green,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 46,
    marginTop: 4,
  },
  ctaLabel: { color: palette.onGreen, fontFamily: fonts.bodyBold, fontSize: 14 },
  pressed: { opacity: 0.78 },
});
