import { llmAnswerJsonSchema } from "@/lib/ai/answer-schema";
import { env } from "@/lib/env";

/**
 * Thin client for the local Ollama runtime. Never points at a cloud endpoint — the base
 * URL is dev/self-hosted only (PLANNING.md: no external AI/embedding/OCR services).
 */
export class OllamaUnavailableError extends Error {
  constructor(cause?: unknown, message = "Model lokal (Ollama) tidak dapat dihubungi.") {
    super(message);
    this.name = "OllamaUnavailableError";
    this.cause = cause;
  }
}

export class EmbeddingDimensionMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(
      `Model embedding "${env.EMBEDDING_MODEL}" mengembalikan vektor berdimensi ${actual}, ` +
        `tetapi EMBEDDING_DIMENSIONS dikonfigurasi ${expected}.`,
    );
    this.name = "EmbeddingDimensionMismatchError";
  }
}

async function postJson(path: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(new URL(path, env.OLLAMA_BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new OllamaUnavailableError(error);
  } finally {
    clearTimeout(timeout);
  }
}

interface OllamaEmbedResponse {
  embeddings: number[][];
}

/** Embeds one or more texts with the configured local model. Never sends to a cloud API. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const response = await postJson(
    "/api/embed",
    { model: env.EMBEDDING_MODEL, input: texts },
    env.OLLAMA_REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new OllamaUnavailableError(
      new Error(`Ollama /api/embed returned HTTP ${response.status}`),
    );
  }

  const data = (await response.json()) as OllamaEmbedResponse;
  for (const vector of data.embeddings) {
    if (vector.length !== env.EMBEDDING_DIMENSIONS) {
      throw new EmbeddingDimensionMismatchError(env.EMBEDDING_DIMENSIONS, vector.length);
    }
  }

  return data.embeddings;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Sends a chat completion request with the structured-output `format` set to our answer
 * JSON Schema (PLANNING.md #8: model must return structured JSON). Returns the raw
 * response text — schema validation with Zod happens in the usecase layer, not here.
 */
export async function generateChatCompletion(messages: ChatMessage[]): Promise<string> {
  const response = await postJson(
    "/api/chat",
    { model: env.CHAT_MODEL, messages, stream: false, format: llmAnswerJsonSchema },
    env.OLLAMA_CHAT_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new OllamaUnavailableError(
      new Error(`Ollama /api/chat returned HTTP ${response.status}`),
      "Model chat lokal (Ollama) tidak dapat dihubungi.",
    );
  }

  const data = (await response.json()) as { message?: { content?: string } };
  if (!data.message?.content) {
    throw new OllamaUnavailableError(
      new Error("Ollama /api/chat returned no message content"),
      "Model chat lokal (Ollama) tidak dapat dihubungi.",
    );
  }

  return data.message.content;
}

export interface OllamaHealth {
  reachable: boolean;
  hasEmbeddingModel: boolean;
  /** Only meaningful when CHAT_PROVIDER=local — external providers don't use Ollama for chat. */
  hasChatModel: boolean;
}

function hasModel(models: Array<{ model?: string }>, name: string): boolean {
  return models.some((m) => m.model === name || m.model?.startsWith(`${name}:`));
}

/** Used by GET /api/v1/health/ai — never throws, always returns a safe status object. */
export async function checkOllamaHealth(): Promise<OllamaHealth> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OLLAMA_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(new URL("/api/tags", env.OLLAMA_BASE_URL), {
      signal: controller.signal,
    });
    if (!response.ok) {
      return { reachable: false, hasEmbeddingModel: false, hasChatModel: false };
    }

    const data = (await response.json()) as { models?: Array<{ model?: string; name?: string }> };
    const models = data.models ?? [];

    return {
      reachable: true,
      hasEmbeddingModel: hasModel(models, env.EMBEDDING_MODEL),
      hasChatModel: hasModel(models, env.CHAT_MODEL),
    };
  } catch {
    return { reachable: false, hasEmbeddingModel: false, hasChatModel: false };
  } finally {
    clearTimeout(timeout);
  }
}
