import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks } from "@/lib/db/schema";

export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type DocumentChunkRow = typeof documentChunks.$inferSelect;

export async function insertChunks(chunks: NewDocumentChunk[]): Promise<DocumentChunkRow[]> {
  if (chunks.length === 0) {
    return [];
  }
  return db.insert(documentChunks).values(chunks).returning();
}

export async function countChunksByDocumentId(documentId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId));
  return row?.count ?? 0;
}

export async function deleteChunksByDocumentId(documentId: string): Promise<void> {
  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
}
