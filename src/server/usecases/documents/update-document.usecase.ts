import type { UpdateDocumentInput } from "@/server/dto/documents.dto";
import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  findDocumentById,
  updateDocumentById,
  type DocumentRow,
} from "@/server/repositories/document.repository";
import { DocumentNotFoundError, SelfSupersedeError } from "./errors";

export interface UpdateDocumentInputWithActor {
  documentId: string;
  patch: UpdateDocumentInput;
  actorUserId: string;
}

export async function updateDocument(input: UpdateDocumentInputWithActor): Promise<DocumentRow> {
  const { documentId, patch, actorUserId } = input;

  const existing = await findDocumentById(documentId);
  if (!existing) {
    throw new DocumentNotFoundError(documentId);
  }

  if (patch.supersedesDocumentId === documentId) {
    throw new SelfSupersedeError();
  }

  const updated = await updateDocumentById(documentId, patch);
  if (!updated) {
    throw new DocumentNotFoundError(documentId);
  }

  await recordAuditEvent({
    actorUserId,
    action: "update_document",
    resourceType: "document",
    resourceId: documentId,
    result: "success",
    metadata: { patch },
  });

  return updated;
}
