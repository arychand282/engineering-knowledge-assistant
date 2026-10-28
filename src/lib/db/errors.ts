/** Postgres SQLSTATE for a unique-constraint violation (raised by the `pg` driver as
 * a `DatabaseError` with this `.code`) — used to translate a race-lost INSERT into the
 * same clean domain error a sequential "already exists" check would have thrown,
 * instead of letting it bubble up as an unhandled 500. Optionally scoped to one named
 * constraint, since a table can have more than one unique constraint. */
export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const pgError = error as Error & { code?: string; constraint?: string };
  if (pgError.code !== "23505") {
    return false;
  }
  return constraintName === undefined || pgError.constraint === constraintName;
}
