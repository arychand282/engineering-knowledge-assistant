import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentAccess, roles, userRoles } from "@/lib/db/schema";

export interface DocumentAccessGrant {
  id: string;
  documentId: string;
  roleId: string;
  roleName: string;
  createdAt: Date;
}

/** Role-scoped grants only — project_id/site_id exist on the table but aren't
 * enforced yet (see getAccessibleDocumentIds below), so management surfaces (this
 * repository, and the grant/revoke UI) deliberately only deal with role grants rather
 * than implying a filter that doesn't actually apply. */
export async function listAccessGrantsForDocument(
  documentId: string,
): Promise<DocumentAccessGrant[]> {
  const rows = await db
    .select({
      id: documentAccess.id,
      documentId: documentAccess.documentId,
      roleId: documentAccess.roleId,
      roleName: roles.name,
      createdAt: documentAccess.createdAt,
    })
    .from(documentAccess)
    .innerJoin(roles, eq(roles.id, documentAccess.roleId))
    .where(eq(documentAccess.documentId, documentId));
  return rows as DocumentAccessGrant[];
}

export async function findAccessGrantByRole(
  documentId: string,
  roleId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: documentAccess.id })
    .from(documentAccess)
    .where(and(eq(documentAccess.documentId, documentId), eq(documentAccess.roleId, roleId)));
  return row ?? null;
}

export async function insertAccessGrant(
  documentId: string,
  roleId: string,
): Promise<{ id: string; createdAt: Date }> {
  const [row] = await db
    .insert(documentAccess)
    .values({ documentId, roleId })
    .returning({ id: documentAccess.id, createdAt: documentAccess.createdAt });
  return row;
}

/** Deletes only a grant that actually belongs to this document — prevents one
 * document's grant id being used to delete another document's row. */
export async function deleteAccessGrant(documentId: string, accessId: string): Promise<boolean> {
  const deleted = await db
    .delete(documentAccess)
    .where(and(eq(documentAccess.id, accessId), eq(documentAccess.documentId, documentId)))
    .returning({ id: documentAccess.id });
  return deleted.length > 0;
}

/**
 * Default-deny: a document is accessible only if at least one `document_access` row
 * grants one of the user's roles. `document_access.project_id` / `site_id` narrowing is
 * not yet applied here — there is no user-to-project/site assignment table yet
 * (PLANNING.md #18 decision 12 is still open), so those columns are currently ignored
 * rather than guessed at. That only under-restricts relative to a future stricter
 * policy, never over-grants beyond the role-based grant already enforced here.
 *
 * This function has NO role bypass and must stay that way — it is also what the chat
 * retrieval path (`searchDocuments`) uses, and that path never bypasses access for any
 * role (see `src/server/auth/roles.ts`). The `admin`/`document_controller` management
 * bypass is applied separately, only in the document list/detail/reprocess usecases.
 *
 * No "open access" / "everyone sees everything" mode exists yet — every document
 * requires an explicit grant, including newly uploaded ones. If a client asks for that,
 * see PLANNING.md #18 decision 4 for the two design options noted there (don't build
 * either speculatively).
 */
export async function getAccessibleDocumentIds(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ documentId: documentAccess.documentId })
    .from(documentAccess)
    .innerJoin(userRoles, eq(userRoles.roleId, documentAccess.roleId))
    .where(eq(userRoles.userId, userId));

  return rows.map((row) => row.documentId);
}
