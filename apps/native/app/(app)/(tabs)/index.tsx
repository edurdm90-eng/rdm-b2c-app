import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { Image, Modal, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { ProgressCircle } from "react-native-progress/Circle";

import { FocusedScreen, focusedColors as palette } from "@/components/focused-ui";
import { ActionDialog, ErrorState, LoadingState } from "@/components/rdm-ui";
import { authClient } from "@/lib/auth-client";
import { fonts, formatRdm } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
function openCommitment(item: { id: string; kind: "habit" | "goal" }) {
  router.push({ pathname: item.kind === "habit" ? "/(app)/habit/[id]" : "/(app)/goal/[id]", params: { id: item.id } });
}

export default function HomeScreen() {
  const focused = useIsFocused();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [accountError, setAccountError] = useState("");
  const dashboard = useQuery({
    ...trpc.rdm.dashboard.queryOptions(),
    enabled: focused,
    refetchInterval: focused ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  if (dashboard.isLoading) return <LoadingState />;
  if (dashboard.error || !dashboard.data) {
    return <ErrorState message={dashboard.error?.message ?? "The dashboard is unavailable."} onRetry={() => void dashboard.refetch()} />;
  }

  const { user, profile, today, serverTime } = dashboard.data;
  const firstName = user.name.trim().split(/\s+/)[0] || "there";
  const firstItem = today.items[0];
  const allReflected = today.total > 0 && today.completed === today.total;
  const dateLabel = new Date(serverTime).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const invitesRemaining = profile.unlockedBadges.includes("golden-bloom") ? 0 : Math.max(0, 3 - profile.weeklyInvites);

  async function inviteFriend() {
    if (invitesRemaining === 0) return;
    setAccountError("");
    try {
      await Share.share({ message: `Join me on RDM and build one promise at a time. Use invite code ${profile.referralCode}.` });
    } catch {
      setAccountError("Sharing is unavailable right now. Your invite code is shown below.");
    }
  }

  async function signOut() {
    setSignOutOpen(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message ?? "Please try signing out again.");
      queryClient.clear();
      router.replace("/login");
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Please try signing out again.");
    }
  }

  return (
    <FocusedScreen contentStyle={styles.screenContent}>
      <View style={styles.headingRow}>
        <View style={styles.heading}>
          <Text style={styles.date}>{dateLabel}</Text>
          <Text accessibilityRole="header" style={styles.title}>Good morning, {firstName}.</Text>
          <Text style={styles.greeting}>Make today count.</Text>
        </View>
        <Pressable accessibilityLabel="Open menu" accessibilityRole="button" onPress={() => setMenuOpen(true)} style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="menu" size={25} color={palette.text} />
        </Pressable>
      </View>

      <View style={styles.progressRow}>
        <View accessibilityLabel={`${today.completed} of ${today.total} daily reflections done`} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: today.total || 1, now: today.completed }} aria-valuemin={0} aria-valuemax={today.total || 1} aria-valuenow={today.completed} aria-valuetext={`${today.completed} of ${today.total} daily reflections done`} style={styles.ring}>
          {today.total === 0 ? <Image accessible={false} source={require("@/assets/homescreen_logo/image.png")} resizeMode="contain" style={styles.emptyProgressLogo} /> : <>
            <ProgressCircle animated={false} borderWidth={0} color={today.completed === 0 ? palette.line : palette.green} direction="clockwise" progress={today.completed / today.total} size={108} strokeCap="round" thickness={9} unfilledColor={palette.line} />
            <View pointerEvents="none" style={styles.ringCopy}>
              <Text style={styles.progressCount}>{today.completed} of {today.total}</Text>
              <Text style={styles.progressLabel}>daily reflections{"\n"}done</Text>
            </View>
          </>}
        </View>
        <View style={styles.progressDivider} />
        <Text style={styles.encouragement}>Small steps{"\n"}today, a brighter{"\n"}you tomorrow.</Text>
      </View>

      <View style={styles.nextSection}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Next up</Text>
        {firstItem ? (
          <View style={styles.nextCard}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${firstItem.title}`} onPress={() => openCommitment(firstItem)} style={({ pressed }) => [styles.nextCardHeading, pressed && styles.pressed]}>
              <MaterialCommunityIcons name={firstItem.icon as IconName} size={30} color={palette.text} />
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{firstItem.title}</Text>
                <Text style={styles.caption}>{firstItem.perDay === null ? "Keep moving toward your goal" : `${formatRdm(firstItem.perDay)} RDM allocated today`}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={palette.muted} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => openCommitment(firstItem)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryLabel}>{firstItem.stage === "reflect" ? "Add reflection" : firstItem.stage === "act" ? "Check in & reflect" : "Update progress"}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name={allReflected ? "check-circle-outline" : "sprout-outline"} size={24} color={palette.green} />
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{allReflected ? "Today's reflections are complete" : "Room for one small step"}</Text>
              <Text style={styles.caption}>{allReflected ? "Your progress is saved. Keep growing tomorrow." : "No daily reflections are pending. Browse habits or plan a goal with Medaa Ai."}</Text>
            </View>
          </View>
        )}
        {today.items.slice(1, 3).map((item) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} key={`${item.kind}:${item.id}`} onPress={() => openCommitment(item)} style={({ pressed }) => [styles.compactItem, pressed && styles.pressed]}>
            <MaterialCommunityIcons name={item.kind === "goal" ? "bullseye-arrow" : item.icon as IconName} size={26} color={item.kind === "goal" ? palette.gold : palette.green} />
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.caption}>{item.kind === "goal" ? "Goal" : "Habit"}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={palette.muted} />
          </Pressable>
        ))}
        {today.items.length > 3 ? <Text style={styles.moreDue}>{today.items.length - 3} more to continue in Habits and Goals</Text> : null}
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={profile.tree.pledgedAt ? "Tend your tree" : "Plant your tree"} onPress={() => router.push("/(app)/tree")} style={({ pressed }) => [styles.treeCard, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="tree-outline" size={32} color={palette.green} />
        <View style={styles.itemCopy}>
          <Text style={styles.cardTitle}>{profile.tree.pledgedAt ? `Your tree · Day ${profile.tree.dayNumber}` : "Grow your tree"}</Text>
          <Text style={styles.caption}>{profile.tree.pledgedAt ? "A brighter you grows here." : "Start with one promise to yourself."}</Text>
        </View>
        <View style={styles.treeAction}><Text style={styles.treeActionLabel}>{profile.tree.pledgedAt ? "Tend" : "Plant"}</Text></View>
      </Pressable>

      <View style={styles.exploreLinks}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/framework")} style={styles.link}>
          <Text style={styles.linkLabel}>Browse habits</Text><MaterialCommunityIcons name="arrow-right" size={20} color={palette.link} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/ai-coach")} style={styles.link}>
          <Text style={styles.linkLabel}>Medaa Ai</Text><MaterialCommunityIcons name="arrow-right" size={20} color={palette.link} />
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/(tabs)/japanese-wisdom")} style={({ pressed }) => [styles.wisdomCard, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="bowl-mix-outline" size={24} color={palette.purple} />
        <View style={styles.itemCopy}><Text style={styles.cardTitle}>Japanese Wisdom</Text><Text style={styles.caption}>Hara Hachi Bu · a mindful daily moment</Text></View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={palette.muted} />
      </Pressable>

      <Modal animationType="fade" transparent visible={menuOpen} onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuOverlay}>
          <Pressable accessibilityLabel="Close menu" accessibilityRole="button" onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.menuCard}>
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatar}><Text style={styles.menuAvatarText}>{firstName.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.itemCopy}><Text style={styles.accountName}>{user.name}</Text><Text style={styles.caption}>Current streak: {profile.streak} days</Text></View>
              <Pressable accessibilityLabel="Close menu" accessibilityRole="button" onPress={() => setMenuOpen(false)} style={styles.menuClose}><MaterialCommunityIcons name="close" size={20} color={palette.muted} /></Pressable>
            </View>
            <Text style={styles.menuInvite}>Invite code · {profile.referralCode}</Text>
            <View style={styles.menuLinks}>
              <Pressable accessibilityRole="button" onPress={() => { setMenuOpen(false); router.push("/(app)/leaderboard"); }} style={styles.menuLink}><MaterialCommunityIcons name="podium" size={20} color={palette.purple} /><Text style={styles.menuLinkLabel}>Leaderboard</Text><MaterialCommunityIcons name="chevron-right" size={19} color={palette.muted} /></Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setMenuOpen(false); router.push("/(app)/badges"); }} style={styles.menuLink}><MaterialCommunityIcons name="medal-outline" size={20} color={palette.gold} /><Text style={styles.menuLinkLabel}>Badges</Text><MaterialCommunityIcons name="chevron-right" size={19} color={palette.muted} /></Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setMenuOpen(false); router.push("/(app)/(tabs)/games"); }} style={styles.menuLink}><MaterialCommunityIcons name="gamepad-variant-outline" size={20} color={palette.link} /><Text style={styles.menuLinkLabel}>Responsible games</Text><MaterialCommunityIcons name="chevron-right" size={19} color={palette.muted} /></Pressable>
              {invitesRemaining > 0 ? <Pressable accessibilityRole="button" onPress={() => { setMenuOpen(false); void inviteFriend(); }} style={styles.menuLink}><MaterialCommunityIcons name="account-plus-outline" size={20} color={palette.green} /><Text style={styles.menuLinkLabel}>Invite a friend</Text><MaterialCommunityIcons name="chevron-right" size={19} color={palette.muted} /></Pressable> : null}
            </View>
            <Text style={styles.caption}>{invitesRemaining > 0 ? `${invitesRemaining} invites to Golden Bloom this week.` : "Your Golden Bloom skin is unlocked."}</Text>
            {accountError ? <Text accessibilityRole="alert" style={styles.error}>{accountError}</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => { setMenuOpen(false); setSignOutOpen(true); }} style={styles.signOut}><MaterialCommunityIcons name="logout" size={18} color={palette.muted} /><Text style={styles.moreLabel}>Sign out</Text></Pressable>
          </View>
        </View>
      </Modal>
      <ActionDialog cancelLabel="Stay signed in" confirmColor={palette.coral} confirmLabel="Sign out" message="Your progress is safely stored and will be here when you return." onCancel={() => setSignOutOpen(false)} onConfirm={() => void signOut()} title="Sign out?" visible={signOutOpen} />
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: 14 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heading: { gap: 5 },
  date: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 31 },
  greeting: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  menuButton: { alignItems: "center", backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 10, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingVertical: 2 },
  ring: { width: 128, height: 128, alignItems: "center", justifyContent: "center" },
  ringCopy: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 2 },
  emptyProgressLogo: { width: 120, height: 120 },
  progressCount: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 17 },
  progressLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 15, textAlign: "center" },
  progressDivider: { width: 1, height: 64, backgroundColor: palette.line },
  encouragement: { flex: 1, color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  nextSection: { borderTopWidth: 1, borderColor: palette.line, paddingTop: 10, gap: 9 },
  sectionTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 14.5, lineHeight: 19 },
  nextCard: { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, borderRadius: 10, padding: 7, gap: 8 },
  nextCardHeading: { flexDirection: "row", alignItems: "center", gap: 12, padding: 5, minHeight: 46 },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  cardTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  caption: { color: palette.muted, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16 },
  primaryButton: { minHeight: 42, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9, backgroundColor: palette.green, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: palette.onGreen, fontFamily: fonts.bodyBold, fontSize: 14, textAlign: "center" },
  compactItem: { flexDirection: "row", alignItems: "center", gap: 13, borderBottomWidth: 1, borderColor: palette.line, minHeight: 56, paddingVertical: 8, paddingHorizontal: 2 },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 13 },
  moreDue: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  treeCard: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 11, minHeight: 64 },
  treeAction: { minHeight: 36, minWidth: 48, borderWidth: 1, borderColor: "#245a48", borderRadius: 9, backgroundColor: "#17362c", alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  treeActionLabel: { color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  exploreLinks: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  link: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 3 },
  linkLabel: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  wisdomCard: { minHeight: 56, borderWidth: 1, borderColor: palette.line, borderRadius: 10, flexDirection: "row", alignItems: "center", padding: 11, gap: 11 },
  menuOverlay: { backgroundColor: "rgba(5, 10, 15, 0.68)", flex: 1 },
  menuCard: { backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 14, borderWidth: 1, elevation: 8, gap: 12, marginHorizontal: 16, marginTop: 62, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18 },
  menuHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
  menuAvatar: { alignItems: "center", backgroundColor: palette.green, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  menuAvatarText: { color: palette.onGreen, fontFamily: fonts.bodyBold, fontSize: 18 },
  menuClose: { alignItems: "center", height: 32, justifyContent: "center", width: 32 },
  menuInvite: { borderBottomColor: palette.line, borderBottomWidth: 1, color: palette.muted, fontFamily: fonts.mono, fontSize: 10, paddingBottom: 12 },
  menuLinks: { gap: 2 },
  menuLink: { alignItems: "center", borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 47 },
  menuLinkLabel: { color: palette.text, flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13 },
  moreLabel: { color: palette.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  accountName: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14 },
  signOut: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  error: { color: palette.coral, fontFamily: fonts.body, fontSize: 12 },
  pressed: { opacity: 0.72 },
});
