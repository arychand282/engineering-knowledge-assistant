import { findDocumentById } from "@/server/repositories/document.repository";
import { countChunksByDocumentId } from "@/server/repositories/document-chunk.repository";
import { listPagesByDocumentId } from "@/server/repositories/document-page.repository";
import { DocumentNotFoundError } from "./errors";

export async function getDocument(documentId: string) {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new DocumentNotFoundError(documentId);
  }

  const [pages, chunkCount] = await Promise.all([
    listPagesByDocumentId(documentId),
    countChunksByDocumentId(documentId),
  ]);

  return { document, pages, chunkCount };
}
