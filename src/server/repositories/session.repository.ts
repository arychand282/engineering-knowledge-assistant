import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

export type SessionRow = typeof sessions.$inferSelect;

export interface NewSession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
}

export async function createSession(values: NewSession): Promise<SessionRow> {
  const [row] = await db.insert(sessions).values(values).returning();
  return row;
}

export async function findActiveSessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
  if (!row) {
    return null;
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return row;
}

export async function revokeSessionByTokenHash(tokenHash: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
}

/** Used for the "disable account" procedure (PLANNING.md #10) — kills every active session at once. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
