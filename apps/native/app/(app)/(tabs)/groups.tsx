import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  PrimaryButton,
  ProgressBar,
  SurfaceCard,
} from "@/components/rdm-ui";
import { initialsForGroupName } from "@/lib/group-goals";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GroupsScreen() {
  const focused = useIsFocused();
  const groups = useQuery({
    ...trpc.rdm.groups.list.queryOptions(),
    enabled: focused,
    refetchInterval: focused ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

  if (groups.isLoading) return <LoadingState label="Loading your groups…" />;
  if (groups.error || !groups.data) {
    return <ErrorState message={groups.error?.message ?? "Groups are unavailable."} onRetry={() => void groups.refetch()} />;
  }

  return (
    <AppScreen>
      <PageHeader
        title="Groups"
        subtitle="KEEP GOING, TOGETHER."
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
          <SurfaceCard key={group.id} style={styles.groupCard}>
            <View style={styles.cardTop}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initialsForGroupName(group.name)}</Text></View>
              <View style={styles.cardTopCopy}>
                <Text style={styles.groupTitle}>{group.name}</Text>
                <Text style={styles.memberCount}>{group.members.length} member{group.members.length === 1 ? "" : "s"}</Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{group.durationDays} day challenge</Text>
              <Text style={[styles.metaText, group.awarded && styles.metaGold, group.status === "expired" && styles.metaCoral]}>{rightMeta}</Text>
            </View>
            <View style={styles.progressRow}>
              <ProgressBar color={group.awarded ? colors.gold : colors.plum} progress={group.current / group.target} />
              <Text style={styles.percentText}>{percent}%</Text>
            </View>
            <View style={styles.poolRow}>
              <View style={styles.poolLabelRow}>
                <MaterialCommunityIcons color={colors.inkSoft} name="account-group-outline" size={15} />
                <Text style={styles.poolLabel}>Pledged pool</Text>
              </View>
              <Text style={styles.poolValue}>{formatRdm(group.rewardPool)} RDM</Text>
            </View>
            <PrimaryButton color={colors.growth} label="Open group" onPress={() => router.push({ pathname: "/(app)/group/[id]", params: { id: group.id } })} />
          </SurfaceCard>
        );
      }) : (
        <SurfaceCard style={styles.emptyCard}>
          <MaterialCommunityIcons color={colors.plum} name="account-group-outline" size={34} />
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.description}>Start one in under a minute or join with an invite code.</Text>
        </SurfaceCard>
      )}
      <View style={styles.footerActions}>
        <PrimaryButton color={colors.plum} icon="plus" label="Create group" onPress={() => router.push("/(app)/group/new")} style={styles.footerButton} variant="outline" />
        <PrimaryButton color={colors.plum} icon="view-grid-outline" label="Join with code" onPress={() => router.push({ pathname: "/(app)/group/new", params: { mode: "join" } })} style={styles.footerButton} variant="outline" />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  groupCard: { backgroundColor: colors.panelRaised, gap: 11, padding: 15 },
  cardTop: { alignItems: "center", flexDirection: "row", gap: 12 },
  avatar: { alignItems: "center", backgroundColor: colors.plum, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  avatarText: { color: colors.backgroundDeep, fontFamily: fonts.bodyBold, fontSize: 14 },
  cardTopCopy: { flex: 1 },
  groupTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 18 },
  memberCount: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  metaGold: { color: colors.gold },
  metaCoral: { color: colors.coral },
  progressRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  percentText: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 12, minWidth: 34, textAlign: "right" },
  poolRow: { flexDirection: "row", justifyContent: "space-between" },
  poolLabelRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  poolLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  poolValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 14 },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, textAlign: "center" },
  emptyCard: { alignItems: "center", gap: 9, paddingVertical: 22 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17 },
  footerActions: { flexDirection: "row", gap: 10 },
  footerButton: { flex: 1 },
});
