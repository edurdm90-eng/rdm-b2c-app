import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { MEDAA_DEFAULT_COMMITMENT_DAYS, MEDAA_MAX_COMMITMENT_DAYS, MEDAA_PLAN_ITEM_LIMIT, medaaGoalExamples, medaaGoalSelectionLimit, medaaLongTermGoalSchema, type MedaaAiAction, type MedaaConversation, type MedaaDraft, type MedaaJourney, type MedaaJourneyStage } from "@rdm-b2c/api/domain/medaa";
import { goalCategories, type GoalCategory } from "@rdm-b2c/api/domain/rdm";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Pill, PrimaryButton, SectionLabel, SurfaceCard } from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";

export const medaaStageTitles: Record<MedaaJourneyStage, string> = {
  horizon: "Choose your horizon", "long-term": "Your long-term goal", "short-term": "Your next two weeks",
  goals: "Your short-term goals", habits: "Habits that get you there", plan: "Your plan", next: "What’s next?",
};

type Props = {
  data: MedaaConversation | null;
  disabled: boolean;
  aiDisabled: boolean;
  attemptsRemaining: number;
  onHorizon: (years: 1 | 2 | 3) => void;
  onLongTerm: (goal: string, category: GoalCategory) => void;
  onChooseGoals: (ids: string[], continueToGoals?: boolean) => void;
  onNavigate: (stage: MedaaJourneyStage) => void;
  onGenerate: (action: MedaaAiAction, regenerate?: boolean) => void;
  onOpenDraft: (id: string) => void;
};

export function MedaaJourneyStep(props: Props) {
  const { data, disabled, onHorizon } = props;
  const journey = data?.journey;
  if (!journey || journey.stage === "horizon") return <View style={styles.stack}>
    <View style={styles.avatar}><MaterialCommunityIcons name="creation-outline" size={30} color={colors.ai} /></View>
    <Text style={styles.hero}>Let’s map out where{ "\n" }you’re headed.</Text>
    <CoachBubble>What do you want to achieve — and over what timeframe?</CoachBubble>
    <View style={styles.horizons}>
      {([1, 2, 3] as const).map((years) => <Pressable key={years} accessibilityRole="button" accessibilityLabel={`${years} ${years === 1 ? "year" : "years"}`}
        accessibilityState={{ selected: journey?.horizonYears === years, disabled: disabled || Boolean(data?.drafts.length && journey?.horizonYears !== years) }} disabled={disabled || Boolean(data?.drafts.length && journey?.horizonYears !== years)}
        onPress={() => onHorizon(years)} style={[styles.horizon, journey?.horizonYears === years && styles.horizonSelected, disabled && styles.disabled]}>
        <Text style={styles.horizonNumber}>{years}</Text><Text style={styles.horizonLabel}>{years === 1 ? "YEAR" : "YEARS"}</Text>
      </Pressable>)}
    </View>
    <Text style={styles.helper}>Choose a horizon for your bigger direction. You do not pledge RDM for these years: Medaa starts with a {MEDAA_DEFAULT_COMMITMENT_DAYS}-day commitment, editable from 1–{MEDAA_MAX_COMMITMENT_DAYS} days.</Text>
  </View>;
  if (!data) return null;
  if (journey.stage === "long-term") return <LongTermStep {...props} journey={journey} />;
  return <View style={styles.stack}>
    <MedaaLongTermBadge journey={journey} />
    {journey.stage === "short-term" ? <ShortTermStep {...props} data={data} journey={journey} /> : null}
    {journey.stage === "goals" ? <ChosenGoalsStep {...props} data={data} journey={journey} /> : null}
    {journey.stage === "habits" ? <HabitsStep {...props} data={data} journey={journey} /> : null}
    {journey.stage === "plan" ? <PlanStep {...props} data={data} journey={journey} /> : null}
    {journey.stage === "next" ? <NextStep {...props} data={data} /> : null}
  </View>;
}

function CoachBubble({ children }: { children: string }) {
  return <View style={styles.coachBubble}><Text style={styles.coachLabel}>MEDAA AI</Text><Text style={styles.coachText}>{children}</Text></View>;
}

export function MedaaLongTermBadge({ journey }: { journey: MedaaJourney }) {
  return <SurfaceCard style={styles.longTermBadge}>
    <View style={styles.longTermIcon}><MaterialCommunityIcons name="target" size={26} color={colors.ai} /></View>
    <View style={styles.flex}><Text style={styles.tag}>{journey.horizonYears}-YEAR DIRECTION</Text>
      <Text style={styles.longTermTitle}>{journey.longTermGoal}</Text>
      <Text style={styles.small}>Planning context · no RDM locked</Text>
    </View>
  </SurfaceCard>;
}

function LongTermStep({ journey, data, disabled, onLongTerm }: Props & { journey: MedaaJourney }) {
  const [goal, setGoal] = useState(journey.longTermGoal);
  const [category, setCategory] = useState<GoalCategory>(journey.category ?? "Focus");
  const [examples, setExamples] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const directionLocked = Boolean(data?.drafts.length);
  return <View style={styles.stack}>
    <View style={styles.answer}><Text style={styles.answerText}>{journey.horizonYears} {journey.horizonYears === 1 ? "year" : "years"}</Text></View>
    <CoachBubble>{`What’s the one big thing you’d love to be true in ${journey.horizonYears} ${journey.horizonYears === 1 ? "year" : "years"}?`}</CoachBubble>
    <SectionLabel>Your long-term goal</SectionLabel>
    <TextInput accessibilityLabel="Your long-term goal" value={goal} onChangeText={(value) => { setGoal(value); setError(null); }}
      editable={!disabled && !directionLocked} multiline maxLength={300} placeholder="e.g. Build a sustainable business" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.multiline]} />
    {!directionLocked ? <PrimaryButton label={examples ? "Hide examples" : "Not sure? See examples"} icon="lightbulb-outline" color={colors.ai} variant="outline" onPress={() => setExamples(!examples)} /> : null}
    {examples ? <View style={styles.stack}>
      <Text style={styles.helper}>These are starting-point examples, not AI-generated advice.</Text>
      {medaaGoalExamples.map((example) => <SurfaceCard key={example.title} onPress={disabled ? undefined : () => { setGoal(example.title); setCategory(example.category); }}>
        <Text style={styles.itemTitle}>{example.title}</Text><Text style={styles.small}>{example.category}</Text>
      </SurfaceCard>)}
    </View> : null}
    <SectionLabel>Category</SectionLabel>
    <View style={styles.chips}>{goalCategories.map((item) => <Pill key={item} label={item} color={colors.ai} active={category === item} onPress={disabled || directionLocked ? undefined : () => setCategory(item)} />)}</View>
    {directionLocked ? <Text style={styles.helper}>This direction already has saved suggestions. Start a new journey from History if you want a different ambition.</Text> : null}
    <Text style={styles.helper}>This sets your direction. You’ll choose shorter goals, realistic habits, and your own RDM pledges in the next steps.</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <PrimaryButton label="Set this as my long-term goal" color={colors.ai} disabled={disabled} onPress={() => {
      const parsed = medaaLongTermGoalSchema.safeParse(goal);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Describe your long-term goal."); return; }
      onLongTerm(parsed.data, category);
    }} />
  </View>;
}

function ShortTermStep({ data, journey, disabled, aiDisabled, attemptsRemaining, onGenerate, onChooseGoals }: Props & { data: MedaaConversation; journey: MedaaJourney }) {
  const selected = journey.selectedGoalIds;
  const shownIds = new Set([...journey.goalSuggestionIds, ...journey.selectedGoalIds]);
  const suggestions = data.drafts.filter((draft) => draft.content.type === "goal" && shownIds.has(draft.id));
  const selectionLimit = medaaGoalSelectionLimit(selected, data.drafts);
  return <View style={styles.stack}>
    <Text style={styles.heading}>One concrete step forward.</Text>
    <Text style={styles.helper}>What could you realistically achieve in the next two weeks? Choose {selectionLimit === 2 ? "up to two goals" : "an additional goal, up to three in this plan"} that move you toward your long-term direction. Review a 1–{MEDAA_MAX_COMMITMENT_DAYS}-day commitment before setting it.</Text>
    <PrimaryButton label={journey.goalSuggestionsReady ? "Get AI help · show saved suggestions" : "Get AI help — suggest short-term goals"}
      icon="creation-outline" color={colors.ai} disabled={aiDisabled} onPress={() => onGenerate({ kind: "suggest-goals" })} />
    <View style={styles.counterRow}><Text style={styles.tag}>SHORT-TERM GOALS</Text><Text style={styles.counter}>{selected.length} / {selectionLimit} chosen</Text></View>
    {suggestions.map((draft) => {
      const checked = selected.includes(draft.id);
      const fixed = draft.status !== "draft";
      return <Pressable key={draft.id} accessibilityRole="checkbox" accessibilityLabel={draft.content.title}
        accessibilityState={{ checked, disabled: disabled || fixed || (!checked && selected.length >= selectionLimit) }}
        disabled={disabled || fixed || (!checked && selected.length >= selectionLimit)} onPress={() => onChooseGoals(checked ? selected.filter((id) => id !== draft.id) : [...selected, draft.id], false)}
        style={[styles.suggestion, checked && styles.selectedSuggestion]}>
        <MaterialCommunityIcons name={checked ? "checkbox-marked" : "checkbox-blank-outline"} size={25} color={checked ? colors.ai : colors.inkSoft} />
        <View style={styles.flex}><Text style={styles.itemTitle}>{draft.content.title}</Text><Text style={styles.helper}>{draft.content.target}</Text>
          <Text style={styles.small}>{needsShorterReview(draft) ? "Saved earlier · needs shorter review · " : draft.origin === "manual" ? "Your draft · " : "AI suggestion · "}{draft.content.durationDays ? `${draft.content.durationDays} days` : "Choose duration when adding"}{draft.status === "created" ? " · Added" : ""}</Text></View>
      </Pressable>;
    })}
    {journey.goalSuggestionsReady && suggestions.some(needsShorterReview) ? <Text style={styles.helper}>Earlier suggestions stay saved. Use “Show me other suggestions” for a new batch, or open a chosen draft to shorten its target and dates before Set.</Text> : null}
    {journey.goalSuggestionsReady ? <PrimaryButton label="Show me other suggestions" icon="refresh" color={colors.ai} variant="outline" disabled={aiDisabled}
      onPress={() => onGenerate({ kind: "suggest-goals" }, true)} /> : null}
    <AiUsage remaining={attemptsRemaining} />
    <PrimaryButton label={`Continue with ${selected.length} ${selected.length === 1 ? "goal" : "goals"}`} color={colors.growth}
      disabled={disabled || selected.length === 0} onPress={() => onChooseGoals(selected)} />
  </View>;
}

function ChosenGoalsStep({ data, journey, disabled, onOpenDraft, onNavigate }: Props & { data: MedaaConversation; journey: MedaaJourney }) {
  const goals = data.drafts.filter((draft) => journey.selectedGoalIds.includes(draft.id));
  const created = goals.filter((draft) => draft.status === "created").length;
  return <View style={styles.stack}>
    <Text style={styles.heading}>Your short-term goals</Text>
    <Text style={styles.helper}>Add each chosen goal using the familiar goal form. You’ll review dates and the whole-goal RDM pledge before it is created.</Text>
    {goals.map((draft) => <DraftRow key={draft.id} draft={draft} disabled={disabled} onOpen={() => onOpenDraft(draft.id)} />)}
    {goals.length === 0 ? <Text style={styles.helper}>Choose a short-term goal first.</Text> : null}
    <Text style={styles.helper}>{created} of {goals.length} chosen goals created. Suggestions do not count as created commitments.</Text>
    <PrimaryButton label="Continue to supporting habits" color={colors.ai} disabled={disabled || goals.length === 0 || created !== goals.length}
      onPress={() => onNavigate("habits")} />
    <PrimaryButton label="Change selection" color={colors.ai} variant="outline" disabled={disabled} onPress={() => onNavigate("short-term")} />
  </View>;
}

function HabitsStep({ data, journey, disabled, aiDisabled, attemptsRemaining, onGenerate, onOpenDraft, onNavigate }: Props & { data: MedaaConversation; journey: MedaaJourney }) {
  const shownIds = new Set(journey.habitSuggestionIds);
  const habits = data.drafts.filter((draft) => draft.content.type === "habit" && (shownIds.has(draft.id) || draft.status !== "draft" || draft.review));
  const fundedCount = data.drafts.filter((draft) => draft.content.type === "habit" && draft.status !== "draft").length;
  return <View style={styles.stack}>
    <Text style={styles.heading}>Habits that get you there</Text>
    <Text style={styles.helper}>Start with two weeks of small repeatable actions. Pick what fits your routine, then review a 1–{MEDAA_MAX_COMMITMENT_DAYS}-day period, weekdays, and your daily pledge.</Text>
    <PrimaryButton label={journey.habitSuggestionsReady ? "Get AI help · show saved habits" : "Get AI help — suggest supporting habits"} icon="creation-outline" color={colors.ai}
      disabled={aiDisabled || fundedCount >= MEDAA_PLAN_ITEM_LIMIT} onPress={() => onGenerate({ kind: "suggest-habits" })} />
    <View style={styles.counterRow}><Text style={styles.tag}>SUPPORTING HABITS</Text><Text style={styles.counter}>{fundedCount} / 3 set</Text></View>
    {habits.map((draft) => <DraftRow key={draft.id} draft={draft} disabled={disabled || (draft.status === "draft" && fundedCount >= MEDAA_PLAN_ITEM_LIMIT)} onOpen={() => onOpenDraft(draft.id)} />)}
    {journey.habitSuggestionsReady ? <PrimaryButton label="Show me other suggestions" icon="refresh" color={colors.ai} variant="outline" disabled={aiDisabled || fundedCount >= MEDAA_PLAN_ITEM_LIMIT}
      onPress={() => onGenerate({ kind: "suggest-habits" }, true)} /> : null}
    <AiUsage remaining={attemptsRemaining} />
    <PrimaryButton label="Continue to my plan" color={colors.ai} disabled={disabled} onPress={() => onNavigate("plan")} />
  </View>;
}

function PlanStep({ data, journey, disabled, onOpenDraft, onNavigate }: Props & { data: MedaaConversation; journey: MedaaJourney }) {
  const created = data.drafts.filter((draft) => draft.status === "created");
  const initialGoalsCreated = journey.selectedGoalIds.length > 0 && journey.selectedGoalIds.every((id) => created.some((draft) => draft.id === id));
  const saved = data.drafts.filter((draft) => draft.status !== "created" && (draft.review || journey.selectedGoalIds.includes(draft.id) || draft.content.type === "habit"));
  return <View style={styles.stack}>
    <Text style={styles.heading}>Your plan, together.</Text>
    {(["goal", "habit"] as const).map((type) => <View key={type} style={styles.stack}>
      <SectionLabel>{`${type === "goal" ? "Short-term goals" : "Habits"} · ${created.filter((draft) => draft.content.type === type).length}`}</SectionLabel>
      {created.filter((draft) => draft.content.type === type).map((draft) => <DraftRow key={draft.id} draft={draft} disabled={disabled} onOpen={() => onOpenDraft(draft.id)} />)}
      {!created.some((draft) => draft.content.type === type) ? <Text style={styles.helper}>No {type === "goal" ? "goals" : "habits"} created yet.</Text> : null}
    </View>)}
    {saved.length ? <View style={styles.stack}><SectionLabel>Not created yet · saved drafts</SectionLabel>
      {saved.map((draft) => <DraftRow key={draft.id} draft={draft} disabled={disabled} onOpen={() => onOpenDraft(draft.id)} />)}
    </View> : null}
    <Text style={styles.helper}>Only created items above are active commitments. Their usual reflection, progress, tree, and RDM rules apply.</Text>
    <PrimaryButton label="Looks good — what’s next?" color={colors.ai} disabled={disabled || !initialGoalsCreated} onPress={() => onNavigate("next")} />
    {!initialGoalsCreated ? <PrimaryButton label="Continue building my goals" color={colors.ai} variant="outline" disabled={disabled} onPress={() => onNavigate(journey.selectedGoalIds.length ? "goals" : "short-term")} /> : null}
  </View>;
}

function NextStep({ data, disabled, onNavigate }: Props & { data: MedaaConversation }) {
  const goals = data.drafts.filter((draft) => draft.content.type === "goal" && draft.status === "created").length;
  const habits = data.drafts.filter((draft) => draft.content.type === "habit" && draft.status === "created").length;
  const committedGoals = data.drafts.filter((draft) => draft.content.type === "goal" && draft.status !== "draft").length;
  const committedHabits = data.drafts.filter((draft) => draft.content.type === "habit" && draft.status !== "draft").length;
  const canAddHabits = Boolean(data.journey?.selectedGoalIds.length && data.journey.selectedGoalIds.every((id) => data.drafts.some((draft) => draft.id === id && draft.status === "created")));
  return <View style={styles.stack}>
    <SurfaceCard style={styles.finishCard}><MaterialCommunityIcons name="sprout-outline" size={48} color={colors.growth} />
      <Text style={styles.heading}>{goals + habits ? "Your next chapter is taking shape." : "Your direction is saved."}</Text>
      <Text style={styles.helper}>{goals} goals · {habits} habits created. Want to add anything else?</Text>
    </SurfaceCard>
    <NextOption title="Explore more goal suggestions" subtitle={`${goals} / 3 created · choose AI help on the next screen`} icon="flag-outline" color={colors.gold}
      disabled={disabled || committedGoals >= MEDAA_PLAN_ITEM_LIMIT} onPress={() => onNavigate("short-term")} />
    <NextOption title="Explore more habit suggestions" subtitle={`${habits} / 3 created · choose AI help on the next screen`} icon="repeat" color={colors.growth}
      disabled={disabled || committedHabits >= MEDAA_PLAN_ITEM_LIMIT || !canAddHabits} onPress={() => onNavigate("habits")} />
    {!canAddHabits ? <Text style={styles.helper}>Create your chosen short-term goals before adding their supporting habits.</Text> : null}
    <Text style={styles.helper}>Up to 3 goals and 3 habits per plan. These limits do not apply to your whole account.</Text>
    <PrimaryButton label="Back to my plan" color={colors.ai} variant="outline" disabled={disabled} onPress={() => onNavigate("plan")} />
    <PrimaryButton label="Skip for now — Go to Home" color={colors.growth} disabled={disabled} onPress={() => router.replace("/(app)/(tabs)")} />
  </View>;
}

function needsShorterReview(draft: MedaaDraft) {
  return draft.status === "draft" && (draft.content.durationDays ?? 0) > MEDAA_MAX_COMMITMENT_DAYS;
}

function DraftRow({ draft, disabled, onOpen }: { draft: MedaaDraft; disabled: boolean; onOpen: () => void }) {
  const habit = draft.content.type === "habit";
  return <SurfaceCard style={styles.draftRow}>
    <View style={[styles.itemIcon, { backgroundColor: habit ? colors.growthTint : colors.goldTint }]}>
      <MaterialCommunityIcons name={habit ? "repeat" : "flag-outline"} color={habit ? colors.growth : colors.gold} size={22} />
    </View>
    <View style={styles.flex}><Text style={styles.itemTitle}>{draft.content.title}</Text><Text style={styles.small}>{needsShorterReview(draft) ? "Saved earlier · needs shorter review · " : ""}{draft.content.durationDays ? `${draft.content.durationDays} days · ` : ""}{draft.content.category}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${draft.status === "created" ? "Open" : "Add"} ${habit ? "habit" : "goal"}: ${draft.content.title}`}
      disabled={disabled} onPress={onOpen} style={[styles.addButton, draft.status === "created" && styles.addedButton, disabled && styles.disabled]}>
      <Text style={[styles.addText, draft.status === "created" && styles.addedText]}>{draft.status === "created" ? "✓ Added" : draft.status === "setting" ? "Retry Set" : `+ Add ${habit ? "Habit" : "Goal"}`}</Text>
    </Pressable>
  </SurfaceCard>;
}

function AiUsage({ remaining }: { remaining: number }) {
  return <Text style={styles.small}>{remaining} AI requests remaining in this journey. Opening a step does not request AI; your saved suggestions remain available.</Text>;
}

function NextOption({ title, subtitle, icon, color, disabled, onPress }: { title: string; subtitle: string; icon: "flag-outline" | "repeat"; color: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.nextOption, disabled && styles.disabled]}>
    <MaterialCommunityIcons name={icon} size={27} color={color} /><View style={styles.flex}><Text style={styles.itemTitle}>{title}</Text><Text style={styles.helper}>{subtitle}</Text></View><Text style={styles.addText}>View →</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, stack: { gap: 16 }, disabled: { opacity: 0.4 },
  avatar: { width: 62, height: 62, backgroundColor: colors.aiTint, borderRadius: 20, alignItems: "center", justifyContent: "center", marginTop: 12 },
  hero: { fontFamily: fonts.display, fontSize: 31, lineHeight: 40, color: colors.ink }, heading: { fontFamily: fonts.display, fontSize: 24, lineHeight: 32, color: colors.ink },
  coachBubble: { padding: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radii.medium, borderBottomLeftRadius: 4, gap: 7 },
  coachLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.ai, letterSpacing: 1 }, coachText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.ink },
  horizons: { flexDirection: "row", gap: 10 }, horizon: { flex: 1, paddingVertical: 23, borderWidth: 1.5, borderColor: colors.line, borderRadius: radii.medium, backgroundColor: colors.panel, alignItems: "center", gap: 6 },
  horizonSelected: { borderColor: colors.ai, backgroundColor: colors.aiTint }, horizonNumber: { fontFamily: fonts.monoBold, fontSize: 30, color: colors.ai }, horizonLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.inkSoft },
  helper: { fontFamily: fonts.body, fontSize: 13, lineHeight: 21, color: colors.inkSoft }, small: { fontFamily: fonts.body, fontSize: 11, lineHeight: 18, color: colors.inkSoft },
  answer: { alignSelf: "flex-end", backgroundColor: colors.ai, borderRadius: radii.medium, borderBottomRightRadius: 4, paddingHorizontal: 20, paddingVertical: 12 }, answerText: { color: colors.backgroundDeep, fontFamily: fonts.bodyMedium, fontSize: 14 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelRaised, borderRadius: radii.small, padding: 14, fontFamily: fonts.body, fontSize: 14, color: colors.ink, minHeight: 48 }, multiline: { minHeight: 95, textAlignVertical: "top" },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, error: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.danger },
  longTermBadge: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: colors.aiTint }, longTermIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: colors.aiTint, alignItems: "center", justifyContent: "center" },
  tag: { fontFamily: fonts.mono, fontSize: 10, color: colors.ai, letterSpacing: 0.7 }, longTermTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 25, color: colors.ink, marginVertical: 4 },
  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, counter: { fontFamily: fonts.mono, fontSize: 11, color: colors.ai, paddingVertical: 7, paddingHorizontal: 11, borderRadius: radii.pill, backgroundColor: colors.aiTint },
  suggestion: { padding: 15, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, flexDirection: "row", alignItems: "center", gap: 12 }, selectedSuggestion: { borderColor: colors.ai },
  itemTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 21, color: colors.ink }, draftRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  itemIcon: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" }, addButton: { borderWidth: 1, borderColor: colors.growth, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: colors.growthTint },
  addText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.growth }, addedButton: { borderColor: colors.line, backgroundColor: colors.panelRaised }, addedText: { color: colors.inkSoft },
  finishCard: { alignItems: "center", gap: 14, backgroundColor: colors.aiTint }, nextOption: { flexDirection: "row", gap: 13, alignItems: "center", padding: 17, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radii.medium },
});
