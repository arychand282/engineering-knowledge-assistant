import {
  EmbeddingDimensionMismatchError,
  OllamaUnavailableError,
  embedTexts,
} from "@/lib/ai/ollama-client";
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
  /** false when the local embedding runtime was unreachable — results are full-text only. */
  vectorSearchAvailable: boolean;
}

/**
 * Hybrid retrieval: full-text search always runs; vector search runs only if the local
 * embedding runtime responds. Access is filtered BEFORE either search runs — a user
 * with no accessible documents never reaches the database with their query
 * (PLANNING.md #10: "Filter akses harus diterapkan sebelum retrieval").
 */
export async function searchDocuments(input: SearchDocumentsInput): Promise<SearchDocumentsResult> {
  const limit = input.limit ?? 10;
  const accessibleDocumentIds = await getAccessibleDocumentIds(input.userId);

  if (accessibleDocumentIds.length === 0) {
    return { results: [], vectorSearchAvailable: false };
  }

  const fullTextResults = await searchChunksByFullText(input.query, accessibleDocumentIds, limit);

  let vectorResults: ChunkSearchResult[] = [];
  let vectorSearchAvailable = true;
  try {
    const [queryEmbedding] = await embedTexts([input.query]);
    vectorResults = await searchChunksByVector(queryEmbedding, accessibleDocumentIds, limit);
  } catch (error) {
    if (
      error instanceof OllamaUnavailableError ||
      error instanceof EmbeddingDimensionMismatchError
    ) {
      vectorSearchAvailable = false;
    } else {
      throw error;
    }
  }

  const merged = mergeRankedResults([vectorResults, fullTextResults], {
    idOf: (result) => result.chunkId,
    limit,
  });

  return {
    results: merged.map((entry) => ({ ...entry.item, sources: entry.sources })),
    vectorSearchAvailable,
  };
}
