import { MedaaConversation } from "@rdm-b2c/db";

import type { GoalCreateInput, HabitCreateInput } from "../domain/commitment-input";
import { medaaDraftContentSchema } from "../domain/medaa";
import { goalDurationWindow, habitPledgeSchedule } from "../domain/rdm";

type CommitmentInput =
  | { type: "habit"; input: HabitCreateInput }
  | { type: "goal"; input: GoalCreateInput };

/** A frozen Set approval permits only an exact retry of its original schedule. */
export async function hasMedaaCommitmentApproval(userId: string, commitment: CommitmentInput): Promise<boolean> {
  const stored = await MedaaConversation.findOne({
    userId,
    drafts: { $elemMatch: {
      status: "setting",
      "review.id": commitment.input.creationId,
      "content.type": commitment.type,
    } },
  }).select("drafts").lean();
  if (!stored) return false;

  return stored.drafts.some((draft) => {
    const review = draft.review;
    if (draft.status !== "setting" || !review || review.id !== commitment.input.creationId) return false;
    const parsedContent = medaaDraftContentSchema.safeParse(draft.content);
    if (!parsedContent.success) return false;
    const content = parsedContent.data;
    if (content.type !== commitment.type || content.durationDays === null
      || content.title !== commitment.input.title || content.category !== commitment.input.category
      || content.target !== commitment.input.target || review.timeZone !== commitment.input.timeZone) {
      return false;
    }
    const window = goalDurationWindow(review.startDayKey, content.durationDays);
    if (!window || window.endDayKey !== review.endDayKey) return false;

    if (commitment.type === "goal") {
      const input = commitment.input;
      return input.startDayKey === review.startDayKey
        && input.durationDays === content.durationDays
        && input.pledgeAmount === review.pledgeAmount
        && review.totalPledge === input.pledgeAmount
        && review.scheduledDays === input.durationDays;
    }

    const input = commitment.input;
    const weekdays = input.rdmPledgeWeekdays ?? [1, 2, 3, 4, 5, 6, 7];
    if (input.rdmPledgeStartDayKey !== review.startDayKey
      || input.rdmPledgeEndDayKey !== review.endDayKey
      || input.rdmPledgePerDay !== review.pledgeAmount
      || input.pledge !== content.pledge
      || input.source !== "custom" || (input.icon ?? "target") !== "target"
      || input.cadence !== "Custom weekly"
      || weekdays.length !== content.weekdays.length || new Set(weekdays).size !== weekdays.length
      || weekdays.some((day) => !content.weekdays.includes(day))) {
      return false;
    }
    const schedule = habitPledgeSchedule({
      startDayKey: review.startDayKey,
      endDayKey: review.endDayKey,
      dailyPledge: input.rdmPledgePerDay,
      weekdays,
    });
    return Boolean(schedule && schedule.dayCount === review.scheduledDays
      && schedule.totalPledge === review.totalPledge);
  });
}
