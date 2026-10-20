import { and, asc, cosineDistance, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks, documents } from "@/lib/db/schema";

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

export async function updateChunkEmbedding(chunkId: string, embedding: number[]): Promise<void> {
  await db.update(documentChunks).set({ embedding }).where(eq(documentChunks.id, chunkId));
}

const chunkSearchFields = {
  chunkId: documentChunks.id,
  documentId: documentChunks.documentId,
  content: documentChunks.content,
  pageStart: documentChunks.pageStart,
  pageEnd: documentChunks.pageEnd,
  sectionHeading: documentChunks.sectionHeading,
  documentTitle: documents.title,
  documentNumber: documents.documentNumber,
  revision: documents.revision,
  status: documents.status,
};

export interface ChunkSearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  sectionHeading: string | null;
  documentTitle: string;
  documentNumber: string;
  revision: string;
  status: string;
  score: number;
}

/** Cosine similarity search over document_chunks.embedding, scoped to allowed documents. */
export async function searchChunksByVector(
  queryEmbedding: number[],
  documentIds: string[],
  limit: number,
): Promise<ChunkSearchResult[]> {
  if (documentIds.length === 0) {
    return [];
  }

  const distance = sql<number>`${cosineDistance(documentChunks.embedding, queryEmbedding)}`;

  const rows = await db
    .select({ ...chunkSearchFields, distance })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .where(
      and(inArray(documentChunks.documentId, documentIds), isNotNull(documentChunks.embedding)),
    )
    .orderBy(asc(distance))
    .limit(limit);

  return rows.map(({ distance: d, ...rest }) => ({ ...rest, score: 1 - d }));
}

/** PostgreSQL full-text search (config 'simple': Indonesian has no built-in FTS dictionary). */
export async function searchChunksByFullText(
  query: string,
  documentIds: string[],
  limit: number,
): Promise<ChunkSearchResult[]> {
  if (documentIds.length === 0 || query.trim().length === 0) {
    return [];
  }

  const tsquery = sql`plainto_tsquery('simple', ${query})`;
  const rank = sql<number>`ts_rank(to_tsvector('simple', ${documentChunks.content}), ${tsquery})`;

  const rows = await db
    .select({ ...chunkSearchFields, rank })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .where(
      and(
        inArray(documentChunks.documentId, documentIds),
        sql`to_tsvector('simple', ${documentChunks.content}) @@ ${tsquery}`,
      ),
    )
    .orderBy(desc(rank))
    .limit(limit);

  return rows.map(({ rank: r, ...rest }) => ({ ...rest, score: r }));
}
