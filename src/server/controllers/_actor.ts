import { readSessionToken } from "@/lib/auth/session-cookie";
import { hasAnyRole } from "@/server/auth/roles";
import { ForbiddenError, UnauthenticatedError } from "@/server/usecases/auth/errors";
import { type Actor, resolveActorFromToken } from "@/server/usecases/auth/resolve-actor.usecase";

export type { Actor };
export { ForbiddenError, UnauthenticatedError };

/**
 * Single place every controller resolves "who is calling" from — replaces the Task 6
 * placeholder (`_temporary-actor.ts`, deleted) that trusted an unverified `x-user-id`
 * header. Throws `UnauthenticatedError` (→ 401) if there is no valid, non-revoked,
 * unexpired session for an active user.
 */
export async function getActor(): Promise<Actor> {
  const token = await readSessionToken();
  return resolveActorFromToken(token);
}

/** Throws `ForbiddenError` (→ 403) if the actor has none of the allowed roles. */
export function requireRole(actor: Actor, allowed: readonly string[]): void {
  if (!hasAnyRole(actor.roles, allowed)) {
    throw new ForbiddenError();
  }
}
