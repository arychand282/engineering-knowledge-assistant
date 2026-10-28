import { isUniqueViolation } from "@/lib/db/errors";
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

  // The SELECT above has a race window — a second concurrent request can read "no
  // grant yet" too, and both proceed to INSERT. The DB-level unique constraint
  // (document_access_document_id_role_id_key) stops the race from creating a second,
  // silently-duplicate access-control row; catching it here turns the loser's error
  // into the same clean 409 the winner's sequential check already returns, instead of
  // an unhandled 500.
  let grant: { id: string; createdAt: Date };
  try {
    grant = await insertAccessGrant(documentId, role.id);
  } catch (error) {
    if (isUniqueViolation(error, "document_access_document_id_role_id_key")) {
      throw new DuplicateAccessGrantError(roleName);
    }
    throw error;
  }

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
