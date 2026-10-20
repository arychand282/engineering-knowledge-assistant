import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentAccess, userRoles } from "@/lib/db/schema";

/**
 * Default-deny: a document is accessible only if at least one `document_access` row
 * grants one of the user's roles. `document_access.project_id` / `site_id` narrowing is
 * not yet applied here — there is no user-to-project/site assignment table yet
 * (PLANNING.md #18 decision 12 is still open), so those columns are currently ignored
 * rather than guessed at. That only under-restricts relative to a future stricter
 * policy, never over-grants beyond the role-based grant already enforced here.
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
