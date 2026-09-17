import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  dayKeyForTimeZone,
  goalDurationWindow,
  groupPledgeTotal,
  type GroupPledgeBasis,
} from "@rdm-b2c/api/domain/rdm";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  GroupErrorState,
  GroupPageHeader,
  GroupPill,
  GroupPrimaryButton,
  GroupScreen,
  GroupSectionLabel,
  GroupStepDots,
  GroupSurfaceCard,
} from "@/components/group-goal-ui";
import { GroupJoinFlow } from "@/components/group-join-flow";
import {
  LoadingState,
} from "@/components/rdm-ui";
import { formatDayRange } from "@/lib/date";
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

export default function NewGroupScreen() {
  const params = useLocalSearchParams<{ code?: string; mode?: string }>();
  const timeZone = getDeviceTimeZone();
  const startDayKey = dayKeyForTimeZone(new Date(), timeZone);
  const [creationId] = useState(() => Crypto.randomUUID());
  const mode: "create" | "join" = params.mode === "join" ? "join" : "create";
  const [step, setStep] = useState<CreateStep>(1);
  const [category, setCategory] = useState<GroupGoalCategory>("Friends");
  const initialActivity = groupGoalActivities.Friends[0];
  const [activityId, setActivityId] = useState(initialActivity?.id ?? "custom");
  const [name, setName] = useState(initialActivity?.title ?? "");
  const [description, setDescription] = useState(initialActivity?.description ?? "");
  const [target, setTarget] = useState(initialActivity?.target ?? "");
  const [unit, setUnit] = useState(initialActivity?.unit ?? "sessions");
  const [durationChoice, setDurationChoice] = useState<"7" | "30" | "custom">("7");
  const [customDuration, setCustomDuration] = useState("14");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [pledgeBasis, setPledgeBasis] = useState<GroupPledgeBasis>("per_day");
  const [pledgePerUnit, setPledgePerUnit] = useState("1");
  const [expectedActivities, setExpectedActivities] = useState("12");
  const [rewardStructure, setRewardStructure] = useState<GroupGoalRewardStructure>("win_as_group");
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
  const baseAfterPledge = baseBalance - (Number.isFinite(totalPledge) ? totalPledge : 0);
  const scheduleWindow = Number.isInteger(durationDays) && durationDays > 0 ? goalDurationWindow(startDayKey, durationDays) : null;

  const createGroup = useMutation(trpc.rdm.groups.create.mutationOptions({
    onSuccess: async (group) => {
      await queryClient.invalidateQueries();
      router.replace({ pathname: "/(app)/group/[id]/invite", params: { id: group.id } });
    },
    onError: (mutationError) => setError(mutationError.message),
  }));
  const createSubtitle = `STEP ${step} OF 4`;
  const hasValidPledge = Number.isInteger(totalPledge) && totalPledge > 0 && totalPledge <= baseBalance;
  const continueLabel = step === 3 ? "Continue to pledge" : "Continue";

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
      if (!selectedActivity && name.trim().length < 3) {
        setError("Choose an activity or name a custom group activity.");
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (
        name.trim().length < 3
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
          <View style={styles.intro}><Text style={styles.introTitle}>Who&apos;s joining you?</Text><Text style={styles.introBody}>Choose the circle this goal is for.</Text></View>
          <View style={styles.categoryGrid}>
            {groupGoalCategories.map((item) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: category === item.id }}
                key={item.id}
                onPress={() => selectCategory(item.id)}
                style={[styles.categoryCard, category === item.id && styles.selectedCard]}
              >
                <View style={styles.categoryIcon}><MaterialCommunityIcons color={category === item.id ? colors.plum : colors.ink} name={item.icon as never} size={22} /></View>
                <View style={styles.activityCopy}>
                  <Text style={styles.categoryTitle}>{item.id}</Text>
                  <Text style={styles.categoryDescription}>{item.description}</Text>
                </View>
                <MaterialCommunityIcons
                  name={category === item.id ? "check-circle" : "circle-outline"}
                  color={category === item.id ? colors.plum : colors.inkSoft}
                  size={22}
                />
              </Pressable>
            ))}
          </View>
        </>
      );
    }
    if (step === 2) {
      return (
        <>
          <View style={styles.categoryChipRow}>
            <View style={styles.categoryChip}>
              <MaterialCommunityIcons color={colors.plum} name={groupGoalCategories.find((item) => item.id === category)?.icon as never} size={16} />
              <Text style={styles.categoryChipLabel}>{category}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setStep(1)}><Text style={styles.changeLink}>Change</Text></Pressable>
          </View>
          <View style={styles.intro}><Text style={styles.introTitle}>What will you do together?</Text><Text style={styles.introBody}>Choose an activity for your group goal.</Text></View>
          {activities.map((activity) => (
            <GroupSurfaceCard
              key={activity.id}
              onPress={() => selectActivity(activity)}
              style={[styles.activityCard, activityId === activity.id && styles.selectedCard]}
            >
              <View style={styles.activityIcon}><MaterialCommunityIcons color={activityId === activity.id ? colors.plum : colors.ink} name={activity.icon as never} size={21} /></View>
              <View style={styles.activityCopy}>
                <Text style={styles.activityTitle}>{activity.title}</Text>
                <Text style={styles.activityDescription}>{activity.description}</Text>
              </View>
              <MaterialCommunityIcons
                name={activityId === activity.id ? "check-circle" : "circle-outline"}
                color={activityId === activity.id ? colors.plum : colors.inkSoft}
                size={20}
              />
            </GroupSurfaceCard>
          ))}
          <GroupSurfaceCard
            onPress={() => {
              setActivityId("custom");
              setName("");
              setDescription("");
              setTarget("");
              setUnit("sessions");
            }}
            style={[styles.activityCard, activityId === "custom" && styles.selectedCard]}
          >
            <View style={styles.activityIcon}><MaterialCommunityIcons color={activityId === "custom" ? colors.plum : colors.ink} name="pencil-outline" size={21} /></View>
            <View style={styles.activityCopy}>
              <Text style={styles.activityTitle}>Create a custom activity</Text>
              <Text style={styles.activityDescription}>Define something meaningful for your group.</Text>
            </View>
          </GroupSurfaceCard>
          {activityId === "custom" ? (
            <View style={styles.fieldStack}>
              <TextInput accessibilityLabel="Custom activity name" onChangeText={setName} placeholder="Activity name" placeholderTextColor={colors.inkSoft} style={styles.input} value={name} />
              <TextInput accessibilityLabel="Custom activity description" multiline onChangeText={setDescription} placeholder="What will the group do?" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.multiline]} value={description} />
            </View>
          ) : null}
        </>
      );
    }
    if (step === 3) {
      return (
        <>
          <View style={styles.intro}><Text style={styles.introTitle}>Make the goal clear.</Text><Text style={styles.introBody}>Set a shared target and timeline for your group.</Text></View>
          <GroupSectionLabel>Group goal</GroupSectionLabel>
          <TextInput accessibilityLabel="Group goal name" onChangeText={setName} placeholder="Group goal name" placeholderTextColor={colors.inkSoft} style={styles.input} value={name} />
          <View style={styles.targetRow}>
            <View style={styles.fieldStack}>
              <Text style={styles.fieldLabel}>Target (total)</Text>
              <TextInput accessibilityLabel="Group target" keyboardType="decimal-pad" onChangeText={setTarget} placeholder="500" placeholderTextColor={colors.inkSoft} style={styles.input} value={target} />
            </View>
            <View style={styles.fieldStack}>
              <Text style={styles.fieldLabel}>Unit</Text>
              <View style={styles.selectFieldWrap}>
                <TextInput accessibilityLabel="Target unit" autoCapitalize="none" onChangeText={setUnit} placeholder="km" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.selectField]} value={unit} />
                <MaterialCommunityIcons color={colors.inkSoft} name="chevron-down" size={18} style={styles.selectChevron} />
              </View>
            </View>
          </View>
          <Text style={styles.helper}>A shared target for the whole group.</Text>
          <GroupSectionLabel>Duration</GroupSectionLabel>
          <View style={styles.optionRow}>
            <GroupPill active={durationChoice === "7"} color={colors.plum} label="1 week" onPress={() => setDurationChoice("7")} />
            <GroupPill active={durationChoice === "30"} color={colors.plum} label="1 month" onPress={() => setDurationChoice("30")} />
            <GroupPill active={durationChoice === "custom"} color={colors.plum} label="Custom" onPress={() => setDurationChoice("custom")} />
          </View>
          {durationChoice === "custom" ? (
            <TextInput accessibilityLabel="Duration in days" keyboardType="number-pad" onChangeText={(value) => setCustomDuration(value.replace(/\D/g, ""))} placeholder="Days" placeholderTextColor={colors.inkSoft} style={styles.input} value={customDuration} />
          ) : null}
          {scheduleWindow ? (
            <>
              <GroupSectionLabel>Schedule</GroupSectionLabel>
              <View style={styles.scheduleRow}>
                <MaterialCommunityIcons color={colors.inkSoft} name="calendar-range" size={18} />
                <Text style={styles.scheduleText}>{formatDayRange(startDayKey, scheduleWindow.endDayKey)}</Text>
              </View>
            </>
          ) : null}
          <GroupSectionLabel>Check-in cadence</GroupSectionLabel>
          <View style={styles.optionRow}>
            <GroupPill active={cadence === "daily"} color={colors.plum} label="Daily log" onPress={() => setCadence("daily")} />
            <GroupPill active={cadence === "weekly"} color={colors.plum} label="Weekly log" onPress={() => setCadence("weekly")} />
          </View>
          <GroupSectionLabel>Description (optional)</GroupSectionLabel>
          <TextInput accessibilityLabel="Group goal description" maxLength={200} multiline onChangeText={setDescription} placeholder="Describe the shared activity" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.multiline]} value={description} />
          <Text style={styles.charCount}>{description.length}/200</Text>
        </>
      );
    }
    return (
      <>
        <GroupSectionLabel>Pledge basis</GroupSectionLabel>
        <View style={styles.optionRow}>
          <GroupPill active={pledgeBasis === "per_day"} color={colors.plum} label="Daily" onPress={() => setPledgeBasis("per_day")} />
          <GroupPill active={pledgeBasis === "per_activity"} color={colors.plum} label="Per activity" onPress={() => setPledgeBasis("per_activity")} />
        </View>
        <GroupSurfaceCard style={styles.pledgeCard}>
          <Text style={styles.pledgeEyebrow}>YOUR STAKE, AS GROUP CREATOR</Text>
          <Text style={styles.pledgeFieldLabel}>RDM {pledgeBasis === "per_day" ? "per day" : "per activity"}</Text>
          <View style={styles.counterRow}>
            <Pressable accessibilityLabel="Decrease pledge" accessibilityRole="button" style={styles.counterButton} onPress={() => setPledgePerUnit(String(Math.max(1, pledgeUnit - 1)))}><Text style={styles.counterButtonText}>−</Text></Pressable>
            <TextInput accessibilityLabel="RDM pledge per unit" keyboardType="number-pad" onChangeText={(value) => setPledgePerUnit(value.replace(/\D/g, ""))} style={styles.pledgeValue} value={pledgePerUnit} />
            <Pressable accessibilityLabel="Increase pledge" accessibilityRole="button" style={styles.counterButton} onPress={() => setPledgePerUnit(String(pledgeUnit + 1))}><Text style={styles.counterButtonText}>+</Text></Pressable>
          </View>
          <Text style={styles.pledgeDescription}>Minimum 1 RDM {pledgeBasis === "per_day" ? "per day" : "per activity"}</Text>
          {pledgeBasis === "per_activity" ? (
            <TextInput accessibilityLabel="Expected activities" keyboardType="number-pad" onChangeText={(value) => setExpectedActivities(value.replace(/\D/g, ""))} placeholder="Expected activities" placeholderTextColor={colors.inkSoft} style={styles.input} value={expectedActivities} />
          ) : null}
          <View style={styles.totalBreakdownRow}>
            <MaterialCommunityIcons color={colors.inkSoft} name="calendar-month-outline" size={20} />
            <View style={styles.totalBreakdownCopy}>
              <Text style={styles.totalBreakdownHeadline}>
                {pledgeBasis === "per_day" ? `${durationDays} days × ${Number.isFinite(pledgeUnit) ? pledgeUnit : 0} RDM` : `${Number.isFinite(plannedActivities) ? plannedActivities : 0} activities × ${Number.isFinite(pledgeUnit) ? pledgeUnit : 0} RDM`} = {Number.isFinite(totalPledge) ? formatRdm(totalPledge) : 0} RDM
              </Text>
              <Text style={styles.totalBreakdownHint}>From your Base Purse</Text>
            </View>
          </View>
          <View style={styles.balanceBreakdown}>
            <View style={styles.balanceBreakdownRow}><Text style={styles.balanceBreakdownLabel}>Base available</Text><Text style={styles.balanceBreakdownValue}>{formatRdm(baseBalance)} RDM</Text></View>
            <View style={styles.balanceBreakdownRow}><Text style={styles.balanceBreakdownLabel}>After this group</Text><Text style={[styles.balanceBreakdownValue, baseAfterPledge < 0 && styles.balanceBreakdownValueLow]}>{formatRdm(Math.max(0, baseAfterPledge))} RDM</Text></View>
          </View>
        </GroupSurfaceCard>
        <Text style={styles.helper}>Every member pledges at least this total from their own Base Purse when they join. It stays pooled until awards are announced; if the goal expires, each backed pledge returns to Base.</Text>
        <GroupSectionLabel>Reward structure</GroupSectionLabel>
        {groupRewardStructures.map((option) => (
          <GroupSurfaceCard key={option.id} onPress={() => setRewardStructure(option.id)} style={[styles.rewardCard, rewardStructure === option.id && styles.selectedCard]}>
            <MaterialCommunityIcons name={rewardStructure === option.id ? "radiobox-marked" : "radiobox-blank"} color={rewardStructure === option.id ? colors.gold : colors.inkSoft} size={20} />
            <View style={styles.activityCopy}><Text style={styles.activityTitle}>{option.title}</Text><Text style={styles.activityDescription}>{option.description}</Text></View>
          </GroupSurfaceCard>
        ))}
      </>
    );
  }

  if (mode === "join") {
    return <GroupJoinFlow initialCode={params.code} />;
  }

  if (wallet.isLoading) return <LoadingState label="Checking your Base Purse…" />;
  if (wallet.error || !wallet.data) {
    return <GroupErrorState message={wallet.error?.message ?? "Your wallet is unavailable."} onBack={() => router.dismissTo("/(app)/(tabs)/groups")} onRetry={() => void wallet.refetch()} />;
  }

  return (
    <GroupScreen>
      <GroupPageHeader
        back
        onBack={step > 1
          ? () => setStep((step - 1) as CreateStep)
          : () => router.dismissTo("/(app)/(tabs)/groups")}
        title="Create group"
        subtitle={createSubtitle}
      />
      <GroupStepDots current={step} total={4} />
      {renderCreateStep()}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <GroupPrimaryButton
        color={colors.growth}
        disabled={step === 4 && !hasValidPledge}
        label={step === 4 ? `Lock ${Number.isFinite(totalPledge) ? formatRdm(totalPledge) : 0} RDM & create group` : continueLabel}
        loading={createGroup.isPending}
        onPress={step === 4 ? submitCreate : validateAndContinue}
      />
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: "row", gap: 8 },
  intro: { gap: 3, marginTop: 2 },
  introTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 20, letterSpacing: -0.3, lineHeight: 25 },
  introBody: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  categoryGrid: { gap: 8 },
  categoryCard: { alignItems: "center", backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: radii.medium, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 66, padding: 10 },
  selectedCard: { borderColor: colors.plum, backgroundColor: "rgba(179, 154, 232, 0.09)" },
  categoryIcon: { alignItems: "center", backgroundColor: colors.background, borderRadius: 17, height: 34, justifyContent: "center", width: 34 },
  categoryTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14 },
  categoryDescription: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, marginTop: 1 },
  activityCard: { alignItems: "center", backgroundColor: colors.panelRaised, flexDirection: "row", gap: 10 },
  activityIcon: { alignItems: "center", backgroundColor: colors.background, borderRadius: 10, height: 36, justifyContent: "center", width: 36 },
  activityCopy: { flex: 1 },
  activityTitle: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  activityDescription: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
  fieldStack: { flex: 1, gap: 6 },
  fieldLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 11 },
  selectFieldWrap: { justifyContent: "center" },
  selectField: { paddingRight: 34 },
  selectChevron: { position: "absolute", right: 14 },
  input: { minHeight: 48, borderRadius: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelRaised, color: colors.ink, fontFamily: fonts.body, fontSize: 13, paddingHorizontal: 12 },
  multiline: { minHeight: 78, paddingTop: 12, textAlignVertical: "top" },
  charCount: { alignSelf: "flex-end", color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9 },
  targetRow: { flexDirection: "row", gap: 10 },
  scheduleRow: { alignItems: "center", backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: radii.medium, borderWidth: 1, flexDirection: "row", gap: 9, minHeight: 48, paddingHorizontal: 12 },
  scheduleText: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChipRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  categoryChip: { alignItems: "center", backgroundColor: colors.plumTint, borderRadius: radii.pill, flexDirection: "row", gap: 6, paddingHorizontal: 11, paddingVertical: 6 },
  categoryChipLabel: { color: colors.plum, fontFamily: fonts.bodyMedium, fontSize: 12 },
  changeLink: { color: colors.ai, fontFamily: fonts.bodyMedium, fontSize: 12 },
  pledgeCard: { alignItems: "center", gap: 12 },
  pledgeEyebrow: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8 },
  pledgeFieldLabel: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 13 },
  counterRow: { alignItems: "center", flexDirection: "row", gap: 18 },
  counterButton: { alignItems: "center", backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  counterButtonText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 22 },
  pledgeValue: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 30, maxWidth: 72, minWidth: 72, textAlign: "center", width: 72 },
  pledgeDescription: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  totalBreakdownRow: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 12, paddingTop: 12, width: "100%" },
  totalBreakdownCopy: { flex: 1 },
  totalBreakdownHeadline: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  totalBreakdownHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10.5, marginTop: 2 },
  balanceBreakdown: { gap: 6, width: "100%" },
  balanceBreakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  balanceBreakdownLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11 },
  balanceBreakdownValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 12 },
  balanceBreakdownValueLow: { color: colors.coral },
  helper: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  rewardCard: { alignItems: "center", flexDirection: "row", gap: 10 },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
});
