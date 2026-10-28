import { llmAnswerJsonSchema } from "@/lib/ai/answer-schema";
import { env } from "@/lib/env";
import { EmbeddingDimensionMismatchError } from "./providers/errors";

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

// Re-exported for existing callers/tests importing it from this module — the class now
// lives in providers/errors.ts since external embedding providers (gemini/openai) throw
// it too (see src/lib/ai/embedding.ts).
export { EmbeddingDimensionMismatchError };

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
      throw new EmbeddingDimensionMismatchError(
        env.EMBEDDING_MODEL,
        env.EMBEDDING_DIMENSIONS,
        vector.length,
      );
    }
  }

  return data.embeddings;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Sends a chat completion request with the structured-output `format` set to the given
 * JSON Schema (PLANNING.md #8: model must return structured JSON) — defaults to our
 * answer schema, the only shape every existing caller needs; the rerank usecase is the
 * one caller that passes its own schema. Returns the raw response text — schema
 * validation with Zod happens in the usecase layer, not here.
 *
 * Uses `stream: true` (NDJSON), not `stream: false` — found via real Task 7 evaluation
 * that a non-streaming request sends ZERO bytes until generation fully finishes, which
 * on CPU-only inference (~12 minutes, see README) exceeds Node undici's internal
 * `headersTimeout` default (5 minutes) and fails with `HeadersTimeoutError` — regardless
 * of `OLLAMA_CHAT_TIMEOUT_MS` being configured much higher. Streaming sends headers and
 * incremental chunks immediately, which keeps undici's timers satisfied the same way
 * the Gemini client already had to switch to `streamGenerateContent` for an analogous
 * reason. We still only need the fully-assembled string, not real token streaming to a
 * frontend.
 */
export async function generateChatCompletion(
  messages: ChatMessage[],
  format: object = llmAnswerJsonSchema,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OLLAMA_CHAT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(new URL("/api/chat", env.OLLAMA_BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: env.CHAT_MODEL,
        messages,
        stream: true,
        format,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw new OllamaUnavailableError(error);
  }

  if (!response.ok) {
    clearTimeout(timeout);
    throw new OllamaUnavailableError(
      new Error(`Ollama /api/chat returned HTTP ${response.status}`),
      "Model chat lokal (Ollama) tidak dapat dihubungi.",
    );
  }

  try {
    const content = await readNdjsonChatStream(response.body);
    if (!content) {
      throw new OllamaUnavailableError(
        new Error("Ollama /api/chat returned no message content"),
        "Model chat lokal (Ollama) tidak dapat dihubungi.",
      );
    }
    return content;
  } catch (error) {
    if (error instanceof OllamaUnavailableError) {
      throw error;
    }
    throw new OllamaUnavailableError(error, "Model chat lokal (Ollama) tidak dapat dihubungi.");
  } finally {
    clearTimeout(timeout);
  }
}

/** Ollama's streaming /api/chat sends newline-delimited JSON objects, each with a `message.content` fragment, until a final `{"done":true}` line. */
async function readNdjsonChatStream(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let combined = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      combined += parseNdjsonChatLine(line);
    }
  }
  if (buffer.trim()) {
    combined += parseNdjsonChatLine(buffer);
  }

  return combined;
}

function parseNdjsonChatLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const chunk = JSON.parse(trimmed) as { message?: { content?: string } };
    return chunk.message?.content ?? "";
  } catch {
    return "";
  }
}

export interface OllamaHealth {
  reachable: boolean;
  /** Only meaningful when EMBEDDING_PROVIDER=local — external providers don't use Ollama for embedding. */
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
