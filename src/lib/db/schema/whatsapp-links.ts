import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { users } from "./users";

/**
 * Admin-assigned phone→user mapping (PLANNING.md §18 decision 9 — explicit scope
 * decision, confirmed with the user before building: WhatsApp has no login, so an
 * incoming message has no inherent identity; the safest default matching this app's
 * existing closed, no-self-signup model is that only a number an admin has explicitly
 * linked to an account gets any access at all. An unrecognized number gets a clear
 * "not registered" reply, never silent access and never an improvised identity.
 *
 * One phone per user and one user per phone (both unique) — a clean 1:1 mapping, not a
 * many-to-many directory.
 */
export const whatsappLinks = pgTable("whatsapp_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Normalized digits-only (country code + number, no "+"/spaces/dashes) — matches the
  // JID-derived format Baileys and Meta's Cloud API both use for the sender identifier.
  phoneNumber: text("phone_number").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  linkedBy: uuid("linked_by").references(() => users.id, { onDelete: "set null" }),
  // Reused across messages so a WhatsApp conversation keeps the same history-aware
  // behavior as the web chat (CHAT_HISTORY_LIMIT) instead of treating every incoming
  // message as a brand new, context-free question. Created lazily on first message,
  // never rotated automatically — there's no "start a new conversation" command yet
  // (documented as a known MVP limitation, not an oversight).
  currentConversationId: uuid("current_conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
