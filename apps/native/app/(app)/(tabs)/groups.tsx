import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ErrorState,
  LoadingState,
} from "@/components/rdm-ui";
import {
  GroupPageHeader,
  GroupPrimaryButton,
  GroupScreen,
  GroupSurfaceCard,
} from "@/components/group-goal-ui";
import { groupAvatarColor, initialsForGroupName } from "@/lib/group-goals";
import { LIVE_REFRESH_MS } from "@/lib/query-policy";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GroupsScreen() {
  const focused = useIsFocused();
  const groups = useQuery({
    ...trpc.rdm.groups.list.queryOptions(),
    enabled: focused,
    refetchInterval: focused ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });

  if (groups.isLoading) return <LoadingState label="Loading your groups…" />;
  if (groups.error || !groups.data) {
    return <ErrorState message={groups.error?.message ?? "Groups are unavailable."} onRetry={() => void groups.refetch()} />;
  }

  return (
    <GroupScreen>
      <GroupPageHeader
        title="Groups"
        subtitle="Keep going, together."
        trailing={(
          <Pressable accessibilityLabel="Group settings" accessibilityRole="button" hitSlop={10} onPress={() => router.push("/(app)/group/settings")}>
            <MaterialCommunityIcons color={colors.inkSoft} name="cog-outline" size={23} />
          </Pressable>
        )}
      />
      {groups.data.length > 0 ? groups.data.map((group) => {
        const percent = group.target > 0 ? Math.round((group.current / group.target) * 100) : 0;
        const rightMeta = group.awarded
          ? "Complete"
          : group.status === "expired"
            ? "Expired"
            : `${group.current} of ${group.target} ${group.unit}`;
        return (
          <GroupSurfaceCard key={group.id} style={styles.groupCard}>
            <View style={styles.cardTop}>
              <View style={[styles.avatar, { backgroundColor: groupAvatarColor(group.id) }]}><Text style={styles.avatarText}>{initialsForGroupName(group.name)}</Text></View>
              <View style={styles.cardTopCopy}>
                <Text style={styles.groupTitle}>{group.name}</Text>
                <Text style={styles.memberCount}>{group.members.length} member{group.members.length === 1 ? "" : "s"}</Text>
              </View>
              <MaterialCommunityIcons color={colors.inkSoft} name="chevron-right" size={23} />
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{group.durationDays} day challenge</Text>
              <Text style={[styles.metaText, group.awarded && styles.metaGold, group.status === "expired" && styles.metaCoral]}>{rightMeta}</Text>
            </View>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { backgroundColor: group.awarded ? colors.gold : colors.plum, width: `${Math.min(100, Math.max(0, percent))}%` }]} /></View>
              <Text style={styles.percentText}>{percent}%</Text>
            </View>
            <View style={styles.poolBlock}>
              <View style={styles.poolLabelRow}>
                <MaterialCommunityIcons color={colors.inkSoft} name="account-group-outline" size={15} />
                <Text style={styles.poolLabel}>Pledged pool</Text>
              </View>
              <Text style={styles.poolValue}>{formatRdm(group.rewardPool)} RDM</Text>
            </View>
            <GroupPrimaryButton color={colors.growth} label="Open group" onPress={() => router.push({ pathname: "/(app)/group/[id]", params: { id: group.id } })} />
          </GroupSurfaceCard>
        );
      }) : (
        <GroupSurfaceCard style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons color={colors.plum} name="account-group-outline" size={38} />
          </View>
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.description}>Bring a few people together around one clear goal. Everyone pledges from their own Base Purse.</Text>
        </GroupSurfaceCard>
      )}
      <View style={styles.footerActions}>
        <GroupPrimaryButton color={colors.plum} icon="plus" label="Create group" onPress={() => router.push("/(app)/group/new")} style={styles.footerButton} variant="outline" />
        <GroupPrimaryButton color={colors.plum} icon="view-grid-outline" label="Join with code" onPress={() => router.push({ pathname: "/(app)/group/new", params: { mode: "join" } })} style={styles.footerButton} variant="outline" />
      </View>
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  groupCard: { gap: 12, padding: 16 },
  cardTop: { alignItems: "center", flexDirection: "row", gap: 12 },
  avatar: { alignItems: "center", backgroundColor: colors.plum, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  avatarText: { color: colors.backgroundDeep, fontFamily: fonts.bodyBold, fontSize: 14 },
  cardTopCopy: { flex: 1 },
  groupTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 18 },
  memberCount: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  metaRow: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: 12 },
  metaText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  metaGold: { color: colors.gold },
  metaCoral: { color: colors.coral },
  progressRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 10, paddingBottom: 12 },
  progressTrack: { backgroundColor: "#2A3541", borderRadius: 5, flex: 1, height: 9, overflow: "hidden" },
  progressFill: { borderRadius: 5, height: "100%" },
  percentText: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 12, minWidth: 34, textAlign: "right" },
  poolBlock: { gap: 4 },
  poolLabelRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  poolLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  poolValue: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 22 },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, textAlign: "center" },
  emptyCard: { alignItems: "center", gap: 10, paddingHorizontal: 25, paddingVertical: 34 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 32, height: 64, justifyContent: "center", marginBottom: 2, width: 64 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 20 },
  footerActions: { flexDirection: "row", gap: 10, marginTop: 1 },
  footerButton: { flex: 1 },
});
