import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";

import { GroupAiNote, GroupAvatars } from "@/components/group-goal-ui";
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
import { groupRewardStructureTitle } from "@/lib/group-goals";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

export default function GroupDashboardScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? "");
  const [amount, setAmount] = useState("5");
  const [operationId, setOperationId] = useState(() => Crypto.randomUUID());
  const group = useQuery({
    ...trpc.rdm.groups.detail.queryOptions({ id }),
    enabled: /^[a-f\d]{24}$/i.test(id),
  });
  const logContribution = useMutation(trpc.rdm.groups.logContribution.mutationOptions({
    onSuccess: async () => {
      setOperationId(Crypto.randomUUID());
      await queryClient.invalidateQueries();
      await group.refetch();
    },
    onError: (error) => Alert.alert("Could not log progress", error.message),
  }));

  if (group.isLoading) return <LoadingState label="Opening group dashboard…" />;
  if (group.error || !group.data) {
    return <ErrorState message={group.error?.message ?? "Group not found."} onRetry={() => void group.refetch()} />;
  }

  const data = group.data;
  const numericAmount = Number(amount);
  const currentMember = data.members.find((member) => member.currentUser);
  function submitProgress() {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert("Add progress", `Enter how many ${data.unit} you completed.`);
      return;
    }
    logContribution.mutate({ id, amount: numericAmount, operationId });
  }

  return (
    <AppScreen>
      <PageHeader
        back
        onBack={() => router.dismissTo("/(app)/(tabs)/groups")}
        title={data.name}
        subtitle={`${data.category.toUpperCase()} · ${data.awarded ? "COMPLETE" : data.status === "expired" ? "EXPIRED" : data.targetHit ? "TARGET HIT" : `ENDS ${data.endDayKey ? formatDayKey(data.endDayKey).toUpperCase() : "SOON"}`}`}
        trailing={<PrimaryButton color={colors.plum} icon="account-plus-outline" label="Invite" onPress={() => router.push({ pathname: "/(app)/group/[id]/invite", params: { id } })} style={styles.headerButton} variant="outline" />}
      />
      <GroupAiNote label="Ask AI for a progress check-in" />
      <SurfaceCard style={styles.poolCard}>
        <Text style={styles.poolLabel}>TOTAL GROUP POOL</Text>
        <Text style={styles.poolValue}>{formatRdm(data.rewardPool)} RDM</Text>
        <Text style={styles.progressCopy}>{data.current} / {data.target} {data.unit} completed</Text>
        <ProgressBar color={data.targetHit ? colors.gold : colors.plum} progress={data.current / data.target} />
        <View style={styles.poolFooter}>
          <Text style={styles.poolMeta}>{data.daysRemaining} days left · {data.cadence} check-in</Text>
          <Text style={styles.poolMeta}>{groupRewardStructureTitle(data.rewardStructure)}</Text>
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.descriptionCard}>
        <MaterialCommunityIcons name="flag-checkered" color={colors.plum} size={20} />
        <Text style={styles.description}>{data.description || `Reach ${data.target} ${data.unit} together.`}</Text>
      </SurfaceCard>

      <SectionLabel action={<Text style={styles.memberCount}>{data.members.length} MEMBERS</Text>}>Members & pledges</SectionLabel>
      <SurfaceCard>
        <View style={styles.avatarHeader}><GroupAvatars members={data.members} /></View>
        {data.members.map((member, index) => (
          <View key={`${member.initials}-${index}`} style={styles.memberRow}>
            <View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{member.initials}</Text></View>
            <View style={styles.memberCopy}>
              <Text style={styles.memberName}>{member.currentUser ? "You" : member.name}</Text>
              <Text style={styles.memberProgress}>{member.contribution} {data.unit} logged</Text>
            </View>
            <Text style={styles.memberPledge}>{formatRdm(member.pledgeAmount)} RDM</Text>
          </View>
        ))}
      </SurfaceCard>

      {data.status === "active" && !data.targetHit && !data.awarded && !currentMember?.loggedCurrentPeriod ? (
        <SurfaceCard style={styles.logCard}>
          <SectionLabel>Log your progress</SectionLabel>
          <View style={styles.logRow}>
            <TextInput accessibilityLabel={`Progress in ${data.unit}`} keyboardType="decimal-pad" onChangeText={setAmount} placeholder="5" placeholderTextColor={colors.inkSoft} style={styles.progressInput} value={amount} />
            <Text style={styles.unitLabel}>{data.unit}</Text>
          </View>
          <Text style={styles.helper}>You have logged {currentMember?.contribution ?? 0} {data.unit}. You can submit one combined update each {data.cadence === "weekly" ? "week" : "day"}.</Text>
          <PrimaryButton color={colors.plum} label={`Log ${numericAmount || ""} ${data.unit}`} loading={logContribution.isPending} onPress={submitProgress} />
        </SurfaceCard>
      ) : null}

      {data.status === "active" && !data.targetHit && currentMember?.loggedCurrentPeriod ? (
        <SurfaceCard style={styles.loggedCard}>
          <Text style={styles.loggedTitle}>Progress logged ✓</Text>
          <Text style={styles.helper}>Your next {data.cadence === "weekly" ? "weekly" : "daily"} check-in opens in the next period.</Text>
        </SurfaceCard>
      ) : null}

      {data.status === "expired" ? (
        <SurfaceCard style={styles.expiredCard}>
          <Text style={styles.expiredTitle}>This goal ended</Text>
          <Text style={styles.helper}>The target was not completed before the deadline. Every backed member pledge has been returned to its owner&apos;s Base Purse.</Text>
        </SurfaceCard>
      ) : null}

      {data.targetHit && data.canAward && !data.awarded ? (
        <PrimaryButton color={colors.gold} icon="trophy-outline" label="Choose winners" onPress={() => router.push({ pathname: "/(app)/group/[id]/winners", params: { id } })} />
      ) : null}
      {data.targetHit && !data.canAward && !data.awarded ? (
        <SurfaceCard style={styles.waitingCard}><Text style={styles.waitingTitle}>Target reached 🎉</Text><Text style={styles.helper}>The group creator will announce the awards.</Text></SurfaceCard>
      ) : null}
      {data.awarded ? (
        <PrimaryButton color={colors.gold} icon="trophy" label="View group results" onPress={() => router.push({ pathname: "/(app)/group/[id]/result", params: { id } })} />
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerButton: { minHeight: 34, paddingHorizontal: 10 },
  poolCard: { alignItems: "center", gap: 9, paddingVertical: 20 },
  poolLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8 },
  poolValue: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 31 },
  progressCopy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  poolFooter: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  poolMeta: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9 },
  descriptionCard: { alignItems: "center", flexDirection: "row", gap: 10 },
  description: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  memberCount: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 9 },
  avatarHeader: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingBottom: 10 },
  memberRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 58 },
  memberAvatar: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 16, height: 32, justifyContent: "center", width: 32 },
  memberAvatarText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 10 },
  memberCopy: { flex: 1 },
  memberName: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  memberProgress: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9, marginTop: 2 },
  memberPledge: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 11 },
  logCard: { gap: 12 },
  logRow: { alignItems: "center", borderColor: colors.line, borderRadius: radii.medium, borderWidth: 1, flexDirection: "row" },
  progressInput: { color: colors.ink, flex: 1, fontFamily: fonts.monoBold, fontSize: 24, minHeight: 54, paddingHorizontal: 14 },
  unitLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 12, paddingRight: 14 },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  waitingCard: { alignItems: "center", backgroundColor: colors.goldTint, gap: 6 },
  waitingTitle: { color: colors.gold, fontFamily: fonts.display, fontSize: 17 },
  loggedCard: { alignItems: "center", backgroundColor: colors.growthTint, gap: 6 },
  loggedTitle: { color: colors.growth, fontFamily: fonts.display, fontSize: 17 },
  expiredCard: { alignItems: "center", backgroundColor: colors.coralTint, gap: 6 },
  expiredTitle: { color: colors.coral, fontFamily: fonts.display, fontSize: 17 },
});
