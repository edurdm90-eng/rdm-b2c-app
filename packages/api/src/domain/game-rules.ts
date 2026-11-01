import type { GameAction, GameId, GamePrompt } from "./rdm";
import {
  aptitudeBank,
  aptitudeById,
  contentBankIds,
  GAME_DECK_SIZES,
  sortBank,
  sortById,
  type ContentGameId,
  unscrambleBank,
  unscrambleById,
} from "./game-content";

export {
  aptitudeBank,
  GAME_DECK_RECENT_LOOKBACK,
  GAME_DECK_SIZES,
  isContentGameId,
  sortBank,
  unscrambleBank,
} from "./game-content";
export type { ContentGameId } from "./game-content";

const gratitudeValues = new Set(["family", "friends", "health", "home", "nature", "learning"]);
const memoryIcons = ["🌿", "⭐", "🍎", "⚽", "🚀", "💎", "🎵", "🎈"] as const;
export const FOCUS_FLOW_CELL_COUNT = 9;

function shuffledValues<Value>(values: readonly Value[], seed: string) {
  const shuffled = [...values];
  let state = 2_166_136_261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16_777_619) >>> 0;
  }
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

export function buildDailyGameDeck({
  gameId,
  userId,
  dayKey,
  recentItemIds,
}: {
  gameId: ContentGameId;
  userId: string;
  dayKey: string;
  recentItemIds: readonly string[];
}) {
  const deckSize = GAME_DECK_SIZES[gameId];
  const bankIds = contentBankIds(gameId);
  const recent = new Set(recentItemIds);
  const available = bankIds.filter((id) => !recent.has(id));
  const pool = available.length >= deckSize ? available : [...bankIds];
  return shuffledValues(pool, `${userId}:${gameId}:${dayKey}`).slice(0, deckSize);
}

export function focusTargetForSeed(seed: string, actionCount: number) {
  const safeActionCount = Math.max(0, Math.floor(actionCount));
  const cycle = Math.floor(safeActionCount / FOCUS_FLOW_CELL_COUNT);
  const position = safeActionCount % FOCUS_FLOW_CELL_COUNT;
  const cells = Array.from({ length: FOCUS_FLOW_CELL_COUNT }, (_, index) => index);
  const order = shuffledValues(cells, `${seed}:focus:${cycle}`);

  if (cycle > 0) {
    const previousOrder = shuffledValues(cells, `${seed}:focus:${cycle - 1}`);
    if (order[0] === previousOrder[FOCUS_FLOW_CELL_COUNT - 1]) {
      [order[0], order[1]] = [order[1]!, order[0]!];
    }
  }

  return order[position]!;
}

export function memoryBoardForSeed(seed: string) {
  return shuffledValues([...memoryIcons, ...memoryIcons], seed);
}

function normalizeDeck(deckItemIds?: readonly string[] | null) {
  if (!deckItemIds || deckItemIds.length === 0) return null;
  return deckItemIds;
}

function aptitudeItemAt(actionCount: number, deckItemIds?: readonly string[] | null) {
  const deck = normalizeDeck(deckItemIds);
  if (deck) {
    const id = deck[actionCount];
    return id ? aptitudeById(id) : null;
  }
  return aptitudeBank[actionCount] ?? null;
}

function unscrambleItemAt(actionCount: number, deckItemIds?: readonly string[] | null) {
  const deck = normalizeDeck(deckItemIds);
  if (deck) {
    const id = deck[actionCount % deck.length];
    return id ? unscrambleById(id) : null;
  }
  return unscrambleBank[actionCount % unscrambleBank.length] ?? null;
}

function sortItemAt(actionCount: number, deckItemIds?: readonly string[] | null) {
  const deck = normalizeDeck(deckItemIds);
  if (deck) {
    const id = deck[actionCount % deck.length];
    return id ? sortById(id) : null;
  }
  return sortBank[actionCount % sortBank.length] ?? null;
}

export function gamePromptFor(
  gameId: GameId,
  actionCount: number,
  deckItemIds?: readonly string[] | null,
): GamePrompt | null {
  if (gameId === "aptitude-bliss") {
    const question = aptitudeItemAt(actionCount, deckItemIds);
    if (!question) return null;
    const deck = normalizeDeck(deckItemIds);
    return {
      kind: "aptitude",
      options: question.options.map(({ label, text }) => ({ label, text })),
      question: question.question,
      questionNumber: actionCount + 1,
      totalQuestions: deck?.length ?? aptitudeBank.length,
    };
  }
  if (gameId === "unscramble-word") {
    const word = unscrambleItemAt(actionCount, deckItemIds);
    if (!word) return null;
    return {
      kind: "unscramble",
      scrambled: word.scrambled,
      wordNumber: actionCount + 1,
    };
  }
  if (gameId === "sort-sprint") {
    const round = sortItemAt(actionCount, deckItemIds);
    if (!round) return null;
    return {
      kind: "sort",
      item: round.item,
      options: [...round.options],
      roundNumber: actionCount + 1,
    };
  }
  return null;
}

export function evaluateGameAction({
  action,
  actionCount,
  allowLegacyFocusTap = false,
  deckItemIds,
  focusSeed,
  gameId,
  matchedIndexes,
  memoryBoard,
}: {
  action: GameAction;
  actionCount: number;
  allowLegacyFocusTap?: boolean;
  deckItemIds?: readonly string[] | null;
  focusSeed?: string;
  gameId: GameId;
  matchedIndexes: number[];
  memoryBoard?: string[];
}) {
  if (gameId === "focus-flow" && action.type === "focus_tap") {
    const accepted = focusSeed !== undefined
      && (allowLegacyFocusTap && action.targetIndex === undefined
        || action.targetIndex === focusTargetForSeed(focusSeed, actionCount));
    return accepted ? acceptedResult(true, matchedIndexes, 1) : rejectedResult(matchedIndexes);
  }
  if (gameId === "gratitude-tap" && action.type === "gratitude_tap") {
    const accepted = gratitudeValues.has(action.value);
    return accepted ? acceptedResult(true, matchedIndexes, 10) : rejectedResult(matchedIndexes);
  }
  if (gameId === "box-breathing" && action.type === "breath_cycle") {
    return acceptedResult(true, matchedIndexes, 25);
  }
  if (gameId === "aptitude-bliss" && action.type === "answer") {
    const question = aptitudeItemAt(actionCount, deckItemIds);
    const correct = question?.correctOption === action.value.trim().toUpperCase();
    return question
      ? acceptedResult(correct, matchedIndexes, correct ? 20 : 0)
      : rejectedResult(matchedIndexes);
  }
  if (gameId === "unscramble-word" && action.type === "answer") {
    const word = unscrambleItemAt(actionCount, deckItemIds);
    const correct = word?.answer === action.value.trim().toUpperCase();
    if (!word) return rejectedResult(matchedIndexes);
    return {
      ...acceptedResult(correct, matchedIndexes, correct ? 10 : 0),
      actionDelta: correct ? 1 : 0,
    };
  }
  if (gameId === "sort-sprint" && action.type === "answer") {
    const round = sortItemAt(actionCount, deckItemIds);
    const correct = round?.answer === action.value.trim();
    return round
      ? acceptedResult(correct, matchedIndexes, correct ? 15 : 0)
      : rejectedResult(matchedIndexes);
  }
  if (gameId === "memory-match" && action.type === "memory_pair") {
    const { first, second } = action;
    const validIndexes = memoryBoard
      && Number.isInteger(first)
      && Number.isInteger(second)
      && first !== second
      && first >= 0
      && second >= 0
      && first < memoryBoard.length
      && second < memoryBoard.length
      && !matchedIndexes.includes(first)
      && !matchedIndexes.includes(second);
    if (!validIndexes) return rejectedResult(matchedIndexes);
    const correct = memoryBoard[first] === memoryBoard[second];
    return {
      accepted: true,
      actionDelta: 1,
      correct,
      matchedIndexes: correct
        ? [...matchedIndexes, first, second].sort((left, right) => left - right)
        : matchedIndexes,
      movesDelta: 1,
      scoreDelta: correct ? 20 : 0,
    };
  }
  return rejectedResult(matchedIndexes);
}

function acceptedResult(correct: boolean, matchedIndexes: number[], scoreDelta: number) {
  return {
    accepted: true,
    actionDelta: 1,
    correct,
    matchedIndexes,
    movesDelta: 0,
    scoreDelta,
  };
}

function rejectedResult(matchedIndexes: number[]) {
  return {
    accepted: false,
    actionDelta: 0,
    correct: false,
    matchedIndexes,
    movesDelta: 0,
    scoreDelta: 0,
  };
}
