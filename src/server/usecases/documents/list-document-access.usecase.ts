import {
  listAccessGrantsForDocument,
  type DocumentAccessGrant,
} from "@/server/repositories/document-access.repository";
import { findDocumentById } from "@/server/repositories/document.repository";
import { DocumentNotFoundError } from "./errors";

/**
 * Management-only read: callable by DOCUMENT_MANAGEMENT_ROLES regardless of whether
 * they themselves have a document_access grant for this document — same bypass
 * get-document.usecase.ts already applies, enforced at the controller layer via
 * requireRole(), not here.
 */
export async function listDocumentAccess(documentId: string): Promise<DocumentAccessGrant[]> {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new DocumentNotFoundError(documentId);
  }
  return listAccessGrantsForDocument(documentId);
}
