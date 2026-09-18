import { ObjectId } from "mongodb";

/**
 * Better Auth exposes user ids as strings. Some of those strings are valid
 * ObjectId text, but the stored `_id` can still be a BSON string. Query both
 * representations so an eligible account is never skipped by type alone.
 */
export function signupAirdropUserFilter(userId: string) {
  const ids: Array<string | ObjectId> = [userId];
  if (ObjectId.isValid(userId)) ids.push(new ObjectId(userId));
  return { _id: { $in: ids }, signupAirdropEligible: true };
}
