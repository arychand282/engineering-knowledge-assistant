import { NextResponse } from "next/server";
import {
  auditEventsQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from "@/server/dto/admin.dto";
import { ROLE_ADMIN } from "@/server/auth/roles";
import { listAuditEventsPage } from "@/server/usecases/admin/list-audit-events.usecase";
import { listUsers } from "@/server/usecases/admin/list-users.usecase";
import { updateUser } from "@/server/usecases/admin/update-user.usecase";
import { UnknownRoleError, UserNotFoundError } from "@/server/usecases/admin/errors";
import { jsonError, zodBadRequest } from "./_http-errors";
import { type Actor, ForbiddenError, UnauthenticatedError, getActor, requireRole } from "./_actor";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveAdminActor(): Promise<Actor | Response> {
  try {
    const actor = await getActor();
    requireRole(actor, [ROLE_ADMIN]);
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

export async function getUsers() {
  const actor = await resolveAdminActor();
  if (actor instanceof Response) {
    return actor;
  }

  const items = await listUsers();
  return NextResponse.json({ items });
}

export async function patchUser(request: Request, context: RouteContext) {
  const actor = await resolveAdminActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = userIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  const body = await request.json().catch(() => null);
  const bodyResult = updateUserSchema.safeParse(body);
  if (!bodyResult.success) {
    return zodBadRequest(bodyResult.error);
  }

  try {
    await updateUser({
      userId: paramsResult.data.id,
      isActive: bodyResult.data.isActive,
      roleNames: bodyResult.data.roleNames,
      actorUserId: actor.id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return jsonError(404, error.message);
    }
    if (error instanceof UnknownRoleError) {
      return jsonError(400, error.message);
    }
    throw error;
  }
}

export async function getAuditEvents(request: Request) {
  const actor = await resolveAdminActor();
  if (actor instanceof Response) {
    return actor;
  }

  const url = new URL(request.url);
  const queryResult = auditEventsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!queryResult.success) {
    return zodBadRequest(queryResult.error);
  }

  const result = await listAuditEventsPage(queryResult.data.page, queryResult.data.pageSize);
  return NextResponse.json(result);
}
