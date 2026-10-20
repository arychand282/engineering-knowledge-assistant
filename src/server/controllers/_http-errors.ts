import { NextResponse } from "next/server";
import type { z } from "zod";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function zodBadRequest(error: z.ZodError) {
  return NextResponse.json({ error: "Validasi gagal.", issues: error.issues }, { status: 400 });
}

export function rateLimited(message: string, retryAfterMs: number) {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}
