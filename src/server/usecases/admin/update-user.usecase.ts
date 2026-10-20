import { ALL_ROLES } from "@/server/auth/roles";
import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import { findRoleIdsByNames } from "@/server/repositories/role.repository";
import { revokeAllSessionsForUser } from "@/server/repositories/session.repository";
import {
  findUserById,
  replaceUserRoles,
  setUserActive,
} from "@/server/repositories/user.repository";
import { UserNotFoundError, UnknownRoleError } from "./errors";

export interface UpdateUserInput {
  userId: string;
  isActive?: boolean;
  roleNames?: string[];
  actorUserId: string;
}

export async function updateUser(input: UpdateUserInput): Promise<void> {
  const user = await findUserById(input.userId);
  if (!user) {
    throw new UserNotFoundError(input.userId);
  }

  if (input.roleNames) {
    const unknown = input.roleNames.filter((name) => !ALL_ROLES.includes(name as never));
    if (unknown.length > 0) {
      throw new UnknownRoleError(unknown);
    }
    const roleIds = await findRoleIdsByNames(input.roleNames);
    await replaceUserRoles(input.userId, roleIds);
    await recordAuditEvent({
      actorUserId: input.actorUserId,
      action: "update_user_roles",
      resourceType: "user",
      resourceId: input.userId,
      result: "success",
      metadata: { roles: input.roleNames },
    });
  }

  if (input.isActive !== undefined) {
    await setUserActive(input.userId, input.isActive);
    if (!input.isActive) {
      // Deactivation must kill existing sessions immediately — not wait for their TTL.
      await revokeAllSessionsForUser(input.userId);
    }
    await recordAuditEvent({
      actorUserId: input.actorUserId,
      action: input.isActive ? "activate_user" : "deactivate_user",
      resourceType: "user",
      resourceId: input.userId,
      result: "success",
    });
  }
}
