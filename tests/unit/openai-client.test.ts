import { afterEach, describe, expect, it, vi } from "vitest";
import { embedTextsOpenAi, generateOpenAiChatCompletion } from "@/lib/ai/providers/openai-client";
import {
  ChatProviderUnavailableError,
  EmbeddingDimensionMismatchError,
  EmbeddingProviderUnavailableError,
} from "@/lib/ai/providers/errors";
import { env } from "@/lib/env";

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), { status: init.status ?? 200 });
}

describe("generateOpenAiChatCompletion", () => {
  const originalKey = env.OPENAI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    env.OPENAI_API_KEY = originalKey;
  });

  it("throws if OPENAI_API_KEY is missing", async () => {
    env.OPENAI_API_KEY = undefined;

    await expect(
      generateOpenAiChatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toBeInstanceOf(ChatProviderUnavailableError);
  });

  it("sends messages as-is with json_object response format and returns the content", async () => {
    env.OPENAI_API_KEY = "test-key";
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: '{"status":"answered"}' } }] }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const messages = [
      { role: "system" as const, content: "system prompt" },
      { role: "user" as const, content: "question" },
    ];
    const result = await generateOpenAiChatCompletion(messages);

    expect(result).toBe('{"status":"answered"}');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body.messages).toEqual(messages);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("throws ChatProviderUnavailableError on a non-OK response", async () => {
    env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 })));

    await expect(
      generateOpenAiChatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toBeInstanceOf(ChatProviderUnavailableError);
  });
});

describe("embedTextsOpenAi", () => {
  const originalKey = env.OPENAI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    env.OPENAI_API_KEY = originalKey;
  });

  it("throws EmbeddingProviderUnavailableError if OPENAI_API_KEY is missing", async () => {
    env.OPENAI_API_KEY = undefined;

    await expect(embedTextsOpenAi(["halo"])).rejects.toBeInstanceOf(
      EmbeddingProviderUnavailableError,
    );
  });

  it("requests /v1/embeddings with the configured dimensions and returns vectors in order", async () => {
    env.OPENAI_API_KEY = "test-key";
    const vectorA = Array.from({ length: env.EMBEDDING_DIMENSIONS }, () => 0.1);
    const vectorB = Array.from({ length: env.EMBEDDING_DIMENSIONS }, () => 0.2);
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { index: 1, embedding: vectorB },
          { index: 0, embedding: vectorA },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await embedTextsOpenAi(["satu", "dua"]);

    expect(result).toEqual([vectorA, vectorB]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(init.headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body.input).toEqual(["satu", "dua"]);
    expect(body.dimensions).toBe(env.EMBEDDING_DIMENSIONS);
  });

  it("throws EmbeddingDimensionMismatchError when the returned vector size is wrong", async () => {
    env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: [{ index: 0, embedding: [0.1, 0.2] }] })),
    );

    await expect(embedTextsOpenAi(["halo"])).rejects.toBeInstanceOf(
      EmbeddingDimensionMismatchError,
    );
  });

  it("throws EmbeddingProviderUnavailableError on a non-OK response", async () => {
    env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 })));

    await expect(embedTextsOpenAi(["halo"])).rejects.toBeInstanceOf(
      EmbeddingProviderUnavailableError,
    );
  });
});
