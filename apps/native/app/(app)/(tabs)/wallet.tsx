import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionDialog, AppScreen, ErrorState, IconBubble, LoadingState, PageHeader, PrimaryButton, SectionLabel, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { colors, fonts, formatRdm, formatTransactionDate, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

const transactionColors: Record<string, string> = {
  habit: colors.growth,
  game: colors.ai,
  remorse: colors.coral,
  peer: colors.plum,
  charity: colors.growth,
  redeem: colors.gold,
};

export default function WalletScreen() {
  const [decideOpen, setDecideOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions());
  const donate = useMutation(trpc.rdm.wallet.donate.mutationOptions({
    onSuccess: async () => { await queryClient.invalidateQueries(); setNotice("Gift recorded — 5 RDM moved from remorse into a positive action."); },
    onError: (error) => setNotice(`Could not give: ${error.message}`),
  }));
  const redeem = useMutation(trpc.rdm.wallet.redeem.mutationOptions({
    onSuccess: async () => { await queryClient.invalidateQueries(); setNotice("Focus Garden unlocked — the new plant skin is now yours."); },
    onError: (error) => setNotice(`Could not redeem: ${error.message}`),
  }));

  if (wallet.isLoading) return <LoadingState label="Counting your RDM…" />;
  if (wallet.error || !wallet.data) return <ErrorState message={wallet.error?.message ?? "Wallet unavailable."} onRetry={() => void wallet.refetch()} />;

  const data = wallet.data;
  const focusGardenUnlocked = data.unlockedRewards.includes("focus-garden");

  return (
    <AppScreen>
      <PageHeader title="RDM Wallet" subtitle="All transactions & purses" />
      <LinearGradient colors={["rgba(240,180,41,0.16)", colors.panel]} style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>RDM Balance</Text>
        <Text style={styles.balance}>{formatRdm(data.wallet.balance)}</Text>
        <Text style={rdmStyles.muted}>Earned across habits, games, and groups</Text>
      </LinearGradient>

      <SectionLabel>Your purses</SectionLabel>
      <SurfaceCard style={styles.purseCard}>
        <IconBubble name="trophy-outline" color={colors.gold} backgroundColor={colors.goldTint} />
        <View style={styles.purseCopy}><Text style={styles.purseTitle}>Reward Purse</Text><Text style={[styles.purseAmount, { color: colors.gold }]}>{formatRdm(data.wallet.reward)} RDM</Text><Text style={styles.purseNote}>Redeemable for perks & skins</Text></View>
        <PrimaryButton disabled={focusGardenUnlocked} label={focusGardenUnlocked ? "Unlocked" : "Redeem"} color={colors.gold} loading={redeem.isPending} style={styles.purseButton} onPress={() => redeem.mutate({ rewardId: "focus-garden" })} />
      </SurfaceCard>
      <SurfaceCard style={styles.purseCard}>
        <IconBubble name="candle" color={colors.coral} backgroundColor={colors.coralTint} />
        <View style={styles.purseCopy}><Text style={styles.purseTitle}>Remorse Purse</Text><Text style={[styles.purseAmount, { color: colors.coral }]}>{formatRdm(data.wallet.remorse)} RDM</Text><Text style={styles.purseNote}>Missed pledges—decide what happens next</Text></View>
        <PrimaryButton disabled={data.wallet.remorse < 5} label="Decide" color={colors.coral} loading={donate.isPending} style={styles.purseButton} variant="outline" onPress={() => setDecideOpen(true)} />
      </SurfaceCard>
      <SurfaceCard style={styles.purseCard}>
        <IconBubble name="gift-outline" color={colors.plum} backgroundColor={colors.plumTint} />
        <View style={styles.purseCopy}><Text style={styles.purseTitle}>Peer Awards</Text><Text style={[styles.purseAmount, { color: colors.plum }]}>{formatRdm(data.wallet.peer)} RDM</Text><Text style={styles.purseNote}>Given to you by group members</Text></View>
      </SurfaceCard>

      <SectionLabel>Move remorse to charity</SectionLabel>
      {(["Plant a Tree Trust", "Rural Education Fund"] as const).map((charity, index) => (
        <SurfaceCard key={charity} style={styles.charityCard}>
          <IconBubble name={index === 0 ? "tree-outline" : "book-open-page-variant-outline"} />
          <View style={styles.charityCopy}><Text style={styles.charityTitle}>{charity}</Text><Text style={styles.purseNote}>{index === 0 ? "1 RDM supports verified planting" : "Supports first-generation learners"}</Text></View>
          <PrimaryButton label="Give 5" loading={donate.isPending} style={styles.purseButton} onPress={() => donate.mutate({ charity, amount: 5 })} />
        </SurfaceCard>
      ))}
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      <SectionLabel>Recent transactions</SectionLabel>
      <SurfaceCard style={styles.transactionCard}>
        {data.transactions.slice(0, 12).map((transaction, index) => (
          <View key={transaction.id} style={[styles.transactionRow, index > 0 && styles.transactionBorder]}>
            <View style={[styles.transactionDot, { backgroundColor: transactionColors[transaction.kind] ?? colors.inkSoft }]} />
            <View style={styles.transactionCopy}><Text style={styles.transactionTitle}>{transaction.title}</Text><Text style={styles.transactionDate}>{formatTransactionDate(transaction.createdAt)}</Text></View>
            <Text style={[styles.transactionAmount, { color: transaction.amount >= 0 ? transactionColors[transaction.kind] ?? colors.growth : colors.inkSoft }]}>{transaction.amount >= 0 ? "+" : ""}{transaction.amount}</Text>
          </View>
        ))}
      </SurfaceCard>
      <ActionDialog
        cancelLabel="Keep for later"
        confirmColor={colors.coral}
        confirmLabel="Give to a tree"
        loading={donate.isPending}
        message="Remorse is information, not punishment. Keep it for reflection or move 5 RDM into a positive action."
        onCancel={() => setDecideOpen(false)}
        onConfirm={() => {
          setDecideOpen(false);
          donate.mutate({ charity: "Plant a Tree Trust", amount: 5 });
        }}
        title="Decide what happens next"
        visible={decideOpen}
      />
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
  charityCard: { flexDirection: "row", alignItems: "center", gap: 10 },
  charityCopy: { flex: 1, gap: 3 },
  charityTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 11 },
  transactionCard: { paddingVertical: 4 },
  transactionRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10 },
  transactionBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  transactionDot: { width: 7, height: 7, borderRadius: 4 },
  transactionCopy: { flex: 1 },
  transactionTitle: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 11 },
  transactionDate: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9, marginTop: 3 },
  transactionAmount: { fontFamily: fonts.monoBold, fontSize: 11 },
  notice: { color: colors.growth, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
