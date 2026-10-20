import {
  EmbeddingDimensionMismatchError,
  OllamaUnavailableError,
  embedTexts,
} from "@/lib/ai/ollama-client";
import {
  type DocumentChunkRow,
  updateChunkEmbedding,
} from "@/server/repositories/document-chunk.repository";

export interface EmbedChunksResult {
  embeddedCount: number;
  /** true when embedding was skipped because the local AI runtime was unreachable. */
  skipped: boolean;
}

/**
 * Best-effort: if the local embedding runtime is unavailable, chunks are left with a
 * null `embedding` (still full-text searchable) rather than failing the whole upload —
 * ingestion must not depend on the AI runtime being up. Callers must surface
 * `embeddedCount`/`skipped` to the caller rather than silently reporting success
 * (PLANNING.md: "jangan berpura-pura berhasil").
 */
export async function embedChunks(chunks: DocumentChunkRow[]): Promise<EmbedChunksResult> {
  if (chunks.length === 0) {
    return { embeddedCount: 0, skipped: false };
  }

  let vectors: number[][];
  try {
    vectors = await embedTexts(chunks.map((chunk) => chunk.content));
  } catch (error) {
    if (
      error instanceof OllamaUnavailableError ||
      error instanceof EmbeddingDimensionMismatchError
    ) {
      console.error("[embedChunks] embedding lokal gagal, chunk disimpan tanpa embedding:", error);
      return { embeddedCount: 0, skipped: true };
    }
    throw error;
  }

  await Promise.all(chunks.map((chunk, index) => updateChunkEmbedding(chunk.id, vectors[index])));
  return { embeddedCount: chunks.length, skipped: false };
}
