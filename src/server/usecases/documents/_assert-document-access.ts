import { canBypassDocumentAccess } from "@/server/auth/roles";
import { getAccessibleDocumentIds } from "@/server/repositories/document-access.repository";
import { findDocumentById, type DocumentRow } from "@/server/repositories/document.repository";
import { DocumentNotFoundError } from "./errors";

export interface DocumentAccessActor {
  id: string;
  roles: string[];
}

/**
 * Loads a document and enforces document_access, shared by every usecase that reads a
 * single document by id. Throws the same "not found" error for a missing document and
 * one the actor can't see — a 403 would confirm the document exists, which is itself
 * information an unauthorized caller shouldn't get (IDOR via existence leak).
 */
export async function assertDocumentAccessible(
  documentId: string,
  actor: DocumentAccessActor,
): Promise<DocumentRow> {
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

  return document;
}
