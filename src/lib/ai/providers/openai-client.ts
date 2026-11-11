import type { ChatMessage } from "@/lib/ai/ollama-client";
import { env } from "@/lib/env";
import {
  ChatProviderUnavailableError,
  EmbeddingDimensionMismatchError,
  EmbeddingProviderUnavailableError,
} from "./errors";

/**
 * OpenAI Chat Completions. OPT-IN external provider — see PLANNING.md "External Chat
 * Mode". Only used when CHAT_PROVIDER=openai; never called otherwise.
 */
export async function generateOpenAiChatCompletion(messages: ChatMessage[]): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new ChatProviderUnavailableError("OPENAI_API_KEY is not set.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTERNAL_CHAT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages,
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    throw new ChatProviderUnavailableError("Could not reach the OpenAI API.", error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ChatProviderUnavailableError(`OpenAI API returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new ChatProviderUnavailableError("OpenAI API did not return any answer content.");
  }

  return text;
}

interface OpenAiEmbedResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

/**
 * OpenAI embeddings. OPT-IN external provider — see PLANNING.md "External Embedding
 * Mode". Only used when EMBEDDING_PROVIDER=openai; never called otherwise.
 *
 * `dimensions` asks OpenAI to shorten the native vector to EMBEDDING_DIMENSIONS (only
 * supported by text-embedding-3-* models) so every provider agrees on one fixed size
 * for the shared pgvector column — the dimension check below still runs regardless.
 */
export async function embedTextsOpenAi(texts: string[]): Promise<number[][]> {
  if (!env.OPENAI_API_KEY) {
    throw new EmbeddingProviderUnavailableError("OPENAI_API_KEY is not set.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTERNAL_EMBEDDING_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: texts,
        dimensions: env.EMBEDDING_DIMENSIONS,
      }),
    });
  } catch (error) {
    throw new EmbeddingProviderUnavailableError("Could not reach the OpenAI API.", error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new EmbeddingProviderUnavailableError(
      `OpenAI API returned HTTP ${response.status}.`,
    );
  }

  const data = (await response.json()) as OpenAiEmbedResponse;
  const entries = data.data ?? [];
  if (entries.length !== texts.length) {
    throw new EmbeddingProviderUnavailableError("OpenAI API did not return all embeddings.");
  }

  const vectors = entries
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((entry) => entry.embedding ?? []);

  for (const vector of vectors) {
    if (vector.length !== env.EMBEDDING_DIMENSIONS) {
      throw new EmbeddingDimensionMismatchError(
        env.OPENAI_EMBEDDING_MODEL,
        env.EMBEDDING_DIMENSIONS,
        vector.length,
      );
    }
  }

  return vectors;
}
