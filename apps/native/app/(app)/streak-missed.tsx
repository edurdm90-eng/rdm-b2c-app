import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SurfaceCard,
} from "@/components/rdm-ui";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

export default function StreakMissedScreen() {
  const missedDayQuery = useQuery(trpc.rdm.tree.missedDay.queryOptions());
  const acknowledge = useMutation(
    trpc.rdm.tree.acknowledgeMissedDay.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.replace("/(app)/tree");
      },
    }),
  );
  const hasResolvedMissedDay = Boolean(
    missedDayQuery.data && !missedDayQuery.data.missedDay,
  );

  useEffect(() => {
    if (hasResolvedMissedDay) router.replace("/(app)/tree");
  }, [hasResolvedMissedDay]);

  if (missedDayQuery.isLoading || hasResolvedMissedDay) {
    return <LoadingState label="Checking your tree streak…" />;
  }
  if (missedDayQuery.error || !missedDayQuery.data?.missedDay) {
    return (
      <ErrorState
        message={missedDayQuery.error?.message ?? "Your missed-day record is unavailable."}
        onRetry={() => void missedDayQuery.refetch()}
      />
    );
  }

  const { missedDay } = missedDayQuery.data;

  return (
    <AppScreen contentStyle={styles.content}>
      <PageHeader
        subtitle={`DAY ${missedDay.dayNumber} · STREAK AT RISK`}
        title="Grow Every Day"
      />

      <View accessibilityRole="alert" style={styles.warningBanner}>
        <MaterialCommunityIcons color={colors.gold} name="alert" size={21} />
        <Text style={styles.warningText}>
          <Text style={styles.warningStrong}>
            {missedDay.missedYesterday
              ? "Streak missed yesterday."
              : `Tree care was missed on ${missedDay.dayKey}.`}
          </Text>{" "}
          {missedDay.transferredAmount > 0
            ? `${formatRdm(missedDay.transferredAmount)} available Reward RDM moved to Remorse.`
            : "Your Reward Purse was empty, so no RDM moved. You can tend your tree again today."}
        </Text>
      </View>

      <SurfaceCard style={styles.purseFlowCard}>
        <View style={styles.purseFlowCell}>
          <Text style={[styles.purseValue, styles.rewardValue]}>
            {formatRdm(missedDay.rewardAfter)}
          </Text>
          <Text style={styles.purseLabel}>Reward Purse</Text>
          <Text style={styles.purseBefore}>(was {formatRdm(missedDay.rewardBefore)})</Text>
        </View>
        <MaterialCommunityIcons color={colors.inkSoft} name="arrow-right" size={20} />
        <View style={styles.purseFlowCell}>
          <Text style={[styles.purseValue, styles.remorseValue]}>
            {formatRdm(missedDay.remorseAfter)}
          </Text>
          <Text style={styles.purseLabel}>Remorse Purse</Text>
          <Text style={styles.purseBefore}>(was {formatRdm(missedDay.remorseBefore)})</Text>
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.tendCard}>
        <Text style={styles.tendCopy}>
          Complete any care action today to protect tomorrow&apos;s streak.
        </Text>
        {acknowledge.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {acknowledge.error.message}
          </Text>
        ) : null}
        <PrimaryButton
          label="Tend the tree now"
          loading={acknowledge.isPending}
          onPress={() => acknowledge.mutate({ dayKey: missedDay.dayKey })}
        />
      </SurfaceCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18 },
  warningBanner: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: "rgba(226,112,90,0.32)",
    backgroundColor: colors.coralTint,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  warningText: {
    flex: 1,
    color: colors.coral,
    fontFamily: fonts.body,
    fontSize: 10.5,
    lineHeight: 15,
  },
  warningStrong: { fontFamily: fonts.bodyBold },
  purseFlowCard: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 16,
  },
  purseFlowCell: { flex: 1, alignItems: "center" },
  purseValue: { fontFamily: fonts.monoBold, fontSize: 18 },
  rewardValue: { color: colors.gold },
  remorseValue: { color: colors.coral },
  purseLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9.5, marginTop: 3 },
  purseBefore: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 8.5 },
  tendCard: { minHeight: 120, gap: 12, marginTop: 10, padding: 16 },
  tendCopy: {
    maxWidth: 250,
    alignSelf: "center",
    color: colors.inkSoft,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 11 },
});
