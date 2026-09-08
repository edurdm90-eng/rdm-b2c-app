import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  dayKeyForTimeZone,
  groupPledgeTotal,
  type GroupPledgeBasis,
} from "@rdm-b2c/api/domain/rdm";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { GroupAiNote, GroupErrorState, GroupStepDots } from "@/components/group-goal-ui";
import { GroupJoinFlow } from "@/components/group-join-flow";
import {
  AppScreen,
  LoadingState,
  PageHeader,
  Pill,
  PrimaryButton,
  SectionLabel,
  SurfaceCard,
} from "@/components/rdm-ui";
import {
  groupGoalActivities,
  groupGoalCategories,
  groupRewardStructures,
  type GroupGoalCategory,
  type GroupGoalRewardStructure,
} from "@/lib/group-goals";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { getDeviceTimeZone } from "@/lib/time-zone";
import { queryClient, trpc } from "@/utils/trpc";

type CreateStep = 1 | 2 | 3 | 4;

const stepTitles: Record<CreateStep, string> = {
  1: "New Group",
  2: "Pick an activity",
  3: "Set the goal",
  4: "Pledge to start",
};

export default function NewGroupScreen() {
  const params = useLocalSearchParams<{ code?: string; mode?: string }>();
  const timeZone = getDeviceTimeZone();
  const startDayKey = dayKeyForTimeZone(new Date(), timeZone);
  const [creationId] = useState(() => Crypto.randomUUID());
  const [mode, setMode] = useState<"create" | "join">(params.mode === "join" ? "join" : "create");
  const [step, setStep] = useState<CreateStep>(1);
  const [category, setCategory] = useState<GroupGoalCategory>("Family");
  const initialActivity = groupGoalActivities.Family[0];
  const [activityId, setActivityId] = useState(initialActivity?.id ?? "custom");
  const [name, setName] = useState(initialActivity?.title ?? "");
  const [description, setDescription] = useState(initialActivity?.description ?? "");
  const [target, setTarget] = useState(initialActivity?.target ?? "");
  const [unit, setUnit] = useState(initialActivity?.unit ?? "sessions");
  const [durationChoice, setDurationChoice] = useState<"7" | "30" | "custom">("30");
  const [customDuration, setCustomDuration] = useState("14");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [pledgeBasis, setPledgeBasis] = useState<GroupPledgeBasis>("per_day");
  const [pledgePerUnit, setPledgePerUnit] = useState("5");
  const [expectedActivities, setExpectedActivities] = useState("12");
  const [rewardStructure, setRewardStructure] = useState<GroupGoalRewardStructure>("top_3");
  const [error, setError] = useState<string | null>(null);

  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions());
  const activities = groupGoalActivities[category];
  const selectedActivity = activities.find((activity) => activity.id === activityId);
  const durationDays = durationChoice === "custom" ? Number(customDuration) : Number(durationChoice);
  const pledgeUnit = Number(pledgePerUnit);
  const plannedActivities = Number(expectedActivities);
  const totalPledge = groupPledgeTotal({
    basis: pledgeBasis,
    durationDays,
    expectedActivities: plannedActivities,
    pledgePerUnit: pledgeUnit,
  }) ?? 0;
  const baseBalance = wallet.data?.wallet.base ?? 0;

  const createGroup = useMutation(trpc.rdm.groups.create.mutationOptions({
    onSuccess: async (group) => {
      await queryClient.invalidateQueries();
      router.replace({ pathname: "/(app)/group/[id]/invite", params: { id: group.id } });
    },
    onError: (mutationError) => setError(mutationError.message),
  }));
  const createSubtitle = `${category.toUpperCase()} · STEP ${step} OF 5`;
  const hasValidPledge = Number.isInteger(totalPledge) && totalPledge > 0 && totalPledge <= baseBalance;

  function selectActivity(activity: (typeof activities)[number]) {
    setActivityId(activity.id);
    setName(activity.title);
    setDescription(activity.description);
    setTarget(activity.target);
    setUnit(activity.unit);
  }

  function selectCategory(nextCategory: GroupGoalCategory) {
    const nextActivity = groupGoalActivities[nextCategory][0];
    setCategory(nextCategory);
    if (nextActivity) selectActivity(nextActivity);
  }

  function validateAndContinue() {
    setError(null);
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!selectedActivity && (name.trim().length < 3 || description.trim().length < 3)) {
        setError("Choose an activity or describe a custom group activity.");
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (
        name.trim().length < 3
        || description.trim().length < 3
        || !Number.isFinite(Number(target))
        || Number(target) <= 0
        || unit.trim().length < 1
        || !Number.isInteger(durationDays)
        || durationDays < 1
        || durationDays > 365
      ) {
        setError("Add a clear name, target, unit, and duration between 1 and 365 days.");
        return;
      }
      if (pledgeBasis === "per_activity") {
        setExpectedActivities(String(cadence === "daily" ? durationDays : Math.ceil(durationDays / 7)));
      }
      setStep(4);
    }
  }

  function submitCreate() {
    if (!hasValidPledge) {
      setError(totalPledge > baseBalance
        ? `You need ${formatRdm(totalPledge - baseBalance)} more RDM in your Base Purse.`
        : "Enter a valid whole-number pledge.");
      return;
    }
    setError(null);
    createGroup.mutate({
      creationId,
      category,
      activityId: selectedActivity?.id ?? "custom",
      name: name.trim(),
      description: description.trim(),
      target: Number(target),
      unit: unit.trim(),
      durationDays,
      startDayKey,
      timeZone,
      cadence,
      pledgeBasis,
      pledgePerUnit: pledgeUnit,
      expectedActivities: plannedActivities,
      rewardStructure,
    });
  }

  function renderCreateStep() {
    if (step === 1) {
      return (
        <>
          <SectionLabel>Who&apos;s this group for?</SectionLabel>
          <View style={styles.categoryGrid}>
            {groupGoalCategories.map((item) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: category === item.id }}
                key={item.id}
                onPress={() => selectCategory(item.id)}
                style={[styles.categoryCard, category === item.id && styles.selectedCard]}
              >
                <Text style={styles.categoryIcon}>{item.icon}</Text>
                <Text style={styles.categoryTitle}>{item.id}</Text>
                <Text style={styles.categoryDescription}>{item.description}</Text>
              </Pressable>
            ))}
          </View>
          <GroupAiNote label="Not sure? Let AI suggest one" />
        </>
      );
    }
    if (step === 2) {
      return (
        <>
          <SectionLabel>{category} activities</SectionLabel>
          {activities.map((activity) => (
            <SurfaceCard
              key={activity.id}
              onPress={() => selectActivity(activity)}
              style={[styles.activityCard, activityId === activity.id && styles.selectedCard]}
            >
              <Text style={styles.activityIcon}>{activity.icon}</Text>
              <View style={styles.activityCopy}>
                <Text style={styles.activityTitle}>{activity.title}</Text>
                <Text style={styles.activityDescription}>{activity.description}</Text>
              </View>
              <MaterialCommunityIcons
                name={activityId === activity.id ? "radiobox-marked" : "radiobox-blank"}
                color={activityId === activity.id ? colors.plum : colors.inkSoft}
                size={20}
              />
            </SurfaceCard>
          ))}
          <SurfaceCard
            onPress={() => {
              setActivityId("custom");
              setName("");
              setDescription("");
              setTarget("");
              setUnit("sessions");
            }}
            style={[styles.activityCard, activityId === "custom" && styles.selectedCard]}
          >
            <Text style={styles.activityIcon}>✏️</Text>
            <View style={styles.activityCopy}>
              <Text style={styles.activityTitle}>Create a custom activity</Text>
              <Text style={styles.activityDescription}>Define something meaningful for your group.</Text>
            </View>
          </SurfaceCard>
          {activityId === "custom" ? (
            <View style={styles.fieldStack}>
              <TextInput accessibilityLabel="Custom activity name" onChangeText={setName} placeholder="Activity name" placeholderTextColor={colors.inkSoft} style={styles.input} value={name} />
              <TextInput accessibilityLabel="Custom activity description" multiline onChangeText={setDescription} placeholder="What will the group do?" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.multiline]} value={description} />
            </View>
          ) : null}
          <GroupAiNote label="Use AI to write the activity for us" />
        </>
      );
    }
    if (step === 3) {
      return (
        <>
          <SectionLabel>Group goal</SectionLabel>
          <TextInput accessibilityLabel="Group goal name" onChangeText={setName} placeholder="Group goal name" placeholderTextColor={colors.inkSoft} style={styles.input} value={name} />
          <TextInput accessibilityLabel="Group goal description" multiline onChangeText={setDescription} placeholder="Describe the shared activity" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.multiline]} value={description} />
          <View style={styles.targetRow}>
            <TextInput accessibilityLabel="Group target" keyboardType="decimal-pad" onChangeText={setTarget} placeholder="500" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.targetInput]} value={target} />
            <TextInput accessibilityLabel="Target unit" autoCapitalize="none" onChangeText={setUnit} placeholder="km" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.unitInput]} value={unit} />
          </View>
          <SectionLabel>Duration</SectionLabel>
          <View style={styles.optionRow}>
            <Pill active={durationChoice === "7"} color={colors.plum} label="1 week" onPress={() => setDurationChoice("7")} />
            <Pill active={durationChoice === "30"} color={colors.plum} label="1 month" onPress={() => setDurationChoice("30")} />
            <Pill active={durationChoice === "custom"} color={colors.plum} label="Custom" onPress={() => setDurationChoice("custom")} />
          </View>
          {durationChoice === "custom" ? (
            <TextInput accessibilityLabel="Duration in days" keyboardType="number-pad" onChangeText={(value) => setCustomDuration(value.replace(/\D/g, ""))} placeholder="Days" placeholderTextColor={colors.inkSoft} style={styles.input} value={customDuration} />
          ) : null}
          <SectionLabel>Check-in cadence</SectionLabel>
          <View style={styles.optionRow}>
            <Pill active={cadence === "daily"} color={colors.plum} label="Daily log" onPress={() => setCadence("daily")} />
            <Pill active={cadence === "weekly"} color={colors.plum} label="Weekly log" onPress={() => setCadence("weekly")} />
          </View>
          <GroupAiNote label="Use AI to suggest a fair target" />
        </>
      );
    }
    return (
      <>
        <SectionLabel>Pledge basis</SectionLabel>
        <View style={styles.optionRow}>
          <Pill active={pledgeBasis === "per_day"} color={colors.plum} label="Per day" onPress={() => setPledgeBasis("per_day")} />
          <Pill active={pledgeBasis === "per_activity"} color={colors.plum} label="Per activity" onPress={() => setPledgeBasis("per_activity")} />
        </View>
        <SurfaceCard style={styles.pledgeCard}>
          <Text style={styles.pledgeEyebrow}>YOUR STAKE, AS GROUP CREATOR</Text>
          <View style={styles.counterRow}>
            <Pressable accessibilityLabel="Decrease pledge" accessibilityRole="button" style={styles.counterButton} onPress={() => setPledgePerUnit(String(Math.max(1, pledgeUnit - 1)))}><Text style={styles.counterButtonText}>−</Text></Pressable>
            <TextInput accessibilityLabel="RDM pledge per unit" keyboardType="number-pad" onChangeText={(value) => setPledgePerUnit(value.replace(/\D/g, ""))} style={styles.pledgeValue} value={pledgePerUnit} />
            <Pressable accessibilityLabel="Increase pledge" accessibilityRole="button" style={styles.counterButton} onPress={() => setPledgePerUnit(String(pledgeUnit + 1))}><Text style={styles.counterButtonText}>+</Text></Pressable>
          </View>
          <Text style={styles.pledgeDescription}>RDM {pledgeBasis === "per_day" ? `per day · ${durationDays}-day goal` : "per logged activity"}</Text>
          {pledgeBasis === "per_activity" ? (
            <TextInput accessibilityLabel="Expected activities" keyboardType="number-pad" onChangeText={(value) => setExpectedActivities(value.replace(/\D/g, ""))} placeholder="Expected activities" placeholderTextColor={colors.inkSoft} style={styles.input} value={expectedActivities} />
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total pledge, deducted now</Text>
            <Text style={styles.totalValue}>{Number.isFinite(totalPledge) ? formatRdm(totalPledge) : 0} RDM</Text>
          </View>
        </SurfaceCard>
        <View style={[styles.balanceCard, hasValidPledge ? styles.balanceGood : styles.balanceLow]}>
          <View><Text style={styles.balanceLabel}>Your Base Purse</Text><Text style={styles.balanceValue}>{formatRdm(baseBalance)} RDM</Text></View>
          <Text style={[styles.balanceState, !hasValidPledge && styles.balanceStateLow]}>{hasValidPledge ? "✓ Sufficient" : "Needs RDM"}</Text>
        </View>
        <Text style={styles.helper}>Every member pledges at least this total from their own Base Purse when they join. It stays pooled until awards are announced; if the goal expires, each backed pledge returns to Base.</Text>
        <SectionLabel>Reward structure</SectionLabel>
        {groupRewardStructures.map((option) => (
          <SurfaceCard key={option.id} onPress={() => setRewardStructure(option.id)} style={[styles.rewardCard, rewardStructure === option.id && styles.selectedCard]}>
            <MaterialCommunityIcons name={rewardStructure === option.id ? "radiobox-marked" : "radiobox-blank"} color={rewardStructure === option.id ? colors.gold : colors.inkSoft} size={20} />
            <View style={styles.activityCopy}><Text style={styles.activityTitle}>{option.title}</Text><Text style={styles.activityDescription}>{option.description}</Text></View>
          </SurfaceCard>
        ))}
        <GroupAiNote label="Use AI to recommend a stake" />
      </>
    );
  }

  if (mode === "join") {
    return <GroupJoinFlow initialCode={params.code} onCreate={() => setMode("create")} />;
  }

  if (wallet.isLoading) return <LoadingState label="Checking your Base Purse…" />;
  if (wallet.error || !wallet.data) {
    return <GroupErrorState message={wallet.error?.message ?? "Your wallet is unavailable."} onBack={() => router.dismissTo("/(app)/(tabs)/groups")} onRetry={() => void wallet.refetch()} />;
  }

  return (
    <AppScreen>
      <PageHeader
        back
        onBack={step > 1
          ? () => setStep((step - 1) as CreateStep)
          : () => router.dismissTo("/(app)/(tabs)/groups")}
        title={stepTitles[step]}
        subtitle={createSubtitle}
      />
      <View style={styles.modeRow}>
        <Pill active color={colors.plum} label="Create" />
        <Pill color={colors.plum} label="Join with code" onPress={() => { setMode("join"); setError(null); }} />
      </View>
      <GroupStepDots current={step} />
      {renderCreateStep()}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        color={step === 4 ? colors.gold : colors.plum}
        disabled={step === 4 && !hasValidPledge}
        label={step === 4 ? `Lock ${Number.isFinite(totalPledge) ? formatRdm(totalPledge) : 0} RDM & create` : "Continue"}
        loading={createGroup.isPending}
        onPress={step === 4 ? submitCreate : validateAndContinue}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: "row", gap: 8 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  categoryCard: { width: "48%", minHeight: 118, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 14 },
  selectedCard: { borderColor: colors.plum, backgroundColor: colors.plumTint },
  categoryIcon: { fontSize: 25, marginBottom: 10 },
  categoryTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17 },
  categoryDescription: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, marginTop: 3 },
  activityCard: { alignItems: "center", flexDirection: "row", gap: 12 },
  activityIcon: { fontSize: 25 },
  activityCopy: { flex: 1 },
  activityTitle: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 13 },
  activityDescription: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  fieldStack: { gap: 10 },
  input: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 14 },
  multiline: { minHeight: 88, paddingTop: 14, textAlignVertical: "top" },
  targetRow: { flexDirection: "row", gap: 10 },
  targetInput: { flex: 1 },
  unitInput: { flex: 1 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pledgeCard: { alignItems: "center", gap: 12 },
  pledgeEyebrow: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8 },
  counterRow: { alignItems: "center", flexDirection: "row", gap: 18 },
  counterButton: { alignItems: "center", backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  counterButtonText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 22 },
  pledgeValue: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 34, minWidth: 80, textAlign: "center" },
  pledgeDescription: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  totalRow: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: 12, width: "100%" },
  totalLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  totalValue: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 14 },
  balanceCard: { alignItems: "center", borderRadius: radii.medium, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 14 },
  balanceGood: { backgroundColor: colors.growthTint, borderColor: "rgba(63,203,139,0.35)" },
  balanceLow: { backgroundColor: colors.coralTint, borderColor: "rgba(226,112,90,0.35)" },
  balanceLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10 },
  balanceValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 16, marginTop: 2 },
  balanceState: { color: colors.growth, fontFamily: fonts.bodyBold, fontSize: 11 },
  balanceStateLow: { color: colors.coral },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  rewardCard: { alignItems: "center", flexDirection: "row", gap: 10 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
});
