import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SectionLabel,
  SurfaceCard,
} from "@/components/rdm-ui";
import { colors, fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GroupTopUpScreen() {
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions());

  if (wallet.isLoading) return <LoadingState label="Checking your Base Purse…" />;
  if (wallet.error || !wallet.data) {
    return <ErrorState message={wallet.error?.message ?? "Wallet is unavailable."} onRetry={() => void wallet.refetch()} />;
  }

  return (
    <AppScreen>
      <PageHeader
        back
        onBack={() => router.dismissTo("/(app)/group/settings")}
        title="Top up RDM"
        subtitle="PAYMENTS UNAVAILABLE"
      />
      <View style={styles.hero}><View style={styles.walletIcon}><MaterialCommunityIcons color={colors.inkSoft} name="wallet-outline" size={58} /></View><Text style={styles.heroTitle}>Payments aren&apos;t{`\n`}available yet.</Text><Text style={styles.helper}>RDM top ups will be available in a future version. You can still track your balance and progress.</Text></View>
      <SurfaceCard style={styles.balanceCard}>
        <View style={styles.balanceMark} /><View style={styles.balanceCopy}><Text style={styles.balanceLabel}>BASE PURSE</Text><Text style={styles.balanceValue}>{formatRdm(wallet.data.wallet.base)} RDM</Text><Text style={styles.balanceHint}>Available to pledge</Text></View></SurfaceCard>
      <SectionLabel>Select amount (RDM)</SectionLabel>
      <View style={styles.options}>
        {[100, 250, 500].map((option) => <View key={option} style={styles.disabledOption}><Text style={styles.disabledOptionText}>{option} RDM</Text></View>)}
      </View>
      <SectionLabel>Payment method</SectionLabel>
      <View style={styles.paymentRows}><View style={styles.paymentRow}><MaterialCommunityIcons color={colors.inkSoft} name="cellphone-wireless" size={24} /><View><Text style={styles.paymentTitle}>UPI</Text><Text style={styles.paymentHint}>Not available</Text></View><View style={styles.radio} /></View><View style={styles.paymentRow}><MaterialCommunityIcons color={colors.inkSoft} name="credit-card-outline" size={24} /><View><Text style={styles.paymentTitle}>Card</Text><Text style={styles.paymentHint}>Not available</Text></View><View style={styles.radio} /></View></View>
      <SurfaceCard style={styles.notice}>
        <MaterialCommunityIcons color={colors.ai} name="information-outline" size={25} /><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Payment setup required.</Text><Text style={styles.noticeBody}>You can&apos;t purchase RDM in this version.</Text></View>
      </SurfaceCard>
      <PrimaryButton color={colors.growth} disabled label="Top up unavailable" onPress={() => undefined} />
      <PrimaryButton color={colors.growth} label="Open wallet" onPress={() => router.replace("/(app)/(tabs)/wallet")} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  walletIcon: { alignSelf: "flex-end", marginBottom: -18, opacity: 0.72 },
  heroTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 29, letterSpacing: -0.8, lineHeight: 34 },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  balanceCard: { alignItems: "center", backgroundColor: colors.panelRaised, flexDirection: "row", gap: 12 },
  balanceMark: { backgroundColor: colors.growth, borderRadius: 15, height: 30, width: 30 },
  balanceCopy: { flex: 1 },
  balanceLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 10 },
  balanceValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 26, marginTop: 2 },
  balanceHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, marginTop: 2 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  disabledOption: { alignItems: "center", backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: 9, borderWidth: 1, flex: 1, minHeight: 52, justifyContent: "center", opacity: 0.5 },
  disabledOptionText: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 12 },
  paymentRows: { backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: 11, borderWidth: 1 },
  paymentRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 11, minHeight: 60, paddingHorizontal: 13 },
  paymentTitle: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 13 },
  paymentHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, marginTop: 2 },
  radio: { borderColor: colors.inkSoft, borderRadius: 12, borderWidth: 1, height: 21, marginLeft: "auto", width: 21 },
  notice: { alignItems: "center", backgroundColor: colors.aiTint, borderColor: "rgba(95, 166, 237, 0.25)", flexDirection: "row", gap: 10 },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  noticeBody: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
});
