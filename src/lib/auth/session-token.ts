import { createHash, randomBytes } from "node:crypto";

/** 256-bit random opaque token — this raw value goes in the cookie, never in the database. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is persisted, so a database read/leak never yields a usable session token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
