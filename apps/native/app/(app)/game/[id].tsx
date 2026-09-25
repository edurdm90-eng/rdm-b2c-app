import {
  gameCatalog,
  type GameAction,
  type GamePrompt,
} from "@rdm-b2c/api/domain/rdm";
import { focusTargetForSeed } from "@rdm-b2c/api/domain/game-rules";
import { useMutation } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { ErrorState } from "@/components/rdm-ui";
import { GameSessionView, type GameStatus, type GameResult } from "@/components/game-session-view";
import { queryClient, trpc } from "@/utils/trpc";

type ProgressResult = {
  accepted: boolean;
  actionCount: number;
  correct: boolean;
  matchedIndexes: number[];
  moves: number;
  prompt: GamePrompt | null;
  score: number;
};
type PendingAction = { action: GameAction; operationId: string };

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
  const [gratitudeTaps, setGratitudeTaps] = useState<string[]>([]);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answerTransition, setAnswerTransitionState] = useState(false);
  const transitioning = useRef(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishing = useRef(false);
  useEffect(() => () => { if (transitionTimer.current) clearTimeout(transitionTimer.current); }, []);
  const checkpointing = useRef(false);
  const finishAfterCheckpoint = useRef(false);
  const nextCheckpointAt = useRef(0);
  const pendingAction = useRef<PendingAction | null>(null);

  function setAnswerTransition(value: boolean) {
    transitioning.current = value;
    setAnswerTransitionState(value);
  }

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
    if (checkpointing.current) {
      finishAfterCheckpoint.current = true;
      return;
    }
    if (pendingAction.current) {
      setError("Retry your last move before finishing the session.");
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
    if (!sessionId) return;
    await performAction({
      type: "focus_tap",
      targetIndex: focusTargetForSeed(sessionId, actionCount),
    });
  }

  async function answerAptitude(value: string) {
    if (transitioning.current) return;
    setAnswerTransition(true);
    const progressed = await performAction({ type: "answer", value });
    if (!progressed) {
      setAnswerTransition(false);
      return;
    }
    setFeedback(progressed.correct ? "Correct +20" : "Not quite — keep going");
    transitionTimer.current = setTimeout(() => {
      setPrompt(progressed.prompt);
      setSelectedOption(null);
      setAnswerTransition(false);
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
    if (transitioning.current) return;
    setAnswerTransition(true);
    const progressed = await performAction({ type: "answer", value });
    if (!progressed) {
      setAnswerTransition(false);
      return;
    }
    setFeedback(progressed.correct ? "Correct sort +15" : "Not quite — next item");
    transitionTimer.current = setTimeout(() => {
      setPrompt(progressed.prompt);
      setSelectedOption(null);
      setAnswerTransition(false);
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
    transitionTimer.current = setTimeout(() => {
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
      if (remainingMs <= 0) queueMicrotask(finish);
    };
    syncTimer();
    const interval = setInterval(syncTimer, 250);
    return () => clearInterval(interval);
  }, [expiresAtMs, finish, status]);

  if (!game) return <ErrorState message="That game could not be found." />;


  return <GameSessionView
    game={game} status={status} secondsLeft={secondsLeft} score={score} actionCount={actionCount} moves={moves}
    prompt={prompt} memoryBoard={memoryBoard} matchedIndexes={matchedIndexes} flippedIndexes={flippedIndexes}
    selectedOption={selectedOption} wordInput={wordInput} feedback={feedback}
    targetIndex={focusTargetForSeed(sessionId ?? "idle", actionCount)}
    gratitudeTaps={gratitudeTaps} result={result} error={error}
    isBusy={status !== "running" || progressGame.isPending || answerTransition || secondsLeft === 0}
    pendingAction={Boolean(pendingAction.current)}
    retryDisabled={status !== "running" || progressGame.isPending}
    begin={begin} finish={finish} back={() => router.dismissTo("/(app)/(tabs)/games")}
    leaderboard={() => router.push("/(app)/leaderboard")}
    retry={() => void retryPendingAction()} selectOption={setSelectedOption}
    submitAnswer={() => { if (selectedOption) void (game.id === "aptitude-bliss" ? answerAptitude(selectedOption) : answerSort(selectedOption)); }}
    setWord={(value) => { setWordInput(value); setFeedback(null); }} submitWord={() => void submitWord()}
    tapFocus={() => void tapFocusTarget()} tapGratitude={(value) => void tapGratitude(value)}
    breathe={() => void completeBreathCycle()} flip={(index) => void flipMemoryCard(index)}
  />;
}
