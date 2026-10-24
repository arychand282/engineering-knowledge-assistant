import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  findAccessGrantByRole,
  insertAccessGrant,
  type DocumentAccessGrant,
} from "@/server/repositories/document-access.repository";
import { findDocumentById } from "@/server/repositories/document.repository";
import { findRoleByName } from "@/server/repositories/role.repository";
import { DocumentNotFoundError, DuplicateAccessGrantError, UnknownRoleError } from "./errors";

export interface GrantDocumentAccessInput {
  documentId: string;
  roleName: string;
  actorUserId: string;
}

export async function grantDocumentAccess(
  input: GrantDocumentAccessInput,
): Promise<DocumentAccessGrant> {
  const { documentId, roleName, actorUserId } = input;

  const document = await findDocumentById(documentId);
  if (!document) {
    throw new DocumentNotFoundError(documentId);
  }

  const role = await findRoleByName(roleName);
  if (!role) {
    throw new UnknownRoleError(roleName);
  }

  const existing = await findAccessGrantByRole(documentId, role.id);
  if (existing) {
    throw new DuplicateAccessGrantError(roleName);
  }

  const grant = await insertAccessGrant(documentId, role.id);

  await recordAuditEvent({
    actorUserId,
    action: "grant_document_access",
    resourceType: "document",
    resourceId: documentId,
    result: "success",
    metadata: { roleName },
  });

  return { id: grant.id, documentId, roleId: role.id, roleName, createdAt: grant.createdAt };
}
