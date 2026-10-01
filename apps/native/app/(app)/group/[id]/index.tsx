import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  GroupAvatars,
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
import { formatDayKey } from "@/lib/date";
import { groupRewardStructureTitle, singularizeUnit } from "@/lib/group-goals";
import { LIVE_REFRESH_MS } from "@/lib/query-policy";
import { colors, fonts, formatRdm, radii, typography } from "@/lib/theme";
import { invalidateQueriesInBackground, queryClient, trpc } from "@/utils/trpc";

type DashboardTab = "progress" | "members";

export default function GroupDashboardScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? "");
  const focused = useIsFocused();
  const validId = /^[a-f\d]{24}$/i.test(id);
  const [tab, setTab] = useState<DashboardTab>("progress");
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState("");
  const [operationId, setOperationId] = useState(() => Crypto.randomUUID());
  const group = useQuery({
    ...trpc.rdm.groups.detail.queryOptions({ id }),
    enabled: validId && focused,
    refetchInterval: focused ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });
  const logContribution = useMutation(trpc.rdm.groups.logContribution.mutationOptions({
    onSuccess: (updated) => {
      queryClient.setQueryData(trpc.rdm.groups.detail.queryOptions({ id }).queryKey, updated);
      setOperationId(Crypto.randomUUID());
      setAmount(1);
      setNote("");
      invalidateQueriesInBackground(
        trpc.rdm.groups.list.queryKey(),
        trpc.rdm.dashboard.queryKey(),
      );
    },
    onError: (error) => Alert.alert("Could not log progress", error.message),
  }));

  if (group.isLoading) return <LoadingState label="Opening group dashboard…" />;
  if (group.error || !group.data) {
    return <GroupErrorState message={group.error?.message ?? "Group not found."} onBack={() => router.dismissTo("/(app)/(tabs)/groups")} onRetry={validId ? () => void group.refetch() : undefined} />;
  }

  const data = group.data;
  const currentMember = data.members.find((member) => member.currentUser);
  const dayNumber = Math.min(data.durationDays, Math.max(1, data.durationDays - data.daysRemaining + 1));
  const progressUnit = amount === 1 ? singularizeUnit(data.unit) : data.unit;
  function submitProgress() {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      Alert.alert("Add progress", `Enter a positive amount up to 1,000 ${data.unit}.`);
      return;
    }
    logContribution.mutate({ id, amount, operationId, note: note.trim() || undefined });
  }

  return (
    <GroupScreen>
      <GroupPageHeader
        back
        onBack={() => router.dismissTo("/(app)/(tabs)/groups")}
        title="Back to Groups"
        subtitle={`${data.category.toUpperCase()} · ${data.awarded ? "COMPLETE" : data.status === "expired" ? "EXPIRED" : data.targetHit ? "TARGET HIT" : `ENDS ${data.endDayKey ? formatDayKey(data.endDayKey).toUpperCase() : "SOON"}`}`}
        trailing={(
          <Pressable
            accessibilityLabel="Group settings"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => router.push("/(app)/group/settings")}
          >
            <MaterialCommunityIcons color={colors.inkSoft} name="dots-horizontal" size={22} />
          </Pressable>
        )}
      />
      <GroupSurfaceCard style={styles.poolCard}>
        <View style={styles.poolHero}><View style={styles.poolIcon}><MaterialCommunityIcons color={colors.plum} name="run" size={27} /></View><View><Text style={styles.poolName}>{data.name}</Text><Text style={styles.progressCopy}>{data.status === "active" && !data.targetHit ? `Day ${dayNumber} of ${data.durationDays}` : `${data.daysRemaining} days remaining`}</Text></View></View>
        <View style={styles.metrics}>
          <View style={styles.metric}><Text numberOfLines={1} style={styles.metricValue}>{data.current} / {data.target}</Text><Text numberOfLines={2} style={styles.metricLabel}>Total {data.unit}</Text></View>
          <View style={styles.metric}><Text numberOfLines={1} style={styles.metricValue}>{Math.round((data.current / data.target) * 100)}%</Text><Text style={styles.metricLabel}>completed</Text></View>
          <View style={styles.metric}><Text numberOfLines={1} style={styles.metricValue}>{formatRdm(data.rewardPool)} RDM</Text><Text style={styles.metricLabel}>Group pool</Text></View>
        </View>
        <ProgressBar color={data.targetHit ? colors.gold : colors.plum} progress={data.current / data.target} />
        <View style={styles.poolFooter}>
          <Text style={styles.poolMeta}>{data.daysRemaining} days left · {data.cadence} check-in</Text>
          <Text style={styles.poolMeta}>{groupRewardStructureTitle(data.rewardStructure)}</Text>
        </View>
      </GroupSurfaceCard>

      <View style={styles.tabRow}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === "progress" }} onPress={() => setTab("progress")} style={[styles.tab, tab === "progress" && styles.tabActive]}>
          <Text style={[styles.tabLabel, tab === "progress" && styles.tabLabelActive]}>Progress</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === "members" }} onPress={() => setTab("members")} style={[styles.tab, tab === "members" && styles.tabActive]}>
          <Text style={[styles.tabLabel, tab === "members" && styles.tabLabelActive]}>Members</Text>
        </Pressable>
      </View>

      {tab === "progress" ? (
        <>
          <GroupSurfaceCard style={styles.descriptionCard}>
            <MaterialCommunityIcons name="flag-checkered" color={colors.plum} size={20} />
            <Text style={styles.description}>{data.description || `Reach ${data.target} ${data.unit} together.`}</Text>
          </GroupSurfaceCard>

          {data.status === "active" && !data.targetHit && !data.awarded && !currentMember?.loggedCurrentPeriod ? (
            <GroupSurfaceCard style={styles.logCard}>
              <GroupSectionLabel action={<Text style={styles.unitChip}>{data.unit}</Text>}>Log today&apos;s progress</GroupSectionLabel>
              <View style={styles.counterRow}>
                <Pressable accessibilityLabel="Decrease amount" accessibilityRole="button" style={styles.counterButton} onPress={() => setAmount((current) => Math.max(1, current - 1))}><Text style={styles.counterButtonText}>−</Text></Pressable>
                <Text style={styles.counterValue}>{amount}</Text>
                <Pressable accessibilityLabel="Increase amount" accessibilityRole="button" style={styles.counterButton} onPress={() => setAmount((current) => Math.min(1000, current + 1))}><Text style={styles.counterButtonText}>+</Text></Pressable>
              </View>
              <Text style={styles.helper}>You have logged {currentMember?.contribution ?? 0} {data.unit}. You can submit one combined update each {data.cadence === "weekly" ? "week" : "day"}.</Text>
              <Text style={styles.noteLabel}>Optional note</Text>
              <TextInput
                accessibilityLabel="Optional progress note"
                maxLength={100}
                onChangeText={setNote}
                placeholder="Add a note about today's progress"
                placeholderTextColor={colors.inkSoft}
                style={styles.noteInput}
                value={note}
              />
              <Text style={styles.charCount}>{note.length}/100</Text>
              <GroupPrimaryButton color={colors.growth} label={`Log ${amount} ${progressUnit}`} loading={logContribution.isPending} onPress={submitProgress} />
            </GroupSurfaceCard>
          ) : null}

          {data.status === "active" && !data.targetHit && currentMember?.loggedCurrentPeriod ? (
            <GroupSurfaceCard style={styles.loggedCard}>
              <Text style={styles.loggedTitle}>Progress logged ✓</Text>
              <Text style={styles.helper}>Your next {data.cadence === "weekly" ? "weekly" : "daily"} check-in opens in the next period.</Text>
            </GroupSurfaceCard>
          ) : null}

          {data.status === "expired" ? (
            <GroupSurfaceCard style={styles.expiredCard}>
              <Text style={styles.expiredTitle}>This goal ended</Text>
              <Text style={styles.helper}>The target was not completed before the deadline. Every backed member pledge has been returned to its owner&apos;s Base Purse.</Text>
            </GroupSurfaceCard>
          ) : null}

          {data.targetHit && data.canAward && !data.awarded ? (
            <GroupPrimaryButton color={colors.gold} icon="trophy-outline" label="Choose winners" onPress={() => router.push({ pathname: "/(app)/group/[id]/winners", params: { id } })} />
          ) : null}
          {data.targetHit && !data.canAward && !data.awarded ? (
            <GroupSurfaceCard style={styles.waitingCard}><Text style={styles.waitingTitle}>Target reached</Text><Text style={styles.helper}>The creator can announce awards now. If they do not, awards are distributed automatically after the group deadline.</Text></GroupSurfaceCard>
          ) : null}
          {data.awarded ? (
            <GroupPrimaryButton color={colors.gold} icon="trophy" label="View group results" onPress={() => router.push({ pathname: "/(app)/group/[id]/result", params: { id } })} />
          ) : null}
        </>
      ) : (
        <>
          <GroupSectionLabel action={<Text style={styles.memberCount}>{data.members.length} MEMBERS</Text>}>Members & pledges</GroupSectionLabel>
          <GroupSurfaceCard>
            <View style={styles.avatarHeader}><GroupAvatars members={data.members} /></View>
            {data.members.map((member, index) => (
              <View key={`${member.initials}-${index}`} style={styles.memberRow}>
                <View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{member.initials}</Text></View>
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName}>{member.currentUser ? "You" : member.name}</Text>
                  <Text style={styles.memberProgress}>{member.contribution} {data.unit} logged</Text>
                  {member.lastNote ? <Text numberOfLines={2} style={styles.memberNote}>“{member.lastNote}”</Text> : null}
                </View>
                <Text style={styles.memberPledge}>{formatRdm(member.pledgeAmount)} RDM</Text>
              </View>
            ))}
            {data.status === "active" && !data.targetHit ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(app)/group/[id]/invite", params: { id } })} style={styles.inviteRow}>
                <View style={styles.inviteIcon}><MaterialCommunityIcons color={colors.plum} name="account-plus-outline" size={18} /></View>
                <Text style={styles.inviteLabel}>Invite people</Text>
                <MaterialCommunityIcons color={colors.inkSoft} name="chevron-right" size={20} />
              </Pressable>
            ) : null}
          </GroupSurfaceCard>
        </>
      )}
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  poolCard: { backgroundColor: colors.panelRaised, gap: 14, padding: 16 },
  poolHero: { alignItems: "center", flexDirection: "row", gap: 11 },
  poolIcon: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 23, height: 46, justifyContent: "center", width: 46 },
  poolName: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 17 },
  progressCopy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  metrics: { borderBottomColor: colors.line, borderBottomWidth: 1, borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingVertical: 11 },
  metric: { flex: 1, minWidth: 0, paddingHorizontal: 3 },
  metricValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 14, textAlign: "center" },
  metricLabel: { color: colors.inkSoft, flexShrink: 1, fontFamily: fonts.body, fontSize: 10, lineHeight: 14, marginTop: 3, textAlign: "center" },
  poolFooter: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  poolMeta: { color: colors.inkSoft, ...typography.compactMeta },
  tabRow: { backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: 9, borderWidth: 1, flexDirection: "row", padding: 3 },
  tab: { alignItems: "center", borderRadius: 7, flex: 1, paddingVertical: 9 },
  tabActive: { backgroundColor: "#263541" },
  tabLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 12 },
  tabLabelActive: { color: colors.ink },
  descriptionCard: { alignItems: "center", flexDirection: "row", gap: 10 },
  description: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  memberCount: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 10 },
  avatarHeader: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingBottom: 10 },
  memberRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 58 },
  memberAvatar: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 16, height: 32, justifyContent: "center", width: 32 },
  memberAvatarText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 10 },
  memberCopy: { flex: 1 },
  memberName: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  memberProgress: { color: colors.inkSoft, marginTop: 2, ...typography.compactMeta },
  memberNote: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, fontStyle: "italic", lineHeight: 14, marginTop: 3 },
  memberPledge: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 11 },
  inviteRow: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 52 },
  inviteIcon: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 15, height: 30, justifyContent: "center", width: 30 },
  inviteLabel: { color: colors.plum, flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12 },
  logCard: { gap: 12 },
  unitChip: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" },
  counterRow: { alignItems: "center", flexDirection: "row", gap: 20, justifyContent: "center" },
  counterButton: { alignItems: "center", backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: 12, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  counterButtonText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 22 },
  counterValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 28, minWidth: 60, textAlign: "center" },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  noteLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 11 },
  noteInput: { backgroundColor: colors.background, borderColor: colors.line, borderRadius: 10, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 13, height: 44, paddingHorizontal: 12 },
  charCount: { alignSelf: "flex-end", color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 10 },
  waitingCard: { alignItems: "center", backgroundColor: colors.goldTint, gap: 6 },
  waitingTitle: { color: colors.gold, fontFamily: fonts.display, fontSize: 17 },
  loggedCard: { alignItems: "center", backgroundColor: colors.growthTint, gap: 6 },
  loggedTitle: { color: colors.growth, fontFamily: fonts.display, fontSize: 17 },
  expiredCard: { alignItems: "center", backgroundColor: colors.coralTint, gap: 6 },
  expiredTitle: { color: colors.coral, fontFamily: fonts.display, fontSize: 17 },
});
