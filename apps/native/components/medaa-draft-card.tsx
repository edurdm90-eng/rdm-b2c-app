import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MEDAA_DEFAULT_COMMITMENT_DAYS, MEDAA_MAX_COMMITMENT_DAYS, isMedaaShortCommitment, medaaPrepareSchema, type MedaaConversation, type MedaaDraft, type MedaaDraftContent } from "@rdm-b2c/api/domain/medaa";
import { dayKeyForTimeZone, goalCategories, goalDurationWindow, habitCategories } from "@rdm-b2c/api/domain/rdm";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Pill, PrimaryButton, SectionLabel, SurfaceCard } from "@/components/rdm-ui";
import { formatDayKey } from "@/lib/date";
import { colors, fonts, formatRdm, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

const weekdays = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

export function MedaaDraftCard({ conversationId, timeZone, draft, disabled, initialEditing = false, aiDisabled = false, onConversation, onRefine, onClose }: {
  conversationId: string;
  timeZone: string;
  draft: MedaaDraft;
  disabled: boolean;
  initialEditing?: boolean;
  aiDisabled?: boolean;
  onConversation: (conversation: MedaaConversation) => void;
  onRefine?: (direction: "simpler" | "more-specific" | "less-time") => void;
  onClose?: () => void;
}) {
  const today = dayKeyForTimeZone(new Date(), timeZone);
  const initialDuration = isMedaaShortCommitment(draft.content) ? draft.content.durationDays ?? MEDAA_DEFAULT_COMMITMENT_DAYS : MEDAA_DEFAULT_COMMITMENT_DAYS;
  const initialEnd = draft.review?.endDayKey ?? goalDurationWindow(today, initialDuration)?.endDayKey ?? "";
  const [editing, setEditing] = useState(initialEditing);
  const [content, setContent] = useState<MedaaDraftContent>(draft.content);
  const [startDayKey, setStartDayKey] = useState(draft.review?.startDayKey ?? today);
  const [endDayKey, setEndDayKey] = useState(initialEnd);
  // An AI suggestion must never choose how much of the user's currency to spend.
  const [pledge, setPledge] = useState(draft.review ? String(draft.review.pledgeAmount) : "");
  const [error, setError] = useState<string | null>(null);
  const [confirmElapsedDates, setConfirmElapsedDates] = useState(false);
  const submitting = useRef(false);
  const isHabit = content.type === "habit";
  const isCreated = draft.status === "created";
  const setting = draft.status === "setting";
  const duration = commitmentDays(startDayKey, endDayKey);
  const needsShorterCommitment = draft.status === "draft" && ((draft.content.durationDays ?? 0) > MEDAA_MAX_COMMITMENT_DAYS
    || Boolean(draft.review && commitmentDays(draft.review.startDayKey, draft.review.endDayKey) > MEDAA_MAX_COMMITMENT_DAYS));
  const hasElapsedDates = setting && Boolean(draft.review && draft.review.startDayKey < today);
  const review = editing ? null : draft.review;
  const wallet = useQuery(trpc.rdm.wallet.summary.queryOptions(undefined, {
    enabled: !isCreated && Boolean(editing || review),
  }));
  const availableBase = wallet.data?.wallet.base;
  const canAfford = review && availableBase !== undefined ? availableBase >= review.totalPledge : false;

  const prepare = useMutation(trpc.medaa.prepare.mutationOptions());
  const set = useMutation(trpc.medaa.set.mutationOptions());
  const busy = prepare.isPending || set.isPending;
  const locked = disabled || busy || setting;
  const hasUnsavedChanges = JSON.stringify(content) !== JSON.stringify(draft.content)
    || startDayKey !== (draft.review?.startDayKey ?? today)
    || endDayKey !== initialEnd
    || pledge !== (draft.review ? String(draft.review.pledgeAmount) : "");

  function updateContent(update: Partial<MedaaDraftContent>) {
    setContent((current) => ({ ...current, ...update }));
    setError(null);
  }

  function updateStart(value: string) {
    setStartDayKey(value);
    const days = Number.isInteger(duration) && duration >= 1 && duration <= MEDAA_MAX_COMMITMENT_DAYS
      ? duration : MEDAA_DEFAULT_COMMITMENT_DAYS;
    const window = goalDurationWindow(value, days);
    if (window) setEndDayKey(window.endDayKey);
    setError(null);
  }

  async function reloadConversation() {
    const latest = await queryClient.fetchQuery(trpc.medaa.conversation.queryOptions({ id: conversationId })).catch(() => null);
    if (latest) onConversation(latest);
  }

  async function prepareReview() {
    if (submitting.current || locked) return;
    setError(null);
    if (!Number.isInteger(duration) || duration < 1 || duration > MEDAA_MAX_COMMITMENT_DAYS) {
      setError(`Choose a commitment from 1–${MEDAA_MAX_COMMITMENT_DAYS} calendar days and a completion condition that fits those dates.`);
      return;
    }
    const parsed = medaaPrepareSchema.safeParse({
      conversationId,
      draftId: draft.id,
      expectedVersion: draft.version,
      content: { ...content, durationDays: Number.isInteger(duration) && duration > 0 ? duration : null },
      startDayKey,
      endDayKey,
      timeZone,
      pledgeAmount: Number(pledge),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete the commitment details.");
      return;
    }
    if (isHabit && (content.weekdays.length === 0 || (content.pledge?.trim().length ?? 0) < 8)) {
      setError("Choose at least one weekday and add your commitment statement.");
      return;
    }
    submitting.current = true;
    try {
      const result = await prepare.mutateAsync(parsed.data);
      onConversation(result.conversation);
      await queryClient.invalidateQueries({ queryKey: trpc.rdm.wallet.summary.queryKey() });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We couldn’t prepare this commitment. Your edits are still here.");
    } finally {
      submitting.current = false;
    }
  }

  async function setCommitment() {
    if (submitting.current || disabled || busy || !draft.review || isCreated || needsShorterCommitment) return;
    submitting.current = true;
    setError(null);
    try {
      const result = await set.mutateAsync({ conversationId, draftId: draft.id, reviewId: draft.review.id, confirmElapsedDates });
      onConversation(result);
      await queryClient.invalidateQueries({ queryKey: trpc.rdm.pathKey() });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Creation could not be confirmed. Retry the same reviewed commitment.");
      await reloadConversation();
      await wallet.refetch();
    } finally {
      submitting.current = false;
    }
  }

  function openCreated() {
    if (!draft.entityId) return;
    router.push(isHabit
      ? { pathname: "/(app)/habit/[id]", params: { id: draft.entityId } }
      : { pathname: "/(app)/goal/[id]", params: { id: draft.entityId } });
  }

  return (
    <SurfaceCard style={[styles.card, isCreated && styles.createdCard]}>
      <View style={styles.heading}>
        <MaterialCommunityIcons name={isCreated ? "check-circle-outline" : isHabit ? "repeat" : "flag-outline"}
          color={isCreated ? colors.growth : colors.ai} size={23} />
        <Text style={[styles.kind, isCreated && styles.createdLabel]}>{isCreated ? "CREATED" : review ? "REVIEW BEFORE SET" : draft.origin === "manual" ? "YOUR DRAFT" : "AI-SUGGESTED"} {isHabit ? "HABIT" : "GOAL"}</Text>
      </View>
      <Text style={styles.title}>{draft.content.title}</Text>
      <Text style={styles.target}>{draft.content.target}</Text>
      <Text style={styles.meta}>{draft.content.category}{draft.content.durationDays ? ` · ${draft.content.durationDays}-day suggestion` : ""}</Text>
      {needsShorterCommitment ? <Text style={styles.error}>This saved draft is longer than {MEDAA_MAX_COMMITMENT_DAYS} days. Shorten its completion condition and dates, then review again before Set.{onRefine ? " You can also ask Medaa Ai for a smaller step using “Less time”." : ""}{!draft.review ? ` The date fields start with ${MEDAA_DEFAULT_COMMITMENT_DAYS} days; the original target has not been changed.` : " Your existing review is unchanged."}</Text> : null}
      {onRefine && draft.status === "draft" ? <View style={styles.actions}>
        <Text style={styles.helper}>Use Medaa Ai to refine this {isHabit ? "habit" : "goal"}:</Text>
        <View style={styles.chips}>
          {([{ direction: "simpler", label: "Make simpler" }, { direction: "more-specific", label: "More specific" }, { direction: "less-time", label: "Less time" }] as const).map((item) => (
            <Pressable key={item.direction} accessibilityRole="button" accessibilityLabel={item.label}
              accessibilityState={{ disabled: locked || aiDisabled || hasUnsavedChanges }}
              disabled={locked || aiDisabled || hasUnsavedChanges} onPress={() => onRefine(item.direction)}
              style={[styles.refineButton, (locked || aiDisabled || hasUnsavedChanges) && styles.disabled]}>
              <Text style={styles.refineLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        {hasUnsavedChanges ? <Text style={styles.helper}>Review your changes or cancel edits before asking AI to refine the saved suggestion.</Text> : null}
      </View> : null}

      {isCreated ? (
        <>
          <Text style={styles.helper}>Saved to your {isHabit ? "Habits" : "Goals"}. Continue with your usual tracking and reflection.</Text>
          <PrimaryButton label={`Open ${isHabit ? "habit" : "goal"}`} color={colors.growth} icon="arrow-right" disabled={!draft.entityId} onPress={openCreated} />
          {onClose ? <PrimaryButton label="Back to journey" color={colors.ai} variant="outline" onPress={onClose} /> : null}
        </>
      ) : editing ? (
        <View style={styles.editor}>
          <SectionLabel>Title</SectionLabel>
          <TextInput accessibilityLabel={`${isHabit ? "Habit" : "Goal"} title`} value={content.title} maxLength={80}
            editable={!locked} onChangeText={(title) => updateContent({ title })} style={styles.input} />
          <SectionLabel>Completion condition</SectionLabel>
          <TextInput accessibilityLabel="Completion condition" value={content.target} maxLength={120} multiline
            editable={!locked} onChangeText={(target) => updateContent({ target })} style={[styles.input, styles.multiline]} />
          <SectionLabel>Category</SectionLabel>
          <View style={styles.chips}>
            {(isHabit ? habitCategories : goalCategories).map((category) => (
              <Pill key={category} label={category} color={colors.ai} active={content.category === category}
                onPress={locked ? undefined : () => updateContent({ category })} />
            ))}
          </View>
          {isHabit ? (
            <>
              <SectionLabel>Repeat on</SectionLabel>
              <View style={styles.chips}>
                {weekdays.map((day) => (
                  <Pill key={day.value} label={day.label} color={colors.ai} active={content.weekdays.includes(day.value)}
                    onPress={locked ? undefined : () => updateContent({ weekdays: content.weekdays.includes(day.value)
                      ? content.weekdays.filter((value) => value !== day.value)
                      : [...content.weekdays, day.value].sort((a, b) => a - b) })} />
                ))}
              </View>
              <SectionLabel>Your commitment</SectionLabel>
              <TextInput accessibilityLabel="Habit commitment statement" value={content.pledge ?? ""}
                placeholder="I commit to…" placeholderTextColor={colors.inkSoft} editable={!locked} maxLength={500} multiline
                onChangeText={(value) => updateContent({ pledge: value })} style={[styles.input, styles.multiline]} />
            </>
          ) : null}
          <SectionLabel>Short commitment · 1–{MEDAA_MAX_COMMITMENT_DAYS} days</SectionLabel>
          <Text style={styles.helper}>Start with {MEDAA_DEFAULT_COMMITMENT_DAYS} days. Adjust the dates and completion condition to a realistic step, not your entire long-term ambition.</Text>
          <MedaaDateField label="Start date" value={startDayKey} minimum={today} disabled={locked} onChange={updateStart} />
          <MedaaDateField label="End date (exclusive)" value={endDayKey}
            minimum={goalDurationWindow(startDayKey, 1)?.endDayKey ?? today}
            maximum={goalDurationWindow(startDayKey, MEDAA_MAX_COMMITMENT_DAYS)?.endDayKey}
            disabled={locked} onChange={(value) => { setEndDayKey(value); setError(null); }} />
          <Text style={styles.helper}>{Number.isInteger(duration) && duration > 0 ? `${duration} calendar days selected.` : "Choose valid start and end dates."} Start included; end excluded.</Text>
          <PrimaryButton label={`Use ${MEDAA_DEFAULT_COMMITMENT_DAYS} days`} color={colors.ai} variant="outline" disabled={locked || !goalDurationWindow(startDayKey, MEDAA_DEFAULT_COMMITMENT_DAYS)}
            onPress={() => {
              const window = goalDurationWindow(startDayKey, MEDAA_DEFAULT_COMMITMENT_DAYS);
              if (window) { setEndDayKey(window.endDayKey); setError(null); }
            }} />
          <Text style={styles.helper}>{isHabit
            ? "Only your selected weekdays before the end date are pledged. The end date itself is not charged."
            : "Your goal must be completed before the end date."} Time zone: {timeZone}.</Text>
          <SectionLabel>{isHabit ? "RDM per scheduled day" : "Total goal pledge (RDM)"}</SectionLabel>
          <TextInput accessibilityLabel={isHabit ? "Daily RDM pledge" : "Goal RDM pledge"} value={pledge}
            placeholder="Enter your own amount" placeholderTextColor={colors.inkSoft} editable={!locked}
            keyboardType="number-pad" maxLength={6} onChangeText={setPledge} style={styles.input} />
          <Text style={styles.helper}>{isHabit ? "Minimum 1 RDM per scheduled day." : "This is one whole-goal pledge, not a daily charge."}</Text>
          <Text style={styles.helper}>The server will calculate your exact Base Purse commitment before you confirm. No RDM is locked by reviewing.</Text>
          <PrimaryButton label="Review commitment" icon="clipboard-check-outline" color={colors.ai}
            loading={prepare.isPending} disabled={locked} onPress={() => void prepareReview()} />
          <PrimaryButton label="Cancel edits" variant="outline" color={colors.ai} disabled={locked}
            onPress={() => {
              setContent(draft.content);
              setStartDayKey(draft.review?.startDayKey ?? today);
              setEndDayKey(initialEnd);
              setPledge(draft.review ? String(draft.review.pledgeAmount) : "");
              setError(null);
              setEditing(false);
              if (!draft.review) onClose?.();
            }} />
        </View>
      ) : review ? (
        <View style={styles.review}>
          {isHabit ? <Text style={styles.helper}>{draft.content.pledge}</Text> : null}
          <View style={styles.detailRow}><Text style={styles.helper}>Start</Text><Text style={styles.detail}>{formatDayKey(review.startDayKey)}</Text></View>
          <View style={styles.detailRow}><Text style={styles.helper}>End (exclusive)</Text><Text style={styles.detail}>{formatDayKey(review.endDayKey)}</Text></View>
          <Text style={styles.helper}>Time zone: {review.timeZone}</Text>
          {isHabit ? (
            <>
              <Text style={styles.detail}>{weekdays.filter((day) => draft.content.weekdays.includes(day.value)).map((day) => day.label).join(" · ")}</Text>
              <Text style={styles.helper}>{review.scheduledDays} scheduled days · {formatRdm(review.pledgeAmount)} RDM each</Text>
            </>
          ) : null}
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Lock from Base Purse</Text><Text style={styles.total}>{formatRdm(review.totalPledge)} RDM</Text></View>
          <Text style={styles.helper}>{availableBase === undefined ? "Checking your Base Purse…" : `${formatRdm(availableBase)} RDM currently available`}</Text>
          {availableBase !== undefined && !canAfford && !setting ? <Text style={styles.error}>Insufficient Base RDM. Your draft is saved; edit the pledge or return when your balance is sufficient.</Text> : null}
          {wallet.error ? <PrimaryButton label="Retry balance check" color={colors.ai} variant="outline" onPress={() => void wallet.refetch()} /> : null}
          <Text style={styles.helper}>{setting
            ? "This exact commitment has been submitted. Retry to confirm the result safely; it cannot be edited while creation is being resolved."
            : "Tapping Set creates this commitment and locks the amount above. Existing tracking, reflection, and RDM rules apply."}</Text>
          {hasElapsedDates ? <>
            <Text style={styles.error}>{isHabit
              ? "The original start date has passed. Recovery keeps the same dates and pledge; any missed scheduled days settle to Remorse."
              : review.endDayKey <= today
                ? "The original deadline has passed. Recovering this commitment can lock the original pledge and immediately settle it to Remorse."
                : "The original start date has passed. Recovery keeps the same deadline and pledge; it does not start a new goal period."}</Text>
            <Pressable accessibilityRole="checkbox" accessibilityLabel="Confirm recovery with the original dates and RDM pledge"
              accessibilityState={{ checked: confirmElapsedDates }} disabled={disabled || busy}
              onPress={() => setConfirmElapsedDates(!confirmElapsedDates)} style={styles.heading}>
              <MaterialCommunityIcons name={confirmElapsedDates ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={colors.ai} />
              <Text style={[styles.helper, { flex: 1 }]}>I confirm the original dates, RDM pledge, and any missed-day settlement.</Text>
            </Pressable>
          </> : null}
          <PrimaryButton label={`${setting ? "Retry Set" : "Set"} ${isHabit ? "Habit" : "Goal"}`} icon="check" color={colors.ai}
            loading={set.isPending} disabled={disabled || busy || needsShorterCommitment || (hasElapsedDates && !confirmElapsedDates) || (!setting && (!canAfford || wallet.isPending))}
            onPress={() => void setCommitment()} />
          {!setting ? <PrimaryButton label="Edit details" variant="outline" color={colors.ai} disabled={disabled || busy}
            onPress={() => { setError(null); setEditing(true); }} /> : null}
        </View>
      ) : (
        <View style={styles.actions}>
          <PrimaryButton label={`Review ${isHabit ? "habit" : "goal"}`} icon="pencil-outline" color={colors.ai}
            disabled={disabled} onPress={() => setEditing(true)} />
        </View>
      )}
      {error ? (
        <View style={styles.actions}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>
          {!setting ? <PrimaryButton label="Reload saved draft" variant="outline" color={colors.ai}
            disabled={busy} onPress={() => void reloadConversation()} /> : null}
        </View>
      ) : null}
    </SurfaceCard>
  );
}

function commitmentDays(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000;
}

function MedaaDateField({ label, value, minimum, maximum, disabled, onChange }: {
  label: string; value: string; minimum: string; maximum?: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const minimumDate = new Date(`${minimum}T12:00:00`);
  const maximumDate = maximum ? new Date(`${maximum}T12:00:00`) : undefined;
  const parsedDate = new Date(`${value}T12:00:00`);
  const validMinimum = Number.isNaN(minimumDate.getTime()) ? new Date() : minimumDate;
  const validMaximum = maximumDate && !Number.isNaN(maximumDate.getTime()) ? maximumDate : undefined;
  const pickerDate = new Date(Math.min(validMaximum?.getTime() ?? Infinity,
    Math.max(validMinimum.getTime(), Number.isNaN(parsedDate.getTime()) ? validMinimum.getTime() : parsedDate.getTime())));
  return (
    <View style={styles.dateField}>
      <SectionLabel>{label}</SectionLabel>
      {Platform.OS === "web" ? <TextInput accessibilityLabel={label} value={value} editable={!disabled} onChangeText={onChange}
        placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkSoft} autoCapitalize="none" maxLength={10} style={styles.input} /> : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={() => setOpen(true)} style={styles.dateButton}>
            <Text style={styles.detail}>{value ? formatDayKey(value) : "Choose date"}</Text>
            <MaterialCommunityIcons name="calendar-outline" size={21} color={colors.ai} />
          </Pressable>
          {open ? <DateTimePicker mode="date" themeVariant="dark" display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={validMinimum} maximumDate={validMaximum}
            value={pickerDate} onChange={(event, date) => {
              if (Platform.OS === "android") setOpen(false);
              if (event.type === "set" && date) onChange([date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"));
            }} /> : null}
          {open && Platform.OS === "ios" ? <PrimaryButton label="Done" variant="outline" color={colors.ai} onPress={() => setOpen(false)} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderColor: colors.ai, borderWidth: 1 },
  createdCard: { borderColor: colors.growth },
  heading: { flexDirection: "row", alignItems: "center", gap: 9 },
  kind: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.7, color: colors.ai, flex: 1 },
  createdLabel: { color: colors.growth },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 29, color: colors.ink },
  target: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.inkSoft },
  helper: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.inkSoft },
  actions: { gap: 10 },
  editor: { gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.background, borderRadius: radii.small, padding: 13, fontFamily: fonts.body, fontSize: 14, color: colors.ink, minHeight: 46 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  review: { gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  detail: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 21 },
  totalRow: { gap: 5, padding: 14, backgroundColor: colors.aiTint, borderRadius: radii.small },
  totalLabel: { color: colors.ai, fontFamily: fonts.bodyMedium, fontSize: 12 },
  total: { fontFamily: fonts.monoBold, fontSize: 23, color: colors.ink },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  dateField: { gap: 8 },
  dateButton: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line, padding: 13, borderRadius: radii.small, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  refineButton: { paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderColor: colors.ai, borderRadius: radii.pill, backgroundColor: colors.aiTint },
  refineLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.ai },
  disabled: { opacity: 0.4 },
});
