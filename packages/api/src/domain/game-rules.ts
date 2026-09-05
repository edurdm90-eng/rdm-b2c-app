import type { GameAction, GameId, GamePrompt } from "./rdm";

const aptitudeQuestions = [
  {
    question: "A train 180 m long is running at 54 km/h. In how many seconds will it cross a pole?",
    options: [
      { label: "A", text: "10 seconds" },
      { label: "B", text: "12 seconds" },
      { label: "C", text: "14 seconds" },
      { label: "D", text: "16 seconds" },
    ],
    correctOption: "B",
  },
  {
    question: "If 5 machines take 5 minutes to make 5 widgets, how long would 100 machines take to make 100 widgets?",
    options: [
      { label: "A", text: "100 minutes" },
      { label: "B", text: "5 minutes" },
      { label: "C", text: "50 minutes" },
      { label: "D", text: "1 minute" },
    ],
    correctOption: "B",
  },
  {
    question: "A bat and a ball cost $1.10 total. The bat costs $1 more than the ball. How much is the ball?",
    options: [
      { label: "A", text: "$0.10" },
      { label: "B", text: "$0.05" },
      { label: "C", text: "$0.15" },
      { label: "D", text: "$0.50" },
    ],
    correctOption: "B",
  },
  {
    question: "What is the next number in the sequence: 2, 6, 12, 20, 30, ...?",
    options: [
      { label: "A", text: "40" },
      { label: "B", text: "42" },
      { label: "C", text: "44" },
      { label: "D", text: "46" },
    ],
    correctOption: "B",
  },
  {
    question: "If you rearrange the letters CIFAIC, you would have the name of a(n):",
    options: [
      { label: "A", text: "City" },
      { label: "B", text: "Animal" },
      { label: "C", text: "Ocean" },
      { label: "D", text: "River" },
    ],
    correctOption: "C",
  },
  {
    question: "A clock shows 3:15. What is the angle between the hour and minute hands?",
    options: [
      { label: "A", text: "0 degrees" },
      { label: "B", text: "7.5 degrees" },
      { label: "C", text: "15 degrees" },
      { label: "D", text: "22.5 degrees" },
    ],
    correctOption: "B",
  },
  {
    question: "Which of the following is an odd number?",
    options: [
      { label: "A", text: "24" },
      { label: "B", text: "36" },
      { label: "C", text: "47" },
      { label: "D", text: "58" },
    ],
    correctOption: "C",
  },
  {
    question: "If all bloops are razzies and all razzies are lazzies, are all bloops definitely lazzies?",
    options: [
      { label: "A", text: "Yes" },
      { label: "B", text: "No" },
      { label: "C", text: "Cannot be determined" },
      { label: "D", text: "Only some" },
    ],
    correctOption: "A",
  },
  {
    question: "An item originally costs $50 and is discounted by 20%. What is the final price?",
    options: [
      { label: "A", text: "$35" },
      { label: "B", text: "$40" },
      { label: "C", text: "$42" },
      { label: "D", text: "$45" },
    ],
    correctOption: "B",
  },
  {
    question: "Which number completes the pattern? 3, 9, 27, 81, ...",
    options: [
      { label: "A", text: "162" },
      { label: "B", text: "213" },
      { label: "C", text: "243" },
      { label: "D", text: "324" },
    ],
    correctOption: "C",
  },
] as const;

const unscrambleWords = [
  { answer: "HABIT", scrambled: "TIBAH" },
  { answer: "FOCUS", scrambled: "CUSFO" },
  { answer: "HEALTH", scrambled: "THLAEH" },
  { answer: "WEALTH", scrambled: "THWELA" },
  { answer: "NATURE", scrambled: "RUTENA" },
  { answer: "PLANT", scrambled: "TNALP" },
  { answer: "GROWTH", scrambled: "WTHGOR" },
  { answer: "STREAK", scrambled: "KAREST" },
  { answer: "REWARD", scrambled: "WARDRE" },
  { answer: "ACHIEVE", scrambled: "VEHACIE" },
] as const;

const sortRounds = [
  { item: "Apple", options: ["Food", "Animal", "Object"], answer: "Food" },
  { item: "Dolphin", options: ["Plant", "Animal", "Tool"], answer: "Animal" },
  { item: "Hammer", options: ["Tool", "Food", "Place"], answer: "Tool" },
  { item: "Rose", options: ["Vehicle", "Plant", "Animal"], answer: "Plant" },
  { item: "Bicycle", options: ["Vehicle", "Clothing", "Food"], answer: "Vehicle" },
  { item: "Jacket", options: ["Place", "Tool", "Clothing"], answer: "Clothing" },
] as const;

const gratitudeValues = new Set(["family", "friends", "health", "home", "nature", "learning"]);
const memoryIcons = ["🌿", "⭐", "🍎", "⚽", "🚀", "💎", "🎵", "🎈"] as const;

export function memoryBoardForSeed(seed: string) {
  const board = [...memoryIcons, ...memoryIcons];
  let state = 2_166_136_261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16_777_619) >>> 0;
  }
  for (let index = board.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    const current = board[index]!;
    board[index] = board[swapIndex]!;
    board[swapIndex] = current;
  }
  return board;
}

export function gamePromptFor(gameId: GameId, actionCount: number): GamePrompt | null {
  if (gameId === "aptitude-bliss") {
    const question = aptitudeQuestions[actionCount];
    if (!question) return null;
    return {
      kind: "aptitude",
      options: question.options.map(({ label, text }) => ({ label, text })),
      question: question.question,
      questionNumber: actionCount + 1,
      totalQuestions: aptitudeQuestions.length,
    };
  }
  if (gameId === "unscramble-word") {
    const word = unscrambleWords[actionCount % unscrambleWords.length];
    if (!word) return null;
    return {
      kind: "unscramble",
      scrambled: word.scrambled,
      wordNumber: actionCount + 1,
    };
  }
  if (gameId === "sort-sprint") {
    const round = sortRounds[actionCount % sortRounds.length];
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
  gameId,
  matchedIndexes,
  memoryBoard,
}: {
  action: GameAction;
  actionCount: number;
  gameId: GameId;
  matchedIndexes: number[];
  memoryBoard?: string[];
}) {
  if (gameId === "focus-flow" && action.type === "focus_tap") {
    return acceptedResult(true, matchedIndexes, 1);
  }
  if (gameId === "gratitude-tap" && action.type === "gratitude_tap") {
    const accepted = gratitudeValues.has(action.value);
    return accepted ? acceptedResult(true, matchedIndexes, 10) : rejectedResult(matchedIndexes);
  }
  if (gameId === "box-breathing" && action.type === "breath_cycle") {
    return acceptedResult(true, matchedIndexes, 25);
  }
  if (gameId === "aptitude-bliss" && action.type === "answer") {
    const question = aptitudeQuestions[actionCount];
    const correct = question?.correctOption === action.value.trim().toUpperCase();
    return question
      ? acceptedResult(correct, matchedIndexes, correct ? 20 : 0)
      : rejectedResult(matchedIndexes);
  }
  if (gameId === "unscramble-word" && action.type === "answer") {
    const word = unscrambleWords[actionCount % unscrambleWords.length];
    const correct = word?.answer === action.value.trim().toUpperCase();
    if (!word) return rejectedResult(matchedIndexes);
    return {
      ...acceptedResult(correct, matchedIndexes, correct ? 10 : 0),
      actionDelta: correct ? 1 : 0,
    };
  }
  if (gameId === "sort-sprint" && action.type === "answer") {
    const round = sortRounds[actionCount % sortRounds.length];
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
