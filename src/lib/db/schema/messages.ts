import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

export const answerStatusEnum = pgEnum("answer_status", [
  "answered",
  "insufficient_evidence",
  "conflict_detected",
  "needs_human_review",
  "error",
]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  answerStatus: answerStatusEnum("answer_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
