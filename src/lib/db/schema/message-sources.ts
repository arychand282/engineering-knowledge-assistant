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
  chunkId: uuid("chunk_id")
    .notNull()
    .references(() => documentChunks.id, { onDelete: "restrict" }),
  pageNumber: integer("page_number").notNull(),
  quotedText: text("quoted_text").notNull(),
  relevanceScore: real("relevance_score"),
});
