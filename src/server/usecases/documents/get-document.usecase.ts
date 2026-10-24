import { countChunksByDocumentId } from "@/server/repositories/document-chunk.repository";
import { listPagesByDocumentId } from "@/server/repositories/document-page.repository";
import { assertDocumentAccessible, type DocumentAccessActor } from "./_assert-document-access";

export type GetDocumentActor = DocumentAccessActor;

export async function getDocument(documentId: string, actor: GetDocumentActor) {
  const document = await assertDocumentAccessible(documentId, actor);

  const [pages, chunkCount] = await Promise.all([
    listPagesByDocumentId(documentId),
    countChunksByDocumentId(documentId),
  ]);

  return { document, pages, chunkCount };
}
