import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { MEDAA_DEFAULT_COMMITMENT_DAYS, MEDAA_MAX_COMMITMENT_DAYS, isMedaaShortCommitment, medaaPrepareSchema, type MedaaConversation, type MedaaDraft, type MedaaDraftContent } from "@rdm-b2c/api/domain/medaa";
import { dayKeyForTimeZone, goalCategories, goalDurationWindow } from "@rdm-b2c/api/domain/rdm";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusedButton, focusedColors as palette } from "@/components/focused-ui";
import { HabitDateField } from "@/components/habit-date-field";
import { fonts, formatRdm } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const categoryIcons: Record<MedaaDraftContent["category"], IconName> = {
  Focus: "book-open-variant-outline", Health: "leaf", Money: "wallet-outline",
  Family: "account-group-outline", Sustainability: "sprout-outline",
};

function dateLabel(dayKey: string) {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function commitmentDays(start: string, end: string) {
  const days = (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000;
  if (!Number.isInteger(days) || days < 1 || days > 3650) return NaN;
  return goalDurationWindow(start, days)?.endDayKey === end ? days : NaN;
}

function OutlineButton({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.outlineButton, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={styles.outlineLabel}>{label}</Text>
  </Pressable>;
}

function TextButton({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.textButton, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={styles.link}>{label}</Text>
  </Pressable>;
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return <View style={styles.infoNote}><MaterialCommunityIcons name="information-outline" size={21} color={palette.muted} /><Text style={styles.infoText}>{children}</Text></View>;
}

export function MedaaDraftCard({ conversationId, timeZone, draft, disabled, initialEditing = false, aiDisabled = false, onConversation, onRefine, onClose, onMore, onFinish, onBusyChange }: {
  conversationId: string;
  timeZone: string;
  draft: MedaaDraft;
  disabled: boolean;
  initialEditing?: boolean;
  aiDisabled?: boolean;
  onConversation: (conversation: MedaaConversation) => void;
  onRefine?: (direction: "simpler" | "more-specific" | "less-time", dailyPledgeRdm: number) => void;
  onClose?: () => void;
  onMore?: () => void;
  onFinish?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const today = dayKeyForTimeZone(new Date(), timeZone);
  const initialDuration = isMedaaShortCommitment(draft.content) ? draft.content.durationDays ?? MEDAA_DEFAULT_COMMITMENT_DAYS : MEDAA_DEFAULT_COMMITMENT_DAYS;
  const initialEnd = draft.review?.endDayKey ?? goalDurationWindow(today, initialDuration)?.endDayKey ?? "";
  const initialRate = draft.review?.pledgeAmount ?? draft.dailyPledgeRdm ?? 1;
  const [editing, setEditing] = useState(draft.status === "draft" && (initialEditing || !draft.review));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [approachOpen, setApproachOpen] = useState(false);
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [content, setContent] = useState<MedaaDraftContent>(draft.content);
  const [startDayKey, setStartDayKey] = useState(draft.review?.startDayKey ?? today);
  const [endDayKey, setEndDayKey] = useState(initialEnd);
  const [pledge, setPledge] = useState(String(initialRate));
  const [error, setError] = useState<string | null>(null);
  const [confirmElapsedDates, setConfirmElapsedDates] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const scroll = useRef<ScrollView>(null);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const isHabit = draft.content.type === "habit";
  const isCreated = draft.status === "created";
  const setting = draft.status === "setting";
  const archivedHabit = isHabit && !isCreated && !setting;
  const needsDailyReview = !isHabit && draft.status === "draft" && Boolean(draft.review && draft.review.fundingMode !== "daily");
  const duration = commitmentDays(startDayKey, endDayKey);
  const needsShorterCommitment = draft.status === "draft" && ((draft.content.durationDays ?? 0) > MEDAA_MAX_COMMITMENT_DAYS
    || Boolean(draft.review && commitmentDays(draft.review.startDayKey, draft.review.endDayKey) > MEDAA_MAX_COMMITMENT_DAYS));
  const review = editing ? null : draft.review;
  const reviewedToday = dayKeyForTimeZone(new Date(), draft.review?.timeZone ?? timeZone);
  const hasElapsedDates = setting && Boolean(draft.review && draft.review.startDayKey < reviewedToday);
  const staleDates = !setting && !isCreated && Boolean(review && review.startDayKey < reviewedToday);
  const numericDailyPledge = Number(pledge);
  const validDailyPledge = Number.isInteger(numericDailyPledge) && numericDailyPledge >= 1 && numericDailyPledge <= 100_000;
  const validDates = Number.isInteger(duration) && duration >= 1 && duration <= MEDAA_MAX_COMMITMENT_DAYS && startDayKey >= today;
  const budget = useQuery(trpc.medaa.budget.queryOptions({ conversationId, excludeDraftId: draft.id,
    dailyPledgeRdm: validDailyPledge ? numericDailyPledge : 1 }, { enabled: !isCreated && !archivedHabit }));
  const createdWallet = useQuery({ ...trpc.rdm.wallet.summary.queryOptions(), enabled: isCreated });
  const projectedTotal = validDailyPledge && Number.isInteger(duration) && duration > 0 ? numericDailyPledge * duration : null;
  const requiredTotal = review?.totalPledge ?? projectedTotal;
  const availableBase = isCreated ? createdWallet.data?.wallet.base : budget.data?.baseRdm;
  const remainingForGoal = budget.data?.remainingBaseRdm;
  const otherGoalsPledge = budget.data?.selectedPledgeRdm ?? 0;
  const canAfford = requiredTotal !== null && remainingForGoal !== undefined && requiredTotal <= remainingForGoal;
  const genuinelyInsufficient = !isCreated && !setting && !archivedHabit && !budget.error
    && requiredTotal !== null && remainingForGoal !== undefined && requiredTotal > remainingForGoal;
  const lowBalance = genuinelyInsufficient && !budgetEditing;
  const dailyReview = review?.fundingMode === "daily";
  const prepare = useMutation(trpc.medaa.prepare.mutationOptions());
  const set = useMutation(trpc.medaa.set.mutationOptions());
  const busy = prepare.isPending || set.isPending;
  const locked = disabled || busy || setting;
  const hasUnsavedChanges = JSON.stringify(content) !== JSON.stringify(draft.content)
    || startDayKey !== (draft.review?.startDayKey ?? today) || endDayKey !== initialEnd;
  const canRefine = Boolean(onRefine && !locked && !aiDisabled && !hasUnsavedChanges && validDailyPledge && budget.data && budget.data.maxAffordableDays > 0);

  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      busyCallback.current?.(false);
    };
  }, []);

  function updateContent(update: Partial<MedaaDraftContent>) {
    setContent((current) => ({ ...current, ...update }));
    setBudgetEditing(true);
    setError(null);
  }

  function updateStart(value: string) {
    setStartDayKey(value);
    const days = Number.isInteger(duration) && duration >= 1 && duration <= MEDAA_MAX_COMMITMENT_DAYS ? duration : MEDAA_DEFAULT_COMMITMENT_DAYS;
    const window = goalDurationWindow(value, days);
    if (window) setEndDayKey(window.endDayKey);
    setBudgetEditing(true);
    setError(null);
  }

  function changePledge(value: string) {
    setPledge(value);
    setBudgetEditing(true);
    setError(null);
  }

  function startEditing() {
    if (locked || archivedHabit || isCreated) return;
    setEditing(true);
    setBudgetEditing(true);
    setError(null);
    if (needsDailyReview) setPledge(String(draft.dailyPledgeRdm ?? 1));
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function cancelEdits() {
    setContent(draft.content);
    setStartDayKey(draft.review?.startDayKey ?? today);
    setEndDayKey(initialEnd);
    setPledge(String(initialRate));
    setError(null);
    setEditing(!draft.review);
    setDetailsOpen(false);
    setBudgetEditing(false);
    if (!draft.review) onClose?.();
  }

  async function reloadConversation() {
    const latest = await queryClient.fetchQuery(trpc.medaa.conversation.queryOptions({ id: conversationId })).catch(() => null);
    if (latest) onConversation(latest);
  }

  async function prepareReview() {
    if (submitting.current || locked || archivedHabit || isCreated) return;
    setError(null);
    if (!validDates) {
      setError(`Choose valid dates for 1–${MEDAA_MAX_COMMITMENT_DAYS} days, starting today or later. The end date is not included.`);
      return;
    }
    if (!validDailyPledge || projectedTotal === null || projectedTotal > 100_000) {
      setError("Use at least 1 RDM per day and a total commitment of 100,000 RDM or less.");
      return;
    }
    const parsed = medaaPrepareSchema.safeParse({ conversationId, draftId: draft.id, expectedVersion: draft.version,
      content: { ...content, durationDays: duration }, startDayKey, endDayKey, timeZone, pledgeAmount: numericDailyPledge });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Please complete the goal details."); return; }
    submitting.current = true;
    busyCallback.current?.(true);
    try {
      const result = await prepare.mutateAsync(parsed.data);
      onConversation(result.conversation);
      setEditing(false);
      setBudgetEditing(false);
      await queryClient.invalidateQueries({ queryKey: trpc.rdm.wallet.summary.queryKey() });
      await budget.refetch();
      scroll.current?.scrollTo({ y: 0, animated: false });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We couldn’t prepare this commitment. Your edits are still here.");
    } finally {
      submitting.current = false;
      // Publishing a new draft can replace this keyed instance before its
      // refreshes finish. Only the mounted owner may release the parent lock.
      if (mounted.current) busyCallback.current?.(false);
    }
  }

  async function setCommitment() {
    if (submitting.current || disabled || busy || editing || !draft.review || isCreated || needsShorterCommitment || needsDailyReview || archivedHabit
      || (hasElapsedDates && !confirmElapsedDates) || staleDates || (!setting && (!canAfford || budget.isPending || Boolean(budget.error)))) return;
    submitting.current = true;
    busyCallback.current?.(true);
    setError(null);
    try {
      const result = await set.mutateAsync({ conversationId, draftId: draft.id, reviewId: draft.review.id, confirmElapsedDates });
      onConversation(result);
      await queryClient.invalidateQueries({ queryKey: trpc.rdm.pathKey() });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Creation could not be confirmed. Retry the same reviewed commitment.");
      await reloadConversation();
      await budget.refetch();
    } finally {
      submitting.current = false;
      if (mounted.current) busyCallback.current?.(false);
    }
  }

  function openCreated() {
    if (!draft.entityId) return;
    router.push(isHabit ? { pathname: "/(app)/habit/[id]", params: { id: draft.entityId } }
      : { pathname: "/(app)/goal/[id]", params: { id: draft.entityId } });
  }

  function refineToBudget() {
    if (!canRefine || submitting.current) return;
    setError(null);
    onRefine?.("less-time", numericDailyPledge);
  }

  const reviewEditBlocked = locked || archivedHabit || isCreated;
  const displayContent = editing ? content : draft.content;
  const savedReview = draft.review;

  function goalSummary(compact = false, saved = false) {
    const source = saved ? draft.content : displayContent;
    return <View style={styles.goalSummary}>
      <MaterialCommunityIcons name={categoryIcons[source.category]} size={compact ? 28 : 34} color={compact ? palette.link : palette.text} />
      <View style={styles.goalCopy}>
        <View style={styles.savedHeading}>
          <Text style={[styles.goalTitle, compact && styles.compactTitle]}>{source.title}</Text>
          {isCreated ? <View style={styles.createdBadge}><Text style={styles.createdBadgeText}>Created</Text></View> : null}
        </View>
        {!compact ? <Text style={styles.body}>{source.target}</Text> : null}
        {compact && savedReview ? <Text style={styles.caption}>{dateLabel(savedReview.startDayKey)} – {dateLabel(savedReview.endDayKey)} (end excluded){savedReview.fundingMode === "daily" || isHabit ? ` · ${savedReview.scheduledDays} days · ${formatRdm(savedReview.pledgeAmount)} RDM/day` : " · Original whole-goal pledge"}</Text> : null}
        {compact && !savedReview ? <Text style={styles.caption}>{draft.content.durationDays ? `${draft.content.durationDays} days · ` : ""}{formatRdm(draft.dailyPledgeRdm ?? 1)} RDM/day</Text> : null}
      </View>
    </View>;
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={[styles.content, isCreated && styles.createdContent]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {isCreated ? (
          <>
            <View style={styles.successIntro}>
              <View style={styles.successCircle}><MaterialCommunityIcons name="check" size={48} color={palette.link} /></View>
              <Text accessibilityRole="header" style={styles.successTitle}>Your {isHabit ? "habit" : "goal"} is ready.</Text>
              <Text style={styles.subtitle}>A small plan for your bigger picture.</Text>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Saved {isHabit ? "habit" : "goal"}</Text>
              <View style={styles.card}>{goalSummary(true, true)}</View>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>RDM reservation</Text>
              <View style={styles.reservation}>
                <MaterialCommunityIcons name="database-outline" size={28} color={palette.text} />
                <View style={styles.goalCopy}><Text style={styles.label}>{savedReview ? `${formatRdm(savedReview.totalPledge)} RDM reserved` : "Commitment saved"}</Text><Text style={styles.caption}>from Base at creation</Text></View>
                <View style={styles.reservationBalance}><Text style={styles.label}>{availableBase === undefined ? "Checking…" : `${formatRdm(availableBase)} RDM`}</Text><Text style={styles.caption}>currently available</Text></View>
              </View>
              {createdWallet.error ? <TextButton label="Retry current balance" onPress={() => void createdWallet.refetch()} /> : null}
            </View>
            <View style={styles.infoNote}><MaterialCommunityIcons name="book-open-variant-outline" size={27} color={palette.muted} /><Text style={styles.infoText}>Reflect daily in your {isHabit ? "Habits" : "Goals"} tab.</Text></View>
          </>
        ) : archivedHabit ? (
          <>
            <Text accessibilityRole="header" style={styles.title}>Your saved habit suggestion</Text>
            <View style={styles.card}>{goalSummary()}</View>
            <InfoNote>This earlier suggestion is preserved for reference. Medaa now creates goals only. Existing habits are still available in your Habits tab.</InfoNote>
          </>
        ) : lowBalance ? (
          <>
            <View style={styles.notice}>
              <MaterialCommunityIcons name="information" size={28} color={palette.link} />
              <View style={styles.goalCopy}><Text style={styles.noticeTitle}>{review ? "Your balance has changed" : "This goal needs more RDM"}</Text><Text style={styles.body}>This goal needs {formatRdm(requiredTotal ?? 0)} RDM. {formatRdm(availableBase ?? 0)} RDM is available in Base.</Text></View>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cost breakdown</Text>
              <View style={styles.breakdownRow}><Text style={styles.body}>This goal needs</Text><Text style={styles.label}>{formatRdm(requiredTotal ?? 0)} RDM</Text></View>
              <View style={styles.breakdownRow}><Text style={styles.body}>Available (Base)</Text><Text style={styles.label}>{formatRdm(availableBase ?? 0)} RDM</Text></View>
              {otherGoalsPledge > 0 ? <View style={styles.breakdownRow}><Text style={styles.body}>Other selected goals</Text><Text style={styles.label}>{formatRdm(otherGoalsPledge)} RDM</Text></View> : null}
              <View style={styles.breakdownRow}><Text style={styles.label}>Shortfall</Text><Text style={[styles.label, styles.coral]}>{formatRdm(Math.max(0, (requiredTotal ?? 0) - (remainingForGoal ?? 0)))} RDM</Text></View>
            </View>
            <View style={styles.section}><Text style={styles.sectionTitle}>Your original plan</Text><View style={styles.card}>{goalSummary(true, true)}</View></View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>A smaller first step</Text>
              <Text style={styles.body}>Ask Medaa to suggest a smaller goal that fits your balance. Your original target and dates will not change until a new suggestion is ready.</Text>
              <View style={styles.card}><View style={styles.infoNote}><MaterialCommunityIcons name="auto-fix" size={26} color={palette.link} /><Text style={styles.infoText}>{budget.data?.maxAffordableDays ? `At ${formatRdm(numericDailyPledge)} RDM/day, up to ${budget.data.maxAffordableDays} days fit after other selected goals. Review any new suggestion before setting it.` : "No days fit at this daily pledge. Lower the rate if possible, or keep your saved draft and return when you have Base RDM."}</Text></View></View>
              {hasUnsavedChanges ? <Text style={styles.caption}>Review or discard your local target/date edits before asking AI to refine the saved plan.</Text> : null}
              {aiDisabled ? <Text style={styles.caption}>AI help is currently unavailable. Your saved draft is still accessible.</Text> : null}
            </View>
          </>
        ) : (
          <>
            <View style={styles.intro}>
              <Text accessibilityRole="header" style={styles.title}>Review your commitment</Text>
              <Text style={styles.subtitle}>{setting ? "Confirm the result of your submitted commitment." : "Check the details before setting your goal."}</Text>
            </View>
            <View style={styles.card}>
              {goalSummary()}
              {editing ? (
                <>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen, disabled: locked }} aria-expanded={detailsOpen} disabled={locked} onPress={() => setDetailsOpen((value) => !value)} style={styles.editDetails}>
                    <Text style={styles.link}>Edit goal details</Text><MaterialCommunityIcons name={detailsOpen ? "chevron-up" : "chevron-down"} size={20} color={palette.link} />
                  </Pressable>
                  {detailsOpen ? <View style={styles.editor}>
                    <Text style={styles.label}>Goal name</Text>
                    <TextInput accessibilityLabel="Goal title" value={content.title} maxLength={80} editable={!locked} onChangeText={(title) => updateContent({ title })} style={styles.input} />
                    <Text style={styles.label}>Completion condition</Text>
                    <TextInput accessibilityLabel="Completion condition" value={content.target} maxLength={120} multiline editable={!locked} onChangeText={(target) => updateContent({ target })} style={[styles.input, styles.multiline]} />
                    <Pressable accessibilityRole="button" accessibilityLabel={`Category: ${content.category}`} accessibilityState={{ expanded: categoryOpen, disabled: locked }} aria-expanded={categoryOpen} disabled={locked} onPress={() => setCategoryOpen((value) => !value)} style={styles.categoryButton}>
                      <Text style={styles.label}>{content.category}</Text><MaterialCommunityIcons name={categoryOpen ? "chevron-up" : "chevron-down"} size={20} color={palette.muted} />
                    </Pressable>
                    {categoryOpen ? <View accessibilityRole="radiogroup">{goalCategories.map((category) => <Pressable key={category} accessibilityRole="radio" accessibilityLabel={category} accessibilityState={{ checked: content.category === category, disabled: locked }} aria-checked={content.category === category} disabled={locked} onPress={() => { updateContent({ category }); setCategoryOpen(false); }} style={styles.categoryButton}><Text style={styles.body}>{category}</Text>{category === content.category ? <MaterialCommunityIcons name="check" size={19} color={palette.green} /> : null}</Pressable>)}</View> : null}
                  </View> : null}
                  <View style={styles.dateRow}><Text style={styles.rowLabel}>Start date</Text><View style={styles.dateField}><HabitDateField label="Start date" value={startDayKey} minimumDayKey={today} disabled={locked} onChange={updateStart} /></View></View>
                  <View style={styles.dateRow}><Text style={styles.rowLabel}>End date</Text><View style={styles.dateField}><HabitDateField label="End date (exclusive)" value={endDayKey} minimumDayKey={goalDurationWindow(startDayKey, 1)?.endDayKey ?? today} disabled={locked} onChange={(value) => { setEndDayKey(value); setBudgetEditing(true); setError(null); }} /></View></View>
                  <Text style={[styles.caption, !validDates && styles.coral]}>{Number.isInteger(duration) ? `${duration} daily reflections. ` : "Choose valid dates. "}End date excluded. Choose 1–{MEDAA_MAX_COMMITMENT_DAYS} days.</Text>
                  <View style={styles.dateRow}><Text style={styles.rowLabel}>Daily pledge</Text><View style={styles.stepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Decrease daily RDM pledge" accessibilityState={{ disabled: locked || numericDailyPledge <= 1 }} disabled={locked || numericDailyPledge <= 1} onPress={() => changePledge(String(Math.max(1, numericDailyPledge - 1)))} style={styles.stepButton}><MaterialCommunityIcons name="minus" size={20} color={palette.text} /></Pressable>
                    <TextInput accessibilityLabel="Daily RDM pledge" value={pledge} editable={!locked} keyboardType="number-pad" maxLength={6} onChangeText={(value) => changePledge(value.replace(/\D/g, ""))} selectTextOnFocus style={styles.pledgeInput} />
                    <Text style={styles.caption}>RDM</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Increase daily RDM pledge" accessibilityState={{ disabled: locked || numericDailyPledge >= 100_000 }} disabled={locked || numericDailyPledge >= 100_000} onPress={() => changePledge(String(Math.max(1, Math.min(100_000, numericDailyPledge + 1))))} style={styles.stepButton}><MaterialCommunityIcons name="plus" size={20} color={palette.text} /></Pressable>
                  </View></View>
                </>
              ) : review ? (
                <>
                  {([{ label: "Start date", value: dateLabel(review.startDayKey), icon: "calendar-month-outline" }, { label: "End date", value: dateLabel(review.endDayKey), icon: "calendar-month-outline" }, { label: dailyReview || isHabit ? "Daily pledge" : "Original pledge", value: `${formatRdm(review.pledgeAmount)} RDM`, icon: "database-outline" }] as const).map((row) => <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={`Edit ${row.label.toLowerCase()}, ${row.value}`} accessibilityState={{ disabled: reviewEditBlocked }} disabled={reviewEditBlocked} onPress={startEditing} style={styles.reviewRow}>
                    <MaterialCommunityIcons name={row.icon} color={palette.muted} size={22} /><Text style={styles.rowLabel}>{row.label}</Text><Text style={styles.reviewValue}>{row.value}</Text>{!reviewEditBlocked ? <MaterialCommunityIcons name="chevron-right" color={palette.muted} size={19} /> : null}
                  </Pressable>)}
                  <Text style={styles.caption}>End date excluded{dailyReview || isHabit ? ` · ${review.scheduledDays} scheduled reflections` : " · Original whole-goal terms"}.</Text>
                </>
              ) : null}
            </View>

            {needsShorterCommitment ? <Text style={styles.error}>This saved target or review exceeds {MEDAA_MAX_COMMITMENT_DAYS} days. Shorten its completion condition and dates, then review again. {onRefine ? "Fit my budget can ask Medaa for a smaller milestone." : ""} The original target has not been changed automatically.</Text> : null}
            {needsDailyReview && !editing ? <Text style={styles.error}>This older review used one whole-goal pledge. Confirm daily dates and RDM, then review again. Nothing is converted or charged automatically.</Text> : null}
            {staleDates ? <Text style={styles.error}>The reviewed start date has passed. Edit the dates and review again before setting this goal.</Text> : null}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Commitment summary</Text>
              <Text style={styles.body}>{editing ? projectedTotal === null ? "Choose dates and a whole-number daily pledge." : `${duration} days × ${formatRdm(numericDailyPledge)} RDM = ${formatRdm(projectedTotal)} RDM total`
                : review ? dailyReview || isHabit ? `${review.scheduledDays} days × ${formatRdm(review.pledgeAmount)} RDM = ${formatRdm(review.totalPledge)} RDM total` : `${formatRdm(review.totalPledge)} RDM · Original whole-goal pledge` : "Review the goal to calculate its commitment."}</Text>
              <View style={styles.balanceCard}>
                <View style={styles.balanceCell}><Text style={styles.caption}>Base available</Text><Text style={styles.balanceValue}>{availableBase === undefined ? "Checking…" : `${formatRdm(availableBase)} RDM`}</Text></View>
                <View style={[styles.balanceCell, styles.balanceDivider]}><Text style={styles.caption}>After pledge</Text><Text style={[styles.balanceValue, !canAfford && availableBase !== undefined && styles.coral]}>{availableBase === undefined || requiredTotal === null ? "—" : `${formatRdm(availableBase - requiredTotal)} RDM`}</Text></View>
              </View>
              {otherGoalsPledge > 0 ? <Text style={styles.caption}>{formatRdm(otherGoalsPledge)} RDM is also planned for other selected goals. {remainingForGoal !== undefined && requiredTotal !== null ? `${formatRdm(remainingForGoal - requiredTotal)} RDM remains after the whole selected plan.` : ""}</Text> : null}
              {budget.error ? <><Text style={styles.error}>Your plan budget could not be checked. Your draft is still here.</Text><TextButton label="Retry plan budget check" disabled={busy} onPress={() => void budget.refetch()} /></> : null}
              {genuinelyInsufficient ? <View style={styles.notice}><Text style={styles.infoText}>Your selected plan exceeds available Base RDM. Review to save these edits, or reset them and ask Medaa to suggest a smaller target. Dates are never shortened automatically.</Text></View> : null}
            </View>

            {hasElapsedDates && review ? <View style={styles.recovery}>
              <Text style={styles.error}>{isHabit || dailyReview ? "The original start date has passed. Recovery keeps the same dates and pledge; missed scheduled reflection days settle to Remorse."
                : review.endDayKey <= reviewedToday ? "The original deadline has passed. Recovery can lock the original pledge and immediately settle it to Remorse." : "The original start date has passed. Recovery keeps the same deadline and pledge, not a new goal period."}</Text>
              <Pressable accessibilityRole="checkbox" accessibilityLabel="Confirm recovery with the original dates and RDM pledge" accessibilityState={{ checked: confirmElapsedDates, disabled: disabled || busy }} aria-checked={confirmElapsedDates} disabled={disabled || busy} onPress={() => setConfirmElapsedDates((value) => !value)} style={styles.checkboxRow}>
                <MaterialCommunityIcons name={confirmElapsedDates ? "checkbox-marked" : "checkbox-blank-outline"} size={26} color={palette.link} /><Text style={styles.infoText}>I confirm the original dates, RDM pledge, and any missed-day settlement.</Text>
              </Pressable>
            </View> : null}
            {setting ? <InfoNote>This exact commitment has already been submitted. Retry to confirm its result safely; its approved details cannot be edited.</InfoNote> : null}
            <InfoNote>{dailyReview || editing ? "Completed days move to Reward. Missed days move to Remorse. These allocations come from the locked pledge; no second charge." : "The original approved funding rules are preserved."}</InfoNote>
            <Text style={styles.caption}>Saved time zone: {review?.timeZone ?? timeZone}.</Text>
            {draft.content.steps?.length || draft.content.why || draft.content.reflectionPrompt ? <View style={styles.approach}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: approachOpen }} aria-expanded={approachOpen} onPress={() => setApproachOpen((value) => !value)} style={styles.approachHeader}><Text style={styles.label}>Your saved approach</Text><MaterialCommunityIcons name={approachOpen ? "chevron-up" : "chevron-down"} color={palette.muted} size={20} /></Pressable>
              {approachOpen ? <View style={styles.approachBody}>{draft.content.why ? <Text style={styles.body}>{draft.content.why}</Text> : null}{draft.content.steps?.map((step, index) => <Text key={`${index}:${step}`} style={styles.body}>{index + 1}. {step}</Text>)}{draft.content.reflectionPrompt ? <Text style={styles.caption}>Daily reflection: {draft.content.reflectionPrompt}</Text> : null}</View> : null}
            </View> : null}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {error ? <View style={styles.errorBlock}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>{!setting ? <TextButton label="Reload saved draft" disabled={busy || disabled} onPress={() => void reloadConversation()} /> : null}</View> : null}
        {isCreated ? <>
          <FocusedButton label={`Open ${isHabit ? "habit" : "goal"}`} disabled={!draft.entityId || disabled} onPress={openCreated} />
          <OutlineButton label="Finish" disabled={disabled} onPress={onFinish ?? (() => router.replace("/(app)/(tabs)/goals"))} />
          {!isHabit && onMore ? <TextButton label="More goals →" disabled={disabled} onPress={onMore} /> : null}
        </> : archivedHabit ? onClose ? <OutlineButton label="Back to journey" onPress={onClose} /> : null
          : lowBalance ? <>
            <FocusedButton label="Fit my budget" disabled={!canRefine} onPress={refineToBudget} />
            <OutlineButton label={`Set goal · ${formatRdm(requiredTotal ?? 0)} RDM`} disabled onPress={() => {}} />
            <TextButton label="Edit dates & pledge" disabled={locked} onPress={startEditing} />
            <InfoNote>Your draft is safe. Nothing has been charged. With 0 RDM, return when you have Base RDM.</InfoNote>
          </> : editing ? <>
            <Text style={styles.caption}>Reviewing saves the terms only. No RDM is locked yet.</Text>
            <FocusedButton label="Review commitment" loading={prepare.isPending} disabled={locked || !validDates || !validDailyPledge || projectedTotal === null || projectedTotal > 100_000} onPress={() => void prepareReview()} />
            {draft.review || onClose ? <TextButton label={draft.review ? "Cancel edits" : "Back to plan"} disabled={locked} onPress={cancelEdits} /> : null}
          </> : <>
            <FocusedButton label={setting && isHabit ? "Recover original commitment" : setting ? "Retry Set goal" : `Set goal · ${formatRdm(review?.totalPledge ?? 0)} RDM`} loading={set.isPending}
              disabled={disabled || busy || !review || needsShorterCommitment || needsDailyReview || staleDates || (hasElapsedDates && !confirmElapsedDates) || (!setting && (!canAfford || budget.isPending || Boolean(budget.error)))} onPress={() => void setCommitment()} />
            {!setting ? <TextButton label={needsDailyReview ? "Confirm new daily terms" : "Edit dates & pledge"} disabled={disabled || busy} onPress={startEditing} /> : null}
          </>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 18 },
  intro: { gap: 7, paddingBottom: 2 },
  title: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 33 },
  subtitle: { color: palette.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
  body: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  caption: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  label: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  sectionTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  section: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 16, gap: 12 },
  card: { padding: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: palette.panel, gap: 12 },
  goalSummary: { flexDirection: "row", alignItems: "flex-start", gap: 15 },
  goalCopy: { flex: 1, minWidth: 0, gap: 5 },
  goalTitle: { flex: 1, color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 },
  compactTitle: { fontSize: 13, lineHeight: 19 },
  savedHeading: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  dateRow: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  rowLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, flex: 1 },
  dateField: { flex: 2.3, minWidth: 0 },
  reviewRow: { minHeight: 46, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  reviewValue: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18, textAlign: "right" },
  stepper: { flex: 2.3, minWidth: 0, minHeight: 46, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: palette.line, borderRadius: 8 },
  stepButton: { minHeight: 44, minWidth: 38, alignItems: "center", justifyContent: "center" },
  pledgeInput: { flex: 1, minWidth: 0, color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 15, minHeight: 44, paddingHorizontal: 0, paddingVertical: 5, textAlign: "center" },
  balanceCard: { borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: palette.panel, padding: 16, flexDirection: "row", gap: 20 },
  balanceCell: { flex: 1, minWidth: 0, gap: 6 },
  balanceDivider: { borderLeftWidth: 1, borderLeftColor: palette.muted, paddingLeft: 20 },
  balanceValue: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 23, lineHeight: 31 },
  infoNote: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  infoText: { flex: 1, color: palette.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 19 },
  notice: { flexDirection: "row", gap: 12, padding: 14, borderWidth: 1, borderColor: "#274766", borderRadius: 9, backgroundColor: "#172735" },
  noticeTitle: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  breakdownRow: { minHeight: 35, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: palette.line, paddingBottom: 8 },
  createdContent: { paddingTop: 24, gap: 23 },
  successIntro: { alignItems: "center", paddingTop: 14, paddingBottom: 8, gap: 10 },
  successCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 6, borderColor: palette.link, alignItems: "center", justifyContent: "center", marginBottom: 17 },
  successTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 33, textAlign: "center" },
  createdBadge: { borderWidth: 1, borderColor: palette.green, borderRadius: 14, paddingHorizontal: 7, paddingVertical: 1 },
  createdBadgeText: { color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 10, lineHeight: 16 },
  reservation: { borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: palette.panel, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  reservationBalance: { maxWidth: "39%", borderLeftWidth: 1, borderLeftColor: palette.line, paddingLeft: 12, gap: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 10, gap: 9, backgroundColor: palette.background },
  outlineButton: { minHeight: 48, borderWidth: 1, borderColor: palette.line, borderRadius: 9, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: palette.panel },
  outlineLabel: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21, textAlign: "center" },
  textButton: { minHeight: 36, alignItems: "center", justifyContent: "center" },
  link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 19 },
  errorBlock: { gap: 3 },
  error: { color: palette.coral, fontFamily: fonts.body, fontSize: 12, lineHeight: 19 },
  coral: { color: palette.coral },
  editor: { gap: 9 },
  input: { minHeight: 44, borderWidth: 1, borderColor: palette.line, borderRadius: 8, padding: 10, color: palette.text, backgroundColor: palette.background, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  categoryButton: { flexDirection: "row", minHeight: 44, alignItems: "center", justifyContent: "space-between", gap: 12 },
  editDetails: { flexDirection: "row", minHeight: 32, alignItems: "center", justifyContent: "flex-end", gap: 5 },
  recovery: { gap: 12 },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 },
  approach: { borderTopWidth: 1, borderTopColor: palette.line },
  approachHeader: { minHeight: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  approachBody: { gap: 10 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
