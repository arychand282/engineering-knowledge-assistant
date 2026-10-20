import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messageSources } from "@/lib/db/schema";

export type NewMessageSource = typeof messageSources.$inferInsert;
export type MessageSourceRow = typeof messageSources.$inferSelect;

export async function insertMessageSources(
  sources: NewMessageSource[],
): Promise<MessageSourceRow[]> {
  if (sources.length === 0) {
    return [];
  }
  return db.insert(messageSources).values(sources).returning();
}

export async function listMessageSourcesByMessageId(
  messageId: string,
): Promise<MessageSourceRow[]> {
  return db.select().from(messageSources).where(eq(messageSources.messageId, messageId));
}
