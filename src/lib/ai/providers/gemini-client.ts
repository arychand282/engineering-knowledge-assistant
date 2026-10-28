import { llmAnswerGeminiSchema } from "@/lib/ai/answer-schema";
import type { ChatMessage } from "@/lib/ai/ollama-client";
import { env } from "@/lib/env";
import {
  ChatProviderUnavailableError,
  EmbeddingDimensionMismatchError,
  EmbeddingProviderUnavailableError,
} from "./errors";

/**
 * Google Gemini. OPT-IN external provider — see PLANNING.md "Mode Chat Eksternal". Only
 * used when CHAT_PROVIDER=gemini; never called otherwise.
 *
 * Uses `streamGenerateContent` (SSE), not the plain `generateContent` endpoint — the
 * latter was found, via real testing, to hang indefinitely (no response, no error) on
 * at least one network path, while the streaming endpoint responds normally. We don't
 * need real token-by-token streaming (the usecase layer wants one complete string), so
 * this just buffers the whole SSE body and concatenates the text parts back together.
 */
export async function generateGeminiChatCompletion(messages: ChatMessage[]): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw new ChatProviderUnavailableError("GEMINI_API_KEY tidak diisi.");
  }

  const systemMessage = messages.find((m) => m.role === "system");
  const conversation = messages.filter((m) => m.role !== "system");

  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:streamGenerateContent`,
  );
  url.searchParams.set("key", env.GEMINI_API_KEY);
  url.searchParams.set("alt", "sse");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTERNAL_CHAT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        ...(systemMessage
          ? { systemInstruction: { parts: [{ text: systemMessage.content }] } }
          : {}),
        contents: conversation.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: llmAnswerGeminiSchema,
        },
      }),
    });
  } catch (error) {
    throw new ChatProviderUnavailableError("Gemini API tidak dapat dihubungi.", error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ChatProviderUnavailableError(`Gemini API mengembalikan HTTP ${response.status}.`);
  }

  const body = await response.text();
  const text = extractTextFromSse(body);
  if (!text) {
    throw new ChatProviderUnavailableError("Gemini API tidak mengembalikan konten jawaban.");
  }

  return text;
}

interface GeminiStreamChunk {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

function extractTextFromSse(sseBody: string): string {
  let combined = "";

  for (const line of sseBody.split("\n")) {
    if (!line.startsWith("data: ")) {
      continue;
    }
    const payload = line.slice("data: ".length).trim();
    if (!payload) {
      continue;
    }

    try {
      const chunk = JSON.parse(payload) as GeminiStreamChunk;
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        combined += part.text ?? "";
      }
    } catch {
      // Malformed/partial SSE line — skip rather than fail the whole response.
    }
  }

  return combined;
}

interface GeminiEmbedResponse {
  embeddings?: Array<{ values?: number[] }>;
}

/**
 * Google Gemini embeddings. OPT-IN external provider — see PLANNING.md "Mode Embedding
 * Eksternal". Only used when EMBEDDING_PROVIDER=gemini; never called otherwise.
 *
 * `outputDimensionality` asks Gemini to truncate its native vector to EMBEDDING_DIMENSIONS
 * so every provider agrees on one fixed size for the shared pgvector column — the
 * dimension check below still runs in case a future model/version ignores it.
 */
export async function embedTextsGemini(texts: string[]): Promise<number[][]> {
  if (!env.GEMINI_API_KEY) {
    throw new EmbeddingProviderUnavailableError("GEMINI_API_KEY tidak diisi.");
  }

  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_EMBEDDING_MODEL}:batchEmbedContents`,
  );
  url.searchParams.set("key", env.GEMINI_API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTERNAL_EMBEDDING_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${env.GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: env.EMBEDDING_DIMENSIONS,
        })),
      }),
    });
  } catch (error) {
    throw new EmbeddingProviderUnavailableError("Gemini API tidak dapat dihubungi.", error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new EmbeddingProviderUnavailableError(
      `Gemini API mengembalikan HTTP ${response.status}.`,
    );
  }

  const data = (await response.json()) as GeminiEmbedResponse;
  const vectors = data.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
  if (vectors.length !== texts.length) {
    throw new EmbeddingProviderUnavailableError("Gemini API tidak mengembalikan semua embedding.");
  }

  for (const vector of vectors) {
    if (vector.length !== env.EMBEDDING_DIMENSIONS) {
      throw new EmbeddingDimensionMismatchError(
        env.GEMINI_EMBEDDING_MODEL,
        env.EMBEDDING_DIMENSIONS,
        vector.length,
      );
    }
  }

  return vectors;
}
