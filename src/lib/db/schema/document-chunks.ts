import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { env } from "@/lib/env";
import { documents } from "./documents";

/**
 * Dimensi embedding bersifat PROVISIONAL (lihat .env.example `EMBEDDING_DIMENSIONS`).
 * Mengubah nilai ini setelah migration pertama dijalankan membutuhkan migration baru
 * dan re-embedding seluruh baris document_chunks (PLANNING.md #7 tahap 4).
 */
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    sectionHeading: text("section_heading"),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", { dimensions: env.EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("document_chunks_page_start_positive", sql`${table.pageStart} >= 1`),
    check("document_chunks_page_end_gte_start", sql`${table.pageEnd} >= ${table.pageStart}`),
  ],
);
