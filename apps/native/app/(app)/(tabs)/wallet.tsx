import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { ErrorState, LoadingState, RdmLogo } from "@/components/rdm-ui";
import { fonts, formatRdm, formatTransactionDate } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

type Purse = "base" | "reward" | "remorse" | "peer";
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const purses: { id: Purse; title: string; note: string; detail: string; color: string }[] = [
  { id: "base", title: "Base Purse", note: "Available to pledge", detail: "New habit, goal, and tree pledges come from Base. The full confirmed pledge is held separately until settlement.", color: palette.green },
  { id: "reward", title: "Reward Purse", note: "From completed actions", detail: "Completed daily reflections and eligible actions move RDM here. Reward redemption is not available yet; your RDM stays in this purse.", color: palette.gold },
  { id: "remorse", title: "Remorse Purse", note: "From missed commitments", detail: "Missed commitments move their allocation here. Donations use only Remorse RDM, never Base, Reward, or Peer Awards.", color: palette.coral },
  { id: "peer", title: "Peer Awards", note: "From group goals", detail: "Awards received from group goals are kept here, separately from your other purses.", color: palette.purple },
];

const transactionIcons: Record<string, IconName> = {
  habit: "file-document-outline", goal: "file-document-outline", gratitude: "water-outline", deed: "white-balance-sunny", stake: "calendar-month-outline",
  grant: "gift-outline", airdrop: "gift-outline", game: "gamepad-variant-outline", remorse: "calendar-alert", peer: "account-group-outline", charity: "hand-heart-outline", redeem: "gift-outline",
};

const purseNames: Record<Purse, string> = { base: "Base", reward: "Reward", remorse: "Remorse", peer: "Peer Awards" };

export default function WalletScreen() {
  const focused = useIsFocused();
  const [activityOpen, setActivityOpen] = useState(true);
  const [expandedPurse, setExpandedPurse] = useState<Purse | null>(null);
  const wallet = useQuery({
    ...trpc.rdm.wallet.summary.queryOptions(),
    enabled: focused,
    refetchInterval: focused ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

  if (wallet.isLoading) return <LoadingState label="Counting your RDM…" />;
  if (wallet.error || !wallet.data) return <ErrorState message={wallet.error?.message ?? "Wallet unavailable."} onRetry={() => void wallet.refetch()} />;

  const data = wallet.data;
  const purseTotal = purses.reduce((sum, purse) => sum + data.wallet[purse.id], 0);
  const focusGardenUnlocked = data.unlockedRewards.includes("focus-garden");

  return (
    <FocusedScreen contentStyle={styles.screenContent}>
      <Text accessibilityRole="header" style={styles.title}>Wallet</Text>
      <View style={styles.balanceSection}>
        <Text style={styles.balanceLabel}>Total RDM</Text>
        <View style={styles.totalBalance}>
          <Text style={styles.balance}>{formatRdm(data.wallet.balance)}</Text>
          <RdmLogo width={62} height={30} />
        </View>
        <View accessibilityLabel={purses.map((purse) => `${purse.title}: ${formatRdm(data.wallet[purse.id])} RDM`).join(", ")} style={styles.purseMeter}>
          {purses.filter((purse) => data.wallet[purse.id] > 0).map((purse) => <View key={purse.id} style={[styles.purseSegment, { backgroundColor: purse.color, flex: purseTotal > 0 ? data.wallet[purse.id] / purseTotal : 0 }]} />)}
        </View>
      </View>

      <View style={styles.purseList}>
        {purses.map((purse) => (
          <View key={purse.id} style={styles.purseSection}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${purse.title}, ${formatRdm(data.wallet[purse.id])} RDM`} accessibilityState={{ expanded: expandedPurse === purse.id }} aria-expanded={expandedPurse === purse.id} onPress={() => setExpandedPurse((open) => open === purse.id ? null : purse.id)} style={({ pressed }) => [styles.purseRow, pressed && styles.pressed]}>
              <View style={[styles.purseDot, { backgroundColor: purse.color }]} />
              <View style={styles.rowCopy}><Text style={styles.purseTitle}>{purse.title}</Text><Text style={styles.caption}>{purse.note}</Text></View>
              <Text style={styles.purseAmount}>{formatRdm(data.wallet[purse.id])}</Text>
              <MaterialCommunityIcons name={expandedPurse === purse.id ? "chevron-down" : "chevron-right"} size={21} color={palette.muted} />
            </Pressable>
            {expandedPurse === purse.id ? <View style={styles.purseDetail}>
              <Text style={styles.detailCopy}>{purse.detail}</Text>
              {purse.id === "reward" && focusGardenUnlocked ? <Text style={styles.detailCopy}>Your previously recorded Focus Garden entitlement is saved. The skin is not available yet.</Text> : null}
            </View> : null}
          </View>
        ))}
      </View>

      <View style={styles.activitySection}>
        <Pressable accessibilityRole="button" accessibilityLabel="Recent activity" accessibilityState={{ expanded: activityOpen }} aria-expanded={activityOpen} onPress={() => setActivityOpen((open) => !open)} style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <MaterialCommunityIcons name={activityOpen ? "chevron-up" : "chevron-down"} size={24} color={palette.muted} />
        </Pressable>
        {activityOpen ? <View>
          {data.transactions.length === 0 ? <Text style={styles.emptyActivity}>No activity yet. Your recorded RDM movements will appear here.</Text> : null}
          {data.transactions.slice(0, 12).map((transaction) => {
            const incoming = transaction.direction === "in";
            const outgoing = transaction.direction === "out";
            const sign = incoming ? "+" : outgoing ? "−" : transaction.amount >= 0 ? "+" : "−";
            const directionLabel = transaction.purse && transaction.direction ? `${incoming ? "to" : "from"} ${purseNames[transaction.purse]}` : "RDM activity";
            return (
              <View key={transaction.id} style={styles.transactionRow}>
                <MaterialCommunityIcons name={transactionIcons[transaction.kind] ?? "swap-horizontal"} size={22} color={palette.muted} />
                <View style={styles.rowCopy}><Text style={styles.transactionTitle}>{transaction.title}</Text><Text style={styles.caption}>{formatTransactionDate(transaction.createdAt)}</Text></View>
                <View style={styles.transactionValue}>
                  <Text style={[styles.transactionAmount, { color: outgoing ? palette.coral : incoming ? palette.green : palette.muted }]}>{sign}{formatRdm(Math.abs(transaction.amount))} RDM</Text>
                  <Text style={styles.caption}>{directionLabel}</Text>
                </View>
              </View>
            );
          })}
        </View> : null}
      </View>

      <View style={styles.noteRow}><MaterialCommunityIcons name="information-outline" size={18} color={palette.muted} /><Text style={styles.note}>Pledged RDM is held separately until daily settlement.</Text></View>

      <View style={styles.donationSection}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Turn remorse into good</Text>
        <Text style={styles.detailCopy}>Donate 5 RDM from your Remorse Purse.</Text>
        {[
          { title: "Sponsor a student's school supplies", icon: "school-outline" as const },
          { title: "Donate for lake/river cleanup", icon: "waves" as const },
        ].map((cause) => <View key={cause.title} style={styles.donationCard}>
          <MaterialCommunityIcons name={cause.icon} size={22} color={palette.coral} />
          <View style={styles.rowCopy}><Text style={styles.purseTitle}>{cause.title}</Text><Text style={styles.caption}>Remorse Purse only</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Donate 5 RDM: ${cause.title}`} accessibilityState={{ disabled: true }} disabled style={styles.donateButton}><Text style={styles.donateLabel}>5 RDM</Text></Pressable>
        </View>)}
        <Text style={styles.detailCopy}>Donations are not enabled yet. No RDM will be deducted.</Text>
      </View>
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: 14 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 31 },
  balanceSection: { gap: 3 },
  balanceLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  totalBalance: { flexDirection: "row", alignItems: "center", gap: 14 },
  balance: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 46, lineHeight: 56 },
  purseMeter: { minHeight: 16, marginTop: 4, borderRadius: 10, flexDirection: "row", overflow: "hidden", backgroundColor: palette.line, gap: 2 },
  purseSegment: { minWidth: 0 },
  purseList: { borderTopWidth: 1, borderTopColor: palette.line },
  purseSection: { borderBottomWidth: 1, borderBottomColor: palette.line },
  purseRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10 },
  purseDot: { width: 22, height: 22, borderRadius: 11 },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  purseTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  caption: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 },
  purseAmount: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 23, flexShrink: 1 },
  purseDetail: { marginLeft: 33, paddingBottom: 13, gap: 7 },
  detailCopy: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  activitySection: { gap: 0 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 42, borderBottomWidth: 1, borderBottomColor: palette.line },
  sectionTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 14.5, lineHeight: 20 },
  transactionRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: palette.line },
  transactionTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  transactionValue: { alignItems: "flex-end", gap: 4, maxWidth: "42%" },
  transactionAmount: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, textAlign: "right" },
  emptyActivity: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, paddingVertical: 14 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginVertical: 4 },
  note: { flex: 1, color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  donationSection: { gap: 9, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 14 },
  donationCard: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 11 },
  donateButton: { minHeight: 40, paddingHorizontal: 9, borderWidth: 1, borderColor: palette.coral, borderRadius: 8, alignItems: "center", justifyContent: "center", opacity: 0.5 },
  donateLabel: { color: palette.coral, fontFamily: fonts.bodyMedium, fontSize: 12 },
  pressed: { opacity: 0.72 },
});
