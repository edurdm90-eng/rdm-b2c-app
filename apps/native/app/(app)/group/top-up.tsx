import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  Pill,
  PrimaryButton,
  SectionLabel,
  SurfaceCard,
} from "@/components/rdm-ui";
import { colors, fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GroupTopUpScreen() {
  const [amount, setAmount] = useState(100);
  const [paymentMethod, setPaymentMethod] = useState<"upi" | "card">("upi");
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions());

  if (wallet.isLoading) return <LoadingState label="Checking your Base Purse…" />;
  if (wallet.error || !wallet.data) {
    return <ErrorState message={wallet.error?.message ?? "Wallet is unavailable."} onRetry={() => void wallet.refetch()} />;
  }

  return (
    <AppScreen>
      <PageHeader back title="Top up RDM" subtitle={`BASE PURSE: ${formatRdm(wallet.data.wallet.base)} RDM`} />
      <SurfaceCard style={styles.hero}>
        <Text style={styles.eyebrow}>YOU&apos;RE ADDING</Text>
        <Text style={styles.amount}>{formatRdm(amount)} RDM</Text>
        <Text style={styles.helper}>Choose an amount now. A verified payment provider must be connected before money can be accepted or RDM issued.</Text>
      </SurfaceCard>
      <SectionLabel>Choose amount</SectionLabel>
      <View style={styles.options}>
        {[50, 100, 250].map((option) => (
          <Pill key={option} active={amount === option} color={colors.gold} label={`${option} RDM`} onPress={() => setAmount(option)} />
        ))}
      </View>
      <SectionLabel>Pay with</SectionLabel>
      <View style={styles.options}>
        <Pill active={paymentMethod === "upi"} color={colors.ai} label="UPI · instant" onPress={() => setPaymentMethod("upi")} />
        <Pill active={paymentMethod === "card"} color={colors.ai} label="Debit / credit card" onPress={() => setPaymentMethod("card")} />
      </View>
      <SurfaceCard style={styles.notice}>
        <Text style={styles.noticeTitle}>Payments are not connected yet</Text>
        <Text style={styles.helper}>This screen never changes your balance without a completed, verified payment. You can still review your existing RDM in Wallet.</Text>
      </SurfaceCard>
      <PrimaryButton color={colors.gold} disabled label="Payment setup required" onPress={() => undefined} />
      <PrimaryButton color={colors.plum} label="Open Wallet" onPress={() => router.replace("/(app)/(tabs)/wallet")} variant="outline" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 6, paddingVertical: 22 },
  eyebrow: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8 },
  amount: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 30 },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, textAlign: "center" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notice: { backgroundColor: colors.goldTint, gap: 6 },
  noticeTitle: { color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 12, textAlign: "center" },
});
