import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAnthropicChatCompletion } from "@/lib/ai/providers/anthropic-client";
import { ChatProviderUnavailableError } from "@/lib/ai/providers/errors";
import { env } from "@/lib/env";

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), { status: init.status ?? 200 });
}

describe("generateAnthropicChatCompletion", () => {
  const originalKey = env.ANTHROPIC_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    env.ANTHROPIC_API_KEY = originalKey;
  });

  it("throws if ANTHROPIC_API_KEY is missing", async () => {
    env.ANTHROPIC_API_KEY = undefined;

    await expect(
      generateAnthropicChatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toBeInstanceOf(ChatProviderUnavailableError);
  });

  it("appends an assistant '{' prefill and re-prepends it to the returned text", async () => {
    env.ANTHROPIC_API_KEY = "test-key";
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ content: [{ type: "text", text: '"status":"answered"}' }] }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await generateAnthropicChatCompletion([
      { role: "system", content: "system prompt" },
      { role: "user", content: "question" },
    ]);

    expect(result).toBe('{"status":"answered"}');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body.system).toBe("system prompt");
    expect(body.messages).toEqual([
      { role: "user", content: "question" },
      { role: "assistant", content: "{" },
    ]);
  });

  it("throws ChatProviderUnavailableError on a non-OK response", async () => {
    env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 429 })));

    await expect(
      generateAnthropicChatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toBeInstanceOf(ChatProviderUnavailableError);
  });
});
