import { readStoredFile } from "@/lib/storage";
import { assertDocumentAccessible, type DocumentAccessActor } from "./_assert-document-access";

/**
 * Original uploaded file bytes (not the extracted text — see get-document-page.usecase.ts
 * for that). Same access check as every other single-document read, so this never
 * becomes a way to bypass document_access (e.g. a direct link that skips the RBAC
 * checked everywhere else).
 */
export async function getDocumentFile(documentId: string, actor: DocumentAccessActor) {
  const document = await assertDocumentAccessible(documentId, actor);
  const buffer = await readStoredFile(document.storageKey);
  return { document, buffer };
}
