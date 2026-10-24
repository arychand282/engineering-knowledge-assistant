import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/ollama-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/ollama-client")>();
  return { ...actual, generateChatCompletion: vi.fn() };
});

import { OllamaUnavailableError, generateChatCompletion } from "@/lib/ai/ollama-client";
import { rerankChunkIds } from "@/lib/ai/rerank";

const mockedGenerateChatCompletion = vi.mocked(generateChatCompletion);

const candidates = [
  { chunkId: "chunk-a", content: "Isi chunk A." },
  { chunkId: "chunk-b", content: "Isi chunk B." },
  { chunkId: "chunk-c", content: "Isi chunk C." },
];

describe("rerankChunkIds", () => {
  it("returns [] without calling the model when there are no candidates", async () => {
    await expect(rerankChunkIds("pertanyaan", [])).resolves.toEqual([]);
    expect(mockedGenerateChatCompletion).not.toHaveBeenCalled();
  });

  it("reorders candidates by descending relevance", async () => {
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        ranking: [
          { chunk_id: "chunk-a", relevance: 2 },
          { chunk_id: "chunk-b", relevance: 9 },
          { chunk_id: "chunk-c", relevance: 5 },
        ],
      }),
    );

    await expect(rerankChunkIds("pertanyaan", candidates)).resolves.toEqual([
      "chunk-b",
      "chunk-c",
      "chunk-a",
    ]);
  });

  it("appends a candidate the model omitted from its ranking, at the end, in original order", async () => {
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        ranking: [
          { chunk_id: "chunk-c", relevance: 8 },
          { chunk_id: "chunk-a", relevance: 3 },
          // chunk-b omitted entirely
        ],
      }),
    );

    await expect(rerankChunkIds("pertanyaan", candidates)).resolves.toEqual([
      "chunk-c",
      "chunk-a",
      "chunk-b",
    ]);
  });

  it("ignores a chunk_id in the response that was never a candidate", async () => {
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        ranking: [
          { chunk_id: "hallucinated-id", relevance: 10 },
          { chunk_id: "chunk-a", relevance: 1 },
          { chunk_id: "chunk-b", relevance: 5 },
          { chunk_id: "chunk-c", relevance: 3 },
        ],
      }),
    );

    await expect(rerankChunkIds("pertanyaan", candidates)).resolves.toEqual([
      "chunk-b",
      "chunk-c",
      "chunk-a",
    ]);
  });

  it("falls back to null on unparseable JSON", async () => {
    mockedGenerateChatCompletion.mockResolvedValue("this is not json");
    await expect(rerankChunkIds("pertanyaan", candidates)).resolves.toBeNull();
  });

  it("falls back to null when the response doesn't match the schema", async () => {
    mockedGenerateChatCompletion.mockResolvedValue(JSON.stringify({ wrong_shape: true }));
    await expect(rerankChunkIds("pertanyaan", candidates)).resolves.toBeNull();
  });

  it("falls back to null when every returned chunk_id is unknown", async () => {
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({ ranking: [{ chunk_id: "nope", relevance: 10 }] }),
    );
    await expect(rerankChunkIds("pertanyaan", candidates)).resolves.toBeNull();
  });

  it("falls back to null when Ollama is unreachable", async () => {
    mockedGenerateChatCompletion.mockRejectedValue(new OllamaUnavailableError());
    await expect(rerankChunkIds("pertanyaan", candidates)).resolves.toBeNull();
  });

  it("rethrows an unexpected error instead of silently swallowing it", async () => {
    mockedGenerateChatCompletion.mockRejectedValue(new Error("something else broke"));
    await expect(rerankChunkIds("pertanyaan", candidates)).rejects.toThrow("something else broke");
  });
});
