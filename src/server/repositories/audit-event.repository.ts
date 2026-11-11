import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

export interface NewAuditEvent {
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result: "success" | "failure";
  ipHash?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Fire-and-record: never throws into the caller's request flow, since a logging failure must not block the action it's describing. */
export async function recordAuditEvent(event: NewAuditEvent): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      actorUserId: event.actorUserId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId ?? null,
      result: event.result,
      ipHash: event.ipHash ?? null,
      metadata: event.metadata ?? null,
    });
  } catch (error) {
    console.error("Failed to record audit event", error);
  }
}

export interface ListAuditEventsResult {
  items: (typeof auditEvents.$inferSelect)[];
  total: number;
}

export async function listAuditEvents(
  page: number,
  pageSize: number,
): Promise<ListAuditEventsResult> {
  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(auditEvents),
  ]);
  return { items, total: totalRows[0]?.count ?? 0 };
}
