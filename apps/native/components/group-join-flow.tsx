import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { GroupAvatars } from "@/components/group-goal-ui";
import {
  AppScreen,
  PageHeader,
  PrimaryButton,
  SectionLabel,
  SurfaceCard,
} from "@/components/rdm-ui";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

export function GroupJoinFlow({
  initialCode,
  onCreate,
}: {
  initialCode?: string;
  onCreate: () => void;
}) {
  const focused = useIsFocused();
  const [inviteCode, setInviteCode] = useState(() => String(initialCode ?? "").slice(0, 6).toUpperCase());
  const [joinPledge, setJoinPledge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const normalizedInviteCode = inviteCode.trim().toUpperCase();
  const preview = useQuery({
    ...trpc.rdm.groups.preview.queryOptions({ inviteCode: normalizedInviteCode }),
    enabled: normalizedInviteCode.length === 6 && focused,
    retry: false,
    refetchInterval: focused && normalizedInviteCode.length === 6 ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const joinGroup = useMutation(trpc.rdm.groups.join.mutationOptions({
    onSuccess: async (group) => {
      await queryClient.invalidateQueries();
      router.replace({ pathname: "/(app)/group/[id]", params: { id: group.id } });
    },
    onError: (mutationError) => setError(mutationError.message),
  }));
  const joinMinimum = preview.data?.group.minimumPledge ?? 0;
  const numericJoinPledge = Number(joinPledge);
  const joinHasFunds = Number.isInteger(numericJoinPledge)
    && numericJoinPledge >= joinMinimum
    && numericJoinPledge <= (preview.data?.profile.wallet.base ?? 0);

  useEffect(() => {
    if (preview.data && !joinPledge) {
      setJoinPledge(String(preview.data.group.minimumPledge));
    }
  }, [joinPledge, preview.data]);

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
      setError(numericJoinPledge < joinMinimum
        ? `This group requires at least ${formatRdm(joinMinimum)} RDM.`
        : "Your Base Purse does not have enough RDM for this pledge.");
      return;
    }
    setError(null);
    joinGroup.mutate({ inviteCode: normalizedInviteCode, pledgeAmount: numericJoinPledge });
  }

  return (
    <AppScreen>
      <PageHeader
        back
        onBack={() => router.dismissTo("/(app)/(tabs)/groups")}
        title="Join group"
      />
      <View style={styles.intro}><Text style={styles.introTitle}>Enter invite code</Text><Text style={styles.introBody}>Ask a friend in the group for the code.</Text></View>
      <TextInput
        accessibilityLabel="Group invite code"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        onChangeText={(value) => {
          setInviteCode(value.toUpperCase());
          setJoinPledge("");
          setError(null);
        }}
        placeholder="FAM7QX"
        placeholderTextColor={colors.inkSoft}
        style={[styles.input, styles.codeInput]}
        value={inviteCode}
      />
      {preview.isFetching ? <Text style={styles.helper}>Checking invite…</Text> : null}
      {preview.error ? (
        <View>
          <Text style={styles.error}>{preview.error.message}</Text>
          <PrimaryButton label="Check invite again" onPress={() => void preview.refetch()} variant="outline" />
        </View>
      ) : null}
      {preview.data ? (
        <>
          <SurfaceCard style={styles.previewCard}>
            <View style={styles.previewTop}><View style={styles.runningIcon}><MaterialCommunityIcons color={colors.plum} name="run" size={25} /></View><View style={styles.previewCopy}><Text style={styles.previewTitle}>{preview.data.group.name}</Text><Text style={styles.description}>{preview.data.group.description}</Text></View></View>
            <View style={styles.previewMetrics}><Text style={styles.previewMeta}>{preview.data.group.durationDays} days</Text><Text style={styles.previewMeta}>{preview.data.group.members.length} member{preview.data.group.members.length === 1 ? "" : "s"}</Text><Text style={styles.previewMeta}>{formatRdm(preview.data.group.rewardPool)} RDM pool</Text></View>
            <GroupAvatars members={preview.data.group.members} />
          </SurfaceCard>
          {!preview.data.alreadyJoined ? (
            <>
              <SectionLabel>Your pledge to join</SectionLabel>
              <TextInput accessibilityLabel="RDM pledge to join" keyboardType="number-pad" onChangeText={(value) => setJoinPledge(value.replace(/\D/g, ""))} style={[styles.input, styles.joinPledge]} value={joinPledge} />
              <Text style={styles.helper}>Minimum {formatRdm(joinMinimum)} RDM · deducted from your Base Purse when you join.</Text>
              <View style={[styles.balanceCard, joinHasFunds ? styles.balanceGood : styles.balanceLow]}>
                <View><Text style={styles.balanceLabel}>Your Base Purse</Text><Text style={styles.balanceValue}>{formatRdm(preview.data.profile.wallet.base)} RDM</Text></View>
                <Text style={[styles.balanceState, !joinHasFunds && styles.balanceStateLow]}>{joinHasFunds ? "✓ Sufficient" : "Needs RDM"}</Text>
              </View>
            </>
          ) : null}
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        color={colors.growth}
        disabled={!preview.data || !!preview.error || (!preview.data.alreadyJoined && !joinHasFunds)}
        label={preview.data?.alreadyJoined ? "Open group dashboard" : `Pledge ${Number.isFinite(numericJoinPledge) ? formatRdm(numericJoinPledge) : 0} RDM & join`}
        loading={joinGroup.isPending}
        onPress={submitJoin}
      />
      {!joinHasFunds && preview.data && !preview.data.alreadyJoined ? (
        <PrimaryButton color={colors.gold} label="View Wallet" onPress={() => router.push("/(app)/(tabs)/wallet")} variant="outline" />
      ) : null}
      <PrimaryButton color={colors.plum} label="Create a group instead" onPress={onCreate} variant="outline" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 4 },
  introTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 26, letterSpacing: -0.5, lineHeight: 32 },
  introBody: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14 },
  input: { backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: 10, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 14, minHeight: 52, paddingHorizontal: 14 },
  codeInput: { borderColor: colors.growth, fontFamily: fonts.monoBold, fontSize: 25, letterSpacing: 6, textAlign: "center", textTransform: "uppercase" },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  previewCard: { gap: 12 },
  previewTop: { alignItems: "center", flexDirection: "row", gap: 11 },
  runningIcon: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  previewCopy: { flex: 1 },
  previewTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  previewMetrics: { borderBottomColor: colors.line, borderBottomWidth: 1, borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  previewMeta: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9 },
  joinPledge: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 24, textAlign: "center" },
  balanceCard: { alignItems: "center", borderRadius: radii.medium, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 14 },
  balanceGood: { backgroundColor: colors.growthTint, borderColor: "rgba(63,203,139,0.35)" },
  balanceLow: { backgroundColor: colors.coralTint, borderColor: "rgba(226,112,90,0.35)" },
  balanceLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10 },
  balanceValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 16, marginTop: 2 },
  balanceState: { color: colors.growth, fontFamily: fonts.bodyBold, fontSize: 11 },
  balanceStateLow: { color: colors.coral },
});
