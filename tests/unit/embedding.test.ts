import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/ollama-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/ollama-client")>();
  return { ...actual, embedTexts: vi.fn() };
});
vi.mock("@/lib/ai/providers/gemini-client", () => ({ embedTextsGemini: vi.fn() }));
vi.mock("@/lib/ai/providers/openai-client", () => ({ embedTextsOpenAi: vi.fn() }));

import { embedTexts as embedTextsOllama, OllamaUnavailableError } from "@/lib/ai/ollama-client";
import { embedTextsGemini } from "@/lib/ai/providers/gemini-client";
import { embedTextsOpenAi } from "@/lib/ai/providers/openai-client";
import { env } from "@/lib/env";
import { EmbeddingProviderUnavailableError, embedTexts } from "@/lib/ai/embedding";

const texts = ["halo dunia"];

describe("embedTexts dispatcher", () => {
  const originalProvider = env.EMBEDDING_PROVIDER;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    env.EMBEDDING_PROVIDER = originalProvider;
  });

  it("returns [] without calling any provider for empty input", async () => {
    await expect(embedTexts([])).resolves.toEqual([]);
    expect(embedTextsOllama).not.toHaveBeenCalled();
    expect(embedTextsGemini).not.toHaveBeenCalled();
    expect(embedTextsOpenAi).not.toHaveBeenCalled();
  });

  it("routes to Ollama by default (EMBEDDING_PROVIDER=local)", async () => {
    env.EMBEDDING_PROVIDER = "local";
    vi.mocked(embedTextsOllama).mockResolvedValue([[0.1]]);

    await expect(embedTexts(texts)).resolves.toEqual([[0.1]]);
    expect(embedTextsOllama).toHaveBeenCalledWith(texts);
    expect(embedTextsGemini).not.toHaveBeenCalled();
  });

  it("routes to Gemini when EMBEDDING_PROVIDER=gemini, and logs a warning for the external call", async () => {
    env.EMBEDDING_PROVIDER = "gemini";
    vi.mocked(embedTextsGemini).mockResolvedValue([[0.2]]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(embedTexts(texts)).resolves.toEqual([[0.2]]);

    expect(embedTextsGemini).toHaveBeenCalledWith(texts);
    expect(embedTextsOllama).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("PERINGATAN"));
    warnSpy.mockRestore();
  });

  it("routes to OpenAI when EMBEDDING_PROVIDER=openai", async () => {
    env.EMBEDDING_PROVIDER = "openai";
    vi.mocked(embedTextsOpenAi).mockResolvedValue([[0.3]]);

    await expect(embedTexts(texts)).resolves.toEqual([[0.3]]);
    expect(embedTextsOpenAi).toHaveBeenCalledWith(texts);
  });

  it("wraps an OllamaUnavailableError as EmbeddingProviderUnavailableError", async () => {
    env.EMBEDDING_PROVIDER = "local";
    vi.mocked(embedTextsOllama).mockRejectedValue(new OllamaUnavailableError());

    await expect(embedTexts(texts)).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });
});
