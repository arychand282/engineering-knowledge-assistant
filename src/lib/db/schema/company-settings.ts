import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

/**
 * Konfigurasi satu perusahaan untuk deployment ini. Hanya boleh berisi satu baris
 * (lihat PLANNING.md #6) — `id` dikunci ke 1 lewat CHECK constraint.
 */
export const companySettings = pgTable(
  "company_settings",
  {
    id: integer("id").primaryKey().default(1),
    companyName: text("company_name").notNull(),
    industry: text("industry"),
    settings: jsonb("settings").notNull().default({}),
    ...timestamps,
  },
  (table) => [check("company_settings_singleton", sql`${table.id} = 1`)],
);
