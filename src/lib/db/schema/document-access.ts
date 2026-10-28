import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
export const documentAccess = pgTable(
  "document_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Found as a real bug via code review, not live reproduction: grantDocumentAccess()
    // only prevented a duplicate grant with a SELECT-then-INSERT check in application
    // code, with nothing backing it at the DB level — a race (two concurrent grant
    // requests, e.g. a double-click or a retried request) could both pass the check and
    // insert, leaving two rows for the same (document, role). Since this table is the
    // app's core access-control mechanism, that's not just a cosmetic duplicate: an
    // admin revoking what they believe is "the" grant (one row) would silently leave
    // the other in place, still granting access, contradicting both their intent and
    // what the UI shows after the revoke. This constraint makes the race fail loudly
    // (a DB error the usecase now catches and turns into the same 409 the sequential
    // path already returns) instead of silently corrupting the access list.
    unique("document_access_document_id_role_id_key").on(table.documentId, table.roleId),
  ],
);
