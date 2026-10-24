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

  // Minimal approval record, not a review workflow: the actor who flips status to
  // "effective" is recorded as having approved it, server-side only — never a
  // client-settable field (not in updateDocumentSchema). A later transition AWAY from
  // "effective" deliberately leaves approvedBy/approvedAt untouched, preserving who
  // last approved it rather than erasing that history.
  const isNewlyEffective = patch.status === "effective" && existing.status !== "effective";
  const finalPatch = isNewlyEffective
    ? { ...patch, approvedBy: actorUserId, approvedAt: new Date() }
    : patch;

  const updated = await updateDocumentById(documentId, finalPatch);
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

  if (isNewlyEffective) {
    await recordAuditEvent({
      actorUserId,
      action: "approve_document",
      resourceType: "document",
      resourceId: documentId,
      result: "success",
    });
  }

  return updated;
}
