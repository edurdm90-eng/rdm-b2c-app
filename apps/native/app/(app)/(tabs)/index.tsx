import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
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
  const [moreOpen, setMoreOpen] = useState(false);
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
      <View style={styles.heading}>
        <Text style={styles.date}>{dateLabel}</Text>
        <Text accessibilityRole="header" style={styles.title}>Make today count.</Text>
      </View>

      <View style={styles.progressRow}>
        <View accessibilityLabel={`${today.completed} of ${today.total} daily reflections done`} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: today.total || 1, now: today.completed }} aria-valuemin={0} aria-valuemax={today.total || 1} aria-valuenow={today.completed} aria-valuetext={`${today.completed} of ${today.total} daily reflections done`} style={styles.ring}>
          <ProgressCircle animated={false} borderWidth={0} color={today.completed === 0 ? palette.line : palette.green} direction="clockwise" progress={today.total > 0 ? today.completed / today.total : 0} size={128} strokeCap="round" thickness={10} unfilledColor={palette.line} />
          <View pointerEvents="none" style={styles.ringCopy}>
            <Text style={styles.progressCount}>{today.completed} of {today.total}</Text>
            <Text style={styles.progressLabel}>daily reflections{"\n"}done</Text>
          </View>
        </View>
        <View style={styles.progressDivider} />
        <Text style={styles.encouragement}>Small steps{"\n"}today, a brighter{"\n"}you tomorrow.</Text>
      </View>

      <View style={styles.nextSection}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Next up</Text>
        {firstItem ? (
          <View style={styles.nextCard}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${firstItem.title}`} onPress={() => openCommitment(firstItem)} style={({ pressed }) => [styles.nextCardHeading, pressed && styles.pressed]}>
              <MaterialCommunityIcons name={firstItem.icon as IconName} size={38} color={palette.text} />
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
            <MaterialCommunityIcons name={allReflected ? "check-circle-outline" : "sprout-outline"} size={28} color={palette.green} />
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{allReflected ? "Today's reflections are complete" : "Room for one small step"}</Text>
              <Text style={styles.caption}>{allReflected ? "Your progress is saved. Keep growing tomorrow." : "No daily reflections are pending. Browse habits or plan a goal with Medaa Ai."}</Text>
            </View>
          </View>
        )}
        {today.items.slice(1, 3).map((item) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} key={`${item.kind}:${item.id}`} onPress={() => openCommitment(item)} style={({ pressed }) => [styles.compactItem, pressed && styles.pressed]}>
            <MaterialCommunityIcons name={item.kind === "goal" ? "bullseye-arrow" : item.icon as IconName} size={32} color={item.kind === "goal" ? palette.gold : palette.green} />
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
        <MaterialCommunityIcons name="tree-outline" size={43} color={palette.green} />
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
        <MaterialCommunityIcons name="bowl-mix-outline" size={28} color={palette.purple} />
        <View style={styles.itemCopy}><Text style={styles.cardTitle}>Japanese Wisdom</Text><Text style={styles.caption}>Hara Hachi Bu · a mindful daily moment</Text></View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={palette.muted} />
      </Pressable>

      <View style={styles.moreSection}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreOpen }} aria-expanded={moreOpen} onPress={() => setMoreOpen((open) => !open)} style={styles.moreHeading}>
          <Text style={styles.moreLabel}>More & account</Text><MaterialCommunityIcons name={moreOpen ? "chevron-up" : "chevron-down"} size={22} color={palette.muted} />
        </Pressable>
        {moreOpen ? <View style={styles.moreContent}>
          <Text style={styles.accountName}>{user.name}</Text>
          <Text style={styles.caption}>Current streak: {profile.streak} days · Invite code: {profile.referralCode}</Text>
          <View style={styles.moreLinks}>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/leaderboard")} style={styles.moreLink}><MaterialCommunityIcons name="podium" size={20} color={palette.purple} /><Text style={styles.moreLinkLabel}>Leaderboard</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/badges")} style={styles.moreLink}><MaterialCommunityIcons name="medal-outline" size={20} color={palette.gold} /><Text style={styles.moreLinkLabel}>Badges</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/(tabs)/games")} style={styles.moreLink}><MaterialCommunityIcons name="gamepad-variant-outline" size={20} color={palette.link} /><Text style={styles.moreLinkLabel}>Responsible games</Text></Pressable>
            {invitesRemaining > 0 ? <Pressable accessibilityRole="button" onPress={() => void inviteFriend()} style={styles.moreLink}><MaterialCommunityIcons name="account-plus-outline" size={20} color={palette.green} /><Text style={styles.moreLinkLabel}>Invite a friend</Text></Pressable> : null}
          </View>
          <Text style={styles.caption}>{invitesRemaining > 0 ? `${invitesRemaining} invites to Golden Bloom this week.` : "Your Golden Bloom skin is unlocked."}</Text>
          <Pressable accessibilityRole="button" onPress={() => setSignOutOpen(true)} style={styles.signOut}><MaterialCommunityIcons name="logout" size={18} color={palette.muted} /><Text style={styles.moreLabel}>Sign out</Text></Pressable>
        </View> : null}
        {accountError ? <Text accessibilityRole="alert" style={styles.error}>{accountError}</Text> : null}
      </View>
      <ActionDialog cancelLabel="Stay signed in" confirmColor={palette.coral} confirmLabel="Sign out" message="Your progress is safely stored and will be here when you return." onCancel={() => setSignOutOpen(false)} onConfirm={() => void signOut()} title="Sign out?" visible={signOutOpen} />
    </FocusedScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: 16 },
  heading: { gap: 7 },
  date: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 28, lineHeight: 36 },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingVertical: 3 },
  ring: { width: 128, height: 128 },
  ringCopy: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 3 },
  progressCount: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 20 },
  progressLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, textAlign: "center" },
  progressDivider: { width: 1, height: 76, backgroundColor: palette.line },
  encouragement: { flex: 1, color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  nextSection: { borderTopWidth: 1, borderColor: palette.line, paddingTop: 12, gap: 10 },
  sectionTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21 },
  nextCard: { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, borderRadius: 10, padding: 8, gap: 10 },
  nextCardHeading: { flexDirection: "row", alignItems: "center", gap: 13, padding: 6, minHeight: 54 },
  itemCopy: { flex: 1, gap: 4 },
  itemTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 },
  cardTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  caption: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  primaryButton: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, backgroundColor: palette.green, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: palette.onGreen, fontFamily: fonts.bodyBold, fontSize: 15, textAlign: "center" },
  compactItem: { flexDirection: "row", alignItems: "center", gap: 15, borderBottomWidth: 1, borderColor: palette.line, minHeight: 66, paddingVertical: 10, paddingHorizontal: 2 },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 15 },
  moreDue: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  treeCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 12, minHeight: 76 },
  treeAction: { minHeight: 40, minWidth: 52, borderWidth: 1, borderColor: "#245a48", borderRadius: 9, backgroundColor: "#17362c", alignItems: "center", justifyContent: "center", paddingHorizontal: 11 },
  treeActionLabel: { color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 13 },
  exploreLinks: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  link: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 3 },
  linkLabel: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 13 },
  wisdomCard: { minHeight: 64, borderWidth: 1, borderColor: palette.line, borderRadius: 10, flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  moreSection: { borderTopWidth: 1, borderColor: palette.line },
  moreHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  moreLabel: { color: palette.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  moreContent: { paddingVertical: 8, gap: 8 },
  accountName: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14 },
  moreLinks: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  moreLink: { minWidth: "46%", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7 },
  moreLinkLabel: { color: palette.text, fontFamily: fonts.body, fontSize: 12 },
  signOut: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  error: { color: palette.coral, fontFamily: fonts.body, fontSize: 12 },
  pressed: { opacity: 0.72 },
});
