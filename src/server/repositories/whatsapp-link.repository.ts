import { eq, getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, whatsappLinks } from "@/lib/db/schema";

export type WhatsappLinkRow = typeof whatsappLinks.$inferSelect;

export interface WhatsappLinkWithUser extends WhatsappLinkRow {
  userEmail: string;
}

const linkWithUserColumns = {
  ...getTableColumns(whatsappLinks),
  userEmail: users.email,
};

export async function listWhatsappLinks(): Promise<WhatsappLinkWithUser[]> {
  return db
    .select(linkWithUserColumns)
    .from(whatsappLinks)
    .innerJoin(users, eq(users.id, whatsappLinks.userId));
}

export async function findWhatsappLinkByPhone(
  phoneNumber: string,
): Promise<WhatsappLinkRow | null> {
  const [row] = await db
    .select()
    .from(whatsappLinks)
    .where(eq(whatsappLinks.phoneNumber, phoneNumber));
  return row ?? null;
}

export async function findWhatsappLinkByUserId(userId: string): Promise<WhatsappLinkRow | null> {
  const [row] = await db.select().from(whatsappLinks).where(eq(whatsappLinks.userId, userId));
  return row ?? null;
}

export async function insertWhatsappLink(values: {
  phoneNumber: string;
  userId: string;
  linkedBy: string;
}): Promise<WhatsappLinkRow> {
  const [row] = await db.insert(whatsappLinks).values(values).returning();
  return row;
}

export async function deleteWhatsappLink(linkId: string): Promise<boolean> {
  const deleted = await db
    .delete(whatsappLinks)
    .where(eq(whatsappLinks.id, linkId))
    .returning({ id: whatsappLinks.id });
  return deleted.length > 0;
}

/** Called once per phone number the first time it messages in, so every later message
 * from the same number reuses the same conversation (and its chat history). */
export async function setCurrentConversation(
  linkId: string,
  conversationId: string,
): Promise<void> {
  await db
    .update(whatsappLinks)
    .set({ currentConversationId: conversationId })
    .where(eq(whatsappLinks.id, linkId));
}
