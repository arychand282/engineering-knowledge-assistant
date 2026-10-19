import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  siteType: text("site_type").notNull(),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});
