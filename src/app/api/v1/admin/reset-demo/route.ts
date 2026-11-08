import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { resetDemo } from "@/server/usecases/admin/reset-demo.usecase";

/**
 * Called by Vercel Cron (see vercel.json) — not part of the app's normal RBAC surface,
 * so it checks CRON_SECRET directly rather than going through session auth. Also
 * callable manually (same auth) if the demo needs an immediate reset outside the
 * schedule, e.g. right after sharing credentials somewhere public.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await resetDemo();
  return NextResponse.json({ ok: true, ...result });
}
