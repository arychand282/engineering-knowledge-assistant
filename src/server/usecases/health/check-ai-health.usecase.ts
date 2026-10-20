import { checkOllamaHealth, type OllamaHealth } from "@/lib/ai/ollama-client";

export async function checkAiHealth(): Promise<OllamaHealth> {
  return checkOllamaHealth();
}
