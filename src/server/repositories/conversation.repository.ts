import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";

export type NewConversation = typeof conversations.$inferInsert;
export type ConversationRow = typeof conversations.$inferSelect;

export async function insertConversation(values: NewConversation): Promise<ConversationRow> {
  const [row] = await db.insert(conversations).values(values).returning();
  return row;
}

export async function findConversationById(id: string): Promise<ConversationRow | null> {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
  return row ?? null;
}

/** Ownership-scoped lookup — callers must use this (not findConversationById) to prevent IDOR. */
export async function findConversationByIdForUser(
  id: string,
  userId: string,
): Promise<ConversationRow | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  return row ?? null;
}

export async function listConversationsByUser(userId: string): Promise<ConversationRow[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
}

export async function touchConversation(id: string): Promise<void> {
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));
}

export async function deleteConversation(id: string): Promise<void> {
  await db.delete(conversations).where(eq(conversations.id, id));
}
