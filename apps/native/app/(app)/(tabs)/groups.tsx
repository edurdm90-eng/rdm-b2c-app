import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GroupAiNote, GroupAvatars } from "@/components/group-goal-ui";
import {
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  Pill,
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
        title="Group Goals"
        subtitle={`${activeGroups.length} ACTIVE ACROSS ALL GROUPS`}
        trailing={(
          <View style={styles.headerActions}>
            <Pressable accessibilityLabel="Group settings" accessibilityRole="button" hitSlop={10} onPress={() => router.push("/(app)/group/settings")}>
              <MaterialCommunityIcons color={colors.inkSoft} name="cog-outline" size={23} />
            </Pressable>
            <PrimaryButton color={colors.plum} icon="plus" label="New" onPress={() => router.push("/(app)/group/new")} style={styles.headerButton} />
          </View>
        )}
      />
      <View style={styles.quickActions}>
        <PrimaryButton color={colors.plum} icon="account-plus-outline" label="Join with code" onPress={() => router.push({ pathname: "/(app)/group/new", params: { mode: "join" } })} variant="outline" />
      </View>
      <GroupAiNote label="Use AI to plan a group goal" />
      <View style={styles.categoryRow}>
        {groupGoalCategories.map((item) => (
          <Pill key={item.id} active={category === item.id} color={colors.plum} label={`${item.icon} ${item.id}`} onPress={() => setCategory(item.id)} />
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
            <GroupAvatars members={group.members} />
            <View style={[styles.statusChip, group.awarded && styles.completedChip, group.status === "expired" && styles.expiredChip]}>
              <Text style={[styles.statusText, group.awarded && styles.completedText, group.status === "expired" && styles.expiredText]}>{group.awarded ? "COMPLETE" : group.status === "expired" ? "EXPIRED" : group.targetHit ? "TARGET HIT" : `${group.daysRemaining} DAYS LEFT`}</Text>
            </View>
          </View>
          <Text style={styles.groupTitle}>{group.name}</Text>
          <Text style={styles.description}>{group.description || `Reach ${group.target} ${group.unit} together.`}</Text>
          <Text style={styles.meta}>{group.members.length} member{group.members.length === 1 ? "" : "s"} · Pool: {formatRdm(group.rewardPool)} RDM</Text>
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
          <Text style={styles.emptyIcon}>{groupGoalCategories.find((item) => item.id === category)?.icon}</Text>
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
  quickActions: { alignItems: "flex-start" },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  groupCard: { gap: 10 },
  cardTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  statusChip: { backgroundColor: colors.plumTint, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5 },
  completedChip: { backgroundColor: colors.goldTint },
  expiredChip: { backgroundColor: colors.coralTint },
  statusText: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 8, letterSpacing: 0.5 },
  completedText: { color: colors.gold },
  expiredText: { color: colors.coral },
  groupTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 19 },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  meta: { color: colors.plum, fontFamily: fonts.mono, fontSize: 10 },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressText: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 10 },
  dateText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9 },
  rewardRow: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 7, paddingTop: 10 },
  rewardText: { color: colors.gold, flex: 1, fontFamily: fonts.bodyMedium, fontSize: 10 },
  emptyCard: { alignItems: "center", gap: 9, paddingVertical: 22 },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17 },
});
