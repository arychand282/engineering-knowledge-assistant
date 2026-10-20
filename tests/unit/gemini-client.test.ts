import { afterEach, describe, expect, it, vi } from "vitest";
import { generateGeminiChatCompletion } from "@/lib/ai/providers/gemini-client";
import { ChatProviderUnavailableError } from "@/lib/ai/providers/errors";
import { env } from "@/lib/env";

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), { status: init.status ?? 200 });
}

/** Gemini's streamGenerateContent (alt=sse) splits the response across several
 * `data: {...}` lines whose text parts must be concatenated back together. */
function sseResponse(textChunks: string[]) {
  const body = textChunks
    .map((text) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}`)
    .join("\n\n");
  return new Response(body, { status: 200 });
}

describe("generateGeminiChatCompletion", () => {
  const originalKey = env.GEMINI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    env.GEMINI_API_KEY = originalKey;
  });

  it("throws if GEMINI_API_KEY is missing", async () => {
    env.GEMINI_API_KEY = undefined;

    await expect(
      generateGeminiChatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toBeInstanceOf(ChatProviderUnavailableError);
  });

  it("sends the system message separately, uses the streaming endpoint, and concatenates SSE chunks", async () => {
    env.GEMINI_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue(sseResponse(['{"', 'status":"answered"}']));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await generateGeminiChatCompletion([
      { role: "system", content: "system prompt" },
      { role: "user", content: "question" },
    ]);

    expect(result).toBe('{"status":"answered"}');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("key=test-key");
    expect(String(url)).toContain(":streamGenerateContent");
    expect(String(url)).toContain("alt=sse");
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe("system prompt");
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "question" }] }]);
  });

  it("throws ChatProviderUnavailableError on a non-OK response", async () => {
    env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })));

    await expect(
      generateGeminiChatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toBeInstanceOf(ChatProviderUnavailableError);
  });

  it("throws ChatProviderUnavailableError when fetch fails", async () => {
    env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(
      generateGeminiChatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toBeInstanceOf(ChatProviderUnavailableError);
  });
});
