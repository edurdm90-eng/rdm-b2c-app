import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import {
  GroupErrorState,
  GroupPageHeader,
  GroupPrimaryButton,
  GroupScreen,
  GroupSurfaceCard,
} from "@/components/group-goal-ui";
import {
  LoadingState,
} from "@/components/rdm-ui";
import { formatDayRange } from "@/lib/date";
import { groupRewardStructureTitle } from "@/lib/group-goals";
import { SETTLEMENT_REFRESH_MS } from "@/lib/query-policy";
import { colors, fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GroupResultScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? "");
  const focused = useIsFocused();
  const validId = /^[a-f\d]{24}$/i.test(id);
  const group = useQuery({
    ...trpc.rdm.groups.detail.queryOptions({ id }),
    enabled: validId && focused,
    refetchInterval: (query) => focused && !query.state.data?.awarded ? SETTLEMENT_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });

  if (group.isLoading) return <LoadingState label="Opening group results…" />;
  if (group.error || !group.data) {
    return <GroupErrorState message={group.error?.message ?? "Results are unavailable."} onBack={() => router.dismissTo("/(app)/(tabs)/groups")} onRetry={validId ? () => void group.refetch() : undefined} />;
  }
  if (!group.data.awarded) {
    return <GroupErrorState message="The group creator has not announced the results yet." onBack={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })} onRetry={() => void group.refetch()} />;
  }

  const data = group.data;
  const currentMember = data.members.find((member) => member.currentUser);
  const ranked = [...data.members].sort((left, right) => right.contribution - left.contribution);
  const winner = data.members.reduce((best, member) => (member.award > (best?.award ?? -1) ? member : best), data.members[0]);
  const resultMessage = `${data.name} complete! ${winner?.name ?? "The group"} led the group, and ${formatRdm(data.rewardPool)} RDM was distributed.`;

  return (
    <GroupScreen contentStyle={styles.screen}>
      <GroupPageHeader
        back
        onBack={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })}
        title="Group result"
      />
      <View style={styles.hero}>
        <View style={styles.trophy}><MaterialCommunityIcons color={colors.gold} name="trophy-outline" size={44} /></View>
        <Text style={styles.heroTitle}>Better, together.</Text>
        <Text style={styles.heroGroupName}>{data.name}</Text>
        <View style={styles.completePill}><MaterialCommunityIcons color={colors.growth} name="check-circle" size={13} /><Text style={styles.completePillText}>Complete</Text></View>
        <Text style={styles.heroSubtitle}>{data.target} {data.unit} · {data.members.length} members · {data.durationDays} days</Text>
        {data.startDayKey && data.endDayKey ? <Text style={styles.heroSubtitle}>{formatDayRange(data.startDayKey, data.endDayKey)}</Text> : null}
      </View>
      <GroupSurfaceCard style={styles.peerAwardCard}>
        <View style={styles.peerAwardIcon}><MaterialCommunityIcons color={colors.gold} name="gift-outline" size={22} /></View>
        <View style={styles.peerAwardCopy}>
          <Text style={styles.peerAwardTitle}>Your Peer Award · {formatRdm(currentMember?.award ?? 0)} RDM</Text>
          <Text style={styles.peerAwardHint}>Credited to your Peer Awards</Text>
        </View>
      </GroupSurfaceCard>
      {data.specialCollectible ? (
        <GroupSurfaceCard style={styles.specialBadge}>
          <View style={styles.specialTitleRow}><MaterialCommunityIcons color={colors.plum} name="gift-outline" size={16} /><Text style={styles.specialText}>{data.specialCollectible.title}</Text></View>
          <Text style={styles.specialMeta}>Owned by {data.specialCollectible.recipientName} · {data.specialCollectible.id}</Text>
        </GroupSurfaceCard>
      ) : null}
      <Text style={styles.sectionLabel}>Group contribution</Text>
      <GroupSurfaceCard style={styles.contributionCard}>
        {ranked.map((member, index) => (
          <View key={`${member.initials}-${index}`} style={styles.resultRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{member.initials}</Text></View>
            <Text style={styles.memberName}>{member.currentUser ? "You" : member.name}</Text>
            <Text style={styles.memberContribution}>{member.contribution} {data.unit}</Text>
          </View>
        ))}
        <View style={[styles.resultRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total {data.unit}</Text>
          <Text style={styles.totalValue}>{data.current}</Text>
        </View>
      </GroupSurfaceCard>
      <Text style={styles.distributionNote}>{formatRdm(data.rewardPool)} RDM distributed across {data.members.length} members via {groupRewardStructureTitle(data.rewardStructure)}.</Text>
      <View style={styles.actions}>
        <GroupPrimaryButton color={colors.growth} label="Back to groups" onPress={() => router.dismissTo("/(app)/(tabs)/groups")} />
        <GroupPrimaryButton color={colors.plum} icon="share-variant-outline" label="Share result" onPress={() => void Share.share({ message: resultMessage })} variant="outline" />
        <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/group/new")} style={styles.textLink}>
          <Text style={styles.textLinkLabel}>Create another group</Text>
          <MaterialCommunityIcons color={colors.plum} name="arrow-right" size={15} />
        </Pressable>
      </View>
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  hero: { alignItems: "center", gap: 4, paddingVertical: 8 },
  trophy: { alignItems: "center", backgroundColor: colors.goldTint, borderRadius: 33, height: 66, justifyContent: "center", width: 66, marginBottom: 3 },
  heroTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 21 },
  heroGroupName: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 13 },
  completePill: { alignItems: "center", backgroundColor: colors.growthTint, borderRadius: 999, flexDirection: "row", gap: 5, marginTop: 2, paddingHorizontal: 10, paddingVertical: 4 },
  completePillText: { color: colors.growth, fontFamily: fonts.bodyBold, fontSize: 10 },
  heroSubtitle: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  peerAwardCard: { alignItems: "center", backgroundColor: colors.goldTint, flexDirection: "row", gap: 12 },
  peerAwardIcon: { alignItems: "center", backgroundColor: "rgba(240,180,41,0.2)", borderRadius: 21, height: 42, justifyContent: "center", width: 42 },
  peerAwardCopy: { flex: 1 },
  peerAwardTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  peerAwardHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10.5, marginTop: 2 },
  specialBadge: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 14, gap: 2, paddingHorizontal: 11, paddingVertical: 7 },
  specialTitleRow: { alignItems: "center", flexDirection: "row", gap: 5 },
  specialText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 10 },
  specialMeta: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9.5, lineHeight: 14 },
  sectionLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },
  contributionCard: { gap: 0, padding: 0 },
  resultRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 48, paddingHorizontal: 14 },
  totalRow: { borderBottomWidth: 0 },
  totalLabel: { color: colors.ink, flex: 1, fontFamily: fonts.bodyBold, fontSize: 12 },
  totalValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 12 },
  avatar: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 15, height: 30, justifyContent: "center", width: 30 },
  avatarText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 10 },
  memberName: { color: colors.ink, flex: 1, fontFamily: fonts.bodyMedium, fontSize: 11 },
  memberContribution: { color: colors.inkSoft, fontFamily: fonts.monoBold, fontSize: 11 },
  distributionNote: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 16 },
  actions: { gap: 10 },
  textLink: { alignItems: "center", flexDirection: "row", gap: 5, justifyContent: "center", paddingVertical: 6 },
  textLinkLabel: { color: colors.plum, fontFamily: fonts.bodyMedium, fontSize: 12 },
});
