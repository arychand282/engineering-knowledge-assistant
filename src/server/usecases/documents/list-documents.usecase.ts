import type { ListDocumentsQuery } from "@/server/dto/documents.dto";
import { listDocuments as listDocumentsRepo } from "@/server/repositories/document.repository";

export async function listDocuments(query: ListDocumentsQuery) {
  const { items, total } = await listDocumentsRepo(query);
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}
