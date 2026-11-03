import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  PREMIUM_FREE_UNTIL_LABEL,
  PREMIUM_MONTHLY_INR,
  PREMIUM_YEARLY_INR,
  formatPremiumPriceInr,
  usePremiumAccess,
} from "@/lib/premium-access";
import { subscriptionController } from "@/lib/subscription";
import { useSubscription } from "@/lib/subscription-context";
import { fonts } from "@/lib/theme";

export default function MembershipScreen() {
  const state = useSubscription();
  const premium = usePremiumAccess();
  const focused = useIsFocused();
  const [linkError, setLinkError] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const freeUntilLabel = PREMIUM_FREE_UNTIL_LABEL;

  useEffect(() => {
    if ((state.status === "active" || state.status === "inactive") && state.plansStatus === "idle") {
      void subscriptionController.loadPlans();
    }
  }, [state.status, state.plansStatus]);

  useEffect(() => {
    if (focused && (state.status === "active" || state.status === "inactive")) void subscriptionController.refreshInfo();
  }, [focused, state.status, state.userId]);

  async function manageSubscription() {
    if (!state.managementUrl) return;
    setLinkError("");
    try {
      if (!state.managementUrl.startsWith("https://")) throw new Error("Invalid management link");
      await Linking.openURL(state.managementUrl);
    } catch {
      setLinkError("Your subscription page could not be opened. Please try again later.");
    }
  }

  async function purchase(planId: string) {
    setSelectedPlanId(planId);
    try {
      await subscriptionController.purchase(planId);
    } finally {
      setSelectedPlanId(null);
    }
  }

  const busy = state.status === "loading" || state.operation !== null;
  const unavailable = state.status === "unavailable";
  const showPlans = state.status === "active" || state.status === "inactive";
  const statusLabel = state.status === "active" ? "Active membership"
    : unavailable ? "Subscriptions coming soon"
      : state.status === "inactive" ? "No active membership"
        : state.status === "error" ? "Status unavailable"
          : "Checking membership…";

  return (
    <FocusedScreen bottomSafe contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to account" onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={25} color={palette.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Membership</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><MaterialCommunityIcons name="crown-outline" size={28} color={palette.purple} /></View>
        <Text style={styles.title}>RDM Premium</Text>
        <Text style={styles.subtitle}>
          {formatPremiumPriceInr(PREMIUM_MONTHLY_INR)}/month · {formatPremiumPriceInr(PREMIUM_YEARLY_INR)}/year. Separate from your RDM wallet — membership never sells or mints RDM.
        </Text>
      </View>

      <View style={styles.statusCard} accessible accessibilityLabel={`Membership status: ${statusLabel}`}>
        <View style={[styles.statusDot, (state.status === "active" || premium.inFreePeriod) && styles.activeDot]} />
        <View style={styles.statusCopy}>
          <Text style={styles.cardEyebrow}>CURRENT STATUS</Text>
          <Text style={styles.statusTitle}>{statusLabel}</Text>
          {premium.inFreePeriod ? (
            <Text style={styles.statusHint}>Premium content is free for everyone until {freeUntilLabel}.</Text>
          ) : null}
        </View>
        {state.status === "loading" ? <ActivityIndicator color={palette.purple} accessibilityLabel="Checking membership" /> : null}
      </View>

      <View style={styles.benefitCard}>
        <MaterialCommunityIcons name="crown-outline" size={21} color={palette.purple} />
        <View style={styles.benefitCopy}>
          <Text style={styles.benefitTitle}>What Premium unlocks</Text>
          {PREMIUM_FEATURES.map((feature) => (
            <Text key={feature.id} style={styles.benefitHint}>· {feature.title}</Text>
          ))}
          <Text style={[styles.benefitHint, { marginTop: 6 }]}>Always free: {FREE_FEATURES.map((feature) => feature.title).join(", ")}.</Text>
        </View>
      </View>

      {state.status === "error" ? <Pressable accessibilityRole="button" onPress={() => subscriptionController.retry()} style={styles.outlineButton}><Text style={styles.outlineLabel}>Retry membership check</Text></Pressable> : null}

      {showPlans ? (
        <>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Available plans</Text><Text style={styles.sectionHint}>List prices ₹{PREMIUM_MONTHLY_INR}/mo · ₹{PREMIUM_YEARLY_INR}/yr · store shows localized checkout</Text></View>
          {state.plansStatus === "loading" ? <View style={styles.inlineLoading}><ActivityIndicator color={palette.purple} /><Text style={styles.muted}>Loading plans…</Text></View> : null}
          {state.plansStatus === "error" ? (
            <View style={styles.infoCard}>
              <MaterialCommunityIcons name="alert-circle-outline" size={21} color={palette.link} />
              <Text style={styles.infoText}>Plans could not be loaded. Check your connection, then retry. If this keeps failing, the RevenueCat offering may be misconfigured.</Text>
            </View>
          ) : null}
          {state.plansStatus === "error" ? <Pressable accessibilityRole="button" onPress={() => void subscriptionController.loadPlans()} style={styles.outlineButton}><Text style={styles.outlineLabel}>Retry loading plans</Text></Pressable> : null}
          {state.plansStatus === "ready" && state.plans.length === 0 ? (
            <View style={styles.infoCard}>
              <MaterialCommunityIcons name="information-outline" size={21} color={palette.link} />
              <Text style={styles.infoText}>
                No packages are on the current RevenueCat offering yet. You can still restore an existing purchase. After packages are attached and marked Current, reload this screen.
              </Text>
            </View>
          ) : null}
          {state.plans.map((plan) => <View key={plan.id} style={styles.planCard}>
            <View style={styles.planHeader}><Text style={styles.planTitle}>{plan.title}</Text><Text style={styles.planPrice}>{plan.price}</Text></View>
            {plan.description ? <Text style={styles.planDescription}>{plan.description}</Text> : null}
            {state.status !== "active" ? <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${plan.title} for ${plan.price}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void purchase(plan.id)} style={({ pressed }) => [styles.purchaseButton, busy && styles.disabled, pressed && styles.pressed]}>{state.operation === "purchase" && selectedPlanId === plan.id ? <ActivityIndicator color={palette.onGreen} /> : <Text style={styles.purchaseLabel}>Continue with {plan.price}</Text>}</Pressable> : null}
          </View>)}
        </>
      ) : null}

      {!unavailable && state.status !== "signed-out" ? (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void subscriptionController.restore()} style={({ pressed }) => [styles.outlineButton, busy && styles.disabled, pressed && styles.pressed]}>
            {state.operation === "restore" ? <ActivityIndicator color={palette.link} /> : <Text style={styles.outlineLabel}>Restore purchases</Text>}
          </Pressable>
          {state.managementUrl ? <Pressable accessibilityRole="button" onPress={() => void manageSubscription()} style={styles.manageButton}><Text style={styles.manageLabel}>Manage subscription</Text><MaterialCommunityIcons name="open-in-new" size={17} color={palette.link} /></Pressable> : null}
        </View>
      ) : null}

      {state.message ? <Text accessibilityRole="alert" style={styles.message}>{state.message}</Text> : null}
      {linkError ? <Text accessibilityRole="alert" style={styles.message}>{linkError}</Text> : null}
      <Text style={styles.footnote}>
        Premium unlocks Grow Your Tree, AI Goal Setting, Games, and Wisdom. Habits, Goals, and Group goals stay free. Membership never changes Base, Reward, Remorse, or Peer balances.
      </Text>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 15, paddingTop: 10, paddingBottom: 28 },
  header: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 42 },
  backButton: { alignItems: "center", justifyContent: "center", height: 42, width: 42, marginLeft: -9 },
  headerTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 20 },
  hero: { gap: 6, paddingTop: 10, paddingBottom: 4 },
  heroIcon: { alignItems: "center", justifyContent: "center", backgroundColor: `${palette.purple}20`, borderRadius: 13, height: 48, width: 48, marginBottom: 6 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 30 },
  subtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  statusCard: { alignItems: "center", backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 78, padding: 15 },
  statusDot: { backgroundColor: palette.muted, borderRadius: 7, height: 14, width: 14 },
  activeDot: { backgroundColor: palette.green },
  statusCopy: { flex: 1, gap: 4 },
  cardEyebrow: { color: palette.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6 },
  statusTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21 },
  statusHint: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  infoCard: { alignItems: "flex-start", backgroundColor: "rgba(102,199,255,0.08)", borderColor: "rgba(102,199,255,0.24)", borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 10, padding: 14 },
  infoText: { color: palette.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, flex: 1 },
  benefitCard: { alignItems: "flex-start", backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 10, padding: 14 },
  benefitCopy: { flex: 1, gap: 4 },
  benefitTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 19 },
  benefitHint: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  sectionHead: { gap: 2, marginTop: 7 },
  sectionTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 16 },
  sectionHint: { color: palette.muted, fontFamily: fonts.body, fontSize: 11 },
  inlineLoading: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 48 },
  muted: { color: palette.muted, fontFamily: fonts.body, fontSize: 12 },
  planCard: { backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 12, borderWidth: 1, gap: 10, padding: 15 },
  planHeader: { alignItems: "flex-start", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  planTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 15, flex: 1 },
  planPrice: { color: palette.text, fontFamily: fonts.monoBold, fontSize: 14 },
  planDescription: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  purchaseButton: { alignItems: "center", backgroundColor: palette.green, borderRadius: 9, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  purchaseLabel: { color: palette.onGreen, fontFamily: fonts.bodyBold, fontSize: 13 },
  actions: { gap: 8, marginTop: 6 },
  outlineButton: { alignItems: "center", borderColor: palette.line, borderRadius: 9, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  outlineLabel: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 13 },
  manageButton: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 44 },
  manageLabel: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 13 },
  message: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  footnote: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 12 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
});
