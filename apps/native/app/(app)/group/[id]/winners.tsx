import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { GroupErrorState } from "@/components/group-goal-ui";
import {
  AppScreen,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SectionLabel,
  SurfaceCard,
} from "@/components/rdm-ui";
import { groupRewardStructureTitle } from "@/lib/group-goals";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

export default function GroupWinnersScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? "");
  const focused = useIsFocused();
  const validId = /^[a-f\d]{24}$/i.test(id);
  const [specialAwarded, setSpecialAwarded] = useState(false);
  const preview = useQuery({
    ...trpc.rdm.groups.awardPreview.queryOptions({ id }),
    enabled: validId && focused,
    refetchInterval: focused ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const award = useMutation(trpc.rdm.groups.award.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.replace({ pathname: "/(app)/group/[id]/result", params: { id } });
    },
    onError: (error) => Alert.alert("Could not announce winners", error.message),
  }));

  if (preview.isLoading) return <LoadingState label="Calculating fair awards…" />;
  if (preview.error || !preview.data) {
    return <GroupErrorState message={preview.error?.message ?? "Awards are unavailable."} onBack={() => router.dismissTo("/(app)/(tabs)/groups")} onRetry={validId ? () => void preview.refetch() : undefined} />;
  }

  const { group, amounts } = preview.data;
  const ranked = group.members
    .map((member, index) => ({ ...member, award: amounts[index] ?? 0 }))
    .sort((left, right) => right.contribution - left.contribution);

  return (
    <AppScreen>
      <PageHeader
        back
        onBack={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })}
        title="Choose winners"
        subtitle={`${groupRewardStructureTitle(group.rewardStructure).toUpperCase()} · ${formatRdm(group.rewardPool)} RDM`}
      />
      <Text style={styles.intro}>Awards are calculated from the reward structure selected when the group was created. Review them before announcing.</Text>
      <SectionLabel>Final ranking</SectionLabel>
      {ranked.map((member, index) => (
        <SurfaceCard key={`${member.initials}-${index}`} style={[styles.winnerRow, member.award > 0 && styles.winnerSelected]}>
          <View style={[styles.rank, member.award > 0 && styles.rankSelected]}><Text style={[styles.rankText, member.award > 0 && styles.rankTextSelected]}>{index + 1}</Text></View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{member.initials}</Text></View>
          <View style={styles.memberCopy}>
            <Text style={styles.memberName}>{member.currentUser ? "You" : member.name}</Text>
            <Text style={styles.memberProgress}>{member.contribution} {group.unit} logged</Text>
          </View>
          <Text style={[styles.award, member.award === 0 && styles.zeroAward]}>{member.award > 0 ? `${formatRdm(member.award)} RDM` : "—"}</Text>
        </SurfaceCard>
      ))}
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: specialAwarded }} onPress={() => setSpecialAwarded((current) => !current)} style={styles.specialCard}>
        <Text style={styles.specialIcon}>🏅</Text>
        <View style={styles.memberCopy}>
          <Text style={styles.specialTitle}>Award a special winner collectible</Text>
          <Text style={styles.memberProgress}>Recognize the member with the highest contribution.</Text>
        </View>
        <View style={[styles.switchTrack, specialAwarded && styles.switchTrackOn]}><View style={[styles.switchKnob, specialAwarded && styles.switchKnobOn]} /></View>
      </Pressable>
      <PrimaryButton color={colors.gold} icon="bullhorn-outline" label="Announce winners" loading={award.isPending} onPress={() => award.mutate({ id, specialAwarded })} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 18 },
  winnerRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  winnerSelected: { backgroundColor: colors.goldTint, borderColor: "rgba(240,180,41,0.45)" },
  rank: { alignItems: "center", backgroundColor: colors.panelRaised, borderRadius: 8, height: 26, justifyContent: "center", width: 26 },
  rankSelected: { backgroundColor: colors.gold },
  rankText: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 11 },
  rankTextSelected: { color: colors.backgroundDeep },
  avatar: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 15, height: 30, justifyContent: "center", width: 30 },
  avatarText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 9 },
  memberCopy: { flex: 1 },
  memberName: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  memberProgress: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9.5, lineHeight: 15, marginTop: 2 },
  award: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 11 },
  zeroAward: { color: colors.inkSoft },
  specialCard: { alignItems: "center", borderColor: colors.plum, borderRadius: radii.medium, borderStyle: "dashed", borderWidth: 1, flexDirection: "row", gap: 10, padding: 14 },
  specialIcon: { fontSize: 22 },
  specialTitle: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  switchTrack: { backgroundColor: colors.line, borderRadius: 12, height: 24, padding: 3, width: 42 },
  switchTrackOn: { backgroundColor: colors.plum },
  switchKnob: { backgroundColor: colors.ink, borderRadius: 9, height: 18, width: 18 },
  switchKnobOn: { transform: [{ translateX: 18 }] },
});
