import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  GroupAvatars,
  GroupPageHeader,
  GroupPrimaryButton,
  GroupScreen,
  GroupSectionLabel,
  GroupSurfaceCard,
} from "@/components/group-goal-ui";
import { focusedTypography } from "@/components/focused-ui";
import { formatDayRange } from "@/lib/date";
import { groupRewardStructureDescription, groupRewardStructureTitle } from "@/lib/group-goals";
import { LIVE_REFRESH_MS } from "@/lib/query-policy";
import { colors, fonts, formatRdm, radii, typography } from "@/lib/theme";
import { invalidateQueriesInBackground, trpc } from "@/utils/trpc";

export function GroupJoinFlow({ initialCode }: { initialCode?: string }) {
  const focused = useIsFocused();
  const [inviteCode, setInviteCode] = useState(() => String(initialCode ?? "").slice(0, 6).toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const normalizedInviteCode = inviteCode.trim().toUpperCase();
  const preview = useQuery({
    ...trpc.rdm.groups.preview.queryOptions({ inviteCode: normalizedInviteCode }),
    enabled: normalizedInviteCode.length === 6 && focused,
    retry: false,
    refetchInterval: focused && normalizedInviteCode.length === 6 ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });
  const joinGroup = useMutation(trpc.rdm.groups.join.mutationOptions({
    onSuccess: (group) => {
      router.replace({ pathname: "/(app)/group/[id]", params: { id: group.id } });
      invalidateQueriesInBackground(
        trpc.rdm.groups.pathKey(),
        trpc.rdm.wallet.summary.queryKey(),
        trpc.rdm.dashboard.queryKey(),
      );
    },
    onError: (mutationError) => setError(mutationError.message),
  }));
  const joinMinimum = preview.data?.group.minimumPledge ?? 0;
  const baseBalance = preview.data?.profile.wallet.base ?? 0;
  const baseAfterJoin = baseBalance - joinMinimum;
  const joinHasFunds = joinMinimum > 0 ? baseBalance >= joinMinimum : baseBalance >= 0;
  const commitmentCount = preview.data?.group.pledgeBasis === "per_activity"
    ? preview.data.group.expectedActivities
    : preview.data?.group.durationDays ?? 0;
  const commitmentUnit = preview.data?.group.pledgeBasis === "per_activity"
    ? commitmentCount === 1 ? "activity" : "activities"
    : commitmentCount === 1 ? "day" : "days";
  // serializeGroup doesn't expose creatorId; the creator is always inserted first and
  // only ever appended to, so members[0] is reliably the organiser.
  const organiserName = preview.data?.group.members[0]?.name ?? "the organiser";
  const isValidCode = !!preview.data && !preview.error;

  function submitJoin() {
    if (!preview.data || preview.error) {
      setError("Enter a valid six-character invite code first.");
      return;
    }
    if (preview.data.alreadyJoined) {
      router.replace({ pathname: "/(app)/group/[id]", params: { id: preview.data.group.id } });
      return;
    }
    if (!joinHasFunds) {
      setError("Your Base Purse does not have enough RDM for this pledge.");
      return;
    }
    setError(null);
    joinGroup.mutate({ inviteCode: normalizedInviteCode, pledgeAmount: joinMinimum });
  }

  return (
    <GroupScreen>
      <GroupPageHeader
        back
        onBack={() => router.dismissTo("/(app)/(tabs)/groups")}
        title="Join group"
      />
      <View style={styles.intro}><Text style={styles.introTitle}>Enter invite code</Text><Text style={styles.introBody}>Ask your friend for the code.</Text></View>
      <View style={styles.codeInputWrap}>
        <TextInput
          accessibilityLabel="Group invite code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          onChangeText={(value) => {
            setInviteCode(value.toUpperCase());
            setError(null);
          }}
          placeholder="RDM7K2"
          placeholderTextColor={colors.inkSoft}
          style={[styles.input, styles.codeInput, isValidCode && styles.codeInputValid]}
          value={inviteCode}
        />
        {isValidCode ? <MaterialCommunityIcons color={colors.growth} name="check-circle" size={22} style={styles.codeCheck} /> : null}
      </View>
      {preview.isFetching ? <Text style={styles.helper}>Checking invite…</Text> : null}
      {isValidCode ? <Text style={styles.validText}>Valid group code.</Text> : null}
      {preview.error ? (
        <View>
          <Text style={styles.error}>{preview.error.message}</Text>
          <GroupPrimaryButton label="Check invite again" onPress={() => void preview.refetch()} variant="outline" />
        </View>
      ) : null}
      {preview.data ? (
        <>
          <GroupSectionLabel>Group preview</GroupSectionLabel>
          <GroupSurfaceCard style={styles.previewCard}>
            <View style={styles.previewTop}>
              <View style={styles.runningIcon}><MaterialCommunityIcons color={colors.plum} name="run" size={25} /></View>
              <View style={styles.previewCopy}>
                <Text style={styles.previewTitle}>{preview.data.group.name}</Text>
                <Text style={styles.description}>Organised by {organiserName}</Text>
              </View>
              <View style={styles.categoryChip}><Text style={styles.categoryChipLabel}>{preview.data.group.category}</Text></View>
            </View>
            <View style={styles.previewMetrics}>
              <View style={styles.previewMetric}><MaterialCommunityIcons color={colors.inkSoft} name="calendar-range" size={16} /><Text numberOfLines={2} style={styles.previewMeta}>{formatDayRange(preview.data.group.startDayKey, preview.data.group.endDayKey)}</Text></View>
              <View style={styles.previewMetric}><MaterialCommunityIcons color={colors.inkSoft} name="flag-checkered" size={16} /><Text numberOfLines={2} style={styles.previewMeta}>{preview.data.group.target} {preview.data.group.unit}</Text></View>
              <View style={styles.previewMetric}><MaterialCommunityIcons color={colors.inkSoft} name="account-group-outline" size={16} /><Text numberOfLines={2} style={styles.previewMeta}>{preview.data.group.durationDays} days</Text></View>
            </View>
            <GroupAvatars members={preview.data.group.members} />
          </GroupSurfaceCard>
          {!preview.data.alreadyJoined ? (
            <>
              <GroupSectionLabel>Your commitment</GroupSectionLabel>
              <GroupSurfaceCard style={styles.commitmentCard}>
                <View style={styles.commitmentRow}>
                  <MaterialCommunityIcons color={colors.gold} name="hand-coin-outline" size={20} />
                  <Text style={styles.commitmentTotal}>{formatRdm(joinMinimum)} RDM total</Text>
                </View>
                <Text style={styles.commitmentHint}>{formatRdm(preview.data.group.pledgePerUnit)} RDM per {preview.data.group.pledgeBasis === "per_day" ? "day" : "activity"} × {commitmentCount} {commitmentUnit}</Text>
              </GroupSurfaceCard>
              <GroupSectionLabel>Reward rule</GroupSectionLabel>
              <GroupSurfaceCard style={styles.rewardRow}>
                <MaterialCommunityIcons color={colors.gold} name="trophy-outline" size={22} />
                <View style={styles.activityCopy}>
                  <Text style={styles.rewardTitle}>{groupRewardStructureTitle(preview.data.group.rewardStructure)}</Text>
                  <Text style={styles.description}>{groupRewardStructureDescription(preview.data.group.rewardStructure)}</Text>
                </View>
              </GroupSurfaceCard>
              <GroupSurfaceCard style={styles.balanceCardRow}>
                <MaterialCommunityIcons color={colors.inkSoft} name="wallet-outline" size={22} />
                <View style={styles.balanceCard}>
                  <View style={styles.balanceBreakdownRow}><Text style={styles.balanceLabel}>Available</Text><Text style={styles.balanceValue}>{formatRdm(baseBalance)} RDM</Text></View>
                  <View style={styles.balanceBreakdownRow}><Text style={styles.balanceLabel}>After joining</Text><Text style={[styles.balanceValue, !joinHasFunds && styles.balanceValueLow]}>{formatRdm(Math.max(0, baseAfterJoin))} RDM</Text></View>
                </View>
              </GroupSurfaceCard>
              <View style={styles.infoRow}><MaterialCommunityIcons color={colors.inkSoft} name="information-outline" size={15} /><Text style={styles.helper}>Your pledge will be deducted from your own Base Purse.</Text></View>
            </>
          ) : null}
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <GroupPrimaryButton
        color={colors.growth}
        disabled={!preview.data || !!preview.error || (!preview.data.alreadyJoined && !joinHasFunds)}
        label={preview.data?.alreadyJoined ? "Open group dashboard" : `Pledge ${formatRdm(joinMinimum)} RDM & join`}
        loading={joinGroup.isPending}
        onPress={submitJoin}
      />
      {!joinHasFunds && preview.data && !preview.data.alreadyJoined ? (
        <GroupPrimaryButton color={colors.gold} label="View Wallet" onPress={() => router.push("/(app)/(tabs)/wallet")} variant="outline" />
      ) : null}
      <GroupPrimaryButton color={colors.inkSoft} label="Cancel" onPress={() => router.dismissTo("/(app)/(tabs)/groups")} variant="outline" />
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 4 },
  introTitle: { color: colors.ink, fontFamily: fonts.bodyBold, ...focusedTypography.heroTitle, letterSpacing: -0.5 },
  introBody: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14 },
  codeInputWrap: { justifyContent: "center" },
  input: { backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: 10, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 14, minHeight: 52, paddingHorizontal: 14 },
  codeInput: { borderColor: colors.growth, fontFamily: fonts.monoBold, fontSize: 25, letterSpacing: 6, paddingRight: 44, textAlign: "center", textTransform: "uppercase" },
  codeInputValid: { borderColor: colors.growth, borderWidth: 1.5 },
  codeCheck: { position: "absolute", right: 14 },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  validText: { color: colors.growth, fontFamily: fonts.bodyMedium, fontSize: 12, textAlign: "center" },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  previewCard: { gap: 12 },
  previewTop: { alignItems: "center", flexDirection: "row", gap: 11 },
  runningIcon: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  previewCopy: { flex: 1 },
  previewTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  categoryChip: { backgroundColor: colors.plumTint, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 },
  categoryChipLabel: { color: colors.plum, fontFamily: fonts.bodyMedium, fontSize: 10 },
  previewMetrics: { borderBottomColor: colors.line, borderBottomWidth: 1, borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  previewMetric: { alignItems: "center", flex: 1, flexDirection: "row", gap: 5, justifyContent: "center", minWidth: 0, paddingHorizontal: 3 },
  previewMeta: { color: colors.inkSoft, flexShrink: 1, textAlign: "center", ...typography.compactMeta },
  commitmentCard: { alignItems: "center", gap: 6 },
  commitmentRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  commitmentTotal: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 22 },
  commitmentHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  rewardRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  activityCopy: { flex: 1 },
  rewardTitle: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 13 },
  balanceCardRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  balanceCard: { flex: 1, gap: 6 },
  balanceBreakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  balanceLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  balanceValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 13 },
  balanceValueLow: { color: colors.coral },
  infoRow: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
});
