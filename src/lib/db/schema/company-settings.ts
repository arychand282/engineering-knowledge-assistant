import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

/**
 * Single-company configuration for this deployment. Must contain exactly one row
 * (see PLANNING.md #6) — `id` is pinned to 1 via a CHECK constraint.
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
