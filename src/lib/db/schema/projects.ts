import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sites } from "./sites";
import { timestamps } from "./_shared";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});
