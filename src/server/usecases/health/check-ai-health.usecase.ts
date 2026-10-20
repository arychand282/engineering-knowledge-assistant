import { checkOllamaHealth, type OllamaHealth } from "@/lib/ai/ollama-client";
import { env } from "@/lib/env";

export interface AiHealth extends OllamaHealth {
  chatProvider: string;
}

export async function checkAiHealth(): Promise<AiHealth> {
  const ollama = await checkOllamaHealth();
  return { ...ollama, chatProvider: env.CHAT_PROVIDER };
}
