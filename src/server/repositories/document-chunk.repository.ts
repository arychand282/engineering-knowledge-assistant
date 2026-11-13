import { and, asc, cosineDistance, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks, documents } from "@/lib/db/schema";
import { buildOrTsQuery } from "@/lib/retrieval/build-or-tsquery";

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

/**
 * Cosine similarity search over document_chunks.embedding, scoped to allowed documents.
 * `scoreMargin` drops any result scoring more than `scoreMargin` below the TOP match for
 * this query (see VECTOR_SIMILARITY_MARGIN in env.ts for why — a small document set lets
 * clearly unrelated chunks fill out the top-`limit` results just because there aren't
 * enough real candidates to outrank them). This is relative, not an absolute cutoff: an
 * absolute similarity floor was tried first and rejected because baseline cosine scores
 * for CLEARLY unrelated content shift a lot by language/content (measured ~0.48 on one
 * corpus, ~0.63 on another, for content with nothing to do with the query in both cases)
 * — no single global number separates relevant from irrelevant across corpora. The GAP
 * between the best match and an unrelated one stayed wide (~0.25-0.29) on both, which is
 * what this filters on instead.
 */
export async function searchChunksByVector(
  queryEmbedding: number[],
  documentIds: string[],
  limit: number,
  scoreMargin: number,
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

  if (rows.length === 0) {
    return [];
  }

  const topScore = 1 - rows[0].distance;
  const minScore = topScore - scoreMargin;

  return rows
    .map(({ distance: d, ...rest }) => ({ ...rest, score: 1 - d }))
    .filter((row) => row.score >= minScore);
}

/**
 * PostgreSQL full-text search (config 'simple': Indonesian has no built-in FTS
 * dictionary). Uses OR semantics (buildOrTsQuery) rather than plainto_tsquery's AND —
 * a natural-language question's own words (e.g. "bagaimana", "apa") otherwise have to
 * literally appear in the matched content too, which fails almost every real question.
 *
 * `scoreRatio` drops any result scoring below `scoreRatio * topScore` (see
 * FULLTEXT_SCORE_RATIO in env.ts). This is the full-text counterpart to
 * searchChunksByVector's `scoreMargin`, needed for the same reason — OR semantics plus
 * 'simple' config (no stopword removal) means common English words like "is"/"the"/"for"
 * are indexed and OR-matched like any other word, so a query can trivially match a
 * completely unrelated document that just happens to share those. Measured: an unrelated
 * document scored ~44-46% of the top match's ts_rank on filler-word overlap alone, while
 * a genuinely-relevant second match (two conflicting document revisions, both legitimately
 * on-topic) scored ~88% — a RATIO threshold is used here rather than a subtracted margin
 * because ts_rank's absolute scale isn't normalized (it varies with document/chunk length
 * in a way cosine similarity doesn't), so a fixed point difference doesn't transfer across
 * content the way a fixed similarity gap does for vector search.
 */
export async function searchChunksByFullText(
  query: string,
  documentIds: string[],
  limit: number,
  scoreRatio: number,
): Promise<ChunkSearchResult[]> {
  const orQuery = buildOrTsQuery(query);
  if (documentIds.length === 0 || orQuery.length === 0) {
    return [];
  }

  const tsquery = sql`to_tsquery('simple', ${orQuery})`;
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

  if (rows.length === 0) {
    return [];
  }

  const topScore = rows[0].rank;
  const minScore = topScore * scoreRatio;

  return rows
    .map(({ rank: r, ...rest }) => ({ ...rest, score: r }))
    .filter((row) => row.score >= minScore);
}
