import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import type { ListDocumentsQuery } from "@/server/dto/documents.dto";

export type NewDocument = typeof documents.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;

export async function insertDocument(values: NewDocument): Promise<DocumentRow> {
  const [row] = await db.insert(documents).values(values).returning();
  return row;
}

export async function findDocumentById(id: string): Promise<DocumentRow | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  return row ?? null;
}

export async function findDocumentBySha256(sha256: string): Promise<DocumentRow | null> {
  const [row] = await db.select().from(documents).where(eq(documents.sha256, sha256));
  return row ?? null;
}

export interface ListDocumentsResult {
  items: DocumentRow[];
  total: number;
}

export async function listDocuments(filter: ListDocumentsQuery): Promise<ListDocumentsResult> {
  const conditions = [];
  if (filter.status) {
    conditions.push(eq(documents.status, filter.status));
  }
  if (filter.documentType) {
    conditions.push(eq(documents.documentType, filter.documentType));
  }
  if (filter.search) {
    const pattern = `%${filter.search}%`;
    conditions.push(or(ilike(documents.title, pattern), ilike(documents.documentNumber, pattern)));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(desc(documents.createdAt))
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(whereClause),
  ]);

  return { items, total: totalRows[0]?.count ?? 0 };
}
