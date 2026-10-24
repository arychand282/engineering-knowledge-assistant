import { extractDocumentPages } from "@/lib/documents/extract-document";
import { env } from "@/lib/env";
import { readStoredFile } from "@/lib/storage/local-storage";
import { findDocumentById } from "@/server/repositories/document.repository";
import { deleteChunksByDocumentId } from "@/server/repositories/document-chunk.repository";
import { deletePagesByDocumentId } from "@/server/repositories/document-page.repository";
import { persistExtractedContent } from "./_persist-extracted-content";
import { DocumentNotFoundError } from "./errors";

export interface ReprocessDocumentResult {
  documentId: string;
  pageCount: number;
  chunkCount: number;
  embeddedCount: number;
  embeddingSkipped: boolean;
}

export async function reprocessDocument(documentId: string): Promise<ReprocessDocumentResult> {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new DocumentNotFoundError(documentId);
  }

  const fileBuffer = await readStoredFile(document.storageKey);
  const extractedPages = await extractDocumentPages(fileBuffer, document.mimeType, {
    maxPages: env.MAX_DOCUMENT_PAGES,
  });

  await deleteChunksByDocumentId(documentId);
  await deletePagesByDocumentId(documentId);
  const { pages, chunks, embeddedCount, embeddingSkipped } = await persistExtractedContent(
    documentId,
    extractedPages,
  );

  return {
    documentId,
    pageCount: pages.length,
    chunkCount: chunks.length,
    embeddedCount,
    embeddingSkipped,
  };
}
