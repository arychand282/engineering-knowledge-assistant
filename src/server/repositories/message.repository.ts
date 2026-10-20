import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";

export type NewMessage = typeof messages.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;

export async function insertMessage(values: NewMessage): Promise<MessageRow> {
  const [row] = await db.insert(messages).values(values).returning();
  return row;
}

export async function listMessagesByConversationId(conversationId: string): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}
