import {
  EmbeddingDimensionMismatchError,
  EmbeddingProviderUnavailableError,
  embedTexts,
} from "@/lib/ai/embedding";
import { rerankChunkIds } from "@/lib/ai/rerank";
import { env } from "@/lib/env";
import { mergeRankedResults } from "@/lib/retrieval/merge-results";
import { getAccessibleDocumentIds } from "@/server/repositories/document-access.repository";
import {
  type ChunkSearchResult,
  searchChunksByFullText,
  searchChunksByVector,
} from "@/server/repositories/document-chunk.repository";

export interface SearchDocumentsInput {
  query: string;
  userId: string;
  limit?: number;
}

export interface SearchResultItem extends ChunkSearchResult {
  sources: Array<"vector" | "fulltext">;
}

export interface SearchDocumentsResult {
  results: SearchResultItem[];
  /** false when the configured embedding provider was unreachable — results are full-text only. */
  vectorSearchAvailable: boolean;
  /** true only when RERANK_ENABLED actually reordered results this call (not just configured). */
  reranked: boolean;
}

let warnedRerankSkippedExternalProvider = false;

/**
 * Hybrid retrieval: full-text search always runs; vector search runs only if the
 * configured embedding provider (EMBEDDING_PROVIDER) responds. Access is filtered
 * BEFORE either search runs — a user
 * with no accessible documents never reaches the database with their query
 * (PLANNING.md #10: "Filter akses harus diterapkan sebelum retrieval").
 *
 * When RERANK_ENABLED, a wider candidate pool (RERANK_CANDIDATE_LIMIT per search type)
 * is fetched and RRF-merged WITHOUT truncating to `limit` yet, so the reranker has more
 * than `limit` candidates to actually choose from — reranking a pool already cut down
 * to `limit` would only reorder it, never surface a better candidate RRF ranked lower.
 */
export async function searchDocuments(input: SearchDocumentsInput): Promise<SearchDocumentsResult> {
  const limit = input.limit ?? 10;
  const rerankEnabled = env.RERANK_ENABLED && env.CHAT_PROVIDER === "local";
  if (env.RERANK_ENABLED && env.CHAT_PROVIDER !== "local" && !warnedRerankSkippedExternalProvider) {
    warnedRerankSkippedExternalProvider = true;
    console.warn(
      `[search-documents] RERANK_ENABLED=true but CHAT_PROVIDER="${env.CHAT_PROVIDER}" — reranking ` +
        "skipped (the reranker only uses a local model via Ollama, see src/lib/ai/rerank.ts).",
    );
  }
  const candidateLimit = rerankEnabled ? Math.max(limit, env.RERANK_CANDIDATE_LIMIT) : limit;

  const accessibleDocumentIds = await getAccessibleDocumentIds(input.userId);

  if (accessibleDocumentIds.length === 0) {
    return { results: [], vectorSearchAvailable: false, reranked: false };
  }

  const fullTextResults = await searchChunksByFullText(
    input.query,
    accessibleDocumentIds,
    candidateLimit,
    env.FULLTEXT_SCORE_RATIO,
  );

  let vectorResults: ChunkSearchResult[] = [];
  let vectorSearchAvailable = true;
  try {
    const [queryEmbedding] = await embedTexts([input.query]);
    vectorResults = await searchChunksByVector(
      queryEmbedding,
      accessibleDocumentIds,
      candidateLimit,
      env.VECTOR_SIMILARITY_MARGIN,
    );
  } catch (error) {
    if (
      error instanceof EmbeddingProviderUnavailableError ||
      error instanceof EmbeddingDimensionMismatchError
    ) {
      vectorSearchAvailable = false;
    } else {
      throw error;
    }
  }

  const merged = mergeRankedResults([vectorResults, fullTextResults], {
    idOf: (result) => result.chunkId,
    limit: candidateLimit,
  });

  let ordered = merged;
  let reranked = false;
  if (rerankEnabled && merged.length > 1) {
    const rerankedIds = await rerankChunkIds(
      input.query,
      merged.map((entry) => ({ chunkId: entry.item.chunkId, content: entry.item.content })),
    );
    if (rerankedIds) {
      const byId = new Map(merged.map((entry) => [entry.item.chunkId, entry]));
      ordered = rerankedIds
        .map((id) => byId.get(id))
        .filter((entry): entry is (typeof merged)[number] => entry !== undefined);
      reranked = true;
    }
  }

  return {
    results: ordered.slice(0, limit).map((entry) => ({ ...entry.item, sources: entry.sources })),
    vectorSearchAvailable,
    reranked,
  };
}
