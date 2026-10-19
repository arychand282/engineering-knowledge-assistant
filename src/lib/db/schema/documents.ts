import {
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { sites } from "./sites";
import { users } from "./users";
import { timestamps } from "./_shared";

/**
 * Status alur dokumen (document control workflow), bukan kategori bisnis — tetap tetap
 * di seluruh perusahaan/industri sehingga aman sebagai enum DB. `document_type` sengaja
 * TIDAK dibuat enum karena kategorinya dikonfigurasi per perusahaan (lihat PLANNING.md #6).
 */
export const documentStatusEnum = pgEnum("document_status", [
  "draft",
  "effective",
  "superseded",
  "obsolete",
  "under_review",
]);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  documentNumber: text("document_number").notNull(),
  documentType: text("document_type").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  revision: text("revision").notNull(),
  status: documentStatusEnum("status").notNull().default("draft"),
  effectiveDate: date("effective_date"),
  supersedesDocumentId: uuid("supersedes_document_id").references((): AnyPgColumn => documents.id),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
});
