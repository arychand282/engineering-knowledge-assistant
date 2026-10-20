import { canBypassDocumentAccess } from "@/server/auth/roles";
import { getAccessibleDocumentIds } from "@/server/repositories/document-access.repository";
import { findDocumentById } from "@/server/repositories/document.repository";
import { countChunksByDocumentId } from "@/server/repositories/document-chunk.repository";
import { listPagesByDocumentId } from "@/server/repositories/document-page.repository";
import { DocumentNotFoundError } from "./errors";

export interface GetDocumentActor {
  id: string;
  roles: string[];
}

/**
 * Returns the same "not found" error for a missing document and a document the actor
 * can't see — a 403 would confirm the document exists, which is itself information an
 * unauthorized caller shouldn't get (IDOR via existence leak).
 */
export async function getDocument(documentId: string, actor: GetDocumentActor) {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new DocumentNotFoundError(documentId);
  }

  if (!canBypassDocumentAccess(actor.roles)) {
    const accessibleDocumentIds = await getAccessibleDocumentIds(actor.id);
    if (!accessibleDocumentIds.includes(documentId)) {
      throw new DocumentNotFoundError(documentId);
    }
  }

  const [pages, chunkCount] = await Promise.all([
    listPagesByDocumentId(documentId),
    countChunksByDocumentId(documentId),
  ]);

  return { document, pages, chunkCount };
}
