import { NextResponse } from "next/server";
import { checkAiHealth } from "@/server/usecases/health/check-ai-health.usecase";
import { checkHealth } from "@/server/usecases/health/check-health.usecase";

export async function getHealth() {
  const report = await checkHealth();
  const isHealthy = report.app === "ok" && report.database === "ok";

  return NextResponse.json(report, { status: isHealthy ? 200 : 503 });
}

export async function getAiHealth() {
  const report = await checkAiHealth();
  const isHealthy = report.reachable && report.hasEmbeddingModel;

  return NextResponse.json(report, { status: isHealthy ? 200 : 503 });
}
