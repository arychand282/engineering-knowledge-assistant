import { and, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentPages, documents, messageSources } from "@/lib/db/schema";

export type NewMessageSource = typeof messageSources.$inferInsert;
export type MessageSourceRow = typeof messageSources.$inferSelect;

/** MessageSourceRow plus the fields a source card needs to render (title/number/
 * revision from `documents`, OCR provenance from `document_pages`) — these aren't
 * stored on `message_sources` itself, only resolvable via a join. `isOcr`/
 * `ocrConfidence` are null if the page row is gone (e.g. after a reprocess). */
export interface MessageSourceWithDocument extends MessageSourceRow {
  documentTitle: string;
  documentNumber: string;
  revision: string;
  isOcr: boolean | null;
  ocrConfidence: number | null;
}

const messageSourceWithDocumentColumns = {
  ...getTableColumns(messageSources),
  documentTitle: documents.title,
  documentNumber: documents.documentNumber,
  revision: documents.revision,
  isOcr: documentPages.isOcr,
  ocrConfidence: documentPages.ocrConfidence,
};

export async function insertMessageSources(
  sources: NewMessageSource[],
): Promise<MessageSourceRow[]> {
  if (sources.length === 0) {
    return [];
  }
  return db.insert(messageSources).values(sources).returning();
}

export async function listMessageSourcesByMessageId(
  messageId: string,
): Promise<MessageSourceWithDocument[]> {
  return db
    .select(messageSourceWithDocumentColumns)
    .from(messageSources)
    .innerJoin(documents, eq(documents.id, messageSources.documentId))
    .leftJoin(
      documentPages,
      and(
        eq(documentPages.documentId, messageSources.documentId),
        eq(documentPages.pageNumber, messageSources.pageNumber),
      ),
    )
    .where(eq(messageSources.messageId, messageId));
}
