import { listAuditEvents } from "@/server/repositories/audit-event.repository";

export async function listAuditEventsPage(page: number, pageSize: number) {
  const { items, total } = await listAuditEvents(page, pageSize);
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
