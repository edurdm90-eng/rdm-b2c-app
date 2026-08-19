import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Share, StyleSheet, Text, TextInput, View } from "react-native";

import { AppScreen, ErrorState, LoadingState, PageHeader, PrimaryButton, ProgressBar, SectionLabel, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

export default function GroupsScreen() {
  const groups = useQuery(trpc.rdm.groups.list.queryOptions());
  const [awardDrafts, setAwardDrafts] = useState<Record<string, string[]>>({});
  const logContribution = useMutation(trpc.rdm.groups.logContribution.mutationOptions({ onSuccess: async () => { await queryClient.invalidateQueries(); await groups.refetch(); } }));
  const award = useMutation(trpc.rdm.groups.award.mutationOptions({
    onSuccess: async () => { await queryClient.invalidateQueries(); await groups.refetch(); Alert.alert("Tokens awarded", "The group reward pool has been distributed."); },
    onError: (error) => Alert.alert("Could not award tokens", error.message),
  }));

  if (groups.isLoading) return <LoadingState label="Loading your groups…" />;
  if (groups.error || !groups.data) return <ErrorState message={groups.error?.message ?? "Groups are unavailable."} onRetry={() => void groups.refetch()} />;

  return (
    <AppScreen>
      <PageHeader title="Group Goals" subtitle={`${groups.data.length} active group${groups.data.length === 1 ? "" : "s"}`} trailing={<PrimaryButton label="New" icon="plus" color={colors.plum} style={styles.headerButton} onPress={() => router.push("/(app)/group/new")} />} />
      {groups.data.map((group) => (
        <View key={group.id} style={styles.groupBlock}>
          <SurfaceCard style={styles.groupCard}>
            <View style={styles.groupTop}>
              <View style={styles.avatars}>{group.members.slice(0, 4).map((member, index) => <View key={`${member.initials}-${index}`} style={[styles.avatar, index > 0 && styles.avatarOverlap]}><Text style={styles.avatarText}>{member.initials}</Text></View>)}</View>
              <PrimaryButton label="Invite" color={colors.plum} variant="outline" style={styles.smallButton} onPress={() => void Share.share({ message: `Join my RDM group goal “${group.name}” with code ${group.inviteCode}.` })} />
            </View>
            <Text style={styles.groupTitle}>{group.name}</Text>
            <Text style={rdmStyles.muted}>{group.members.length} members · Target: {group.target}{group.unit} · {group.current}{group.unit} so far</Text>
            <ProgressBar color={colors.plum} progress={group.current / group.target} />
            <View style={styles.actionRow}>
              <PrimaryButton label={`Log 5 ${group.unit}`} color={colors.plum} loading={logContribution.isPending} style={styles.flexButton} onPress={() => logContribution.mutate({ id: group.id, amount: 5 })} />
              <PrimaryButton label="Share progress" color={colors.plum} variant="outline" style={styles.flexButton} onPress={() => void Share.share({ message: `${group.name}: ${group.current}/${group.target}${group.unit} complete.` })} />
            </View>
          </SurfaceCard>

          <SectionLabel action={<View style={styles.sectionMeta}>{group.targetHit ? <Text style={styles.targetHit}>Target hit ✓</Text> : null}<Text style={styles.inviteCode}>Code {group.inviteCode}</Text></View>}>{group.name} — award tokens</SectionLabel>
          <SurfaceCard>
            <Text style={rdmStyles.muted}>As group creator, split the {group.rewardPool} RDM reward pool:</Text>
            <View style={styles.memberList}>
              {group.members.map((member, index) => (
                <View key={member.initials} style={styles.memberRow}>
                  <View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{member.initials}</Text></View>
                  <View style={styles.memberCopy}><Text style={styles.memberName}>{member.currentUser ? "You" : member.name}</Text><Text style={styles.memberContribution}>{member.contribution}{group.unit} contributed</Text></View>
                  <TextInput
                    accessibilityLabel={`${member.name} token award`}
                    editable={!group.awarded && group.canAward}
                    keyboardType="number-pad"
                    onChangeText={(value) => setAwardDrafts((current) => {
                      const next = [...(current[group.id] ?? group.members.map((item) => String(item.award)))];
                      next[index] = value.replace(/\D/g, "");
                      return { ...current, [group.id]: next };
                    })}
                    style={[styles.memberAward, group.awarded && styles.memberAwardLocked]}
                    value={awardDrafts[group.id]?.[index] ?? String(member.award)}
                  />
                </View>
              ))}
            </View>
          </SurfaceCard>
          <PrimaryButton
            disabled={!group.targetHit || group.awarded || !group.canAward}
            label={group.awarded ? "Tokens awarded" : group.canAward ? "Confirm & award tokens" : "Creator awards tokens"}
            loading={award.isPending}
            onPress={() => award.mutate({
              id: group.id,
              amounts: (awardDrafts[group.id] ?? group.members.map((member) => String(member.award))).map(Number),
            })}
          />
        </View>
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerButton: { minHeight: 36, paddingHorizontal: 12 },
  groupBlock: { gap: 12 },
  groupCard: { gap: 10 },
  groupTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  avatars: { flexDirection: "row" },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.plum, borderWidth: 2, borderColor: colors.panel, alignItems: "center", justifyContent: "center" },
  avatarOverlap: { marginLeft: -8 },
  avatarText: { color: colors.backgroundDeep, fontFamily: fonts.bodyBold, fontSize: 9 },
  smallButton: { minHeight: 34, paddingHorizontal: 12 },
  groupTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17 },
  actionRow: { flexDirection: "row", gap: 8 },
  flexButton: { flex: 1, minHeight: 40, paddingHorizontal: 8 },
  targetHit: { color: colors.growth, fontFamily: fonts.bodyBold, fontSize: 10 },
  sectionMeta: { alignItems: "flex-end", gap: 2 },
  inviteCode: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 9 },
  memberList: { marginTop: 8 },
  memberRow: { minHeight: 54, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", alignItems: "center", gap: 10 },
  memberAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.plumTint, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { color: colors.plum, fontFamily: fonts.bodyBold, fontSize: 9 },
  memberCopy: { flex: 1 },
  memberName: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  memberContribution: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9, marginTop: 2 },
  memberAward: { width: 54, minHeight: 36, borderRadius: 9, borderWidth: 1, borderColor: "rgba(240,180,41,0.35)", backgroundColor: colors.goldTint, color: colors.gold, fontFamily: fonts.monoBold, fontSize: 12, paddingHorizontal: 8, textAlign: "right" },
  memberAwardLocked: { borderColor: "transparent", backgroundColor: "transparent" },
});
