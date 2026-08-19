import { env } from "@rdm-b2c/env/server";
import mongoose from "mongoose";

await mongoose.connect(env.DATABASE_URL);

const client = mongoose.connection.getClient().db();

export { client };
export { GameSession, GoalGroup, Habit, RdmProfile, Referral, habitOutcomes, habitSources, habitStages, transactionKinds } from "./models/rdm.model";
