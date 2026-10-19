import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { documents } from "./documents";

export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "success",
  "empty",
  "failed",
  "ocr_required",
]);

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    extractedText: text("extracted_text"),
    extractionStatus: extractionStatusEnum("extraction_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("document_pages_document_id_page_number_key").on(table.documentId, table.pageNumber),
    check("document_pages_page_number_positive", sql`${table.pageNumber} >= 1`),
  ],
);
