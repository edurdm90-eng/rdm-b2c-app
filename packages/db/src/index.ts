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
export { GameSession, GoalGroup, Habit, RdmProfile, Referral, habitOutcomes, habitSources, habitStages, transactionKinds } from "./models/rdm.model";
