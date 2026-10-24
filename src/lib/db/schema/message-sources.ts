import { integer, pgTable, real, text, uuid } from "drizzle-orm/pg-core";
import { documentChunks } from "./document-chunks";
import { documents } from "./documents";
import { messages } from "./messages";

export const messageSources = pgTable("message_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "restrict" }),
  // cascade, not restrict: reprocessDocument() deletes and recreates every chunk for a
  // document (real bug found via testing — restrict made reprocessing throw a 500 FK
  // violation for any document ever cited in a chat answer, which the UI's new
  // "Proses ulang" button would hit immediately). A reprocessed document's old chunk
  // ids are gone either way (content may have changed), so a past message's citation
  // detail (chunk/page/quote) going with them is an honest consequence, not data loss
  // being hidden — the message's own answer text is unaffected, only its source cards.
  chunkId: uuid("chunk_id")
    .notNull()
    .references(() => documentChunks.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  quotedText: text("quoted_text").notNull(),
  relevanceScore: real("relevance_score"),
});
