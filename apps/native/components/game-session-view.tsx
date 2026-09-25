import type { GameId, GamePrompt, gameCatalog } from "@rdm-b2c/api/domain/rdm";
import { FOCUS_FLOW_CELL_COUNT } from "@rdm-b2c/api/domain/game-rules";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { FocusedButton, focusedColors as c, focusedStyles as f } from "@/components/focused-ui";
import { GameArt, GameIcon, GamesFrame, GamesNote, GamesOutlineButton, GamesProgress, gameBlue, gamesStyles as g, type GameIconName } from "@/components/games-ui";
import { fonts } from "@/lib/theme";

export type GameStatus = "idle" | "starting" | "running" | "saving" | "retry" | "complete";
export type GameResult = { actionCount: number; bestScore: number; matchedCount: number; moves: number; reward: number; score: number };
type Game = (typeof gameCatalog)[number];
type Props = {
  game: Game; status: GameStatus; secondsLeft: number; score: number; actionCount: number; moves: number;
  prompt: GamePrompt | null; memoryBoard: string[]; matchedIndexes: number[]; flippedIndexes: number[];
  selectedOption: string | null; wordInput: string; feedback: string | null; targetIndex: number;
  gratitudeTaps: string[]; result: GameResult | null; error: string | null; isBusy: boolean; pendingAction: boolean; retryDisabled: boolean;
  begin: () => void; finish: () => void; back: () => void; leaderboard: () => void;
  retry: () => void; selectOption: (value: string) => void; submitAnswer: () => void; setWord: (value: string) => void;
  submitWord: () => void; tapFocus: () => void; tapGratitude: (value: string) => void; breathe: () => void; flip: (index: number) => void;
};
const headlines: Record<GameId, string> = {
  "memory-match": "A little focus. Eight pairs.", "aptitude-bliss": "A fresh challenge for your mind.",
  "focus-flow": "Stay with the target.", "unscramble-word": "Find the word.",
  "gratitude-tap": "Notice what’s good.", "box-breathing": "Follow the pace gently.", "sort-sprint": "Where does this belong?",
};
const steps: Record<GameId, [string, string][]> = {
  "memory-match": [["Flip any two cards.", "Turn over any two cards to see what’s behind them."], ["Remember their positions.", "Try to remember where each symbol is on the board."], ["Match all eight pairs.", "Find all matching pairs before time runs out."]],
  "aptitude-bliss": [["Read the question.", "Take a moment to think it through."], ["Choose your answer.", "Select one option, then submit when ready."], ["Keep moving.", "Work through ten questions before time runs out."]],
  "focus-flow": [["Find the blue target.", "Look for the target in the grid."], ["Tap it once.", "A saved hit moves it to another square."], ["Stay with it.", "Aim for steady attention, not hurried taps."]],
  "unscramble-word": [["Look at the letters.", "Rearrange them to find one word."], ["Type your answer.", "Submit your word to check it."], ["Try the next word.", "Correct answers bring a fresh set of letters."]],
  "gratitude-tap": [["Notice something good.", "Choose a thought that feels true today."], ["Tap and pause.", "Take a quiet breath with each moment."], ["Appreciate your day.", "Each thought can be selected once in this session."]],
  "box-breathing": [["Follow the gentle pace.", "Inhale, hold, exhale, hold — four seconds each."], ["Complete a full cycle.", "Record it after all sixteen seconds."], ["Keep it comfortable.", "Breathe naturally or stop if you feel uncomfortable."]],
  "sort-sprint": [["Look at the item.", "Consider which category fits."], ["Choose a category.", "Select your answer, then submit it."], ["Try the next item.", "Keep sorting until your short session ends."]],
};
const memoryIcons: Record<string, [GameIconName, string]> = { "🌿": ["leaf", "leaf"], "⭐": ["star", "star"], "🍎": ["apple", "apple"], "⚽": ["soccer", "ball"], "🚀": ["rocket-launch", "rocket"], "💎": ["diamond", "diamond"], "🎵": ["music-note", "music"], "🎈": ["balloon", "balloon"] };
const gratitude: [string, string, GameIconName][] = [["family", "Family", "account-group-outline"], ["friends", "Friends", "account-multiple-outline"], ["home", "A place to rest", "bed-outline"], ["health", "Your wellbeing", "heart-outline"], ["learning", "Time to learn", "book-open-page-variant-outline"], ["nature", "A moment in nature", "leaf"]];
const sortIcons: Record<string, GameIconName> = { Apple: "apple", Dolphin: "dolphin", Hammer: "hammer", Rose: "flower", Bicycle: "bicycle", Jacket: "tshirt-crew", Food: "food-apple-outline", Animal: "paw-outline", Object: "cube-outline", Plant: "flower-outline", Tool: "wrench-outline", Place: "map-marker-outline", Vehicle: "car-outline", Clothing: "tshirt-crew-outline" };
const phases = ["Inhale", "Hold", "Exhale", "Hold"];
function Stat({ value, label, clock = false }: { value: string; label: string; clock?: boolean }) {
  return <View style={[s.stat, clock && { flex: 1.45 }]}>{clock ? <GameIcon name="clock-outline" size={23} color={gameBlue} /> : null}<View><Text style={[s.statValue, clock && s.clockValue]}>{value}</Text><Text style={s.small}>{label}</Text></View></View>;
}
export function GameSessionView(p: Props) {
  const id = p.game.id;
  const duration = p.game.durationSeconds;
  const durationLabel = duration === 90 ? "90 seconds" : `${duration / 60} minute${duration === 60 ? "" : "s"}`;
  const timer = `${Math.floor(p.secondsLeft / 60).toString().padStart(2, "0")}:${(p.secondsLeft % 60).toString().padStart(2, "0")}`;
  const elapsed = Math.max(0, duration - p.secondsLeft);
  const phaseIndex = Math.floor(elapsed / 4) % 4;
  const pairs = p.matchedIndexes.length / 2;
  const wrong = p.feedback?.startsWith("Not quite");
  if (p.status === "idle" || p.status === "starting") return <GamesFrame title={p.game.title} onBack={p.back} footer={<>
      <GamesNote>One session per game daily. Leaving doesn’t pause the timer. Reopening resumes the same session.</GamesNote>{p.error ? <Text accessibilityRole="alert" style={s.error}>{p.error}</Text> : null}<FocusedButton label="Start game" loading={p.status === "starting"} onPress={p.begin} />
    </>}>
    <GameArt id={id} intro large />
    <Text style={[f.title, s.introTitle]}>{headlines[id]}</Text>
    <View style={s.introMeta}><GameIcon name="clock-outline" color={gameBlue} /><Text style={g.muted}>{durationLabel}</Text><View style={s.divider} /><GameIcon name={id === "memory-match" ? "layers-triple-outline" : "flag-checkered"} /><Text style={g.muted}>{id === "memory-match" ? "8 pairs" : id === "aptitude-bliss" ? "10 questions" : "One daily reset"}</Text></View>
    <View style={s.instructions}>{steps[id].map(([title, body], index) => <View key={title} style={s.step}><View style={s.stepNumber}><Text style={g.label}>{index + 1}</Text></View><View style={{ flex: 1, gap: 3 }}><Text style={g.label}>{title}</Text><Text style={g.muted}>{body}</Text></View></View>)}</View>
    <GamesNote icon="lightbulb-outline" color={c.gold}>Tip: {p.game.proTip}</GamesNote>
  </GamesFrame>;

  if (p.status === "complete" && p.result) {
    const r = p.result;
    return <GamesFrame title="Games" onBack={p.back} footer={<><FocusedButton label="Back to games" onPress={p.back} /><GamesOutlineButton label="View leaderboard" icon="chart-bar" onPress={p.leaderboard} /></>}>
      <GameArt id={id} large />
      <View style={s.center}><Text style={[f.title, s.introTitle]}>A focused little break.</Text><Text style={f.body}>{p.game.title} complete.</Text></View>
      <View style={[g.card, g.row]}><View style={{ flex: 1 }}><Text style={g.muted}>Score</Text><Text style={s.resultScore}>{r.score}</Text></View><View style={s.divider} /><View style={{ flex: 1.4, gap: 10 }}>
        <Text style={g.label}>{id === "memory-match" ? `${r.matchedCount} / 8 pairs` : id === "aptitude-bliss" ? `${Math.floor(r.score / 20)} / 10 correct` : `${r.actionCount} ${id === "unscramble-word" ? "words" : id === "box-breathing" ? "cycles" : id === "gratitude-tap" ? "moments" : "actions"}`}</Text>
        <Text style={g.muted}>{id === "memory-match" ? `${r.moves} move${r.moves === 1 ? "" : "s"}` : `Personal best: ${r.bestScore}`}</Text><Text style={g.muted}>Up to {durationLabel}</Text>
      </View></View>
      <View style={[g.card, g.row, { backgroundColor: "#27271F", borderColor: "#4D452B" }]}><GameIcon name="database" color={c.gold} size={38} /><View><Text style={s.reward}>+{r.reward} RDM</Text><Text style={g.muted}>{r.reward > 0 ? "Added to Reward Purse" : "No reward earned this session"}</Text></View></View>
      <View style={[g.card, g.row, { backgroundColor: "#19332D" }]}><GameIcon name="check-circle" color={c.green} size={30} /><View style={{ flex: 1 }}><Text style={g.label}>Session saved</Text><Text style={s.small}>{r.reward > 0 ? "Your daily game reward is in your wallet." : "Your result is saved. No RDM was added."}</Text></View></View>
      <GamesNote icon="calendar-check-outline" color={gameBlue}>{p.game.title} is complete for today. A new daily session opens at 00:00 UTC.</GamesNote>

    </GamesFrame>;
  }

  return <GamesFrame title={p.game.title} onBack={p.back} footer={<>
      {p.pendingAction ? <GamesOutlineButton label="Retry last move" onPress={p.retry} disabled={p.retryDisabled} /> : null}
      {(id === "aptitude-bliss" || id === "sort-sprint") && p.prompt ? <FocusedButton label="Submit answer" onPress={p.submitAnswer} disabled={p.isBusy || !p.selectedOption} /> : null}
      {p.status === "retry" ? <FocusedButton label="Retry saving result" onPress={p.finish} /> : <GamesOutlineButton label={p.status === "saving" ? "Saving session…" : "Finish now & lock game"} disabled={p.status === "saving" || p.pendingAction} onPress={p.finish} />}
</>}>
    <View style={s.stats}><Stat clock value={timer} label="Time remaining" />{id === "memory-match" ? <><Stat value={`${pairs} / 8`} label="pairs matched" /><Stat value={String(p.moves)} label="moves" /></> : id === "aptitude-bliss" && p.prompt?.kind === "aptitude" ? <><Stat value={`${p.prompt.questionNumber} of 10`} label="Question" /><Stat value={`${Math.floor(p.score / 20)} of 10`} label="correct" /></> : <Stat value={id === "unscramble-word" || id === "gratitude-tap" ? String(p.actionCount) : id === "box-breathing" ? `${p.actionCount} of 3` : String(p.score)} label={id === "unscramble-word" ? "Words" : id === "gratitude-tap" ? "Noticed" : id === "box-breathing" ? "Cycles" : "Score"} />}{id === "sort-sprint" && p.prompt?.kind === "sort" ? <Stat value={String(p.prompt.roundNumber)} label="Round" /> : null}</View>

    {id === "memory-match" ? <>
      <View style={s.memoryGrid}>{p.memoryBoard.map((symbol, index) => {
        const matched = p.matchedIndexes.includes(index);
        const visible = matched || p.flippedIndexes.includes(index);
        const [icon, name] = memoryIcons[symbol] ?? ["help", "symbol"];
        return <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Memory card ${index + 1}${visible ? `, ${name}` : ", face down"}${matched ? ", matched" : ""}`} accessibilityState={{ disabled: matched || p.isBusy }} disabled={matched || p.isBusy} onPress={() => p.flip(index)} style={[s.memoryCard, visible && s.memoryVisible, matched && s.memoryMatched]}><GameIcon name={visible ? icon : "help"} size={38} color={matched ? "#77E7AF" : visible ? "#E1F3FF" : "#8B96A7"} /></Pressable>;
      })}</View>
      <Text style={s.centerNote}>Remember the positions.</Text><View style={{ gap: 8, marginTop: 22 }}><Text style={g.label}>{pairs} of 8 pairs</Text><GamesProgress value={pairs / 8} /></View>
    </> : null}

    {id === "aptitude-bliss" && p.prompt?.kind === "aptitude" ? <>
      <View style={s.segments}>{Array.from({ length: 10 }, (_, i) => <View key={i} style={[s.segment, i < p.actionCount && { backgroundColor: c.green }]} />)}</View>
      <Text style={s.question}>{p.prompt.question}</Text>
      <View style={{ gap: 10 }}>{p.prompt.options.map((option) => <Pressable key={option.label} accessibilityRole="radio" accessibilityState={{ checked: p.selectedOption === option.label, disabled: p.isBusy }} disabled={p.isBusy} onPress={() => p.selectOption(option.label)} style={[s.option, p.selectedOption === option.label && s.selected, wrong && p.selectedOption === option.label && s.wrong]}><Text style={s.optionLetter}>{option.label}</Text><Text style={[g.label, { flex: 1 }]}>{option.text}</Text><GameIcon name={p.selectedOption === option.label ? "radiobox-marked" : "radiobox-blank"} color={p.selectedOption === option.label ? gameBlue : "#798797"} /></Pressable>)}</View>
    </> : null}

    {id === "unscramble-word" && p.prompt?.kind === "unscramble" ? <>
      <View style={{ gap: 6 }}><Text style={f.title}>Find the word.</Text><Text style={f.body}>Rearrange the letters into a word.</Text></View>
      <View style={s.letters}>{p.prompt.scrambled.split("").map((letter, i) => <View key={i} style={s.letter}><Text style={s.letterText}>{letter}</Text></View>)}</View>
      <View style={s.inputRow}><TextInput accessibilityLabel="Unscrambled word" autoCapitalize="characters" autoCorrect={false} editable={!p.isBusy} value={p.wordInput} onChangeText={(value) => p.setWord(value.toUpperCase())} onSubmitEditing={p.submitWord} placeholder="YOUR WORD" placeholderTextColor={c.muted} style={s.input} maxLength={30} /><Pressable accessibilityRole="button" accessibilityLabel="Clear word" onPress={() => p.setWord("")} disabled={p.isBusy} style={s.clear}><GameIcon name="close-circle" size={22} /></Pressable></View>
      <FocusedButton label="Submit word" disabled={p.isBusy || !p.wordInput.trim()} onPress={p.submitWord} />
      <View style={g.rule} /><Text style={g.muted}>Each correct word unlocks the next one.</Text>
    </> : null}

    {id === "focus-flow" ? <>
      <View style={s.focusHeading}><Text style={f.title}>Stay with the target.</Text><Text style={s.roundLabel}>Round {Math.floor(p.actionCount / FOCUS_FLOW_CELL_COUNT) + 1}</Text></View>
      <View style={s.focusGrid}>{Array.from({ length: FOCUS_FLOW_CELL_COUNT }, (_, i) => <View key={i} style={s.focusCell}>{i === p.targetIndex ? <Pressable accessibilityRole="button" accessibilityLabel={`Focus target in cell ${i + 1}`} disabled={p.isBusy} onPress={p.tapFocus} style={s.target}><View style={s.targetRing}><GameIcon name="bullseye" size={48} color={gameBlue} /></View></Pressable> : null}</View>)}</View>
      <Text style={s.centerNote}>Tap the blue target. Every round visits all nine cells.</Text><View style={g.rule} /><View style={s.focusProgressLabel}><Text style={f.sectionTitle}>{p.actionCount} hits</Text><Text style={s.small}>{p.actionCount % FOCUS_FLOW_CELL_COUNT} of {FOCUS_FLOW_CELL_COUNT} this round</Text></View><GamesProgress color={gameBlue} value={(p.actionCount % FOCUS_FLOW_CELL_COUNT) / FOCUS_FLOW_CELL_COUNT} />
    </> : null}

    {id === "gratitude-tap" ? <>
      <View style={{ gap: 6 }}><Text style={f.title}>Notice what’s good.</Text><Text style={f.body}>Tap a thought. Pause for a breath.</Text></View>
      <View style={{ gap: 9 }}>{gratitude.map(([value, label, icon]) => {
        const selected = p.gratitudeTaps.includes(value);
        return <Pressable key={value} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: selected || p.isBusy }} disabled={selected || p.isBusy} onPress={() => p.tapGratitude(value)} style={s.option}><GameIcon name={icon} size={30} color={selected ? c.green : c.muted} /><Text style={[g.label, { flex: 1 }]}>{label}</Text><GameIcon name={selected ? "check-circle" : "checkbox-blank-circle-outline"} size={29} color={selected ? c.green : c.muted} /></Pressable>;
      })}</View><Text style={s.centerNote}>{p.actionCount} moments appreciated</Text>
    </> : null}

    {id === "box-breathing" ? <>
      <Text style={f.title}>Follow the pace gently.</Text><View style={s.breathBox}><Text style={s.phase}>{phases[phaseIndex]}</Text><Text style={s.breathCount}>{4 - elapsed % 4}</Text><Text style={f.body}>seconds</Text></View>
      <View style={s.phases}>{phases.map((phase, i) => <View key={i} style={[s.phaseChip, i === phaseIndex && s.selected]}><Text style={[s.small, i === phaseIndex && { color: gameBlue }]}>{phase}</Text><Text style={g.muted}>4s</Text></View>)}</View>
      <FocusedButton label="Complete cycle" disabled={p.isBusy || elapsed < (p.actionCount + 1) * 16} onPress={p.breathe} /><Text style={s.centerNote}>Available after each full 16-second cycle.</Text>
    </> : null}

    {id === "sort-sprint" && p.prompt?.kind === "sort" ? <>
      <View style={s.center}><Text style={[f.title, s.introTitle]}>Where does this belong?</Text><Text style={f.body}>Choose the correct category.</Text></View>
      <View style={[s.center, { paddingVertical: 6, gap: 8 }]}><GameIcon name={sortIcons[p.prompt.item] ?? "shape-outline"} size={78} color={c.gold} /><Text style={s.item}>{p.prompt.item.toUpperCase()}</Text></View>
      <View style={s.sortGrid}>{p.prompt.options.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: p.selectedOption === option, disabled: p.isBusy }} disabled={p.isBusy} onPress={() => p.selectOption(option)} style={[s.sortOption, p.selectedOption === option && s.selected, wrong && p.selectedOption === option && s.wrong]}><GameIcon name={sortIcons[option] ?? "shape-outline"} size={33} color={p.selectedOption === option ? gameBlue : c.muted} /><Text style={g.label}>{option}</Text></Pressable>)}</View>
    </> : null}

    {p.feedback ? <Text accessibilityLiveRegion="polite" style={[s.feedback, wrong && { color: c.coral }]}>{p.feedback}</Text> : null}
    {p.error ? <Text accessibilityRole="alert" style={s.error}>{p.error}</Text> : null}

  </GamesFrame>;
}
const s = StyleSheet.create({
  center: { alignItems: "center", gap: 6 }, introTitle: { fontSize: 23, lineHeight: 30, textAlign: "center" },
  introMeta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  divider: { width: 1, height: "75%", minHeight: 30, backgroundColor: c.line },
  instructions: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line, paddingVertical: 15, gap: 15 },
  step: { flexDirection: "row", gap: 14 }, stepNumber: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#283440" },
  stats: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingVertical: 11, marginBottom: 6 },
  stat: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  statValue: { color: c.text, fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 26 },
  clockValue: { fontSize: 22, lineHeight: 28 },
  small: { color: c.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17 },
  memoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  memoryCard: { width: "23.3%", aspectRatio: 0.9, borderWidth: 1, borderColor: "#35424D", borderRadius: 9, backgroundColor: "#202B34", alignItems: "center", justifyContent: "center" },
  memoryVisible: { backgroundColor: "#246BB0", borderColor: gameBlue }, memoryMatched: { backgroundColor: "#1B543F", borderColor: "#3D9874" },
  centerNote: { color: c.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: "center" },
  segments: { flexDirection: "row", gap: 4 }, segment: { flex: 1, height: 10, borderRadius: 5, backgroundColor: c.line },
  question: { color: c.text, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 28, textAlign: "center", paddingVertical: 16 },
  option: { flexDirection: "row", gap: 12, alignItems: "center", minHeight: 56, borderRadius: 10, borderWidth: 1, borderColor: c.line, padding: 12, backgroundColor: "#192229" },
  selected: { borderColor: gameBlue, backgroundColor: "#1C344C" }, wrong: { borderColor: c.coral },
  optionLetter: { color: c.text, fontFamily: fonts.bodyBold, fontSize: 17, width: 22 },
  letters: { flexDirection: "row", gap: 7, marginVertical: 12 },
  letter: { flex: 1, height: 68, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  letterText: { color: c.text, fontFamily: fonts.bodyBold, fontSize: 28 },
  inputRow: { flexDirection: "row", borderWidth: 1.5, borderColor: gameBlue, borderRadius: 9, backgroundColor: c.panel },
  input: { flex: 1, minWidth: 0, minHeight: 59, paddingHorizontal: 16, color: c.text, fontFamily: fonts.bodyBold, fontSize: 23 },
  clear: { width: 44, justifyContent: "center", alignItems: "center" },
  focusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 4 },
  focusCell: { flexBasis: "30%", flexGrow: 1, maxWidth: "32%", aspectRatio: 1, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: "#192229", alignItems: "center", justifyContent: "center" },
  focusHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  roundLabel: { color: gameBlue, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  target: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  targetRing: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: "rgba(99, 174, 245, 0.35)", backgroundColor: "rgba(99, 174, 245, 0.08)", alignItems: "center", justifyContent: "center" },
  focusProgressLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  breathBox: { borderWidth: 3, borderColor: gameBlue, borderRadius: 24, marginHorizontal: 24, marginTop: 8, height: 205, justifyContent: "center", alignItems: "center", gap: 8 },
  phase: { color: gameBlue, fontFamily: fonts.bodyBold, fontSize: 25 }, breathCount: { color: c.text, fontFamily: fonts.bodyBold, fontSize: 56, lineHeight: 66 },
  phases: { flexDirection: "row", gap: 7 }, phaseChip: { flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingVertical: 13, gap: 4, alignItems: "center" },
  item: { color: c.text, fontFamily: fonts.bodyBold, fontSize: 24 },
  sortGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sortOption: { flexBasis: "46%", flexGrow: 1, minHeight: 88, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: "#192229", alignItems: "center", justifyContent: "center", gap: 8 },
  feedback: { color: c.green, fontFamily: fonts.bodyMedium, fontSize: 13, textAlign: "center", lineHeight: 20 },
  error: { color: c.coral, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  resultScore: { color: c.text, fontFamily: fonts.bodyBold, fontSize: 38, lineHeight: 49 },
  reward: { color: c.text, fontFamily: fonts.bodyBold, fontSize: 24 }, textButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
