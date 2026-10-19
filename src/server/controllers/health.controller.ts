import { NextResponse } from "next/server";
import { checkHealth } from "@/server/usecases/health/check-health.usecase";

export async function getHealth() {
  const report = await checkHealth();
  const isHealthy = report.app === "ok" && report.database === "ok";

  return NextResponse.json(report, { status: isHealthy ? 200 : 503 });
}
