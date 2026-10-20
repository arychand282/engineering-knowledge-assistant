/**
 * Pulls a model into the local Ollama runtime (docker-compose service "ollama").
 * Idempotent — Ollama no-ops if already pulled. Usage: tsx scripts/pull-model.ts [model]
 * (defaults to EMBEDDING_MODEL if no argument is given).
 */
import { env } from "@/lib/env";

async function main() {
  const model = process.argv[2] ?? env.EMBEDDING_MODEL;
  const url = new URL("/api/pull", env.OLLAMA_BASE_URL);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
  });

  if (!response.body) {
    throw new Error(`Tidak ada response body dari ${url}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as { status?: string; error?: string };
      if (parsed.error) throw new Error(parsed.error);
      console.log(parsed.status);
    }
  }

  if (!response.ok) {
    throw new Error(`Ollama /api/pull returned HTTP ${response.status}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
