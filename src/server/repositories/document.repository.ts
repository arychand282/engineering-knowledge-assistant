import { and, desc, eq, getTableColumns, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, users } from "@/lib/db/schema";
import type { ListDocumentsQuery } from "@/server/dto/documents.dto";

export type NewDocument = typeof documents.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;

/** DocumentRow plus the approver's email resolved via a join — `approvedByEmail` is
 * null whenever `approvedBy` is (not yet approved, or the approving user was deleted). */
export interface DocumentWithApprover extends DocumentRow {
  approvedByEmail: string | null;
}

const documentWithApproverColumns = {
  ...getTableColumns(documents),
  approvedByEmail: users.email,
};

export async function insertDocument(values: NewDocument): Promise<DocumentRow> {
  const [row] = await db.insert(documents).values(values).returning();
  return row;
}

export async function findDocumentById(id: string): Promise<DocumentWithApprover | null> {
  const [row] = await db
    .select(documentWithApproverColumns)
    .from(documents)
    .leftJoin(users, eq(users.id, documents.approvedBy))
    .where(eq(documents.id, id));
  return row ?? null;
}

export async function updateDocumentById(
  id: string,
  patch: Partial<NewDocument>,
): Promise<DocumentRow | null> {
  const [row] = await db
    .update(documents)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(documents.id, id))
    .returning();
  return row ?? null;
}

export async function findDocumentBySha256(sha256: string): Promise<DocumentRow | null> {
  const [row] = await db.select().from(documents).where(eq(documents.sha256, sha256));
  return row ?? null;
}

export async function findDocumentsByIds(ids: string[]): Promise<DocumentRow[]> {
  if (ids.length === 0) {
    return [];
  }
  return db.select().from(documents).where(inArray(documents.id, ids));
}

export interface ListDocumentsResult {
  items: DocumentWithApprover[];
  total: number;
}

export async function listDocuments(
  filter: ListDocumentsQuery,
  restrictToDocumentIds?: string[],
): Promise<ListDocumentsResult> {
  const conditions = [];
  if (restrictToDocumentIds) {
    if (restrictToDocumentIds.length === 0) {
      return { items: [], total: 0 };
    }
    conditions.push(inArray(documents.id, restrictToDocumentIds));
  }
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
      .select(documentWithApproverColumns)
      .from(documents)
      .leftJoin(users, eq(users.id, documents.approvedBy))
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
