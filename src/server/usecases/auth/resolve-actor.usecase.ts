import { hashSessionToken } from "@/lib/auth/session-token";
import { findActiveSessionByTokenHash } from "@/server/repositories/session.repository";
import { findUserById, listRoleNamesForUser } from "@/server/repositories/user.repository";
import { UnauthenticatedError } from "./errors";

export interface Actor {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

/** Disabling an account (`isActive = false`) invalidates its sessions immediately, even if the session row itself is still unexpired/unrevoked. */
export async function resolveActorFromToken(token: string | null): Promise<Actor> {
  if (!token) {
    throw new UnauthenticatedError();
  }

  const session = await findActiveSessionByTokenHash(hashSessionToken(token));
  if (!session) {
    throw new UnauthenticatedError();
  }

  const user = await findUserById(session.userId);
  if (!user || !user.isActive) {
    throw new UnauthenticatedError();
  }

  const roles = await listRoleNamesForUser(user.id);
  return { id: user.id, email: user.email, name: user.name, roles };
}
