import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import {
  EmbeddingDimensionMismatchError,
  OllamaUnavailableError,
  checkOllamaHealth,
  embedTexts,
} from "@/lib/ai/ollama-client";

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("embedTexts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns [] without calling fetch for empty input", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(embedTexts([])).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns embeddings matching the configured dimension", async () => {
    const vector = Array.from({ length: env.EMBEDDING_DIMENSIONS }, () => 0.1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ model: env.EMBEDDING_MODEL, embeddings: [vector] })),
    );

    const result = await embedTexts(["halo"]);
    expect(result).toEqual([vector]);
  });

  it("throws EmbeddingDimensionMismatchError when the model returns an unexpected size", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ embeddings: [[0.1, 0.2]] })));

    await expect(embedTexts(["halo"])).rejects.toBeInstanceOf(EmbeddingDimensionMismatchError);
  });

  it("throws OllamaUnavailableError on a non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })));

    await expect(embedTexts(["halo"])).rejects.toBeInstanceOf(OllamaUnavailableError);
  });

  it("throws OllamaUnavailableError when fetch itself fails (network/timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    await expect(embedTexts(["halo"])).rejects.toBeInstanceOf(OllamaUnavailableError);
  });
});

describe("checkOllamaHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports reachable + hasEmbeddingModel when the model is listed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ models: [{ model: `${env.EMBEDDING_MODEL}:latest` }] })),
    );

    await expect(checkOllamaHealth()).resolves.toEqual({
      reachable: true,
      hasEmbeddingModel: true,
    });
  });

  it("reports reachable but not hasEmbeddingModel when the model is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ models: [{ model: "some-other-model" }] })),
    );

    await expect(checkOllamaHealth()).resolves.toEqual({
      reachable: true,
      hasEmbeddingModel: false,
    });
  });

  it("reports unreachable without throwing when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    await expect(checkOllamaHealth()).resolves.toEqual({
      reachable: false,
      hasEmbeddingModel: false,
    });
  });
});
