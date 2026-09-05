import { env } from "@rdm-b2c/env/server";
import mongoose from "mongoose";

const databaseName = "rdm-business";
const connectionParts = env.DATABASE_URL.match(
  /^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/[^?]*)?(\?.*)?$/,
);
const authority = connectionParts?.[1];
if (!authority) throw new Error("DATABASE_URL must be a valid MongoDB connection string");
const databaseUrl = `${authority}/${databaseName}${connectionParts?.[2] ?? ""}`;

await mongoose.connect(databaseUrl);

const client = mongoose.connection.getClient().db(databaseName);

export { client, databaseName };
export { goodDeedCatalog, goodDeedIds } from "./good-deeds";
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
