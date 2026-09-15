import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Share, StyleSheet, Text, TextInput, View } from "react-native";

import { GroupAvatars, GroupErrorState, GroupStepDots } from "@/components/group-goal-ui";
import {
  AppScreen,
  LoadingState,
  PageHeader,
  Pill,
  PrimaryButton,
  SectionLabel,
  SurfaceCard,
} from "@/components/rdm-ui";
import { colors, fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export default function GroupInviteScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? "");
  const focused = useIsFocused();
  const validId = /^[a-f\d]{24}$/i.test(id);
  const [directMode, setDirectMode] = useState<"email" | "whatsapp">("email");
  const [directRecipient, setDirectRecipient] = useState("");
  const group = useQuery({
    ...trpc.rdm.groups.detail.queryOptions({ id }),
    enabled: validId && focused,
    refetchInterval: focused ? 15_000 : false,
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

  async function copyInvite(value: string, label: string) {
    await Clipboard.setStringAsync(value);
    Alert.alert(`${label} copied`, "It is ready to paste.");
  }

  async function sendDirectInvite() {
    try {
      if (directMode === "whatsapp") {
        const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
        if (await Linking.canOpenURL(whatsappUrl)) {
          await Linking.openURL(whatsappUrl);
        } else {
          await Share.share({ message });
        }
        return;
      }
      const recipients = directRecipient
        .split(/[\s,;]+/)
        .map((recipient) => recipient.trim())
        .filter(Boolean);
      if (
        recipients.length === 0
        || recipients.some((recipient) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
      ) {
        Alert.alert("Check the recipients", "Enter one or more valid email addresses, separated by commas.");
        return;
      }
      await Linking.openURL(`mailto:${recipients.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(`Join ${data.name} on RDM`)}&body=${encodeURIComponent(message)}`);
    } catch {
      await Share.share({ message });
    }
  }

  return (
    <AppScreen>
      <PageHeader
        back
        onBack={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })}
        title="Invite your group"
        subtitle="STEP 5 OF 5"
      />
      <GroupStepDots current={5} />
      <SurfaceCard style={styles.codeCard}>
        <Text style={styles.codeLabel}>GROUP INVITE CODE</Text>
        <Text selectable style={styles.code}>{data.inviteCode}</Text>
        <Text style={styles.groupName}>{data.name}</Text>
        <GroupAvatars members={data.members} />
        <View style={styles.buttonRow}>
          <PrimaryButton color={colors.plum} icon="content-copy" label="Copy code" onPress={() => void copyInvite(data.inviteCode, "Code")} style={styles.flexButton} />
          <PrimaryButton color={colors.plum} icon="link-variant" label="Copy link" onPress={() => void copyInvite(inviteLink, "Link")} style={styles.flexButton} variant="outline" />
        </View>
        <PrimaryButton color={colors.plum} icon="share-variant-outline" label="Share invite" onPress={() => void Share.share({ message })} style={styles.fullButton} variant="outline" />
      </SurfaceCard>
      <Text style={styles.helper}>Anyone with this code can preview the goal and join. Their pledge is deducted only after they confirm.</Text>
      <SectionLabel>Send a direct invite</SectionLabel>
      <SurfaceCard style={styles.directCard}>
        <View style={styles.modeRow}>
          <Pill active={directMode === "email"} color={colors.ai} label="Email" onPress={() => setDirectMode("email")} />
          <Pill active={directMode === "whatsapp"} color={colors.growth} label="WhatsApp" onPress={() => setDirectMode("whatsapp")} />
        </View>
        {directMode === "email" ? (
          <TextInput
            accessibilityLabel="Invite recipient emails"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            multiline
            onChangeText={setDirectRecipient}
            placeholder="ravi@email.com, priya@email.com"
            placeholderTextColor={colors.inkSoft}
            style={[styles.input, styles.multiline]}
            value={directRecipient}
          />
        ) : (
          <Text style={styles.helper}>Open WhatsApp and choose one or more people or groups to receive this invite.</Text>
        )}
        <PrimaryButton color={directMode === "email" ? colors.ai : colors.growth} icon="send-outline" label={directMode === "email" ? "Open email app" : "Open WhatsApp"} onPress={() => void sendDirectInvite()} />
        <Text style={styles.helper}>Review and send the invitation in your email or messaging app.</Text>
      </SurfaceCard>
      <SectionLabel>How joining works</SectionLabel>
      <SurfaceCard>
        <View style={styles.infoRow}><Text style={styles.infoIcon}>1</Text><Text style={styles.infoText}>They enter the six-character invite code.</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoIcon}>2</Text><Text style={styles.infoText}>They review the target, duration, and pooled reward.</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoIcon}>3</Text><Text style={styles.infoText}>They pledge at least {formatRdm(data.minimumPledge)} RDM from their own Base Purse.</Text></View>
      </SurfaceCard>
      <PrimaryButton color={colors.growth} label="Go to group dashboard" onPress={() => router.dismissTo({ pathname: "/(app)/group/[id]", params: { id } })} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  codeCard: { alignItems: "center", gap: 12, paddingVertical: 22 },
  codeLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1 },
  code: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 31, letterSpacing: 5 },
  groupName: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, textAlign: "center" },
  buttonRow: { flexDirection: "row", width: "100%" },
  flexButton: { flex: 1 },
  fullButton: { width: "100%" },
  directCard: { gap: 10 },
  modeRow: { flexDirection: "row", gap: 8 },
  input: { backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: 13, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 13, minHeight: 50, paddingHorizontal: 13 },
  multiline: { minHeight: 70, paddingTop: 12, textAlignVertical: "top" },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 18, textAlign: "center" },
  infoRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 52 },
  infoIcon: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 12, textAlign: "center", width: 24 },
  infoText: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
});
