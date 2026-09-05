import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { GroupAiNote, GroupAvatars } from "@/components/group-goal-ui";
import {
  AppScreen,
  PageHeader,
  Pill,
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
  const [inviteCode, setInviteCode] = useState(() => String(initialCode ?? "").slice(0, 6).toUpperCase());
  const [joinPledge, setJoinPledge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const normalizedInviteCode = inviteCode.trim().toUpperCase();
  const preview = useQuery({
    ...trpc.rdm.groups.preview.queryOptions({ inviteCode: normalizedInviteCode }),
    enabled: normalizedInviteCode.length === 6,
    retry: false,
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
    if (!preview.data) {
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
      <PageHeader back title="Join a Group Goal" subtitle="ENTER AN INVITE CODE" />
      <View style={styles.modeRow}>
        <Pill color={colors.plum} label="Create" onPress={onCreate} />
        <Pill active color={colors.plum} label="Join with code" />
      </View>
      <SectionLabel>Group invite code</SectionLabel>
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
      {preview.error ? <Text style={styles.error}>{preview.error.message}</Text> : null}
      {preview.data ? (
        <>
          <SurfaceCard style={styles.previewCard}>
            <GroupAvatars members={preview.data.group.members} />
            <Text style={styles.previewTitle}>{preview.data.group.name}</Text>
            <Text style={styles.description}>{preview.data.group.description}</Text>
            <Text style={styles.previewMeta}>{preview.data.group.members.length} member{preview.data.group.members.length === 1 ? "" : "s"} joined · {formatRdm(preview.data.group.rewardPool)} RDM pooled · {preview.data.group.durationDays} days</Text>
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
        disabled={!preview.data || (!preview.data.alreadyJoined && !joinHasFunds)}
        label={preview.data?.alreadyJoined ? "Open group dashboard" : `Pledge ${Number.isFinite(numericJoinPledge) ? formatRdm(numericJoinPledge) : 0} RDM & join`}
        loading={joinGroup.isPending}
        onPress={submitJoin}
      />
      {!joinHasFunds && preview.data && !preview.data.alreadyJoined ? (
        <PrimaryButton color={colors.gold} label="View Wallet" onPress={() => router.push("/(app)/(tabs)/wallet")} variant="outline" />
      ) : null}
      <GroupAiNote label="Use AI to explain how group rewards work" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: "row", gap: 8 },
  input: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 13, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 14, minHeight: 52, paddingHorizontal: 14 },
  codeInput: { fontFamily: fonts.monoBold, fontSize: 25, letterSpacing: 6, textAlign: "center", textTransform: "uppercase" },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  previewCard: { alignItems: "center", gap: 9 },
  previewTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, textAlign: "center" },
  description: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  previewMeta: { color: colors.plum, fontFamily: fonts.mono, fontSize: 10, textAlign: "center" },
  joinPledge: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 24, textAlign: "center" },
  balanceCard: { alignItems: "center", borderRadius: radii.medium, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 14 },
  balanceGood: { backgroundColor: colors.growthTint, borderColor: "rgba(63,203,139,0.35)" },
  balanceLow: { backgroundColor: colors.coralTint, borderColor: "rgba(226,112,90,0.35)" },
  balanceLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10 },
  balanceValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 16, marginTop: 2 },
  balanceState: { color: colors.growth, fontFamily: fonts.bodyBold, fontSize: 11 },
  balanceStateLow: { color: colors.coral },
});
