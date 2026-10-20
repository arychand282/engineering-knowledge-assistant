import { hashSessionToken } from "@/lib/auth/session-token";
import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  findActiveSessionByTokenHash,
  revokeSessionByTokenHash,
} from "@/server/repositories/session.repository";

/** Idempotent: logging out an already-invalid/expired token still clears the cookie, just without an audit entry (there's no user to attribute it to). */
export async function logout(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  const session = await findActiveSessionByTokenHash(tokenHash);

  await revokeSessionByTokenHash(tokenHash);

  if (session) {
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "logout",
      resourceType: "session",
      resourceId: session.userId,
      result: "success",
    });
  }
}
