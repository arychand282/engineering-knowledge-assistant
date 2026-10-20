import { env } from "@/lib/env";

/**
 * Thin client for the local Ollama runtime. Never points at a cloud endpoint — the base
 * URL is dev/self-hosted only (PLANNING.md: no external AI/embedding/OCR services).
 */
export class OllamaUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Model embedding lokal (Ollama) tidak dapat dihubungi.");
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

async function postJson(path: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OLLAMA_REQUEST_TIMEOUT_MS);

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

  const response = await postJson("/api/embed", { model: env.EMBEDDING_MODEL, input: texts });
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

export interface OllamaHealth {
  reachable: boolean;
  hasEmbeddingModel: boolean;
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
      return { reachable: false, hasEmbeddingModel: false };
    }

    const data = (await response.json()) as { models?: Array<{ model?: string; name?: string }> };
    const hasEmbeddingModel = (data.models ?? []).some(
      (m) => m.model === env.EMBEDDING_MODEL || m.model?.startsWith(`${env.EMBEDDING_MODEL}:`),
    );

    return { reachable: true, hasEmbeddingModel };
  } catch {
    return { reachable: false, hasEmbeddingModel: false };
  } finally {
    clearTimeout(timeout);
  }
}
