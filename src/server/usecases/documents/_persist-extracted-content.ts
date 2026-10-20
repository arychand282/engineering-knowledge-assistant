import type { ExtractedPage } from "@/lib/documents/extract-pdf";
import { chunkPages } from "@/lib/documents/chunk-text";
import { env } from "@/lib/env";
import {
  insertChunks,
  type NewDocumentChunk,
  type DocumentChunkRow,
} from "@/server/repositories/document-chunk.repository";
import {
  insertPages,
  type NewDocumentPage,
  type DocumentPageRow,
} from "@/server/repositories/document-page.repository";
import { embedChunks } from "./_embed-chunks";

export interface PersistedContent {
  pages: DocumentPageRow[];
  chunks: DocumentChunkRow[];
  embeddedCount: number;
  embeddingSkipped: boolean;
}

/** Shared by upload and reprocess: turns already-extracted pages into stored rows. */
export async function persistExtractedContent(
  documentId: string,
  extractedPages: ExtractedPage[],
): Promise<PersistedContent> {
  const pageRows: NewDocumentPage[] = extractedPages.map((page) => ({
    documentId,
    pageNumber: page.pageNumber,
    extractedText: page.text.length > 0 ? page.text : null,
    extractionStatus: page.status,
  }));
  const pages = await insertPages(pageRows);

  const chunkInput = extractedPages
    .filter((page) => page.status === "success")
    .map((page) => ({ pageNumber: page.pageNumber, text: page.text }));
  const textChunks = chunkPages(chunkInput, {
    chunkSizeWords: env.CHUNK_SIZE_WORDS,
    overlapWords: env.CHUNK_OVERLAP_WORDS,
  });

  const chunkRows: NewDocumentChunk[] = textChunks.map((chunk) => ({
    documentId,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    tokenCount: chunk.tokenCount,
  }));
  const chunks = await insertChunks(chunkRows);
  const { embeddedCount, skipped } = await embedChunks(chunks);

  return { pages, chunks, embeddedCount, embeddingSkipped: skipped };
}
