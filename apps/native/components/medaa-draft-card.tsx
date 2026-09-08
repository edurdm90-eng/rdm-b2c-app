import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { medaaPrepareSchema, type MedaaConversation, type MedaaDraft, type MedaaDraftContent } from "@rdm-b2c/api/domain/medaa";
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

export function MedaaDraftCard({ conversationId, timeZone, draft, disabled, onConversation, onRefine }: {
  conversationId: string;
  timeZone: string;
  draft: MedaaDraft;
  disabled: boolean;
  onConversation: (conversation: MedaaConversation) => void;
  onRefine: () => void;
}) {
  const today = dayKeyForTimeZone(new Date(), timeZone);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<MedaaDraftContent>(draft.content);
  const [startDayKey, setStartDayKey] = useState(draft.review?.startDayKey ?? today);
  const [endDayKey, setEndDayKey] = useState(draft.review?.endDayKey
    ?? (draft.content.durationDays ? goalDurationWindow(today, draft.content.durationDays)?.endDayKey : "") ?? "");
  // An AI suggestion must never choose how much of the user's currency to spend.
  const [pledge, setPledge] = useState(draft.review ? String(draft.review.pledgeAmount) : "");
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const isHabit = content.type === "habit";
  const isCreated = draft.status === "created";
  const setting = draft.status === "setting";
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

  function updateContent(update: Partial<MedaaDraftContent>) {
    setContent((current) => ({ ...current, ...update }));
    setError(null);
  }

  async function reloadConversation() {
    const latest = await queryClient.fetchQuery(trpc.medaa.conversation.queryOptions({ id: conversationId })).catch(() => null);
    if (latest) onConversation(latest);
  }

  async function prepareReview() {
    if (submitting.current || locked) return;
    setError(null);
    const duration = (Date.parse(`${endDayKey}T00:00:00.000Z`) - Date.parse(`${startDayKey}T00:00:00.000Z`)) / 86_400_000;
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
    if (submitting.current || disabled || busy || !draft.review || isCreated) return;
    submitting.current = true;
    setError(null);
    try {
      const result = await set.mutateAsync({ conversationId, draftId: draft.id, reviewId: draft.review.id });
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
        <Text style={[styles.kind, isCreated && styles.createdLabel]}>{isCreated ? "CREATED" : review ? "REVIEW BEFORE SET" : "SUGGESTED"} {isHabit ? "HABIT" : "GOAL"}</Text>
      </View>
      <Text style={styles.title}>{draft.content.title}</Text>
      <Text style={styles.target}>{draft.content.target}</Text>
      <Text style={styles.meta}>{draft.content.category}{draft.content.durationDays ? ` · ${draft.content.durationDays}-day suggestion` : ""}</Text>

      {isCreated ? (
        <>
          <Text style={styles.helper}>Saved to your {isHabit ? "Habits" : "Goals"}. Continue with your usual tracking and reflection.</Text>
          <PrimaryButton label={`Open ${isHabit ? "habit" : "goal"}`} color={colors.growth} icon="arrow-right" disabled={!draft.entityId} onPress={openCreated} />
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
          <MedaaDateField label="Start date" value={startDayKey} minimum={today} disabled={locked} onChange={setStartDayKey} />
          <MedaaDateField label="End date (exclusive)" value={endDayKey} minimum={startDayKey || today} disabled={locked} onChange={setEndDayKey} />
          <Text style={styles.helper}>{isHabit
            ? "Only your selected weekdays before the end date are pledged. The end date itself is not charged."
            : "Your goal must be completed before the end date."} Time zone: {timeZone}.</Text>
          <SectionLabel>{isHabit ? "RDM per scheduled day" : "Total goal pledge (RDM)"}</SectionLabel>
          <TextInput accessibilityLabel={isHabit ? "Daily RDM pledge" : "Goal RDM pledge"} value={pledge}
            placeholder="Enter your own amount" placeholderTextColor={colors.inkSoft} editable={!locked}
            keyboardType="number-pad" maxLength={6} onChangeText={setPledge} style={styles.input} />
          <Text style={styles.helper}>The server will calculate your exact Base Purse commitment before you confirm. No RDM is locked by reviewing.</Text>
          <PrimaryButton label="Review commitment" icon="clipboard-check-outline" color={colors.ai}
            loading={prepare.isPending} disabled={locked} onPress={() => void prepareReview()} />
          <PrimaryButton label="Cancel edits" variant="outline" color={colors.ai} disabled={locked}
            onPress={() => {
              setContent(draft.content);
              setStartDayKey(draft.review?.startDayKey ?? today);
              setEndDayKey(draft.review?.endDayKey ?? (draft.content.durationDays ? goalDurationWindow(today, draft.content.durationDays)?.endDayKey : "") ?? "");
              setPledge(draft.review ? String(draft.review.pledgeAmount) : "");
              setError(null);
              setEditing(false);
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
          <PrimaryButton label={`${setting ? "Retry Set" : "Set"} ${isHabit ? "Habit" : "Goal"}`} icon="check" color={colors.ai}
            loading={set.isPending} disabled={disabled || busy || (!setting && (!canAfford || wallet.isPending))}
            onPress={() => void setCommitment()} />
          {!setting ? <PrimaryButton label="Edit details" variant="outline" color={colors.ai} disabled={disabled || busy}
            onPress={() => { setError(null); setEditing(true); }} /> : null}
        </View>
      ) : (
        <View style={styles.actions}>
          <PrimaryButton label={`Review ${isHabit ? "habit" : "goal"}`} icon="pencil-outline" color={colors.ai}
            disabled={disabled} onPress={() => setEditing(true)} />
          <PrimaryButton label="Refine with Medaa" variant="outline" color={colors.ai} disabled={disabled} onPress={onRefine} />
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

function MedaaDateField({ label, value, minimum, disabled, onChange }: {
  label: string; value: string; minimum: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const minimumDate = new Date(`${minimum}T12:00:00`);
  const parsedDate = new Date(`${value}T12:00:00`);
  const pickerDate = Number.isNaN(parsedDate.getTime()) ? minimumDate : parsedDate;
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
            minimumDate={Number.isNaN(minimumDate.getTime()) ? new Date() : minimumDate}
            value={Number.isNaN(pickerDate.getTime()) ? new Date() : pickerDate} onChange={(event, date) => {
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
});
