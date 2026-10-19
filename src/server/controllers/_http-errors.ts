import { NextResponse } from "next/server";
import type { z } from "zod";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function zodBadRequest(error: z.ZodError) {
  return NextResponse.json({ error: "Validasi gagal.", issues: error.issues }, { status: 400 });
}
