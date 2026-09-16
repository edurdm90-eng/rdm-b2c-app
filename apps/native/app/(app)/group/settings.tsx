import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ErrorState,
  LoadingState,
} from "@/components/rdm-ui";
import {
  GroupPageHeader,
  GroupScreen,
  GroupSurfaceCard,
} from "@/components/group-goal-ui";
import { colors, fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GroupSettingsScreen() {
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions());

  if (wallet.isLoading) return <LoadingState label="Opening group settings…" />;
  if (wallet.error || !wallet.data) {
    return <ErrorState message={wallet.error?.message ?? "Group settings are unavailable."} onRetry={() => void wallet.refetch()} />;
  }

  const items = [
    {
      description: `Base Purse: ${formatRdm(wallet.data.wallet.base)} RDM`,
      icon: "credit-card-plus-outline" as const,
      label: "Top up RDM",
      onPress: () => router.push("/(app)/group/top-up"),
    },
    {
      description: "Review Base, Reward, Remorse, and Peer purses",
      icon: "wallet-outline" as const,
      label: "Wallet & transactions",
      onPress: () => router.push("/(app)/(tabs)/wallet"),
    },
    {
      description: "Name, photo, and linked email · coming later",
      icon: "account-outline" as const,
      label: "Profile & account",
      onPress: null,
    },
    {
      description: "Group reminders and invite alerts · coming later",
      icon: "bell-outline" as const,
      label: "Notifications",
      onPress: null,
    },
    {
      description: "Bank or UPI redemption accounts · coming later",
      icon: "link-variant" as const,
      label: "Linked accounts",
      onPress: null,
    },
    {
      description: "Group goal FAQs and support · coming later",
      icon: "help-circle-outline" as const,
      label: "Help & support",
      onPress: null,
    },
  ];

  return (
    <GroupScreen>
      <GroupPageHeader
        back
        onBack={() => router.dismissTo("/(app)/(tabs)/groups")}
        title="Group settings"
      />
      <GroupSurfaceCard>
        {items.map((item) => (
          <Pressable accessibilityRole={item.onPress ? "button" : undefined} disabled={!item.onPress} key={item.label} onPress={item.onPress ?? undefined} style={styles.row}>
            <View style={styles.icon}><MaterialCommunityIcons color={colors.plum} name={item.icon} size={20} /></View>
            <View style={styles.copy}>
              <Text style={styles.title}>{item.label}</Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
            {item.onPress
              ? <MaterialCommunityIcons color={colors.inkSoft} name="chevron-right" size={22} />
              : <Text style={styles.soon}>SOON</Text>}
          </Pressable>
        ))}
      </GroupSurfaceCard>
      <GroupSurfaceCard style={styles.note}>
        <Text style={styles.noteTitle}>How group pledges work</Text>
        <Text style={styles.description}>Each member funds their own pledge from Base. Completed goals distribute the backed pool to Peer; expired goals return every backed pledge to Base.</Text>
      </GroupSurfaceCard>
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 11, minHeight: 68 },
  icon: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 11, height: 38, justifyContent: "center", width: 38 },
  copy: { flex: 1 },
  title: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, lineHeight: 16, marginTop: 3 },
  note: { backgroundColor: "transparent", borderBottomWidth: 0, borderLeftWidth: 0, borderRadius: 0, borderRightWidth: 0, gap: 6, marginTop: 6, paddingHorizontal: 4, paddingTop: 20 },
  noteTitle: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 14 },
  soon: { color: colors.inkSoft, fontFamily: fonts.monoBold, fontSize: 8 },
});
