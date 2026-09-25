import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { FocusedButton, focusedColors as palette } from "@/components/focused-ui";
import { TreeArtwork, TreeNotice, TreePage, treeStyles as ui } from "@/components/tree-ui";
import { STANDARD_REFRESH_MS } from "@/lib/query-policy";
import { fonts, formatRdm } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { queryClient, trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function CareRow({ title, subtitle, icon, color, done, onPress }: { title: string; subtitle: string; icon: IconName; color: string; done: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${done ? "done today" : "ready"}`} onPress={onPress} style={({ pressed }) => [styles.careRow, pressed && styles.pressed]}>
    <View style={[styles.careIcon, { backgroundColor: color + "18" }]}><MaterialCommunityIcons name={icon} size={27} color={color} /></View>
    <View style={styles.flex}><Text style={styles.careTitle}>{title}</Text><Text style={ui.small}>{subtitle}</Text></View>
    <View style={styles.badge}>{done ? <MaterialCommunityIcons name="check-circle" size={15} color={palette.green} /> : null}<Text style={styles.badgeText}>{done ? "Done today" : "Ready"}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={20} color={palette.muted} />
  </Pressable>;
}

export default function TreeScreen() {
  const timeZone = getDeviceTimeZone();
  const focused = useIsFocused();
  const [amount, setAmount] = useState("10");
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const submitting = useRef(false);
  const overview = useQuery(trpc.rdm.tree.overview.queryOptions({ timeZone }, { enabled: focused, refetchInterval: focused ? STANDARD_REFRESH_MS : false }));
  const pledge = useMutation(trpc.rdm.tree.pledge.mutationOptions());
  const missedDayKey = overview.data?.missedDay?.dayKey;
  useEffect(() => { if (focused && missedDayKey && !working) router.replace("/(app)/streak-missed"); }, [focused, missedDayKey, working]);
  const profile = overview.data?.profile;
  const planted = Boolean(profile && profile.tree.pledgeAmount > 0);
  const parsedAmount = Number(amount);
  const valid = Number.isInteger(parsedAmount) && parsedAmount >= 10 && parsedAmount <= 100_000;
  const affordable = profile && valid && parsedAmount <= profile.wallet.base;

  async function plant() {
    if (submitting.current || !profile || planted || !valid || !affordable) return;
    submitting.current = true; setWorking(true); setNotice(null);
    try {
      const result = await pledge.mutateAsync({ amount: parsedAmount, timeZone });
      queryClient.setQueryData(trpc.rdm.tree.overview.queryKey({ timeZone }), { profile: result, missedDay: null });
      await queryClient.invalidateQueries({ queryKey: trpc.rdm.pathKey() });
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : "Your tree could not be confirmed. Check your balance and retry.");
      await overview.refetch();
    } finally { submitting.current = false; setWorking(false); }
  }

  return <TreePage title="Grow Every Day" busy={working} onBack={() => router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)")}
    footer={profile && !missedDayKey ? planted ? <>
      <Text style={[ui.small, styles.center]}>Care your way. Every positive action helps.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push("./tree-history")} style={ui.textButton}><Text style={ui.link}>View care history →</Text></Pressable>
    </> : <>
      {notice ? <Text accessibilityRole="alert" style={ui.error}>{notice}</Text> : null}
      <FocusedButton label={valid ? `Pledge ${formatRdm(parsedAmount)} RDM & plant` : "Enter a pledge of at least 10 RDM"} disabled={!affordable || Boolean(missedDayKey)} loading={working} onPress={() => void plant()} />
    </> : undefined}>
    {overview.isPending || missedDayKey ? <ActivityIndicator color={palette.green} /> : overview.error || !profile ? <>
      <Text accessibilityRole="alert" style={ui.error}>{overview.error?.message ?? "Your tree is unavailable."}</Text><FocusedButton label="Retry" onPress={() => void overview.refetch()} />
    </> : !planted ? <>
      <View style={styles.intro}><Text accessibilityRole="header" style={ui.heading}>Your growth starts here.</Text><Text style={ui.body}>Make room for a small act of care.</Text></View>
      <TreeArtwork variant="seedling" height={150} />
      <View style={[ui.divider, styles.pledgeSection]}>
        <Text style={ui.section}>Tree pledge</Text><Text style={ui.body}>A one-time pledge from your Base to plant your tree. Minimum 10 RDM.</Text>
        <View style={styles.pledgeInputRow}><TextInput accessibilityLabel="Tree pledge amount" keyboardType="number-pad" inputMode="numeric" editable={!working} value={amount} onChangeText={setAmount} maxLength={6} style={[styles.input, Platform.OS === "web" && styles.webInput]} /><Text style={styles.unit}>RDM</Text></View>
        {!valid ? <Text style={ui.error}>Enter a whole number from 10 to 100,000 RDM.</Text> : !affordable ? <Text style={ui.error}>You need {formatRdm(parsedAmount - profile.wallet.base)} more Base RDM to plant.</Text> : null}
      </View>
      <View style={[ui.panel, styles.summary]}>
        <View style={styles.summaryRow}><MaterialCommunityIcons name="wallet-outline" color={palette.muted} size={23} /><Text style={[ui.body, styles.flex]}>Base available</Text><Text style={styles.value}>{formatRdm(profile.wallet.base)} RDM</Text></View>
        <View style={styles.summaryRow}><MaterialCommunityIcons name="minus-circle-outline" color={palette.coral} size={23} /><Text style={[ui.body, styles.flex]}>Tree pledge</Text><Text style={styles.value}>{valid ? `− ${formatRdm(parsedAmount)} RDM` : "—"}</Text></View>
        <View style={[styles.summaryRow, styles.summaryLast]}><MaterialCommunityIcons name="file-document-outline" color={palette.muted} size={23} /><Text style={[ui.body, styles.flex]}>After pledge</Text><Text style={[styles.value, !affordable && { color: palette.coral }]}>{valid ? `${formatRdm(profile.wallet.base - parsedAmount)} RDM` : "—"}</Text></View>
      </View>
      <TreeNotice>A missed care day moves up to 10 available Reward RDM to Remorse. Any care action counts.</TreeNotice>
    </> : <>
      <View style={styles.intro}><Text accessibilityRole="header" style={[ui.heading, styles.center]}>Day {profile.tree.dayNumber} · {profile.plantStage}</Text><Text style={[ui.body, styles.center]}>Small steps make a greener tomorrow.</Text></View>
      <TreeArtwork variant={profile.tree.growth.points >= 3 ? "sapling" : "seedling"} height={170 + Math.min(18, profile.tree.growth.points)} />
      <View style={styles.stats}>
        <View style={styles.stat}><MaterialCommunityIcons name="fire" size={31} color={palette.green} /><View><Text style={styles.value}>{profile.streak} {profile.streak === 1 ? "day" : "days"}</Text><Text style={ui.small}>Current care streak</Text></View></View>
        <View style={[styles.stat, styles.statLast]}><MaterialCommunityIcons name="calendar-blank-outline" size={29} color={palette.green} /><View><Text style={styles.value}>{profile.tree.careDays} {profile.tree.careDays === 1 ? "day" : "days"}</Text><Text style={ui.small}>Total care days</Text></View></View>
      </View>
      <View style={styles.growth}><Text style={ui.section}>Growing with your care</Text><View style={styles.growthRow}><View accessibilityRole="progressbar" accessibilityLabel="Growth within the current tree stage" accessibilityValue={{ min: 0, max: 100, now: Math.round(profile.tree.growth.progress * 100) }} style={styles.track}><View style={[styles.fill, { width: `${Math.round(profile.tree.growth.progress * 100)}%` }]} /></View><Text style={ui.small}>{profile.tree.growth.points} growth</Text></View></View>
      <View style={styles.actions}>
        <CareRow title="Add Fertilizer" subtitle="Your habits & goals" icon="leaf" color={palette.green} done={profile.tree.todayCare.fertilizerCount > 0} onPress={() => router.push("./fertilizer")} />
        <CareRow title="Add Water" subtitle="Say thank you" icon="water" color={palette.link} done={profile.tree.todayCare.waterCount > 0} onPress={() => router.push("/(app)/thank-you")} />
        <CareRow title="Add Sunlight" subtitle="Good deeds register" icon="white-balance-sunny" color={palette.gold} done={profile.tree.todayCare.sunlightCount > 0} onPress={() => router.push("/(app)/good-deeds")} />
      </View>
    </>}
  </TreePage>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, center: { textAlign: "center" }, intro: { gap: 8 },
  pledgeSection: { gap: 9 }, pledgeInputRow: { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, borderRadius: 8, flexDirection: "row", alignItems: "center", minHeight: 54 },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 9, color: palette.text, fontFamily: fonts.bodyBold, fontSize: 24 }, webInput: { outlineWidth: 0, outlineStyle: "solid", outlineColor: "transparent" },
  unit: { flexShrink: 0, color: palette.muted, fontFamily: fonts.bodyMedium, fontSize: 16, borderLeftWidth: 1, borderLeftColor: palette.line, padding: 15 },
  summary: { gap: 13 }, summaryRow: { flexDirection: "row", alignItems: "center", gap: 12 }, summaryLast: { paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  value: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 21 },
  stats: { flexDirection: "row", borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 18, gap: 14 }, stat: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }, statLast: { borderLeftWidth: 1, borderLeftColor: palette.line, paddingLeft: 14 },
  growth: { gap: 8 }, growthRow: { flexDirection: "row", alignItems: "center", gap: 12 }, track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: palette.line, overflow: "hidden" }, fill: { height: "100%", borderRadius: 6, backgroundColor: palette.green },
  actions: { gap: 8 }, careRow: { minHeight: 72, borderWidth: 1, borderColor: palette.line, borderRadius: 9, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 }, careIcon: { height: 44, width: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }, careTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 22 },
  badge: { borderWidth: 1, borderColor: "#284C3E", backgroundColor: "#172D26", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }, badgeText: { color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 10, lineHeight: 15 }, pressed: { opacity: 0.8 },
});
