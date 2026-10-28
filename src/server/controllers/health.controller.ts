import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { checkAiHealth } from "@/server/usecases/health/check-ai-health.usecase";
import { checkHealth } from "@/server/usecases/health/check-health.usecase";

export async function getHealth() {
  const report = await checkHealth();
  const isHealthy = report.app === "ok" && report.database === "ok";

  return NextResponse.json(report, { status: isHealthy ? 200 : 503 });
}

export async function getAiHealth() {
  const report = await checkAiHealth();
  // Ollama reachability only matters when something actually depends on it: embedding
  // or chat configured to run there (EMBEDDING_PROVIDER/CHAT_PROVIDER=local), or the
  // optional reranker (RERANK_ENABLED, always Ollama regardless of either provider).
  const needsOllama =
    report.embeddingProvider === "local" || report.chatProvider === "local" || env.RERANK_ENABLED;
  const isHealthy =
    (!needsOllama || report.reachable) &&
    (report.embeddingProvider !== "local" || report.hasEmbeddingModel) &&
    (report.chatProvider !== "local" || report.hasChatModel);

  return NextResponse.json(report, { status: isHealthy ? 200 : 503 });
}
