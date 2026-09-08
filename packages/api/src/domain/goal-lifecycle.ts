export type PersonalGoalStatus = "active" | "completed" | "missed";

export type PersonalGoalState = {
  status: PersonalGoalStatus;
  progress: number;
  startDayKey: string;
  endDayKey: string;
};

export type PersonalGoalCommand =
  | { type: "progress"; progress: number }
  | { type: "complete" }
  | { type: "miss" }
  | { type: "expire" };

export function personalGoalTransition({ goal, command, currentDayKey }: {
  goal: PersonalGoalState;
  command: PersonalGoalCommand;
  currentDayKey: string;
}): { status: PersonalGoalStatus; progress: number; destination: "reward" | "remorse" | null } {
  if (goal.status !== "active") throw new Error(`This goal is already ${goal.status}.`);
  if (command.type === "expire") {
    if (currentDayKey < goal.endDayKey) throw new Error("This goal has not ended yet.");
    return { status: "missed", progress: goal.progress, destination: "remorse" };
  }
  if (currentDayKey >= goal.endDayKey) throw new Error("This goal has reached its deadline.");
  if (currentDayKey < goal.startDayKey) throw new Error("This goal has not started yet.");
  if (command.type === "complete") return { status: "completed", progress: 100, destination: "reward" };
  if (command.type === "miss") return { status: "missed", progress: goal.progress, destination: "remorse" };
  if (!Number.isInteger(command.progress) || command.progress < 0 || command.progress > 99) {
    throw new Error("Progress must be a whole number between 0 and 99. Use Complete goal when finished.");
  }
  return { status: "active", progress: command.progress, destination: null };
}
