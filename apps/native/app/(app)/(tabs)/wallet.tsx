import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen, ErrorState, IconBubble, LoadingState, PageHeader, PrimaryButton, SectionLabel, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { colors, fonts, formatRdm, formatTransactionDate, radii } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

const transactionColors: Record<string, string> = {
  habit: colors.growth,
  goal: colors.growth,
  gratitude: colors.ai,
  deed: colors.gold,
  stake: colors.inkSoft,
  grant: colors.growth,
  game: colors.ai,
  remorse: colors.coral,
  peer: colors.plum,
  charity: colors.growth,
  redeem: colors.gold,
};

export default function WalletScreen() {
  const focused = useIsFocused();
  const wallet = useQuery({
    ...trpc.rdm.wallet.summary.queryOptions(),
    enabled: focused,
    refetchInterval: focused ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

  if (wallet.isLoading) return <LoadingState label="Counting your RDM…" />;
  if (wallet.error || !wallet.data) return <ErrorState message={wallet.error?.message ?? "Wallet unavailable."} onRetry={() => void wallet.refetch()} />;

  const data = wallet.data;
  const focusGardenUnlocked = data.unlockedRewards.includes("focus-garden");

  return (
    <AppScreen>
      <PageHeader title="RDM Wallet" subtitle="All transactions & purses" />
      <LinearGradient colors={["rgba(240,180,41,0.16)", colors.panel]} style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total RDM Balance</Text>
        <Text style={styles.balance}>{formatRdm(data.wallet.balance)}</Text>
        <Text style={rdmStyles.muted}>Across Base, Reward, Remorse & Peer purses</Text>
      </LinearGradient>

      <SectionLabel>Your purses</SectionLabel>
      <SurfaceCard style={styles.purseCard}>
        <IconBubble name="wallet-outline" color={colors.growth} backgroundColor={colors.growthTint} />
        <View style={styles.purseCopy}><Text style={styles.purseTitle}>Base Purse</Text><Text style={[styles.purseAmount, { color: colors.growth }]}>{formatRdm(data.wallet.base)} RDM</Text><Text style={styles.purseNote}>Available for pledges, goals & everyday use</Text></View>
      </SurfaceCard>
      <SurfaceCard style={styles.purseCard}>
        <IconBubble name="trophy-outline" color={colors.gold} backgroundColor={colors.goldTint} />
        <View style={styles.purseCopy}><Text style={styles.purseTitle}>Reward Purse</Text><Text style={[styles.purseAmount, { color: colors.gold }]}>{formatRdm(data.wallet.reward)} RDM</Text><Text style={styles.purseNote}>Earned from completed habits, goals & activities</Text></View>
        <PrimaryButton disabled label="Redeem soon" color={colors.gold} style={styles.purseButton} onPress={() => undefined} />
      </SurfaceCard>
      <SurfaceCard style={styles.purseCard}>
        <IconBubble name="candle" color={colors.coral} backgroundColor={colors.coralTint} />
        <View style={styles.purseCopy}><Text style={styles.purseTitle}>Remorse Purse</Text><Text style={[styles.purseAmount, { color: colors.coral }]}>{formatRdm(data.wallet.remorse)} RDM</Text><Text style={styles.purseNote}>RDM from missed pledges, held for reflection</Text></View>
      </SurfaceCard>
      <SurfaceCard style={styles.purseCard}>
        <IconBubble name="gift-outline" color={colors.plum} backgroundColor={colors.plumTint} />
        <View style={styles.purseCopy}><Text style={styles.purseTitle}>Peer Awards</Text><Text style={[styles.purseAmount, { color: colors.plum }]}>{formatRdm(data.wallet.peer)} RDM</Text><Text style={styles.purseNote}>Given to you by group members</Text></View>
      </SurfaceCard>

      <SectionLabel>Donation & redemption options</SectionLabel>
      <SurfaceCard style={styles.optionsCard}>
        <Text style={styles.optionTitle}>These options are not available yet</Text>
        <Text style={styles.optionCopy}>Charity donations, perks, and skins are not connected. Your RDM stays in its purse.</Text>
        {focusGardenUnlocked ? <Text style={styles.optionCopy}>Your previously recorded Focus Garden entitlement is saved. The skin is not available yet.</Text> : null}
      </SurfaceCard>

      <SectionLabel>Recent transactions</SectionLabel>
      <SurfaceCard style={styles.transactionCard}>
        {data.transactions.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <Text style={styles.optionTitle}>No transactions yet</Text>
            <Text style={styles.optionCopy}>Your recorded RDM activity will appear here.</Text>
          </View>
        ) : null}
        {data.transactions.slice(0, 12).map((transaction, index) => (
          <View key={transaction.id} style={[styles.transactionRow, index > 0 && styles.transactionBorder]}>
            <View style={[styles.transactionDot, { backgroundColor: transactionColors[transaction.kind] ?? colors.inkSoft }]} />
            <View style={styles.transactionCopy}><Text style={styles.transactionTitle}>{transaction.title}</Text><Text style={styles.transactionDate}>{formatTransactionDate(transaction.createdAt)}</Text></View>
            <Text style={[styles.transactionAmount, { color: transaction.amount >= 0 ? transactionColors[transaction.kind] ?? colors.growth : colors.inkSoft }]}>{transaction.amount >= 0 ? "+" : ""}{transaction.amount}</Text>
          </View>
        ))}
      </SurfaceCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  balanceCard: { borderRadius: radii.large, borderWidth: 1, borderColor: colors.line, alignItems: "center", padding: 20, gap: 5 },
  balanceLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.7, textTransform: "uppercase" },
  balance: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 36 },
  purseCard: { flexDirection: "row", alignItems: "center", gap: 11 },
  purseCopy: { flex: 1, gap: 2 },
  purseTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  purseAmount: { fontFamily: fonts.monoBold, fontSize: 14 },
  purseNote: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9, lineHeight: 13 },
  purseButton: { minHeight: 36, paddingHorizontal: 11 },
  optionsCard: { gap: 7 },
  optionTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  optionCopy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  emptyTransactions: { gap: 6, paddingVertical: 20, alignItems: "center" },
  transactionCard: { paddingVertical: 4 },
  transactionRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10 },
  transactionBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  transactionDot: { width: 7, height: 7, borderRadius: 4 },
  transactionCopy: { flex: 1 },
  transactionTitle: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 11 },
  transactionDate: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9, marginTop: 3 },
  transactionAmount: { fontFamily: fonts.monoBold, fontSize: 11 },
});
