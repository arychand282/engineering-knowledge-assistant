import { z } from "zod";

/**
 * TEMPORARY stand-in for authentication. Task 6 (Authentication and authorization)
 * replaces this with a real session lookup — every usecase here already takes a plain
 * `uploadedBy: string` user id, so swapping this one function out is the only change
 * needed. Do not treat the `x-user-id` header as a security control: it is not verified
 * against any session, it only has to name an existing user row.
 */
export class MissingActorError extends Error {
  constructor() {
    super(
      "Header x-user-id wajib diisi dengan user id yang valid (placeholder sementara sebelum Task 6 — autentikasi).",
    );
    this.name = "MissingActorError";
  }
}

export function getTemporaryActorId(request: Request): string {
  const parsed = z.string().uuid().safeParse(request.headers.get("x-user-id"));
  if (!parsed.success) {
    throw new MissingActorError();
  }
  return parsed.data;
}
