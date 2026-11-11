import { checkRateLimit } from "@/lib/auth/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";
import { env } from "@/lib/env";
import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import { createSession } from "@/server/repositories/session.repository";
import { findUserByEmail, listRoleNamesForUser } from "@/server/repositories/user.repository";
import { AccountDisabledError, InvalidCredentialsError, RateLimitedError } from "./errors";

export interface LoginInput {
  email: string;
  password: string;
  userAgent: string | null;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  actor: { id: string; email: string; name: string; roles: string[] };
}

/**
 * "Incorrect email or password" is used for both an unknown email and a wrong password —
 * a distinct message for "unknown email" would let an attacker enumerate real accounts.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const rateLimit = checkRateLimit(
    "login",
    normalizedEmail,
    env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    env.LOGIN_RATE_LIMIT_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      actorUserId: null,
      action: "login",
      resourceType: "session",
      result: "failure",
      metadata: { email: normalizedEmail, reason: "rate_limited" },
    });
    throw new RateLimitedError(rateLimit.retryAfterMs);
  }

  const user = await findUserByEmail(normalizedEmail);
  if (!user || !user.passwordHash) {
    await recordAuditEvent({
      actorUserId: null,
      action: "login",
      resourceType: "session",
      result: "failure",
      metadata: { email: normalizedEmail, reason: "not_found" },
    });
    throw new InvalidCredentialsError();
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);
  if (!passwordValid) {
    await recordAuditEvent({
      actorUserId: user.id,
      action: "login",
      resourceType: "session",
      resourceId: user.id,
      result: "failure",
      metadata: { reason: "bad_password" },
    });
    throw new InvalidCredentialsError();
  }

  if (!user.isActive) {
    await recordAuditEvent({
      actorUserId: user.id,
      action: "login",
      resourceType: "session",
      resourceId: user.id,
      result: "failure",
      metadata: { reason: "disabled" },
    });
    throw new AccountDisabledError();
  }

  const roles = await listRoleNamesForUser(user.id);
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  await createSession({ userId: user.id, tokenHash, expiresAt, userAgent: input.userAgent });
  await recordAuditEvent({
    actorUserId: user.id,
    action: "login",
    resourceType: "session",
    resourceId: user.id,
    result: "success",
  });

  return { token, expiresAt, actor: { id: user.id, email: user.email, name: user.name, roles } };
}
