/**
 * Base roles (PLANNING.md #10). Task 6 finalizes the RBAC policy that #10 §355 left
 * open ("Kebijakan RBAC final ditentukan di Task 6"):
 *
 * - `admin` / `document_controller` manage the document catalog, so they can see and
 *   operate on every document regardless of `document_access` grants — otherwise they
 *   could not publish or reprocess a document they have no explicit grant for.
 * - `engineer` / `viewer` only see documents explicitly granted via `document_access`
 *   (unchanged default-deny behavior from Task 4).
 * - Chat/retrieval (`searchDocuments`) is NEVER bypassed, for any role, including
 *   admin — the AI answer path always respects `document_access` exactly, so a
 *   management privilege never silently becomes a content-access privilege.
 */
export const ROLE_ADMIN = "admin";
export const ROLE_DOCUMENT_CONTROLLER = "document_controller";
export const ROLE_ENGINEER = "engineer";
export const ROLE_VIEWER = "viewer";

export const ALL_ROLES = [
  ROLE_ADMIN,
  ROLE_DOCUMENT_CONTROLLER,
  ROLE_ENGINEER,
  ROLE_VIEWER,
] as const;

export const DOCUMENT_MANAGEMENT_ROLES = [ROLE_ADMIN, ROLE_DOCUMENT_CONTROLLER] as const;

export function hasAnyRole(actorRoles: string[], allowed: readonly string[]): boolean {
  return allowed.some((role) => actorRoles.includes(role));
}

export function canBypassDocumentAccess(actorRoles: string[]): boolean {
  return hasAnyRole(actorRoles, DOCUMENT_MANAGEMENT_ROLES);
}
