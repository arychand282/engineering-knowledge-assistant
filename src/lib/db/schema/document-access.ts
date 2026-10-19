import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { projects } from "./projects";
import { roles } from "./roles";
import { sites } from "./sites";

/**
 * Satu baris = satu aturan akses yang mengizinkan sebuah role (opsional dibatasi per
 * proyek/cabang) membaca sebuah dokumen. Tidak adanya baris untuk suatu dokumen+role
 * berarti role tersebut tidak diizinkan, kecuali kebijakan default lain ditetapkan di
 * usecase retrieval.
 */
export const documentAccess = pgTable("document_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
