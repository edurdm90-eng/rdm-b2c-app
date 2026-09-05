import { gameDurationLabel } from "@rdm-b2c/api/domain/rdm";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { ActionDialog, AppScreen, ErrorState, IconBubble, LoadingState, SectionLabel, SurfaceCard, rdmStyles } from "@/components/rdm-ui";
import { authClient } from "@/lib/auth-client";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function HomeScreen() {
  const [signOutOpen, setSignOutOpen] = useState(false);
  const dashboard = useQuery(trpc.rdm.dashboard.queryOptions());

  if (dashboard.isLoading) return <LoadingState />;
  if (dashboard.error || !dashboard.data) {
    return <ErrorState message={dashboard.error?.message ?? "The dashboard is unavailable."} onRetry={() => void dashboard.refetch()} />;
  }

  const { user, profile, games } = dashboard.data;
  const firstName = user.name.split(" ")[0] || user.name;
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
  const goldenBloomUnlocked = profile.unlockedBadges.includes("golden-bloom");
  const invitesRemaining = goldenBloomUnlocked ? 0 : Math.max(0, 3 - profile.weeklyInvites);

  async function inviteFriend() {
    if (invitesRemaining === 0) return;
    await Share.share({ message: `Join me on RDM and build one promise at a time. Use invite code ${profile.referralCode}.` });
  }

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <AppScreen>
      <Pressable
        accessibilityRole="button"
        disabled={invitesRemaining === 0}
        onPress={() => void inviteFriend()}
      >
        <LinearGradient colors={[colors.plumTint, colors.growthTint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.inviteBanner}>
          <IconBubble name="account-multiple-plus-outline" color={colors.plum} backgroundColor={colors.plumTint} size={18} />
          <Text style={styles.inviteCopy}>{invitesRemaining > 0 ? <>Invite {invitesRemaining} friend{invitesRemaining === 1 ? "" : "s"} this week, unlock the <Text style={styles.bold}>Golden Bloom</Text> skin.</> : <>Your <Text style={styles.bold}>Golden Bloom</Text> skin is unlocked.</>}</Text>
          <Text style={styles.inviteCta}>{invitesRemaining > 0 ? "Invite →" : "Unlocked ✓"}</Text>
        </LinearGradient>
      </Pressable>

      <View style={styles.greetingRow}>
        <View style={styles.greetingCopy}>
          <Text style={rdmStyles.mono}>{dateLabel}</Text>
          <Text style={styles.greeting}>Morning, {firstName}</Text>
        </View>
        <View style={styles.streakPill}>
          <MaterialCommunityIcons name="fire" size={18} color={colors.gold} />
          <Text style={styles.streakText}>{profile.streak}</Text>
        </View>
        <Pressable accessibilityLabel="Sign out" hitSlop={8} onPress={() => setSignOutOpen(true)} style={styles.accountButton}>
          <MaterialCommunityIcons name="logout" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>

      <SurfaceCard
        onPress={() => router.push("/(app)/tree")}
        style={styles.treeCard}
      >
        <IconBubble
          backgroundColor={colors.growthTint}
          color={colors.growth}
          name="tree-outline"
          size={25}
        />
        <View style={styles.treeCopy}>
          <Text style={styles.treeTitle}>Grow Your Tree</Text>
          <Text style={styles.treeMeta}>
            Day {profile.streak} · {profile.plantStage} stage · Tap to tend it
          </Text>
        </View>
        <MaterialCommunityIcons name="arrow-right" size={20} color={colors.inkSoft} />
      </SurfaceCard>

      <SectionLabel>Choose your path</SectionLabel>
      <View style={styles.pathRow}>
        <SurfaceCard onPress={() => router.push("/(app)/framework")} style={styles.pathCard}>
          <IconBubble name="clipboard-check-outline" color={colors.plum} backgroundColor={colors.plumTint} />
          <Text style={styles.pathTitle}>Framework</Text>
          <Text style={styles.pathCopy}>Choose a habit or build your own with PARR.</Text>
          <Text style={[styles.pathGo, { color: colors.plum }]}>Browse →</Text>
        </SurfaceCard>
        <SurfaceCard onPress={() => router.push("/(app)/ai-coach")} style={styles.pathCard}>
          <IconBubble name="creation-outline" color={colors.ai} backgroundColor={colors.aiTint} />
          <Text style={styles.pathTitle}>AI-Guided</Text>
          <Text style={styles.pathCopy}>Discuss your challenge with the RDM coach.</Text>
          <Text style={[styles.pathGo, { color: colors.ai }]}>Preview →</Text>
        </SurfaceCard>
      </View>

      <SectionLabel>Responsible games</SectionLabel>
      <View style={styles.gameRow}>
        {games.slice(0, 3).map((game) => (
          <Pressable key={game.id} onPress={() => router.push({ pathname: "/(app)/game/[id]", params: { id: game.id } })} style={({ pressed }) => [styles.gameChip, pressed && styles.pressed]}>
            <Text style={styles.timer}>{gameDurationLabel(game.durationSeconds)} MIN</Text>
            <MaterialCommunityIcons name={game.icon as IconName} size={22} color={colors.ai} />
            <Text style={styles.gameTitle}>{game.title}</Text>
            <Text style={styles.gameDescription}>{game.description}</Text>
          </Pressable>
        ))}
      </View>

      <SectionLabel>RDM Wallet</SectionLabel>
      <SurfaceCard onPress={() => router.push("/(app)/(tabs)/wallet")} style={styles.walletCard}>
        {[
          ["Balance", profile.wallet.balance, colors.growth],
          ["Reward", profile.wallet.reward, colors.gold],
          ["Remorse", profile.wallet.remorse, colors.coral],
          ["Peer", profile.wallet.peer, colors.plum],
        ].map(([label, amount, color], index) => (
          <View key={String(label)} style={[styles.walletCell, index < 3 && styles.walletDivider]}>
            <Text style={[styles.walletAmount, { color: String(color) }]}>{formatRdm(Number(amount))}</Text>
            <Text style={styles.walletLabel}>{label}</Text>
          </View>
        ))}
      </SurfaceCard>

      <View style={styles.metaLinks}>
        <Pressable onPress={() => router.push("/(app)/leaderboard")} style={styles.metaLink}>
          <MaterialCommunityIcons name="podium" size={20} color={colors.plum} />
          <Text style={styles.metaLinkText}>Leaderboard</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(app)/badges")} style={styles.metaLink}>
          <MaterialCommunityIcons name="medal-outline" size={20} color={colors.gold} />
          <Text style={styles.metaLinkText}>Badges</Text>
        </Pressable>
      </View>
      <ActionDialog
        cancelLabel="Stay signed in"
        confirmColor={colors.coral}
        confirmLabel="Sign out"
        message="Your progress is safely stored and will be here when you return."
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          void signOut();
        }}
        title="Sign out?"
        visible={signOutOpen}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  inviteBanner: { borderRadius: 13, borderWidth: 1, borderColor: colors.line, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  inviteCopy: { flex: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 11, lineHeight: 15 },
  bold: { fontFamily: fonts.bodyBold },
  inviteCta: { color: colors.plum, fontFamily: fonts.monoBold, fontSize: 10 },
  greetingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  greetingCopy: { flex: 1 },
  greeting: { color: colors.ink, fontFamily: fonts.display, fontSize: 22, marginTop: 2 },
  streakPill: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radii.pill, paddingHorizontal: 10, backgroundColor: colors.goldTint, borderWidth: 1, borderColor: "rgba(240,180,41,0.25)" },
  streakText: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 13 },
  accountButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  treeCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 14 },
  treeCopy: { flex: 1, gap: 3 },
  treeTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 16 },
  treeMeta: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 },
  pathRow: { flexDirection: "row", gap: 10 },
  pathCard: { flex: 1, minHeight: 148, gap: 7 },
  pathTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 16 },
  pathCopy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, flex: 1 },
  pathGo: { fontFamily: fonts.monoBold, fontSize: 10 },
  gameRow: { flexDirection: "row", gap: 8 },
  gameChip: { flex: 1, minWidth: 0, minHeight: 132, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radii.medium, padding: 10, gap: 7 },
  timer: { alignSelf: "flex-start", color: colors.ai, backgroundColor: colors.aiTint, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, fontFamily: fonts.monoBold, fontSize: 9 },
  gameTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  gameDescription: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10 },
  walletCard: { padding: 6, flexDirection: "row" },
  walletCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  walletDivider: { borderRightWidth: 1, borderRightColor: colors.line },
  walletAmount: { fontFamily: fonts.monoBold, fontSize: 13 },
  walletLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 9, marginTop: 2 },
  metaLinks: { flexDirection: "row", gap: 10 },
  metaLink: { flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  metaLinkText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  pressed: { opacity: 0.75 },
});
