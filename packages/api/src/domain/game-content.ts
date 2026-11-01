export type AptitudeOption = { label: "A" | "B" | "C" | "D"; text: string };

export type AptitudeQuestion = {
  id: string;
  question: string;
  options: readonly AptitudeOption[];
  correctOption: "A" | "B" | "C" | "D";
};

export type UnscrambleWord = {
  id: string;
  answer: string;
  scrambled: string;
};

export type SortRound = {
  id: string;
  item: string;
  options: readonly string[];
  answer: string;
};

export const CONTENT_GAME_IDS = ["aptitude-bliss", "unscramble-word", "sort-sprint"] as const;
export type ContentGameId = (typeof CONTENT_GAME_IDS)[number];

export const GAME_DECK_SIZES: Record<ContentGameId, number> = {
  "aptitude-bliss": 10,
  "unscramble-word": 12,
  "sort-sprint": 10,
};

export const GAME_DECK_RECENT_LOOKBACK = 14;

function aptitude(
  id: string,
  question: string,
  options: readonly [string, string, string, string],
  correctOption: "A" | "B" | "C" | "D",
): AptitudeQuestion {
  return {
    id,
    question,
    options: [
      { label: "A", text: options[0] },
      { label: "B", text: options[1] },
      { label: "C", text: options[2] },
      { label: "D", text: options[3] },
    ],
    correctOption,
  };
}

export const aptitudeBank: readonly AptitudeQuestion[] = [
  aptitude("apt-train-pole", "A train 180 m long is running at 54 km/h. In how many seconds will it cross a pole?", ["10 seconds", "12 seconds", "14 seconds", "16 seconds"], "B"),
  aptitude("apt-machines-widgets", "If 5 machines take 5 minutes to make 5 widgets, how long would 100 machines take to make 100 widgets?", ["100 minutes", "5 minutes", "50 minutes", "1 minute"], "B"),
  aptitude("apt-bat-ball", "A bat and a ball cost $1.10 total. The bat costs $1 more than the ball. How much is the ball?", ["$0.10", "$0.05", "$0.15", "$0.50"], "B"),
  aptitude("apt-sequence-triangular", "What is the next number in the sequence: 2, 6, 12, 20, 30, ...?", ["40", "42", "44", "46"], "B"),
  aptitude("apt-cifaic-ocean", "If you rearrange the letters CIFAIC, you would have the name of a(n):", ["City", "Animal", "Ocean", "River"], "C"),
  aptitude("apt-clock-315", "A clock shows 3:15. What is the angle between the hour and minute hands?", ["0 degrees", "7.5 degrees", "15 degrees", "22.5 degrees"], "B"),
  aptitude("apt-odd-number", "Which of the following is an odd number?", ["24", "36", "47", "58"], "C"),
  aptitude("apt-bloops-lazzies", "If all bloops are razzies and all razzies are lazzies, are all bloops definitely lazzies?", ["Yes", "No", "Cannot be determined", "Only some"], "A"),
  aptitude("apt-discount-20", "An item originally costs $50 and is discounted by 20%. What is the final price?", ["$35", "$40", "$42", "$45"], "B"),
  aptitude("apt-pattern-powers", "Which number completes the pattern? 3, 9, 27, 81, ...", ["162", "213", "243", "324"], "C"),
  aptitude("apt-average-scores", "The average of 4, 8, 12 and 16 is:", ["8", "10", "12", "14"], "B"),
  aptitude("apt-percent-of-80", "What is 25% of 80?", ["15", "20", "25", "30"], "B"),
  aptitude("apt-ratio-simple", "Simplify the ratio 12:18.", ["1:2", "2:3", "3:4", "4:5"], "B"),
  aptitude("apt-lcm-6-8", "What is the LCM of 6 and 8?", ["12", "18", "24", "48"], "C"),
  aptitude("apt-hcf-12-18", "What is the HCF of 12 and 18?", ["2", "3", "6", "9"], "C"),
  aptitude("apt-square-15", "What is 15 squared?", ["125", "200", "225", "250"], "C"),
  aptitude("apt-cube-root-64", "What is the cube root of 64?", ["2", "3", "4", "8"], "C"),
  aptitude("apt-speed-distance", "A car travels 120 km in 2 hours. What is its average speed?", ["40 km/h", "50 km/h", "60 km/h", "80 km/h"], "C"),
  aptitude("apt-work-days", "If 4 people finish a job in 6 days, how many days do 8 people need for the same job?", ["2", "3", "4", "6"], "B"),
  aptitude("apt-simple-interest", "Simple interest on $200 at 5% per year for 2 years is:", ["$10", "$15", "$20", "$25"], "C"),
  aptitude("apt-fractions-add", "What is 1/4 + 1/2?", ["1/6", "1/3", "3/4", "1"], "C"),
  aptitude("apt-fractions-multiply", "What is 2/3 of 90?", ["30", "45", "60", "75"], "C"),
  aptitude("apt-missing-number-sum", "Find the missing number: 7 + ? = 19", ["10", "11", "12", "13"], "C"),
  aptitude("apt-sequence-odd", "What is the next odd number after 17?", ["18", "19", "20", "21"], "B"),
  aptitude("apt-prime-check", "Which number is prime?", ["15", "21", "27", "29"], "D"),
  aptitude("apt-composite-check", "Which number is composite?", ["2", "3", "11", "15"], "D"),
  aptitude("apt-perimeter-square", "A square has side 6. What is its perimeter?", ["12", "18", "24", "36"], "C"),
  aptitude("apt-area-rectangle", "A rectangle is 8 by 5. What is its area?", ["13", "26", "40", "45"], "C"),
  aptitude("apt-triangle-angles", "Two angles of a triangle are 40° and 60°. The third is:", ["60°", "70°", "80°", "90°"], "C"),
  aptitude("apt-probability-coin", "Probability of heads on a fair coin toss is:", ["0", "1/4", "1/2", "1"], "C"),
  aptitude("apt-mean-median", "The median of 3, 5, 9 is:", ["3", "5", "7", "9"], "B"),
  aptitude("apt-mode-set", "The mode of 2, 2, 3, 5 is:", ["2", "3", "4", "5"], "A"),
  aptitude("apt-absolute-value", "What is the absolute value of -17?", ["-17", "0", "1", "17"], "D"),
  aptitude("apt-negative-product", "What is (-3) × (-4)?", ["-12", "-7", "7", "12"], "D"),
  aptitude("apt-order-ops", "What is 2 + 3 × 4?", ["9", "14", "20", "24"], "B"),
  aptitude("apt-power-two", "What is 2 to the power of 5?", ["8", "10", "16", "32"], "D"),
  aptitude("apt-sqrt-81", "What is the square root of 81?", ["7", "8", "9", "10"], "C"),
  aptitude("apt-percentage-increase", "A price rises from 40 to 50. The percent increase is:", ["10%", "20%", "25%", "30%"], "C"),
  aptitude("apt-mixture-ratio", "Mix 2 liters red with 3 liters blue. Red is what fraction of the mix?", ["1/5", "2/5", "3/5", "2/3"], "B"),
  aptitude("apt-clock-hours", "How many minutes are in 2.5 hours?", ["120", "140", "150", "180"], "C"),
  aptitude("apt-days-weeks", "How many days are in 3 weeks?", ["14", "18", "21", "24"], "C"),
  aptitude("apt-binary-bit", "In binary, what is 2^3?", ["4", "6", "8", "16"], "C"),
  aptitude("apt-set-union", "If A has 3 items and B has 4 with 1 shared, |A ∪ B| is:", ["5", "6", "7", "8"], "B"),
  aptitude("apt-logic-or", "True OR False evaluates to:", ["True", "False", "Undefined", "Neither"], "A"),
  aptitude("apt-logic-and", "True AND False evaluates to:", ["True", "False", "Undefined", "Both"], "B"),
  aptitude("apt-anagram-listen", "LISTEN rearranged can spell:", ["SILENT", "TINSEL only", "ENLIST only", "None of these"], "A"),
  aptitude("apt-series-double", "Find the next term: 1, 2, 4, 8, ...", ["10", "12", "14", "16"], "D"),
  aptitude("apt-series-add3", "Find the next term: 5, 8, 11, 14, ...", ["15", "16", "17", "18"], "C"),
  aptitude("apt-profit", "Buy at 80, sell at 100. Profit percent is:", ["20%", "25%", "30%", "40%"], "B"),
  aptitude("apt-loss", "Buy at 50, sell at 40. Loss percent is:", ["10%", "20%", "25%", "40%"], "B"),
  aptitude("apt-unit-conversion", "How many centimeters are in 2 meters?", ["20", "100", "200", "2000"], "C"),
  aptitude("apt-kg-grams", "How many grams are in 3 kilograms?", ["30", "300", "3000", "30000"], "C"),
  aptitude("apt-temperature", "Water freezes at what Celsius temperature?", ["0", "32", "100", "212"], "A"),
  aptitude("apt-earth-moon", "Which is larger?", ["Moon", "Earth", "They are equal", "Cannot tell"], "B"),
  aptitude("apt-vowels", "How many vowels are in the word EDUCATION?", ["4", "5", "6", "7"], "B"),
  aptitude("apt-alphabet-pos", "What is the 3rd letter of the English alphabet?", ["B", "C", "D", "E"], "B"),
  aptitude("apt-reverse-word", "The reverse of STOP is:", ["POTS", "OPTS", "TOPS", "SPOT"], "A"),
  aptitude("apt-calendar-leap", "A leap year has how many days?", ["364", "365", "366", "367"], "C"),
  aptitude("apt-odd-one-shapes", "Which does not belong: circle, square, triangle, apple?", ["circle", "square", "triangle", "apple"], "D"),
  aptitude("apt-odd-one-animals", "Which does not belong: dog, cat, car, horse?", ["dog", "cat", "car", "horse"], "C"),
  aptitude("apt-coding-shift", "If CAT = DBU (each letter +1), DOG becomes:", ["EPH", "EPI", "DPH", "EOG"], "A"),
  aptitude("apt-direction-turn", "Facing north, a right turn faces:", ["South", "East", "West", "North"], "B"),
  aptitude("apt-mirror-time", "A clock shows 2:00. The minute hand points to:", ["2", "3", "6", "12"], "D"),
  aptitude("apt-ages", "A is twice as old as B. If B is 10, A is:", ["5", "15", "20", "30"], "C"),
  aptitude("apt-share-money", "Split $90 equally among 3 people. Each gets:", ["$20", "$25", "$30", "$45"], "C"),
  aptitude("apt-remainder", "What is the remainder when 29 is divided by 5?", ["1", "2", "3", "4"], "D"),
  aptitude("apt-even-product", "Product of two even numbers is always:", ["Odd", "Even", "Prime", "Zero"], "B"),
  aptitude("apt-odd-sum", "Sum of two odd numbers is always:", ["Odd", "Even", "Prime", "Negative"], "B"),
  aptitude("apt-volume-cube", "A cube of side 3 has volume:", ["9", "18", "27", "36"], "C"),
  aptitude("apt-surface-cube", "A cube of side 2 has surface area:", ["8", "16", "24", "32"], "C"),
  aptitude("apt-discount-stack", "Price 100, then 10% off. New price is:", ["80", "90", "95", "110"], "B"),
  aptitude("apt-tax-add", "Price 100 plus 10% tax is:", ["90", "100", "110", "120"], "C"),
  aptitude("apt-sequence-fib", "Next in 1, 1, 2, 3, 5, ... is:", ["6", "7", "8", "9"], "C"),
  aptitude("apt-inequality", "Which is true?", ["3 > 5", "5 < 3", "5 ≥ 5", "5 ≤ 3"], "C"),
  aptitude("apt-modulo", "17 mod 5 equals:", ["1", "2", "3", "4"], "B"),
  aptitude("apt-factorial-4", "4! equals:", ["12", "16", "20", "24"], "D"),
  aptitude("apt-permutation-hint", "How many ways to arrange 2 distinct books on a shelf?", ["1", "2", "3", "4"], "B"),
  aptitude("apt-complement-100", "What number added to 37 makes 100?", ["53", "63", "67", "73"], "B"),
  aptitude("apt-double-half", "Half of double 18 is:", ["9", "18", "27", "36"], "B"),
  aptitude("apt-consecutive", "Sum of three consecutive integers starting at 4 is:", ["12", "15", "18", "21"], "B"),
  aptitude("apt-place-value", "In 5,432 the digit 4 is in the:", ["ones", "tens", "hundreds", "thousands"], "C"),
  aptitude("apt-rounding", "Round 47 to the nearest ten:", ["40", "45", "50", "47"], "C"),
  aptitude("apt-estimate", "Best estimate of 49 × 2 is:", ["50", "80", "100", "200"], "C"),
  aptitude("apt-graph-slope", "A line through (0,0) and (2,4) has slope:", ["1", "2", "3", "4"], "B"),
  aptitude("apt-equation-x", "Solve for x: 2x = 14", ["5", "6", "7", "8"], "C"),
  aptitude("apt-equation-linear", "Solve for x: x + 9 = 20", ["9", "10", "11", "29"], "C"),
  aptitude("apt-distance-formula-simple", "From 0 to 9 on a number line the distance is:", ["0", "8", "9", "18"], "C"),
  aptitude("apt-time-elapsed", "From 9:10 to 9:40 is how many minutes?", ["20", "30", "40", "50"], "B"),
  aptitude("apt-capacity", "How many 250 ml bottles make 1 liter?", ["2", "3", "4", "5"], "C"),
  aptitude("apt-symmetry", "A square has how many lines of symmetry?", ["1", "2", "3", "4"], "D"),
  aptitude("apt-parallel", "Parallel lines:", ["Meet once", "Never meet", "Meet twice", "Are curved"], "B"),
] as const;

function word(id: string, answer: string, scrambled: string): UnscrambleWord {
  return { id, answer, scrambled };
}

function rotatedScramble(answer: string) {
  if (answer.length < 2) return answer;
  return `${answer.slice(1)}${answer[0]}`;
}

export const unscrambleBank: readonly UnscrambleWord[] = [
  word("unsc-habit", "HABIT", "TIBAH"),
  word("unsc-focus", "FOCUS", "CUSFO"),
  word("unsc-health", "HEALTH", "THLAEH"),
  word("unsc-wealth", "WEALTH", "THWELA"),
  word("unsc-nature", "NATURE", "RUTENA"),
  word("unsc-plant", "PLANT", "TNALP"),
  word("unsc-growth", "GROWTH", "WTHGOR"),
  word("unsc-streak", "STREAK", "KAREST"),
  word("unsc-reward", "REWARD", "WARDRE"),
  word("unsc-achieve", "ACHIEVE", "VEHACIE"),
  ...([
    "CALM", "MIND", "PEACE", "BRAVE", "TRUST", "HONOR", "VALUE", "VISION", "ENERGY", "BALANCE",
    "COURAGE", "KINDNESS", "PATIENCE", "PRACTICE", "ROUTINE", "REFLECT", "COMMIT", "PLEDGE", "GARDEN", "FOREST",
    "RIVER", "OCEAN", "MOUNTAIN", "SUNRISE", "SUNSET", "MORNING", "EVENING", "FAMILY", "FRIEND", "SCHOOL",
    "LEARN", "STUDY", "WRITE", "READ", "LISTEN", "SPEAK", "BREATHE", "STRETCH", "MOTION", "STRONG",
    "GENTLE", "HONEST", "HUMBLE", "GRATEFUL", "MINDFUL", "PRESENT", "FUTURE", "MEMORY", "WISDOM", "PURPOSE",
    "MISSION", "PROGRESS", "SUCCESS", "EFFORT", "ACTION", "CHOICE", "CHANGE", "CREATE", "BUILD", "CRAFT",
    "DESIGN", "SYSTEM", "METHOD", "PLAN", "GOAL", "TARGET", "FOCUSED", "CLARITY", "INSIGHT", "SPARK",
    "FLAME", "LIGHT", "SHADOW", "ANCHOR", "COMPASS", "JOURNEY", "PATH", "TRAIL", "BRIDGE", "HARBOR",
    "SHELTER", "HOME", "HEARTH", "NEST", "BLOOM", "SEED", "ROOT", "BRANCH", "LEAF", "STONE",
  ] as const).map((answer) => word(`unsc-${answer.toLowerCase()}`, answer, rotatedScramble(answer))),
] as const;

function sortItem(id: string, item: string, options: readonly [string, string, string], answer: string): SortRound {
  return { id, item, options, answer };
}

export const sortBank: readonly SortRound[] = [
  sortItem("sort-apple", "Apple", ["Food", "Animal", "Object"], "Food"),
  sortItem("sort-dolphin", "Dolphin", ["Plant", "Animal", "Tool"], "Animal"),
  sortItem("sort-hammer", "Hammer", ["Tool", "Food", "Place"], "Tool"),
  sortItem("sort-rose", "Rose", ["Vehicle", "Plant", "Animal"], "Plant"),
  sortItem("sort-bicycle", "Bicycle", ["Vehicle", "Clothing", "Food"], "Vehicle"),
  sortItem("sort-jacket", "Jacket", ["Place", "Tool", "Clothing"], "Clothing"),
  sortItem("sort-banana", "Banana", ["Food", "Tool", "Vehicle"], "Food"),
  sortItem("sort-eagle", "Eagle", ["Animal", "Plant", "Clothing"], "Animal"),
  sortItem("sort-wrench", "Wrench", ["Tool", "Food", "Animal"], "Tool"),
  sortItem("sort-oak", "Oak", ["Plant", "Vehicle", "Clothing"], "Plant"),
  sortItem("sort-train", "Train", ["Vehicle", "Food", "Tool"], "Vehicle"),
  sortItem("sort-scarf", "Scarf", ["Clothing", "Animal", "Plant"], "Clothing"),
  sortItem("sort-bread", "Bread", ["Food", "Place", "Tool"], "Food"),
  sortItem("sort-tiger", "Tiger", ["Animal", "Vehicle", "Food"], "Animal"),
  sortItem("sort-saw", "Saw", ["Tool", "Clothing", "Plant"], "Tool"),
  sortItem("sort-tulip", "Tulip", ["Plant", "Food", "Vehicle"], "Plant"),
  sortItem("sort-boat", "Boat", ["Vehicle", "Animal", "Clothing"], "Vehicle"),
  sortItem("sort-boots", "Boots", ["Clothing", "Tool", "Food"], "Clothing"),
  sortItem("sort-cheese", "Cheese", ["Food", "Vehicle", "Plant"], "Food"),
  sortItem("sort-whale", "Whale", ["Animal", "Tool", "Place"], "Animal"),
  sortItem("sort-drill", "Drill", ["Tool", "Animal", "Food"], "Tool"),
  sortItem("sort-fern", "Fern", ["Plant", "Clothing", "Vehicle"], "Plant"),
  sortItem("sort-bus", "Bus", ["Vehicle", "Plant", "Tool"], "Vehicle"),
  sortItem("sort-hat", "Hat", ["Clothing", "Food", "Animal"], "Clothing"),
  sortItem("sort-rice", "Rice", ["Food", "Tool", "Place"], "Food"),
  sortItem("sort-fox", "Fox", ["Animal", "Clothing", "Vehicle"], "Animal"),
  sortItem("sort-pliers", "Pliers", ["Tool", "Plant", "Food"], "Tool"),
  sortItem("sort-moss", "Moss", ["Plant", "Animal", "Clothing"], "Plant"),
  sortItem("sort-truck", "Truck", ["Vehicle", "Food", "Tool"], "Vehicle"),
  sortItem("sort-gloves", "Gloves", ["Clothing", "Plant", "Animal"], "Clothing"),
  sortItem("sort-orange", "Orange", ["Food", "Vehicle", "Tool"], "Food"),
  sortItem("sort-owl", "Owl", ["Animal", "Plant", "Clothing"], "Animal"),
  sortItem("sort-chisel", "Chisel", ["Tool", "Food", "Vehicle"], "Tool"),
  sortItem("sort-pine", "Pine", ["Plant", "Animal", "Tool"], "Plant"),
  sortItem("sort-scooter", "Scooter", ["Vehicle", "Clothing", "Food"], "Vehicle"),
  sortItem("sort-socks", "Socks", ["Clothing", "Tool", "Plant"], "Clothing"),
  sortItem("sort-yogurt", "Yogurt", ["Food", "Animal", "Vehicle"], "Food"),
  sortItem("sort-horse", "Horse", ["Animal", "Tool", "Clothing"], "Animal"),
  sortItem("sort-ladder", "Ladder", ["Tool", "Food", "Plant"], "Tool"),
  sortItem("sort-daisy", "Daisy", ["Plant", "Vehicle", "Food"], "Plant"),
  sortItem("sort-plane", "Plane", ["Vehicle", "Animal", "Tool"], "Vehicle"),
  sortItem("sort-coat", "Coat", ["Clothing", "Plant", "Food"], "Clothing"),
  sortItem("sort-carrot", "Carrot", ["Food", "Clothing", "Vehicle"], "Food"),
  sortItem("sort-shark", "Shark", ["Animal", "Plant", "Tool"], "Animal"),
  sortItem("sort-screwdriver", "Screwdriver", ["Tool", "Animal", "Clothing"], "Tool"),
  sortItem("sort-cactus", "Cactus", ["Plant", "Vehicle", "Food"], "Plant"),
  sortItem("sort-subway", "Subway", ["Vehicle", "Food", "Plant"], "Vehicle"),
  sortItem("sort-belt", "Belt", ["Clothing", "Animal", "Tool"], "Clothing"),
  sortItem("sort-pasta", "Pasta", ["Food", "Vehicle", "Plant"], "Food"),
  sortItem("sort-bear", "Bear", ["Animal", "Clothing", "Tool"], "Animal"),
  sortItem("sort-axe", "Axe", ["Tool", "Food", "Vehicle"], "Tool"),
  sortItem("sort-willow", "Willow", ["Plant", "Animal", "Clothing"], "Plant"),
  sortItem("sort-ferry", "Ferry", ["Vehicle", "Tool", "Food"], "Vehicle"),
  sortItem("sort-dress", "Dress", ["Clothing", "Plant", "Animal"], "Clothing"),
  sortItem("sort-salmon", "Salmon", ["Food", "Tool", "Clothing"], "Food"),
  sortItem("sort-deer", "Deer", ["Animal", "Vehicle", "Plant"], "Animal"),
  sortItem("sort-mallet", "Mallet", ["Tool", "Food", "Clothing"], "Tool"),
  sortItem("sort-ivy", "Ivy", ["Plant", "Vehicle", "Animal"], "Plant"),
  sortItem("sort-tram", "Tram", ["Vehicle", "Plant", "Food"], "Vehicle"),
  sortItem("sort-tie", "Tie", ["Clothing", "Tool", "Animal"], "Clothing"),
  sortItem("sort-mango", "Mango", ["Food", "Vehicle", "Tool"], "Food"),
  sortItem("sort-panda", "Panda", ["Animal", "Clothing", "Plant"], "Animal"),
  sortItem("sort-clamp", "Clamp", ["Tool", "Food", "Vehicle"], "Tool"),
  sortItem("sort-bamboo", "Bamboo", ["Plant", "Animal", "Clothing"], "Plant"),
  sortItem("sort-helicopter", "Helicopter", ["Vehicle", "Food", "Tool"], "Vehicle"),
  sortItem("sort-sweater", "Sweater", ["Clothing", "Plant", "Animal"], "Clothing"),
  sortItem("sort-avocado", "Avocado", ["Food", "Tool", "Vehicle"], "Food"),
  sortItem("sort-otter", "Otter", ["Animal", "Clothing", "Tool"], "Animal"),
  sortItem("sort-file", "File", ["Tool", "Food", "Plant"], "Tool"),
  sortItem("sort-lilac", "Lilac", ["Plant", "Vehicle", "Food"], "Plant"),
  sortItem("sort-van", "Van", ["Vehicle", "Animal", "Clothing"], "Vehicle"),
  sortItem("sort-cap", "Cap", ["Clothing", "Tool", "Plant"], "Clothing"),
  sortItem("sort-pepper", "Pepper", ["Food", "Animal", "Vehicle"], "Food"),
  sortItem("sort-rabbit", "Rabbit", ["Animal", "Tool", "Clothing"], "Animal"),
  sortItem("sort-ruler", "Ruler", ["Tool", "Food", "Animal"], "Tool"),
  sortItem("sort-cedar", "Cedar", ["Plant", "Clothing", "Vehicle"], "Plant"),
  sortItem("sort-kayak", "Kayak", ["Vehicle", "Plant", "Food"], "Vehicle"),
  sortItem("sort-shorts", "Shorts", ["Clothing", "Animal", "Tool"], "Clothing"),
] as const;

export function isContentGameId(gameId: string): gameId is ContentGameId {
  return (CONTENT_GAME_IDS as readonly string[]).includes(gameId);
}

export function aptitudeById(id: string) {
  return aptitudeBank.find((item) => item.id === id) ?? null;
}

export function unscrambleById(id: string) {
  return unscrambleBank.find((item) => item.id === id) ?? null;
}

export function sortById(id: string) {
  return sortBank.find((item) => item.id === id) ?? null;
}

export function contentBankIds(gameId: ContentGameId): readonly string[] {
  if (gameId === "aptitude-bliss") return aptitudeBank.map((item) => item.id);
  if (gameId === "unscramble-word") return unscrambleBank.map((item) => item.id);
  return sortBank.map((item) => item.id);
}
