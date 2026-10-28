import {
  EmbeddingDimensionMismatchError,
  OllamaUnavailableError,
  embedTexts as embedTextsOllama,
} from "@/lib/ai/ollama-client";
import { env } from "@/lib/env";
import { EmbeddingProviderUnavailableError } from "./providers/errors";
import { embedTextsGemini } from "./providers/gemini-client";
import { embedTextsOpenAi } from "./providers/openai-client";

export { EmbeddingDimensionMismatchError, EmbeddingProviderUnavailableError };

let warnedExternalEmbeddingProvider = false;

/**
 * Single entry point every caller uses to embed text — which provider actually runs is
 * decided entirely by EMBEDDING_PROVIDER (default "local"/Ollama). Same opt-in-exception
 * pattern as CHAT_PROVIDER (chat-completion.ts), documented separately in PLANNING.md
 * "Mode Embedding Eksternal" because, unlike CHAT_PROVIDER, this one does send document
 * chunk/query TEXT to a cloud API for the embedding step itself.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  if (env.EMBEDDING_PROVIDER !== "local" && !warnedExternalEmbeddingProvider) {
    warnedExternalEmbeddingProvider = true;
    console.warn(
      `[embedding] PERINGATAN: EMBEDDING_PROVIDER="${env.EMBEDDING_PROVIDER}" aktif — teks chunk ` +
        "dokumen dan pertanyaan pengguna akan dikirim ke API pihak ketiga ini untuk di-embed. Mode " +
        "demo/dev saja — jangan gunakan dengan dokumen perusahaan sungguhan (lihat PLANNING.md " +
        "'Mode Embedding Eksternal').",
    );
  }

  try {
    switch (env.EMBEDDING_PROVIDER) {
      case "gemini":
        return await embedTextsGemini(texts);
      case "openai":
        return await embedTextsOpenAi(texts);
      case "local":
      default:
        return await embedTextsOllama(texts);
    }
  } catch (error) {
    if (error instanceof OllamaUnavailableError) {
      throw new EmbeddingProviderUnavailableError(error.message, error);
    }
    throw error;
  }
}
