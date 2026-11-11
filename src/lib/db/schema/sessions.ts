import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Database-backed sessions (not JWT): revocation (logout, account deactivation) must
 * take effect immediately without waiting for a token to expire (PLANNING.md #10
 * "Set up a procedure for deactivating accounts and revoking sessions"). Only a hash of the
 * opaque session token is stored — the raw token lives only in the client's cookie and
 * in-memory during the request, so a database read alone never yields a usable token.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
