import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { ActionDialog, ErrorState, LoadingState } from "@/components/rdm-ui";
import { FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { authClient } from "@/lib/auth-client";
import { fonts, formatRdm } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

const menuItems = [
  { label: "Leaderboard", hint: "See how your progress compares", icon: "podium" as const, color: palette.purple, route: "/(app)/leaderboard" as const },
  { label: "Badges", hint: "View achievements you have earned", icon: "medal-outline" as const, color: palette.gold, route: "/(app)/badges" as const },
  { label: "Responsible games", hint: "A short reset when you need one", icon: "gamepad-variant-outline" as const, color: palette.link, route: "/(app)/(tabs)/games" as const },
];

export default function AccountScreen() {
  const focused = useIsFocused();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [error, setError] = useState("");
  const dashboard = useQuery({ ...trpc.rdm.dashboard.queryOptions(), enabled: focused });

  if (dashboard.isLoading) return <LoadingState label="Opening your account…" />;
  if (dashboard.error || !dashboard.data) return <ErrorState message={dashboard.error?.message ?? "Your account is unavailable."} onRetry={() => void dashboard.refetch()} />;

  const { user, profile } = dashboard.data;
  const initials = user.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R";
  const invitesRemaining = profile.unlockedBadges.includes("golden-bloom") ? 0 : Math.max(0, 3 - profile.weeklyInvites);

  async function inviteFriend() {
    setError("");
    try {
      await Share.share({ message: `Join me on RDM and build one promise at a time. Use invite code ${profile.referralCode}.` });
    } catch {
      setError("Sharing is unavailable right now. Your invite code is shown above.");
    }
  }

  async function signOut() {
    setSignOutOpen(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message ?? "Please try signing out again.");
      queryClient.clear();
      router.replace("/login");
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Please try signing out again.");
    }
  }

  return (
    <FocusedScreen contentStyle={styles.screenContent}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)")} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={26} color={palette.text} />
        </Pressable>
        <View><Text style={styles.headerTitle}>Account</Text><Text style={styles.headerSubtitle}>Your RDM space</Text></View>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.profileCopy}><Text style={styles.name}>{user.name}</Text><Text style={styles.email}>{user.email}</Text></View>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.stat}><Text style={styles.statValue}>{profile.streak}</Text><Text style={styles.statLabel}>day streak</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><Text style={styles.statValue}>{formatRdm(profile.wallet.balance)}</Text><Text style={styles.statLabel}>total RDM</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><Text style={styles.statValue}>{profile.referralCode}</Text><Text style={styles.statLabel}>invite code</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Explore</Text>
      <View style={styles.menuCard}>
        {menuItems.map((item) => <Pressable key={item.label} accessibilityRole="button" onPress={() => router.push(item.route)} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
          <View style={[styles.menuIcon, { backgroundColor: `${item.color}22` }]}><MaterialCommunityIcons name={item.icon} size={21} color={item.color} /></View>
          <View style={styles.menuCopy}><Text style={styles.menuLabel}>{item.label}</Text><Text style={styles.menuHint}>{item.hint}</Text></View>
          <MaterialCommunityIcons name="chevron-right" size={21} color={palette.muted} />
        </Pressable>)}
        {invitesRemaining > 0 ? <Pressable accessibilityRole="button" onPress={() => void inviteFriend()} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
          <View style={[styles.menuIcon, { backgroundColor: `${palette.green}22` }]}><MaterialCommunityIcons name="account-plus-outline" size={21} color={palette.green} /></View>
          <View style={styles.menuCopy}><Text style={styles.menuLabel}>Invite a friend</Text><Text style={styles.menuHint}>{invitesRemaining} invites remaining this week</Text></View>
          <MaterialCommunityIcons name="share-variant-outline" size={20} color={palette.muted} />
        </Pressable> : null}
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.comingSoon}><MaterialCommunityIcons name="tune-variant" size={21} color={palette.muted} /><View style={styles.menuCopy}><Text style={styles.menuLabel}>Preferences</Text><Text style={styles.menuHint}>Profile, notifications, and linked accounts are coming soon.</Text></View></View>
      <Pressable accessibilityRole="button" onPress={() => setSignOutOpen(true)} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}><MaterialCommunityIcons name="logout" size={19} color={palette.coral} /><Text style={styles.signOutLabel}>Sign out</Text></Pressable>
      <ActionDialog cancelLabel="Stay signed in" confirmColor={palette.coral} confirmLabel="Sign out" message="Your progress is safely stored and will be here when you return." onCancel={() => setSignOutOpen(false)} onConfirm={() => void signOut()} title="Sign out?" visible={signOutOpen} />
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: 14, paddingTop: 16 },
  header: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 44 },
  backButton: { alignItems: "center", height: 40, justifyContent: "center", marginLeft: -8, width: 40 },
  headerTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 27 },
  headerSubtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  profileCard: { alignItems: "center", backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 12, padding: 16 },
  avatar: { alignItems: "center", backgroundColor: palette.green, borderRadius: 28, height: 56, justifyContent: "center", width: 56 },
  avatarText: { color: palette.onGreen, fontFamily: fonts.bodyBold, fontSize: 21 },
  profileCopy: { flex: 1, gap: 3 },
  name: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 18 },
  email: { color: palette.muted, fontFamily: fonts.body, fontSize: 11 },
  statsCard: { alignItems: "center", backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 10, borderWidth: 1, flexDirection: "row", justifyContent: "space-around", paddingVertical: 14 },
  stat: { alignItems: "center", flex: 1, gap: 3 },
  statValue: { color: palette.text, fontFamily: fonts.monoBold, fontSize: 15 },
  statLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 10 },
  statDivider: { backgroundColor: palette.line, height: 30, width: 1 },
  sectionTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 15, marginTop: 4 },
  menuCard: { backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12 },
  menuItem: { alignItems: "center", borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: "row", gap: 11, minHeight: 62 },
  menuIcon: { alignItems: "center", borderRadius: 10, height: 36, justifyContent: "center", width: 36 },
  menuCopy: { flex: 1, gap: 2 },
  menuLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13 },
  menuHint: { color: palette.muted, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 16 },
  comingSoon: { alignItems: "center", backgroundColor: "rgba(177,190,209,0.06)", borderColor: palette.line, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 11, padding: 13 },
  signOut: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 42 },
  signOutLabel: { color: palette.coral, fontFamily: fonts.bodyMedium, fontSize: 13 },
  error: { color: palette.coral, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.72 },
});
