import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { Share, StyleSheet, Text, View } from "react-native";

import { GroupErrorState } from "@/components/group-goal-ui";
import {
  AppScreen,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SurfaceCard,
} from "@/components/rdm-ui";
import { ordinalRank } from "@/lib/group-goals";
import { colors, fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GroupResultScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? "");
  const focused = useIsFocused();
  const validId = /^[a-f\d]{24}$/i.test(id);
  const group = useQuery({
    ...trpc.rdm.groups.detail.queryOptions({ id }),
    enabled: validId && focused,
    refetchInterval: (query) => focused && !query.state.data?.awarded ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

  if (group.isLoading) return <LoadingState label="Opening group results…" />;
  if (group.error || !group.data) {
    return <GroupErrorState message={group.error?.message ?? "Results are unavailable."} onBack={() => router.dismissTo("/(app)/(tabs)/groups")} onRetry={validId ? () => void group.refetch() : undefined} />;
  }
  if (!group.data.awarded) {
    return <GroupErrorState message="The group creator has not announced the results yet." onBack={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })} onRetry={() => void group.refetch()} />;
  }

  const data = group.data;
  const ranked = [...data.members].sort((left, right) => right.award - left.award || right.contribution - left.contribution);
  const winner = ranked[0];
  const otherRecipients = ranked.filter((member, index) => index > 0 && member.award > 0);
  const resultMessage = `${data.name} complete! ${winner?.name ?? "The group"} led the group, and ${formatRdm(data.rewardPool)} RDM was distributed.`;

  return (
    <AppScreen contentStyle={styles.screen}>
      <PageHeader
        back
        onBack={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })}
        title="Goal complete!"
        subtitle={data.name.toUpperCase()}
      />
      <View style={styles.hero}>
        <Text style={styles.trophy}>🏆</Text>
        <Text style={styles.heroTitle}>Goal complete!</Text>
        <Text style={styles.heroSubtitle}>{data.target} {data.unit} together · pool distributed</Text>
      </View>
      {winner ? (
        <SurfaceCard style={styles.winnerCard}>
          <View style={styles.winnerAvatar}><Text style={styles.winnerAvatarText}>{winner.initials}</Text></View>
          <Text style={styles.winnerTitle}>{winner.currentUser ? "You take" : `${winner.name} takes`} 1st place</Text>
          <Text style={styles.winnerAmount}>{formatRdm(winner.award)} RDM</Text>
          {data.specialCollectible ? (
            <View style={styles.specialBadge}>
              <Text style={styles.specialText}>🏅 {data.specialCollectible.title}</Text>
              <Text style={styles.specialMeta}>Owned by {data.specialCollectible.recipientName} · {data.specialCollectible.id}</Text>
            </View>
          ) : null}
        </SurfaceCard>
      ) : null}
      {otherRecipients.length > 0 ? (
        <SurfaceCard>
          {otherRecipients.map((member, index) => (
            <View key={`${member.initials}-${index}`} style={styles.resultRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{member.initials}</Text></View>
              <Text style={styles.memberName}>{member.currentUser ? "You" : member.name} · {ordinalRank(index + 2)} place</Text>
              <Text style={styles.memberAward}>{formatRdm(member.award)} RDM</Text>
            </View>
          ))}
        </SurfaceCard>
      ) : null}
      <View style={styles.actions}>
        <PrimaryButton color={colors.plum} icon="share-variant-outline" label="Share result" onPress={() => void Share.share({ message: resultMessage })} style={styles.flexButton} />
        <PrimaryButton color={colors.plum} icon="plus" label="New group" onPress={() => router.push("/(app)/group/new")} style={styles.flexButton} variant="outline" />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  hero: { alignItems: "center", gap: 5, paddingVertical: 12 },
  trophy: { fontSize: 54 },
  heroTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 24 },
  heroSubtitle: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  winnerCard: { alignItems: "center", borderColor: colors.gold, borderWidth: 1.5, gap: 8, paddingVertical: 20 },
  winnerAvatar: { alignItems: "center", backgroundColor: colors.goldTint, borderColor: colors.gold, borderRadius: 30, borderWidth: 2, height: 60, justifyContent: "center", width: 60 },
  winnerAvatarText: { color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 19 },
  winnerTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17 },
  winnerAmount: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 25 },
  specialBadge: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 14, gap: 2, paddingHorizontal: 11, paddingVertical: 7 },
  specialText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 10 },
  specialMeta: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 7.5 },
  resultRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 52 },
  avatar: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: 15, height: 30, justifyContent: "center", width: 30 },
  avatarText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 9 },
  memberName: { color: colors.ink, flex: 1, fontFamily: fonts.bodyMedium, fontSize: 11 },
  memberAward: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 11 },
  actions: { flexDirection: "row", gap: 8 },
  flexButton: { flex: 1, paddingHorizontal: 8 },
});
