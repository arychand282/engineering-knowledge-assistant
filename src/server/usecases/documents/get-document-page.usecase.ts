import { findPageByDocumentIdAndPageNumber } from "@/server/repositories/document-page.repository";
import { assertDocumentAccessible, type DocumentAccessActor } from "./_assert-document-access";
import { PageNotFoundError } from "./errors";

export async function getDocumentPage(
  documentId: string,
  pageNumber: number,
  actor: DocumentAccessActor,
) {
  const document = await assertDocumentAccessible(documentId, actor);

  const page = await findPageByDocumentIdAndPageNumber(documentId, pageNumber);
  if (!page) {
    throw new PageNotFoundError(documentId, pageNumber);
  }

  return { document, page };
}
