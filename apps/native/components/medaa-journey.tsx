import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { MEDAA_DEFAULT_COMMITMENT_DAYS, MEDAA_MAX_COMMITMENT_DAYS, MEDAA_PLAN_ITEM_LIMIT, medaaGoalSelectionLimit, medaaLongTermGoalSchema, type MedaaAiAction, type MedaaConversation, type MedaaDraft, type MedaaJourney, type MedaaJourneyStage } from "@rdm-b2c/api/domain/medaa";
import { goalCategories, type GoalCategory } from "@rdm-b2c/api/domain/rdm";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusedButton, focusedColors as palette } from "@/components/focused-ui";
import { fonts, formatRdm } from "@/lib/theme";
import { trpc } from "@/utils/trpc";

export const medaaStageTitles: Record<MedaaJourneyStage, string> = {
  horizon: "Choose your horizon", "long-term": "Your long-term aim", "short-term": "AI suggestions",
  goals: "Your plan", habits: "Your saved plan", plan: "Your saved plan", next: "What’s next?",
};

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type RefineDirection = Extract<MedaaAiAction, { kind: "refine" }>["direction"];
type JourneyBudget = { baseRdm: number; selectedPledgeRdm: number; remainingBaseRdm: number; maxAffordableDays: number };
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
  onHistory?: () => void;
  onFinish?: () => void;
  onRefine?: (draftId: string, direction: RefineDirection, dailyRate: number) => void;
  budget?: JourneyBudget | null;
};

const categoryIcons: Record<GoalCategory, IconName> = {
  Focus: "book-open-variant-outline", Health: "leaf", Money: "wallet-outline",
  Family: "account-heart-outline", Sustainability: "sprout-outline",
};

/** Mirrors the existing pending-plan pledge calculation without funding anything. */
function draftAllocation(draft: MedaaDraft) {
  const frozenReview = draft.review && (draft.review.fundingMode === "daily" || draft.status === "setting" || draft.status === "created");
  const days = frozenReview ? draft.review!.scheduledDays : Math.max(1, draft.content.durationDays ?? MEDAA_DEFAULT_COMMITMENT_DAYS);
  const dailyRate = frozenReview && draft.review!.fundingMode === "daily" ? draft.review!.pledgeAmount : draft.dailyPledgeRdm ?? 1;
  return {
    days,
    dailyRate,
    total: frozenReview ? draft.review!.totalPledge : days * dailyRate,
    wholeGoal: Boolean(frozenReview && draft.review!.fundingMode !== "daily"),
    estimated: !frozenReview && draft.content.durationDays === null,
  };
}

function pendingPledge(drafts: MedaaDraft[], selectedIds: string[]) {
  return drafts.reduce((total, draft) => total + (selectedIds.includes(draft.id) && draft.content.type === "goal" && draft.status !== "created" ? draftAllocation(draft).total : 0), 0);
}

function StepLayout({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={styles.flex}>
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View>
  </View>;
}

function TextAction({ label, onPress, disabled = false, icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.textAction, disabled && styles.disabled, pressed && styles.pressed]}>
    {icon ? <MaterialCommunityIcons name={icon} size={19} color={palette.link} /> : null}<Text style={styles.link}>{label}</Text><MaterialCommunityIcons name="chevron-right" size={18} color={palette.link} />
  </Pressable>;
}

function Info({ children }: { children: string }) {
  return <View style={styles.info}><MaterialCommunityIcons name="information-outline" size={24} color={palette.muted} /><Text style={[styles.small, styles.flex]}>{children}</Text></View>;
}

export function MedaaJourneyStep(props: Props) {
  const conversationId = props.data?.id ?? "";
  const queriedBudget = useQuery({ ...trpc.medaa.budget.queryOptions({ conversationId }), enabled: Boolean(conversationId) && props.budget === undefined });
  const budget = props.budget === undefined ? queriedBudget.data ?? null : props.budget;
  const journey = props.data?.journey;
  if (!journey || journey.stage === "horizon") return <HorizonStep {...props} />;
  if (!props.data) return null;
  const resolved = { ...props, data: props.data, journey, budget };
  if (journey.stage === "long-term") return <LongTermStep {...resolved} />;
  if (journey.stage === "short-term") return <ShortTermStep {...resolved} />;
  if (journey.stage === "goals") return <ChosenGoalsStep {...resolved} />;
  if (journey.stage === "next") return <NextStep {...resolved} />;
  return <PlanStep {...resolved} />;
}

function HorizonStep({ data, disabled, onHorizon, onHistory }: Props) {
  const [selected, setSelected] = useState<1 | 2 | 3>(data?.journey?.horizonYears ?? 1);
  const explanations = { 1: "Build a meaningful change in the next year.", 2: "Go further. Make bigger progress over two years.", 3: "Think long term. Set a bolder direction for three years." };
  return <StepLayout footer={<>
    <FocusedButton label="Continue" disabled={disabled} onPress={() => onHorizon(selected)} />
    {onHistory ? <View style={styles.historyLink}><TextAction label="Saved journeys" icon="notebook-outline" disabled={disabled} onPress={onHistory} /></View> : null}
  </>}>
    <View style={styles.intro}><Text accessibilityRole="header" style={styles.heading}>What are you working towards?</Text><Text style={styles.body}>Choose a horizon for your bigger picture.</Text></View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Long-term horizon" style={styles.horizons}>
      {([1, 2, 3] as const).map((years) => {
        const locked = disabled || Boolean(data?.drafts.length && data.journey?.horizonYears !== years);
        return <Pressable key={years} accessibilityRole="radio" accessibilityLabel={`${years} ${years === 1 ? "year" : "years"}`} accessibilityState={{ checked: selected === years, disabled: locked }} aria-checked={selected === years} disabled={locked} onPress={() => setSelected(years)} style={({ pressed }) => [styles.horizon, selected === years && styles.horizonSelected, locked && styles.disabled, pressed && styles.pressed]}>
          <MaterialCommunityIcons name={selected === years ? "radiobox-marked" : "radiobox-blank"} size={26} color={selected === years ? palette.link : palette.muted} />
          <View style={styles.flex}><Text style={styles.horizonTitle}>{years} {years === 1 ? "year" : "years"}</Text><Text style={styles.body}>{explanations[years]}</Text></View>
        </Pressable>;
      })}
    </View>
    <Info>{`Your daily goal will be shorter — up to ${MEDAA_MAX_COMMITMENT_DAYS} days, matched to your RDM. Choosing a horizon does not request AI or lock RDM.`}</Info>
  </StepLayout>;
}

export function MedaaLongTermBadge({ journey }: { journey: MedaaJourney }) {
  return <View style={styles.directionBadge}>
    <MaterialCommunityIcons name="bullseye-arrow" size={21} color={palette.link} />
    <View style={styles.flex}><Text style={styles.small}>{journey.horizonYears}-year direction · no RDM locked</Text><Text style={styles.directionText}>{journey.longTermGoal}</Text></View>
  </View>;
}

function LongTermStep({ journey, data, disabled, aiDisabled, attemptsRemaining, onLongTerm, onNavigate, budget }: Props & { journey: MedaaJourney; data: MedaaConversation }) {
  const [goal, setGoal] = useState(journey.longTermGoal);
  const [category, setCategory] = useState<GoalCategory>(journey.category ?? "Focus");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const directionLocked = data.drafts.length > 0;
  const savedSuggestions = directionLocked && journey.goalSuggestionsReady;
  const valid = medaaLongTermGoalSchema.safeParse(goal).success;
  return <StepLayout footer={<>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <FocusedButton label={savedSuggestions ? "View saved suggestions" : "Get AI help"} disabled={disabled || (!savedSuggestions && (aiDisabled || attemptsRemaining <= 0 || !valid))} onPress={() => {
      if (savedSuggestions) { onNavigate("short-term"); return; }
      const parsed = medaaLongTermGoalSchema.safeParse(goal);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Describe a meaningful outcome."); return; }
      onLongTerm(parsed.data, category);
    }} />
    <Text style={styles.centeredSmall}>{savedSuggestions ? "Your saved suggestions stay available without an AI request." : "Medaa suggests focused goals you can realistically fund."}</Text>
  </>}>
    <View style={styles.intro}><Text accessibilityRole="header" style={styles.heading}>Where would you like to be {journey.horizonYears === 1 ? "in a year" : `in ${journey.horizonYears} years`}?</Text><Text style={styles.body}>Tell us what you want to achieve.</Text></View>
    <View style={styles.field}><Text style={styles.label}>Choose a category</Text><View accessibilityRole="radiogroup" accessibilityLabel="Long-term goal category" style={styles.categories}>
      {goalCategories.map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityLabel={item} accessibilityState={{ checked: category === item, disabled: disabled || directionLocked }} aria-checked={category === item} disabled={disabled || directionLocked} onPress={() => setCategory(item)} style={({ pressed }) => [styles.category, category === item && styles.categorySelected, pressed && styles.pressed]}>
        <MaterialCommunityIcons name={categoryIcons[item]} size={21} color={category === item ? palette.link : palette.muted} /><Text style={styles.categoryText}>{item}</Text>
      </Pressable>)}
    </View></View>
    <View style={styles.field}>
      <Text style={styles.label}>Describe your long-term aim</Text>
      <View style={[styles.inputBox, focused && styles.inputFocused]}><TextInput accessibilityLabel="Your long-term goal" editable={!disabled && !directionLocked} multiline maxLength={300} value={goal} onChangeText={(value) => { setGoal(value); setError(null); }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="e.g. Become a confident reader and apply useful ideas in daily life." placeholderTextColor={palette.muted} textAlignVertical="top" style={[styles.input, Platform.OS === "web" && styles.webInput]} /><Text style={styles.counter}>{goal.length}/300</Text></View>
      <Text style={styles.small}>Tell us the outcome, not a daily task. At least 12 characters.</Text>
      {goal.trim().length >= 12 && !valid ? <Text accessibilityRole="alert" style={styles.error}>Describe a meaningful outcome. Keep greetings and API keys out of your plan.</Text> : null}
    </View>
    <View style={styles.budgetNote}><MaterialCommunityIcons name="chart-bar" size={21} color={palette.muted} /><View style={styles.flex}><Text style={styles.budgetTitle}>{journey.horizonYears}-year horizon{budget ? ` · ${formatRdm(budget.baseRdm)} RDM available` : ""}</Text><Text style={styles.small}>Your daily goal will be shorter — up to {MEDAA_MAX_COMMITMENT_DAYS} days, matched to your RDM.</Text></View></View>
    {directionLocked ? <Text style={styles.small}>This direction has saved suggestions. Start a new saved journey for a different ambition; your existing plan stays safe.</Text> : null}
  </StepLayout>;
}

function ShortTermStep({ data, journey, disabled, aiDisabled, attemptsRemaining, onGenerate, onChooseGoals, onOpenDraft, budget }: Props & { data: MedaaConversation; journey: MedaaJourney }) {
  const selected = journey.selectedGoalIds;
  const shownIds = new Set([...journey.goalSuggestionIds, ...selected]);
  const suggestions = data.drafts.filter((draft) => draft.content.type === "goal" && shownIds.has(draft.id));
  const selectionLimit = medaaGoalSelectionLimit(selected, data.drafts);
  const planned = pendingPledge(data.drafts, selected);
  const remaining = budget ? budget.baseRdm - planned : null;
  const budgetFits = remaining !== null && remaining >= 0;
  return <StepLayout footer={<>
    <View style={styles.selectionSummary}><Text style={styles.summaryText}>Selected <Text style={styles.summaryAccent}>{selected.length}</Text> · <Text style={styles.summaryAccent}>{formatRdm(planned)} RDM</Text> · <Text style={[styles.summaryAccent, remaining !== null && remaining < 0 && styles.errorColor]}>{remaining === null ? "Checking balance…" : `${formatRdm(remaining)} RDM left`}</Text></Text></View>
    <FocusedButton label="Review selection" disabled={disabled || selected.length === 0 || !budgetFits} onPress={() => onChooseGoals(selected)} />
  </>}>
    <View style={styles.intro}><Text accessibilityRole="header" style={styles.heading}>Start smaller. Build steady.</Text><Text style={styles.body}>Choose up to {MEDAA_PLAN_ITEM_LIMIT} goals{budget ? ` within your ${formatRdm(budget.baseRdm)} RDM balance` : " within your Base balance"}.</Text></View>
    {suggestions.length === 0 ? <View style={styles.emptyCard}><MaterialCommunityIcons name="creation" size={28} color={palette.link} /><Text style={styles.itemTitle}>Find a practical starting point</Text><Text style={styles.body}>Medaa turns your long-term direction into a smaller goal you can fund. No RDM is locked by a suggestion.</Text>
      <FocusedButton label={journey.goalSuggestionsReady ? "Show other suggestions" : "Get AI help"} disabled={disabled || aiDisabled || attemptsRemaining <= 0} onPress={() => onGenerate({ kind: "suggest-goals" }, journey.goalSuggestionsReady)} />
    </View> : suggestions.map((draft) => {
      const checked = selected.includes(draft.id);
      const fixed = draft.status !== "draft";
      const allocation = draftAllocation(draft);
      const outOfBudget = !checked && (!budget || planned + allocation.total > budget.baseRdm);
      const atLimit = !checked && selected.length >= selectionLimit;
      const locked = disabled || fixed || outOfBudget || atLimit;
      return <View key={draft.id} style={[styles.suggestionCard, checked && styles.suggestionSelected]}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`${draft.content.title}, ${allocation.days} days, ${formatRdm(allocation.total)} RDM${outOfBudget ? ", does not fit remaining Base RDM" : ""}`} accessibilityState={{ checked, disabled: locked }} aria-checked={checked} disabled={locked} onPress={() => onChooseGoals(checked ? selected.filter((id) => id !== draft.id) : [...selected, draft.id], false)} style={({ pressed }) => [styles.suggestionPressable, pressed && styles.pressed]}>
          <View style={styles.suggestionHeader}><MaterialCommunityIcons name={categoryIcons[draft.content.category]} size={26} color={palette.text} /><View style={styles.flex}><Text style={styles.itemTitle}>{draft.content.title}</Text><Text style={styles.small}>{draft.content.target}</Text></View><MaterialCommunityIcons name={checked ? "checkbox-marked" : "checkbox-blank-outline"} size={26} color={checked ? palette.link : palette.muted} /></View>
          <AllocationLine draft={draft} />
        </Pressable>
        {draft.status === "created" ? <TextAction label="Open created goal" disabled={disabled} onPress={() => onOpenDraft(draft.id)} /> : draft.status === "setting" ? <TextAction label="Recover submitted goal" disabled={disabled} onPress={() => onOpenDraft(draft.id)} /> : checked && (remaining !== null && remaining < 0 || needsShorterReview(draft)) ? <View style={styles.repair}><Text style={styles.error}>This saved goal needs a smaller pledge or shorter dates.</Text><TextAction label="Review goal & adjust budget" disabled={disabled} onPress={() => onOpenDraft(draft.id)} /></View> : null}
        {outOfBudget && !checked ? <Text style={styles.cardHint}>{budget ? planned > 0 ? "Doesn't fit alongside your selected goals. Deselect one to make room." : "This goal exceeds your Base RDM. Ask for smaller suggestions." : "Checking Base RDM before selection…"}</Text> : atLimit ? <Text style={styles.cardHint}>Deselect a goal to choose this one.</Text> : null}
      </View>;
    })}
    {suggestions.some((draft) => draft.status === "created") ? <Text style={styles.small}>Created goals are already funded and do not use the remaining Base budget again.</Text> : null}
    {remaining !== null && remaining < 0 ? <Text accessibilityRole="alert" style={styles.error}>Your saved selection is over budget. Deselect a draft or open it above to adjust its dates and pledge. Nothing new has been charged.</Text> : null}
    {journey.goalSuggestionsReady && suggestions.length > 0 ? <TextAction label="Show other suggestions" icon="refresh" disabled={disabled || aiDisabled || attemptsRemaining <= 0} onPress={() => onGenerate({ kind: "suggest-goals" }, true)} /> : null}
    <AiUsage remaining={attemptsRemaining} />
  </StepLayout>;
}

function AllocationLine({ draft }: { draft: MedaaDraft }) {
  const allocation = draftAllocation(draft);
  return <View style={styles.allocationLine}>
    <View style={styles.allocationItem}><MaterialCommunityIcons name="calendar-month-outline" size={20} color={palette.muted} /><Text style={styles.allocationText}>{allocation.days} days{allocation.estimated ? " (estimate)" : ""}</Text></View>
    <View style={styles.allocationItem}><MaterialCommunityIcons name="database-outline" size={18} color={palette.muted} /><Text style={styles.allocationText}>{allocation.wholeGoal ? "Whole-goal pledge" : `${formatRdm(allocation.dailyRate)} RDM per day`}</Text></View>
    <View style={styles.allocationItem}><MaterialCommunityIcons name="sigma" size={17} color={palette.muted} /><Text style={styles.allocationText}>{formatRdm(allocation.total)} RDM total</Text></View>
  </View>;
}

function ChosenGoalsStep({ data, journey, disabled, aiDisabled, attemptsRemaining, onOpenDraft, onNavigate, onRefine, budget }: Props & { data: MedaaConversation; journey: MedaaJourney }) {
  const goals = data.drafts.filter((draft) => journey.selectedGoalIds.includes(draft.id));
  const [selectedId, setSelectedId] = useState(goals[0]?.id ?? "");
  const draft = goals.find((item) => item.id === selectedId) ?? goals[0];
  const allocation = draft ? draftAllocation(draft) : null;
  const overBudget = budget ? pendingPledge(data.drafts, journey.selectedGoalIds) > budget.baseRdm : false;
  return <StepLayout footer={<>
    {draft ? <FocusedButton label={draft.status === "created" ? "Open created goal" : draft.status === "setting" ? "Recover submitted goal" : "Review dates & pledge"} disabled={disabled} onPress={() => onOpenDraft(draft.id)} /> : null}
    <TextAction label="Choose another suggestion" disabled={disabled} onPress={() => onNavigate("short-term")} />
    <Info>Nothing is created until you confirm your pledge.</Info>
  </>}>
    <View style={styles.intro}><Text accessibilityRole="header" style={styles.heading}>Your plan</Text><Text style={styles.body}>Review your selected {goals.length === 1 ? "goal" : "goals"} and fine-tune.</Text></View>
    {goals.length > 1 ? <View accessibilityRole="tablist" style={styles.goalTabs}>{goals.map((item, index) => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={`Goal ${index + 1}: ${item.content.title}`} accessibilityState={{ selected: draft?.id === item.id, disabled }} aria-selected={draft?.id === item.id} disabled={disabled} onPress={() => setSelectedId(item.id)} style={[styles.goalTab, draft?.id === item.id && styles.goalTabSelected]}><Text style={styles.goalTabText}>Goal {index + 1}{item.status === "created" ? " ✓" : ""}</Text></Pressable>)}</View> : null}
    {draft && allocation ? <View style={styles.planCard}>
      <View style={styles.suggestionHeader}><MaterialCommunityIcons name={categoryIcons[draft.content.category]} size={27} color={palette.text} /><View style={styles.flex}><Text style={styles.itemTitle}>{draft.content.title}</Text><Text style={styles.small}>{draft.content.target}</Text></View></View>
      <View style={styles.planAllocation}><View style={styles.allocationItem}><MaterialCommunityIcons name="calendar-month-outline" size={22} color={palette.muted} /><Text style={styles.body}>{allocation.days} days</Text></View><View style={styles.allocationItem}><MaterialCommunityIcons name="database-outline" size={21} color={palette.muted} /><Text style={styles.body}>{formatRdm(allocation.total)} RDM pledge</Text></View></View>
      <Text style={styles.label}>Plan roadmap</Text>
      {draft.content.steps?.length ? <View style={styles.roadmap}>{draft.content.steps.map((step, index, steps) => <View key={`${draft.id}:${index}`} style={styles.roadmapRow}><View style={styles.rail}>{index < steps.length - 1 ? <View style={styles.railLine} /> : null}<View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View></View><Text style={[styles.body, styles.roadmapText]}>{step}</Text></View>)}</View> : <Text style={styles.small}>No roadmap was saved for this earlier draft. Review its target and dates before creating it.</Text>}
      {draft.content.why ? <Text style={styles.small}>{draft.content.why}</Text> : null}
      {draft.status !== "draft" ? <Text style={styles.savedStatus}>{draft.status === "created" ? "Created · your commitment is already funded" : "Submitted · recover the original commitment before continuing"}</Text> : null}
    </View> : <Text style={styles.body}>Choose a saved suggestion to build your plan.</Text>}
    {draft?.status === "draft" ? <View style={styles.adjustments}>
      <Text style={styles.label}>Need adjustments?</Text>
      <View style={styles.refineRow}>{([
        { label: "Simpler", direction: "simpler", icon: "tune-variant" },
        { label: "More specific", direction: "more-specific", icon: "bullseye-arrow" },
        { label: "Fit my budget", direction: "less-time", icon: "wallet-outline" },
      ] as const).map((option) => <Pressable key={option.direction} accessibilityRole="button" accessibilityLabel={`${option.label}: ${draft.content.title}`} accessibilityState={{ disabled: disabled || aiDisabled || attemptsRemaining <= 0 || !onRefine }} disabled={disabled || aiDisabled || attemptsRemaining <= 0 || !onRefine} onPress={() => onRefine?.(draft.id, option.direction, allocation?.dailyRate ?? 1)} style={({ pressed }) => [styles.refineButton, (disabled || aiDisabled || attemptsRemaining <= 0 || !onRefine) && styles.disabled, pressed && styles.pressed]}><MaterialCommunityIcons name={option.icon} size={20} color={palette.muted} /><Text style={styles.refineLabel}>{option.label}</Text></Pressable>)}</View>
      <AiUsage remaining={attemptsRemaining} />
    </View> : null}
    {overBudget ? <Text accessibilityRole="alert" style={styles.error}>Your selected plan exceeds your current Base balance. Review dates & pledge to reduce it; opening the review does not spend RDM or use AI.</Text> : null}
    <TextAction label="View all saved goals" disabled={disabled} onPress={() => onNavigate("plan")} />
  </StepLayout>;
}

function PlanStep({ data, journey, disabled, onOpenDraft, onNavigate }: Props & { data: MedaaConversation; journey: MedaaJourney }) {
  const created = data.drafts.filter((draft) => draft.status === "created");
  const initialGoalsCreated = journey.selectedGoalIds.length > 0 && journey.selectedGoalIds.every((id) => created.some((draft) => draft.id === id));
  const saved = data.drafts.filter((draft) => draft.status === "setting" || (draft.status === "draft" && draft.content.type === "goal" && (draft.review || journey.selectedGoalIds.includes(draft.id))));
  return <StepLayout footer={<>
    <FocusedButton label={initialGoalsCreated ? "Continue" : "Continue building my goals"} disabled={disabled} onPress={() => onNavigate(initialGoalsCreated ? "next" : journey.selectedGoalIds.length ? "goals" : "short-term")} />
  </>}>
    <View style={styles.intro}><Text accessibilityRole="header" style={styles.heading}>Your plan, together.</Text><Text style={styles.body}>Created goals are funded. Drafts are only saved ideas.</Text></View>
    <Text style={styles.label}>Created goals</Text>
    {created.filter((draft) => draft.content.type === "goal").map((draft) => <DraftRow key={draft.id} draft={draft} disabled={disabled} onOpen={() => onOpenDraft(draft.id)} />)}
    {!created.some((draft) => draft.content.type === "goal") ? <Text style={styles.small}>No goals created yet.</Text> : null}
    {created.some((draft) => draft.content.type === "habit") ? <><Text style={styles.label}>Previously created habits</Text>{created.filter((draft) => draft.content.type === "habit").map((draft) => <DraftRow key={draft.id} draft={draft} disabled={disabled} onOpen={() => onOpenDraft(draft.id)} />)}</> : null}
    {saved.length > 0 ? <><Text style={styles.label}>Not created yet · saved drafts</Text>{saved.map((draft) => <DraftRow key={draft.id} draft={draft} disabled={disabled} onOpen={() => onOpenDraft(draft.id)} />)}</> : null}
    <Info>Open a created goal for daily reflection and progress tracking. No daily AI conversation is needed. Previously created items keep their original rules.</Info>
  </StepLayout>;
}

function NextStep({ data, disabled, onNavigate, onFinish }: Props & { data: MedaaConversation }) {
  const goals = data.drafts.filter((draft) => draft.content.type === "goal" && draft.status === "created").length;
  const committed = data.drafts.filter((draft) => draft.content.type === "goal" && draft.status !== "draft").length;
  const finish = () => onFinish ? onFinish() : router.replace("/(app)/(tabs)/goals");
  return <StepLayout footer={<><FocusedButton label="Go to my goals" disabled={disabled} onPress={finish} /><TextAction label="Back to my plan" disabled={disabled} onPress={() => onNavigate("plan")} /></>}>
    <View style={styles.finishCard}><MaterialCommunityIcons name="check-circle-outline" size={46} color={palette.green} /><Text style={styles.heading}>Your next chapter is taking shape.</Text><Text style={styles.body}>{goals} {goals === 1 ? "goal" : "goals"} created. Your next step is a quick daily reflection in Goals.</Text></View>
    <TextAction label="Explore more goal suggestions" icon="creation" disabled={disabled || committed >= MEDAA_PLAN_ITEM_LIMIT} onPress={() => onNavigate("short-term")} />
    <Info>{`Up to ${MEDAA_PLAN_ITEM_LIMIT} goals per plan, with a combined pledge that fits your Base Purse. Suggestions never create a habit.`}</Info>
  </StepLayout>;
}

function needsShorterReview(draft: MedaaDraft) {
  return draft.status === "draft" && (draft.content.durationDays ?? 0) > MEDAA_MAX_COMMITMENT_DAYS;
}

function DraftRow({ draft, disabled, onOpen }: { draft: MedaaDraft; disabled: boolean; onOpen: () => void }) {
  const habit = draft.content.type === "habit";
  return <Pressable accessibilityRole="button" accessibilityLabel={`${draft.status === "created" ? "Open" : draft.status === "setting" ? "Recover" : "Review"} ${habit ? "previous habit" : "goal"}: ${draft.content.title}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onOpen} style={({ pressed }) => [styles.savedDraft, disabled && styles.disabled, pressed && styles.pressed]}>
    <MaterialCommunityIcons name={habit ? "leaf" : "bullseye-arrow"} size={24} color={habit ? palette.green : palette.gold} /><View style={styles.flex}><Text style={styles.itemTitle}>{draft.content.title}</Text><Text style={styles.small}>{draft.status === "created" ? "Created · Open" : draft.status === "setting" ? "Submitted · Recover" : "Saved draft · Review"}{needsShorterReview(draft) ? " · Needs shorter dates" : ""}</Text></View><MaterialCommunityIcons name="chevron-right" size={19} color={palette.muted} />
  </Pressable>;
}

function AiUsage({ remaining }: { remaining: number }) {
  return <Text style={styles.small}>{Math.max(0, remaining)} AI requests left in this journey. New suggestions and adjustments use a request; reviewing saved drafts does not.</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, content: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 16, gap: 14 }, footer: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: 14, gap: 10 },
  intro: { gap: 5, marginBottom: 2 }, heading: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 27 }, body: { color: palette.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 }, small: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 }, label: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  horizons: { gap: 9, marginTop: 3 }, horizon: { minHeight: 74, flexDirection: "row", alignItems: "flex-start", gap: 13, padding: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: palette.panel }, horizonSelected: { borderColor: "#364D60" }, horizonTitle: { color: palette.text, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, marginBottom: 2 },
  info: { flexDirection: "row", gap: 13, alignItems: "flex-start", paddingHorizontal: 3, paddingVertical: 4 }, historyLink: { borderTopWidth: 1, borderColor: palette.line, paddingTop: 8, marginTop: 6 }, textAction: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, link: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  field: { gap: 7 }, categories: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, category: { minHeight: 38, flexGrow: 1, flexBasis: "30%", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderWidth: 1, borderColor: palette.line, borderRadius: 8 }, categorySelected: { borderColor: palette.link, backgroundColor: "#1D2E3B" }, categoryText: { color: palette.text, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, flexShrink: 1 },
  inputBox: { minHeight: 130, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.line, borderRadius: 8, padding: 11, gap: 7 }, inputFocused: { borderColor: palette.link }, input: { minHeight: 88, color: palette.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, padding: 0 }, webInput: { outlineStyle: "solid", outlineWidth: 0, outlineColor: "transparent" }, counter: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, textAlign: "right" },
  budgetNote: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 8, padding: 12 }, budgetTitle: { color: palette.link, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 19, marginBottom: 2 }, centeredSmall: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, textAlign: "center" },
  directionBadge: { flexDirection: "row", gap: 11, padding: 11, borderWidth: 1, borderColor: palette.line, borderRadius: 8 }, directionText: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20, marginTop: 3 },
  suggestionCard: { borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: palette.panel, overflow: "hidden" }, suggestionSelected: { borderColor: palette.link }, suggestionPressable: { paddingHorizontal: 13, paddingTop: 12, paddingBottom: 10, gap: 10 }, suggestionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 13 }, itemTitle: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, marginBottom: 3 },
  allocationLine: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 5, alignItems: "center", borderTopWidth: 1, borderColor: palette.line, paddingTop: 9 }, allocationItem: { flexDirection: "row", alignItems: "center", gap: 5 }, allocationText: { color: palette.muted, fontFamily: fonts.body, fontSize: 10, lineHeight: 15 }, cardHint: { color: palette.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, paddingHorizontal: 13, paddingBottom: 10 }, repair: { paddingHorizontal: 13, paddingBottom: 7 },
  selectionSummary: { paddingHorizontal: 8, paddingVertical: 11, borderWidth: 1, borderColor: palette.line, borderRadius: 8 }, summaryText: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 12.5, lineHeight: 19, textAlign: "center" }, summaryAccent: { color: palette.link }, emptyCard: { padding: 14, gap: 10, borderWidth: 1, borderColor: palette.line, borderRadius: 9 },
  planCard: { padding: 13, borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: palette.panel, gap: 12 }, planAllocation: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10, borderBottomWidth: 1, borderColor: palette.line, paddingBottom: 12 }, roadmap: { gap: 0 }, roadmapRow: { flexDirection: "row", gap: 12, minHeight: 50 }, rail: { width: 28, alignItems: "center" }, railLine: { position: "absolute", top: 26, bottom: 0, width: 1, backgroundColor: "#36516A" }, stepNumber: { height: 27, width: 27, borderRadius: 14, backgroundColor: palette.link, alignItems: "center", justifyContent: "center" }, stepNumberText: { color: palette.onGreen, fontFamily: fonts.bodyBold, fontSize: 12 }, roadmapText: { flex: 1, paddingTop: 2, paddingBottom: 12 },
  adjustments: { gap: 7 }, refineRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" }, refineButton: { minHeight: 40, flex: 1, minWidth: 90, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6, borderWidth: 1, borderColor: palette.line, borderRadius: 8 }, refineLabel: { color: palette.muted, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, flexShrink: 1 },
  goalTabs: { flexDirection: "row", gap: 7, flexWrap: "wrap" }, goalTab: { minHeight: 38, paddingHorizontal: 15, justifyContent: "center", borderWidth: 1, borderColor: palette.line, borderRadius: 8 }, goalTabSelected: { borderColor: palette.link, backgroundColor: "#1D2E3B" }, goalTabText: { color: palette.text, fontFamily: fonts.bodyMedium, fontSize: 12.5 }, savedStatus: { color: palette.green, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  savedDraft: { flexDirection: "row", gap: 11, alignItems: "center", minHeight: 62, padding: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 9 }, finishCard: { gap: 13, paddingVertical: 14 }, error: { color: palette.coral, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 }, errorColor: { color: palette.coral }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.76 },
});
