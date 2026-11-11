import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { env } from "@/lib/env";
import { documents } from "./documents";

/**
 * Embedding dimensions are PROVISIONAL (see .env.example `EMBEDDING_DIMENSIONS`).
 * Changing this value after the first migration has run requires a new migration
 * and re-embedding every row in document_chunks (PLANNING.md #7 stage 4).
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
    // 'simple' config (no stemming): content is Indonesian and Postgres ships no
    // built-in Indonesian text-search dictionary. Still tokenizes/lowercases correctly.
    index("document_chunks_content_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.content})`,
    ),
    index("document_chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
