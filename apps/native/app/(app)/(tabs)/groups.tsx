import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  PrimaryButton,
  ProgressBar,
  SectionLabel,
  SurfaceCard,
} from "@/components/rdm-ui";
import { formatDayKey } from "@/lib/date";
import { groupGoalCategories, groupRewardStructureTitle, type GroupGoalCategory } from "@/lib/group-goals";
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
  const [category, setCategory] = useState<GroupGoalCategory>("Family");

  if (groups.isLoading) return <LoadingState label="Loading your groups…" />;
  if (groups.error || !groups.data) {
    return <ErrorState message={groups.error?.message ?? "Groups are unavailable."} onRetry={() => void groups.refetch()} />;
  }

  const activeGroups = groups.data.filter((group) => group.status === "active");
  const visibleGroups = groups.data.filter((group) => group.category === category);

  return (
    <AppScreen>
      <PageHeader
        title="Groups"
        subtitle="KEEP GOING, TOGETHER."
        trailing={(
          <View style={styles.headerActions}>
            <Pressable accessibilityLabel="Group settings" accessibilityRole="button" hitSlop={10} onPress={() => router.push("/(app)/group/settings")}>
              <MaterialCommunityIcons color={colors.inkSoft} name="cog-outline" size={23} />
            </Pressable>
            <PrimaryButton color={colors.growth} icon="plus" label="Create" onPress={() => router.push("/(app)/group/new")} style={styles.headerButton} />
          </View>
        )}
      />
      <View style={styles.overview}>
        <View><Text style={styles.overviewValue}>{activeGroups.length}</Text><Text style={styles.overviewLabel}>ACTIVE GOALS</Text></View>
        <View style={styles.overviewDivider} />
        <View><Text style={styles.overviewValue}>{groups.data.length}</Text><Text style={styles.overviewLabel}>ALL GROUPS</Text></View>
        <PrimaryButton color={colors.plum} icon="account-plus-outline" label="Join" onPress={() => router.push({ pathname: "/(app)/group/new", params: { mode: "join" } })} style={styles.joinButton} variant="outline" />
      </View>
      <View style={styles.categoryRow}>
        {groupGoalCategories.map((item) => (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: category === item.id }} key={item.id} onPress={() => setCategory(item.id)} style={[styles.categoryTab, category === item.id && styles.categoryTabActive]}>
            <MaterialCommunityIcons color={category === item.id ? colors.plum : colors.inkSoft} name={item.icon as never} size={19} />
            <Text style={[styles.categoryLabel, category === item.id && styles.categoryLabelActive]}>{item.id}</Text>
          </Pressable>
        ))}
      </View>
      <SectionLabel>{category} groups</SectionLabel>
      {visibleGroups.length > 0 ? visibleGroups.map((group) => (
        <SurfaceCard
          key={group.id}
          onPress={() => router.push({ pathname: "/(app)/group/[id]", params: { id: group.id } })}
          style={styles.groupCard}
        >
          <View style={styles.cardTop}>
            <View style={styles.groupMark}><MaterialCommunityIcons color={colors.plum} name="account-group-outline" size={24} /></View>
            <View style={[styles.statusChip, group.awarded && styles.completedChip, group.status === "expired" && styles.expiredChip]}>
              <Text style={[styles.statusText, group.awarded && styles.completedText, group.status === "expired" && styles.expiredText]}>{group.awarded ? "COMPLETE" : group.status === "expired" ? "EXPIRED" : group.targetHit ? "TARGET HIT" : `${group.daysRemaining} DAYS LEFT`}</Text>
            </View>
          </View>
          <Text style={styles.groupTitle}>{group.name}</Text>
          <Text style={styles.description}>{group.description || `Reach ${group.target} ${group.unit} together.`}</Text>
          <View style={styles.cardMetaRow}><Text style={styles.meta}>{group.members.length} member{group.members.length === 1 ? "" : "s"}</Text><Text style={styles.meta}>Pledged pool {formatRdm(group.rewardPool)} RDM</Text></View>
          <ProgressBar color={group.awarded ? colors.gold : colors.plum} progress={group.current / group.target} />
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>{group.current} / {group.target} {group.unit}</Text>
            <Text style={styles.dateText}>{group.endDayKey ? `Ends ${formatDayKey(group.endDayKey)}` : group.cadence}</Text>
          </View>
          <View style={styles.rewardRow}>
            <MaterialCommunityIcons name="trophy-outline" color={colors.gold} size={16} />
            <Text style={styles.rewardText}>{groupRewardStructureTitle(group.rewardStructure)}</Text>
            <MaterialCommunityIcons name="chevron-right" color={colors.inkSoft} size={18} />
          </View>
        </SurfaceCard>
      )) : (
        <SurfaceCard style={styles.emptyCard}>
          <MaterialCommunityIcons color={colors.plum} name={groupGoalCategories.find((item) => item.id === category)?.icon as never} size={34} />
          <Text style={styles.emptyTitle}>No {category.toLowerCase()} group yet</Text>
          <Text style={styles.description}>Start one in under a minute or join with an invite code.</Text>
          <PrimaryButton color={colors.plum} icon="plus" label="Create group" onPress={() => router.push("/(app)/group/new")} variant="outline" />
        </SurfaceCard>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerButton: { minHeight: 36, paddingHorizontal: 12 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 10 },
  overview: { alignItems: "center", backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: radii.medium, borderWidth: 1, flexDirection: "row", gap: 12, justifyContent: "space-between", padding: 13 },
  overviewValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 19 },
  overviewLabel: { color: colors.inkSoft, fontFamily: fonts.monoBold, fontSize: 7.5, letterSpacing: 0.55, marginTop: 2 },
  overviewDivider: { backgroundColor: colors.line, height: 31, width: 1 },
  joinButton: { minHeight: 35, paddingHorizontal: 11 },
  categoryRow: { flexDirection: "row", gap: 6 },
  categoryTab: { alignItems: "center", borderBottomColor: "transparent", borderBottomWidth: 2, flex: 1, gap: 4, paddingVertical: 8 },
  categoryTabActive: { borderBottomColor: colors.plum },
  categoryLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 10 },
  categoryLabelActive: { color: colors.ink },
  groupCard: { backgroundColor: colors.panelRaised, gap: 11, padding: 15 },
  cardTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  groupMark: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 20, height: 42, justifyContent: "center", width: 42 },
  statusChip: { backgroundColor: colors.plumTint, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5 },
  completedChip: { backgroundColor: colors.goldTint },
  expiredChip: { backgroundColor: colors.coralTint },
  statusText: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 8, letterSpacing: 0.5 },
  completedText: { color: colors.gold },
  expiredText: { color: colors.coral },
  groupTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 18 },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  cardMetaRow: { flexDirection: "row", justifyContent: "space-between" },
  meta: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10 },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressText: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 10 },
  dateText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9 },
  rewardRow: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 7, paddingTop: 10 },
  rewardText: { color: colors.gold, flex: 1, fontFamily: fonts.bodyMedium, fontSize: 10 },
  emptyCard: { alignItems: "center", gap: 9, paddingVertical: 22 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17 },
});
