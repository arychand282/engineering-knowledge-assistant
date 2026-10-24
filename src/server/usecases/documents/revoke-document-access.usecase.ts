import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import { deleteAccessGrant } from "@/server/repositories/document-access.repository";
import { findDocumentById } from "@/server/repositories/document.repository";
import { AccessGrantNotFoundError, DocumentNotFoundError } from "./errors";

export interface RevokeDocumentAccessInput {
  documentId: string;
  accessId: string;
  actorUserId: string;
}

export async function revokeDocumentAccess(input: RevokeDocumentAccessInput): Promise<void> {
  const { documentId, accessId, actorUserId } = input;

  const document = await findDocumentById(documentId);
  if (!document) {
    throw new DocumentNotFoundError(documentId);
  }

  const deleted = await deleteAccessGrant(documentId, accessId);
  if (!deleted) {
    throw new AccessGrantNotFoundError(accessId);
  }

  await recordAuditEvent({
    actorUserId,
    action: "revoke_document_access",
    resourceType: "document",
    resourceId: documentId,
    result: "success",
    metadata: { accessId },
  });
}
