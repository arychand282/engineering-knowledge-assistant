import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { timestamps } from "./_shared";

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  ...timestamps,
});
