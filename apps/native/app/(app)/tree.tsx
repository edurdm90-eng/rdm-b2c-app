import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Ellipse, Path } from "react-native-svg";

import {
  AppScreen,
  ErrorState,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SectionLabel,
  SurfaceCard,
} from "@/components/rdm-ui";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function GrowingTreeArtwork({ width }: { width: number }) {
  return (
    <Svg
      accessibilityLabel="Three-leaf growing tree"
      height={Math.round(width * (16 / 15))}
      viewBox="0 0 100 110"
      width={width}
    >
      <Path
        d="M50 100 C50 70 42 55 46 30"
        fill="none"
        stroke="#3FCB8B"
        strokeLinecap="round"
        strokeWidth={5}
      />
      <Path
        d="M46 55 C30 50 22 38 24 24"
        fill="none"
        stroke="#54D99C"
        strokeLinecap="round"
        strokeWidth={5}
      />
      <Path
        d="M46 40 C64 36 72 24 70 12"
        fill="none"
        stroke="#54D99C"
        strokeLinecap="round"
        strokeWidth={5}
      />
      <Ellipse
        cx={24}
        cy={22}
        fill="#6EE8B4"
        rx={16}
        ry={11}
        transform="rotate(-25 24 22)"
      />
      <Ellipse
        cx={70}
        cy={10}
        fill="#6EE8B4"
        rx={16}
        ry={11}
        transform="rotate(20 70 10)"
      />
      <Ellipse
        cx={46}
        cy={26}
        fill="#82F2C4"
        rx={18}
        ry={12}
        transform="rotate(-4 46 26)"
      />
    </Svg>
  );
}

function TreeAction({
  icon,
  iconColor,
  iconBackground,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  iconColor: string;
  iconBackground: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={subtitle}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
    >
      <View style={[styles.actionIcon, { backgroundColor: iconBackground }]}>
        <MaterialCommunityIcons color={iconColor} name={icon} size={23} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

export default function TreeScreen() {
  const [amount, setAmount] = useState("100");
  const [notice, setNotice] = useState<string | null>(null);
  const dashboard = useQuery(trpc.rdm.dashboard.queryOptions());
  const pledge = useMutation(
    trpc.rdm.tree.pledge.mutationOptions({
      onSuccess: async () => {
        setNotice("Your tree pledge is active.");
        await queryClient.invalidateQueries();
      },
      onError: (error) => setNotice(error.message),
    }),
  );

  if (dashboard.isLoading) return <LoadingState label="Growing your tree…" />;
  if (dashboard.error || !dashboard.data) {
    return (
      <ErrorState
        message={dashboard.error?.message ?? "Your tree is unavailable."}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const { profile } = dashboard.data;
  const activePledge = profile.tree.pledgeAmount;
  const hasPledge = activePledge > 0;

  function submitPledge() {
    setNotice(null);
    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount < 10) {
      setNotice("Enter a whole-number pledge of at least 10 RDM.");
      return;
    }
    pledge.mutate({ amount: parsedAmount });
  }

  function showNextStep(title: string) {
    Alert.alert(title, "We will build this action in the next step. Your tree page is ready now.");
  }

  return (
    <AppScreen contentStyle={styles.content}>
      <PageHeader
        back
        subtitle={`DAY ${profile.streak} · ${profile.plantStage}`}
        title="Grow Every Day"
      />

      <LinearGradient
        colors={[colors.growthTint, colors.panel, colors.panel]}
        end={{ x: 0.82, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.scoreCard}
      >
        <Text style={styles.scoreLabel}>RDM Score</Text>
        <Text style={styles.score}>{formatRdm(profile.wallet.balance)}</Text>
        <View style={styles.purseRow}>
          <View style={styles.purseCell}>
            <Text style={[styles.purseAmount, { color: colors.gold }]}>
              {formatRdm(profile.wallet.reward)}
            </Text>
            <Text style={styles.purseLabel}>Reward Purse</Text>
          </View>
          <View style={styles.purseCell}>
            <Text style={[styles.purseAmount, { color: colors.coral }]}>
              {formatRdm(profile.wallet.remorse)}
            </Text>
            <Text style={styles.purseLabel}>Remorse Purse</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.pledgeSection}>
        <SectionLabel>Pledge RDM for this tree</SectionLabel>
        <SurfaceCard style={styles.pledgeCard}>
          <Text style={styles.pledgeCopy}>
            Stake RDM once — earn small micro-rewards every time you tend the tree.
          </Text>
          <View style={styles.pledgeRow}>
            <TextInput
              accessibilityLabel="Tree pledge amount"
              editable={!hasPledge && !pledge.isPending}
              keyboardType="number-pad"
              onChangeText={setAmount}
              placeholder="100"
              placeholderTextColor={colors.inkSoft}
              selectTextOnFocus
              style={[styles.pledgeInput, hasPledge && styles.pledgeInputDisabled]}
              value={hasPledge ? String(activePledge) : amount}
            />
            <PrimaryButton
              disabled={hasPledge}
              label={hasPledge ? "Pledged" : "Pledge"}
              loading={pledge.isPending}
              onPress={submitPledge}
              style={styles.pledgeButton}
            />
          </View>
          <View style={styles.pledgeNoteRow}>
            <MaterialCommunityIcons color={colors.inkSoft} name="alert-outline" size={15} />
            <Text style={styles.pledgeNote}>
              Miss a streak day and RDM shifts from Reward → Remorse Purse automatically.
            </Text>
          </View>
          {notice ? (
            <Text
              accessibilityRole="alert"
              style={[styles.notice, notice.includes("active") ? styles.noticeSuccess : null]}
            >
              {notice}
            </Text>
          ) : null}
        </SurfaceCard>
      </View>

      <View
        accessibilityLabel={`${profile.plantStage} tree, ${profile.tree.growth.points} growth points from a ${profile.streak} day streak and ${profile.tree.waterCount} water actions`}
        style={styles.treeVisual}
      >
        <GrowingTreeArtwork width={profile.tree.growth.artworkWidth} />
        <Text style={styles.growthCaption}>
          {profile.streak} streak + {profile.tree.waterCount} water · {profile.tree.growth.points} growth
        </Text>
      </View>

      <View style={styles.actionRow}>
        <TreeAction
          icon="grain"
          iconBackground={colors.goldTint}
          iconColor={colors.gold}
          onPress={() => router.push("/(app)/(tabs)/habits")}
          subtitle="Manage Streak Meter"
          title="Add Fertilizer"
        />
        <TreeAction
          icon="water"
          iconBackground={colors.aiTint}
          iconColor={colors.ai}
          onPress={() => router.push("/(app)/thank-you")}
          subtitle="Say Thank You"
          title="Add Water"
        />
        <TreeAction
          icon="white-balance-sunny"
          iconBackground={colors.coralTint}
          iconColor={colors.coral}
          onPress={() => showNextStep("Good Deeds Register")}
          subtitle="Do Good Deeds"
          title="Add Sunlight"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  scoreCard: {
    alignItems: "center",
    padding: 16,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.line,
  },
  scoreLabel: {
    color: colors.inkSoft,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  score: {
    color: colors.growth,
    fontFamily: fonts.monoBold,
    fontSize: 31,
    marginBottom: 11,
    marginTop: 4,
  },
  purseRow: { width: "100%", flexDirection: "row", gap: 9 },
  purseCell: {
    flex: 1,
    alignItems: "center",
    borderRadius: 11,
    backgroundColor: colors.panelRaised,
    padding: 10,
  },
  purseAmount: { fontFamily: fonts.monoBold, fontSize: 15 },
  purseLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, marginTop: 3 },
  pledgeSection: { gap: 8 },
  pledgeCard: { gap: 9 },
  pledgeCopy: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 },
  pledgeRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  pledgeInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panelRaised,
    color: colors.ink,
    fontFamily: fonts.monoBold,
    fontSize: 14,
    paddingHorizontal: 13,
  },
  pledgeInputDisabled: { color: colors.inkSoft },
  pledgeButton: { minWidth: 94 },
  pledgeNoteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  pledgeNote: { flex: 1, color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, lineHeight: 15 },
  notice: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  noticeSuccess: { color: colors.growth },
  treeVisual: { alignItems: "center", justifyContent: "center", minHeight: 184 },
  growthCaption: {
    color: colors.growth,
    fontFamily: fonts.mono,
    fontSize: 9,
    marginTop: 4,
    textTransform: "uppercase",
  },
  actionRow: { flexDirection: "row", gap: 9 },
  actionTile: {
    flex: 1,
    minHeight: 124,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    paddingHorizontal: 7,
    paddingVertical: 12,
  },
  actionIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    marginBottom: 8,
  },
  actionTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 11, textAlign: "center" },
  actionSubtitle: {
    color: colors.inkSoft,
    fontFamily: fonts.body,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
    textAlign: "center",
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
