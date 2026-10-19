import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});
