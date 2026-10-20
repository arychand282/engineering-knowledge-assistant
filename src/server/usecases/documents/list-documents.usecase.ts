import type { ListDocumentsQuery } from "@/server/dto/documents.dto";
import { canBypassDocumentAccess } from "@/server/auth/roles";
import { getAccessibleDocumentIds } from "@/server/repositories/document-access.repository";
import { listDocuments as listDocumentsRepo } from "@/server/repositories/document.repository";

export interface ListDocumentsActor {
  id: string;
  roles: string[];
}

export async function listDocuments(query: ListDocumentsQuery, actor: ListDocumentsActor) {
  const restrictToDocumentIds = canBypassDocumentAccess(actor.roles)
    ? undefined
    : await getAccessibleDocumentIds(actor.id);

  const { items, total } = await listDocumentsRepo(query, restrictToDocumentIds);
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}
