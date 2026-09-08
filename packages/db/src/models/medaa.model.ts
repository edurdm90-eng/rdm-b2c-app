import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema } = mongoose;

export interface MedaaConversationRecord {
  userId: string;
  creationId: string;
  title: string;
  timeZone: string;
  revision: number;
  messages: Array<{ id: string; role: "user" | "assistant"; text: string; createdAt: Date }>;
  drafts: Array<{
    id: string;
    content: { type: "habit" | "goal"; title: string; category: string; target: string;
      pledge: string | null; weekdays: number[]; durationDays: number | null };
    version: number;
    status: "draft" | "setting" | "created";
    review: { id: string; startDayKey: string; endDayKey: string; timeZone: string;
      pledgeAmount: number; scheduledDays: number; totalPledge: number } | null;
    entityId: string | null;
  }>;
  pendingRequestId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  failedRequestId: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const contentSchema = new Schema({
  type: { type: String, enum: ["habit", "goal"], required: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  target: { type: String, required: true },
  pledge: { type: String, default: null },
  weekdays: { type: [Number], required: true, default: [] },
  durationDays: { type: Number, default: null },
}, { _id: false });

const reviewSchema = new Schema({
  id: { type: String, required: true },
  startDayKey: { type: String, required: true },
  endDayKey: { type: String, required: true },
  timeZone: { type: String, required: true },
  pledgeAmount: { type: Number, required: true },
  scheduledDays: { type: Number, required: true },
  totalPledge: { type: Number, required: true },
}, { _id: false });

const draftSchema = new Schema({
  id: { type: String, required: true },
  content: { type: contentSchema, required: true },
  version: { type: Number, required: true, default: 0 },
  status: { type: String, enum: ["draft", "setting", "created"], required: true, default: "draft" },
  review: { type: reviewSchema, default: null },
  entityId: { type: String, default: null },
}, { _id: false });

const messageSchema = new Schema({
  id: { type: String, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, required: true },
}, { _id: false });

const conversationSchema = new Schema<MedaaConversationRecord>({
  userId: { type: String, required: true },
  creationId: { type: String, required: true },
  title: { type: String, required: true, default: "New conversation" },
  timeZone: { type: String, required: true },
  revision: { type: Number, required: true, default: 0 },
  messages: { type: [messageSchema], required: true, default: [] },
  drafts: { type: [draftSchema], required: true, default: [] },
  pendingRequestId: { type: String, default: null },
  leaseToken: { type: String, default: null },
  leaseExpiresAt: { type: Date, default: null },
  failedRequestId: { type: String, default: null },
  failureMessage: { type: String, default: null },
}, { timestamps: true, collection: "medaaconversations" });

conversationSchema.index({ userId: 1, creationId: 1 }, { unique: true });
conversationSchema.index({ userId: 1, updatedAt: -1 });

const usageSchema = new Schema({
  userId: { type: String, required: true },
  dayKey: { type: String, required: true },
  requests: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { collection: "medaausage" });

usageSchema.index({ userId: 1, dayKey: 1 }, { unique: true });
usageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MedaaConversation = (mongoose.models.MedaaConversation
  ?? mongoose.model("MedaaConversation", conversationSchema)) as Model<MedaaConversationRecord>;
export const MedaaUsage = (mongoose.models.MedaaUsage
  ?? mongoose.model("MedaaUsage", usageSchema)) as Model<InferSchemaType<typeof usageSchema>>;
