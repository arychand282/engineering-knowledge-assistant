import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentPages } from "@/lib/db/schema";

export type NewDocumentPage = typeof documentPages.$inferInsert;
export type DocumentPageRow = typeof documentPages.$inferSelect;

export async function insertPages(pages: NewDocumentPage[]): Promise<DocumentPageRow[]> {
  if (pages.length === 0) {
    return [];
  }
  return db.insert(documentPages).values(pages).returning();
}

export async function listPagesByDocumentId(documentId: string): Promise<DocumentPageRow[]> {
  return db
    .select()
    .from(documentPages)
    .where(eq(documentPages.documentId, documentId))
    .orderBy(asc(documentPages.pageNumber));
}

export async function deletePagesByDocumentId(documentId: string): Promise<void> {
  await db.delete(documentPages).where(eq(documentPages.documentId, documentId));
}
