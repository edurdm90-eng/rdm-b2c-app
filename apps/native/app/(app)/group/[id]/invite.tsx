import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";

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
} from "@/components/rdm-ui";
import { LIVE_REFRESH_MS } from "@/lib/query-policy";
import { colors, fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GroupInviteScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? "");
  const focused = useIsFocused();
  const validId = /^[a-f\d]{24}$/i.test(id);
  const group = useQuery({
    ...trpc.rdm.groups.detail.queryOptions({ id }),
    enabled: validId && focused,
    refetchInterval: focused ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });

  if (group.isLoading) return <LoadingState label="Preparing your invite…" />;
  if (group.error || !group.data) {
    return <GroupErrorState message={group.error?.message ?? "Group not found."} onBack={() => router.dismissTo("/(app)/(tabs)/groups")} onRetry={validId ? () => void group.refetch() : undefined} />;
  }

  const data = group.data;
  if (data.status !== "active" || data.targetHit || data.awarded) {
    return <GroupErrorState message="This group is no longer accepting new members." onBack={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })} />;
  }
  const inviteLink = Linking.createURL("/(app)/group/new", {
    queryParams: { code: data.inviteCode, mode: "join" },
  });
  const message = `Join my RDM group goal “${data.name}” with code ${data.inviteCode}. Pledge at least ${data.minimumPledge} RDM from your Base Purse. ${inviteLink}`;

  async function copyCode() {
    await Clipboard.setStringAsync(data.inviteCode);
    Alert.alert("Code copied", "It is ready to paste.");
  }

  async function openEmailInvite() {
    try {
      await Linking.openURL(`mailto:?subject=${encodeURIComponent(`Join ${data.name} on RDM`)}&body=${encodeURIComponent(message)}`);
    } catch {
      await Share.share({ message });
    }
  }

  async function openWhatsAppInvite() {
    try {
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      if (await Linking.canOpenURL(whatsappUrl)) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Share.share({ message });
      }
    } catch {
      await Share.share({ message });
    }
  }

  return (
    <GroupScreen>
      <GroupPageHeader
        back
        onBack={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })}
        title="Invite people"
      />
      <GroupSurfaceCard style={styles.readyBanner}>
        <MaterialCommunityIcons color={colors.growth} name="check-circle" size={20} />
        <View style={styles.readyCopy}>
          <Text style={styles.readyTitle}>{data.name} is ready</Text>
          <Text style={styles.readySubtitle}>Your group has been created.</Text>
        </View>
      </GroupSurfaceCard>
      <GroupSurfaceCard style={styles.codeCard}>
        <GroupAvatars members={data.members} />
        <Text style={styles.groupName}>{data.name}</Text>
        <Text style={styles.codeLabel}>GROUP CODE</Text>
        <Text selectable style={styles.code}>{data.inviteCode}</Text>
        <GroupPrimaryButton color={colors.plum} icon="content-copy" label="Copy code" onPress={() => void copyCode()} style={styles.fullButton} />
        <View style={styles.metricsRow}>
          <View style={styles.metric}><MaterialCommunityIcons color={colors.inkSoft} name="calendar-outline" size={16} /><Text style={styles.metricText}>{data.durationDays} days</Text></View>
          <View style={styles.metric}><MaterialCommunityIcons color={colors.inkSoft} name="hand-coin-outline" size={16} /><Text style={styles.metricText}>{formatRdm(data.minimumPledge)} RDM per member</Text></View>
          <View style={styles.metric}><MaterialCommunityIcons color={colors.inkSoft} name="flag-checkered" size={16} /><Text style={styles.metricText}>{data.target} {data.unit}</Text></View>
        </View>
      </GroupSurfaceCard>
      <GroupSectionLabel>Send a direct invite</GroupSectionLabel>
      <GroupSurfaceCard>
        <Pressable accessibilityRole="button" onPress={() => void openEmailInvite()} style={styles.channelRow}>
          <View style={styles.channelIcon}><MaterialCommunityIcons color={colors.ai} name="email-outline" size={20} /></View>
          <View style={styles.activityCopy}><Text style={styles.channelTitle}>Email invite</Text><Text style={styles.channelHint}>Open your email app</Text></View>
          <MaterialCommunityIcons color={colors.inkSoft} name="open-in-new" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void openWhatsAppInvite()} style={[styles.channelRow, styles.channelRowLast]}>
          <View style={styles.channelIcon}><MaterialCommunityIcons color={colors.growth} name="whatsapp" size={20} /></View>
          <View style={styles.activityCopy}><Text style={styles.channelTitle}>WhatsApp invite</Text><Text style={styles.channelHint}>Open WhatsApp</Text></View>
          <MaterialCommunityIcons color={colors.inkSoft} name="open-in-new" size={18} />
        </Pressable>
      </GroupSurfaceCard>
      <GroupSectionLabel>How joining works</GroupSectionLabel>
      <GroupSurfaceCard>
        <View style={styles.infoRow}><Text style={styles.infoIcon}>1</Text><Text style={styles.infoText}>They enter the six-character invite code.</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoIcon}>2</Text><Text style={styles.infoText}>They review the target, duration, and pooled reward.</Text></View>
        <View style={[styles.infoRow, styles.infoRowLast]}><Text style={styles.infoIcon}>3</Text><Text style={styles.infoText}>They pledge at least {formatRdm(data.minimumPledge)} RDM from their own Base Purse.</Text></View>
      </GroupSurfaceCard>
      <GroupPrimaryButton color={colors.growth} label="Open group dashboard" onPress={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })} />
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  readyBanner: { alignItems: "center", backgroundColor: colors.growthTint, flexDirection: "row", gap: 10 },
  readyCopy: { flex: 1 },
  readyTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  readySubtitle: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  codeCard: { alignItems: "center", gap: 10, paddingVertical: 22 },
  groupName: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 19, textAlign: "center" },
  codeLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, marginTop: 4 },
  code: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 31, letterSpacing: 5 },
  fullButton: { width: "100%" },
  metricsRow: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: 14, width: "100%" },
  metric: { alignItems: "center", gap: 5 },
  metricText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9.5, textAlign: "center" },
  channelRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 11, minHeight: 60 },
  channelRowLast: { borderBottomWidth: 0 },
  channelIcon: { alignItems: "center", backgroundColor: colors.panelRaised, borderRadius: 11, height: 38, justifyContent: "center", width: 38 },
  activityCopy: { flex: 1 },
  channelTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  channelHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, marginTop: 3 },
  infoRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 52 },
  infoRowLast: { borderBottomWidth: 0 },
  infoIcon: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 12, textAlign: "center", width: 24 },
  infoText: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
});
