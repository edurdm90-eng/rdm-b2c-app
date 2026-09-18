import { client, RdmProfile } from "@rdm-b2c/db";
import type { ObjectId } from "mongodb";

import { signupAirdropUserFilter } from "./signup-airdrop-id";

/** Credits only accounts marked eligible by the server when they were created. */
export async function grantSignupAirdrop(userId: string): Promise<void> {
  const operationId = `signup-airdrop:${userId}`;
  if (await RdmProfile.exists({ userId, creditedOperations: operationId })) return;
  const user = await client.collection<{ _id: string | ObjectId; signupAirdropEligible?: boolean }>("user").findOne(
    signupAirdropUserFilter(userId),
    { projection: { _id: 1 } },
  );
  if (!user) return;

  try {
    await RdmProfile.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === 11000)) throw error;
  }
  await RdmProfile.updateOne({ userId, creditedOperations: { $ne: operationId } }, {
    $inc: { walletBalance: 500 },
    $addToSet: { creditedOperations: operationId },
    $push: { transactions: { $each: [{
      title: "Welcome airdrop", amount: 500, kind: "airdrop", operationId, createdAt: new Date(),
    }], $position: 0 } },
  });
}
