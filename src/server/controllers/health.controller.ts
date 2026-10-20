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
  // Embeddings always run on Ollama regardless of CHAT_PROVIDER. The chat model only
  // needs to be present on Ollama when chat itself is configured to run there too.
  const isHealthy =
    report.reachable &&
    report.hasEmbeddingModel &&
    (report.chatProvider !== "local" || report.hasChatModel);

  return NextResponse.json(report, { status: isHealthy ? 200 : 503 });
}
