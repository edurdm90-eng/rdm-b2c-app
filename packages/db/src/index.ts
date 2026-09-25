import { env } from "@rdm-b2c/env/server";
import mongoose, { type ConnectOptions } from "mongoose";

const databaseName = "rdm-business";
const connectionParts = env.DATABASE_URL.match(
  /^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/[^?]*)?(\?.*)?$/,
);
const authority = connectionParts?.[1];
if (!authority) throw new Error("DATABASE_URL must be a valid MongoDB connection string");
const databaseUrl = `${authority}/${databaseName}${connectionParts?.[2] ?? ""}`;

await mongoose.connect(databaseUrl, {
  // Serverless instances reuse this module while warm. A bounded pool avoids
  // multiplying Atlas connections during traffic spikes and releases idle
  // sockets promptly after an instance cools down.
  maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
} as ConnectOptions);

const client = mongoose.connection.getClient().db(databaseName);

export { client, databaseName };
export { goodDeedCatalog, goodDeedIds } from "./good-deeds";
export { MedaaConversation, MedaaUsage, type MedaaConversationRecord } from "./models/medaa.model";
export {
  GameSession,
  Goal,
  GoalGroup,
  GoodDeedEntry,
  GratitudeEntry,
  Habit,
  RdmProfile,
  Referral,
  TreeCareActivity,
  gratitudeCategoryIds,
  habitOutcomes,
  habitSources,
  habitStages,
  transactionKinds,
  treeCareKinds,
} from "./models/rdm.model";
