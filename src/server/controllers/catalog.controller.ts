import { NextResponse } from "next/server";
import { DOCUMENT_MANAGEMENT_ROLES } from "@/server/auth/roles";
import { listProjects } from "@/server/usecases/catalog/list-projects.usecase";
import { listSites } from "@/server/usecases/catalog/list-sites.usecase";
import { jsonError } from "./_http-errors";
import { type Actor, ForbiddenError, UnauthenticatedError, getActor, requireRole } from "./_actor";

/**
 * Read-only lookups to populate the document metadata form's projectId/siteId pickers
 * (see document-detail-client.tsx) — same role gate as document management itself,
 * since that's the only thing these are used for today. No create/update/delete API:
 * projects/sites are seeded directly (PLANNING.md §18 decision 12 is still open on
 * whether/how org structure should be self-service).
 */
async function resolveManagementActor(): Promise<Actor | Response> {
  try {
    const actor = await getActor();
    requireRole(actor, DOCUMENT_MANAGEMENT_ROLES);
    return actor;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return jsonError(401, error.message);
    }
    if (error instanceof ForbiddenError) {
      return jsonError(403, error.message);
    }
    throw error;
  }
}

export async function getProjects() {
  const actor = await resolveManagementActor();
  if (actor instanceof Response) {
    return actor;
  }

  const items = await listProjects();
  return NextResponse.json({ items });
}

export async function getSites() {
  const actor = await resolveManagementActor();
  if (actor instanceof Response) {
    return actor;
  }

  const items = await listSites();
  return NextResponse.json({ items });
}
