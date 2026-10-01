import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  GroupErrorState,
  GroupPageHeader,
  GroupPrimaryButton,
  GroupScreen,
  GroupSectionLabel,
  GroupSurfaceCard,
} from "@/components/group-goal-ui";
import {
  LoadingState,
  ProgressBar,
} from "@/components/rdm-ui";
import { groupRewardStructureTitle } from "@/lib/group-goals";
import { LIVE_REFRESH_MS } from "@/lib/query-policy";
import { colors, fonts, formatRdm, radii, typography } from "@/lib/theme";
import { invalidateQueriesInBackground, trpc } from "@/utils/trpc";

export default function GroupWinnersScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? "");
  const focused = useIsFocused();
  const validId = /^[a-f\d]{24}$/i.test(id);
  const [specialAwarded, setSpecialAwarded] = useState(false);
  const preview = useQuery({
    ...trpc.rdm.groups.awardPreview.queryOptions({ id }),
    enabled: validId && focused,
    refetchInterval: focused ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });
  const award = useMutation(trpc.rdm.groups.award.mutationOptions({
    onSuccess: () => {
      router.replace({ pathname: "/(app)/group/[id]/result", params: { id } });
      invalidateQueriesInBackground(
        trpc.rdm.groups.pathKey(),
        trpc.rdm.wallet.summary.queryKey(),
        trpc.rdm.dashboard.queryKey(),
      );
    },
    onError: (error) => Alert.alert("Could not announce winners", error.message),
  }));

  if (preview.isLoading) return <LoadingState label="Calculating fair awards…" />;
  if (preview.error || !preview.data) {
    return <GroupErrorState message={preview.error?.message ?? "Awards are unavailable."} onBack={() => router.dismissTo("/(app)/(tabs)/groups")} onRetry={validId ? () => void preview.refetch() : undefined} />;
  }

  const { group, amounts } = preview.data;
  const ranked = group.members
    .map((member, index) => ({ ...member, award: amounts[index] ?? 0 }))
    .sort((left, right) => right.contribution - left.contribution);
  const totalAwards = amounts.reduce((sum, value) => sum + value, 0);

  return (
    <GroupScreen>
      <GroupPageHeader
        back
        onBack={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })}
        title={group.name}
      />
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>You reached the goal together.</Text>
        <Text style={styles.heroFraction}>{group.current} of {group.target} {group.unit} <MaterialCommunityIcons color={colors.growth} name="check-circle" size={16} /></Text>
        <ProgressBar color={colors.growth} progress={1} />
        <Text style={styles.intro}>The shared group target is complete. Awards are based on each member&apos;s contribution.</Text>
      </View>
      <GroupSectionLabel action={<Text style={styles.ownerOnly}>OWNER ONLY</Text>}>Confirm group awards</GroupSectionLabel>
      <GroupSurfaceCard style={styles.summaryCard}>
        <View style={styles.summaryRow}><MaterialCommunityIcons color={colors.gold} name="account-group-outline" size={20} /><Text style={styles.summaryLabel}>Reward structure</Text><Text style={styles.summaryValue}>{groupRewardStructureTitle(group.rewardStructure)}</Text></View>
        <View style={[styles.summaryRow, styles.summaryRowLast]}><MaterialCommunityIcons color={colors.gold} name="database-outline" size={20} /><Text style={styles.summaryLabel}>Backed pool</Text><Text style={styles.summaryValue}>{formatRdm(group.rewardPool)} RDM</Text></View>
      </GroupSurfaceCard>
      {ranked.map((member, index) => (
        <GroupSurfaceCard key={`${member.initials}-${index}`} style={[styles.winnerRow, member.award > 0 && styles.winnerSelected]}>
          <View style={[styles.rank, member.award > 0 && styles.rankSelected]}><Text style={[styles.rankText, member.award > 0 && styles.rankTextSelected]}>{index + 1}</Text></View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{member.initials}</Text></View>
          <View style={styles.memberCopy}>
            <Text style={styles.memberName}>{member.currentUser ? "You" : member.name}</Text>
            <Text style={styles.memberProgress}>{member.contribution} {group.unit} logged</Text>
          </View>
          <Text style={[styles.award, member.award === 0 && styles.zeroAward]}>{member.award > 0 ? `${formatRdm(member.award)} RDM` : "—"}</Text>
        </GroupSurfaceCard>
      ))}
      <View style={styles.totalRow}><Text style={styles.totalLabel}>Total group awards</Text><Text style={styles.totalValue}>{formatRdm(totalAwards)} RDM</Text></View>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: specialAwarded }} onPress={() => setSpecialAwarded((current) => !current)} style={styles.specialCard}>
        <View style={styles.specialIcon}><MaterialCommunityIcons color={colors.gold} name="trophy-outline" size={23} /></View>
        <View style={styles.memberCopy}>
          <Text style={styles.specialTitle}>Award a special winner collectible</Text>
          <Text style={styles.memberProgress}>Recognize the member with the highest contribution.</Text>
        </View>
        <View style={[styles.switchTrack, specialAwarded && styles.switchTrackOn]}><View style={[styles.switchKnob, specialAwarded && styles.switchKnobOn]} /></View>
      </Pressable>
      <GroupPrimaryButton color={colors.gold} icon="bullhorn-outline" label="Announce awards" loading={award.isPending} onPress={() => award.mutate({ id, specialAwarded })} />
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: radii.medium, borderWidth: 1, gap: 10, padding: 16 },
  heroTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 18, textAlign: "center" },
  heroFraction: { alignItems: "center", color: colors.ink, fontFamily: fonts.monoBold, fontSize: 14 },
  intro: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: "center" },
  ownerOnly: { color: colors.inkSoft, fontFamily: fonts.monoBold, fontSize: 9.5, letterSpacing: 0.5 },
  summaryCard: { gap: 0, padding: 0 },
  summaryRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 52, paddingHorizontal: 14 },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: { color: colors.ink, flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12 },
  summaryValue: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  totalRow: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: 10 },
  totalLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  totalValue: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 14 },
  winnerRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  winnerSelected: { backgroundColor: colors.goldTint, borderColor: "rgba(240,180,41,0.45)" },
  rank: { alignItems: "center", backgroundColor: colors.panelRaised, borderRadius: 8, height: 26, justifyContent: "center", width: 26 },
  rankSelected: { backgroundColor: colors.gold },
  rankText: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 11 },
  rankTextSelected: { color: colors.backgroundDeep },
  avatar: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 15, height: 30, justifyContent: "center", width: 30 },
  avatarText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 10 },
  memberCopy: { flex: 1 },
  memberName: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  memberProgress: { color: colors.inkSoft, marginTop: 2, ...typography.compactMeta },
  award: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 11 },
  zeroAward: { color: colors.inkSoft },
  specialCard: { alignItems: "center", borderColor: colors.plum, borderRadius: radii.medium, borderStyle: "dashed", borderWidth: 1, flexDirection: "row", gap: 10, padding: 14 },
  specialIcon: { alignItems: "center", backgroundColor: colors.goldTint, borderRadius: 15, height: 31, justifyContent: "center", width: 31 },
  specialTitle: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  switchTrack: { backgroundColor: colors.line, borderRadius: 12, height: 24, padding: 3, width: 42 },
  switchTrackOn: { backgroundColor: colors.plum },
  switchKnob: { backgroundColor: colors.ink, borderRadius: 9, height: 18, width: 18 },
  switchKnobOn: { transform: [{ translateX: 18 }] },
});
