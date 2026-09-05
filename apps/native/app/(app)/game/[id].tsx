import {
  gameCatalog,
  type GameAction,
  type GamePrompt,
} from "@rdm-b2c/api/domain/rdm";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMutation } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  AppScreen,
  ErrorState,
  PageHeader,
  PrimaryButton,
  ProgressBar,
  SectionLabel,
  SurfaceCard,
  rdmStyles,
} from "@/components/rdm-ui";
import { colors, fonts, radii } from "@/lib/theme";
import { queryClient, trpc } from "@/utils/trpc";

type GameStatus = "idle" | "starting" | "running" | "saving" | "retry" | "complete";
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type ProgressResult = {
  accepted: boolean;
  actionCount: number;
  correct: boolean;
  matchedIndexes: number[];
  moves: number;
  prompt: GamePrompt | null;
  score: number;
};
type CompleteResult = {
  actionCount: number;
  bestScore: number;
  matchedCount: number;
  moves: number;
  reward: number;
  score: number;
};
type PendingAction = { action: GameAction; operationId: string };

const gratitudeOptions = [
  ["family", "Family"],
  ["friends", "Friends"],
  ["health", "Health"],
  ["home", "Home"],
  ["nature", "Nature"],
  ["learning", "Learning"],
] as const;
const breathingPhases = ["Inhale", "Hold", "Exhale", "Hold"] as const;

function formatDuration(seconds: number) {
  if (seconds === 90) return "90 seconds";
  return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statAccent]}>{value}</Text>
    </View>
  );
}

export default function GamePlayScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const game = gameCatalog.find((item) => item.id === id);
  const duration = game?.durationSeconds ?? 60;
  const [secondsLeft, setSecondsLeft] = useState<number>(duration);
  const [score, setScore] = useState(0);
  const [actionCount, setActionCount] = useState(0);
  const [moves, setMoves] = useState(0);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [prompt, setPrompt] = useState<GamePrompt | null>(null);
  const [memoryBoard, setMemoryBoard] = useState<string[]>([]);
  const [matchedIndexes, setMatchedIndexes] = useState<number[]>([]);
  const [flippedIndexes, setFlippedIndexes] = useState<number[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [wordInput, setWordInput] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [targetIndex, setTargetIndex] = useState(4);
  const [gratitudeTaps, setGratitudeTaps] = useState<string[]>([]);
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);
  const checkpointing = useRef(false);
  const finishAfterCheckpoint = useRef(false);
  const nextCheckpointAt = useRef(0);
  const pendingAction = useRef<PendingAction | null>(null);

  const startGame = useMutation(trpc.rdm.games.start.mutationOptions({
    onSuccess: (started) => {
      checkpointing.current = false;
      finishAfterCheckpoint.current = false;
      nextCheckpointAt.current = 0;
      setSessionId(started.sessionId);
      setExpiresAtMs(Date.parse(started.expiresAt));
      setSecondsLeft(started.secondsRemaining);
      setScore(started.score);
      setActionCount(started.actionCount);
      setMoves(started.moves);
      setMatchedIndexes(started.matchedIndexes);
      setMemoryBoard(started.memoryBoard ?? []);
      setPrompt(started.prompt);
      setStatus("running");
    },
    onError: (mutationError) => {
      setStatus("idle");
      setError(mutationError.message);
    },
  }));
  const progressGame = useMutation(trpc.rdm.games.progress.mutationOptions({ retry: 2 }));
  const completeGame = useMutation(trpc.rdm.games.complete.mutationOptions({
    onSuccess: async (completed) => {
      setResult(completed);
      setScore(completed.score);
      setActionCount(completed.actionCount);
      setMoves(completed.moves);
      setStatus("complete");
      setError(null);
      finishing.current = false;
      await queryClient.invalidateQueries();
    },
    onError: (mutationError) => {
      setStatus("retry");
      setError(mutationError.message);
      finishing.current = false;
    },
  }));

  const finish = useCallback(() => {
    if (!sessionId || finishing.current || (status !== "running" && status !== "retry")) return;
    if (pendingAction.current) {
      setError("Retry your last move before finishing the session.");
      return;
    }
    if (checkpointing.current) {
      finishAfterCheckpoint.current = true;
      return;
    }
    finishing.current = true;
    setStatus("saving");
    completeGame.mutate({ sessionId });
  }, [completeGame, sessionId, status]);

  async function performAction(action: GameAction, retrying = false): Promise<ProgressResult | null> {
    if (
      !sessionId
      || checkpointing.current
      || (!retrying && Date.now() < nextCheckpointAt.current)
      || status !== "running"
    ) return null;
    if (pendingAction.current && !retrying) {
      setError("Your last move is still unconfirmed. Retry it before continuing.");
      return null;
    }
    checkpointing.current = true;
    const pending = pendingAction.current ?? { action, operationId: Crypto.randomUUID() };
    pendingAction.current = pending;
    try {
      const progressed = await progressGame.mutateAsync({
        sessionId,
        operationId: pending.operationId,
        action: pending.action,
      });
      pendingAction.current = null;
      setError(null);
      setScore(progressed.score);
      setActionCount(progressed.actionCount);
      setMoves(progressed.moves);
      setMatchedIndexes(progressed.matchedIndexes);
      if (retrying) setPrompt(progressed.prompt);
      if (pending.action.type === "focus_tap") {
        setTargetIndex((current) => (current * 5 + 3) % 9);
      }
      if (pending.action.type === "gratitude_tap") {
        const gratitudeValue = pending.action.value;
        setGratitudeTaps((current) => current.includes(gratitudeValue)
          ? current
          : [...current, gratitudeValue]);
      }
      nextCheckpointAt.current = Date.now() + 350;
      return progressed;
    } catch (mutationError) {
      const definitiveResponse = Boolean(
        mutationError
        && typeof mutationError === "object"
        && "data" in mutationError
        && mutationError.data,
      );
      if (definitiveResponse) pendingAction.current = null;
      setError(definitiveResponse && mutationError instanceof Error
        ? mutationError.message
        : "Connection interrupted. Retry your last move safely.");
      return null;
    } finally {
      checkpointing.current = false;
      if (finishAfterCheckpoint.current) {
        finishAfterCheckpoint.current = false;
        queueMicrotask(finish);
      }
    }
  }

  async function retryPendingAction() {
    const pending = pendingAction.current;
    if (!pending) return;
    const progressed = await performAction(pending.action, true);
    if (!progressed) return;
    setSelectedOption(null);
    setFlippedIndexes([]);
    if (game?.id === "unscramble-word" && pending.action.type === "answer" && progressed.correct) {
      setWordInput("");
    }
    setFeedback("Last move recovered safely");
    if (
      (game?.id === "aptitude-bliss" && progressed.prompt === null)
      || (game?.id === "memory-match" && progressed.matchedIndexes.length === memoryBoard.length)
    ) {
      queueMicrotask(finish);
    }
  }

  function begin() {
    if (!game) return;
    setError(null);
    setResult(null);
    setFeedback(null);
    setStatus("starting");
    startGame.mutate({ gameId: game.id });
  }

  async function tapFocusTarget() {
    await performAction({ type: "focus_tap" });
  }

  async function answerAptitude(value: string) {
    if (selectedOption) return;
    setSelectedOption(value);
    const progressed = await performAction({ type: "answer", value });
    if (!progressed) {
      setSelectedOption(null);
      return;
    }
    setFeedback(progressed.correct ? "Correct +20" : "Not quite — keep going");
    setTimeout(() => {
      setPrompt(progressed.prompt);
      setSelectedOption(null);
      setFeedback(null);
      if (!progressed.prompt) finish();
    }, 650);
  }

  async function submitWord() {
    if (!wordInput.trim()) return;
    const progressed = await performAction({ type: "answer", value: wordInput });
    if (!progressed) return;
    setFeedback(progressed.correct ? "Correct +10" : "Try that word again");
    if (progressed.correct) {
      setPrompt(progressed.prompt);
      setWordInput("");
    }
  }

  async function tapGratitude(value: string) {
    if (gratitudeTaps.includes(value)) return;
    const progressed = await performAction({ type: "gratitude_tap", value });
    if (!progressed) return;
    setFeedback("Noticed +10");
  }

  async function completeBreathCycle() {
    const progressed = await performAction({ type: "breath_cycle" });
    if (progressed) setFeedback("Calm cycle complete +25");
  }

  async function answerSort(value: string) {
    if (selectedOption) return;
    setSelectedOption(value);
    const progressed = await performAction({ type: "answer", value });
    if (!progressed) {
      setSelectedOption(null);
      return;
    }
    setFeedback(progressed.correct ? "Correct sort +15" : "Not quite — next item");
    setTimeout(() => {
      setPrompt(progressed.prompt);
      setSelectedOption(null);
      setFeedback(null);
    }, 500);
  }

  async function flipMemoryCard(index: number) {
    if (
      matchedIndexes.includes(index)
      || flippedIndexes.includes(index)
      || flippedIndexes.length >= 2
      || checkpointing.current
    ) return;
    if (flippedIndexes.length === 0) {
      setFlippedIndexes([index]);
      return;
    }
    const first = flippedIndexes[0];
    if (first === undefined) return;
    setFlippedIndexes([first, index]);
    const progressed = await performAction({ type: "memory_pair", first, second: index });
    if (!progressed) {
      setFlippedIndexes([]);
      return;
    }
    setFeedback(progressed.correct ? "Pair found +20" : "Remember those cards");
    setTimeout(() => {
      setFlippedIndexes([]);
      setFeedback(null);
      if (progressed.matchedIndexes.length === memoryBoard.length) finish();
    }, progressed.correct ? 300 : 800);
  }

  useEffect(() => {
    if (status !== "running" || expiresAtMs === null) return;
    const syncTimer = () => {
      const remainingMs = expiresAtMs - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1_000)));
      if (remainingMs <= 750) queueMicrotask(finish);
    };
    syncTimer();
    const interval = setInterval(syncTimer, 250);
    return () => clearInterval(interval);
  }, [expiresAtMs, finish, status]);

  if (!game) return <ErrorState message="That game could not be found." />;

  const returnToGames = () => router.dismissTo("/(app)/(tabs)/games");
  const timer = `${Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:${(secondsLeft % 60).toString().padStart(2, "0")}`;
  const elapsedSeconds = Math.max(0, duration - secondsLeft);
  const breathingPhase = breathingPhases[Math.floor(elapsedSeconds / 4) % breathingPhases.length] ?? "Inhale";
  const breathingCount = 4 - (elapsedSeconds % 4);

  if (status === "idle" || status === "starting") {
    return (
      <AppScreen>
        <PageHeader back onBack={returnToGames} title={game.title} subtitle="RESPONSIBLE GAME" />
        <SurfaceCard style={styles.introHero}>
          <View style={styles.gameIcon}><MaterialCommunityIcons name={game.icon as IconName} size={48} color={colors.ai} /></View>
          <View style={styles.introCopy}>
            <Text style={styles.gameTitle}>{game.title}</Text>
            <Text style={rdmStyles.muted}>{game.instruction}</Text>
          </View>
        </SurfaceCard>
        <SurfaceCard>
          <View style={styles.detailRow}><Text style={styles.detailIcon}>⏱️</Text><View><Text style={styles.detailLabel}>DURATION</Text><Text style={styles.detailValue}>{formatDuration(game.durationSeconds)}</Text></View></View>
          {"questions" in game ? <View style={styles.detailRow}><Text style={styles.detailIcon}>❓</Text><View><Text style={styles.detailLabel}>QUESTIONS</Text><Text style={styles.detailValue}>{game.questions} questions</Text></View></View> : null}
          <View style={styles.detailRow}><Text style={styles.detailIcon}>🎯</Text><View><Text style={styles.detailLabel}>GOAL</Text><Text style={styles.detailValue}>{game.goal}</Text></View></View>
          <View style={styles.detailRow}><Text style={styles.detailIcon}>💎</Text><View><Text style={styles.detailLabel}>REWARD</Text><Text style={styles.detailValue}>RDM deposited in your Reward Purse</Text></View></View>
        </SurfaceCard>
        <SurfaceCard style={styles.tipCard}>
          <Text style={styles.tipTitle}>💡 Pro tip</Text>
          <Text style={rdmStyles.muted}>{game.proTip}</Text>
        </SurfaceCard>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton color={colors.growth} icon="play" label={game.startLabel} loading={status === "starting"} onPress={begin} />
      </AppScreen>
    );
  }

  if (status === "complete" && result) {
    const correctAnswers = game.id === "aptitude-bliss" ? Math.floor(result.score / 20) : 0;
    const resultTitle = game.id === "memory-match"
      ? result.matchedCount === 8 ? "Amazing!" : "Time's up!"
      : game.id === "unscramble-word" ? "Sprint finished!"
        : game.id === "aptitude-bliss" ? correctAnswers >= 8 ? "Excellent work!" : correctAnswers >= 5 ? "Great job!" : "Keep practicing"
          : "Great job!";
    return (
      <AppScreen>
        <PageHeader back onBack={returnToGames} title="" subtitle={game.title.toUpperCase()} />
        <View style={styles.resultHero}>
          <Text style={styles.trophy}>{resultTitle === "Keep practicing" ? "💪" : "🏆"}</Text>
          <Text style={styles.resultTitle}>{resultTitle}</Text>
          <Text style={rdmStyles.muted}>Your session is complete and locked for today.</Text>
        </View>
        <SurfaceCard style={styles.resultScoreCard}>
          <Text style={styles.resultScore}>{game.id === "aptitude-bliss" ? `${correctAnswers}/10` : result.score}</Text>
          <Text style={styles.resultScoreLabel}>{game.id === "aptitude-bliss" ? "CORRECT ANSWERS" : "FINAL SCORE"}</Text>
        </SurfaceCard>
        <View style={styles.resultStats}>
          {game.id === "memory-match" ? <Stat label="PAIRS" value={`${result.matchedCount}/8`} /> : null}
          {game.id === "memory-match" ? <Stat label="MOVES" value={String(result.moves)} /> : null}
          {game.id === "aptitude-bliss" ? <Stat label="ACCURACY" value={`${result.actionCount ? Math.round((correctAnswers / result.actionCount) * 100) : 0}%`} /> : null}
          {game.id === "unscramble-word" ? <Stat label="WORDS" value={String(result.actionCount)} /> : null}
          {game.id === "focus-flow" ? <Stat label="TARGETS" value={String(result.actionCount)} /> : null}
          {game.id === "gratitude-tap" ? <Stat label="NOTICED" value={String(result.actionCount)} /> : null}
          {game.id === "box-breathing" ? <Stat label="CYCLES" value={String(result.actionCount)} /> : null}
          {game.id === "sort-sprint" ? <Stat label="SORTED" value={String(Math.floor(result.score / 15))} /> : null}
          <Stat accent label="BEST" value={String(result.bestScore)} />
        </View>
        <SurfaceCard style={styles.earnedCard}>
          <Text style={styles.earnedLabel}>DEPOSITED IN REWARD PURSE</Text>
          <Text style={styles.earnedValue}>+{result.reward} RDM</Text>
        </SurfaceCard>
        <PrimaryButton color={colors.growth} icon="check" label="Back to Games" onPress={returnToGames} />
        <PrimaryButton color={colors.plum} icon="chart-bar" label="View leaderboard" onPress={() => router.push("/(app)/leaderboard")} variant="outline" />
      </AppScreen>
    );
  }

  const isBusy = status === "saving" || progressGame.isPending;
  return (
    <AppScreen>
      <PageHeader back onBack={returnToGames} title={game.title} subtitle="SESSION IN PROGRESS" />
      <View style={styles.statsBar}>
        <Stat accent label="TIME LEFT" value={timer} />
        {game.id === "memory-match" ? <Stat label="MOVES" value={String(moves)} /> : null}
        {game.id === "memory-match" ? <Stat label="PAIRS" value={`${matchedIndexes.length / 2}/8`} /> : <Stat label="SCORE" value={String(score)} />}
      </View>
      <ProgressBar color={colors.growth} progress={secondsLeft / duration} />

      {game.id === "focus-flow" ? (
        <View style={styles.focusArea}>
          {Array.from({ length: 9 }, (_, index) => (
            <View key={index} style={styles.focusCell}>
              {index === targetIndex ? (
                <Pressable accessibilityLabel="Focus target" accessibilityRole="button" disabled={isBusy} onPress={() => void tapFocusTarget()} style={styles.focusTarget}>
                  <View style={styles.focusTargetInner} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {game.id === "aptitude-bliss" && prompt?.kind === "aptitude" ? (
        <View style={styles.questionArea}>
          <SectionLabel>Question {prompt.questionNumber} of {prompt.totalQuestions}</SectionLabel>
          <Text style={styles.question}>{prompt.question}</Text>
          <View style={styles.optionStack}>
            {prompt.options.map((option) => {
              const selected = selectedOption === option.label;
              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={Boolean(selectedOption) || isBusy}
                  key={option.label}
                  onPress={() => void answerAptitude(option.label)}
                  style={[styles.answerOption, selected && (feedback?.startsWith("Correct") ? styles.answerCorrect : styles.answerWrong)]}
                >
                  <View style={styles.answerLabel}><Text style={styles.answerLabelText}>{option.label}</Text></View>
                  <Text style={styles.answerText}>{option.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {game.id === "memory-match" ? (
        <View style={styles.memoryGrid}>
          {memoryBoard.map((icon, index) => {
            const visible = flippedIndexes.includes(index) || matchedIndexes.includes(index);
            return (
              <Pressable
                accessibilityLabel={`Memory card ${index + 1}${visible ? `, ${icon}` : ""}`}
                accessibilityRole="button"
                disabled={matchedIndexes.includes(index) || isBusy}
                key={`${index}-${icon}`}
                onPress={() => void flipMemoryCard(index)}
                style={[styles.memoryCard, visible && styles.memoryCardVisible, matchedIndexes.includes(index) && styles.memoryCardMatched]}
              >
                <Text style={styles.memoryIcon}>{visible ? icon : "🧠"}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {game.id === "unscramble-word" && prompt?.kind === "unscramble" ? (
        <View style={styles.wordArea}>
          <Text style={styles.scrambledWord}>{prompt.scrambled}</Text>
          <TextInput
            accessibilityLabel="Unscrambled word"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!isBusy}
            onChangeText={(value) => { setWordInput(value.toUpperCase()); setFeedback(null); }}
            onSubmitEditing={() => void submitWord()}
            placeholder="TYPE HERE…"
            placeholderTextColor={colors.inkSoft}
            returnKeyType="done"
            style={styles.wordInput}
            value={wordInput}
          />
          <PrimaryButton color={colors.growth} disabled={!wordInput.trim() || isBusy} label="Submit" onPress={() => void submitWord()} />
        </View>
      ) : null}

      {game.id === "gratitude-tap" ? (
        <View style={styles.gratitudeArea}>
          <Text style={styles.gameplayHeading}>What feels worth appreciating right now?</Text>
          <Text style={rdmStyles.muted}>Tap each thought once and take a quiet moment with it.</Text>
          <View style={styles.gratitudeGrid}>
            {gratitudeOptions.map(([value, label]) => {
              const selected = gratitudeTaps.includes(value);
              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={selected || isBusy}
                  key={value}
                  onPress={() => void tapGratitude(value)}
                  style={[styles.gratitudeChip, selected && styles.gratitudeChipSelected]}
                >
                  <Text style={styles.gratitudeEmoji}>{selected ? "✓" : "♡"}</Text>
                  <Text style={styles.gratitudeLabel}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {game.id === "box-breathing" ? (
        <View style={styles.breathingArea}>
          <Text style={styles.breathingPhase}>{breathingPhase}</Text>
          <Text style={styles.breathingCount}>{breathingCount}</Text>
          <Text style={rdmStyles.muted}>Inhale 4 · Hold 4 · Exhale 4 · Hold 4</Text>
          <PrimaryButton
            color={colors.growth}
            disabled={isBusy || elapsedSeconds < (actionCount + 1) * 16}
            label={elapsedSeconds < (actionCount + 1) * 16 ? "Follow the full 16-second cycle" : "I completed one full cycle"}
            onPress={() => void completeBreathCycle()}
          />
        </View>
      ) : null}

      {game.id === "sort-sprint" && prompt?.kind === "sort" ? (
        <View style={styles.questionArea}>
          <SectionLabel>Round {prompt.roundNumber}</SectionLabel>
          <Text style={styles.sortItem}>{prompt.item}</Text>
          <Text style={rdmStyles.muted}>Which category does it belong to?</Text>
          <View style={styles.optionStack}>
            {prompt.options.map((option) => (
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(selectedOption) || isBusy}
                key={option}
                onPress={() => void answerSort(option)}
                style={[styles.answerOption, selectedOption === option && (feedback?.startsWith("Correct") ? styles.answerCorrect : styles.answerWrong)]}
              >
                <Text style={styles.answerText}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {feedback ? <Text style={[styles.feedback, feedback.includes("Correct") || feedback.includes("found") ? styles.feedbackGood : null]}>{feedback}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {pendingAction.current ? <PrimaryButton color={colors.ai} icon="backup-restore" label="Retry last move" onPress={() => void retryPendingAction()} /> : null}
      {status === "retry" ? <PrimaryButton color={colors.ai} icon="backup-restore" label="Retry banking reward" onPress={finish} /> : null}
      {status === "running" || status === "saving" ? <PrimaryButton color={colors.ai} disabled={Boolean(pendingAction.current)} label="Finish now & lock game" loading={status === "saving"} onPress={finish} variant="outline" /> : null}
      <Text style={styles.lockNote}>The server timer keeps running if you leave. Once completed, this game stays locked until tomorrow.</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  introHero: { alignItems: "center", flexDirection: "row", gap: 15, paddingVertical: 20 },
  gameIcon: { alignItems: "center", backgroundColor: colors.aiTint, borderRadius: 24, height: 78, justifyContent: "center", width: 78 },
  introCopy: { flex: 1, gap: 5 },
  gameTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 23 },
  detailRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 13, minHeight: 62 },
  detailIcon: { fontSize: 20 },
  detailLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.7 },
  detailValue: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 12, marginTop: 3 },
  tipCard: { backgroundColor: colors.goldTint, gap: 6 },
  tipTitle: { color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 13 },
  statsBar: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: radii.medium, borderWidth: 1, flexDirection: "row", paddingVertical: 13 },
  stat: { alignItems: "center", flex: 1, gap: 4 },
  statLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 8 },
  statValue: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 18 },
  statAccent: { color: colors.growth },
  focusArea: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: radii.large, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", minHeight: 330, overflow: "hidden", padding: 8 },
  focusCell: { alignItems: "center", height: 104, justifyContent: "center", width: "33.33%" },
  focusTarget: { alignItems: "center", backgroundColor: colors.growth, borderRadius: 31, height: 62, justifyContent: "center", width: 62 },
  focusTargetInner: { backgroundColor: colors.ink, borderRadius: 15, height: 30, width: 30 },
  questionArea: { gap: 14 },
  question: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 24 },
  optionStack: { gap: 10 },
  answerOption: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: radii.medium, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 58, padding: 11 },
  answerCorrect: { backgroundColor: colors.growthTint, borderColor: colors.growth },
  answerWrong: { backgroundColor: colors.coralTint, borderColor: colors.coral },
  answerLabel: { alignItems: "center", backgroundColor: colors.panelRaised, borderRadius: 17, height: 34, justifyContent: "center", width: 34 },
  answerLabelText: { color: colors.inkSoft, fontFamily: fonts.monoBold, fontSize: 12 },
  answerText: { color: colors.ink, flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13 },
  memoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, justifyContent: "center" },
  memoryCard: { alignItems: "center", aspectRatio: 1, backgroundColor: colors.plumTint, borderColor: "rgba(151,91,246,0.25)", borderRadius: radii.medium, borderWidth: 1, justifyContent: "center", width: "22%" },
  memoryCardVisible: { backgroundColor: colors.panelRaised },
  memoryCardMatched: { backgroundColor: colors.goldTint, borderColor: colors.gold },
  memoryIcon: { fontSize: 25, opacity: 0.9 },
  wordArea: { alignItems: "center", gap: 18 },
  scrambledWord: { backgroundColor: colors.panelRaised, borderColor: colors.line, borderRadius: radii.large, borderWidth: 1, color: colors.ink, fontFamily: fonts.monoBold, fontSize: 34, letterSpacing: 7, overflow: "hidden", paddingHorizontal: 20, paddingVertical: 28, textAlign: "center", width: "100%" },
  wordInput: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: radii.medium, borderWidth: 2, color: colors.ink, fontFamily: fonts.monoBold, fontSize: 18, minHeight: 56, paddingHorizontal: 14, textAlign: "center", width: "100%" },
  gameplayHeading: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 25 },
  gratitudeArea: { gap: 12 },
  gratitudeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gratitudeChip: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: radii.medium, borderWidth: 1, gap: 6, minHeight: 88, justifyContent: "center", width: "48%" },
  gratitudeChipSelected: { backgroundColor: colors.growthTint, borderColor: colors.growth },
  gratitudeEmoji: { color: colors.growth, fontFamily: fonts.bodyBold, fontSize: 24 },
  gratitudeLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  breathingArea: { alignItems: "center", backgroundColor: colors.aiTint, borderColor: colors.ai, borderRadius: radii.large, borderWidth: 1, gap: 12, padding: 28 },
  breathingPhase: { color: colors.ai, fontFamily: fonts.display, fontSize: 28 },
  breathingCount: { color: colors.ink, fontFamily: fonts.monoBold, fontSize: 64 },
  sortItem: { backgroundColor: colors.plumTint, borderColor: colors.plum, borderRadius: radii.large, borderWidth: 1, color: colors.ink, fontFamily: fonts.display, fontSize: 34, overflow: "hidden", padding: 28, textAlign: "center" },
  feedback: { color: colors.coral, fontFamily: fonts.bodyBold, fontSize: 12, textAlign: "center" },
  feedbackGood: { color: colors.growth },
  error: { color: colors.coral, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18, textAlign: "center" },
  lockNote: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 10, lineHeight: 16, paddingHorizontal: 10, textAlign: "center" },
  resultHero: { alignItems: "center", gap: 7, paddingVertical: 8 },
  trophy: { fontSize: 58 },
  resultTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 26 },
  resultScoreCard: { alignItems: "center", backgroundColor: colors.growthTint, borderColor: colors.growth, borderWidth: 2, gap: 4, paddingVertical: 20 },
  resultScore: { color: colors.growth, fontFamily: fonts.monoBold, fontSize: 40 },
  resultScoreLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.8 },
  resultStats: { flexDirection: "row", gap: 8 },
  earnedCard: { alignItems: "center", gap: 5 },
  earnedLabel: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.8 },
  earnedValue: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 23 },
});
